---
eip: XXXX
title: Commitments - Operator Services and Stake-Weighted Validation
description: Operator registry, checkpointed voting-power source, and stake-weighted signature validation that lets operator services consume commitment stake, as an extension to ERC-COMMITMENTS.
author: Jake Hartnell (@jakehartnell)
discussions-to: https://ethereum-magicians.org/t/<TBD>
status: draft
type: Standards Track
category: ERC
created: 2026-06-16
requires: ERC-COMMITMENTS, 712, 1271, 1822, 1967
---

## Abstract

This ERC extends the core [`ERC-COMMITMENTS`](./ERC-COMMITMENTS.md) standard with the **services layer** — the contracts that turn aggregated commitment stake into a security guarantee an operator service (an AVS, an oracle network, an off-chain compute market, a cross-chain message validator, ...) can rely on. It specifies three normative surfaces:

1. **`IOperatorRegistry`** — operator registration and delegation backed by commitments naming the registry as counterparty, the delegation-lifecycle callbacks (`onDelegationReleased` / `onDelegationForfeited`) the manager invokes on release and forfeit, and the required-token / arbiter / penalty-floor **acceptance policy** the registry enforces on every commitment it accepts.
2. **`IVotingPowerSource`** — the narrow, checkpointed read surface (current and at-a-past-block voting power, per address and in aggregate) a service consumes to read its operator set's weight without importing the full mesh or registry interface.
3. **`IServiceManager`** + [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) — stake-weighted signature validation: signing-key management, absolute-threshold and quorum-fraction configuration, sorted-signer envelopes, and a **reference-block staleness** rule (`maxReferenceBlockAge`) that forces every validation against a recent operator-set snapshot.

This document is the normative home of the operator registry (`IOperatorRegistry`) and the service-manager layer (`IServiceManager` + `IOperatorServiceRegistry`). The [mesh extension](./ERC-COMMITMENTS-MESH.md) references the registry interface specified here rather than redefining it, and supplies the aggregation topology (`IFanIn`, `IFanOut`, `ITokenWeighting`) an `IVotingPowerSource` composes over.

## Motivation

Commitments produce stake; services consume it. The core standard names "service-compatible" consumption as a goal, the [mesh extension](./ERC-COMMITMENTS-MESH.md) specifies the aggregation topology that normalizes stake into voting power, and the independent [rewards standard](./ERC-COMMITMENTS-REWARDS.md) can distribute off-chain-computed entitlements to operators or other earners. The piece between aggregated stake and a usable security guarantee — *how a service onboards operators, reads their weight at a pinned block, and validates that a quorum of them signed a statement* — had no normative home.

Three concerns motivate a dedicated standard:

1. **Verifiable operator sets.** A service must be able to compute its forfeitable surface from on-chain state, not operator self-reports. Registration through a commitment whose `committer`, `counterparty`, `arbiter`, and `token` the registry verifies on-chain makes operator and delegator stake cryptographically attributable.
2. **Decoupled stake accounting.** Signature validation should not be welded to a single stake source. An `IVotingPowerSource` indirection lets an ECDSA service manager today — and a BLS service manager tomorrow — read the same checkpointed weight without re-architecture.
3. **Snapshot-pinned consensus.** A service that reads *current* stake while validating a signed statement lets an operator coordinate stake changes between signing and validation to inflate their quorum contribution, and lets a just-deregistered operator keep signing. Pinning validation to a recent past block, while still requiring current registration, closes both windows.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

Terms not defined here — **committer**, **counterparty**, **arbiter**, **backing token**, **commitment manager**, **commitment**, **exposure allocation**, **distribution strategy**, **unbond** — are defined in the core standard. **Voting power**, **denom**, and the mesh node interfaces (`IFanIn`, `IFanOut`, `ITokenWeighting`) are defined in the [mesh extension](./ERC-COMMITMENTS-MESH.md). The manager referenced throughout is an `ERC-COMMITMENTS` Part A/C/D conformant commitment manager.

An **operator service** is any system that derives crypto-economic security from a set of commitments naming a shared arbiter. An **operator set** is that set of commitments, plus the operators and delegators behind them.

### 1. Conformance and constants

| Section | Status | Depends on |
|---|---|---|
| **§2 Operator registry** (`IOperatorRegistry`) | normative-optional | `ERC-COMMITMENTS` Parts A, C |
| **§3 Voting-power source** (`IVotingPowerSource`) | normative-optional | independent; composes with [mesh](./ERC-COMMITMENTS-MESH.md) §3.3 |
| **§4 Service manager / quorum validation** (`IServiceManager`, ERC-1271) | normative-optional | §3; eligibility from §2 |

The three sections are independently adoptable. A service MAY consume `IOperatorRegistry.getOperator(operator).totalDelegatedStake` directly without §3–§4; a §4 service manager REQUIRES an §3 voting-power source and a §2 eligibility source. None of the three is required for core conformance — a manager deployment with no services is fully conformant to the core.

This document does not specify BLS aggregation. The current reference service manager validates ECDSA signatures; the `IVotingPowerSource` indirection (§3) is the explicit seam at which a future BLS service manager reuses the same stake accounting. A BLS sibling is anticipated future work and is out of scope here. Also out of scope: any change to core custody, ledger, or two-phase-forfeit semantics — this extension is a pure consumer of those.

| Constant | Value | Normative |
|---|---|---|
| `DEFAULT_MAX_REFERENCE_BLOCK_AGE` | `256` blocks (≈1h at 12s/block) | SHOULD (§4.6) |
| `MAX_DELEGATIONS_PER_OPERATOR` (default) | `1024` per operator | SHOULD (§2.2) |
| `MAX_METADATA_URI_LENGTH` | `512` bytes | SHOULD (§2.6) |

`DEFAULT_MAX_REFERENCE_BLOCK_AGE` is a window large enough to absorb honest envelope-signing latency yet too short to outrun deregistration (see Security Considerations). The delegation cap bounds the gas of `getOperatorSet`-driven iteration and per-operator release/forfeit fan-out; the metadata cap bounds the gas of a metadata write. All three are reference defaults — implementations MAY tune them.

### 2. Operator registry (`IOperatorRegistry`)

An operator registry is the on-chain directory of an operator service. Each commitment in the operator set MUST have `counterparty == address(registry)` and `arbiter == serviceArbiter`; the `committer` is either an operator (self-stake) or a delegator. Arbiter selection is **per-service, not per-operator** — every commitment in the set names the same arbiter, fixing the trust assumption at the service rather than negotiating it per operator. This is the structural difference from per-operator-forfeiter restaking designs.

