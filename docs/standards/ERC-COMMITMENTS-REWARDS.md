---
eip: XXXX
title: Commitments - Per-Service Cumulative Merkle Rewards
description: Per-service cumulative-merkle reward coordinator with separable root storage, activation-delay protection, and on-chain monotonicity.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-05-08
requires: 1822, 1967
---

## Abstract

This ERC defines a per-service cumulative-merkle reward coordinator and an associated reusable root-storage primitive. A **rewards coordinator** receives ERC-20 token deposits from any address, accepts a sequence of merkle roots from a configurable trusted updater, and pays out **cumulative entitlements** to earners. Each leaf is `keccak256(abi.encode(earner, token, cumulativeAmount))`; a successful claim pays `cumulativeAmount − claimed[earner][token]` and the contract enforces that this difference is never negative on-chain. New roots **supersede** old ones: an earner's storage cost across all distributions collapses to a single `(earner, token) → uint256` slot regardless of how many roots have been submitted.

A **merkle snapshot** stores roots and **owns the updater role**: the active updater, the staged updater swap, and the `submitRoot` authorization check all live on the snapshot. The snapshot is intentionally narrow and reusable beyond rewards (governance, attestations, cumulative-merkle airdrops). Each (snapshot, coordinator) pair is **per-service**: a `RewardsCoordinatorFactory` first deploys and initializes a snapshot proxy, then deploys and initializes a coordinator proxy with the snapshot's address. The snapshot has no coordinator pointer.

A configurable **activation delay** protects every submitted root and every staged updater swap. The service can disable a root before it activates; after that window closes, the root locks in — the coordinator's service-only **claim freeze** (§3.3) is the on-chain recourse against a fraudulent root that has already activated. Updater swaps use a self-contained activation-delay pattern: stage, optionally cancel, then permissionlessly activate after the delay elapses. Strict-flip semantics ensure a staged-but-not-yet-activated updater cannot submit roots even after the effective timestamp. This pattern is compatible with the convention described by `ERC-COMMITMENTS` §0.6, but conformance to that standard is not required.

## Motivation

The companion standard `ERC-COMMITMENTS` defines composable, forfeitable commitments on encumbered token backing, with **distribution strategies** (Part D there) as the general mechanism for value flows during a commitment's life. The repository also ships reward-related mechanisms with different ownership models:

- **`IndexAppreciationYield`** (`ERC-COMMITMENTS`, Reference Strategy Taxonomy): per-commitment routing of backing appreciation to a counterparty.
- **`FanOutNode`** and **`TokenWeighting`** (`ERC-COMMITMENTS-MESH` §3): node-local, Synthetix-style on-chain pro-rata distribution over mesh stakers. These contracts do not implement `IDistributionStrategy`.

Neither addresses the **AVS-shaped** distribution surface where:

1. Computation of "who earns how much" depends on **off-chain inputs** the protocol cannot observe (SLA logs, performance metrics, governance decisions).
2. Per-earner storage at scale is dominated by sparse `(earner, token) → ledger` entries; a merkle root collapses this to one hash.
3. An earner who has accumulated dust across N distributions of M tokens currently pays gas on N×M separate claims; cumulative-root semantics let them claim everything once per token.

This ERC fills that gap. It is intentionally **decoupled from `ERC-COMMITMENTS`**: the coordinator never reads commitment state on-chain, accepts free-form leaves, and works equally well for non-AVS services (frontend rewards, ecosystem grants, contributor payouts).

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### 1. Units, Roles, Constants, and Conformance

#### 1.1 Roles

| Role | Definition |
|---|---|
| **Service** | The address that controls disable, activation-delay updates, the staged updater swap, the claim freeze (§3.3), and UUPS upgrades. May be a multisig, governor, or EOA. |
| **Updater** | The address authorized to submit roots to the snapshot. May be a contract (Safe, governor, service adapter) or EOA. The updater role and its staged swap live **on the snapshot**; `submitRoot` is gated on the snapshot's own `activeUpdater()`. |
| **Earner** | The address whose `(token, cumulativeAmount)` leaf grants entitlement. The earner is the only party authorized to call `processClaim` for their own leaves (this standard defines no claim-on-behalf path). |
| **Funder** | Any address that calls `depositRewards`. The coordinator records nothing about the funder beyond the event. |
| **Factory** | The contract that deploys (snapshot, coordinator) pairs. |

