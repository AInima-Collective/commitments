---
eip: XXXX
title: Commitments - Mesh Topology and Operator Registry
description: Canonical mesh aggregation interfaces (FanIn, FanOut, TokenWeighting), and the operator-registry integration pattern, as an extension to ERC-COMMITMENTS.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-05-08
---

## Abstract

This ERC defines **mesh topology** — independently deployable contracts that aggregate, distribute, or weight stake into denominations consumed by governance, restaking middleware, or service-quorum logic. These nodes compose with [`ERC-COMMITMENTS`](./ERC-COMMITMENTS.md), but do not require a commitment manager. The standard specifies the denomination scheme, event-based discovery of the stake graph, and the three RECOMMENDED operational interfaces (`IFanIn`, `IFanOut`, `ITokenWeighting`). The **operator registry** and **service manager** — the layer that integrates commitments with decentralized operator services (AVSs, oracle networks, off-chain compute markets) — are specified normatively in the sibling [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) standard; §4 below is a pointer to it.

## Motivation

Commitments produce stake: encumbered, forfeitable, parameterized capital. Services consume stake: as voting power, as quorum weight, as security collateral. Between the two sits a topology problem — many committers fan into one service, one provider fans out to many consumers, heterogeneous tokens normalize into one score. Without standard shapes for these nodes, every deployment writes bespoke adapters and no generic client can read the stake graph.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

When Mesh is composed with Core, the terms **committer**, **arbiter**, **backing token**, **commitment manager**, and **exposure allocation** have the meanings defined by the core standard. This terminology cross-reference is not a conformance dependency.

### 1. Conformance and constants

| Section | Status | Depends on |
|---|---|---|
| **§2 Denominations and discovery** | normative-optional | — |
| **§3 Operational interfaces** | RECOMMENDED shapes | §2 |
| **§4 Operator Registry pattern** | specified in [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) (pointer only) | — |

Mesh topology is independent of the core standard's Parts A–D — a manager deployment without mesh nodes is fully conformant to the core — but composable with them.

| Constant | Value | Normative |
|---|---|---|
| `MAX_REWARD_TOKENS` | `32` per stakeDenom on FanOut/TokenWeighting | value SHOULD; presence of the cap MUST |
| `MAX_DENOMS` | `64` per TokenWeighting node | MUST |

The `MAX_REWARD_TOKENS` value is empirical: 32 ERC-20 transfers fit comfortably under typical L2 block gas, with headroom for the surrounding distribution logic. The threat it defends against is gas-bomb-on-distribution as the reward set grows (see Security Considerations). The *value* `32` is a RECOMMENDED default an implementation MAY tune, but the *presence* of the cap is normative: `distributeRewards` MUST reject a reward token that would grow the per-`stakeDenom` set beyond the cap, reverting `RewardTokenLimit`.

`MAX_DENOMS` bounds the registered-denom set on a `TokenWeighting` node (§3.3). The voting-power queries `getVotingPowerAt` / `getTotalPowerAt` are O(denoms) and are evaluated inside quorum validation, so the set MUST be bounded: registering a new denom past the cap MUST revert `DenomCapReached`.

### 2. Denominations and discovery

Nodes expose no on-chain topology views. Clients rebuild the stake graph from events: the reference `MeshFactory` announces each node with `IMeshFactory.NodeDeployed(impl, clone, nodeType)`, where `nodeType` is `"fan_in"`, `"fan_out"` or `"token_weighting"`, and each node's registration, outflow and stake events name its providers, consumers and denoms. A node SHOULD emit an event for every change to its providers, consumers, outflows or stake; where an event carries only a count (FanOut's `OutflowsSet`), the node's getters (`getOutflows`) return the detail.

**Denom uniqueness.** The `denom` field is a `bytes32` namespace identifier whose meaning is preserved across composition; two services that emit the same `denom` are treated as composing in the same denomination, which is sometimes the intent and sometimes a collision. To make the choice explicit, implementations SHOULD derive denom values from a source-scoped scheme of the form

```
denom = keccak256(abi.encode(originatingSource, label))
```

