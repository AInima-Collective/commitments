---
title: TokenWeighting
status: generated
source: src/extensions/mesh/TokenWeighting.sol
generated: true
---
# TokenWeighting
**Inherits:**
[ITokenWeighting](/docs/protocol/reference/contracts/extensions/mesh/interfaces/ITokenWeighting), [IFlowQueryPath](/docs/protocol/reference/contracts/extensions/mesh/interfaces/IFlowQueryPath), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity), ReentrancyGuard, AccessControl

**Title:**
TokenWeighting

Sink node that normalizes multi-asset stake into unified governance-compatible voting power.
Weights are configurable per denom in basis points (e.g., 10000 = 1.0x, 8000 = 0.8x).
Historical voting power is queryable at past block numbers via OZ Checkpoints.Trace256.
Implements pull-based reward accumulator (Synthetix/Compound per-share pattern).
Implements IFlowQuery for topology discovery, IFlowQueryPath for single-call
provenance walks, and IVotingPowerSource so service managers (ECDSA BLS)
can read per-address power directly from the mesh.


## Constants
### FACTORY_TYPE_ID
`IEntity` type id: `keccak256("commitments.mesh.token_weighting")`. Self-verifies
this implementation when `MeshFactory` whitelists it.


```solidity
bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.mesh.token_weighting")
```


### PRECISION
Precision multiplier for reward per share accumulator


```solidity
uint256 private constant PRECISION = 1e18
```


### BPS
Basis points denominator for weight calculations


```solidity
uint256 private constant BPS = 10000
```


### REWARDER_ROLE
role gate for distributeRewards.


```solidity
bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE")
```


### MAX_REWARD_TOKENS
maximum distinct reward tokens per stakeDenom. Bounds the cost of
stake releaseStake's reward-debt iteration, preventing a permissionless
attacker from growing the set past the block gas limit.


```solidity
uint256 public constant MAX_REWARD_TOKENS = 32
```


### MAX_DENOMS
Cap on the number of registered (iterated) denoms. The voting-power
queries `getVotingPowerAt` / `getTotalPowerAt` — called during quorum
validation — are O(denoms), so an unbounded `_denoms` set is a latent
gas/DoS vector. Registering a NEW denom past this cap reverts; retire
an unused denom (`retireDenom`) to reclaim a slot.


```solidity
uint256 public constant MAX_DENOMS = 64
```


## State Variables
### _initialized
Tracks whether contract has been initialized (clone guard)


```solidity
bool private _initialized
```


### provider
The sole caller authorized to credit/debit stake. Typically a routing
contract (OperatorRegistry, FanOut, etc.) that knows the real staker.


```solidity
address public provider
```


### governance
The governance address allowed to update weights


```solidity
address public governance
```


### weights
denom -> CURRENT weight in bps (e.g., wstETH=10000, USDC=8000).
Mirrors the latest entry of `_weightHistory[denom]` for cheap live reads.


```solidity
mapping(bytes32 => uint256) public weights
```


### _denoms
Ordered list of registered denoms (for enumeration)


```solidity
bytes32[] internal _denoms
```


### _isDenom
Whether a denom has been registered


```solidity
mapping(bytes32 => bool) internal _isDenom
```


### _stakeHistory
Per-(staker, denom) RAW stake history, keyed by block.number. Weighted
power is computed on read by multiplying against the weight epoch in
force at the queried block (see `_weightHistory`). Storing RAW stake
here — rather than pre-weighted power — is what makes a weight retune
O(1): a weight change never has to rewrite any per-staker checkpoint.


```solidity
mapping(address => mapping(bytes32 => Checkpoints.Trace256)) private _stakeHistory
```


### _totalStakeHistory
Per-denom RAW total-stake history, keyed by block.number. Mirrors
`_stakeHistory` aggregated across stakers, so getTotalPowerAt is
O(denoms) on read instead of O(stakers).


```solidity
mapping(bytes32 => Checkpoints.Trace256) private _totalStakeHistory
```


