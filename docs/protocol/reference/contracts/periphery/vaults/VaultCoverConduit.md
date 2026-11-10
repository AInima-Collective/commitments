---
title: VaultCoverConduit
status: generated
source: src/periphery/vaults/VaultCoverConduit.sol
generated: true
---
# VaultCoverConduit
**Inherits:**
ReentrancyGuardTransient

**Title:**
VaultCoverConduit

The vault's keyless policyholder-of-record in the underwritten-vault pattern
(use-cases/agent-bonds.md): it turns the premium share skimmed from the vault's own
yield (pushed here in the underlying by a `PremiumSkimStrategy`) into funding for the
mutual's premium stream, so EVERY deposit into the vault is ambient-covered — no
depositor ever buys cover individually.
Why `fundStandby` and not `bindCover`: mutual loss coverage is STRUCTURAL — a validated
loss marks down member commitments regardless of any recorded notional (the arbiter's
binding snapshot is auditability only, never a settlement gate) — so a notional binding
would buy the vault nothing enforceable, while ratcheting `activeNotionalSold` (there is
no early un-bind) and distorting the scheduler's utilization price. Standby funding is
the exact fit: the vault pays the underwriters' reservation fee on the pool's
offered-but-unallocated capacity.
`poke()` is permissionless and skips rather than reverts when there is nothing to fund
(dust, no budget, no underwriters, no standby capacity, a duration under the floor). It
does revert when the vault refuses the deposit leg (deposits paused, or over the
strategy's cap), even if a share budget is already waiting.
When `activeCover == 0` (no underwriters) premium accrual pauses and funds pool up
here; members that later join are paid from the backlog on the next poke. Note the
members remain slashable throughout — a premium-stream lapse pauses underwriter pay,
never the cover itself.
Funding math: the budget (this contract's vault-share balance, after depositing any
underlying it holds) is converted to a stream duration by inverting the scheduler's
quote, which is linear in duration: `duration = budget · 1y / quoteStandby(1y)`. While
a stream is live the duration is clamped to the remaining stream time, which makes the
core's `PremiumRateDecreased` guard unreachable (adding premium over ≤ the remaining
window can only raise the rate). Floor rounding keeps `premium ≤ budget` always.
No admin, no owner: the immutable (vault, policy, mutualId) triple is the whole trust
surface, mirroring `ForfeitDonationBeneficiary`.


## State Variables
### ONE_YEAR
Scheduler quote horizon used for the budget→duration inversion.


```solidity
uint64 internal constant ONE_YEAR = 365 days
```


### manager
The custody root running the mutual's premium stream.


```solidity
ICommitmentManager public immutable manager
```


### vault
The covered vault; also the mutual's numeraire token (shares).


```solidity
ICommitmentsVault public immutable vault
```


### asset
The vault's underlying asset (what the skim strategy pushes here).


```solidity
IERC20 public immutable asset
```


### policy
The premium policy this conduit funds standby through.


```solidity
LinkedMutualPolicy public immutable policy
```


### scheduler
The pricing scheduler behind `policy` (read for the duration inversion).


```solidity
PremiumScheduler public immutable scheduler
```


### mutualId
The mutual whose underwriters cover the vault.


```solidity
uint256 public immutable mutualId
```


### maxStreamDuration
Cap on a single poke's stream duration, so one thin poke never locks a
year-long stream (later pokes can only raise a live rate).


```solidity
uint64 public immutable maxStreamDuration
```


### minFundAssets
Underlying-balance dust floor below which a poke skips the vault deposit.


```solidity
uint256 public immutable minFundAssets
```


## Functions
### constructor


```solidity
constructor(address vault_, address policy_, uint256 mutualId_, uint64 maxStreamDuration_, uint256 minFundAssets_) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`vault_`|`address`|The covered `CommitmentsVault`.|
|`policy_`|`address`|The `LinkedMutualPolicy` fronting the mutual's premium stream.|
|`mutualId_`|`uint256`|The covering mutual; MUST already be registered with `numeraire == vault_` (checked here).|
|`maxStreamDuration_`|`uint64`|Per-poke stream-duration cap (≥ the core's 1-minute floor).|
|`minFundAssets_`|`uint256`|Underlying dust floor for the deposit leg.|


### poke

Permissionlessly advance the funding pipeline: deposit any skimmed underlying into
the vault (shares mint to this contract — dilution-neutral), then convert the whole
share budget into a standby premium stream for the mutual. Skips (returns zeros)
whenever a step has nothing to do: dust balance, no budget, no underwriters, no
standby capacity, or a duration below the core's stream floor.


```solidity
function poke() external nonReentrant returns (uint256 premium, uint64 duration);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`premium`|`uint256`|Numeraire (share) premium pulled into the stream this poke.|
|`duration`|`uint64`|Stream duration funded this poke.|


### _durationFor

Invert the scheduler's linear-in-duration standby quote into the longest stream the
budget can pay, clamped to the live stream's remaining window (rate-guard safety), the
per-poke cap, and the core's floor. Returns 0 to signal "skip".


```solidity
function _durationFor(uint256 budget) internal view returns (uint64);
```

## Events
### PremiumFunded
A poke funded the mutual's premium stream.


```solidity
event PremiumFunded(uint256 indexed mutualId, uint256 premium, uint64 duration);
```

## Errors
### NumeraireMismatch
The mutual's numeraire must be the vault's own shares — the conduit pays premium
in shares minted from the skimmed underlying.


```solidity
error NumeraireMismatch(address numeraire, address vault);
```

### ZeroAddress

```solidity
error ZeroAddress();
```

### DurationBelowStreamFloor
`maxStreamDuration_` below the core's 1-minute stream floor can never fund.


```solidity
error DurationBelowStreamFloor();
```