The registry recognizes two commitment shapes:

- **Self-stake.** An operator's own stake. The registry stores `selfStakeCommitmentId` per operator and REQUIRES an active self-stake for `register`. An operator MUST have an active self-stake to accept delegations.
- **Delegation.** A delegator's stake routed to a named operator. The registry tracks `(operator, commitmentId, staker)` for callback routing.

```solidity
interface IOperatorRegistry {
    struct Operator {
        address operator;
        uint64  registeredAt;
        bool    active;
        uint256 selfStakeCommitmentId;
        uint256 totalDelegatedStake;     // self + delegated, in required-token units
        uint32  activeDelegationCount;   // includes the self-stake (counts as 1)
        bool    selfStakeActive;         // true while the self-stake commitment is still tracked
    }

    struct OperatorMetadata {
        string  uri;
        bytes32 contentHash;
        uint64  updatedAt;               // 0 = never set
    }

    // --- Events ---
    event OperatorRegistered(address indexed operator, uint256 commitmentId, uint256 stake);
    event OperatorDeregistered(address indexed operator);
    event DelegationCreated(address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount);
    event DelegationReleased(address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 amount);
    event DelegationForfeited(address indexed staker, address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount);
    event OperatorBelowMinStake(address indexed operator, uint256 currentStake, uint256 minStake);
    event MinOperatorStakeUpdated(uint256 oldValue, uint256 newValue);
    event MaxDelegationsPerOperatorUpdated(uint256 oldValue, uint256 newValue);
    event OperatorMetadataUpdated(address indexed operator, string uri, bytes32 contentHash, uint64 timestamp);
    event AcceptancePolicyTightened(uint16 oldFloor, uint16 newFloor);
    event StrategyAllowlistUpdated(address indexed strategy, bool allowed);
    event ForfeitRecipientPending(address indexed operator, uint256 indexed commitmentId, uint256 forfeitedAmount);
    event ForfeitRecipientSwept(address indexed token, address indexed payTo, uint256 amount);
    event MeshWired(address indexed tokenWeighting, address indexed meshFactory);
    event OperatorFanInDeployed(address indexed operator, address indexed fanIn, bytes32 stakeDenom);
    event NonceIncreased(address indexed account, uint256 newNonce);

    // --- Registration / delegation ---
    function register(uint256 commitmentId) external;
    function deregister() external;
    function delegate(address operator, uint256 commitmentId) external;

    // --- Signature-delegated registration / delegation (§2.8) ---
    function registerWithSig(address operator, uint256 commitmentId, uint256 deadline, uint256 nonce, bytes calldata signature) external;
    function delegateWithSig(address staker, address operator, uint256 commitmentId, uint256 deadline, uint256 nonce, bytes calldata signature) external;
    function increaseNonce() external;
    function sigNonces(address account) external view returns (uint256);

    // --- Manager → registry lifecycle callbacks (§2.4) ---
    function onDelegationReleased(uint256 commitmentId, uint256 amount) external;
    function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;
    function reconcile(uint256 commitmentId) external;

    // --- Service-manager-compatible views ---
    function isOperator(address operator) external view returns (bool);
    function getOperatorSet() external view returns (address[] memory);
    function getOperator(address operator) external view returns (Operator memory);
    function getOperatorCount() external view returns (uint256);
    function trackedCommitmentCount() external view returns (uint256);
    function operatorForCommitment(uint256 commitmentId) external view returns (address);

    // --- Acceptance policy (§2.3) ---
    function getAcceptancePolicy()
        external view returns (address arbiter, uint16 minMaxPenaltyBps, address requiredToken);
    function tightenPolicy(uint16 newFloor) external;
    function setStrategyAllowed(address strategy, bool allowed) external;
    function isStrategyAllowed(address strategy) external view returns (bool);

    // --- Config views ---
    function minOperatorStake() external view returns (uint256);
    function maxDelegationsPerOperator() external view returns (uint256);
    function commitmentManager() external view returns (address);

    // --- Mesh wiring (§2.9) ---
    function setMeshWiring(address tokenWeighting, address meshFactory) external;
    function tokenWeighting() external view returns (address);
    function stakeDenom() external view returns (bytes32);
    function operatorFanIn(address operator) external view returns (address);

    // --- Metadata + forfeit-proceeds sweep ---
    function setOperatorMetadata(string calldata uri, bytes32 contentHash) external;
    function getOperatorMetadata(address operator) external view returns (OperatorMetadata memory);
    function sweepForfeitProceeds(address token, uint256 amount, address payTo) external;
}
```

The `Operator` struct field order is packing-sensitive: `operator` (160) + `registeredAt` (64) + `active` (8) fill slot 0; `activeDelegationCount` (32) + `selfStakeActive` (8) share slot 3. Implementations MUST preserve this layout for a conformant `getOperator` ABI.

**Event indexing (normative).** `OperatorRegistered` / `OperatorDeregistered` / `OperatorBelowMinStake` index `operator`. `DelegationCreated` / `DelegationReleased` / `DelegationForfeited` index `(staker, operator, commitmentId)`. `MeshWired` indexes `(tokenWeighting, meshFactory)`, `OperatorFanInDeployed` indexes `(operator, fanIn)`, and `NonceIncreased` indexes `account`.

#### 2.1 Two-step registration and on-chain verification

Registration is two transactions and is the source of the operator set's verifiability:

1. The committer calls `manager.createCommitment(arbiter = serviceArbiter, counterparty = address(registry), token = requiredToken, ...)`.
2. The committer calls `registry.register(commitmentId)` (operator self-stake) or `registry.delegate(operator, commitmentId)` (delegation).

On step 2 the registry MUST load the commitment from the manager and verify, reverting otherwise:

- `commitment.committer == msg.sender` — the caller owns the stake.
- `commitment.counterparty == address(this)` — the stake is pledged to *this* registry.
- `commitment.released == false && commitment.forfeited == false` — the commitment is active (`CommitmentClosed` otherwise).
- For `register`: `commitment.amount >= minOperatorStake`.
- the commitment is not already tracked by the registry (no double-registration of one commitment).
- the acceptance policy (§2.3) passes.

A registry that skips this verification accepts forged stake claims and MUST NOT be considered conformant.