### _weightHistory
Per-denom WEIGHT history — the "weight epoch" ledger — keyed by
block.number. `updateWeight` pushes exactly one checkpoint here;
historical power queries resolve the weight in force at the queried
block via `upperLookup`, so a retune is O(1) regardless of staker count.


```solidity
mapping(bytes32 => Checkpoints.Trace256) private _weightHistory
```


### currentStake
Current stake per (staker, denom)


```solidity
mapping(address => mapping(bytes32 => uint256)) public currentStake
```


### totalStake
Total stake per denom (used for reward distribution)


```solidity
mapping(bytes32 => uint256) public totalStake
```


### rewardsPerShare
Reward per share accumulator: stakeDenom -> rewardToken -> accumulated per-share (scaled by PRECISION)


```solidity
mapping(bytes32 => mapping(address => uint256)) public rewardsPerShare
```


### rewardDebt
Reward debt: staker -> stakeDenom -> rewardToken -> debt at last claim/stake


```solidity
mapping(address => mapping(bytes32 => mapping(address => uint256))) public rewardDebt
```


### _rewardTokens
Reward tokens distributed for each stakeDenom (for debt updates on stake)


```solidity
mapping(bytes32 => EnumerableSet.AddressSet) internal _rewardTokens
```


### pendingRewards
pending rewards banked when stake or releaseStake
changes the staker's amount. Drained by claimRewards. Without this map,
every top-up or partial-unstake silently dropped previously-accrued rewards.


```solidity
mapping(address => mapping(bytes32 => mapping(address => uint256))) public pendingRewards
```


### _retired
denom -> retired? A retired denom carries a weight-0 epoch (contributes
zero from its retirement block onward) and rejects new stake. Only denoms
with stake history are marked retired; never-staked denoms are purged from
`_denoms` outright. Cleared when `updateWeight` re-activates the denom.


```solidity
mapping(bytes32 => bool) internal _retired
```


## Functions
### factoryTypeId

A stable, unique identifier for this contract's type.


```solidity
function factoryTypeId() external pure returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The type id, a domain-separated keccak256 constant.|


### constructor

lock the implementation contract. Clones (via MeshFactory)
reset storage and are unaffected.


```solidity
constructor() ;
```

### onlyProvider


```solidity
modifier onlyProvider() ;
```

### onlyGovernance


```solidity
modifier onlyGovernance() ;
```

### initialize

Initialize the token weighting node (called once by factory or deployer after clone)

governance is also granted REWARDER_ROLE by default, mirroring
typical deployments. Governance can re-route the role via grant/revoke.


```solidity
function initialize(address provider_, address governance_) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`provider_`|`address`|The single provider address allowed to call stake/releaseStake|
|`governance_`|`address`|The governance address allowed to update weights|


### updateWeight

Governance updates the per-denom normalization weight.

`weightBps` is a full-precision (uint256) governance factor applied as
`power = rawStake * weightBps / 10_000`. It is NOT capped at 10_000: it
simultaneously absorbs (a) decimal normalization of heterogeneous backing
tokens into a single common voting unit and (b) risk policy (haircut). E.g.
to map a 1e6-decimal token into a 1e18 common "dollar" unit at par,
`weightBps = 1e16`; a 1e18-decimal token at a governance-chosen rate `r`
(in common units per whole token) with haircut `h` uses
`weightBps = r * h / 1e18 * 10_000`. No price oracle is involved — the
factor is governance-set.


