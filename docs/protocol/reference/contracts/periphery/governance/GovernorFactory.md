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


## Constants
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


## State Variables
### _allGovernors
ordered list of every governor deployed by this factory.


```solidity
address[] private _allGovernors
```


### _byGovernor
per-governor lookup of the linked DAO components.


```solidity
mapping(address governor => DAODeployment) private _byGovernor
```


### _governorsBySource
per-source list of every governor instance reading from it.
A TokenWeighting only has ONE governance writer (the
tw.governance() slot); this map tracks every governor
configured to *read* from the source via its shim.


```solidity
mapping(address source => address[]) private _governorsBySource
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
Set-once: callable only when no canonical has been set. Permissionless;
the very first caller wins, so a deployer typically does this in the
same transaction as deploy() to lock the choice.


```solidity
function setCanonicalGovernor(address governor) external;
```

### deploymentCount


```solidity
function deploymentCount() external view returns (uint256);
```

### governorAt


```solidity
function governorAt(uint256 i) external view returns (address);
```

### getDeployment


```solidity
function getDeployment(address governor) external view returns (DAODeployment memory dao);
```

### governorsBySource


```solidity
function governorsBySource(address source) external view returns (address[] memory);
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