#### 1.2 Constants

| Constant | Value | Normative |
|---|---|---|
| `MIN_ACTIVATION_DELAY` | `86_400` seconds (1 day) | MUST |

The constant matches `MIN_CHALLENGE_WINDOW` in `ERC-COMMITMENTS` by convention. Both express "minimum time for an affected party to react"; reusing the value keeps timing semantics consistent for services that consume both standards.

#### 1.3 Conformance levels

| Part | Status | Depends on |
|---|---|---|
| **Part R — Rewards Coordinator** | normative | ERC-1822, ERC-1967 |

This standard is a single Part. A conformant implementation MUST implement all sections of Part R. Implementations MAY ship additional helpers (factory, signed-envelope updater adapters, frontend SDKs); these are out of scope for normative conformance.

#### 1.4 EVM version requirement

Reference implementations use transient-storage reentrancy guards (EIP-1153) and therefore require the **Cancun** hardfork or later. Implementations targeting earlier execution layers MAY substitute a classical storage-slot reentrancy guard; the security property required is *non-reentrancy*, not the specific implementation.

### 2. Conceptual model

```
[ Funder ]                                     [ Earners ]
    |                                                ^
    | depositRewards(token, amount)                  | processClaim(rootId, token, cum, proof)
    v                                                |
+---+------------------------------------------------+---+
|             CommitmentsRewardsCoordinator              |
|  - claimed[earner][token]                              |
|  - claim freeze (service-only emergency pause)         |
|  - bound snapshot (immutable post-init)                |
+----------------------+--------------------------------+
                       |
                       v  isActive(rootId)
                +------+------+
                | MerkleSnapshot |
                |  - roots       |
                |  - service     |
                |  - activationDelay               |
                |  - active updater (with §0.6 staged swap) |
                +------------------+
                                   ^
                                   | submitRoot(merkleRoot)
                                   |
                          [ Updater (any address) ]
```

Each service deploys its own (`snapshot`, `coordinator`) pair via the factory. Tokens flow into the coordinator (`depositRewards`); roots flow into the snapshot (`submitRoot`); cumulative claims are paid out by the coordinator (`processClaim`).

### 3. Coordinator interface

A conformant coordinator MUST expose:

```solidity
interface ICommitmentsRewardsCoordinator {
    event RewardsDeposited(address indexed depositor, address indexed token, uint256 amount);
    event RewardsClaimed(
        bytes32 indexed rootId,
        address indexed earner,
        address indexed token,
        uint256 amountPaidOut,
        uint256 cumulativeAfter
    );
    event ClaimsFrozenSet(address indexed by);
    event ClaimsUnfrozen(address indexed by);
    // Standardized ERC-COMMITMENTS §D.7 payout event, emitted on every successful claim.
    // strategy = address(this); recipient = earner; commitmentId = 0 (leaves carry no
    // per-commitment attribution); context = rootId. First three args indexed.
    event DistributionPaid(
        address indexed strategy,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint256 commitmentId,
        bytes32 context
    );

    error ZeroAmount();
    error ZeroAddress();
    error NotService();
    error RootNotActive();
    error InvalidProof();
    error CumulativeRegression();
    error NoOp();
    error ClaimsFrozen();
    error NotFrozen();
    error AlreadyFrozen();

    function depositRewards(address token, uint256 amount) external;
    function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] calldata proof)
        external returns (uint256 amountPaidOut);

    // Emergency claim freeze (§3.3)
    function freeze() external;
    function unfreeze() external;
    function frozen() external view returns (bool);

    function claimed(address earner, address token) external view returns (uint256);
    function snapshot() external view returns (IMerkleSnapshot);
    function service() external view returns (address);
}
```

The updater role and its staged swap (`stageUpdater` / `activateUpdater` / `cancelStagedUpdater` / `activeUpdater` / `pendingUpdater`) do **not** live on the coordinator — they live on the snapshot (§4.5), so the snapshot owns its own `submitRoot` authorization. Coordinators MUST NOT expose a competing updater surface.

#### 3.1 `depositRewards`

`depositRewards(token, amount)` MUST be callable by any address. It MUST `safeTransferFrom` the funder, MUST emit `RewardsDeposited`, and MUST revert `ZeroAmount` if `amount == 0` or `ZeroAddress` if `token == address(0)`.

