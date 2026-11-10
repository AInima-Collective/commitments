---
title: ArbiterBase
status: generated
source: src/shared/arbitration/ArbiterBase.sol
generated: true
---
# ArbiterBase
**Inherits:**
[IArbiter](/docs/protocol/reference/contracts/shared/arbitration/interfaces/IArbiter)

**Title:**
ArbiterBase

Shared scaffolding for arbiters: the immutable manager binding, the {IArbiter}
introspection that does not vary, and the errors and predicate the forfeit-driving
arbiters share.


## State Variables
### manager
CommitmentManager this arbiter dispatches to. Immutable, so a commitment that names
this arbiter can rely on the manager binding never changing.


```solidity
ICommitmentManager public immutable manager
```


## Functions
### constructor


```solidity
constructor(address manager_) ;
```

### commitmentManager

Returns the CommitmentManager this arbiter dispatches to.

Implementations should make this immutable to preserve the trust
model commitments opt into when naming this contract as arbiter.


```solidity
function commitmentManager() external view returns (address);
```

### supportsInterface

Returns true if this contract implements the interface defined by
`interfaceId`. See the corresponding
https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
to learn more about how these ids are created.
This function call must use less than 30 000 gas.


```solidity
function supportsInterface(bytes4 interfaceId) external pure returns (bool);
```

### _forfeitProposalActive

A forfeit proposal that was initiated and is neither executed nor cancelled.


```solidity
function _forfeitProposalActive(ICommitmentManager.ForfeitProposal memory p) internal pure returns (bool);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### WrongArbiter

```solidity
error WrongArbiter(address expected, address actual);
```

### CommitmentNotActive

```solidity
error CommitmentNotActive(uint256 commitmentId);
```

### ChallengeWindowTooShort

```solidity
error ChallengeWindowTooShort(uint64 required, uint64 actual);
```
