---
title: ArbiterCapabilities
status: generated
source: src/shared/arbitration/ArbiterCapabilities.sol
generated: true
---
# ArbiterCapabilities
**Title:**
ArbiterCapabilities

Named bits for the {IArbiter} `arbiterCapabilities()` bitmap. Each
bit corresponds to a `CommitmentManager` action an arbiter can
dispatch. A caller introspecting an arbiter tests capabilities with
[has](/docs/protocol/reference/contracts/shared/arbitration/ArbiterCapabilities#has) before opting into (or requiring) a given power.

Bits are stable and append-only — new capabilities take the next free
bit; existing assignments never move, so a stored/declared bitmap keeps
its meaning across releases. `pure`, no storage, zero deployment cost
(fully inlined).


## State Variables
### NONE
No capabilities (a pure marker / discovery-only arbiter).


```solidity
uint256 internal constant NONE = 0
```


### INITIATE_FORFEIT
Can open a forfeit proposal — `initiateForfeit(id, penaltyBps)`.


```solidity
uint256 internal constant INITIATE_FORFEIT = 1 << 0
```


### CANCEL_FORFEIT
Can cancel a pending forfeit — `cancelForfeit(id)`.


```solidity
uint256 internal constant CANCEL_FORFEIT = 1 << 1
```


### RELEASE_COMMITMENT
Can release a commitment early — `releaseCommitment(id)`.


```solidity
uint256 internal constant RELEASE_COMMITMENT = 1 << 2
```


### FORFEIT_AGREEMENT
Can forfeit both legs of an agreement — `forfeitAgreement(id, bps)`.


```solidity
uint256 internal constant FORFEIT_AGREEMENT = 1 << 3
```


### RELEASE_AGREEMENT
Can release both legs of an agreement — `releaseAgreement(id)`.


```solidity
uint256 internal constant RELEASE_AGREEMENT = 1 << 4
```


### SETTLE_AGREEMENT
Can perform a bilateral settle within an agreement's flow caps —
`settleAgreement(id, fromProposer, units, evidenceHash)`.


```solidity
uint256 internal constant SETTLE_AGREEMENT = 1 << 5
```


### MUTUAL_LOSS
Can declare / activate a mutual loss — the arbiter drives the
mutual's optimistic loss lifecycle and the manager credits the
several-liability loss index Λ.


```solidity
uint256 internal constant MUTUAL_LOSS = 1 << 6
```


## Functions
### has

Returns true iff `caps` has every bit in `mask` set. Passing a
single capability bit tests that one power; passing a combined
mask tests that all of them are present.


```solidity
function has(uint256 caps, uint256 mask) internal pure returns (bool);
```