#### 2.2 Stake accounting and the delegation cap

On a successful `register`, the registry creates the operator record with `totalDelegatedStake = commitment.amount` and `activeDelegationCount = 1` (the self-stake counts as one), marks the operator `active`, and appends it to the enumerable operator set. On a successful `delegate`, the registry increments the operator's `totalDelegatedStake` by `commitment.amount` and `activeDelegationCount` by one.

Implementations MUST snapshot the credited amount per commitment at registration/delegation time and decrement by that snapshot on the release/forfeit callbacks (§2.4) — not by the runtime `amount` reported in the callback, which can drift below the credited value if a distribution strategy moved encumbered backing out of the commitment. (The acceptance policy admits only allow-listed, non-draining strategies via §2.3, making this a defense-in-depth measure.)

`delegate` MUST revert once `activeDelegationCount >= maxDelegationsPerOperator` (reference default `1024`). The cap bounds the per-operator callback fan-out and keeps `getOperatorSet`-driven iteration gas-bounded.

`deregister` is operator-initiated and MUST revert while the operator has an active delegation other than their own live self-stake (`activeDelegationCount > (selfStakeActive ? 1 : 0)`). An operator whose self-stake has already closed may therefore deregister only at a count of zero: a count of one is then a third party's delegation. It marks the operator inactive, removes it from the enumerable set (swap-and-pop), clears the self-stake commitment's callback routing so a later release/forfeit of that commitment cannot mutate a future re-registration's counters, and sets `totalDelegatedStake` and `activeDelegationCount` to zero. Because the routing is cleared, the same still-live commitment MAY be presented to `register` again in a later block.

#### 2.3 Acceptance policy

A registry enforces a four-gate acceptance policy on every commitment presented to `register` / `delegate`, applied after the §2.1 ownership/counterparty/status checks:

| Gate | Rule | Mutability |
|---|---|---|
| **Arbiter** | `commitment.arbiter` MUST equal the registry's `requiredArbiter` | immutable post-init |
| **Penalty floor** | `commitment.maxPenaltyBps` MUST be `>= minMaxPenaltyBps` | raise-only, via `tightenPolicy` |
| **Backing token** | `commitment.token` MUST equal `requiredToken` | immutable post-init |
| **Strategy allow-list** | every bound distribution strategy MUST satisfy `isStrategyAllowed(strategy)` | admin-managed via `setStrategyAllowed` |

The arbiter gate is what makes the operator set's trust assumption uniform and per-service. The token gate is REQUIRED because stake quantities (`minOperatorStake`, `totalDelegatedStake`) are denominated in raw units of one token; accepting heterogeneous tokens would make those quantities incoherent. (Cross-token operator sets are composed at the voting-power layer via [`ITokenWeighting`](./ERC-COMMITMENTS-MESH.md) §3.3, not by mixing tokens in one registry.)

The strategy allow-list gate prevents a strategy movement (`FromEncumbered*`) from shrinking `commitment.amount` under the registry's accounting and leaving phantom `totalDelegatedStake`. A registry maintains an admin-managed allow-list: `register` / `delegate` MUST revert (`StrategiesNotAllowed`) unless **every** distribution strategy bound to the presented commitment is on it. The allow-list is empty by default, so an unconfigured registry rejects any commitment that binds a strategy at all; admins MUST only add non-draining (self-custody) strategies — one that emits `FromEncumbered*` movements would drain the committed stake. The reference `OperatorCommissionCoupon` is such an allow-listable safe strategy (it routes a commission stream without moving the encumbered principal). `setStrategyAllowed(strategy, allowed)` MUST be admin-gated, MUST reject `strategy == address(0)`, and emits `StrategyAllowlistUpdated`.

`tightenPolicy(newFloor)` MUST revert unless `newFloor > current` and `newFloor <= 10_000`, and MUST be admin-gated. It is **forward-looking only** — it does not retroactively reject previously-registered operators. The arbiter and token are immutable; there is deliberately no setter for either.

`getAcceptancePolicy()` returns `(requiredArbiter, minMaxPenaltyBps, requiredToken)` so a prospective operator can read the exact commitment shape the registry will accept before creating it.

#### 2.4 Delegation-lifecycle callbacks

When a tracked commitment is released or forfeited, the manager invokes a callback on the registry so its stake accounting stays consistent without the registry observing core state mid-transition:

```solidity
function onDelegationReleased(uint256 commitmentId, uint256 amount) external;
function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external;
```

Both callbacks:

- MUST revert unless `msg.sender == commitmentManager`.
- MUST silently ignore (return without state change) a `commitmentId` the registry does not track — the manager invokes the callback for every release/forfeit of a commitment naming the registry as counterparty, including ones the registry never accepted.
- MUST decrement `totalDelegatedStake` by the **credited snapshot** (§2.2) and decrement `activeDelegationCount` by one.
- MUST clear the commitment's callback routing.
- MUST emit `OperatorBelowMinStake` if the operator is still active and `totalDelegatedStake` has fallen below `minOperatorStake`. Being below the minimum is not stored: a reader compares `totalDelegatedStake` with the current `minOperatorStake()`, so a later threshold change applies at once.

`onDelegationForfeited` MUST remove the **full** committed amount (`fullAmount` / the credited snapshot), not just the `forfeitedAmount` penalty portion: a forfeit terminates the entire commitment, so the whole stake leaves the operator set and the residual returns to the committer.

**Ordering and failure semantics.** The manager MUST invoke these callbacks *after* the corresponding core state transition succeeds (the release returns, the forfeit transfer lands), in the same transaction. Invoking before risks the registry reading pre-forfeit state and double-counting. The manager SHOULD invoke them via a guarded (gas-capped, `try/catch`) call; on revert it SHOULD emit a `RegistryCallbackFailed(commitmentId, selector)` signal and continue, NOT revert the underlying release/forfeit. The registry is a downstream consumer of state changes, never an authority that can veto them — the same liveness posture the core applies to distribution-strategy hooks (core §D.6). A buggy or adversarial registry therefore cannot render a registered operator's commitments un-releasable or un-forfeitable.

**Repairing a failed callback.** A swallowed callback leaves the commitment routed to the registry with its stake still credited, which blocks the operator's `deregister`. `reconcile(commitmentId)` is permissionless: when the commitment is still routed but the manager shows it released or forfeited, it MUST run the same close path as the callback and emit `DelegationReleased` (carrying the credited snapshot) or `DelegationForfeited` (carrying the manager's `forfeitedUnitsOf`). It MUST revert `CommitmentNotTracked` for a commitment not routed to the registry and `CommitmentStillOpen` for one still open in the manager.