The coordinator does NOT track per-root or per-funder obligations. A claim succeeds only if the contract holds enough of the token; otherwise the token transfer reverts. The updater is responsible for not over-promising (see §8).

#### 3.2 `processClaim`

`processClaim(rootId, token, cumulativeAmount, proof)` MUST verify all of the following before paying out:

0. `token != address(0)` (else revert `ZeroAddress`).
1. Claims are not frozen (else revert `ClaimsFrozen`, §3.3).
2. `snapshot.isActive(rootId) == true` (else revert `RootNotActive`).
3. `MerkleProof.verifyCalldata(proof, rootId, keccak256(abi.encode(msg.sender, token, cumulativeAmount)))` returns `true` (else revert `InvalidProof`).
4. `cumulativeAmount >= claimed[msg.sender][token]` (else revert `CumulativeRegression`). This is **INV-R1's on-chain enforcement** — the standard's load-bearing safety property.
5. `amountPaidOut := cumulativeAmount - claimed[msg.sender][token]` is non-zero (else revert `NoOp`). Zero-delta re-claims fail fast; the coordinator does not silently no-op.

The coordinator does not check its own balance first: if it holds less than `amountPaidOut`, the `safeTransfer` reverts.

If all checks pass, the coordinator MUST update `claimed[msg.sender][token] = cumulativeAmount` **before** the external transfer (CEI), then `safeTransfer` the payout, then emit `RewardsClaimed` and the standardized `DistributionPaid(address(this), msg.sender, token, amountPaidOut, 0, rootId)` (§D.7 of `ERC-COMMITMENTS`; `commitmentId = 0`, `context = rootId`). The function MUST be reentrancy-guarded.

`msg.sender` is the leaf's earner. This standard does NOT support claim-on-behalf; an authorized-claim path (e.g. `processClaimFor` with EIP-712) MAY be added by a future revision.

#### 3.3 Emergency claim freeze

The disable window (§4.2) protects only against roots that have **not yet activated**. The freeze is the coordinator-side recourse against a fraudulent root that has already activated:

- `freeze()` — service-only. While frozen, `processClaim` MUST revert `ClaimsFrozen`. Reverts `AlreadyFrozen` if already engaged. Emits `ClaimsFrozenSet(by)`.
- `unfreeze()` — service-only. Reverts `NotFrozen` if not frozen. Emits `ClaimsUnfrozen(by)`.
- `frozen()` — view of the current state.

The freeze halts **all** claim processing across all roots and tokens (it is a circuit breaker, not a per-root disable); deposits are unaffected. It is deliberately synchronous — an emergency pause routed through an activation delay would defend nothing — matching the core standard's §0.6 rule that a true emergency path be a separate, explicitly-named function with its own role guard, never reusable as a parameter-change vector.

Updater management lives on the snapshot; see §4.5.

#### 3.4 No protocol fee

The coordinator MUST NOT take a fee on `depositRewards` or `processClaim`. The implementation MUST NOT expose any state path that introduces a fee, even via upgrade. This is a one-way commitment: implementers who want fee economics MAY build a wrapper layer; protocol-level fees are out of scope by design.

### 4. Snapshot interface

A conformant snapshot MUST expose:

```solidity
interface IMerkleSnapshot {
    struct RewardsRoot {   // keyed by the root itself: rootId == merkleRoot
        uint64 submittedAt;
        uint64 activeAt;
        bool disabled;
    }

    event RootSubmitted(bytes32 indexed rootId, uint64 submittedAt, uint64 activeAt);
    event RootDisabled(bytes32 indexed rootId);
    event ActivationDelayUpdated(uint64 oldDelay, uint64 newDelay);

    event UpdaterPending(address indexed newUpdater, uint64 effectiveAt);
    event UpdaterActivated(address indexed oldUpdater, address indexed newUpdater);
    event UpdaterStageCancelled(address indexed stagedUpdater);

    error NotUpdater();
    error NotService();
    error RootAlreadySubmitted();
    error RootNotFound();
    error RootAlreadyDisabled();
    error RootAlreadyActive();
    error ZeroRoot();
    error ZeroAddress();
    error ActivationDelayBelowFloor();
    error NoStagedUpdater();
    error StagedUpdaterNotReady();
    error StagedUpdaterAlreadyExists();

    function submitRoot(bytes32 merkleRoot) external returns (bytes32 rootId);
    function disableRoot(bytes32 rootId) external;
    function setActivationDelay(uint64 newDelay) external;

    // §0.6 staged updater swap (§4.5)
    function stageUpdater(address newUpdater) external;
    function activateUpdater() external;
    function cancelStagedUpdater() external;

    function rootById(bytes32 rootId) external view returns (RewardsRoot memory);
    function isActive(bytes32 rootId) external view returns (bool);

    function service() external view returns (address);
    function activationDelay() external view returns (uint64);
    function minActivationDelay() external view returns (uint64);

    function activeUpdater() external view returns (address);
    function pendingUpdater() external view returns (address newUpdater, uint64 effectiveAt);
}
```

