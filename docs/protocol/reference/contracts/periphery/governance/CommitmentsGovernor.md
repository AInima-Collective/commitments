---
title: CommitmentsGovernor
status: generated
source: src/periphery/governance/CommitmentsGovernor.sol
generated: true
---
# CommitmentsGovernor
**Inherits:**
Initializable, GovernorUpgradeable, GovernorSettingsUpgradeable, GovernorCountingSimpleUpgradeable, GovernorVotesUpgradeable, GovernorVotesQuorumFractionUpgradeable, GovernorPreventLateQuorumUpgradeable, GovernorTimelockControlUpgradeable, UUPSUpgradeable

**Title:**
CommitmentsGovernor

DAO-side proposal/vote contract for the Commitments protocol. Reads
voting power from any IERC5805 source (typically a
TokenWeightingVotesShim wrapping a TokenWeighting mesh node) and
executes successful proposals through a TimelockController.
Module composition:
- GovernorSettings: configurable votingDelay / votingPeriod / proposalThreshold
- GovernorCountingSimple: For/Against/Abstain (Bravo style)
- GovernorVotes: reads getPastVotes from an IERC5805 source
- GovernorVotesQuorumFraction: quorum = numerator/denominator of past total supply
- GovernorPreventLateQuorum: extends voting deadline if quorum reaches at the wire
- GovernorTimelockControl: queue + execute via TimelockController
Hash-based proposal IDs (Tally-compatible). UUPS upgradeable; the
_authorizeUpgrade is gated onlyGovernance, so the DAO can only upgrade
itself via a successful, queued, timelock-delayed self-proposal.


## Functions
### constructor

**Note:**
oz-upgrades-unsafe-allow: constructor


```solidity
constructor() ;
```

### initialize

Initialize the Governor proxy.


```solidity
function initialize(
    string memory name_,
    IVotes votesSource,
    TimelockControllerUpgradeable timelock_,
    uint48 votingDelay_,
    uint32 votingPeriod_,
    uint256 proposalThreshold_,
    uint256 quorumNumerator_,
    uint48 lateQuorumExtension_
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`name_`|`string`|Human-readable name used in EIP-712 domain (e.g. "Commitments DAO").|
|`votesSource`|`IVotes`|IERC5805 voting power source (typically a TokenWeightingVotesShim wrapping a TokenWeighting node).|
|`timelock_`|`TimelockControllerUpgradeable`|The TimelockController this Governor queues + executes through.|
|`votingDelay_`|`uint48`|Blocks between proposal creation and voteStart.|
|`votingPeriod_`|`uint32`|Blocks the vote remains open.|
|`proposalThreshold_`|`uint256`|Minimum voting power (in source units) to propose.|
|`quorumNumerator_`|`uint256`|Quorum numerator out of 100 (e.g. 4 = 4%).|
|`lateQuorumExtension_`|`uint48`|Blocks to extend the deadline if quorum reaches within the extension window of voteEnd. Set 0 to disable.|


### _authorizeUpgrade

Self-upgrade only — a successful, queued, timelock-executed proposal
must trigger the upgrade. Same gating as Governor's other admin
operations (updateQuorumNumerator, updateTimelock, etc.).


```solidity
function _authorizeUpgrade(address) internal override onlyGovernance;
```

### state


```solidity
function state(uint256 proposalId)
    public
    view
    override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
    returns (ProposalState);
```

### proposalNeedsQueuing


```solidity
function proposalNeedsQueuing(uint256 proposalId)
    public
    view
    override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
    returns (bool);
```

### proposalThreshold


```solidity
function proposalThreshold()
    public
    view
    override(GovernorUpgradeable, GovernorSettingsUpgradeable)
    returns (uint256);
```

### proposalDeadline


```solidity
function proposalDeadline(uint256 proposalId)
    public
    view
    override(GovernorUpgradeable, GovernorPreventLateQuorumUpgradeable)
    returns (uint256);
```

### _tallyUpdated


```solidity
function _tallyUpdated(uint256 proposalId)
    internal
    override(GovernorUpgradeable, GovernorPreventLateQuorumUpgradeable);
```

### _queueOperations


```solidity
function _queueOperations(
    uint256 proposalId,
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    bytes32 descriptionHash
) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint48);
```

### _executeOperations


```solidity
function _executeOperations(
    uint256 proposalId,
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    bytes32 descriptionHash
) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable);
```

### _cancel


```solidity
function _cancel(
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    bytes32 descriptionHash
) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint256);
```

### _executor


```solidity
function _executor()
    internal
    view
    override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
    returns (address);
```
