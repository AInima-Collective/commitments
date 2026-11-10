# ERC MUST-clause mapping

> This is the clause-by-clause extraction the last section of
> `verification/PROPERTIES.md` promises. It is produced mechanically from the
> seven ERC spec files (4,681 lines) and is reviewed line-by-line before rows
> are merged into `PROPERTIES.md`. **Do not treat any `NEW-*` ID as adopted**
> until it is promoted into `PROPERTIES.md`.

## Scope and method

- **Source files** (7): the six current standards under `docs/standards/`
  (`ERC-COMMITMENTS.md`, `-AGREEMENTS.md`, `-MUTUALS.md`, `-REWARDS.md`,
  `-SERVICES.md`, `-MESH.md`) plus the generated selector appendix at
  `docs/standards/generated/selectors.md`.
- **Extraction rule**: every RFC-2119 **capitalized** `MUST` / `MUST NOT` /
  `SHALL` / `SHALL NOT` clause. Lowercase "must", and `SHOULD` / `MAY` /
  `RECOMMENDED` / `OPTIONAL`, are **not** normative and are excluded. RFC-2119
  boilerplate (the "key words … are to be interpreted" sentence, §Spec-intro)
  is excluded as non-substantive.
- **Property ID column**: an existing ID from `PROPERTIES.md`
  (`INV-1..INV-10`, `INV-P1`, `INV-P9`, `INV-G2/G3/G6`, `INV-E1`,
  `P0-FREE`, `P1-WINDOW`, `P1-PULL`, `P1-LIVE`, `P1-FSM`, `INV-7`, `P2-MONO`,
  `P3-PPS`, `P3-ROUND`, `P3-PARK`) when the clause **is** that property;
  otherwise a `NEW-<letter><n>` placeholder (letters: core = none/`C`,
  Agreements = `A`, Mutuals = `M`, Rewards = `R`, Services = `S`, Mesh = `X`)
  with a one-line proposed statement.