#### 2.5 Forfeit proceeds and the sweep path

A forfeit whose counterparty is the registry pays out as a pull-payment credit to the **registry's free balance inside the manager** (core §C.3 pull-payment payout). `onDelegationForfeited` SHOULD emit a signal (`ForfeitRecipientPending`) marking those proceeds, since without an explicit withdrawal path they would be stranded — the manager gates `withdraw` on `msg.sender`, and the registry is the only address that can move them.

`sweepForfeitProceeds(token, amount, payTo)` is therefore REQUIRED on a registry that can be a forfeit counterparty. It MUST be admin-gated, MUST reject `payTo == address(0)`, and calls `manager.withdraw(token, amount)` then forwards the tokens to `payTo`. The destination of forfeited stake (service treasury, insurance fund, burn address) is a service-policy decision outside this standard.

#### 2.6 Views and metadata

`isOperator`, `getOperatorSet`, and `getOperator` are the service-manager-compatible views: a service or an §3 voting-power source reads them to enumerate the set and its weights (`getOperator(operator).totalDelegatedStake`). `getOperatorCount` returns the active count. The admin setters for `minOperatorStake` and `maxDelegationsPerOperator` emit `MinOperatorStakeUpdated` and `MaxDelegationsPerOperatorUpdated` with the old and new values.

`setOperatorMetadata(uri, contentHash)` lets an active operator publish an off-chain metadata pointer (name, endpoint, geographic info). It MUST revert if the caller is not an active operator (`OperatorNotActive`) or `uri` exceeds `MAX_METADATA_URI_LENGTH` (512 bytes, `URITooLong`). Metadata MUST be stored in a sidecar mapping isolated from the hot-path `Operator` record, so a metadata write never touches the slots read by `isOperator` / `getOperatorSet` / `getOperator`.

#### 2.7 No stake history

The registry keeps no history of operator stake; it exposes only the current `totalDelegatedStake`. Historical weight for signature validation comes from the block-keyed §3 voting-power source (§4.6), and an indexer can rebuild a stake timeline from the registration, delegation, release and forfeit events.

#### 2.8 Signature-delegated registration

