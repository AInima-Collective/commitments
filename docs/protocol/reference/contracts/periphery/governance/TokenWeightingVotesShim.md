---
title: TokenWeightingVotesShim
status: generated
source: src/periphery/governance/TokenWeightingVotesShim.sol
generated: true
---
# TokenWeightingVotesShim
**Inherits:**
IERC5805

**Title:**
TokenWeightingVotesShim

Stateless adapter that exposes an IVotingPowerSource as IERC5805 so it
can drive an OpenZeppelin Governor without forcing the underlying source
to implement the full IVotes delegation surface.
The Governor + GovernorVotes + GovernorVotesQuorumFraction modules only
ever read four IERC5805 methods: clock(), CLOCK_MODE(), getPastVotes,
getPastTotalSupply. delegate(), delegates() and delegateBySig() are part
of the IVotes UX surface and are never invoked by the Governor itself.
This shim forwards the four read methods to IVotingPowerSource and
reverts the delegation methods (with a self-delegation identity for
delegates() so Tally and other tooling render correctly).
Block-based clock — TokenWeighting checkpoints are keyed by block.number
(OZ Checkpoints.Trace208), so clock() returns block.number (cast to
uint48 per ERC-6372) and CLOCK_MODE returns "mode=blocknumber".
The source is immutable. A Governor stores its token in initializer
storage, so upgrading the Governor implementation does not re-bind it;
using a different source means deploying a new DAO.


## State Variables
### source
The voting-power source this shim wraps. Immutable by design.


```solidity
IVotingPowerSource public immutable source
```


## Functions
### constructor


```solidity
constructor(IVotingPowerSource source_) ;
```

### clock

Clock used for flagging checkpoints. Can be overridden to implement timestamp based checkpoints (and voting).


```solidity
function clock() external view returns (uint48);
```

### CLOCK_MODE

Description of the clock


```solidity
function CLOCK_MODE() external pure returns (string memory);
```

### getVotes

Returns the current amount of votes that `account` has.


```solidity
function getVotes(address account) external view returns (uint256);
```

### getPastVotes

Returns the amount of votes that `account` had at a specific moment in the past. If the `clock()` is
configured to use block numbers, this will return the value at the end of the corresponding block.


```solidity
function getPastVotes(address account, uint256 timepoint) external view returns (uint256);
```

### getPastTotalSupply

Returns the total supply of votes available at a specific moment in the past. If the `clock()` is
configured to use block numbers, this will return the value at the end of the corresponding block.
NOTE: This value is the sum of all available votes, which is not necessarily the sum of all delegated votes.
Votes that have not been delegated are still part of total supply, even though they would not participate in a
vote.


```solidity
function getPastTotalSupply(uint256 timepoint) external view returns (uint256);
```

### delegates

Self-delegation identity. There is no delegation in this shim — voting
power is read directly from the underlying source — but tooling
(e.g. Tally) calls this view and expects a non-zero answer to render.


```solidity
function delegates(address account) external pure returns (address);
```

### delegate

Reverts. Delegation is not supported by this shim.


```solidity
function delegate(address) external pure;
```

### delegateBySig

Reverts. Delegation is not supported by this shim.


```solidity
function delegateBySig(address, uint256, uint256, uint8, bytes32, bytes32) external pure;
```

## Errors
### DelegationNotSupported
Thrown when delegate() or delegateBySig() is called. Delegation is
handled by the underlying voting-power source, not by this shim.


```solidity
error DelegationNotSupported();
```