- **Layer column** (layer-selection logic):
  - **gas-dependent** (500k hook cap, park-don't-forfeit, min-gas guard) →
    **Medusa/Fuzz only** — never claim proof coverage (gas is abstracted by
    the provers; see the assumptions in `PROPERTIES.md`).
  - **per-function input property** (revert-on-bad-input, single-tx bounded
    math) → **Halmos**.
  - **stateful/inductive / cross-call accounting** (partition sums, exposure,
    caps-over-time, state-machine) → **CVL** (Certora).
  - **nonlinear math** (share price, premium/loss indexes) → Halmos with
    bounded inputs where CVL is expected to time out (noted inline).
  - **off-chain / event-shape / topic0 / typehash / naming / deployment
    policy** → **n/a** (documented gap, not an on-chain state property).
- **Status column**: `mapped` (existing ID) · `unmapped-new` (a `NEW-*` here) ·
  `gap: <reason>`.

---

## File 1 — `docs/standards/ERC-COMMITMENTS.md` (core, Parts A–D)

Line refs in the "§" column point at the spec section; the parenthetical
`Lnnn` is the source line in the current file for cross-checking.

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §0.1 units (L49) | "Implementations MUST NOT use any other percentage scale" than bps / denominator `10_000` | NEW-C1 — all ratio/weight fields are bps with denominator 10_000 | Halmos (per-computation bound); mostly convention | gap: naming/units convention — not a runtime state property, enforced by field-type discipline, not a checkable invariant |
| §0.1 view order (implicit, L53) | Every per-token ledger view takes `token` as its **first** argument (token-first order is normative) | NEW-C2 — selector/argument order token-first | n/a | gap: selector-identity/ABI-shape (pinned in SELECTORS appendix), not a state property |
| §0.3 (L74) | `MIN_CHALLENGE_WINDOW == 86_400` (MUST-level constant) | P1-WINDOW | CVL + Halmos | mapped |
| §0.3 (L75) | `MAX_STRATEGIES == 8` per commitment (MUST-level constant) | INV-9 | CVL; Halmos | mapped |
| §0.3 floor (L95) | The enforced minimum challenge window on production deployments "MUST NOT be configurable below `86_400`" | P1-WINDOW | CVL (enforced-floor rule) + Fuzz | mapped — **suspicious**: reference `setMinChallengeWindow` has *no on-chain floor check* (spec flags it as a MUST-deviation for testnet-only) |
| §0.3 floor (L95) | Deployments with such a setter "MUST restrict it to non-production environments" | NEW-C3 — production build gates `setMinChallengeWindow` below floor | n/a | gap: deployment-side policy (build-flag), not an on-chain invariant |
| §0.6 stageX (L139–140) | `stageX` MUST set `pendingX = {newValue, now+activationDelay}` (delay ≥ `MIN_ACTIVATION_DELAY`) and MUST NOT mutate the live value | NEW-C4 — staged param change writes pending only, never live, with delay ≥ floor | CVL (staging state machine) | unmapped-new (RECOMMENDED pattern; MUST-clauses apply *if* pattern is adopted) |
| §0.6 activateX (L143) | `activateX` MUST revert if `pendingX.effectiveAt` is 0 or in the future | NEW-C5 — activate only after effectiveAt elapsed & pending set | Halmos (per-call time guard) | unmapped-new |
| §0.6 cancelStagedX (L148,151) | `cancelStagedX` MUST be callable by the current staging-role holder; MUST require `effectiveAt` non-zero and not yet activated | NEW-C6 — cancel gated to staging role + pending-active | Halmos | unmapped-new |
| §0.6 pendingX (L155) | `pendingX()` MUST return `(0,0)` when no change is pending | NEW-C7 — pending view returns zero sentinel when idle | Halmos | unmapped-new |
| §0.6 emergency (L162) | An emergency path MUST be a separate explicitly-named function with its own role guard | NEW-C8 — emergency path is not a reusable param-change vector | n/a | gap: interface-shape/role-design guidance, not a checkable state property |
| §0.4 conformance (L111) | "A conformant implementation MUST implement Parts A through D" | NEW-C9 — Parts A–D surface present | n/a | gap: conformance-surface statement (interface presence), not a runtime invariant |
| §0.4 extension gating (L113) | An extension that gates a core entry point MUST document it normatively, MUST preserve an equivalent committer-liveness exit path, and MUST use a distinguished error | P1-LIVE (liveness-preservation clause) + NEW-C10 (distinguished-error routing) | CVL (liveness) for the exit-path clause; n/a for doc/error-shape | partially mapped (liveness → P1-LIVE); error-shape/doc → gap |
| §0.4 ERC-165 (L115) | "integrators MUST NOT assume ERC-165 support on those surfaces" | NEW-C11 — no ERC-165 assumption off manager/adapter/strategy/mesh | n/a | gap: integrator-side assumption, not an implementation obligation |
| §0.5 L2 (L123) | An implementation targeting a non-Cancun chain MUST select a reentrancy guard appropriate to that chain | NEW-C12 — non-reentrancy property holds regardless of guard mechanism | CVL (reentrancy property) | unmapped-new (non-reentrancy is the property; see §A.7 row) |
| §A.1 (L191) | For every accepted backing token the manager MUST maintain a per-`(token,user)` `{free,encumbered}` ledger entry | INV-1 / INV-P1 | CVL; Fuzz | mapped (ledger-existence is the substrate of the partition invariant) |
| §A.1 (L221) | `balanceOf(manager)` MUST equal the sum of all ledger + escrow entries per token at all times (partition invariant) | INV-1 / INV-P1 | CVL ghost sums; Fuzz; Medusa | mapped |
| §A.2 deposit (L225) | `deposit` MUST pull via `safeTransferFrom` and credit `freeBalance` by the **measured balance delta**, not `amount` | NEW-C13 — deposit credits measured delta (partition-safe under FoT) | CVL (partition preservation) + Fuzz | unmapped-new — **suspicious**: measured-delta is what keeps INV-1 under fee-on-transfer; worth a targeted rule |
| §A.2 withdraw (L227) | `withdraw` MUST debit `freeBalance` and `safeTransfer` to caller | P0-FREE | CVL rule | mapped |
| §A.2 withdraw (L227) | Free-balance withdrawal "MUST NOT be subject to any unbonding delay" | P0-FREE | CVL rule | mapped — **suspicious**: this is the "no path locks free funds" property; core to P0-FREE |
| §A.2 token policy (L229) | "Rebasing tokens MUST NOT be accepted as backing" | NEW-C14 — rebasing tokens rejected/out of proof scope | n/a | gap: deployment-side screening (spec: reference impl performs *no* on-chain screen); verified under standard-token assumption |
| §A.3 (L246) | Each ledger operation MUST emit its corresponding event (§A.8) | NEW-C15 — every ledger mutation emits the matching event | n/a | gap: event-emission (indexer-facing), not a ledger-state invariant |
| §A.4 (L250) | The manager MUST maintain `escrow[strategy][token]` buckets | INV-1 / INV-P1 | CVL; Fuzz | mapped (escrow is a partition term) |
| §A.4 (L257) | A strategy's escrow is isolated: no movement kind can debit one strategy's escrow on behalf of another | INV-5 | CVL; Halmos | mapped |
| §A.5 (L268) | The partition invariant MUST hold after every state-mutating call (INV-1) | INV-1 / INV-P1 | CVL ghost sums; Fuzz; Medusa | mapped |
| §A.6 (L274) | Manager MUST support pausing forfeit execution; `executeForfeit` MUST revert while paused | NEW-C16 — executeForfeit reverts iff `forfeiturePaused()` | Halmos (per-call guard) | unmapped-new |
| §A.7 (L280) | All state-mutating manager entry points MUST be reentrancy-guarded; all strategy hooks + movement application MUST execute under the manager's reentrancy lock | NEW-C17 — no state-mutating entry reachable reentrantly (property, not mechanism) | CVL (reentrancy induction) | unmapped-new — **suspicious**: this is the transient-storage reentrancy property; verify the *property* not the guard |
| §A.7 (L280) | External token transfers to recipients MUST occur after state updates (checks-effects-interactions) | NEW-C18 — CEI ordering: no external call before state settle on mutating paths | CVL (ordering) / Halmos | unmapped-new |
| §A.8 (L320) | An implementation MUST NOT collapse the three encumbrance-decrement events into a single combined decrement event | NEW-C19 — three distinct decrement events emitted per decrement path | n/a | gap: event-vocabulary (indexer disambiguation), not a state property |
| §B.2 (L349) | Adapters MUST be stateless and view-only; the manager MUST interact with adapters exclusively through `staticcall`-semantics view reads | NEW-C20 — adapter reads are staticcall (no adapter state mutation / reentrancy via adapter) | Halmos (call-shape) | unmapped-new — **suspicious**: a non-staticcall adapter read would open a reentrancy/state surface |
| §B.3 (L355) | The manager MUST NOT unwrap, redeem, or convert backing on any payout path (raw-unit delivery) | NEW-C21 — all payouts deliver raw backing-token units; no external redeem in payout path | CVL / Halmos (no venue call on payout path) | unmapped-new — related to P1-PULL (forfeit liveness depends on no external venue call) |
| §C.1 create (L459–467) | `createCommitment` MUST reject: `arbiter==0`; `counterparty==0`; `amount==0`; `maxPenaltyBps>10_000`; `challengeWindow<MIN_CHALLENGE_WINDOW`; `expiresAt!=0 && expiresAt<=now`; `strategies.length>MAX_STRATEGIES`; metadataURI > MAX length | NEW-C22 — createCommitment input-validation battery (8 reverts) | Halmos (per-input reverts) | unmapped-new — **suspicious**: exhaustive revert coverage; each branch is a distinct symbolic check |
| §C.1 create (L468) | `createCommitment` MUST encumber `amount` from caller's free balance | INV-2 | CVL; Fuzz | mapped (encumber == Σ active amounts) |
| §C.1 create (L469) | `createCommitment` MUST maintain the exposure allocation invariant after creation | INV-3 | CVL; Fuzz | mapped |
| §C.1 create (L470) | MUST assign `commitmentId ≥ 1`; `0` MUST never identify a commitment | INV-10 | Halmos; CVL | mapped (**Halmos verified** per PROPERTIES.md) |
| §C.1 create (L471) | For each binding: call `onCommitmentCreated` then emit `CommitmentBoundToStrategy`; a revert in any `onCommitmentCreated` MUST abort the entire creation | NEW-C23 — creation is atomic over strategy bindings (any hook revert aborts) | Halmos (revert-propagation) | unmapped-new |
| §C.1 create (L472) | The bound strategy set MUST be immutable post-creation | INV-9 | CVL | mapped (immutability clause of INV-9) |
| §C.1 create (L474) | The manager MUST NOT persist `StrategyBinding.params` | NEW-C24 — params delivered via ctx+event, never stored | n/a | gap: storage-shape / non-persistence, not a checkable safety invariant (weakly Halmos-checkable) |
| §C.1 createAndFund (L476) | `createAndFund` MUST validate `params` **before** pulling any tokens | NEW-C25 — bad-params revert before any token movement (no fund-loss on revert) | Halmos (ordering) | unmapped-new — **suspicious**: front-running/atomicity; a validate-after-pull ordering bug loses funds on revert |
| §C.1 release (L478) | `releaseCommitment` MUST be callable only by the arbiter; MUST run `onCommitmentReleased` (guarded §D.6) **before** freeing remaining encumbrance | P1-FSM + NEW-C26 (release-hook-before-free ordering) | CVL (auth + FSM + ordering) | partially mapped (auth/FSM → P1-FSM); hook-ordering → unmapped-new |
| §C.1 expire (L480) | `expireCommitment` MUST be committer-only, MUST require `expiresAt!=0 && now>=expiresAt`, MUST revert if a forfeit proposal is active, MUST run the release-hook sequence | P1-FSM + NEW-C27 (expire preconditions) | CVL (FSM) + Halmos (preconditions) | partially mapped |
| §C.1 metadata (L482) | Tooling MUST NOT assume cross-deployment metadata interoperability | NEW-C28 | n/a | gap: off-chain integrator guidance |
| §C.2 (L486) | `totalForfeitable ≤ totalEncumbered` MUST hold for each `(user,token)` at all times | INV-3 | CVL; Fuzz | mapped |
| §C.2 (L495–498) | The exposure invariant MUST be checked on create and on agreement acceptance | INV-3 (+ INV-E1 cross-ref) | CVL; Fuzz | mapped |
| §C.3 (L506) | Forfeiture MUST be a two-phase process | P1-FSM | CVL | mapped |
| §C.3 initiate (L508) | `initiateForfeit` MUST be arbiter-only; `penaltyBps` MUST NOT exceed `maxPenaltyBps`; multiple concurrent active proposals MUST be rejected | INV-7 + NEW-C29 (penalty ≤ max, arbiter-only) | CVL (INV-7 single-proposal) + Halmos (penalty cap, auth) | partially mapped (single-proposal → INV-7); penalty-cap/auth → unmapped-new |
| §C.3 execute (L510) | `executeForfeit` MUST be callable by anyone after `initiatedAt + challengeWindow`; MUST revert while `forfeiturePaused()` | P1-WINDOW (+ NEW-C16 pause) | CVL + Halmos | mapped (window) — the pause clause is NEW-C16 |
| §C.3 execute order (L513) | Forfeit transfer moves `amount×penaltyBps/10_000` from committer encumbered to **counterparty free** (ledger credit) | P1-PULL + INV-4 | CVL rule + Halmos | mapped |
| §C.3 pull (L517) | The forfeit payout is a **ledger credit, not an external transfer** (no external transfer in execute path) | P1-PULL | CVL rule + Halmos | mapped — **suspicious**: liveness-critical; verify no `safeTransfer` on the execute path |
| §C.3 cancel (L519) | `cancelForfeit` MUST be arbiter-only while proposal is neither executed nor cancelled | NEW-C30 — cancelForfeit auth + state guard | Halmos | unmapped-new |
| §C.4 (L523) | After `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL`, `cancelStaleForfeitProposal` MUST be callable by anyone | P1-LIVE + NEW-C31 (stale-cancel time gate) | CVL (liveness) + Halmos (time gate) | partially mapped (liveness → P1-LIVE) |
| §C.5 (L529) | A commitment MUST support a committer-initiated unbond | P1-LIVE | CVL parametric; Fuzz | mapped |
| §C.5 request (L531) | `requestUnbond` MUST be committer-only on an active commitment w/ no pending unbond; MUST set `unbondInitiatedAt=now`; MUST NOT change ledger/`totalEncumbered`/`totalForfeitable`; arbiter MUST retain forfeit rights during window | P1-LIVE + INV-8 + NEW-C32 (request is ledger-neutral) | CVL (FSM, INV-8, ledger-neutrality) | partially mapped; ledger-neutrality → unmapped-new — **suspicious**: a requestUnbond that touched exposure would break INV-3 accounting |
| §C.5 finalize (L532) | `finalizeUnbond` MUST be callable by anyone after `unbondInitiatedAt + unbondingPeriod()`; `unbondingPeriod()` MUST be > 0; MUST revert if any forfeit proposal active; MUST close with release-hook accounting | P1-LIVE + P1-WINDOW-like + NEW-C33 (unbondingPeriod>0) | CVL + Halmos | partially mapped |
| §C.5 cancel (L533) | `cancelUnbond` MUST be committer-only and zero `unbondInitiatedAt` | P1-FSM + NEW-C34 | CVL / Halmos | partially mapped |
| §C.6 (L555) | Contribution forfeitable updates MUST use the exposure-before/after diff rule | INV-3 | CVL; Fuzz | mapped (diff-rule preserves INV-3 exactly) |
| §C.8 (L638) | Deployments diverging from the canonical `createCommitmentFor` typehash MUST publish the divergence | NEW-C35 | n/a | gap: EIP-712 typehash / off-chain doc, not a state property |
| §D.1 (L651) | `onCommitmentCreated` MUST revert if the strategy cannot operate against `ctx.base.adapter`/`token` | NEW-C23 (see §C.1 L471) | Halmos | unmapped-new (same property as C.1 revert-abort) |
| §D.1 (L676) | The executing contract MUST emit `DistributionPaid` on payout | NEW-C36 — DistributionPaid emitted on every payout path | n/a | gap: event-emission uniformity |
| §D.3 distribute (L736) | `distribute` MUST be permissionless; MUST revert `UnknownStrategy` if unbound; MUST revert `ForfeitPending` while a proposal active; MUST revert `CommitmentInactive` once closed | NEW-C37 — distribute gating (unknown/forfeit-pending/inactive reverts) | Halmos (per-call guards) | unmapped-new |
| §D.3 claim (L737) | Claims MUST remain available after the commitment closes (released or forfeited) | P1-LIVE-adjacent NEW-C38 — post-close claim liveness (parked accrual recoverable) | CVL (reachability) + Fuzz | unmapped-new |
| §D.3 order (L741) | The manager MUST iterate bound strategies in `strategies[]` array order, applying each before the next | NEW-C39 — deterministic array-order strategy iteration | CVL (determinism) / Fuzz | unmapped-new — **suspicious**: ordering is load-bearing for the guarded-hook failure-unit definition |
| §D.4 (L745) | The manager MUST reject any movement outside its call site's allowed-kind row | INV-4 / INV-5 (+ NEW-C40 kind-per-site) | CVL + Halmos | partially mapped — kind-per-site matrix → unmapped-new |
| §D.5 (L757) | For every returned movement the manager MUST validate ALL universal + per-kind rules before applying, and MUST apply a strategy's batch atomically | INV-4 + INV-5 | CVL + Halmos | mapped |
| §D.5 caps (L765–770) | Per-kind `from`/`to`/`token`/cap allow-list: `FromEncumbered*` from=committer, to∈{committer,counterparty}, token=c.token, running debit ≤ c.amount (INV-4); `FromEscrow*` from=S, escrow-bounded (INV-5) | INV-4 + INV-5 | CVL + Halmos | mapped |
| §D.5 shrink (L772–778) | For every applied `FromEncumbered*` debit the manager itself MUST apply the exposure-preserving shrink (`c.amount-=units`, `totalEncumbered-=units`, `totalForfeitable-=exposure diff`) | INV-3 + INV-4 | CVL | mapped — **suspicious**: exposure-diff (not recompute-from-units) is the INV-3 dust-drift defense; must be verified as diff-based |
| §D.5 fpg (L780) | At the `distribute` call site, `FromEncumbered*` movements MUST be rejected while a forfeit proposal is active | NEW-C41 — distribute-site forfeit-pending movement guard | Halmos + CVL | unmapped-new — **suspicious**: scoped guard; a misplaced/absent guard lets value race out from under a pending forfeit |
| §D.6 (L786) | Forfeit and release MUST NOT be vetoable by a strategy; manager MUST call the hooks under guarded semantics | P3-PARK | Medusa/Fuzz ONLY (gas-precise) | mapped — **never claim proof coverage** (gas-dependent) |
| §D.6 atomic (L788) | The strategy call + movement validation + application MUST execute in one revertable frame (invalid-movements degrades identically to revert) | P3-PARK | Medusa/Fuzz ONLY | mapped |
| §D.6 mingas (L790) | Before each guarded call the manager MUST verify `gasleft() ≥ cap + cap/63 + reserve` and MUST revert the entire transaction otherwise | P3-PARK | Medusa/Fuzz ONLY (gas-precise) | mapped — **suspicious but gas-bound**: the all-or-nothing gas property is Medusa-owned; Halmos/CVL abstract gas |
| §D.6 park (L791) | On guarded-frame revert the manager MUST emit `StrategyHookFailed` and continue; parked accrual NOT forfeited/redistributed | P3-PARK | Medusa/Fuzz ONLY | mapped |
| §D.7 (L809) | `DistributionPaid` MUST be emitted on every payout to a recipient regardless of execution path | NEW-C36 (see §D.1 L676) | n/a | gap: event-emission uniformity |
| §D.8 (L865) | A self-custody/external-pull strategy MUST still emit `DistributionPaid` | NEW-C36 | n/a | gap: event-emission uniformity |
| §Taxonomy IAY (L887) | Implementations offering index-appreciation premiums MUST implement them with these (normative-optional) semantics | NEW-C42 — IndexAppreciationYield conformance semantics | Halmos (accrual math) + Fuzz | unmapped-new (normative-optional; applies only if the shape is shipped) |
| §Taxonomy IAY (L893) | `onCommitmentCreated` MUST revert if `yieldShareBps > 10_000` | NEW-C43 — IAY yieldShareBps ≤ 10_000 | Halmos | unmapped-new |
| §Taxonomy IAY (L905) | `claim` caller MUST be the counterparty (or committer on reclaim path) | NEW-C44 — IAY claim authorization | Halmos | unmapped-new |
| §Taxonomy IAY (L909) | Auction-style settlements depending on the distribute-vs-initiateForfeit race MUST surface the assumption to integrators | NEW-C45 | n/a | gap: integrator documentation |
| §Taxonomy Merkle (L918) | `processClaim` MUST emit `DistributionPaid(strategy, earner, token, amountPaidOut, 0, rootId)` | NEW-C36 (cross-ref REWARDS) | n/a | gap: event-emission uniformity |
| §Rationale (L997) | A commitment MUST NOT lock backing indefinitely (committer-liveness) | P1-LIVE | CVL parametric; Fuzz | mapped |
| §Rationale 7201 (L1029) | New storage fields MUST be appended to the end of the layout struct; implementations MUST ship slot-derivation regression tests | NEW-C46 | n/a | gap: storage-layout regression owned by `StorageSlots.t.sol` (out of prover scope) |
| §Sec reentrancy (L1119) | All state-changing functions MUST use a reentrancy guard | NEW-C17 (see §A.7) | CVL | unmapped-new (non-reentrancy property) |
| §Sec gas (L1131) | Conformance suites MUST include a crafted-gas test asserting the all-or-nothing property | P3-PARK | Medusa/Fuzz ONLY | mapped (test-suite obligation for the gas property) |
| §Sec FoT (L1139) | Rebasing tokens MUST be rejected | NEW-C14 (see §A.2) | n/a | gap: deployment screening |
| §Sec sentinel (L1143) | Implementations MUST NOT assign id 0 to a real commitment; indexers MUST NOT treat id-0 events as commitment-bound | INV-10 | Halmos; CVL | mapped (id-0 half is INV-10; indexer half is off-chain gap) |
| §Sec window (L1151) | `challengeWindow < MIN_CHALLENGE_WINDOW` MUST be rejected; MUST NOT expose a production path lowering the enforced floor below `MIN_CHALLENGE_WINDOW` | P1-WINDOW | CVL + Halmos | mapped (see §0.3 suspicious note) |
| §Sec exposure (L1159) | `totalForfeitable ≤ totalEncumbered` MUST be checked on every `createCommitment` (and agreement acceptance) | INV-3 | CVL; Fuzz | mapped |
| §Invariants (L1169–1182) | A conformant implementation MUST maintain INV-1..INV-10 at all times (INV-6 terminal `¬(released∧forfeited)`, INV-8 single unbond additionally introduced here) | INV-1..INV-10 (incl. INV-6, INV-8) | CVL; Fuzz; Halmos | mapped — **note**: INV-6 (`¬(released∧forfeited)`) and INV-8 (single pending unbond) are not yet standalone rows in PROPERTIES.md P0/P1 tables — flag for merge |


---

## File 2 — `docs/standards/ERC-COMMITMENTS-AGREEMENTS.md` (bilateral agreements, P2)

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §2 | `proposeAgreement` MUST encumber the proposer's free balance of `proposerLeg.token` immediately (free → encumbered) | NEW-A2 — propose moves proposer `proposerLeg.amount` free→encumbered (INV-1 preserved) | CVL | unmapped-new |
| §2 | MUST check the exposure allocation invariant (INV-3) for the proposer before encumbering | INV-3 | CVL | mapped |
| §2 | Each leg MUST independently satisfy: non-zero `token`/`adapter`, non-zero `amount`, `maxPenaltyBps ≤ 10_000`, `strategies.length ≤ MAX_STRATEGIES` | NEW-A3 — propose reverts on any leg failing the per-leg validation battery | Halmos | unmapped-new |
| §2 | The proposal MUST expire after `proposalDuration` seconds | NEW-A4 — accept after `proposalExpiresAt` reverts `ProposalExpired` | Halmos | unmapped-new |
| §2 | `proposalDuration` MUST NOT exceed `MAX_PROPOSAL_DURATION` | NEW-A5 — propose reverts `ProposalDurationTooLong` when duration > MAX_PROPOSAL_DURATION | Halmos | unmapped-new |
| §2 | `acceptAgreement` MUST be callable only by the named acceptor | NEW-A6 — accept reverts `NotAcceptor` for caller ≠ stored acceptor | Halmos | unmapped-new |
| §2 | and MUST encumber the acceptor's free balance of `acceptorLeg.token` | NEW-A7 — accept moves acceptor `acceptorLeg.amount` free→encumbered (INV-1 preserved) | CVL | unmapped-new |
| §2 | MUST create two linked commitments sharing arbiter + `challengeWindow`, each carrying its own leg's `(token,adapter,amount,maxPenaltyBps)`, linked under a shared `agreementId` | NEW-A8 — accept produces two linked legs with shared arbiter/challengeWindow/agreementId | Halmos | unmapped-new |
| §2 | The exposure allocation invariant (INV-3) MUST be checked for the acceptor before encumbrance | INV-3 | CVL | mapped |
| §2 | For each leg the manager MUST invoke every bound strategy's `onCommitmentCreated` once with that leg's `CreatedContext` | NEW-A9 — accept invokes each `onCommitmentCreated` exactly once per (leg,strategy) | Halmos/Fuzz | unmapped-new |
| §2 | MUST emit `CommitmentBoundToStrategy` once per (leg, strategy) | NEW-A10 | n/a | gap: event-emission shape |
| §2 | `cancelAgreementProposal` MUST be callable by the proposer at any time pre-acceptance | NEW-A11 — pre-accept cancel by proposer succeeds; non-proposer pre-expiry reverts `NotProposer` | Halmos | unmapped-new |
| §2 | The proposer's encumbrance and exposure tracking MUST be restored on cancel | NEW-A12 — cancel restores proposer encumbered→free and exposure to pre-propose (INV-1/INV-3) | CVL | unmapped-new |
| §3 | `forfeitAgreement(id, penaltyBps)` MUST initiate forfeit proposals on both (unresolved) legs at the shared `penaltyBps` | NEW-A13 — forfeitAgreement initiates a proposal on each unresolved leg | CVL | unmapped-new |
| §3 | Only the shared arbiter MAY call `forfeitAgreement` (`NotArbiter`) | NEW-A14 — forfeitAgreement reverts `NotArbiter` for caller ≠ shared arbiter | Halmos | unmapped-new |
| §3 | `penaltyBps` MUST NOT exceed either unresolved leg's `maxPenaltyBps` | NEW-A15 — forfeitAgreement reverts `PenaltyExceedsMax` when penalty > any unresolved leg max | Halmos | unmapped-new |
| §3 | The manager MUST validate against every unresolved leg and revert `PenaltyExceedsMax` **before** mutating either leg (no partial one-leg forfeit) | NEW-A16 — atomic validate-before-mutate: out-of-range forfeit leaves both legs unmutated | CVL | unmapped-new — **suspicious** |
| §3 | If one side is already resolved, MUST emit `AgreementPartialForfeit` for that side and proceed on the other | NEW-A17 — one-resolved-leg forfeit emits `AgreementPartialForfeit` + forfeits only the other | Fuzz/Medusa | unmapped-new |
| §3 | `releaseAgreement(id)` MUST release both commitments atomically | NEW-A18 — releaseAgreement is all-or-nothing over both legs | CVL | unmapped-new |
| §3 | Only the shared arbiter MAY call `releaseAgreement` (`NotArbiter`) | NEW-A19 — releaseAgreement reverts `NotArbiter` for caller ≠ shared arbiter | Halmos | unmapped-new |
| §3.1 | The manager MUST reject core per-commitment *enforcement* entry points on an agreement leg, reverting `UseAgreementPath` (covers `releaseCommitment(legId)`, `initiateForfeit(legId,…)`) | NEW-A20 — enforcement entry points on an agreement leg revert `UseAgreementPath` | Halmos | unmapped-new |
| §3.1 / §4 | `requestUnbond(legId)` remains available to either committer but MUST auto-propagate to the partner leg (never single-leg) | NEW-A21 — requestUnbond on a leg propagates to the partner leg | CVL | unmapped-new — **suspicious** |
| §4 | `finalizeUnbond` on either side after the window MUST be permitted | P1-LIVE | CVL | mapped |
| §4 | `cancelUnbond` on either side MUST cancel the unbond on both sides | NEW-A22 — cancelUnbond on either leg cancels the pending unbond on both | CVL | unmapped-new |
| §5 | `settleAgreement` MUST be callable only by the shared arbiter (`NotArbiter`) | NEW-A23 — settle reverts `NotArbiter` for caller ≠ shared arbiter | Halmos | unmapped-new |
| §5 | Revert `ZeroAmount` if `units == 0`, `SettlementCapExceeded` if `units > type(uint128).max` | NEW-A24 — settle reverts on zero units / uint128 overflow | Halmos | unmapped-new |
| §5 | Revert if either leg is released/forfeited (`CommitmentInactive`), has an active forfeit (`ForfeitPending`), or has a pending unbond (`UnbondPending`) | NEW-A25 — settle state-precondition reverts on either leg | Halmos | unmapped-new |
| §5 | Revert if the per-direction cap is zero (`SettlementCapZero`) or the ratcheted cumulative would exceed it (`SettlementCapExceeded`) | INV-E1 | CVL | mapped — **suspicious** (cap ratchet arithmetic) |
| §5 | Revert `InsufficientCommitmentAmount` if `units` exceeds the payer leg's current `amount` | NEW-A26 — settle reverts when `units > payer leg amount` | Halmos | unmapped-new |
| §5 | Before shifting principal, MUST invoke `distribute` on every strategy bound to either leg in array order via the guarded-hook mechanism | P3-PARK | Medusa/Fuzz | mapped |
| §5 | Move `units` of the payer token from payer encumbered → receiver free (INV-1 holds) | INV-1 | CVL | mapped |
| §5 / §7 INV-E2 | Update **only** the payer leg's `amount` and payer exposure; the receiver leg is untouched; `(token,adapter,maxPenaltyBps)` fixed at acceptance | NEW-A27 — settle mutates only payer leg amount+exposure; per-leg terms immutable post-accept (INV-E2) | CVL | unmapped-new — **suspicious** (cross-token) |
| §5 | Forfeitable updates MUST use the exposure-before/after diff (not `units×maxPenaltyBps/10_000` recompute) to keep INV-3 dust-free | INV-3 | CVL | mapped — **suspicious** (dust drift) |
| §5.1 | Deployments mixing evidence encodings within one arbiter MUST surface the encoding type alongside the hash | NEW-A28 | n/a | gap: off-chain evidence-encoding convention |
| §7 INV-E1 | Per agreement with non-zero caps: cumulative flow each direction ≤ its max flow | INV-E1 | CVL; Fuzz | mapped |
| §7 | All core invariants INV-1..INV-10 hold across every agreement operation (in particular settle preserves INV-1 and INV-3 on both parties) | INV-1..INV-10 | CVL | mapped |
| §Security | Parties MUST size `maxFlow*` as the worst-case loss they accept from arbiter discretion | — | n/a | gap: off-chain party-side sizing guidance |

---

## File 3 — `docs/standards/ERC-COMMITMENTS-MUTUALS.md` (shared-loss mutuals, §G, P2)

> Note: the spec names many `INV-G*` / `INV-P*` IDs that are **not yet rows** in
> `PROPERTIES.md` (the catalog lists only `INV-P9`, `INV-G2/G3/G6`,
> `P2-MONO`, `INV-P1`, `INV-P0`). Clauses whose named ID is not yet catalogued
> are marked `unmapped-new` (with the spec's `INV-G*/INV-P*` name preserved for
> the merge) pending a promotion decision.

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §1 | The `Commitment` struct / `getCommitment` ABI tuple MUST NOT be widened (mutual state in sibling mappings) | NEW-M1 — getCommitment tuple width == core | n/a (StorageSlots) | unmapped-new |
| §1, §1.1 | Implementations MUST extend the storage-slot test with the six new fields, declared in exact order; layout append-only | NEW-M2 — six mutual fields at fixed offsets, no reorder | n/a (StorageSlots) | unmapped-new |
| §1 | The premium compartment is mutated only through its dedicated `LedgerLib` helper pair (INV-P0) so INV-P1 holds | INV-P0 | CVL | mapped |
| §1.1 | `cumulativeLoss` monotonic non-decreasing, ≤ 1e18 | INV-G2 / P2-MONO | CVL (monotone) + Halmos (bounded bump) | mapped |
| §1.1 | `totalShares` mutated on join/release ONLY — never on loss | NEW-M5 — totalShares never mutated on loss-execute | CVL | unmapped-new |
| §1.1 | `premiumPerShareStored` (Π) monotone non-decreasing | P2-MONO | Halmos (nonlinear — CVL likely timeout) | mapped |
| §1.2 | Both `forfeitableUnits` (Eᵢ) and `creditedValue` MUST be stored (frozen at join) | NEW-M6 — Eᵢ and creditedValue persisted at join | n/a (storage presence) | unmapped-new |
| §1.2 | `settledUnits` MUST be stored explicitly (not re-derived from live `commitment.amount`) | NEW-M7 — settledUnits stored explicitly | n/a (storage presence) | unmapped-new |
| §1.5 | `MUTUAL_MIN_CHALLENGE_WINDOW` MUST be strictly longer than the per-commitment 1-day floor | NEW-M9 — constant relation `MUTUAL_MIN_CHALLENGE_WINDOW > 86_400` | Halmos (constant assertion) | unmapped-new |
| §2.1 | When `applied < L`, the manager MUST emit `MutualLossShortfall(mutualId, L - applied)` | NEW-M10 — clamp shortfall always emits `MutualLossShortfall` | Fuzz/Medusa | unmapped-new |
| §2.3 | If `totalShares == 0` at execute, MUST mark terminal, emit full-`L` `MutualLossShortfall`, `MutualLossExecuted(…,0,…)`, `MutualTerminated` | NEW-M11 — empty-mutual execute → terminal + full-shortfall + terminated | Halmos (branch) + Fuzz (events) | unmapped-new |
| §3.1 | `createMutual` MUST revert `ZeroAddress` if arbiter/numeraire/beneficiary is zero | NEW-M3 — createMutual rejects zero arbiter/numeraire/beneficiary | Halmos | unmapped-new |
| §3.1 | MUST revert `MutualChallengeWindowTooShort` if `challengeWindow < MUTUAL_MIN_CHALLENGE_WINDOW` | NEW-M12 — challengeWindow ≥ MUTUAL_MIN_CHALLENGE_WINDOW at create | Halmos | unmapped-new |
| §3.1 | MUST revert `DeallocationWindowTooShort` if `deallocationWindow < challengeWindow` | NEW-M13 — deallocationWindow ≥ challengeWindow at create | Halmos | unmapped-new |
| §3.3 | `joinMutual` MUST enforce, in order: mutual exists/active/non-terminal; no loss pending; `params.arbiter == mutual.arbiter`; `params.counterparty == mutual.beneficiary`; `params.strategies.length == 0`; `params.token == mutual.numeraire`; Eᵢ non-zero | NEW-M14 — joinMutual seven ordered preconditions | Halmos | unmapped-new |
| §3.3 | `params.token` MUST equal `mutual.numeraire` (`NumeraireMismatch`) | NEW-M15 — join requires token == numeraire | Halmos | unmapped-new |
| §3.3 | Eᵢ MUST NOT exceed `MAX_TOTAL_SHARES` (`TotalSharesOverflow`) | NEW-M16 — Eᵢ and totalShares add ≤ MAX_TOTAL_SHARES | Halmos | unmapped-new |
| §3.3 | Join adds `creditedValue` to `totalShares` (checked ≤ MAX_TOTAL_SHARES) | INV-G2/G6 (totalShares == Σ creditedValue) | CVL (sum) + Halmos (cap) | mapped |
| §4 | A conforming implementation MUST preserve INV-1 (partition), INV-3 (exposure), INV-4 (movement cap) | INV-1 / INV-3 / INV-4 | CVL; Fuzz | mapped |
| §4 INV-G1 | Cumulative settled value ≤ Σ declared L | NEW-M19 (INV-G1) — Σ settled ≤ Σ declared loss | CVL (inductive) | unmapped-new |
| §4 INV-G2 | `0 ≤ cumulativeLoss ≤ 1e18`, monotonic non-decreasing | INV-G2 / P2-MONO | CVL + Halmos | mapped |
| §4 INV-G3 | Per member cumulative `owedUnits ≤ forfeitableUnits` (Eᵢ) | INV-G3 (settledUnits ≤ forfeitableUnits) | CVL; Halmos | mapped |
| §4 INV-G4 | A member joining at Λ=l₀ is never liable for losses before its join | NEW-M20 (INV-G4) — lossSnapshot == cumulativeLoss at join (no retroactive loss) | CVL | unmapped-new |
| §4 INV-G5 | A member cannot release with unsettled `cumulativeLoss − lossSnapshot`, nor before the deallocation window elapses, nor after its exit window lapses | NEW-M21 (INV-G5) — release requires lossSnapshot==cumulativeLoss ∧ deallocationWindow ≤ elapsed < 2·deallocationWindow | CVL + Halmos | unmapped-new |
| §4 INV-G6 | One commitment maps to at most one mutual; `mutualId` single and non-rebindable | INV-G6 (single membership) | CVL | mapped |
| §4 INV-G7 | `creditedValue` equals Eᵢ and is never read from a price or adapter | NEW-M22 (INV-G7) — creditedValue == Eᵢ, no live adapter read | Halmos (structural) | unmapped-new — **suspicious** |
| §4 INV-G8, §5 | A member commitment MUST NOT enter an agreement, be terminally single-forfeited, or close through the normal path while the mutual still expects its Eᵢ | NEW-M23 (INV-G8) — member commitment barred from agreements + non-mutual close/forfeit | CVL (reachability) + Halmos (revert) | unmapped-new |
| §4 INV-G9 | The surviving-partial (and terminal) settle decrement moves both `totalEncumbered` and `totalForfeitable` by the same `owedUnits`, so aggregate INV-3 holds | INV-G9 → INV-3 (gap-preserving decrement) | CVL | mapped — **suspicious** |
| §4 INV-G10 | Every settle debit is clamped to live `c.amount`; the clamp is never droppable | INV-G10 / INV-P9 (deliverable ≤ c.amount) | CVL + Halmos | mapped — **suspicious** |
| §4 INV-P0 | The premium reserve is mutated only via its `LedgerLib` helper pair; `_pokePremium` NEVER writes a reserve | INV-P0 | CVL | mapped |
| §4 INV-P1 | `totalFree + totalEncumbered + totalEscrow + totalMutualPremium == balanceOf(manager)` | INV-P1 / INV-1 | CVL ghost sums; Fuzz | mapped |
| §4 INV-P2 | At every `fundMutualPremium`, `rewardRate × duration + bankedTotal ≤ mutualPremiumPool` | NEW-M24 (INV-P2) — funding-time solvency | Halmos (nonlinear mulDiv — CVL likely timeout) | unmapped-new — **suspicious** |
| §4 INV-P5 | A member joining at Π=p₀ earns only Π growth after join (`premiumSnapshot = Π` at join) | NEW-M25 (INV-P5) — premiumSnapshot == Π at join | CVL | unmapped-new |
| §4 INV-P8 | `_pokePremium` runs immediately before every mutation of `activeCover` or Π | NEW-M27 (INV-P8) — poke-before-change of activeCover/Π | CVL (state machine) | unmapped-new |
| §4 INV-P9 | `activeCover == totalShares − settledTotal == Σ effCoverᵢ` | INV-P9 | Fuzz; CVL | mapped |
| §4 INV-P10 | Premium banking inside settle/release is failure-isolated (saturating, skip-not-revert on infeasible overflow) | NEW-M (INV-P10) — premium bank never bricks a loss | Medusa/Fuzz (gas/overflow-edge) | unmapped-new |
| §5 | The manager MUST revert `CommitmentInMutual` on: `initiateForfeitCore`; agreements accept/settle; `requestUnbondCore`; `contributeEncumbered`; and (convergence gate) `_closeWithHooks` when `membership.mutualId != 0` | NEW-M30 — each named entry path reverts `CommitmentInMutual` for a member | Halmos (per-path revert) | unmapped-new |
| §6.2 | `fundMutualPremium` reverts `StreamDurationOutOfBounds` on out-of-range duration / `periodFinish` uint64 overflow | NEW-M31 — fund rejects out-of-bounds duration / periodFinish overflow | Halmos | unmapped-new |
| §6.2 | reverts `NoActiveCover` when `activeCover == 0` | NEW-M32 — fund reverts on zero activeCover | Halmos | unmapped-new |
| §6.2 | reverts `RewardRateOverflow` when computed `rewardRate` would not fit uint128 | NEW-M33 — rewardRate fits uint128 | Halmos (bounded div) | unmapped-new |
| §6.2 | `PremiumRateDecreased` — while a stream runs, funding may only maintain or raise `rewardRate` (S6 guard) | P2-MONO (S6 rate non-decrease) | Halmos (nonlinear — CVL likely timeout) | mapped — **suspicious** |
| §6.2 | reverts `PremiumStreamUnderfunded` when the INV-P2 solvency guard fails | NEW-M24 (INV-P2 revert) | Halmos | unmapped-new |
| §9 | Implementations MUST NOT loop over a mutual-members array on any non-admin custody-root path | NEW-M36 — no unbounded member-array loop on non-admin custody-root path | Medusa (gas) + code-review | unmapped-new |

---

## File 4 — `docs/standards/ERC-COMMITMENTS-REWARDS.md` (Merkle rewards, P4)

> The rewards coordinator is a self-custody strategy: its accounting space is
> outside INV-1 (manager partition). No rewards clause was pre-mapped in
> `PROPERTIES.md`. The P4 target
> `PROPERTIES.md` already names is "Merkle claim non-replay" — the cumulative
> non-replay clauses below are that target (tagged `P4-MERKLE (cumulative
> non-replay)` inline). `DistributionPaid.commitmentId == 0` rows align with
> `INV-10`.

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §1.2 | `MIN_ACTIVATION_DELAY == 86_400` seconds (MUST-level constant) | NEW-R1 — `minActivationDelay == 86_400` floor at init; enforced on every `setActivationDelay` | Halmos | unmapped-new |
| §1.3 | A conformant implementation MUST implement all sections of Part R | — | n/a | gap: meta-conformance statement |
| §3 | A conformant coordinator MUST expose `ICommitmentsRewardsCoordinator` | — | n/a | gap: interface/ABI-shape |
| §3 | Coordinators MUST NOT expose a competing updater surface | NEW-R2 — coordinator has no updater mutator; updater state lives only on the snapshot | n/a | gap: absence-of-function / ABI-surface |
| §3.1 | `depositRewards` MUST be callable by any address | NEW-R3 — depositRewards has no caller-auth guard | Halmos | unmapped-new |
| §3.1 | MUST `safeTransferFrom` the funder | NEW-R4 — deposit pulls exactly `amount` from `msg.sender` | Halmos | unmapped-new |
| §3.1 | MUST emit `RewardsDeposited` | NEW-R5 | Halmos | unmapped-new |
| §3.1 | MUST revert `ZeroAmount` if `amount == 0` | NEW-R6 | Halmos | unmapped-new |
| §3.1 | MUST revert `ZeroAddress` if `token == address(0)` | NEW-R7 | Halmos | unmapped-new |
| §3.2 (0) | `processClaim` reverts `ZeroAddress` on `token == address(0)` | NEW-R8 | Halmos | unmapped-new |
| §3.2 (1) | Claims not frozen else revert `ClaimsFrozen` | NEW-R9 — processClaim reverts `ClaimsFrozen` while `frozen()` | Halmos | unmapped-new |
| §3.2 (2) | `snapshot.isActive(rootId) == true` else revert `RootNotActive` | NEW-R10 — claim reverts `RootNotActive` unless root active | Halmos | unmapped-new |
| §3.2 (3) | `MerkleProof.verifyCalldata(proof, rootId, keccak256(abi.encode(msg.sender, token, cumulativeAmount)))` true else `InvalidProof` | NEW-R11 — leaf = keccak256(abi.encode(sender,token,cumulativeAmount)); invalid proof reverts | Halmos | unmapped-new |
| §3.2 (4) / §7 INV-R1 | `cumulativeAmount >= claimed[sender][token]` else revert `CumulativeRegression` | P4-MERKLE (cumulative non-replay) — claim reverts when `cumulativeAmount < claimed` | Halmos + CVL | unmapped-new — **suspicious** |
| §3.2 (5) | `amountPaidOut = cumulativeAmount − claimed` MUST be non-zero else revert `NoOp` | NEW-R12 — zero-delta re-claim reverts `NoOp` (no silent no-op) | Halmos | unmapped-new |
| §3.2 | MUST update `claimed[sender][token] = cumulativeAmount` **before** the external transfer (CEI), then `safeTransfer` | NEW-R14 — CEI: `claimed` set to `cumulativeAmount` before transfer; exactly `amountPaidOut` sent | Halmos + CVL | unmapped-new |
| §3.2 / §9 | MUST emit `RewardsClaimed` and `DistributionPaid(address(this), sender, token, amountPaidOut, 0, rootId)` | NEW-R15 + INV-10 — every claim emits both; `commitmentId == 0`, `context == rootId` | Halmos | unmapped-new — **suspicious** |
| §3.2 | `processClaim` MUST be reentrancy-guarded | NEW-R16 | CVL/Fuzz | unmapped-new |
| §3.2 | This standard does NOT support claim-on-behalf (`msg.sender` is the only earner) | NEW-R17 | n/a | gap: negative-surface / absence-of-function |
| §3.3 | `freeze()` service-only; reverts `AlreadyFrozen`; emits `ClaimsFrozenSet` | NEW-R18 | Halmos | unmapped-new |
| §3.3 | `unfreeze()` service-only; reverts `NotFrozen`; emits `ClaimsUnfrozen` | NEW-R19 | Halmos | unmapped-new |
| §3.4 | The coordinator MUST NOT take a fee on `depositRewards` or `processClaim` | NEW-R20 — deposited amount fully claimable; payout has no skim | CVL/Fuzz | unmapped-new |
| §3.4 | MUST NOT expose any state path introducing a fee, even via upgrade | NEW-R21 — no fee-bps/fee-recipient state or setter exists | n/a | gap: upgrade-surface review |
| §4 | A conformant snapshot MUST expose `IMerkleSnapshot` | — | n/a | gap: interface/ABI-shape |
| §4.1 | `submitRoot` MUST verify `msg.sender == activeUpdater()` else `NotUpdater` | NEW-R22 — submitRoot reverts `NotUpdater` unless caller == snapshot `activeUpdater()` | Halmos | unmapped-new |
| §4.1 | MUST revert `ZeroRoot` if `merkleRoot == 0` | NEW-R23 | Halmos | unmapped-new |
| §4.1 | MUST revert `RootAlreadySubmitted` if `roots[merkleRoot].submittedAt != 0` | NEW-R24 — duplicate-root rejection; content-hash identity `rootId == merkleRoot` | Halmos | unmapped-new |
| §4.2 | `disableRoot` MUST be service-only | NEW-R25 | Halmos | unmapped-new |
| §4.2 | MUST revert `RootNotFound` if `submittedAt == 0` | NEW-R26 | Halmos | unmapped-new |
| §4.2 | MUST revert `RootAlreadyDisabled` if already disabled | NEW-R27 | Halmos | unmapped-new |
| §4.2 | MUST revert `RootAlreadyActive` if `block.timestamp >= activeAt` (activation-delay window is the disable window) | NEW-R28 — disableRoot only within the activation-delay window | Halmos | unmapped-new — **suspicious** |
| §4.3 | `setActivationDelay` MUST be service-only | NEW-R29 | Halmos | unmapped-new |
| §4.3 | MUST revert `ActivationDelayBelowFloor` if `newDelay < minActivationDelay` | NEW-R1 | Halmos | unmapped-new |
| §4.4 | `service()` MUST be set at init and MUST NOT be mutable | NEW-R30 | CVL | unmapped-new |
| §4.4 | `minActivationDelay()` MUST be set at init and MUST NOT be mutable | NEW-R31 | CVL | unmapped-new |
| §4.4 | `coordinator.snapshot()` binding MUST be set at coordinator init and MUST NOT be mutable | NEW-R32 | CVL | unmapped-new |
| §4.5 | The snapshot MUST implement the §0.6 activation-delay pattern for updater changes | NEW-R33 — updater swap follows stage → delay → permissionless activate | CVL | unmapped-new |
| §4.5 | `activeUpdater()` MUST return only the activated value, never the staged value, even after `pendingUpdaterEffectiveAt` | NEW-R34 — strict-flip: never returns staged value pre-activate | Halmos/CVL | unmapped-new |
| §4.5 | A staged-but-not-activated updater attempting `submitRoot` MUST fail the §4.1 auth check | NEW-R35 — staged updater cannot submitRoot before activation | Halmos | unmapped-new |
| §5, §Security | Storage layouts MUST be append-only across revisions | NEW-R36 — EIP-7201 layouts append-only | n/a | gap: cross-revision layout (slot regression test) |
| §5 | Implementations MUST include a slot-derivation regression test | — | n/a | gap: harness-existence requirement |
| §6 | The upgrade authority MUST be the service | NEW-R37 — `_authorizeUpgrade` gated to `service()` | Halmos/CVL | unmapped-new |
| §7 INV-R1 | `claimed[earner][token]` MUST be monotonically non-decreasing across the contract's lifetime; INV-R1 MUST be enforced on-chain at claim time | P4-MERKLE (cumulative non-replay, cross-call monotone) | CVL/Fuzz | unmapped-new |
| §7 INV-R1 | After any successful claim `claimed[earner][token]` MUST equal `cumulativeAmount` | NEW-R14 | CVL/Fuzz | unmapped-new |
| §7 | A conformance suite MUST include ≥1 invariant run over random deposit/submit/claim asserting INV-R1 | — | Fuzz | gap: harness-existence (`RewardsCoordinatorInvariants.t.sol`) |
| §8 | Operators taking a cut MUST do so off-chain in the updater calculation | — | n/a | gap: off-chain policy |
| §8 | Integrators MUST audit their updater (funding solvency is the updater's responsibility) | — | n/a | gap: off-chain trust assumption |
| §Security | Implementations MUST NOT introduce cross-token state | NEW-R38 — `claimed` keyed per (earner,token); no cross-token coupling | CVL/Fuzz | unmapped-new |
| §Conformance Harness | MUST include slot / integration / invariant (≥256 runs, INV-R1 + solvency `Σ claimed ≤ funded` + balance-matches-ledger) / adversarial-error-path tests | NEW-R39 (solvency + balance-ledger cores) | Fuzz (harness) + CVL (solvency) | gap (harness) / unmapped-new (solvency invariant) |

---

## File 5 — `docs/standards/generated/selectors.md` (identifier appendix)

**Zero normative MUST/MUST NOT/SHALL clauses.** This file is the generated
4-byte-selector / topic0 / error-selector / ERC-165-id appendix (`just
selectors`), produced from the compiled reference ABIs. It contains only pinned
identifiers, not obligations. The relevant obligation about it lives in the
**core** spec (§0.4, L117): integrators *SHOULD* verify load-bearing identifiers
against it — a SHOULD, not a MUST, so it is out of scope for this table.

| Clause ref (§) | MUST text | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| (none) | — | — | — | gap: no normative MUST clauses in this file (identifier appendix); selector/topic0 stability is an ABI-identity property, not an on-chain state invariant |

---

## File 6 — `docs/standards/ERC-COMMITMENTS-SERVICES.md` (operator registry + service manager, P4)

> No services clause was pre-mapped in `PROPERTIES.md`; the P4 umbrella targets
> already named there are **"registry delegation accounting"** and **"EIP-712
> envelope verification"**. The `INV-S1..INV-S4` names below are the spec's own
> invariant IDs (not yet catalogued) — kept for the merge. Many per-clause rows
> are the leaf checks of an aggregate `INV-S*`; the aggregate rows (§5) collect
> them.

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §2 | Each operator-set commitment MUST have `counterparty == address(registry)` and `arbiter == serviceArbiter` | NEW-S1 (INV-S2 leaf) — tracked commitment satisfies counterparty==registry ∧ arbiter==requiredArbiter | Halmos + Fuzz | unmapped-new |
| §2 | An operator MUST have an active self-stake to accept delegations (`register` requires active self-stake) | NEW-S2 — register/delegate revert unless operator has an active self-stake commitment | Halmos | unmapped-new |
| §2 | Implementations MUST preserve the Operator struct layout for a conformant `getOperator` ABI | — | n/a | gap: layout/ABI (StorageSlots) |
| §2 | Event indexing scheme (indexed fields on all registry events) MUST match | — | n/a | gap: event-shape |
| §2.1 | On accept the registry MUST verify (revert otherwise): `committer == msg.sender`; `counterparty == this`; `!released && !forfeited`; (register) `amount >= minOperatorStake`; not already tracked; acceptance policy passes | NEW-S3 (INV-S2 leaf) — register/delegate revert unless all six §2.1 predicates hold | Halmos | unmapped-new |
| §2.2 | MUST snapshot the credited amount per commitment at accept time and decrement by that snapshot on release/forfeit callbacks — not by runtime `amount` | NEW-S4 (INV-S1 leaf) — callback decrement == credited snapshot, not runtime amount | CVL/Fuzz + Halmos | unmapped-new — **suspicious** |
| §2.2 | `delegate` MUST revert once `activeDelegationCount >= maxDelegationsPerOperator` | NEW-S5 | Halmos | unmapped-new |
| §2.2 | `deregister` MUST revert unless `activeDelegationCount == 1` | NEW-S6 | Halmos | unmapped-new — **suspicious** |
| §2.3 | Acceptance rejects unless `arbiter == requiredArbiter` | NEW-S7 (INV-S2 leaf) | Halmos | unmapped-new |
| §2.3 | Acceptance rejects unless `maxPenaltyBps >= minMaxPenaltyBps` | NEW-S8 (INV-S2 leaf) | Halmos | unmapped-new |
| §2.3 | Acceptance rejects unless `token == requiredToken` | NEW-S9 (INV-S2 leaf) | Halmos | unmapped-new |
| §2.3 | Acceptance rejects (`StrategiesNotAllowed`) unless every bound strategy satisfies `isStrategyAllowed` | NEW-S10 (INV-S2 leaf) | Halmos | unmapped-new — **suspicious** |
| §2.3 | Admins MUST only add non-draining (self-custody) strategies | — | n/a | gap: admin operational policy |
| §2.3 | `setStrategyAllowed` MUST be admin-gated and reject `strategy == 0` | NEW-S11 | Halmos | unmapped-new |
| §2.3 | `tightenPolicy(newFloor)` MUST be admin-gated and revert unless `current < newFloor <= 10_000` | NEW-S12 | Halmos | unmapped-new |
| §2.4 | Both callbacks MUST revert unless `msg.sender == commitmentManager` | NEW-S13 (P4 delegation accounting) | Halmos | unmapped-new |
| §2.4 | Both callbacks MUST silently ignore an untracked `commitmentId` (return, no state change) | NEW-S14 | Halmos | unmapped-new — **suspicious** |
| §2.4 | Both callbacks MUST decrement `totalDelegatedStake` by the credited snapshot and `activeDelegationCount` by one | NEW-S15 (INV-S1 leaf) | CVL/Fuzz + Halmos | unmapped-new |
| §2.4 | Both callbacks MUST clear the commitment's callback routing | NEW-S16 | Halmos | unmapped-new |
| §2.4 | Both callbacks MUST emit `OperatorBelowMinStake` if active ∧ stake fell below `minOperatorStake` (below-minimum is derived, not stored) | NEW-S17 | Halmos | unmapped-new |
| §2.4 | `onDelegationForfeited` MUST remove the full committed amount, not just the penalty portion | NEW-S18 (INV-S1 leaf) | Halmos + Fuzz | unmapped-new — **suspicious** |
| §2.4 | The manager MUST invoke these callbacks after the corresponding core transition succeeds, same transaction | — | Fuzz | gap: manager-side ordering (owned by core P1 lifecycle) |
| §2.4 | `reconcile(commitmentId)` MUST run the callback's close path for a routed commitment the manager shows released or forfeited, emitting `DelegationReleased` or `DelegationForfeited`; MUST revert `CommitmentNotTracked` (not routed) and `CommitmentStillOpen` (still open) | NEW-S60 | Halmos | unmapped-new |
| §2.5 | `sweepForfeitProceeds` MUST be admin-gated and reject `payTo == 0` | NEW-S19 | Halmos | unmapped-new |
| §2.6 | `setOperatorMetadata` MUST revert unless active operator (`OperatorNotActive`) ∧ `len(uri) <= MAX_METADATA_URI_LENGTH` | NEW-S20 | Halmos | unmapped-new |
| §2.6 | Metadata MUST be stored in a sidecar mapping isolated from the hot-path Operator record | — | n/a | gap: storage-isolation layout |
| §2.8 | A valid signature MUST carry exactly the current nonce, consumed on success (`InvalidNonce`) | NEW-S23 (P4 EIP-712) | Halmos | unmapped-new |
| §2.8 | A call after `block.timestamp > deadline` MUST revert `SignatureExpired` | NEW-S24 (P4 EIP-712) | Halmos | unmapped-new |
| §2.8 | A signature not recovering to/validating for the claimed signer MUST revert `InvalidSignature` | NEW-S25 (P4 EIP-712) | Halmos | unmapped-new |
| §2.8 | A same-block register⇄deregister flip MUST revert `SameBlockToggle` | NEW-S26 | Halmos | unmapped-new |
| §2.9 | `setMeshWiring` MUST be admin-gated, callable once (`MeshAlreadyWired`), reject zero `tokenWeighting`/`meshFactory` | NEW-S27 | Halmos | unmapped-new |
| §2.9 | `register`/`delegate` MUST revert `RegistryNotWired` unless `manager.operatorRegistry() == address(this)` | NEW-S28 (INV-S2 leaf) | Halmos | unmapped-new — **suspicious** |
| §3 | `getVotingPowerAt(who,b)`/`getTotalPowerAt(b)` MUST return the value as of block `b` for past `b < block.number`, not current | NEW-S29 (P4 voting-power source) | Fuzz + Halmos | unmapped-new |
| §3 | A source MUST keep `getTotalPower()` == Σ `getVotingPower(who)` over all tracked addresses, at every block | NEW-S30 (P4 aggregation) | Fuzz + Halmos | unmapped-new |
| §4.1 | The digest signed over an `Envelope` MUST be an EIP-712 typed-data digest, not EIP-191 personal-sign | NEW-S31 (P4 EIP-712) | Halmos | unmapped-new |
| §4.1 | The domain `version` MUST be bumped on any envelope-hashing-scheme change | — | n/a | gap: versioning discipline |
| §4.2 | `validate` MUST revert iff the §4.5 algorithm fails, else return normally | NEW-S38 (INV-S4 / P4 EIP-712) | Halmos | unmapped-new |
| §4.2 | `isValidSignature` MUST return the ERC-1271 magic value iff §4.5 passes for `digest` | NEW-S32 (P4 EIP-712) | Halmos | unmapped-new |
| §4.2 | A failing validate/isValidSignature MUST revert with one of the enumerated distinguished errors | NEW-S33 (P4 EIP-712) | Halmos | unmapped-new |
| §4.2 | `getAllocationManager`/`getDelegationManager` shims, when exposed, MUST return `address(0)` | NEW-S34 | Halmos | unmapped-new |
| §4.3 | `enrollServiceOperator` MUST revert unless caller `isOperator` (`NotActiveOperator`) ∧ not already enrolled (`AlreadyRegistered`) | NEW-S35 | Halmos | unmapped-new |
| §4.3 | `withdrawServiceOperator` MUST be callable by operator-self or admin (`NotAdminOrSelf`), revert if not enrolled (`NotRegistered`) | NEW-S36 | Halmos | unmapped-new |
| §4.3 | Withdrawal MUST clear the signing key by pushing zero into both `operator→key` and `key→operator` checkpoints at the current block | NEW-S37 (INV-S3 leaf) | Halmos | unmapped-new |
| §4.3 | `updateOperatorSigningKey` caller MUST be registered | NEW-S39 | Halmos | unmapped-new |
| §4.3 | `newSigningKey` MUST be non-zero and MUST prove possession over `keccak256(abi.encode(operator, serviceManager, chainid))` | NEW-S40 (INV-S3) | Halmos | unmapped-new — **suspicious** |
| §4.3 | `newSigningKey` MUST NOT already be assigned to a different operator | NEW-S41 (INV-S3 leaf) | Halmos | unmapped-new — **suspicious** |
| §4.3 | Both `operator→key` and `key→operator` directions MUST be checkpointed by block number | NEW-S42 (INV-S3 leaf) | Halmos + Fuzz | unmapped-new |
| §4.4 | `thresholdWeight` (via `updateStakeThreshold`) MUST be non-zero | NEW-S43 | Halmos | unmapped-new |
| §4.4 | `updateQuorum` MUST require `quorumDenominator != 0 ∧ quorumNumerator <= quorumDenominator` (the reference implementation also caps the denominator at `type(uint80).max` and packs both into one checkpoint) | NEW-S44 | Halmos | unmapped-new |
| §4.4 | Both gates MUST be checkpointed by block number and evaluated at the validation's `referenceBlock`, not current | NEW-S45 (INV-S4) | Halmos + Fuzz | unmapped-new — **suspicious** |
| §4.4 | Both setters MUST be admin-gated | NEW-S46 | Halmos | unmapped-new |
| §4.4 | The quorum-fraction denominator MUST be `getTotalPowerAt(referenceBlock)` (source total), not the enrolled-operator sum | NEW-S47 (INV-S4 / P4 aggregation) | Halmos + Fuzz | unmapped-new — **suspicious** |
| §4.4 | An implementation using a service-local enrolled-power denominator MUST document which its `validate` uses | — | n/a | gap: documentation |
| §4.5 s1 | Reject `signers.length != signatures.length` (`LengthMismatch`) and empty signer set (`InvalidLength`) | NEW-S48 (INV-S4) | Halmos | unmapped-new |
| §4.5 s2 / §4.6 | Reject `type(uint32).max` live sentinel; reject `referenceBlock >= block.number`; reject `block.number - referenceBlock > maxReferenceBlockAge` (`StaleReferenceBlock`) | NEW-S49 (INV-S4) | Halmos | unmapped-new — **suspicious** |
| §4.5 s3a | Reject unless `lastSigner < signers[i]` — strictly ascending (rejects duplicates) | NEW-S50 (INV-S4) | Halmos | unmapped-new |
| §4.5 s3b | Verify each `signers[i]` signed `digest` via `SignatureChecker`; reject on failure | NEW-S51 (INV-S4) | Halmos | unmapped-new |
| §4.5 s3c | Resolve the operator owning `signers[i]` at `referenceBlock`; reject if it resolves to `address(0)` | NEW-S52 (INV-S4) | Halmos | unmapped-new |
| §4.5 s3d | Reject unless that operator is currently registered; a since-deregistered signer MUST NOT count | NEW-S53 (INV-S4) | Halmos | unmapped-new — **suspicious** (live check vs past-block weight) |
| §4.5 s5 | Reject if `signedWeight < thresholdStake` (absolute) or `signedWeight * quorumDen < quorumNum * totalWeight` (fraction) | NEW-S54 (INV-S4) | Halmos | unmapped-new |
| §4.6 | `setMaxReferenceBlockAge(uint96)` MUST reject zero | NEW-S55 | Halmos | unmapped-new |
| §5 INV-S1 | `totalDelegatedStake == Σ credited snapshots`; `activeDelegationCount == their count`; callbacks decrement by the credited snapshot | NEW-S56 (INV-S1 aggregate of S4/S15/S18) | CVL/Fuzz + Halmos | unmapped-new |
| §5 INV-S2 | Every tracked commitment satisfies counterparty/arbiter/token/penalty binding at acceptance + allow-listed strategies | NEW-S57 (INV-S2 aggregate of S1/S7/S8/S9/S10) | Fuzz + Halmos | unmapped-new |
| §5 INV-S3 | At any block the `key→operator` checkpoint resolves a key to at most one operator | NEW-S58 (INV-S3 aggregate of S37/S41/S42) | Halmos + Fuzz | unmapped-new |
| §5 INV-S4 | A passing validate implies referenceBlock in-age, every counted signer's key resolved to a currently-registered operator at referenceBlock, and signedWeight meets threshold+quorum at referenceBlock | NEW-S59 (INV-S4 aggregate of S38/S49/S52/S53/S54) | Halmos | unmapped-new |
| §5 | All core INV-1..INV-10 hold; the services layer never mutates the manager ledger except through `withdraw` in `sweepForfeitProceeds` | INV-1..INV-10 + P0-FREE | CVL; Fuzz; Medusa | mapped |
| §Security | A service MUST compute its forfeitable surface from its own operator set's commitments; MUST NOT assume exclusive claim on backing | INV-3 (off-chain integrator guidance) | n/a | gap: off-chain double-count guidance (on-chain bound is core INV-3) |
| §Security | Services MUST treat the manager's commitment state, not the registry cache, as ground truth on disagreement | — | n/a | gap: off-chain consumer guidance |
| §Security | A handler acting on validated envelopes MUST enforce its own once-only semantics on `eventId` | — | n/a | gap: explicitly out of scope — handler-side dedupe |

---

## File 7 — `docs/standards/ERC-COMMITMENTS-MESH.md` (mesh topology + voting power, P4)

> The spec's own invariant IDs are `MESH-1..MESH-6`. No mesh clause maps to a
> `PROPERTIES.md` catalog ID; the `MESH-*` accounting clauses are
> `unmapped-new` (kept under their spec names).

| Clause ref (§) | MUST text (verbatim, normative core) | Property ID | Layer(s) | Status |
|---|---|---|---|---|
| §1 | A per-`stakeDenom` reward-token cap MUST exist (`MAX_REWARD_TOKENS`); `distributeRewards` MUST reject a token growing the set past the cap (`RewardTokenLimit`) | MESH-5 → NEW-X1/X3 — reward-token set per denom bounded; distribute reverts `RewardTokenLimit` | Fuzz/Halmos | unmapped-new |
| §1 | `MAX_DENOMS = 64` per TokenWeighting node; the set MUST be bounded; registering past the cap MUST revert `DenomCapReached` | MESH-5 → NEW-X2/X4 — registered-denom set ≤ MAX_DENOMS; register past cap reverts | Halmos/Fuzz | unmapped-new |
| §2 | Two distinct services MUST choose distinct labels or extend the derivation scheme | NEW-X7 | n/a | gap: naming convention, not on-chain-enforceable |
| §3.1 | Both `registerProvider` and `stake` MUST be manager-only | NEW-X10 — FanIn registerProvider/stake revert unless `msg.sender == manager` | Halmos | unmapped-new |
| §3.1 | Mesh stake MUST only be credited by a party that has verified real backing; MUST NOT infer provider from `msg.sender` | MESH-4 → NEW-X11/X12 — credited stake never exceeds verified backing; stake uses explicit provider param | Halmos/Fuzz | unmapped-new — **suspicious** |
| §3.1 | On `releaseStake` the provider MUST be derived from the stored output-source mapping for `denomOut`, not passed in | NEW-X13 — releaseStake derives provider from stored denomOut→source map | Halmos | unmapped-new |
| §3.2 | `portionBps` sum across outflows MUST be ≤ `10_000`; `setOutflows` MUST reject a set summing above (`InvalidPortionSum`) | MESH-2 — portion-sum bound | Fuzz/Halmos | unmapped-new |
| §3.2 | `setOutflows` MUST (separate rule) reject a set naming the same consumer twice (`DuplicateConsumer`) | MESH-3 (duplicate-consumer clause) | Fuzz/Halmos | unmapped-new |
| §3.2 | Exposure allocation MUST hold across all outflows for the same staker/denom: `totalForfeitable ≤ locked × inputMaxPenaltyBps / 10_000`; `setOutflows` and `stake` MUST each re-validate (`ExposureAllocationExceeded`) | MESH-1 (≙ core INV-3 generalized) | CVL (inductive) + Fuzz + Halmos | unmapped-new — **suspicious** |
| §3.3 | Implementations MUST reject `weightBps == 0` | NEW-X18 — updateWeight reverts on zero weight | Halmos | unmapped-new — **suspicious** (multiply overflow at high end) |
| §3.3 | `stake` into a retired denom MUST revert `DenomIsRetired` | NEW-X19 | Halmos | unmapped-new |
| §3.3 | Retirement MUST NOT change any historical `getVotingPowerAt` / `getTotalPowerAt` | MESH-6 (history immutability) | Halmos/Fuzz | unmapped-new — **suspicious** |
| §3.3 | `retireDenom` MUST revert `AlreadyRetired` on an already-retired denom | NEW-X20 | Halmos | unmapped-new |
| §3.4 | Custom nodes MUST still emit the events §2 requires, so clients can discover their denoms, providers, and consumers | NEW-X9 | n/a | gap: event-shape (indexer) |
| §Invariants MESH-1 | Exposure allocation across all outflows; a violation MUST revert `ExposureAllocationExceeded` | MESH-1 / INV-3 | CVL/Fuzz | unmapped-new |
| §Invariants MESH-3 | `releaseStake` MUST reject `amount > lien.amount` (`InsufficientLien`) | MESH-3 (lien conservation) | Fuzz/Halmos | unmapped-new |
| §Invariants MESH-6 | A weight retune or `retireDenom` MUST NOT change `getVotingPowerAt`/`getTotalPowerAt` for any block at/before the change | MESH-6 | Halmos/Fuzz | unmapped-new |

---

## Summary counts

Per file (distinct normative clause rows). "mapped" = references an existing
`PROPERTIES.md` catalog ID; "new" = a `NEW-*` placeholder proposed here; "gap" =
off-chain / event-shape / ABI-identity / storage-layout / documentation /
harness-existence clause with no on-chain state property (or SELECTORS' zero
clauses).

| File | Total MUSTs | mapped | new | gap |
|---|---|---|---|---|
| ERC-COMMITMENTS.md (core) | 62 | 24 | 20 | 18 |
| ERC-COMMITMENTS-AGREEMENTS.md | 33 | 11 | 19 | 3 |
| ERC-COMMITMENTS-MUTUALS.md | 45 | 17 | 28 | 0 |
| ERC-COMMITMENTS-REWARDS.md | 47 | 0 | 33 | 14 |
| ERC-COMMITMENTS-SELECTORS.md | 0 | 0 | 0 | 0 (see note) |
| ERC-COMMITMENTS-SERVICES.md | 63 | 12 | 39 | 12 |
| ERC-COMMITMENTS-MESH.md | 17 | 10 | 5 | 2 |
| **TOTAL** | **267** | **74** | **144** | **49** |

Caveats on the counts:
- Core-file totals are counted from the 62 distinct MUST-bearing rows in File 1
  (a single spec line can carry several MUSTs — e.g. §C.1's 8-way create
  validation is one row/one property `NEW-C22`; §D.5's caps table is one row).
  "mapped" counts rows whose Property ID is an existing catalog ID (INV-*,
  P0-FREE, P1-*, P2-*, P3-*); rows with a partial mapping (`INV-x + NEW-Cn`) are
  counted under "mapped" for the file total and flagged for split at merge.
- SERVICES "new = 39" is distinct `NEW-S#` ids (S1–S60 without S21 and S22,
  with the aggregate INV-S rows and several §-rows sharing one id
  de-duplicated).
- MESH is counted by row: `MESH-*` rows as mapped, `NEW-X*` rows as new.
- These counts should be re-tallied after deciding which `NEW-*` ids to
  promote and which partial rows to split.

---

## Suspicious list — deviate-risk clauses (verify these first)

Ordered by blast radius. Each is a clause where the implementation might
plausibly diverge from the spec text; these are the highest-value early targets.

**Ledger / custody core (P0):**
1. **§A.2 measured-delta deposit (NEW-C13)** — INV-1 under fee-on-transfer
   depends on crediting the *measured* delta, not `amount`. A credit-by-amount
   bug silently breaks the partition invariant.
2. **§A.2 / §A.7 free-balance withdrawability + CEI ordering (P0-FREE, NEW-C18)**
   — "no path locks free funds" and external-transfer-after-state-update; a
   reordering or an accidental lock is a direct P0-FREE violation.
3. **§A.7 reentrancy property (NEW-C17)** — verify the *property* (no
   state-mutating entry reachable reentrantly), not the transient-storage guard
   mechanism.

**Forfeit / movement (P1 / INV-4):**
4. **§C.3 pull-payment forfeit (P1-PULL)** — no `safeTransfer` on the
   `executeForfeit` path; liveness-critical (blacklist can't brick forfeit).
5. **§D.5 exposure-preserving shrink is diff-based, not recompute (INV-3, §D.5
   L772)** — the dust-drift defense; must be `exposure(post) − exposure(pre)`,
   never `units × maxPenaltyBps / 10_000`. Same footgun recurs in AGREEMENTS §5,
   MUTUALS §4 INV-G9.
6. **§D.5 distribute-site forfeit-pending guard (NEW-C41)** — scoped guard; an
   absent or mis-scoped guard lets value race out from under a pending forfeit.
7. **§C.1 create validation battery (NEW-C22)** — 8 distinct reverts; exhaustive
   symbolic coverage catches a missing bound (e.g. `maxPenaltyBps > 10_000`).
8. **§C.1 createAndFund validate-before-pull (NEW-C25)** — a validate-after-pull
   ordering bug loses funds on a bad-params revert.

**Agreements (P2 / INV-E1):**
9. **§3 atomic penalty validation across unresolved legs (NEW-A16)** — must
   validate all unresolved legs before mutating either, else a partial one-leg
   forfeit slips through.
10. **§5 cap-ratchet arithmetic (INV-E1)** — `cumulBefore + units > cap` on
    `uint128` without overflow/truncation; the `> uint128.max` guard must fire
    before the addition.
11. **§5 receiver-leg-untouched cross-token (NEW-A27 / INV-E2)** — settlement
    mutates only the payer leg; a cross-token bug decrementing the receiver leg
    breaks INV-E2.
12. **§3.1 unbond propagation vs. enforcement gating (NEW-A20/A21)** — the gate
    must distinguish enforcement calls (revert `UseAgreementPath`) from
    `requestUnbond` (propagate); over-broad blocks liveness, under-broad allows
    asymmetric single-leg forfeit.

**Mutuals (P2 — highest math risk):**
13. **§4 INV-G10 / INV-P9 two-clamp settle across multiple member commitments
    on one token** — the single most fragile cross-commitment accounting point;
    a missing/mis-ordered `min(owed, c.amount)` clamp lets one commitment's
    settle draw against another's encumbered units. Prime CVL target.
14. **§2.1 / §4 INV-G2 loss-index bump + unconditional 1e18 clamp** — verify the
    belt clamp is unconditional and `headroom` recomputed atomically with the
    write (rounding can nudge past 1e18).
15. **§6.2 / §4 INV-P2 premium-index rate + funding solvency** — Synthetix-style
    leftover-roll re-spread; the S6 rate-monotonicity check and the solvency
    check can disagree on the rounding boundary. Bounded Halmos (CVL times out).
16. **§4 INV-P1 pool partition (`totalMutualPremium`)** — the O(1) aggregate
    can desync from the per-mutual pool if any debit path bypasses the
    `LedgerLib` helper pair. Partition-drift risk.
17. **§2.1 / §4 INV-G9 several-liability decrement** — settle vs. release use
    *different* decrement formulas; a release path re-applying the bps-derived
    core-close decrement double-counts and breaks INV-3.

**Rewards (P4 — non-replay):**
18. **§3.2(4) / §7 INV-R1 cumulative non-replay (P4-MERKLE)** — the load-bearing
    check across multiple roots + CEI ordering; if `claimed` is written after
    the transfer, or the compare is `>` vs `>=`, a regressed root double-pays.
19. **§4.2 / §4.5 root-staging + updater-swap activation-delay** — off-by-one on
    the `>=`/`<` boundary, or reading `activationDelay` at submit-time vs
    claim-time, shrinks or eliminates the disable window.
20. **§3.2 / §9 `DistributionPaid` on the self-custody path** — easy to omit
    since the coordinator is never manager-called; verify `commitmentId==0`
    (INV-10) + `context==rootId` on every claim.

**Services (P4 — signature validation / delegation accounting):**
21. **§2.2 / §2.4 credited-snapshot decrement (NEW-S4/S15/S18)** — decrement by
    the *accept-time snapshot*, not the callback's runtime `amount`; forfeit
    removes the *full* amount, not the penalty portion. A naive subtract leaves
    phantom `totalDelegatedStake`.
22. **§4.5 s3d live-registration check amid past-block weight (NEW-S53)** — the
    load-bearing asymmetry: weight/key at `referenceBlock`, registration checked
    *live*. Pinning registration to referenceBlock reopens the
    deregistered-signer bypass for up to `maxReferenceBlockAge` blocks.
23. **§4.4 quorum denominator = source total at referenceBlock (NEW-S47/S45)** —
    must be `getTotalPowerAt(referenceBlock)` and read config at referenceBlock,
    not current; a current-block read lets a mid-flight config change retroact.
24. **§2.4 untracked-commitmentId silent no-op (NEW-S14)** — the manager fires
    for every counterparty-matching commitment; a registry that assumes it
    tracks every callback target can underflow or revert (liveness hazard).
25. **§2.8/§2.9 gates on the WithSig relayed path (NEW-S28/S3/S10)** — a common
    deviation is enforcing gates on the direct path but skipping the strategy
    allow-list or wiring check on the signature-relayed path.
26. **§4.3 signing-key PoP + uniqueness under rotation (NEW-S40/S41/S42)** —
    skipping the domain-separated proof-of-possession or the uniqueness check
    enables victim-key griefing; a stale one-direction checkpoint breaks INV-S3.

**Mesh (P4 — voting-power history):**
27. **§3.3 / MESH-6 accumulator/history immutability** — if weight epochs are a
    single mutable value rather than a checkpointed trace, a
    retire→reactivate→retire sequence retroactively rewrites `getVotingPowerAt`.
28. **§3.3 weightBps multiply overflow** — `weightBps` is deliberately uncapped;
    the "reject `weightBps == 0`" guard covers only the low end, not
    `rawStake × weightBps` overflow for a 1e18-scaled token.

---

## Merge notes (PROPERTIES.md reconciliation)

- **Catalog gaps to fill in `PROPERTIES.md`:** INV-6 (`¬(released ∧ forfeited)`)
  and INV-8 (single pending unbond) are named in the core spec's §Invariants but
  have no standalone P0/P1 row in `PROPERTIES.md`. The MUTUALS `INV-G1/G4/G5/G7/
  G8/G9/G10` and `INV-P0/P1/P2/P5/P6/P8/P10/P11/P14` and the SERVICES
  `INV-S1/S2/S3/S4` and MESH `MESH-1..MESH-6` are spec-named invariant IDs the
  catalog does not yet list — promote the ones worth proving to real rows.
- **Partial-mapping rows** (Property ID `INV-x + NEW-Cn`) should be split into
  two catalog rows at merge, so each property has one status.
- **Gap taxonomy:** the 49 gap rows fall into: event-shape/topic0 (indexer),
  ABI/selector identity (SELECTORS-pinned), storage-layout (owned by
  `StorageSlots.t.sol`), off-chain integrator/party/handler guidance,
  documentation/versioning discipline, deployment-side token screening, and
  harness-existence requirements. None is an on-chain state property, so all are
  correctly out of formal-proof scope — but the
  event-emission ones (`DistributionPaid`, the three decrement events) are
  worth a note that the indexer test-suite, not the prover, owns them.

## Suspicious-clause verification notes

Self-reviewed against the implementation (item numbers from the list above):

| # | Verdict | Evidence |
|---|---|---|
| 1 | ✓ conforms | `MeasuredPull.pull` (via `LedgerOpsLib.deposit`) credits measured balance delta; zero-delta reverts |
| 2 | ✓ conforms | `withdrawCore` is CEI: ledger + aggregate updated before `safeTransfer` (explicit comment, L88-92) |
| 4 | ✓ conforms | `executeForfeit` §C.3 step 2 is `LedgerLib.forfeitTransfer` (pure ledger); CVL rule P1-PULL authored |
| 5 | ✓ conforms | `MovementLib._applyFromEncumbered` shrink is `expPre − expPost` diff with drift clamp (L353-361) |
| 6 | ✓ conforms | distribute-site guard checks live proposal (`initiatedAt != 0 && !cancelled && !executed`, L342-345) |
| 8 | ✓ conforms | `createAndFundCore` validates BEFORE the `LedgerOpsLib.deposit` pull |
| 9 | ✓ conforms | `AgreementLib.forfeitCore` validates every unresolved leg's penalty before mutating either (L355-358) |
| 10 | ✓ conforms | `_settleCore` rejects `units > uint128.max` before the cast; `_settleApplyCap` adds in uint128 after |
| 11 | ✓ strengthened | INV-E2 receiver-leg-untouched asserts added to `AgreementFlows.spec` settle rule |
| 13 | ✓ conforms | both clamps present, ordered, pre-mutation: Belt-1 `owed=min(owed,remaining)` L332, Belt-2 `min(owed,c.amount)` L336; Belt-1 Halmos-verified (INV-G6) |
| 14 | ✓ conforms + Halmos | `applied = min(L, headroom)` clamp; Λ ≤ 1e18 Halmos-verified (INV-G2) |
| 15 | bounded coverage | premium-index rate monotonicity Halmos-verified within bounds (P2-MONO); rounding-boundary CVL deferred |

Items 3 (full reentrancy parametric), 7 (complete 8-revert create battery), 12
(unbond-propagation gating) remain covered by authored-not-yet-proved CVL or
partial Halmos; they stay on the merge checklist.