`register` / `delegate` have EIP-712 signature-authorized siblings that let a relayer submit an operator's or delegator's signed intent. Signature auth replaces only *who submits* — the commitment still IS the stake, and every §2.1 / §2.3 acceptance check is identical (the signer must still be the commitment's committer):

```solidity
function registerWithSig(address operator, uint256 commitmentId, uint256 deadline, uint256 nonce, bytes calldata signature) external;
function delegateWithSig(address staker, address operator, uint256 commitmentId, uint256 deadline, uint256 nonce, bytes calldata signature) external;
function increaseNonce() external;
function sigNonces(address account) external view returns (uint256);
```

The digests are EIP-712 typed data under the domain `EIP712("CommitmentsOperatorRegistry", "1")` (the registry proxy is the `verifyingContract`, binding a signature to this registry and chain), with:

- `REGISTER_TYPEHASH = keccak256("Register(address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)")`
- `DELEGATE_TYPEHASH = keccak256("Delegate(address staker,address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)")`

Signatures are verified with `SignatureChecker.isValidSignatureNow`, so both EOAs and ERC-1271 contract signers are accepted. Each is replay-protected by the signer's `sigNonces(account)` value — a valid signature MUST carry exactly the current nonce, which is consumed on success (`InvalidNonce` otherwise). A signer MAY pre-emptively revoke an outstanding intent by calling `increaseNonce()`, which bumps the nonce and emits `NonceIncreased(account, newNonce)`. A call arriving after `block.timestamp > deadline` MUST revert `SignatureExpired`; a signature that does not recover to / validate for the claimed signer MUST revert `InvalidSignature`; a same-block register⇄deregister flip MUST revert `SameBlockToggle`.

> **Integrator trap — argument order vs. typehash field order.** The typehash orders its trailing fields `(…, nonce, deadline)`, but the FUNCTION arguments order them `(…, deadline, nonce)`. An integrator who mirrors the function signature when constructing the EIP-712 struct will hash the fields transposed and produce an invalid signature. Encode the struct in **typehash** order (`nonce` before `deadline`); pass the function arguments in **function** order (`deadline` before `nonce`).

#### 2.9 Mesh wiring and voting-power crediting

A registry MAY be wired into the [mesh](./ERC-COMMITMENTS-MESH.md) so that `register` / `delegate` automatically credit per-operator voting power and `release` / `forfeit` / `deregister` automatically decrement it, without a separate staking step:

```solidity
function setMeshWiring(address tokenWeighting, address meshFactory) external; // DEFAULT_ADMIN_ROLE, once
function tokenWeighting() external view returns (address);
function stakeDenom() external view returns (bytes32);
function operatorFanIn(address operator) external view returns (address);
```

`setMeshWiring` MUST be admin-gated and callable **once** (`MeshAlreadyWired` thereafter), and MUST reject a zero `tokenWeighting` or `meshFactory` (`ZeroMeshAddress`). Once wired, the registry is the [`ITokenWeighting`](./ERC-COMMITMENTS-MESH.md) §3.3 sink's `provider` and the per-operator [`FanIn`](./ERC-COMMITMENTS-MESH.md) node's `manager`; it deploys a per-operator `FanIn` via `meshFactory` on first credit (`OperatorFanInDeployed`). This is the load-bearing link from §2 stake to §3's `IVotingPowerSource`: the single stake denom is derived injectively from the required token, `stakeDenom() == bytes32(uint160(requiredToken))`, enforcing one-token↔one-denom so a unit of this registry's encumbered capital can only ever contribute to this one denom's voting power.

Because an unwired registry never receives the manager's release/forfeit hooks, accepting stake there would mint phantom, unbacked voting power. `register` / `delegate` therefore MUST revert `RegistryNotWired` unless this registry is the manager's currently-wired operator registry (`manager.operatorRegistry() == address(this)`). `trackedCommitmentCount()` reports the number of commitments with live hook routing; the manager consults it before re-pointing its single operator-registry hook slot so live delegations are never silently orphaned. `operatorForCommitment(commitmentId)` resolves the operator a tracked register/delegate commitment routes to (or `address(0)` once released/forfeited) — the value a commission strategy latches while a delegation is active.

### 3. Voting-power source (`IVotingPowerSource`)

A service manager reads operator weight through a narrow, checkpointed interface rather than the full registry or mesh surface:

```solidity
interface IVotingPowerSource {
    function getVotingPower(address who) external view returns (uint256);
    function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256);
    function getTotalPower() external view returns (uint256);
    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256);
}
```

A source:

- MUST return checkpointed history: `getVotingPowerAt(who, b)` and `getTotalPowerAt(b)` MUST return the value as of block `b` for any past block `b < block.number`, not the current value. Implementations SHOULD use a monotone checkpoint structure (e.g. OpenZeppelin `Checkpoints.Trace*`) keyed by block number.
- MUST keep `getTotalPower()` equal to the sum of `getVotingPower(who)` over all addresses the source tracks, and likewise at any past block.
- MAY normalize heterogeneous backing tokens into a single score. The canonical implementation is the [`ITokenWeighting`](./ERC-COMMITMENTS-MESH.md) §3.3 mesh node, which applies per-denom weights in basis points; `ITokenWeighting` inherits `IVotingPowerSource` precisely so service managers depend only on this surface.

The checkpoint requirement is load-bearing: it is what lets §4 validation pin to a past block (§4.6). A source that returns current state from its `...At` accessors silently breaks the staleness guarantee and MUST NOT be used for consensus-critical validation.

The `IVotingPowerSource` indirection is the seam between stake accounting and signature validation. The same source feeds an ECDSA service manager (§4) today and a BLS service manager in a future sibling; swapping the source (e.g. registry → `FanIn → TokenWeighting` composition) is a configuration change, not a re-architecture.

### 4. Service manager and quorum validation

A **service manager** validates that a quorum of an operator service's operators, weighted by voting power read from an §3 source at a pinned block, signed a statement. It is the contract a service's on-chain handler calls to decide whether to act on an off-chain-produced result. The reference implementation validates ECDSA signatures and is also an [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) signer, so any ERC-1271-aware verifier can treat the aggregated operator-set signature as a single smart-contract signature.

#### 4.1 Signed envelope

```solidity
interface IServiceHandler {
    struct Envelope {
        bytes20 eventId;
        bytes12 ordering;   // consumer-defined sequencing (actively consumed)
        bytes payload;
    }

    struct SignatureData {
        address[] signers;      // signing-key addresses, strictly ascending
        bytes[]   signatures;   // signatures[i] corresponds to signers[i]
        uint32    referenceBlock;
    }

    function handleSignedEnvelope(Envelope calldata envelope, SignatureData calldata signatureData) external;
    function getServiceManager() external view returns (address);
}
```

The digest signed over an `Envelope` MUST be an [EIP-712](https://eips.ethereum.org/EIPS/eip-712) typed-data digest, not an [EIP-191](https://eips.ethereum.org/EIPS/eip-191) personal-sign hash. It MUST be computed as:

```solidity
bytes32 ENVELOPE_TYPEHASH = keccak256("Envelope(bytes20 eventId,bytes12 ordering,bytes payload)");
bytes32 structHash = keccak256(abi.encode(ENVELOPE_TYPEHASH, envelope.eventId, envelope.ordering, keccak256(envelope.payload)));
bytes32 digest = _hashTypedDataV4(structHash); // EIP-712 domain-separated
```

Two encoding rules are load-bearing. First, the dynamic `payload` is **hashed** (`keccak256(envelope.payload)`) per the EIP-712 encoding of `bytes`, not encoded inline; the fixed-size `eventId` / `ordering` are encoded directly. Second, the EIP-712 domain is `EIP712("CommitmentsServiceManager", "1")`, whose separator folds in `block.chainid` and the service manager's own address (`verifyingContract`). Replay scoping therefore comes from the domain separator itself: a quorum signature minted for one chain — or one service-manager instance — cannot be replayed against another, and signers see a structured `Envelope` rather than an opaque hash. The domain `version` MUST be bumped on any change to the envelope-hashing scheme.

`signers` carries **signing-key** addresses (§4.3), not operator addresses, in **strictly ascending** order; `signatures[i]` MUST be `signers[i]`'s signature over the digest; `referenceBlock` is the past block all weight/quorum/key lookups resolve against (§4.6).

#### 4.2 `IServiceManager`

```solidity
interface IServiceManager {
    function validate(IServiceHandler.Envelope calldata envelope, IServiceHandler.SignatureData calldata sig)
        external view;

    function getOperatorWeight(address operator) external view returns (uint256);
    function getLatestOperatorForSigningKey(address signingKey) external view returns (address);
    function getServiceURI() external view returns (string memory);
    function setServiceURI(string calldata serviceURI) external;
    function getStakeRegistry() external view returns (address);
}
```

`validate` MUST revert if the envelope's signature data does not satisfy the validation algorithm (§4.5), and return normally (no value) otherwise. A reference manager also implements ERC-1271:

```solidity
function isValidSignature(bytes32 digest, bytes memory signatureData) external view returns (bytes4);
```

where `signatureData` decodes to `(address[] signers, bytes[] signatures, uint32 referenceBlock)` (decode order: `address[]`, `bytes[]`, `uint32`) and `isValidSignature` MUST return the ERC-1271 magic value iff the same algorithm (§4.5) passes for `digest`. `getStakeRegistry` returns the §2 operator registry used for eligibility.

**Reverts (normative).** A failing `validate` / `isValidSignature` MUST revert with one of: `LengthMismatch()` (`signers.length != signatures.length`); `InvalidLength()` (empty signer set); `NotSorted()` (signers not strictly ascending, which also catches duplicates); `InvalidReferenceBlock()` (the `type(uint32).max` "live" sentinel or `referenceBlock >= block.number`); `StaleReferenceBlock(uint32 referenceBlock, uint96 maxAge)` (older than `maxReferenceBlockAge`); `InvalidSignature()` (a signature fails `SignatureChecker`); `SignerNotRegistered()` (a signer's key resolves to `address(0)` at `referenceBlock`, or to an operator not currently registered); `InsufficientSignedStake()` (absolute-threshold gate); `InsufficientQuorumZero()` (`getTotalPowerAt == 0`); or `InsufficientQuorum(uint256 signerWeight, uint256 thresholdWeight, uint256 totalWeight)` (quorum-fraction gate). Config setters revert `InvalidThresholdWeight()` (zero or `> type(uint160).max` threshold), `InvalidQuorumParameters()` (`quorumDenominator == 0`, `quorumNumerator > quorumDenominator`, or `quorumDenominator > type(uint80).max`), or `ZeroAmount()` (`setMaxReferenceBlockAge(0)`).

**EigenLayer-compat shims (OPTIONAL).** An implementation MAY additionally expose `getAllocationManager()` / `getDelegationManager()` views for drop-in compatibility with EigenLayer-style service tooling; when exposed they MUST return `address(0)` for a commitments-backed service — there is no separate allocation or delegation manager; the commitment manager and registry serve those roles. The shims are not part of the required surface (the reference implementation does not ship them); tooling that requires them should call `getStakeRegistry` first and treat the shims as absent-by-default.

#### 4.3 Operator lifecycle in the service manager and signing keys

A service manager maintains its own enrollment roster, gated on §2 eligibility, plus the signing-key and voting-power-source configuration. This is the `IOperatorServiceRegistry` surface:

```solidity
interface IOperatorServiceRegistry {
    // Events
    event OperatorRegistered(address indexed operator);
    event OperatorDeregistered(address indexed operator);
    event OperatorSigningKeyUpdated(address indexed operator, address indexed oldKey, address indexed newKey);
    event StakeThresholdUpdated(uint256 newThreshold);
    event VotingPowerSourceUpdated(address indexed oldSource, address indexed newSource);
    event MaxReferenceBlockAgeUpdated(uint96 oldValue, uint96 newValue);

    // Errors
    error NotActiveOperator();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidSigningKey();
    error SigningKeyAlreadyAssigned();
    error InvalidSigningKeySignature();
    error NotAdminOrSelf();
    error InvalidVotingPowerSource();
    error InvalidOperatorRegistry();
    error InvalidAdmin();

    // Enrollment
    function enrollServiceOperator() external;
    function withdrawServiceOperator(address operator) external;

    // Signing keys
    function updateOperatorSigningKey(address newSigningKey, bytes memory signingKeySignature) external;
    function getOperatorSigningKeyAtBlock(address operator, uint32 blockNumber) external view returns (address);
    function getLatestOperatorSigningKey(address operator) external view returns (address);

    // Voting-power source config
    function setVotingPowerSource(address newSource) external;
    function votingPowerSource() external view returns (address);

    // Views
    function operatorRegistered(address operator) external view returns (bool);
    function operatorRegistry() external view returns (address);
}
```

- `enrollServiceOperator()` MUST revert unless the caller `isOperator` in the linked §2 registry (`NotActiveOperator`), and unless not already enrolled here (`AlreadyRegistered`). It marks the caller enrolled and emits `OperatorRegistered(operator)`; the event carries no weight, since voting power is read from the §3 source at validation time. Enrollment here is service participation, not stake custody — no capital moves; the caller's stake lives in its §2 registration commitment.
- `withdrawServiceOperator(operator)` MUST be callable by the operator themselves or by an admin (`NotAdminOrSelf` otherwise), and MUST revert if `operator` is not enrolled (`NotRegistered`). It marks the operator not enrolled and MUST clear the operator's signing key by pushing a zero entry into both the `operator → key` and `key → operator` checkpoints at the current block — so that resolving the key at any post-withdrawal block yields `address(0)` and fails validation.

Operators sign with a **signing key** distinct from their operator address, rotated via:

```solidity
function updateOperatorSigningKey(address newSigningKey, bytes memory signingKeySignature) external;
```

- The caller MUST be registered (§4.3).
- `newSigningKey` MUST be non-zero and MUST prove possession by signing the domain-separated message `keccak256(abi.encode(operator, address(serviceManager), block.chainid))`. Domain separation prevents replaying a proof-of-possession across operators, service managers, or chains.
- `newSigningKey` MUST NOT already be assigned to a different operator.
- Both the `operator → key` and `key → operator` directions MUST be checkpointed by block number, so a historical lookup at `referenceBlock` resolves the key in force at that block.

#### 4.4 Quorum and threshold configuration

A service manager enforces two independent, checkpointed gates:

- **Absolute threshold** — `thresholdWeight`, the minimum total voting power that signers must collectively carry. Set via `updateStakeThreshold(uint256)`; MUST be non-zero.
- **Quorum fraction** — `(quorumNumerator, quorumDenominator)`, the minimum *fraction* of the total operator-set power that signers must carry. Set via `updateQuorum(uint256, uint256)`; MUST require `quorumDenominator != 0` and `quorumNumerator <= quorumDenominator`.

Both gates MUST be checkpointed by block number and MUST be evaluated at the validation's `referenceBlock`, not at the current block — otherwise a mid-flight config change could retroactively validate or invalidate an in-flight envelope. Both setters MUST be admin-gated.

**Quorum denominator (normative).** The quorum-fraction gate's denominator is `getTotalPowerAt(referenceBlock)` read from the configured §3 voting-power source — i.e. the **total power the source tracks**, NOT the sum of power over the operators enrolled in this service manager. The two coincide only when the source is scoped to exactly this service's operator set (e.g. a dedicated `FanIn → TokenWeighting` composition fed solely by this service's registry).

Deployers MUST understand the consequences when the source tracks a superset of the enrolled set (a shared mesh, a registry serving several services):

- A service where only a minority of the source's power is enrolled can be **structurally unable to reach quorum** — 100% of enrolled signers may still carry less than `quorumNumerator/quorumDenominator` of the source's total.
- Growth of non-enrolled stake in the source **silently degrades quorum liveness** for the service, with no on-chain event on the service's side.

Deployments SHOULD therefore either (a) point the voting-power source at the service's own operator set so the denominator equals enrolled power, or (b) size `(quorumNumerator, quorumDenominator)` against the expected enrolled fraction of the shared source and monitor it. An implementation MAY additionally checkpoint a service-local enrolled-power total (updated on enroll/withdraw) as an alternative denominator; an implementation that does so MUST document which denominator its `validate` uses.

#### 4.5 Validation algorithm

`validate` / `isValidSignature` MUST, given `(digest, signers, signatures, referenceBlock)`:

1. Reject `signers.length != signatures.length` (length mismatch) and `signers.length == 0` (empty).
2. Apply the reference-block staleness rule (§4.6): reject the `type(uint32).max` "live" sentinel; reject `referenceBlock >= block.number`; reject `block.number - referenceBlock > maxReferenceBlockAge`.
3. Iterate `signers` in order, maintaining `lastSigner`:
   - Reject unless `lastSigner < signers[i]` — **strictly ascending** order, which also rejects duplicates in O(n) without a set.
   - Verify `signers[i]` signed `digest` (via `SignatureChecker`, so both EOA ECDSA and ERC-1271 signing keys are accepted); reject on failure.
   - Resolve the operator that owned `signers[i]` **at `referenceBlock`** from the checkpointed `key → operator` history; reject if it resolves to `address(0)`.
   - Reject unless that operator is **currently registered** in the service manager. A signer whose key resolved at a past block but who has since deregistered MUST NOT count — this closes the historical-snapshot bypass that would otherwise let ex-operators sign live attestations.
   - Add the operator's voting power **at `referenceBlock`** (from the §3 source) to `signedWeight`.
4. Read `totalWeight = getTotalPowerAt(referenceBlock)` — the source-total quorum denominator (§4.4); reject if zero.
5. Read `thresholdStake` and `(quorumNum, quorumDen)` at `referenceBlock`. Reject if `signedWeight < thresholdStake` (absolute gate). Reject if `signedWeight * quorumDen < quorumNum * totalWeight` (quorum-fraction gate, cross-multiplied to avoid division).
6. Return normally (or the ERC-1271 magic value) iff no rejection fired.

Step 3's combination — past-block key resolution and weight, but a *current*-registration check — is the load-bearing asymmetry of this standard. Weight and key membership are pinned so they cannot be manipulated between signing and validation; the registration check is live so a deregistered operator drops out immediately.

#### 4.6 Reference-block staleness (`maxReferenceBlockAge`)

`referenceBlock` MUST be a real, recent past block:

- A `type(uint32).max` sentinel meaning "use live state" MUST be rejected. (Reading live state would reintroduce the between-signing-and-validation manipulation window.)
- `referenceBlock >= block.number` MUST be rejected.
- `block.number - referenceBlock > maxReferenceBlockAge` MUST be rejected with a distinguished `StaleReferenceBlock` error.

`maxReferenceBlockAge` is admin-configurable via `setMaxReferenceBlockAge(uint96)` (which MUST reject zero), readable via `maxReferenceBlockAge()`, and defaults to `DEFAULT_MAX_REFERENCE_BLOCK_AGE = 256` blocks (≈1h at 12s/block) when unset. The window must be large enough to absorb honest off-chain aggregation and signing latency, yet short enough that it cannot outrun a deregistration: an operator who deregisters can still be named in envelopes whose `referenceBlock` predates the deregistration for at most `maxReferenceBlockAge` blocks, and the §4.5 current-registration check excludes them regardless.

### 5. Invariants

| ID | Name | Statement |
|---|---|---|
| **INV-S1** | Operator stake accounting | For each active operator, `totalDelegatedStake` equals the sum of the credited snapshots of its tracked commitments (self-stake + delegations), and `activeDelegationCount` equals their count. Release/forfeit callbacks decrement by the same snapshot they credited. |
| **INV-S2** | Acceptance binding | Every commitment tracked by a registry satisfies `counterparty == registry`, `arbiter == requiredArbiter`, `token == requiredToken`, `maxPenaltyBps >= minMaxPenaltyBps` (at acceptance), and binds only distribution strategies for which `isStrategyAllowed` holds (the default empty allow-list admits none). |
| **INV-S3** | Signing-key uniqueness | At any block, the `key → operator` checkpoint resolves a signing key to at most one operator. |
| **INV-S4** | Validation soundness | A passing `validate` / `isValidSignature` implies: `referenceBlock` is within `maxReferenceBlockAge` of head; every counted signer's key resolved to a currently-registered operator at `referenceBlock`; and `signedWeight` meets both the absolute threshold and the quorum fraction read at `referenceBlock`. |

All core invariants (`ERC-COMMITMENTS` INV-1 through INV-10) continue to hold across every operation in this extension; the services layer reads core state and receives callbacks but never mutates the manager ledger except through the standard `withdraw` path in `sweepForfeitProceeds`.

## Rationale

### The registry is a normative dependency, not a usage pattern

The operator registry is a load-bearing dependency of a normative surface: `IServiceManager` gates enrollment (`enrollServiceOperator`) on registry eligibility, and a service audits its forfeitable surface from the registry's tracked commitments. It therefore earns a normative interface here rather than living as a usage sketch. The [mesh extension](./ERC-COMMITMENTS-MESH.md) references this interface rather than restating it.

### `IVotingPowerSource` as the BLS seam

ECDSA validation with sorted signers is O(n) in signers and fine for modest operator sets, but consensus-critical services with large sets want BLS aggregate signatures. Rather than bake a signature scheme into the stake accounting, the standard isolates the read surface any service manager needs into `IVotingPowerSource`. A BLS manager is then a drop-in alternative that consumes the identical source — no change to the registry, the mesh, or the operator's stake.

### Past-block weight, live registration

Pinning everything to a past block would let a deregistered operator keep signing for `maxReferenceBlockAge` blocks; pinning nothing would let an operator inflate weight between signing and validation. The standard pins the manipulable quantities (weight, key membership) and keeps the cheap, monotone-safe check (current registration) live. This is the minimum asymmetry that closes both windows.

### EigenLayer-compatibility shims are optional

`getStakeRegistry` returning the operator registry lets existing EigenLayer-style service tooling treat a commitments-backed service as a stake registry with minimal code changes; the optional `getAllocationManager` / `getDelegationManager` shims (§4.2), when exposed, return `address(0)` for the managers that have no commitments-side counterpart. The shims are OPTIONAL because they carry no behavior — mandating dead functions on every conformant manager taxes implementations for the benefit of one external ecosystem's tooling, which can equally feature-detect. Migration from an EigenLayer middleware remains a registry swap, not a re-architecture, because the consumed surface (`getOperatorWeight`, signature validation, `getStakeRegistry`) is the same.

## Backwards Compatibility

This is a new standard and introduces no backwards-compatibility concerns. It is a pure consumer of `ERC-COMMITMENTS` core custody, ledger, and two-phase-forfeit semantics — it reads core state and receives the manager's delegation-lifecycle callbacks but never mutates the manager ledger except through the standard `withdraw` path in `sweepForfeitProceeds`. It requires no changes to the core manager, to ERC-20 / ERC-4626 backing, or to the [mesh](./ERC-COMMITMENTS-MESH.md) and [rewards](./ERC-COMMITMENTS-REWARDS.md) extensions. It depends on ERC-1822 (UUPS) and ERC-1967 (proxy storage slots) for the singleton proxies, [EIP-712](https://eips.ethereum.org/EIPS/eip-712) for the envelope and signature-delegated register/delegate digests, and [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) for contract-signer support and the aggregated-signature verifier surface. The three sections (§2, §3, §4) are independently adoptable; a core-conformant manager with no services deployed remains fully conformant.

## Test Cases

The reference implementation ships conformance and unit suites (in the repository this document lives in):

- `test/registry/` — operator registration, delegation, acceptance policy (`OperatorRegistryAcceptance.t.sol`), metadata (`OperatorRegistryMetadata.t.sol`), signature-delegated register/delegate (`OperatorRegistrySig.t.sol`), the `OperatorCommissionCoupon` allow-listed strategy (`OperatorCommission.t.sol`), and `test/registry/conformance/` for the INV-S1 / INV-S2 accounting and acceptance-binding invariants.
- `test/services/` — the service manager: enrollment gating, signing-key rotation and proof-of-possession, quorum/threshold configuration, the EIP-712 envelope digest, the reference-block staleness rule, and the §4.5 validation algorithm (`OperatorServiceRegistry.t.sol`), with `test/services/conformance/` for the INV-S3 / INV-S4 signing-key-uniqueness and validation-soundness invariants.

## Reference Implementation

A reference implementation lives in the `commitments` repository:

- `src/extensions/services/operator-registry/OperatorRegistry.sol`
- `src/extensions/services/operator-registry/OperatorRegistryStorage.sol`
- `src/extensions/services/interfaces/IOperatorRegistry.sol`
- `src/extensions/services/service-registry/OperatorServiceRegistry.sol`
- `src/extensions/services/service-registry/OperatorServiceRegistryStorage.sol`
- `src/extensions/services/interfaces/{IOperatorServiceRegistry,IServiceManager,IServiceHandler}.sol`
- `src/extensions/mesh/TokenWeighting.sol` + `src/extensions/mesh/interfaces/ITokenWeighting.sol` (the canonical `IVotingPowerSource` implementation)
- `src/shared/interfaces/IVotingPowerSource.sol`
- `src/extensions/services/distributions/OperatorCommissionCoupon.sol` (the allow-listable safe strategy, §2.3)

Both singletons are UUPS proxies. `OperatorRegistry` custodies stake-backed operator registration and delegation and feeds voting power into a `TokenWeighting` mesh node; `OperatorServiceRegistry` custodies no stake and reads voting power through the configured `IVotingPowerSource`. A BLS service manager is anticipated future work and reuses the same `IVotingPowerSource` seam.

## Security Considerations

### Deregistration vs. signing-latency window

The tension `maxReferenceBlockAge` resolves is between honest latency and stale authority. Too small a window rejects envelopes that honest operators legitimately took a few minutes to aggregate and sign; too large a window lets an operator who has deregistered (or whose stake was forfeited) remain a valid signer for envelopes pinned to a pre-exit block. The standard bounds the window (default 256 blocks) *and* requires a live current-registration check (§4.5 step 3), so even within the window a deregistered operator's signature does not count. Services with stricter liveness needs SHOULD lower `maxReferenceBlockAge`.

### Quorum-denominator liveness griefing

Because the quorum fraction is evaluated against the voting-power source's **total** power (§4.4), any party able to grow non-enrolled stake in a shared source dilutes every service reading it: signed weight stays constant while the denominator grows, until envelopes stop validating. This is a liveness grief, not a safety break — no fraudulent envelope validates — but a service that cannot validate is a service that cannot act. The mitigations in §4.4 (scope the source to the service's own operator set, or size and monitor the quorum fraction) apply; services on shared sources SHOULD alert on `totalPower` growth that outpaces enrolled power.

### Stake double-counting across services

An operator's commitment names exactly one registry (one `counterparty`). The same backing *tokens*, however, can back multiple distinct commitments to different services, subject only to the core exposure-allocation invariant (INV-3: `Σ exposure ≤ totalEncumbered` per (user, token)). INV-3 bounds the operator's *total forfeitable exposure* across all services, but it does not prevent two services from each counting the operator's full per-commitment amount as "their" security. A service auditing its own model MUST compute its forfeitable surface from its own operator set's commitments (`Σ amount × maxPenaltyBps / 10_000`) and MUST NOT assume exclusive claim on the operator's backing tokens. Cross-service correlation of forfeiture risk is a service-selection concern outside the protocol's enforcement.

### Forfeiture during active delegation

A forfeit terminates the entire commitment, so `onDelegationForfeited` removes the *full* committed amount from the operator (not just the penalty portion) — the residual is no longer pledged to the service and returns to the committer. Because the callback is guarded and failure-isolated (§2.4), a registry that reverts in the callback cannot block the forfeit; its accounting may then drift from on-chain commitment state until re-synced, but the manager's ledger (the authority) stays correct. Services MUST treat the manager's commitment state, not the registry's cached `totalDelegatedStake`, as ground truth when the two can disagree. Forfeit proceeds land in the registry's manager free balance and MUST be swept (§2.5) or they strand.

### Live-block voting power and envelope replay

Reading current (rather than past) voting power for a consensus-critical decision lets an operator coordinate stake changes between signing and validation to inflate their quorum contribution; the standard forbids the live sentinel and `referenceBlock >= block.number` (§4.6) to prevent this. The strictly-ascending signer ordering (§4.5) rejects a signer counted twice in one envelope. The `eventId` / `ordering` fields of the envelope are the service's hook for cross-envelope replay protection; this standard validates the *signature set* over a digest but does not itself dedupe envelopes across calls — a handler that acts on validated envelopes MUST enforce its own once-only semantics on `eventId`.

### Signing-key proof of possession

Rotating to a signing key without proving control of it would let an operator name a victim's address as their key and grief the victim, or front-run a competitor's key registration. The domain-separated proof-of-possession (§4.3) and the "not already assigned to another operator" check prevent both; domain separation over `(operator, serviceManager, chainid)` prevents replaying a valid proof across operators, deployments, or chains.

## Copyright

Copyright and related rights waived via [CC0](../../LICENSE).