#### 4.1 `submitRoot`

`submitRoot(merkleRoot)` MUST verify `msg.sender == activeUpdater()` (the snapshot's own updater state, §4.5 — else revert `NotUpdater`). MUST revert `ZeroRoot` if `merkleRoot == 0`, `RootAlreadySubmitted` if `roots[merkleRoot].submittedAt != 0`. Sets `submittedAt = block.timestamp`, `activeAt = submittedAt + activationDelay`, `disabled = false`. Emits `RootSubmitted`; the event log is the submission-order record. Returns `rootId == merkleRoot` (content-hash identity).

#### 4.2 `disableRoot`

`disableRoot(rootId)` MUST be service-only. MUST revert `RootNotFound` if `roots[rootId].submittedAt == 0`, `RootAlreadyDisabled` if already disabled, `RootAlreadyActive` if `block.timestamp >= activeAt`. Sets `disabled = true` and emits.

The activation-delay window IS the disable window. After `activeAt`, the root is locked in and cannot be disabled. Optimistic / permissionless challenges are out of scope for this standard.

#### 4.3 `setActivationDelay`

`setActivationDelay(newDelay)` MUST be service-only. MUST revert `ActivationDelayBelowFloor` if `newDelay < minActivationDelay`. Mutation is **immediate-effect**: the new delay applies to roots submitted after this call; roots already in flight retain their submitted-time `activeAt`.

The §0.6 activation-delay pattern protects parameters that affect *existing* positions; `activationDelay` only affects *future* roots, so synchronous mutation is appropriate.

#### 4.4 Bindings

`service()` MUST be set at initialization and MUST NOT be mutable. `minActivationDelay()` MUST be set at initialization and MUST NOT be mutable. The **coordinator → snapshot** binding (`coordinator.snapshot()`, §3) MUST be set at the coordinator's initialization and MUST NOT be mutable; the snapshot itself carries **no** coordinator pointer — the updater state lives on the snapshot precisely so the snapshot never needs to read the coordinator, which breaks the deploy-time circular dependency between the pair.

#### 4.5 Staged updater swap (on the snapshot)

The snapshot MUST implement this activation-delay pattern for updater changes:

- `stageUpdater(newUpdater)` — service-only. Reverts `ZeroAddress` if `newUpdater == 0`, `StagedUpdaterAlreadyExists` if a stage exists. Sets `pendingUpdater = newUpdater`, `pendingUpdaterEffectiveAt = block.timestamp + activationDelay`. Emits `UpdaterPending`.
- `activateUpdater()` — **permissionless** after `pendingUpdaterEffectiveAt`. Reverts `NoStagedUpdater` if no stage, `StagedUpdaterNotReady` if `block.timestamp < pendingUpdaterEffectiveAt`. Atomically: stores `pendingUpdater` into the active-updater slot, clears the staging slots, emits `UpdaterActivated`.
- `cancelStagedUpdater()` — service-only. Reverts `NoStagedUpdater` if no stage. Clears the staging slots, emits `UpdaterStageCancelled`.

**Strict-flip semantics.** `activeUpdater()` MUST return only the activated value, never the staged value, even after `pendingUpdaterEffectiveAt`. A staged-but-not-yet-activated updater that attempts `submitRoot` MUST fail the §4.1 auth check. This closes the attack vector where a captured service operator pairs a synchronous updater swap with a fraudulent root submission.

### 5. Storage and EIP-7201

Both `MerkleSnapshot` and `CommitmentsRewardsCoordinator` SHOULD use EIP-7201 namespaced storage:

- `commitments.rewards.merkle.snapshot.storage` for snapshot state.
- `commitments.rewards.coordinator.storage` for coordinator state.

Storage layouts MUST be append-only across contract revisions. Implementations MUST include a slot-derivation regression test that asserts the namespace constants resolve to the expected slot.

### 6. UUPS upgrades

Both contracts SHOULD support UUPS upgrades (EIP-1822 + EIP-1967). The upgrade authority MUST be the service. The reference factory stores immutable implementation addresses used for new deployments and creates standard `ERC1967Proxy` instances; each deployed proxy remains independently upgradeable by its service.

### 7. Invariants

#### INV-R1 — Cumulative-claim monotonicity

For every coordinator instance and every `(earner, token)` tuple:

- `claimed[earner][token]` MUST be monotonically non-decreasing across the contract's lifetime.
- After any successful `processClaim(rootId, token, cumulativeAmount, proof)`, the value of `claimed[earner][token]` MUST equal `cumulativeAmount`.

INV-R1 MUST be enforced on-chain at claim time. The clause `cumulativeAmount >= claimed[msg.sender][token]` in §3.2 is the load-bearing check. The merkle proof attests to `cumulativeAmount`; the on-chain monotonicity check makes the proof safe to act on without trusting the updater's correctness on this dimension.

A conformance test suite MUST include at least one invariant run that drives random sequences of deposit / submit / claim operations and asserts INV-R1 across all earners.

### 8. Notes and non-requirements

- **No protocol-level operator commission.** Operators that want to take a cut of distributed rewards MUST do so off-chain in the updater's calculation. The coordinator is policy-neutral.
- **No reward-token whitelist.** Each service sets its own policy off-chain; the coordinator accepts any ERC-20 with standard `transferFrom` / `transfer` semantics.
- **No cap on simultaneous reward tokens.** The coordinator does not iterate per-token at any state-mutating call site.
- **No optimistic challenge layer.** The activation delay IS the dispute window. Bond-and-challenge mechanisms are out of scope for this standard; integrators that need stronger dispute semantics MAY wrap the coordinator in such a layer.
- **No cross-chain rewards.** Each (snapshot, coordinator) pair is single-chain.
- **No auto-compounding.** Earners who want to redeposit claimed tokens into a commitment MUST do so client-side.
- **Funding semantics are off-chain.** The coordinator does NOT verify that submitted roots are funded. The updater is responsible for not promising more cumulative tokens than the coordinator holds. An under-funded coordinator's claim reverts in the token transfer rather than fail-closed at submit. This is the standard's load-bearing trust assumption — integrators MUST audit their updater accordingly.

### 9. Cross-reference: the `ERC-COMMITMENTS` payout-event vocabulary

The coordinator is a standalone, self-custodied reward pool with off-chain-computed entitlements and caller-validated cumulative claims. It does **not** implement `IDistributionStrategy` and is **not** bindable to commitments: it holds its own balance, is never called by the manager, and its claim path never reads commitment state. It shares exactly one compatibility surface with `ERC-COMMITMENTS`: the **`DistributionPaid` payout-event vocabulary** (§D.7). Every successful `processClaim` emits `DistributionPaid(address(this), earner, token, amountPaidOut, 0, rootId)` alongside `RewardsClaimed`, so an indexer can consume payouts from commitment-bound strategies and standalone coordinators through one event shape. `commitmentId = 0` because merkle leaves carry no per-commitment attribution. Event compatibility does not create a conformance dependency in either direction.

A coordinator instance MAY serve commitment-bound earners, standalone earners, or both — that choice is an implementer decision outside both standards, and requires no change to the coordinator's surface because it distributes to raw `(earner, token)` leaves either way.

When choosing between this coordinator and an `IndexAppreciationYield`-style strategy: the coordinator is the right primitive when distribution is **targeted** (specific earners), **delayed** (activation window), and weighted **off-chain**; index-appreciation premiums are the right primitive when value flows continuously from a committer's own backing to their counterparty. The two are orthogonal and a service MAY use both. Implementers SHOULD document which primitive they use for each value-flow and why.

## Rationale

### Sibling standard, not a Part of `ERC-COMMITMENTS`

The coordinator's claim path never reads commitment state on-chain; it accepts free-form `(earner, token, cumulativeAmount)` leaves and serves non-commitment earners equally well. A generic merkle distributor does not belong inside the commitment-primitive frame of `ERC-COMMITMENTS` even though it ships in the same repo. Sibling-standard framing is honest about the decoupling and lets services adopt the coordinator without claiming Parts A–D conformance. The one shared surface is deliberately minimal: the coordinator emits the standardized `DistributionPaid` payout event (§9) so a single indexer spans both commitment-bound strategies and standalone coordinators, without the coordinator implementing `IDistributionStrategy` or becoming commitment-bindable.

### Snapshot and coordinator as separate contracts

The merkle snapshot is a reusable primitive: it's the same shape that backs governance attestations, cumulative-merkle airdrops, and any other "submit a root, query roots" pattern. Bundling it into the coordinator would couple two concerns that don't share a trust boundary. Separating them preserves the snapshot's reuse story at the cost of one extra ERC-1967 proxy deploy per service.

### Immutable coordinator-to-snapshot binding

The coordinator's `snapshot` field is set once at initialization and never mutated. The binding is deliberately one-way: the snapshot stores no coordinator address and authorizes `submitRoot` from its own updater state. This lets the factory initialize the snapshot first and then create the coordinator without address prediction or an uninitialized-proxy phase.

### `processClaim` reverts on zero-delta

Three options for re-claiming the same cumulative: (a) revert, (b) silently no-op, (c) emit a zero-amount event. Revert was chosen because it (i) saves indexer noise, (ii) matches the codebase's general fail-fast posture, (iii) gives the caller a clear signal to check state before retrying. Silent success conflates "I did work" with "you did work to re-call me."

### `processClaim` is caller-only earner

Claim-on-behalf (`processClaimFor` with EIP-712) is deferred to a future revision. The motivation for the deferral is the "claim-griefing" surface: if Alice authorizes a relayer to claim for her at any time, an adversarial relayer can claim at the wrong moment (e.g., right before a market move) and force Alice to internalize losses. This standard intentionally avoids that surface.

### Strict-flip on `activeUpdater()`

If `activeUpdater()` returned the staged value once `pendingUpdaterEffectiveAt` elapsed (without requiring an explicit `activateUpdater()` call), a captured service operator could pair an updater swap with a fraudulent root submission inside the activation window. Strict-flip means an additional permissionless call (which any observer can make) is required to land the swap, giving the disable window real teeth.

### `activationDelay` and the updater both live on the snapshot

The delay is consumed at root submission time, where roots live. The **updater** state (and its staging surface) also lives on the snapshot, for two reasons: (a) `submitRoot` is the only call the updater role gates, so placing the role next to the call it authorizes keeps the snapshot self-contained (no cross-contract read on the hot auth path); (b) the factory can deploy and initialize the pair sequentially, without a circular address dependency. A coordinator that exposes a competing updater-staging surface is not conformant. The coordinator keeps the roles that gate its own surface: the service (freeze, upgrades) and the earner (claims).

### No protocol fee, immutable

The protocol exists to coordinate, not to extract. Allowing a fee path even with activation-delayed mutability would leave services unsure whether the coordinator they integrate with today might charge tomorrow. Making this a one-way commitment provides integrators with an unconditional guarantee. Services that want to charge MAY wrap the coordinator in a fee-collecting layer; that is an integrator decision, not a protocol one.

### Updater swaps are delayed

The naive "synchronous `setUpdater(address)`" lets a captured service operator swap to a captured updater and submit a fraudulent root in adjacent transactions, defeating the activation-delay protection on the *root*. Routing the swap through `pendingUpdater` + `effectiveAt` extends the same guarantee to the *role itself*: a swap is observable on-chain throughout the delay, and the disable surface remains symmetric on both kinds of state change.

### `MIN_ACTIVATION_DELAY = MIN_CHALLENGE_WINDOW`

Both express "minimum time for an affected party to react." Reusing `ERC-COMMITMENTS`'s `MIN_CHALLENGE_WINDOW` constant rather than introducing a parallel `MIN_REWARDS_ACTIVATION_DELAY` keeps timing semantics consistent for services that consume both standards. The default at initialization is 7 days, mirroring [ELIP-001](https://github.com/eigenfoundation/ELIPs/blob/main/ELIPs/ELIP-001.md)'s commission-change delay.

### Multi-token leaves

Cross-token earners pay one call's gas for all tokens in a single root, instead of paying per-token. Independent per-token cumulative tracking still holds (§3.2's monotonicity check is per `(earner, token)`).