```solidity
function updateWeight(bytes32 denom, uint256 weightBps) external onlyGovernance;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The denom whose weight to update (registers new denom if first call)|
|`weightBps`|`uint256`|Full-precision normalization factor (e.g., 1e16, 3.2e7)|


### retireDenom

Governance retires a denom so it stops contributing to voting power
and stops accepting new stake — the bounded-set counterpart to
`updateWeight`, needed because the unbounded `_denoms` set drives the
O(denoms) cost of the quorum-validation voting-power queries.

A denom that never accrued stake is purged from the iterated set outright
(it contributed zero at every block, so no historical query changes). A
denom with stake history is instead made inert via a weight-0 epoch: its
contribution is zero from this block onward while every block before the
retirement still resolves the weight in force then — so `getVotingPowerAt`
`getTotalPowerAt` at past blocks are unchanged. Re-activate a retired
denom by calling `updateWeight` with a non-zero weight.


```solidity
function retireDenom(bytes32 denom) external onlyGovernance;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`denom`|`bytes32`|The denom to retire.|


### denomCount

The number of registered (iterated) denoms. Bounded by MAX_DENOMS.


```solidity
function denomCount() external view returns (uint256);
```

### isDenomRetired

Whether `denom` is retired (inert, weight-0, rejecting new stake).


```solidity
function isDenomRetired(bytes32 denom) external view returns (bool);
```

### _registerDenom

Register a denom into the iterated set on first use, bounded by MAX_DENOMS.
A registration past the cap reverts so the O(denoms) voting-power queries
can never exceed a bounded cost. Existing denoms are a no-op.


```solidity
function _registerDenom(bytes32 denom) internal;
```

### _purgeDenom

Swap-and-pop a never-staked denom out of the iterated set and clear its
live mirrors. Safe precisely because the denom's contribution was zero at
every block (no `_totalStakeHistory`), so no historical query changes; the
weight *history* is left intact (harmless — a re-add starts fresh at 0 stake).


```solidity
function _purgeDenom(bytes32 denom) internal;
```

### transferGovernance

Transfer governance to a new address. The caller must be the current
governance. The new address receives DEFAULT_ADMIN_ROLE and REWARDER_ROLE;
the old address loses both. Single-step — used to hand a TokenWeighting
node off to a Governor's Timelock.

Hands DEFAULT_ADMIN_ROLE and REWARDER_ROLE to the new governance address
atomically with the slot update, so the new governance has the same
capabilities the old one had at init time. The old address loses both roles.


```solidity
function transferGovernance(address newGovernance) external onlyGovernance;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newGovernance`|`address`|The new governance address (must be non-zero)|


### stake

Provider credits stake to a staker on a specific denom.

The provider is the only authorized caller; `staker` is the address whose
voting power is updated. This enables one provider contract (e.g. an
OperatorRegistry) to route multi-staker stake into a single TokenWeighting
sink — each staker gets its own per-denom row and its own power checkpoints.


```solidity
function stake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The address whose stake is being credited.|
|`denom`|`bytes32`|The denom being staked.|
|`amount`|`uint256`|The amount being staked.|


### releaseStake

Provider debits stake from a staker — decrements stake and updates checkpoints.


```solidity
function releaseStake(address staker, bytes32 denom, uint256 amount) external nonReentrant onlyProvider;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`staker`|`address`|The address whose stake is being debited.|
|`denom`|`bytes32`|The denom to release.|
|`amount`|`uint256`|The amount to release.|


### getVotingPower

Current voting power for an address.


```solidity
function getVotingPower(address staker) external view returns (uint256);
```

### getVotingPowerAt

Historical voting power for an address at a given block.

Resolves the weight epoch in force at `blockNumber` per denom and applies
it to the RAW stake checkpointed at that block. Cost is O(denoms), never
O(stakers), and the per-denom rounding matches the live `getVotingPower`
path exactly, so historical and live values agree for a given weight set.


```solidity
function getVotingPowerAt(address staker, uint256 blockNumber) external view returns (uint256 power);
```

### getTotalPower

Current total voting power across all addresses tracked by this source.


```solidity
function getTotalPower() external view returns (uint256);
```

### getTotalPowerAt

Historical total voting power at a given block.

Same epoch-resolution strategy as getVotingPowerAt but over per-denom
RAW total stake, so the total is recovered in O(denoms) without iterating
the staker set.


