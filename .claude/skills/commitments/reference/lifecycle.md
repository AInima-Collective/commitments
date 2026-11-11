# Lifecycle — funding, release, forfeit, unbond, contributions, distribution

Everything on `CommitmentManager` beyond `createCommitment`. Signatures verbatim
from `src/core/interfaces/ICommitmentManager.sol`. Economically sensitive
ledger, lifecycle, agreement, and mutual flows use reentrancy guards; simple
administrative setters, pause controls, initialization, and nonce invalidation
are not universally marked `nonReentrant`. "Anyone" = permissionless;
"arbiter/committer only" = gated on the commitment's stored role.

---

## Funding the ledger

```solidity
function deposit(address token, uint256 amount) external;   // wallet → your free balance
function withdraw(address token, uint256 amount) external;  // your free balance → wallet (instant, never unbonded)
function fundStrategy(address strategy, address token, uint256 amount) external; // wallet → a strategy's escrow
```

- `deposit` credits the **measured balance delta**, not the requested `amount`
  (fee-on-transfer defense). Approve the manager first. Rebasing tokens unsupported.
- `withdraw` only touches **free** balance; encumbered funds need release/forfeit/
  unbond first. `amount > free` → `InsufficientFreeBalance(requested, available)`.
- `fundStrategy` is how you pre-fund a strategy that pays out of escrow. It pulls
  from your **wallet** via `transferFrom` (approve the manager first), **not** from
  your manager free balance — so don't `deposit` your whole wallet before funding.
  **Warning:** escrow is a single per-`(strategy, token)` pot with NO funder
  attribution and no refund surface — only fund strategies that explicitly expect
  it. `FlatFeeAtCreate` does **not**: use its own `prefund(committer, token, fee)`
  instead. See `strategies.md`.

Reads: `freeBalance(token,user)`, `encumberedBalance(token,user)`,
`escrowOf(token,strategy)`, `ledgerTotals(token) → (free, encumbered, escrow, mutualPremium)`.
(All manager views are token-first.)

---

## Closing a commitment — four ways out

| Call | Who | When | Effect |
|---|---|---|---|
| `releaseCommitment(id)` | arbiter | any time | frees committer immediately |
| `expireCommitment(id)` | committer | after `expiresAt` (non-zero) | committer self-releases |
| `finalizeUnbond(id)` | anyone | after unbond matures | committer-initiated exit |
| `executeForfeit(id)` | anyone | after challenge window | arbiter took the stake |

All four run the bound strategies' **guarded** close hooks first (a failing hook
is *parked*, not fatal — emits `StrategyHookFailed`, recover later via
`sweepFailedHook`), then move encumbered → free / counterparty.

```solidity
function releaseCommitment(uint256 commitmentId) external;  // arbiter only; reverts UseAgreementPath if agreed
function expireCommitment(uint256 commitmentId) external;   // committer only; needs expiresAt set & elapsed, no pending forfeit
```

`releaseCommitment` reverts: `NotArbiter`, `CommitmentInactive`, `UseAgreementPath`
(commitment belongs to an agreement — use `releaseAgreement`).
`expireCommitment` reverts: `NotCommitter`, `CommitmentHasNoExpiry`,
`CommitmentNotExpired`, `ForfeitPending`.

---

## Two-phase forfeiture

Forfeiture is **never instant or silent**. The arbiter proposes; a challenge
window elapses; then anyone executes.

```solidity
function initiateForfeit(uint256 commitmentId, uint16 penaltyBps) external; // arbiter only; penaltyBps ≤ maxPenaltyBps
function executeForfeit(uint256 commitmentId) external;                     // ANYONE, after window; pull-payment to counterparty
function cancelForfeit(uint256 commitmentId) external;                      // arbiter only; abort a pending proposal
function cancelStaleForfeitProposal(uint256 commitmentId) external;         // ANYONE, after window + FORFEIT_PROPOSAL_TTL (14d)
```

1. **`initiateForfeit`** — arbiter only, `penaltyBps` in 0–10000 and
   `≤ commitment.maxPenaltyBps`. Starts the timer. At most **one** active
   proposal per commitment (INV-7). Reverts: `NotArbiter`, `PenaltyExceedsMax`,
   `ForfeitPending`, `UseAgreementPath`, `CommitmentInactive`.
2. **`executeForfeit`** — anyone, only after `block.timestamp ≥ initiatedAt +
   challengeWindow`. Transfers `amount × penaltyBps / 10000` to the
   **counterparty's free balance** (pull-payment — they `withdraw` later); the
   residual returns to the committer. Reverts: `NoActiveForfeitProposal`,
   `ChallengeWindowActive`, `ForfeitureIsPaused`, `CommitmentInactive`.
   Emits `ForfeitExecuted(id, unitsForfeited, counterparty)`.
3. **`cancelForfeit`** — arbiter aborts before execution.
4. **`cancelStaleForfeitProposal`** — anyone clears an abandoned proposal after
   the 14-day TTL **on top of** the challenge window, so the committer can unbond
   again. Reverts `ChallengeWindowActive` if not yet stale.