### Per-service factory

Each service owns its trust boundary; mixing services on a global coordinator would create cross-contamination of disable authority and updater identity. Per-service deployment mirrors `MeshFactory` in the `ERC-COMMITMENTS` mesh extension.

## Backwards Compatibility

This is a new standard. It depends on the existing ERC-1822 (UUPS) and ERC-1967 (proxy storage slots). It does **not** depend on `ERC-COMMITMENTS`, `ERC-4626`, or any AVS-specific protocol. Reuse of the `MIN_CHALLENGE_WINDOW` value from `ERC-COMMITMENTS` is by convention only — implementations consuming both standards SHOULD use the same numeric value but are not required to.

## Test Cases

The reference implementation ships an invariant suite at
`test/rewards/conformance/RewardsCoordinatorInvariants.t.sol` (in the reference
repository this document lives in) exercising INV-R1 (cumulative-claim
monotonicity) across randomized sequences of deposit, submit, time-warp,
and claim operations.

The minimal worked example below illustrates the on-chain monotonicity
check, the zero-delta revert, and the regression-rejection branch.

**Worked example — cumulative-claim monotonicity (INV-R1)**

Setup: A coordinator instance bound to a snapshot, single reward token
`T`, single earner Bob. The coordinator has been funded with `1000` of
`T` via `depositRewards`. `claimed[Bob][T] = 0`.