where `originatingSource` is the address of the backing token or manager from which the stake originates (for self-stake / delegation denoms) or `address(0)` for synthetic denoms emitted by aggregator nodes, and `label` is a short `bytes32` tag chosen by the issuing service (e.g. `bytes32("self")` for self-stake, `bytes32("delegated:weth")` for a WETH-denominated delegation, `bytes32("vp:tw1")` for a TokenWeighting voting-power output). Two services that adopt the same source and the same label produce the same denom — this is the intended composition surface for shared restaking. Two services that intend to remain distinct MUST choose distinct labels or extend the scheme (e.g. include a service-specific salt).

### 3. Operational interfaces (RECOMMENDED)

Discovery (§2) does not specify how stake actually enters or leaves a mesh node. Three operational shapes recur across mesh deployments:

- **Aggregation** — many providers commit stake to one consumer through the same node.
- **Distribution** — one provider's stake fans out to multiple consumers under explicit slices.
- **Weighting** — one provider routes stake from many stakers through a single sink that emits unified voting power.

The `stake` and `releaseStake` signatures diverge across the three shapes because each solves a different aggregation problem and demands a different authorization model — manager-credited provider-as-parameter for aggregation, single-provider check for distribution, staker-as-parameter for weighting. The divergence is structural, not incidental, and a common-denominator `IMeshNode` interface would force premature unification on patterns that are not actually unified. This standard does NOT specify a normative `IMeshNode`; a future extension MAY introduce one if community deployment patterns converge.

Implementations targeting one of the three canonical shapes SHOULD adopt the matching interface below so that wallets, indexers, and integrators do not need per-deployment adapters.

#### 3.1 `IFanIn` — aggregation (manager-credited)

```solidity
interface IFanIn {
    function initialize(address consumer, address manager) external;

    function registerProvider(
        address provider,
        bytes32 denomIn,
        bytes32 denomOut,
        uint16 maxPenaltyBps,
        uint64 unbondingPeriod
    ) external;

    /// Manager-only. Credits `provider`'s registered stake, mapped denomIn → denomOut.
    function stake(address provider, bytes32 denomIn, uint256 amount) external;

    function totalStake(bytes32 denomOut) external view returns (uint256);

    /// Consumer or manager. The provider is derived from the stored output-source
    /// mapping for `denomOut`, never caller-supplied.
    function releaseStake(bytes32 denomOut, uint256 amount) external;
}
```

