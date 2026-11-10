---
title: GovernorFactory
status: generated
source: src/periphery/governance/GovernorFactory.sol
generated: true
---
# GovernorFactory
**Title:**
GovernorFactory

Deploys complete DAO suites (Governor proxy + Timelock clone + Votes shim)
bound to a specific IVotingPowerSource. Mirrors MeshFactory and VaultFactory
in shape.
Per-deployment topology:
- The shim is freshly deployed (raw `new`, stateless, immutable source).
- The Timelock is an EIP-1167 clone of `timelockImpl` (non-upgradeable
by design — replacing the timelock means redeploying the DAO).
- The Governor is an ERC-1967 proxy pointing at `governorImpl` (UUPS
upgradeable through onlyGovernance — the DAO can replace its own
implementation via a successful, queued, timelock-delayed proposal).
At deploy time the factory grants the Governor PROPOSER_ROLE +
CANCELLER_ROLE on the Timelock and grants EXECUTOR_ROLE to address(0)
(open execution); the factory then renounces its own admin so the
Timelock self-administers from that point forward.


## State Variables
### governorImpl
The Governor implementation pointed at by every ERC-1967 proxy this factory deploys.


```solidity
address public immutable governorImpl
```


### timelockImpl
The Timelock implementation cloned for every DAO this factory deploys.


```solidity
address public immutable timelockImpl
```


### deployer
The account that deployed this factory; the only caller of `setCanonicalGovernor`.


```solidity
address public immutable deployer
```


### _deployed
governors deployed by this factory; `setCanonicalGovernor` accepts only these.


```solidity
mapping(address governor => bool) private _deployed
```


### _canonicalGovernor
the canonical / reference DAO address (the protocol's own).
Set at most once via setCanonicalGovernor() and indexed
downstream. Zero until set.


```solidity
address private _canonicalGovernor
```


## Functions
### constructor


```solidity
constructor(address governorImpl_, address timelockImpl_) ;
```

### deploy

Deploy a new DAO suite (non-deterministic addresses).


```solidity
function deploy(DAOConfig calldata cfg) external returns (DAODeployment memory dao);
```

### setCanonicalGovernor

Mark a previously-deployed governor as the canonical / reference DAO.
Set-once, and only by the factory's `deployer`: `deploy` is permissionless,
so an open setter would let anyone claim the slot with a junk DAO.


```solidity
function setCanonicalGovernor(address governor) external;
```

### canonicalGovernor


```solidity
function canonicalGovernor() external view returns (address);
```

## Events
### GovernorDeployed

```solidity
event GovernorDeployed(
    address indexed governor, address indexed timelock, address indexed shim, address source, string name
);
```

### CanonicalGovernorSet

```solidity
event CanonicalGovernorSet(address indexed governor);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### CanonicalAlreadySet

```solidity
error CanonicalAlreadySet();
```

### UnknownGovernor

```solidity
error UnknownGovernor();
```

### NotDeployer

```solidity
error NotDeployer();
```

## Structs
### DAOConfig

```solidity
struct DAOConfig {
    string name;
    IVotingPowerSource source;
    uint256 timelockMinDelay; // seconds
    uint48 votingDelay; // blocks (matches TokenWeighting clock mode)
    uint32 votingPeriod; // blocks
    uint256 proposalThreshold; // voting power units
    uint256 quorumNumerator; // out of 100
    uint48 lateQuorumExtension; // blocks; 0 disables
}
```

### DAODeployment

```solidity
struct DAODeployment {
    address governor;
    address timelock;
    address shim;
    address source;
    string name;
    uint256 deployedAtBlock;
}
```