1. The active updater calls `snapshot.submitRoot(R1)` for a root `R1`
   attesting that Bob's cumulative entitlement is `100` of `T`. After
   `activationDelay` elapses, `R1` is active.

2. Bob calls `processClaim(R1, T, 100, proof)`.
   - `cumulativeAmount (100) ≥ claimed[Bob][T] (0)` ✓
   - `amountPaidOut = 100 − 0 = 100`
   - State update before transfer (CEI): `claimed[Bob][T] := 100`.
   - Coordinator `safeTransfer`s `100` of `T` to Bob.
   - INV-R1 holds: `100 ≥ 0` and the post-state equals `cumulativeAmount`.

3. Bob attempts a re-claim under `R1` with `processClaim(R1, T, 100, proof)`.
   - `cumulativeAmount (100) ≥ claimed[Bob][T] (100)` ✓
   - `amountPaidOut = 100 − 100 = 0`
   - Reverts `NoOp` (zero-delta re-claim is rejected fast).

4. The updater submits `R2` attesting Bob's cumulative is `250` of `T`.
   After `activationDelay`, `R2` is active.

5. Bob calls `processClaim(R2, T, 250, proof)`.
   - `cumulativeAmount (250) ≥ claimed[Bob][T] (100)` ✓
   - `amountPaidOut = 250 − 100 = 150`
   - `claimed[Bob][T] := 250`. Bob has now received `250` total across
     two claims; his per-token storage cost is one slot regardless of
     root count.

