---
title: PremiumScheduler
status: generated
source: src/extensions/mutuals/PremiumScheduler.sol
generated: true
---
# PremiumScheduler
**Inherits:**
Ownable2Step

**Title:**
PremiumScheduler

The pricing brain for a Mutual's premium stream. Off the audited custody
path: the core (`fundMutualPremium`) is pricing-agnostic and only sets a future rate; all
pricing discretion lives here, under the `owner` (the pricing authority).
Pricing is a two-slope kinked utilization curve on the **demand/supply** axis —
`u = activeNotionalSold / activeCover` — so when underwriters flee (cover shrinks) the
per-unit price RISES, retaining capacity. The curve is monotone non-decreasing in `u` by
construction (all slopes are unsigned), so capacity flight can only raise price.

Fixed-point convention (documented precisely, asserted by the `PremiumPolicy` test suite):
- `u` (utilization) is a WAD fraction (1e18 == 100%): `u = activeNotionalSold * 1e18 / activeCover`.
- `base`, `slope1`, `slope2` are ANNUALIZED rate fractions in WAD (e.g. 0.02e18 == 2%/yr).
- `kink` is a WAD utilization fraction (e.g. 0.8e18 == 80%).
- `rate(u) = base + slope1 * min(u, kink) / 1e18 + slope2 * max(0, u - kink) / 1e18`  (WAD/yr).
- `premium = notional * rate(u) / 1e18 * duration / SECONDS_PER_YEAR`  (numeraire units).
The premium is the integral of `notional * rate / year` over `duration` seconds at a flat
rate; it funds the Synthetix stream the core runs for exactly that `duration`.


## State Variables
### SECONDS_PER_YEAR
Seconds in a 365-day year — annualization base for the rate.


```solidity
uint256 internal constant SECONDS_PER_YEAR = 365 days
```


### manager
The custody root the priced stream funds.


```solidity
ICommitmentManager public immutable manager
```


### policy
The cover-binding ledger (utilization numerator). Set once by the owner after deploy
to break the policy<->scheduler construction cycle.


```solidity
ILinkedMutualPolicy public policy
```


### _defaultCurve
Global default curve, used for any mutual without a per-mutual override.


```solidity
CurveParams private _defaultCurve
```


### _mutualCurve
mutualId => per-mutual curve override.


```solidity
mapping(uint256 => CurveParams) private _mutualCurve
```


## Functions
### constructor


```solidity
constructor(address manager_, address owner_) Ownable(owner_);
```

### setPolicy

Wire the LinkedMutualPolicy whose `activeNotionalSold` feeds the utilization curve.


```solidity
function setPolicy(address policy_) external onlyOwner;
```

### setDefaultCurve

Set the global default curve used for mutuals without an override.


```solidity
function setDefaultCurve(uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps)
    external
    onlyOwner;
```

### setMutualCurve

Set a per-mutual curve override (takes precedence over the default for that mutual).


```solidity
function setMutualCurve(
    uint256 mutualId,
    uint256 base,
    uint256 slope1,
    uint256 slope2,
    uint256 kink,
    uint256 maxLeverageBps
) external onlyOwner;
```

### curveFor

The curve in force for `mutualId` (per-mutual override if set, else the default).


```solidity
function curveFor(uint256 mutualId) public view returns (CurveParams memory);
```

### quote

Price `notional` of cover for `duration` seconds against the mutual's current
utilization. Enforces the MCR/leverage cap — reverts `LeverageCapExceeded` when
`activeNotionalSold + notional > maxLeverageBps * activeCover / 1e4` (the cap the core
never enforces). The leverage check runs first, so `activeCover == 0` reverts the cap
before any division by `activeCover`.


```solidity
function quote(uint256 mutualId, uint256 notional, uint64 duration) public view returns (uint256 premiumAmount);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`mutualId`|`uint256`|the backing Mutual|
|`notional`|`uint256`|cover notional being bound (numeraire units)|
|`duration`|`uint64`|stream length in seconds|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`premiumAmount`|`uint256`|numeraire premium that funds the stream for `duration`|


### quoteStandby

Price the STANDBY reservation fee on offered-but-unallocated cover
(`activeCover - activeNotionalSold`) for `duration`. Funds the EXISTING `Pi` stream —
no new core index. Priced at the same curve rate as live cover; returns 0 when there
is no unallocated cover (caller should treat 0 as "nothing to reserve").


```solidity
function quoteStandby(uint256 mutualId, uint64 duration) public view returns (uint256 premiumAmount);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`mutualId`|`uint256`|the backing Mutual|
|`duration`|`uint64`|stream length in seconds|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`premiumAmount`|`uint256`|numeraire reservation fee (0 if no standby capacity)|


### _rate

`rate(u) = base + slope1*min(u,kink)/1e18 + slope2*max(0,u-kink)/1e18` (WAD/yr).


```solidity
function _rate(CurveParams memory c, uint256 u) internal pure returns (uint256);
```

### _premium

`premium = notional * rate(u)/1e18 * duration / SECONDS_PER_YEAR`.


```solidity
function _premium(CurveParams memory c, uint256 u, uint256 notional, uint64 duration)
    internal
    pure
    returns (uint256);
```

### _activeNotionalSold

Read the utilization numerator. Reverts `PolicyUnset` until `setPolicy` has run.


```solidity
function _activeNotionalSold(uint256 mutualId) internal view returns (uint256);
```

### _validateCurve

Reject nonsensical curve params. Slopes are unsigned so monotonicity is automatic; we
only bound `kink <= WAD` (utilization is a fraction) and require a nonzero leverage cap.


```solidity
function _validateCurve(uint256 kink, uint256 maxLeverageBps) internal pure;
```

## Events
### PolicySet

```solidity
event PolicySet(address indexed policy);
```

### DefaultCurveSet

```solidity
event DefaultCurveSet(uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps);
```

### MutualCurveSet

```solidity
event MutualCurveSet(
    uint256 indexed mutualId, uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps
);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### PolicyUnset

```solidity
error PolicyUnset();
```

### InvalidCurve

```solidity
error InvalidCurve();
```

### LeverageCapExceeded

```solidity
error LeverageCapExceeded(uint256 wouldBeSold, uint256 cap);
```

## Structs
### CurveParams
Two-slope kinked utilization-curve parameters plus the MCR/leverage cap.

`set` distinguishes a configured per-mutual override from the global default.


```solidity
struct CurveParams {
    uint256 base; // WAD/yr at u == 0
    uint256 slope1; // WAD/yr slope below the kink
    uint256 slope2; // WAD/yr slope above the kink
    uint256 kink; // WAD utilization at which the slope steepens
    uint256 maxLeverageBps; // cap: activeNotionalSold + notional <= maxLeverageBps * activeCover / 1e4
    bool set; // true once a per-mutual override is written
}
```
