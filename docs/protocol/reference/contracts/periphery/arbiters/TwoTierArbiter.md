---
title: TwoTierArbiter
status: generated
source: src/periphery/arbiters/TwoTierArbiter.sol
generated: true
---
# TwoTierArbiter
**Inherits:**
[ArbiterBase](/docs/protocol/reference/contracts/shared/arbitration/ArbiterBase), ReentrancyGuardTransient

**Title:**
TwoTierArbiter

A two-controller court in which a primary controller issues a fast
ruling and an appeal controller has final authority over a timely
appeal. Each ruling is enforced through the CommitmentManager's
ordinary two-phase forfeit flow.

The controller addresses may be DAO timelocks. This contract does not
inspect how either address is governed. Terms are fixed at deployment:
there are no controller, timing, manager, or policy setters and the
contract is deliberately non-upgradeable.


## State Variables
### primaryController
Address authorized to open and withdraw first-pass rulings.


```solidity
address public immutable primaryController
```


### appealController
Address authorized to resolve appealed rulings.


```solidity
address public immutable appealController
```


### appealWindow
Wall-clock period in which an authorized party may appeal.


```solidity
uint64 public immutable appealWindow
```


### humanResponseWindow
Wall-clock period given to the appeal controller after appeal.


```solidity
uint64 public immutable humanResponseWindow
```


### executionBuffer
Required margin between a court deadline and manager execution.


```solidity
uint64 public immutable executionBuffer
```


### requiredChallengeWindow
Minimum challenge window accepted by this deployment.


```solidity
uint64 public immutable requiredChallengeWindow
```


### courtPolicyHash
Content hash of the immutable off-chain court policy.


```solidity
bytes32 public immutable courtPolicyHash
```


### _courtPolicyURI

```solidity
string private _courtPolicyURI
```


### _cases

```solidity
mapping(uint256 caseId => Case) private _cases
```


### activeCaseOf
The live case for a commitment, or zero when none is live.


```solidity
mapping(uint256 commitmentId => uint256 caseId) public activeCaseOf
```


### nextCaseId
Last allocated globally unique case ID. Zero is reserved.


```solidity
uint256 public nextCaseId
```


## Functions
### constructor

Deploy a court with fixed controllers, timing, manager, and policy.


```solidity
constructor(
    address manager_,
    address primaryController_,
    address appealController_,
    uint64 appealWindow_,
    uint64 humanResponseWindow_,
    uint64 executionBuffer_,
    string memory courtPolicyURI_,
    bytes32 courtPolicyHash_
) ArbiterBase(manager_);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`manager_`|`address`|CommitmentManager this court may call.|
|`primaryController_`|`address`|Fast first-pass controller (normally an AI-governed DAO timelock).|
|`appealController_`|`address`|Final appeal controller (normally a human-governed DAO timelock).|
|`appealWindow_`|`uint64`|Period after a primary ruling in which appeal is allowed.|
|`humanResponseWindow_`|`uint64`|Period after appeal in which the final controller may rule.|
|`executionBuffer_`|`uint64`|Extra manager-execution margin beyond either court window.|
|`courtPolicyURI_`|`string`|Content-addressed URI for the immutable court policy.|
|`courtPolicyHash_`|`bytes32`|Content hash of the court policy document.|


### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

Bits are defined in {ArbiterCapabilities}. An arbiter MUST only set
a bit it can actually execute — the value is a self-declaration the
capability is *reachable*, not a guarantee any particular call will
succeed (auth/state preconditions still apply at dispatch time).


```solidity
function arbiterCapabilities() external pure returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

Empty string if the arbiter publishes no metadata. Not consumed
on-chain; surfaced for the human/service trust decision.


```solidity
function arbiterMetadataURI() external view returns (string memory);
```

### getCase

Return the complete record for `caseId`.


```solidity
function getCase(uint256 caseId) external view returns (Case memory courtCase);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Globally unique court case ID.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`courtCase`|`Case`|The stored case record.|


### proposeRuling

Open a positive first-pass ruling against an eligible commitment.


```solidity
function proposeRuling(uint256 commitmentId, uint16 penaltyBps, bytes32 decisionHash)
    external
    nonReentrant
    returns (uint256 caseId);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`commitmentId`|`uint256`|Commitment governed by this court.|
