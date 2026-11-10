---
title: CounterpartyPremiumStream
status: generated
source: src/distributions/CounterpartyPremiumStream.sol
generated: true
---
# CounterpartyPremiumStream
**Inherits:**
[StrategyBase](/docs/protocol/reference/contracts/distributions/StrategyBase), ReentrancyGuardTransient

**Title:**
CounterpartyPremiumStream

A pay-as-you-go premium the commitment's COUNTERPARTY (the insured) streams to the
COMMITTER (the underwriter, who has locked forfeitable backing as coverage). This is
the missing insured→underwriter value direction: the two shipped reference strategies
(`FlatFeeAtCreate`, `IndexAppreciationYield`) both carve value out of the committer's
encumbered backing and pay it TO the counterparty, so single-commitment coverage had
no way to route a premium the other way.

The manager's movement pipeline (ERC §D.5) can never source value FROM the counterparty —
every `MovementKind` sources from `committer.encumbered` or the strategy's own escrow, and
the counterparty is a recipient-only party. A counterparty-funded flow therefore MUST use
the self-custody shape (§D "Strategies MAY expose additional surfaces", same as
`FlatFeeAtCreate`): the counterparty deposits premium into THIS contract via `fundPremium`,
the balance streams to the committer at a fixed rate, and payouts are served directly from
this contract's balance — `claim` returns no movements and emits `DistributionPaid` itself
(§D.7). Nothing here touches the manager's ledger or escrow.
Accrual model: premium accrues linearly at `ratePerSecond` (set at binding via
`strategyParams`) from the binding timestamp, capped by (a) the counterparty's cumulative
deposits and (b) the commitment's close time — the stream freezes the instant the
commitment is released or forfeited. The close time is read live from
`manager.closedAt(id)` rather than captured in a guarded lifecycle hook, so a parked
(reverted-and-skipped, §D.6) hook can never leave the stream running past close. The
counterparty caps their total exposure purely by how much they fund; unstreamed premium is
recoverable via `reclaimUnstreamed` once the policy has ended.


## State Variables
### streamOf

```solidity
mapping(uint256 commitmentId => Stream) public streamOf
```


## Functions
### constructor


```solidity
constructor(address manager_) StrategyBase(manager_);
```

### fundPremium

Deposit `amount` of premium for `commitmentId`, streaming to the committer. Only the
commitment's counterparty (the insured) may fund — the reclaim path refunds the
counterparty, so allowing arbitrary funders would misattribute the refund. Pulls the
measured balance delta (fee-on-transfer safe, same rule as `manager.deposit`).


```solidity
function fundPremium(uint256 commitmentId, uint256 amount) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The commitment whose premium stream is topped up.|
|`amount`|`uint256`|Premium units to add, in the commitment's backing token.|


### reclaimUnstreamed

After the policy has ended (commitment released/forfeited), return the premium that
never streamed to the committer back to the counterparty. Callable only once the
commitment is closed, so the frozen accrual is final and the committer's claimable
balance is fully preserved.


```solidity
function reclaimUnstreamed(uint256 commitmentId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|The ended commitment to reclaim unstreamed premium from.|


### earnedOf

Premium accrued to the committer for `commitmentId` as of now (or the close time if
the commitment has ended), capped by the counterparty's cumulative deposits.


```solidity
function earnedOf(uint256 commitmentId) external view returns (uint256);
```

### reclaimableOf

Premium the counterparty could recover right now, were the commitment closed at this
instant (funded minus accrued). Advisory while the stream is still active.


```solidity
function reclaimableOf(uint256 commitmentId) external view returns (uint256);
```

### onCommitmentCreated

Manager-only. Strategy initializes any per-commitment state and registers the
commitment as bound. MUST revert if the strategy cannot operate against
`ctx.base.adapter` / `ctx.base.token` (the compatibility-refusal mechanism).
Reverts abort commitment creation (NOT guarded — ERC §C.1).

`strategyParams` is `abi.encode(uint256 ratePerSecond)` in backing-token units/second.
A zero rate binds a dormant stream (no premium accrues) rather than reverting, mirroring
`FlatFeeAtCreate`'s zero-fee no-op.


```solidity
function onCommitmentCreated(CreatedContext calldata ctx) external onlyManager;
```

### claim

Caller-validated claim over the manager-mediated payout path. `claimData` is
strategy-specific (empty / merkle proof / signed envelope / reclaim flag / ...).
Self-custody strategies MAY return an empty array and serve claims on their own
surface instead. Allowed kinds: FromEscrowToExternal, FromEscrowToFree.

The committer collects streamed premium, paid directly from this contract's balance
(self-custody payout, §D.7 `DistributionPaid` emitted here). Works in any commitment
state — earned-but-unclaimed premium remains collectible after the policy ends.


```solidity
function claim(ClaimContext calldata ctx, bytes calldata)
    external
    onlyManager
    nonReentrant
    returns (TokenMovement[] memory);
```

### pending

Pending amount claimable by the implied recipient.


```solidity
function pending(ClaimContext calldata ctx, bytes calldata) external view returns (uint256);
```

### _earned

Premium accrued to the committer by `endTime`: `ratePerSecond * elapsed`, capped by the
counterparty's cumulative deposits. `endTime` is either now or the commitment's close.
Saturates at `funded` before multiplying, so an unbounded committer-chosen rate cannot
overflow.


```solidity
function _earned(Stream storage st, uint64 endTime) internal view returns (uint256);
```

### _endTimestamp

The timestamp accrual is measured to: the commitment's close time if it has ended,
otherwise now. Sourced live from the manager so a parked lifecycle hook cannot leave
the stream accruing past close.


```solidity
function _endTimestamp(uint256 commitmentId) internal view returns (uint64);
```

## Events
### PremiumFunded
The counterparty deposited `amount` of premium for `commitmentId` (pulled from `funder`).


```solidity
event PremiumFunded(uint256 indexed commitmentId, address indexed funder, uint256 amount);
```

### PremiumReclaimed
Unstreamed premium was returned to the counterparty after the policy ended.


```solidity
event PremiumReclaimed(uint256 indexed commitmentId, address indexed counterparty, uint256 amount);
```

## Errors
### StreamEnded

```solidity
error StreamEnded();
```

### StreamActive

```solidity
error StreamActive();
```

## Structs
### Stream

```solidity
struct Stream {
    uint256 ratePerSecond;
    uint256 funded;
    uint256 claimed;
    address token;
    address counterparty;
    uint64 startTime;
    bool bound;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`ratePerSecond`|`uint256`|Premium units (backing-token) accruing to the committer per second.|
|`funded`|`uint256`|Cumulative premium the counterparty has deposited for this commitment.|
|`claimed`|`uint256`|Cumulative premium already paid out to the committer.|
|`token`|`address`|Backing token of the commitment (the premium is paid in the same token).|
|`counterparty`|`address`|The commitment's counterparty (the insured), who funds and reclaims.|
|`startTime`|`uint64`|Binding timestamp; accrual is measured from here.|
|`bound`|`bool`|Set once at binding; distinguishes a real (possibly zero-rate) stream from an unbound id.|