6. Adversarial regression: a buggy or malicious updater submits `R3`
   attesting Bob's cumulative is `200` of `T` (less than already-claimed).
   After `activationDelay`, Bob calls `processClaim(R3, T, 200, proof)`.
   - `cumulativeAmount (200) ≥ claimed[Bob][T] (250)` ✗
   - Reverts `CumulativeRegression`. The on-chain monotonicity check is
     load-bearing here — without it, the merkle proof alone would let a
     buggy updater contradict prior payouts.

## Reference Implementation

A reference implementation lives in the `commitments` repository:

- `src/extensions/rewards/MerkleSnapshot.sol`
- `src/extensions/rewards/CommitmentsRewardsCoordinator.sol`
- `src/extensions/rewards/RewardsCoordinatorFactory.sol`
- `src/extensions/rewards/storage/MerkleSnapshotStorage.sol`
- `src/extensions/rewards/storage/CommitmentsRewardsCoordinatorStorage.sol`
- `src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol`
- `src/extensions/rewards/interfaces/IMerkleSnapshot.sol`

Tests under `test/rewards/` and conformance suite at `test/rewards/conformance/RewardsCoordinatorInvariants.t.sol`.

A reference quorum-validated updater built on an off-chain `merkler` component is specified separately and is **non-normative** with respect to this standard — the coordinator works with any address as updater (D4 of the design scope).