Many providers commit stake to a single consumer through the same node. Both `registerProvider` and `stake` MUST be **manager-only** (the `manager` fixed at `initialize` — typically the verifying operator registry, [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) §2), and `stake` takes the provider **explicitly as a parameter** rather than inferring it from `msg.sender`. This authorization model is load-bearing: mesh stake MUST only be credited by a party that has verified real backing (a registry that read the provider's commitment on-chain), so a provider can never self-credit arbitrary stake into the aggregate. The `stake` signature therefore takes the provider as an explicit parameter — `stake(address provider, bytes32 denomIn, uint256 amount)` — and MUST NOT infer it from `msg.sender`.

Releases are initiated by the consumer or by the manager (the manager path lets the registry unwind mesh stake when a delegation is released or forfeited); the provider MUST be derived from the stored output-source mapping for `denomOut` rather than passed in by the caller — this prevents a malicious consumer from poisoning off-chain indexers by emitting an arbitrary provider address on `releaseStake`.

#### 3.2 `IFanOut` — distribution (single-provider with explicit outflows)

```solidity
struct UserInfo {
    uint256 locked;             // total stake from the provider for this denom
    uint256 totalForfeitable;   // Σ(amount_i × maxPenaltyBps_i / 10_000) across outflows
}

struct Outflow {
    address consumer;
    uint16 maxPenaltyBps;
    uint256 portionBps;          // sum across outflows MUST be <= 10_000
}

struct FanOutLien {
    uint256 amount;             // stake claimed by this consumer (portionBps × locked / 10_000)
    uint256 exposure;           // amount × maxPenaltyBps / 10_000
}

interface IFanOut {
    function initialize(address provider_, address manager_) external;

    function setOutflows(bytes32 denom, Outflow[] calldata outflows) external;

    function stake(bytes32 denom, uint256 amount) external;
    function releaseStake(address staker, bytes32 denom, uint256 amount) external;

    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;
    function claimRewards(bytes32 stakeDenom, address rewardToken) external;

    function getUserInfo(address staker, bytes32 denom) external view returns (UserInfo memory);
    function getOutflows(address staker, bytes32 denom) external view returns (Outflow[] memory);
    function getLien(address staker, bytes32 denom, address consumer) external view returns (FanOutLien memory);
}
```

The concrete `FanOutNode` additionally exposes `initializeWithPenalty(address provider_, address manager_, uint16 inputMaxPenaltyBps_)`, which fixes the node's `inputMaxPenaltyBps` at construction; plain `initialize` defaults it to `10_000`. `manager_` is recorded in the `Initialized` event only and carries no powers: only the provider configures outflows.

A single provider's stake is distributed to multiple consumers under explicit `Outflow { consumer, maxPenaltyBps, portionBps }` slices. The `portionBps` across a staker/denom's outflows MUST sum to at most `10_000`; a provider MAY leave a portion unallocated (unallocated locked stake is simply subject to no consumer's lien — this relaxation is required because `releaseStake` shrinks a released outflow's portion so a later `stake` cannot resurrect it). `setOutflows` MUST reject an outflow set whose portions sum above `10_000` (revert `InvalidPortionSum`), and MUST — as a separate rule — reject a set that names the same consumer twice (revert `DuplicateConsumer`), because duplicate consumers would collapse into one lien slot while both contributing to `totalForfeitable`, desyncing the aggregate from the sum of stored liens.

`stake` is provider-only (the provider is `msg.sender`). `releaseStake` is callable only by a registered consumer. `distributeRewards` is likewise consumer-only (the consumer funds the reward pool), whereas `claimRewards` is permissionless and called by the staker to pull its pro-rata accrual. The exposure allocation invariant (core INV-3, generalized to mesh nodes) MUST hold across all outflows for the same staker/denom — the sum of `amount × maxPenaltyBps / 10_000` over outflows (`totalForfeitable`) MUST NOT exceed `locked × inputMaxPenaltyBps / 10_000`. `setOutflows` and `stake` MUST each re-validate this invariant (revert `ExposureAllocationExceeded`).

**Relationship to distribution strategies.** The built-in Synthetix-style accumulator on `IFanOut` (`distributeRewards` / `claimRewards`) is independent of the core standard's Part D distribution strategies. The shipped node holds reward tokens itself, tracks stake locally, and pays callers through `claimRewards`; it does not implement `IDistributionStrategy` and does not route claims through the commitment manager.

#### 3.3 `ITokenWeighting` — weighting (manager-driven, multi-staker)

```solidity
interface ITokenWeighting is IVotingPowerSource {
    function initialize(address provider_, address governance_) external;

    function stake(address staker, bytes32 denom, uint256 amount) external;
    function releaseStake(address staker, bytes32 denom, uint256 amount) external;

    function updateWeight(bytes32 denom, uint256 weightBps) external;
    function retireDenom(bytes32 denom) external;
    function transferGovernance(address newGovernance) external;

    function denomCount() external view returns (uint256);
    function isDenomRetired(bytes32 denom) external view returns (bool);
    function currentStake(address staker, bytes32 denom) external view returns (uint256);

    function distributeRewards(bytes32 stakeDenom, address rewardToken, uint256 rewardAmount) external;
    function claimRewards(bytes32 stakeDenom, address rewardToken) external;
}
```

One provider contract — typically an operator registry ([`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) §2) — routes stake from many stakers through a single weighting sink that emits unified voting power. The provider is the only authorized caller for `stake` / `releaseStake`; `staker` is a parameter rather than `msg.sender` so a single registry can credit many distinct stakers. Inheriting `IVotingPowerSource` lets service managers and other governance consumers depend on the narrow voting-power surface without importing the full mesh interface. Voting power SHOULD be queryable at past block numbers (e.g. via OpenZeppelin `Checkpoints.Trace208`, keyed by `uint48` block number) so off-chain consumers can pin to a reference block.

**`weightBps` units — an explicit exception to core §0.1.** Despite the `Bps` suffix, `weightBps` is NOT a percentage capped at `10_000`. It is a full-precision (`uint256`) governance-set normalization factor applied as

```
power = rawStake × weightBps / 10_000
```

and it deliberately exceeds `10_000` in normal operation: it simultaneously absorbs (a) decimal normalization of heterogeneous backing tokens into one common voting unit (e.g. mapping a 6-decimal token into a 1e18-based unit at par requires `weightBps = 1e16`) and (b) risk policy (haircuts). Core §0.1's "bps means 0..10_000" rule governs *percentage* fields (`maxPenaltyBps`, `penaltyBps`, `portionBps`); `weightBps` shares only the `/ 10_000` application denominator, not the cap. No price oracle is involved — the factor is governance-set. Implementations MUST reject `weightBps == 0` (use a fresh denom or leave stake unweighted instead of zeroing history).

**Bounded denom set.** The registered-denom set on a `TokenWeighting` node is bounded at `MAX_DENOMS = 64` (§1) because the voting-power queries `getVotingPowerAt` / `getTotalPowerAt` are O(denoms) and are evaluated inside quorum validation. Registering a new denom past the cap MUST revert `DenomCapReached`. `retireDenom` reclaims capacity: a denom that never accrued stake is purged from the iterated set outright (emit `DenomPurged`), while a denom with stake history is instead made inert via a weight-0 epoch from the retirement block onward (emit `DenomRetired(denom, previousWeightBps)`) and thereafter rejects new stake (`stake` into a retired denom MUST revert `DenomIsRetired`). Retirement MUST NOT change any historical `getVotingPowerAt` / `getTotalPowerAt`: raw stake is checkpointed and every block before the retirement still resolves the weight epoch in force then, so past voting power is provably unchanged. `retireDenom` MUST revert `AlreadyRetired` on an already-retired denom; calling `updateWeight` with a non-zero weight re-activates a retired denom. `denomCount()`, `isDenomRetired(denom)`, and `currentStake(staker, denom)` expose the bounded set for clients. `transferGovernance` hands the governance slot (and the `REWARDER_ROLE` and admin roles) to a new address atomically, revoking them from the old — the single-step handoff used to pass a node to a Governor's timelock.

### 3.4 Custom operational shapes

Implementations targeting other aggregation patterns — governance gating, hierarchical aggregation, weighted distribution under bespoke rules, conditional outflow rebalancing — MAY define their own operational interface. Such implementations:

- MUST still emit the events §2 requires, so generic clients can discover the node's denoms, providers, and consumers.
- SHOULD announce themselves with a `nodeType` string distinct from the three reserved names (`fan_in`, `fan_out`, `token_weighting`) so clients can route on the discriminator.
- SHOULD publish their non-normative operational interface alongside the deployment so integrators can write a one-off adapter where a generic shape does not fit.

### 4. Operator services (see `ERC-COMMITMENTS-SERVICES`)

The operator-registry pattern — operator set, registration/delegation lifecycle, the `onDelegationReleased` / `onDelegationForfeited` callbacks, the forfeitable-surface accounting, the `IOperatorRegistry` interface, and the voting-power composition recipe — is specified **normatively** in the sibling [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) standard, alongside the `IVotingPowerSource` read surface and the `IServiceManager` stake-weighted signature-validation layer.

The composition recipe uses this document's mesh nodes:

```
operator self-stake + delegations  →  FanIn(per operator)  →  TokenWeighting  →  service consumer
```

`TokenWeighting` (§3.3) inherits `IVotingPowerSource` precisely so a `ERC-COMMITMENTS-SERVICES` service manager can read normalized, checkpointed voting power without importing the full mesh interface. See that standard for the registry interface, the acceptance policy, the lifecycle callbacks, and the security considerations (deregistration vs. signing latency, stake double-counting, forfeiture-during-delegation).

## Rationale

### Three interfaces, not one `IMeshNode`

The `stake` / `releaseStake` signatures diverge across the three canonical shapes because each demands a different authorization model. A common-denominator interface would force premature unification on patterns that are not actually unified; event-based discovery (§2) is the layer where genuine commonality exists.

### EIP-1167 for mesh nodes

Mesh nodes are deployed as [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167) minimal proxy clones (~100-200k gas per clone vs. 600k-2M for full deployment). Clones are not upgradeable — an acceptable tradeoff for lightweight topology nodes that hold accounting, not custody.

## Backwards Compatibility

This extension adds new interfaces and node contracts; it changes no core `ERC-COMMITMENTS` behavior and introduces no new selectors on existing core contracts. A manager deployment with no mesh nodes is fully conformant to the core standard. Mesh nodes are discovered from their events (§2).

## Test Cases

The conformance and behavioral tests live under `test/mesh/`:

- `FanInNode.t.sol`, `FanOutNode.t.sol`, `TokenWeighting.t.sol` — per-node behavior and authorization.
- `TokenWeightingRetirement.t.sol`, `TokenWeightingWeightEpoch.t.sol` — the bounded-denom lifecycle and weight-epoch history immutability (§3.3, MESH-6).
- `MeshBackingInvariant.t.sol` — the mesh exposure/backing invariants (MESH-1, MESH-4).
- `MeshFactory.t.sol`, `MeshFactoryPolicy.t.sol` — clone deployment and implementation whitelisting.
- `Integration.t.sol`, `GasBenchmark.t.sol` — end-to-end composition and gas bounds.

## Reference Implementation

The reference implementation lives under `src/extensions/mesh/`:

- `FanInNode.sol` — `IFanIn` aggregation node (manager-credited).
- `FanOutNode.sol` — `IFanOut` distribution node.
- `TokenWeighting.sol` — `ITokenWeighting` weighting sink with checkpointed voting power and the bounded-denom lifecycle (§3.3).
- `interfaces/` — `IFanIn`, `IFanOut`, `ITokenWeighting`, `IMeshFactory` (with the node type ids).
- `MeshFactory.sol` — EIP-1167 clone deployment of whitelisted node implementations.

## Security Considerations

### Reward-token bloat

`distributeRewards` on FanOut/TokenWeighting nodes SHOULD be access-controlled and cap the per-denom reward-token set (`MAX_REWARD_TOKENS = 32`, §1). Otherwise an attacker can grow the set to the point that `stake` exceeds the block gas limit. Reference implementations use a `REWARDER_ROLE`.

### Live-block voting power

Service managers reading voting power for consensus-critical decisions SHOULD pin to a past block. Reading current state allows an operator to coordinate stake changes between signing and validation to inflate quorum contribution.

### Operator registry verification

Operator registration requires presenting a commitment where `committer == msg.sender` and `counterparty == address(registry)`. The registry verifies this by reading the commitment on-chain. Registries that skip this verification accept forged stake claims. This rule, the acceptance policy, and the delegation-lifecycle callbacks are specified normatively in [`ERC-COMMITMENTS-SERVICES`](./ERC-COMMITMENTS-SERVICES.md) §2.

## Invariants

A conformant mesh deployment MUST preserve the following. The core standard's ledger invariants (INV-1 partition, INV-3 magnitude allocation, INV-4 movement cap) are unaffected by mesh nodes — mesh accounting is virtual (liens and stake totals), and no mesh operation moves custodied capital.

| Invariant | Statement |
|---|---|
| **MESH-1 exposure bound (FanOut)** | For every staker/denom, `totalForfeitable = Σ_consumer(lien.exposure) ≤ locked × inputMaxPenaltyBps / 10_000`. Re-validated by `setOutflows` and `stake`; a violation MUST revert `ExposureAllocationExceeded`. |
| **MESH-2 portion bound (FanOut)** | For every staker/denom, `Σ_outflow(portionBps) ≤ 10_000`. A provider MAY leave a remainder unallocated. |
| **MESH-3 lien conservation (FanOut)** | Each consumer's `lien.amount ≤ locked`, and `releaseStake` MUST reject `amount > lien.amount` (`InsufficientLien`). Duplicate consumers are rejected at configuration time (`DuplicateConsumer`) so the sum of stored liens never diverges from `totalForfeitable`. |
| **MESH-4 stake conservation (FanIn / TokenWeighting)** | `totalStake[denom]` equals credited stake minus released stake; credit is manager/provider-gated, so mesh stake can never exceed the manager-verified backing that authorized it. |
| **MESH-5 bounded iteration (TokenWeighting)** | The iterated denom set size ≤ `MAX_DENOMS`, and each per-`stakeDenom` reward-token set size ≤ `MAX_REWARD_TOKENS`, so the O(denoms) voting-power queries and the reward-debt loops stay gas-bounded. |
| **MESH-6 history immutability (TokenWeighting)** | A weight retune or a `retireDenom` MUST NOT change `getVotingPowerAt` / `getTotalPowerAt` for any block at or before the change: raw stake is checkpointed and weight epochs are resolved at read time. |

The FanOut exposure bound is conservative under duplicate/last-write configuration: because duplicate consumers are rejected outright and each `releaseStake` recomputes exposure from the post-decrement lien, `totalForfeitable` never overstates the true releasable exposure against the provider's locked backing.

## Copyright

Copyright and related rights waived via [CC0](../../LICENSE).
