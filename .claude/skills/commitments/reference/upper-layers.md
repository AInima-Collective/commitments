# Upper layers — registry, mesh, services, governance, rewards

These sit on top of the manager and turn committed stake into operator services,
aggregated voting power, DAO governance, reward streams, and packaged insurance.
This is the less-central part of the protocol for most agents — covered at the
"main entry points" level. Drop into `src/extensions/services/`,
`src/extensions/mesh/`, `src/periphery/governance/`, and
`src/extensions/rewards/` for full detail.

The unifying idea: a **commitment whose counterparty is a registry/mesh node**
becomes *delegated stake*; nodes aggregate that stake across token denominations
into a single normalized voting power that governance and services consume.

---

## OperatorRegistry — stake-backed operator directory

An operator registers by pointing a commitment (counterparty = the registry,
meeting the registry's required arbiter/token/penalty-floor policy) at it. Others
delegate by creating their own commitment and calling `delegate`.

```solidity
function register(uint256 commitmentId) external;                 // self-stake = operator's first commitment
function deregister() external;
function delegate(address operator, uint256 commitmentId) external; // allocate your commitment's stake to an operator
// IServiceManager views:
function getOperatorStake(address operator) external view returns (uint256);
function isOperator(address operator) external view returns (bool);
function getOperatorSet() external view returns (address[] memory);
function getAcceptancePolicy() external view returns (address arbiter, uint16 floor, address token);
```

When a delegation commitment closes, the manager calls
`onDelegationReleased` / `onDelegationForfeited` back into the registry to keep
`totalDelegatedStake` exact (wire `manager.setOperatorRegistry(registry)`). The
acceptance policy (arbiter, token, penalty floor) is fixed at init; the floor is
**raise-only** via `tightenPolicy`. Strategy bindings on delegations are rejected.

---

## Mesh — aggregating heterogeneous stake into voting power

Three node types, deployed as EIP-1167 clones by `MeshFactory`:

- **FanInNode** — many providers → one consumer. `registerProvider` (manager)
  maps a provider's `denomIn` to a `denomOut`; the **manager** credits stake via
  `stake(provider, denomIn, amount)` (manager-only — providers cannot
  self-credit); the consumer `releaseStake`.
- **FanOutNode** — one provider → many consumers, split by `Outflow {consumer,
  portionBps (sum 10000), maxPenaltyBps}`. Enforces exposure allocation; pays
  rewards via a per-share accumulator (`distributeRewards` / `claimRewards`).
- **TokenWeighting** — the **sink**: normalized voting power
  `Σ(stake[denom] × weight[denom] / 10000)`, checkpointed for historical reads.
  Governance sets per-denom weights via `updateWeight`.

```solidity
// MeshFactory
function deployFanIn(address consumer, address manager) external returns (address);
function deployFanOut(address provider, address manager) external returns (address);
function deployTokenWeighting(address provider, address governance) external returns (address);
// + deterministic *At(salt,…) variants and predict*Address(salt) views

// TokenWeighting (the part governance reads)
function getVotingPower(address staker) external view returns (uint256);
function getVotingPowerAt(address staker, uint256 blockNumber) external view returns (uint256);
function getTotalPowerAt(uint256 blockNumber) external view returns (uint256);
function updateWeight(bytes32 denom, uint256 weightBps) external; // governance only
```

Denominations are `bytes32` so heterogeneous backing (wstETH, USDC, …) coexists
in one node. `TokenWeighting` is the `IVotingPowerSource` governance binds to.

---

## Services — OperatorServiceRegistry (signature validation)

The glue an operator AVS uses to validate quorum-signed attestations (this is the
`serviceManager` that `AttestationArbiter` and `MerkleSnapshotAdapter` call).

```solidity
function enrollServiceOperator() external;
function withdrawServiceOperator(address operator) external;
function updateOperatorSigningKey(address newSigningKey, bytes signingKeySignature) external;
function validate(IServiceHandler.Envelope envelope, IServiceHandler.SignatureData signatureData) external view; // quorum check
function isValidSignature(bytes32 digest, bytes signatureData) external view returns (bytes4); // ERC-1271
function getOperatorWeight(address operator) external view returns (uint256);
```

`validate` confirms signers are **currently** registered operators, sorted
ascending, with cumulative voting power (read from the bound `IVotingPowerSource`
at `referenceBlock`) meeting both a `thresholdWeight` and a quorum fraction. The
`referenceBlock` must be recent (`maxReferenceBlockAge`, ~256 blocks default).

---

## Governance — Governor + Timelock + votes shim

`GovernorFactory.deploy(DAOConfig)` stands up a full DAO in one call: a stateless
`TokenWeightingVotesShim` (adapts `IVotingPowerSource` → OZ `IVotes`, block-number
clock), a non-upgradeable `CommitmentsTimelock` (EIP-1167 clone), and a
UUPS `CommitmentsGovernor` (standard OZ Governor: `propose` / `castVote`
[For/Against/Abstain] / `queue` / `execute`, with Settings, CountingSimple,
QuorumFraction, PreventLateQuorum, TimelockControl modules).

```solidity
struct DAOConfig { string name; IVotingPowerSource source; uint256 timelockMinDelay;
  uint48 votingDelay; uint32 votingPeriod; uint256 proposalThreshold;
  uint256 quorumNumerator; uint48 lateQuorumExtension; }
function deploy(DAOConfig calldata cfg) external returns (DAODeployment memory);
```

Voting power comes from the mesh `TokenWeighting` via the shim — there is **no
ERC-20 governance token and no delegation on the shim** (`delegate` reverts);
delegation lives in the stake layer. To change the power source you deploy a
fresh DAO and `transferGovernance` on the `TokenWeighting`.

---

## Rewards — Merkle distribution

```solidity
// CommitmentsRewardsCoordinator (independent; not an IDistributionStrategy)
function depositRewards(address token, uint256 amount) external;                 // permissionless funding
function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] proof) external returns (uint256 paidOut);
function claimed(address earner, address token) external view returns (uint256);
// MerkleSnapshot
function submitRoot(bytes32 merkleRoot) external returns (bytes32 rootId);        // updater only
function isActive(bytes32 rootId) external view returns (bool);                   // submitted ∧ !disabled ∧ past activation delay
```

Cumulative-claim model: each root carries an earner's *lifetime* total; a claim
pays `cumulativeAmount − alreadyClaimed` (monotonic, so re-claims are no-ops).
Roots go live only after an activation delay, and the updater key swaps through a
staged delay — both intentional anti-rug timers.