|`penaltyBps`|`uint16`|Proposed forfeit in basis points of encumbered backing.|
|`decisionHash`|`bytes32`|Hash of the canonical primary-decision bundle.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Newly allocated globally unique court case ID.|


### withdrawRuling

Withdraw an unappealed primary ruling and cancel its manager proposal.


```solidity
function withdrawRuling(uint256 caseId, bytes32 reasonHash) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Live primary case to withdraw.|
|`reasonHash`|`bytes32`|Non-zero hash of the withdrawal record.|


### appeal

Escalate a primary ruling once and reset the manager challenge window.


```solidity
function appeal(uint256 caseId, bytes32 appealHash) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Live primary case to appeal.|
|`appealHash`|`bytes32`|Non-zero hash of the canonical appeal bundle.|


### resolveAppeal

Issue the final ruling on an appealed case.

Zero dismisses and creates no zero-penalty manager proposal. A
positive penalty cancels and reopens the manager proposal, giving
the final ruling a fresh challenge window.


```solidity
function resolveAppeal(uint256 caseId, uint16 finalPenaltyBps, bytes32 decisionHash) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Appealed case to resolve.|
|`finalPenaltyBps`|`uint16`|Final penalty, or zero to dismiss.|
|`decisionHash`|`bytes32`|Non-zero hash of the canonical human-decision bundle.|


### lapseAppeal

Cancel an unanswered appeal after its human-response deadline.


```solidity
function lapseAppeal(uint256 caseId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Appealed case whose response period has elapsed.|


### executeRuling

Permissionlessly execute an unappealed or final human ruling after
the manager challenge window matures.


```solidity
function executeRuling(uint256 caseId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Live primary or human-ruling case to execute.|


### syncCase

Reconcile a live local case after direct manager execution or
permissionless stale cancellation.


```solidity
function syncCase(uint256 caseId) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caseId`|`uint256`|Live case whose manager proposal has resolved externally.|


### _getKnownCase


```solidity
function _getKnownCase(uint256 caseId) internal view returns (Case storage courtCase);
```

### _requireState


```solidity
function _requireState(uint256 caseId, CaseState expected) internal view returns (Case storage courtCase);
```

### _requireCurrent


```solidity
function _requireCurrent(uint256 caseId, Case storage courtCase) internal view;
```

### _requireActiveManagerProposal


```solidity
function _requireActiveManagerProposal(uint256 commitmentId, uint16 expectedPenaltyBps)
    internal
    view
    returns (ICommitmentManager.ForfeitProposal memory proposal);
```

### _closeCase

Every caller has already run `_requireCurrent`.


```solidity
function _closeCase(Case storage courtCase, CaseState terminalState) internal;
```

### _operativePenalty


```solidity
function _operativePenalty(Case storage courtCase) internal view returns (uint16);
```

### _operativeDecisionHash


```solidity
function _operativeDecisionHash(Case storage courtCase) internal view returns (bytes32);
```

### _isLive


```solidity
function _isLive(CaseState state) internal pure returns (bool);
```

### _deadline


```solidity
function _deadline(uint64 start, uint64 window) internal pure returns (uint64);
```

### _max


```solidity
function _max(uint64 a, uint64 b) internal pure returns (uint64);
```

## Events
### RulingProposed
Emitted when the primary controller opens a case.


```solidity
event RulingProposed(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 penaltyBps,
    uint64 openedAt,
    uint64 appealDeadline,
    uint64 managerInitiatedAt,
    bytes32 decisionHash
);
```

### RulingWithdrawn
Emitted when the primary controller withdraws a ruling.


```solidity
event RulingWithdrawn(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 penaltyBps,
    uint64 withdrawnAt,
    uint64 appealDeadline,
    bytes32 reasonHash
);
```

### RulingAppealed
Emitted when an authorized party escalates a case.


```solidity
event RulingAppealed(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 primaryPenaltyBps,
    uint64 appealedAt,
    uint64 humanDeadline,
    uint64 managerInitiatedAt,
    bytes32 appealHash
);
```

### AppealResolved
Emitted when the appeal controller issues its final ruling.

`finalPenaltyBps == 0` identifies dismissal; in that case no new
manager proposal is created and `managerInitiatedAt` is zero.


```solidity
event AppealResolved(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 finalPenaltyBps,
    uint64 ruledAt,
    uint64 humanDeadline,
    uint64 managerInitiatedAt,
    bytes32 decisionHash
);
```

### AppealLapsed
Emitted when anyone lapses an unanswered appeal after deadline.


```solidity
event AppealLapsed(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 primaryPenaltyBps,
    uint64 humanDeadline
);
```

### RulingExecuted
Emitted when the operative manager proposal is executed through this court.


```solidity
event RulingExecuted(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    uint16 penaltyBps,
    uint64 managerInitiatedAt,
    uint64 executedAt,
    bytes32 decisionHash
);
```

### CaseSynchronized
Emitted when direct manager resolution is reconciled locally.


```solidity
event CaseSynchronized(
    uint256 indexed caseId,
    uint256 indexed commitmentId,
    address indexed actor,
    CaseState terminalState,
    uint16 penaltyBps,
    uint64 managerInitiatedAt,
    uint64 synchronizedAt,
    bytes32 decisionHash,
    bytes32 appealHash
);
```

## Errors
### ControllersMustDiffer

```solidity
error ControllersMustDiffer();
```

### ZeroWindow

```solidity
error ZeroWindow();
```

### InvalidPolicy

```solidity
error InvalidPolicy();
```

### TimingOverflow

```solidity
error TimingOverflow();
```

### NotPrimaryController

```solidity
error NotPrimaryController(address caller);
```

### NotAppealController

```solidity
error NotAppealController(address caller);
```

### UnauthorizedAppellant

```solidity
error UnauthorizedAppellant(address caller);
```

### CommitmentNotFound

```solidity
error CommitmentNotFound(uint256 commitmentId);
```

### CaseAlreadyActive

```solidity
error CaseAlreadyActive(uint256 commitmentId, uint256 caseId);
```

### UnknownCase

```solidity
error UnknownCase(uint256 caseId);
```

### WrongCaseState

```solidity
error WrongCaseState(uint256 caseId, CaseState expected, CaseState actual);
```

### RulingNotExecutable

```solidity
error RulingNotExecutable(uint256 caseId, CaseState actual);
```

### CaseNotLive

```solidity
error CaseNotLive(uint256 caseId, CaseState actual);
```

### StaleCase

```solidity
error StaleCase(uint256 caseId, uint256 activeCaseId);
```

### InvalidPenalty

```solidity
error InvalidPenalty(uint16 penaltyBps);
```

### PenaltyAboveCommitmentMax

```solidity
error PenaltyAboveCommitmentMax(uint16 commitmentMax, uint16 penaltyBps);
```

### ZeroHash

```solidity
error ZeroHash();
```

### AppealWindowElapsed

```solidity
error AppealWindowElapsed(uint64 deadline, uint64 nowTs);
```

### HumanResponseWindowElapsed

```solidity
error HumanResponseWindowElapsed(uint64 deadline, uint64 nowTs);
```

### HumanResponseWindowActive

```solidity
error HumanResponseWindowActive(uint64 deadline, uint64 nowTs);
```

### ManagerProposalNotActive

```solidity
error ManagerProposalNotActive(uint256 commitmentId);
```

### ManagerPenaltyMismatch

```solidity
error ManagerPenaltyMismatch(uint16 expected, uint16 actual);
```

## Structs
### Case
Complete on-chain record for one court case.


```solidity
struct Case {
    uint256 commitmentId;
    uint16 primaryPenaltyBps;
    uint16 finalPenaltyBps;
    uint64 openedAt;
    uint64 appealDeadline;
    uint64 appealedAt;
    uint64 humanDeadline;
    CaseState state;
    bytes32 primaryDecisionHash;
    bytes32 appealHash;
    bytes32 humanDecisionHash;
}
```

## Enums
### CaseState
Local lifecycle of a court case.


```solidity
enum CaseState {
    None,
    PrimaryRuling,
    Appealed,
    HumanRuling,
    Dismissed,
    Withdrawn,
    Lapsed,
    Executed,
    StaleCancelled
}
```
