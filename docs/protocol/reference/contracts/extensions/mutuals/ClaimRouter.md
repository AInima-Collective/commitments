---
title: ClaimRouter
status: generated
source: src/extensions/mutuals/ClaimRouter.sol
generated: true
---
# ClaimRouter
**Inherits:**
ReentrancyGuardTransient

**Title:**
ClaimRouter

The beneficiary of a Mutual. Settled member units land
in this contract's FREE balance in the manager; the designated `claimant` (policyholder)
collects them out. Settlement itself is permissionless — anyone (the claimant, a keeper,
a bounty bot) can call the manager's `settleMembers` — so the O(N) physical movement of a claim can never
brick on a single uncooperative member (ERC-COMMITMENTS-MUTUALS).

Default product is **basket settlement**: the claimant receives the members' raw collateral
tokens as-is. A swap to a single unit is an explicit, opt-in step the claimant performs
after collection — the router never swaps.


## State Variables
### manager
The custody root whose mutual settlements credit this router.


```solidity
ICommitmentManager public immutable manager
```


### claimant
The address entitled to collect the settled basket (the policyholder).


```solidity
address public immutable claimant
```


## Functions
### constructor


```solidity
constructor(address manager_, address claimant_) ;
```

### collect

Collect this router's full free balance of `token` to `to` (claimant only). A
heterogeneous basket is collected one token at a time.


```solidity
function collect(address token, address to) public nonReentrant returns (uint256 amount);
```

### settleAndCollect

Settle the given members, then collect `token` to `to` (claimant only).


```solidity
function settleAndCollect(uint256[] calldata commitmentIds, address token, address to)
    external
    returns (uint256 amount);
```

## Events
### Settled

```solidity
event Settled(uint256 indexed count);
```

### Collected

```solidity
event Collected(address indexed token, address indexed to, uint256 amount);
```

## Errors
### NotClaimant

```solidity
error NotClaimant();
```

### ZeroAddress

```solidity
error ZeroAddress();
```