Read state with `getForfeitProposal(id) → {penaltyBps, initiatedAt, executed,
cancelled, cumulativePausedAtStart}`. An admin with `PAUSER_ROLE` can
`pauseForfeiture()` (execution circuit-breaker); check the first value of
`pauseState()`.

---

## Unbonding — committer-initiated exit

For commitments with no expiry, the committer leaves via a timed unbond. The
arbiter **keeps forfeit authority during the window**, so this is not an escape
hatch from a pending forfeit.

```solidity
function requestUnbond(uint256 commitmentId) external;   // committer only; starts unbondingPeriod() timer
function finalizeUnbond(uint256 commitmentId) external;  // ANYONE, after maturity; blocked while a forfeit proposal is active
function cancelUnbond(uint256 commitmentId) external;    // committer only; back to active
function unbondingPeriod() external view returns (uint64);
function unbondInitiatedAt(uint256 commitmentId) external view returns (uint64); // 0 = none
```

`requestUnbond` reverts `UnbondAlreadyRequested`. `finalizeUnbond` reverts
`UnbondNotElapsed(maturesAt)` before maturity and `UnbondBlockedByForfeit` if a
proposal is live — cancel/execute the forfeit (or wait out the stale TTL) first.
On an agreement leg, `requestUnbond` and `cancelUnbond` act on both legs (see
`agreements.md`).

---

## Contributions — third parties grow a stake

Anyone can add encumbered backing to an existing commitment, once the committer
opts in.

```solidity
function contributeEncumbered(uint256 commitmentId, uint256 units) external;
```

- The **committer makes the first contribution** (it flips `acceptsContributions`
  on and emits `ContributionsEnabled`); afterwards **anyone** may contribute.
- Debits the caller's free balance, credits the **committer's** encumbered balance,
  grows `commitment.amount`, and ratchets `totalForfeitable` by the exposure diff.
- Reverts: `ContributionsDisabled` (non-committer before opt-in), `ZeroAmount`,
  `ForfeitPending`, `UnbondPending`, `CommitmentInactive`, `CommitmentInMutual`,
  `InsufficientFreeBalance`.

---

## Driving distribution strategies

Bound strategies accrue value (yield share, fees). These triggers are
permissionless — the caller chose the strategy, so reverts bubble up as feedback.

```solidity
function distribute(uint256 commitmentId, address strategy) external;          // advance one strategy's accrual
function distributeAll(uint256 commitmentId) external;                         // fold over all bound strategies
function claim(uint256 commitmentId, address strategy, bytes calldata data) external; // strategy-mediated claim (works post-close)
function pending(uint256 commitmentId, address strategy, bytes calldata data) external view returns (uint256);
function sweepFailedHook(uint256 commitmentId, address strategy) external;     // re-drive a parked guarded hook
function strategiesOf(uint256 commitmentId) external view returns (address[] memory);
function failedHook(uint256 commitmentId, address strategy) external view returns (bytes4); // 0 = none parked
```

`distribute`/`distributeAll` revert `ForfeitPending` while a proposal is live;
`claim` is available in **every** state (including after close) so parked accrual
is always recoverable. See `strategies.md` for what each strategy moves.

---

## Reads & admin

Reads: `getCommitment(id) → Commitment`, `getUserExposure(token,user) →
{totalEncumbered, totalForfeitable}` (token-first arg order), `agreementOf(id)` (0 = not agreed),
`nonces(committer)` (for `createCommitmentFor`), `MIN_CHALLENGE_WINDOW()`,
`hookGasCap()`, `operatorRegistry()`. The manager keeps no per-user list of
commitments: list a user's commitments from the indexer (`/account/:address`) or
from `CommitmentCreated` logs.

The `Commitment` struct: `{committer, maxPenaltyBps, released, forfeited, closedAt,
arbiter, challengeWindow, counterparty, createdAt, token, expiresAt, adapter,
unbondInitiatedAt, amount, metadataHash, cumulativePausedAtStart,
unbondCumulativePausedAtStart}`. The `metadataURI` is not stored; it is emitted
in `CommitmentCreated`. After a forfeit, `amount` reflects the post-forfeit
residual; the pre-forfeit amount lives in the event stream.

Admin (`DEFAULT_ADMIN_ROLE`, mostly irrelevant to agents):
`setUnbondingPeriod`, `setMinChallengeWindow` (reverts
`MinChallengeWindowBelowFloor` under 1 day), `setHookGasCap` (reverts `ZeroAmount`
under the 500k floor), `setOperatorRegistry`.

Constants: `MAX_STRATEGIES = 8`, `MAX_PROPOSAL_DURATION = 30 days`,
`FORFEIT_PROPOSAL_TTL = 14 days`, `MAX_METADATA_URI_LENGTH = 512`,
`DEFAULT_MIN_CHALLENGE_WINDOW = 86400`.