```solidity
function getTotalPowerAt(uint256 blockNumber) external view returns (uint256 power);
```

### distributeRewards

Distribute rewards to stakers proportional to their stake via per-share accumulator

role-gated and capped at MAX_REWARD_TOKENS distinct
reward tokens per stakeDenom to prevent unbounded set growth that would
DoS stake() releaseStake().


```solidity
function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount)
    external
    nonReentrant
    onlyRole(REWARDER_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom used to calculate proportional shares|
|`rewardToken`|`address`|The ERC20 token being distributed as rewards|
|`rewardAmount`|`uint256`|The total reward amount to distribute|


### claimRewards

Claim accumulated rewards for a given stake denom and reward token


```solidity
function claimRewards(bytes32 stakeDenom, address rewardToken) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`stakeDenom`|`bytes32`|The denom whose stake determines reward share|
|`rewardToken`|`address`|The ERC20 reward token to claim|


### nodeType

Reserved nodeType constants. Implementations of additional node types
SHOULD reserve their own bytes32 constants.


```solidity
function nodeType() external pure returns (bytes32);
```

### nodeTypeName


```solidity
function nodeTypeName() external pure returns (string memory);
```

### providers


```solidity
function providers() external view returns (ProviderInfo[] memory);
```

### consumers

Sink node — no downstream consumers


```solidity
function consumers() external pure returns (ConsumerInfo[] memory);
```

### availableDenoms


```solidity
function availableDenoms() external view returns (AvailableDenom[] memory);
```

### providersPaged

Paginated providers — `offset` may exceed length (returns empty array).

TokenWeighting has a single provider; pagination collapses similarly.


```solidity
function providersPaged(uint256 offset, uint256 limit) external view returns (ProviderInfo[] memory);
```

### consumersPaged

TokenWeighting is a sink — no downstream consumers — so pagination is empty.


```solidity
function consumersPaged(uint256, uint256) external pure returns (ConsumerInfo[] memory);
```

### availableDenomsPaged


```solidity
function availableDenomsPaged(uint256 offset, uint256 limit) external view returns (AvailableDenom[] memory);
```

### MAX_PATH_DEPTH

Maximum depth this implementation supports for `denomPath`.

SHOULD be 64 unless the implementation has a documented reason
for a tighter bound. Reading this lets callers size requests
without trial-and-error reverts.


```solidity
function MAX_PATH_DEPTH() external pure returns (uint16);
```

### denomPath

Walk the denom-provenance chain upstream from a local denom.

MUST NOT revert on cycles, non-mesh providers, or natural termini —
these are reported by the returned path's terminal entry. MUST
revert with `InvalidDepth` only on out-of-range `maxDepth`.


```solidity
function denomPath(bytes32 local, uint16 maxDepth) external view returns (DenomLink[] memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`local`|`bytes32`|The local denom on this node to trace.|
|`maxDepth`|`uint16`|Maximum chain length to traverse; MUST satisfy `1 <= maxDepth <= MAX_PATH_DEPTH()`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`DenomLink[]`|path The walked path in source-walked order. Length <= maxDepth. The last entry's `provider == address(0)` indicates vault-rooted termination. Otherwise the chain was truncated by a non-mesh provider, a cycle, or the depth limit; callers distinguish by inspecting the path itself.|


### _computePower

Compute current total weighted voting power for a staker from live state.


```solidity
function _computePower(address staker) internal view returns (uint256 power);
```

### _computeTotalPower

Compute the current weighted total power across all stakers from live
per-denom totals. O(denoms), independent of staker count.


```solidity
function _computeTotalPower() internal view returns (uint256 power);
```

### _checkpointStake

Checkpoint the RAW current stake for (staker, denom) and the denom's RAW
total stake at the current block. Weight is intentionally NOT applied
here; it is applied at read time keyed by the weight epoch, so a weight
retune never has to touch these per-staker checkpoints. Cost is O(1).


```solidity
function _checkpointStake(address staker, bytes32 denom) internal;
```