## Security Considerations

### Funding integrity

The coordinator does NOT verify that submitted roots are funded. A malicious or buggy updater can publish a root attesting earner cumulatives that exceed the coordinator's token balance. Such claims revert in the token transfer at claim time. This is by design — alternatives (per-root funding tracking, atomic fund-and-submit) trade simplicity for narrower functionality. Integrators MUST audit their updater's accounting and MAY require the updater to publish reconciliation reports.

### Updater capture

If the active updater is compromised, the attacker can submit fraudulent roots up to the coordinator's token balance. The activation delay is the first defense: the service can disable a malicious root before `activeAt` lands. If a fraudulent root slips past the window and activates, the coordinator's `freeze()` (§3.3) is the second defense — it halts all claim processing while the service stages an updater swap and (via upgrade or a fresh deployment) retires the poisoned root. Selecting the right delay is a per-service trade-off between (a) reaction time after a malicious root surfaces and (b) latency for legitimate updates.

### Service capture

If the service authority is captured, the attacker can stage an updater swap and `cancelStagedUpdater` cycles to disrupt distributions, can disable legitimate roots within the activation window, can `freeze()` claim processing indefinitely (a liveness denial, never a fund extraction — frozen funds stay in the coordinator), and can upgrade the contract. The stage/cancel cycle is particularly cheap to weaponise: each round is two service-only calls and emits `UpdaterPending` / `UpdaterStageCancelled` events that confuse external monitors and indexers without ever activating a malicious updater. Mitigations: (a) deploy the service as a multisig with N-of-M signers; (b) add an external monitor that alerts on `UpdaterPending` / `UpdaterStageCancelled` / `RootDisabled` events; (c) consider non-upgradeable wrappers if upgrade authority is too sensitive for the service's threat model; (d) for services with high event-stream sensitivity, wrap `stageUpdater` / `cancelStagedUpdater` in a contract that enforces a minimum hold-time between successive stage/cancel cycles or rate-limits cancellations, so a captured service cannot generate stage-event spam at zero cost.

### Re-entrancy

`processClaim` follows CEI: the `claimed` mapping is updated before the `safeTransfer`. Combined with `ReentrancyGuardTransient`, this prevents both the standard re-entrancy attack and the more subtle "claim same root twice in nested calls" pattern.

### Factory deployment initialization

The factory uses ordinary `CREATE` through standard `ERC1967Proxy` constructors, with initializer calldata supplied atomically at proxy construction. There is no predictable-address or uninitialized-proxy phase for a front-runner to claim. Integrators MUST treat the addresses returned by `deployCoordinator` and emitted by `CoordinatorDeployed` as authoritative; the factory does not promise deterministic addresses.

### Activation delay too short

Setting `activationDelay` near the floor (1 day) leaves the service with a narrow disable window. Services SHOULD default to 7 days unless their threat model supports shorter windows. The floor is enforced at initialization and at every `setActivationDelay` call.

### Cross-token contamination

`processClaim` operates on a single `(earner, token)` pair. A regression on token A does not affect token B claims; tests assert this explicitly. Implementations MUST NOT introduce cross-token state.

### Storage layout safety

EIP-7201 namespaced storage prevents proxy collision. Implementations MUST extend layouts only by appending fields, and SHOULD include a slot-derivation regression test that asserts the namespace constants resolve to the expected EIP-7201 slot.

## Conformance Harness

A conformant implementation MUST include at minimum:

- **Slot test.** Asserts both EIP-7201 slot constants resolve correctly.
- **Integration test.** Factory → deposit → submit → activate → claim full lifecycle, plus the malicious-updater-swap-blocked branch.
- **Invariant test.** A handler-driven fuzz suite over deposit / submit / time-warp / claim sequences, asserting INV-R1 monotonicity, INV-R1 upper-bound, total solvency, and balance-matches-ledger invariants for at least 256 runs / 128k handler calls.
- **Adversarial coordinator tests.** Each error path in §3.2 and §3.3 MUST have a dedicated unit test.

The reference implementation's test suite (`test/rewards/`, `test/rewards/conformance/`) demonstrates a complete harness.

---

## Copyright

Copyright and related rights waived via [CC0](../../LICENSE).
