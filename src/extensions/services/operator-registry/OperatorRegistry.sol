// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {OperatorRegistryStorage} from "src/extensions/services/operator-registry/OperatorRegistryStorage.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {IMeshFactory} from "src/extensions/mesh/interfaces/IMeshFactory.sol";
import {IFanIn} from "src/extensions/mesh/interfaces/IFanIn.sol";
import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";
import {Multicallable} from "src/shared/utilities/Multicallable.sol";
import {MembershipBase} from "src/shared/registries/MembershipBase.sol";
import {AddressSetSwapLib} from "src/shared/registries/AddressSetSwapLib.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

/// @title OperatorRegistry
/// @notice operator directory backed by committed stake.
/// @dev Operators register by presenting a pre-created commitment with this registry as counterparty.
///      Stakers delegate by creating commitments with this registry as counterparty and calling delegate().
///      Exposes IServiceManager-compatible views: getOperatorStake, isOperator, getOperatorSet.
///      CommitmentManager calls back onDelegationReleased onDelegationForfeited when relevant
///      commitments are closed.
///      Security properties (threat model, 03-04-PLAN.md):
///        T-03-22: register() verifies commitment.committer == msg.sender
///        T-03-23: onDelegation* requires msg.sender == s.commitmentManager
///        T-03-24: register/delegate verify counterparty == address(this) from on-chain commitment data
///        T-03-26: deregistered operators marked inactive; re-register requires fresh commitment
///        T-03-27: onDelegationForfeited updates totalDelegatedStake atomically
///        T-03-28: maxDelegationsPerOperator cap (default 1024)
contract OperatorRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    ReentrancyGuardTransient,
    IOperatorRegistry,
    Multicallable,
    MembershipBase
{
    using OperatorRegistryStorage for OperatorRegistryStorage.Layout;
    using SafeERC20 for IERC20;

    /// @notice Maximum length of a metadata URI in bytes. Bounds gas cost of setOperatorMetadata.
    uint256 public constant MAX_METADATA_URI_LENGTH = 512;

    /// @notice EIP-712 typehash for a signature-delegated `registerWithSig` intent.
    ///         `operator` must equal the commitment's committer and be the signer.
    bytes32 public constant REGISTER_TYPEHASH =
        keccak256("Register(address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)");

    /// @notice EIP-712 typehash for a signature-delegated `delegateWithSig` intent.
    ///         `staker` must equal the commitment's committer and be the signer.
    bytes32 public constant DELEGATE_TYPEHASH =
        keccak256("Delegate(address staker,address operator,uint256 commitmentId,uint256 nonce,uint256 deadline)");

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @dev Disable initializers on implementation contract (proxy pattern)
    constructor() {
        _disableInitializers();
    }

    // =========================================================================
    // Initializer
    // =========================================================================

    /// @notice Initialize the OperatorRegistry.
    /// @param commitmentManager_ The CommitmentManager this registry is wired to.
    /// @param minOperatorStake_ Minimum backing-token units required to register as operator.
    /// @param maxDelegationsPerOperator_ Maximum delegations per operator (default 1024).
    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE.
    /// @param requiredArbiter_ Commitments presented to register/delegate must have this arbiter. Immutable.
    /// @param minMaxPenaltyBps_ Floor on commitment.maxPenaltyBps (0..10_000). Raise-only via tightenPolicy.
    /// @param requiredToken_ Commitments presented to register/delegate must be backed by this token.
    ///        Stake quantities (`minOperatorStake`, `totalDelegatedStake`) are denominated in its raw
    ///        units; accepting arbitrary tokens would make them incoherent. Immutable.
    function initialize(
        address commitmentManager_,
        uint256 minOperatorStake_,
        uint256 maxDelegationsPerOperator_,
        address admin_,
        address requiredArbiter_,
        uint16 minMaxPenaltyBps_,
        address requiredToken_
    ) external initializer {
        if (requiredArbiter_ == address(0)) revert ZeroArbiter();
        if (requiredToken_ == address(0)) revert ZeroToken();
        if (minMaxPenaltyBps_ > BPS_DENOMINATOR) revert PenaltyExceedsMax();

        __AccessControl_init();
        // EIP-712 domain for the signature-delegated register/delegate paths.
        // verifyingContract is this proxy's address, so digests are bound to this registry.
        __EIP712_init("CommitmentsOperatorRegistry", "1");

        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        s.commitmentManager = commitmentManager_;
        s.minOperatorStake = minOperatorStake_;
        s.maxDelegationsPerOperator = maxDelegationsPerOperator_ == 0 ? 1024 : maxDelegationsPerOperator_;
        s.requiredArbiter = requiredArbiter_;
        s.minMaxPenaltyBps = minMaxPenaltyBps_;
        s.requiredToken = requiredToken_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    // =========================================================================
    // Registration
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    /// @dev Pattern :
    ///      1. Operator calls CommitmentManager.createCommitment(arbiter, address(registry), amount,...)
    ///      2. Operator calls registry.register(commitmentId) to complete registration.
    ///      Verification: committer == msg.sender, counterparty == this,
    ///                    amount >= minOperatorStake.
    function register(uint256 commitmentId) external nonReentrant {
        _register(OperatorRegistryStorage.layout(), msg.sender, commitmentId);
    }

    /// @inheritdoc IOperatorRegistry
    /// @dev Signature auth replaces *who submits*, not *what's allowed*: the recovered signer is
    ///      used verbatim as the operator identity, so `_register` runs the identical committer /
    ///      counterparty / acceptance-policy / cooldown checks as the direct path.
    function registerWithSig(
        address operator,
        uint256 commitmentId,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        bytes32 structHash = keccak256(abi.encode(REGISTER_TYPEHASH, operator, commitmentId, nonce, deadline));
        _verifySig(s, operator, structHash, deadline, nonce, signature);
        _register(s, operator, commitmentId);
    }

    /// @dev Registration core shared by `register` (account = msg.sender) and `registerWithSig`
    ///      (account = verified signer). All auth/policy checks key off `account`, so both entry
    ///      points behave identically once the caller's intent is authorized.
    function _register(OperatorRegistryStorage.Layout storage s, address account, uint256 commitmentId) internal {
        // Only the manager's wired registry may accept stake — an unwired registry
        // never receives release/forfeit hooks, so its voting power would be unbacked.
        _requireWired(s);

        // Reject if already registered (including formerly active operators with same address)
        if (s.operators[account].active) revert AlreadyRegistered();

        // Same-block cooldown: block a register⇄deregister flip within one block.
        // Placed after the AlreadyRegistered check so only a genuine registration transition
        // records the toggle (a failed re-register is not a flip).
        _guardToggle(s, account);

        // Load and verify the commitment on-chain
        ICommitmentManager.Commitment memory c = ICommitmentManager(s.commitmentManager).getCommitment(commitmentId);

        if (c.committer != account) revert NotCommitmentOwner();
        if (c.counterparty != address(this)) revert WrongCounterparty();
        if (c.released || c.forfeited) revert NotRegistered(); // commitment must be active
        if (c.amount < s.minOperatorStake) revert InsufficientStake(c.amount, s.minOperatorStake);
        _verifyAcceptance(s, c, commitmentId);

        // Reject if this commitment is already registered for another operator
        if (s.commitmentToOperator[commitmentId] != address(0)) revert CommitmentAlreadyDelegated();

        // Store operator record
        s.operators[account] = Operator({
            operator: account,
            registeredAt: uint64(block.timestamp),
            selfStakeCommitmentId: commitmentId,
            totalDelegatedStake: c.amount,
            activeDelegationCount: 1, // self-stake counts as 1
            active: true,
            belowMinStake: false,
            selfStakeActive: true // cleared by the hook when the self-stake commitment closes
        });

        // stakeAt (#42): checkpoint the operator's fresh aggregate stake at this timestamp.
        _pushStakeCheckpoint(s, account, c.amount);

        // Add to enumerable list (shared swap-and-pop membership logic — AddressSetSwapLib,
        // raw-index convention preserved verbatim over the slot-locked fields).
        AddressSetSwapLib.append(s.operatorList, s.operatorListIndex, account);

        // Route hooks for this commitment
        s.commitmentToOperator[commitmentId] = account;
        s.commitmentToStaker[commitmentId] = account;
        // snapshot the amount we credited to totalDelegatedStake so
        // future release/forfeit hooks decrement the same value (and aren't
        // mismatched by a runtime distribute() shrink).
        s.registeredAmount[commitmentId] = c.amount;
        s.trackedCommitmentCount += 1;

        emit OperatorRegistered(account, commitmentId, c.amount);

        // Mesh: credit the operator's self-stake into its per-operator FanIn →
        // TokenWeighting. No-op if mesh is unwired.
        _meshOnIncrease(s, account, c.amount);
    }

    /// @inheritdoc IOperatorRegistry
    /// @dev Operator must have no active delegations beyond their own self-stake.
    ///      Removes operator from the enumerable list using swap-and-pop.
    function deregister() external nonReentrant {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();

        Operator storage op = s.operators[msg.sender];
        if (!op.active) revert NotRegistered();

        // Only allow deregister once every tracked commitment except (at most) the operator's
        // own live self-stake has closed. `activeDelegationCount > 1` alone is NOT sufficient:
        // the self-stake can close independently (committer unbond/expiry or arbiter
        // release) while the operator stays active — the "zombie-active" state — leaving
        // count == 1 for a live THIRD-PARTY delegation. Deregistering then would drain the
        // delegator's mesh power and strand the delegation's routing against a future
        // re-registration, so a stale release/forfeit hook could burn the new registration's
        // live stake. `selfStakeActive` (cleared by the hook when the self-stake closes)
        // disambiguates the two count == 1 states.
        if (op.activeDelegationCount > (op.selfStakeActive ? 1 : 0)) revert ActiveDelegationsExist();

        // Same-block cooldown: block a register⇄deregister flip within one block.
        // Placed after the reverts above so only a genuine deregistration transition records the
        // toggle (a deregister that would revert on active delegations is not a flip).
        _guardToggle(s, msg.sender);

        // Mesh: drive the operator's voting power to EXACTLY zero BEFORE clearing
        // routing. The operator is becoming inactive, so any residual mesh credit
        // must be fully unwound — not just the self-stake snapshot. Releasing by a
        // single commitment's `registeredAmount` (the old `selfCredited` path) is
        // unsafe: a self-stake that was independently released/forfeited can leave a
        // STALE `registeredAmount[selfStakeCommitmentId]` decoupled from the
        // operator's live TokenWeighting power (e.g. after a zombie-active
        // re-registration whose self-stake credit was already consumed by an earlier
        // clamped release). Draining the operator's actual live mesh stake keeps the
        // registry<->mesh in strict lockstep and guarantees an inactive operator can
        // never retain phantom voting power, independent of the `_meshOnDecrease` clamp.
        _meshDrain(s, msg.sender);

        // clear routing for the still-live self-stake commitment so a later
        // release/forfeit hook on this commitment does not mutate a future re-registration's
        // counters. Mirrors the cleanup already performed by onDelegationReleased/Forfeited.
        // Skipped when the self-stake already closed (the hook cleaned up then).
        if (op.selfStakeActive) {
            delete s.commitmentToOperator[op.selfStakeCommitmentId];
            delete s.commitmentToStaker[op.selfStakeCommitmentId];
            delete s.registeredAmount[op.selfStakeCommitmentId];
            if (s.trackedCommitmentCount > 0) s.trackedCommitmentCount -= 1;
            op.selfStakeActive = false;
        }

        // Mark inactive and zero the registry's own figures, so the stake views agree with the
        // drained mesh power.
        op.active = false;
        op.totalDelegatedStake = 0;
        op.activeDelegationCount = 0;
        _pushStakeCheckpoint(s, msg.sender, 0);

        // Swap-and-pop removal from operatorList for O(1) removal (shared AddressSetSwapLib;
        // identical raw-index mechanics as before, just factored out).
        AddressSetSwapLib.swapPopRemove(s.operatorList, s.operatorListIndex, msg.sender);

        emit OperatorDeregistered(msg.sender);
    }

    // =========================================================================
    // Delegation
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    /// @dev Pattern :
    ///      1. Staker calls CommitmentManager.createCommitment(arbiter, address(registry), amount,...)
    ///      2. Staker calls registry.delegate(operator, commitmentId) to register the delegation.
    function delegate(address operator, uint256 commitmentId) external nonReentrant {
        _delegate(OperatorRegistryStorage.layout(), msg.sender, operator, commitmentId);
    }

    /// @inheritdoc IOperatorRegistry
    /// @dev Signature auth replaces *who submits*, not *what's allowed*: the recovered signer is
    ///      the staker identity, so `_delegate` runs the identical committer / counterparty /
    ///      acceptance-policy checks as the direct path.
    function delegateWithSig(
        address staker,
        address operator,
        uint256 commitmentId,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        bytes32 structHash = keccak256(abi.encode(DELEGATE_TYPEHASH, staker, operator, commitmentId, nonce, deadline));
        _verifySig(s, staker, structHash, deadline, nonce, signature);
        _delegate(s, staker, operator, commitmentId);
    }

    /// @dev Delegation core shared by `delegate` (staker = msg.sender) and `delegateWithSig`
    ///      (staker = verified signer). All auth/policy checks key off `staker`.
    function _delegate(OperatorRegistryStorage.Layout storage s, address staker, address operator, uint256 commitmentId)
        internal
    {
        // Only the manager's wired registry may accept stake (see register()).
        _requireWired(s);

        Operator storage op = s.operators[operator];
        if (!op.active) revert NotRegistered();

        // Enforce delegation cap
        if (op.activeDelegationCount >= s.maxDelegationsPerOperator) {
            revert MaxDelegationsExceeded(op.activeDelegationCount, s.maxDelegationsPerOperator);
        }

        // Load and verify commitment on-chain
        ICommitmentManager.Commitment memory c = ICommitmentManager(s.commitmentManager).getCommitment(commitmentId);

        if (c.committer != staker) revert NotCommitmentOwner();
        if (c.counterparty != address(this)) revert WrongCounterparty();
        if (c.released || c.forfeited) revert NotRegistered(); // commitment must be active
        _verifyAcceptance(s, c, commitmentId);

        // Reject if this commitment is already registered
        if (s.commitmentToOperator[commitmentId] != address(0)) revert CommitmentAlreadyDelegated();

        // Update operator metrics
        op.totalDelegatedStake += c.amount;
        op.activeDelegationCount += 1;

        // stakeAt (#42): checkpoint the operator's increased aggregate stake at this timestamp.
        _pushStakeCheckpoint(s, operator, op.totalDelegatedStake);

        // Clear belowMinStake flag if stake now sufficient
        if (op.belowMinStake && op.totalDelegatedStake >= s.minOperatorStake) {
            op.belowMinStake = false;
        }

        // Route hooks
        s.commitmentToOperator[commitmentId] = operator;
        s.commitmentToStaker[commitmentId] = staker;
        // snapshot the credited amount (see register()).
        s.registeredAmount[commitmentId] = c.amount;
        s.trackedCommitmentCount += 1;

        emit DelegationCreated(staker, operator, commitmentId, c.amount);

        // Mesh: aggregate the delegation into the operator's per-operator FanIn →
        // TokenWeighting (same denom as self-stake). No-op if mesh is unwired.
        _meshOnIncrease(s, operator, c.amount);
    }

    // =========================================================================
    // EIP-712 signature helpers
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function increaseNonce() external {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        uint256 next = ++s.sigNonces[msg.sender];
        emit NonceIncreased(msg.sender, next);
    }

    /// @inheritdoc IOperatorRegistry
    function sigNonces(address account) external view returns (uint256) {
        return OperatorRegistryStorage.layout().sigNonces[account];
    }

    /// @dev Validate and consume an EIP-712 signed register/delegate intent. Checks the deadline,
    ///      matches and increments the signer's nonce, and verifies the signature with
    ///      `SignatureChecker.isValidSignatureNow` so both EOAs and EIP-1271 contract signers work.
    ///      The nonce is consumed on the same conditions the direct path would apply — after this
    ///      returns, the caller runs the identical `_register`/`_delegate` core.
    function _verifySig(
        OperatorRegistryStorage.Layout storage s,
        address signer,
        bytes32 structHash,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) internal {
        if (block.timestamp > deadline) revert SignatureExpired();
        if (s.sigNonces[signer] != nonce) revert InvalidNonce();
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
        s.sigNonces[signer]++;
    }

    /// @dev Same-block register/deregister flip guard. Reverts if `account` already
    ///      toggled its registration state this block, then records the current block. Cheap
    ///      anti-grief mirroring the spirit of the forfeit challenge window; applied to BOTH the
    ///      direct and signed paths so the two behave identically (a relayer must not be able to
    ///      do what the operator itself cannot).
    ///
    ///      Stores `block.number + 1`, not `block.number`: the mapping's zero-initialized
    ///      "never toggled" sentinel would otherwise collide with a legitimate first toggle at
    ///      block 0, spuriously reverting. Real chains are never at block 0, but forge-script
    ///      simulation and a fresh anvil both start there (Foundry unit tests default to block 1,
    ///      which is why this only surfaces off-chain).
    function _guardToggle(OperatorRegistryStorage.Layout storage s, address account) internal {
        if (s.lastToggleBlock[account] == block.number + 1) revert SameBlockToggle();
        s.lastToggleBlock[account] = uint64(block.number + 1);
    }

    // =========================================================================
    // Hooks from CommitmentManager
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    /// @dev Called by CommitmentManager when a commitment with this registry as counterparty is released.
    ///      Silently ignores commitments not tracked by this registry.
    function onDelegationReleased(uint256 commitmentId, uint256 amount) external {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        if (msg.sender != s.commitmentManager) revert UnauthorizedCaller();

        (address operatorAddr, address staker) = _closeDelegation(s, commitmentId, amount);
        if (operatorAddr == address(0)) return; // not a tracked delegation — ignore

        emit DelegationReleased(staker, operatorAddr, commitmentId, amount);
    }

    /// @inheritdoc IOperatorRegistry
    /// @dev Called by CommitmentManager when a commitment with this registry as counterparty is forfeited.
    ///      Silently ignores commitments not tracked by this registry. The entire commitment is
    ///      terminated on forfeit, so the full credited amount is removed, not just the penalty.
    function onDelegationForfeited(uint256 commitmentId, uint256 forfeitedAmount, uint256 fullAmount) external {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        if (msg.sender != s.commitmentManager) revert UnauthorizedCaller();

        (address operatorAddr, address staker) = _closeDelegation(s, commitmentId, fullAmount);
        if (operatorAddr == address(0)) return; // not a tracked delegation — ignore

        _emitForfeited(staker, operatorAddr, commitmentId, forfeitedAmount);
    }

    /// @inheritdoc IOperatorRegistry
    /// @dev The manager's hook call is gas-capped and swallows failures (`RegistryHookFailed`).
    ///      A swallowed hook leaves the commitment routed here with its stake, count and mesh
    ///      power still credited, which blocks the operator's `deregister`. This runs the same
    ///      close path the hook would have. The released event carries the credited amount, since
    ///      the manager zeroes `c.amount` on close.
    function reconcile(uint256 commitmentId) external nonReentrant {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        if (s.commitmentToOperator[commitmentId] == address(0)) revert CommitmentNotTracked();

        ICommitmentManager cm = ICommitmentManager(s.commitmentManager);
        ICommitmentManager.Commitment memory c = cm.getCommitment(commitmentId);
        if (!c.released && !c.forfeited) revert CommitmentStillOpen();

        uint256 credited = s.registeredAmount[commitmentId];
        (address operatorAddr, address staker) = _closeDelegation(s, commitmentId, 0);

        if (c.forfeited) {
            _emitForfeited(staker, operatorAddr, commitmentId, cm.forfeitedUnitsOf(commitmentId));
        } else {
            emit DelegationReleased(staker, operatorAddr, commitmentId, credited);
        }
    }

    /// @dev Close a routed commitment: decrement the operator's stake and count by the amount
    ///      credited at register/delegate (not the runtime amount, which can drift via
    ///      distribute()), flag the operator below the minimum, release the same amount of mesh
    ///      power, and clear routing. Shared by both manager hooks and `reconcile`. Returns
    ///      `operatorAddr == address(0)` and changes nothing when the commitment is not routed here.
    /// @param fallbackAmount Used when no credited snapshot exists (pre-snapshot delegations).
    function _closeDelegation(OperatorRegistryStorage.Layout storage s, uint256 commitmentId, uint256 fallbackAmount)
        internal
        returns (address operatorAddr, address staker)
    {
        operatorAddr = s.commitmentToOperator[commitmentId];
        if (operatorAddr == address(0)) return (address(0), address(0));

        Operator storage op = s.operators[operatorAddr];
        staker = s.commitmentToStaker[commitmentId];

        // The operator's self-stake closed independently of deregister —
        // record it so deregister can tell "count == 1 is my live self-stake"
        // apart from "count == 1 is a live third-party delegation".
        // Documented choice: the operator is NOT auto-deactivated here. Draining
        // mesh power + list removal inside a manager lifecycle hook would add
        // side effects (and gas) to every release/forfeit; instead the operator
        // stays active-but-flagged (belowMinStake) until it deregisters, and the
        // deregister gate prevents the zombie state from stranding routing.
        if (commitmentId == op.selfStakeCommitmentId) op.selfStakeActive = false;

        uint256 credited = s.registeredAmount[commitmentId];
        if (credited == 0) credited = fallbackAmount;

        if (op.totalDelegatedStake >= credited) {
            op.totalDelegatedStake -= credited;
        } else {
            op.totalDelegatedStake = 0;
        }

        // stakeAt (#42): checkpoint the operator's decreased aggregate stake at this timestamp.
        _pushStakeCheckpoint(s, operatorAddr, op.totalDelegatedStake);

        if (op.activeDelegationCount > 0) {
            op.activeDelegationCount -= 1;
        }

        if (op.active && op.totalDelegatedStake < s.minOperatorStake) {
            op.belowMinStake = true;
            emit OperatorBelowMinStake(operatorAddr, op.totalDelegatedStake, s.minOperatorStake);
        }

        _meshOnDecrease(s, operatorAddr, credited);

        delete s.commitmentToOperator[commitmentId];
        delete s.commitmentToStaker[commitmentId];
        delete s.registeredAmount[commitmentId];
        // clamped for pre-counter legacy routing entries (see storage note).
        if (s.trackedCommitmentCount > 0) s.trackedCommitmentCount -= 1;
    }

    /// @dev Forfeit events. Forfeit proceeds sit in this registry's free balance inside the
    ///      manager until `sweepForfeitProceeds`; `ForfeitRecipientPending` surfaces them.
    function _emitForfeited(address staker, address operatorAddr, uint256 commitmentId, uint256 forfeitedAmount)
        internal
    {
        emit DelegationForfeited(staker, operatorAddr, commitmentId, forfeitedAmount);
        if (forfeitedAmount > 0) emit ForfeitRecipientPending(operatorAddr, commitmentId, forfeitedAmount);
    }

    // =========================================================================
    // IServiceManager-compatible views
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function getOperatorStake(address operator) external view returns (uint256) {
        return OperatorRegistryStorage.layout().operators[operator].totalDelegatedStake;
    }

    /// @inheritdoc IOperatorRegistry
    function stakeAt(address operator, uint64 timestamp, uint256 hint) external view returns (uint256) {
        OperatorRegistryStorage.StakeTrace storage trace = OperatorRegistryStorage.layout().operatorStakeTrace[operator];
        uint256 len = trace.length;
        if (len == 0) return 0; // operator never had a checkpoint → zero stake at any time

        // Hint fast path (O(1)): the checkpoint at `hint` covers `timestamp` iff its own
        // timestamp is at-or-before `timestamp` AND the next checkpoint (if any) starts strictly
        // after it. A wrong/out-of-range hint just skips this block and falls through to the
        // trustless binary search — a bad hint costs gas, never correctness.
        if (hint < len) {
            OperatorRegistryStorage.StakeCheckpoint storage cp = trace.points[hint];
            if (cp.timestamp <= timestamp && (hint + 1 == len || trace.points[hint + 1].timestamp > timestamp)) {
                return cp.stake;
            }
        }

        // Fallback: bounded binary search for the last checkpoint with timestamp <= `timestamp`.
        // Before the first checkpoint the operator had no stake → 0.
        if (trace.points[0].timestamp > timestamp) return 0;
        uint256 lo = 0;
        uint256 hi = len; // invariant: answer lives in [lo, hi); points[lo-1] always covers so far
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (trace.points[mid].timestamp <= timestamp) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        // `lo` is the first index strictly after `timestamp`; `lo-1` is the covering checkpoint
        // (lo >= 1 is guaranteed by the pre-search guard above).
        return trace.points[lo - 1].stake;
    }

    /// @inheritdoc IOperatorRegistry
    function isOperator(address operator) external view returns (bool) {
        return OperatorRegistryStorage.layout().operators[operator].active;
    }

    /// @inheritdoc IOperatorRegistry
    function getOperatorSet() external view returns (address[] memory) {
        return OperatorRegistryStorage.layout().operatorList;
    }

    // =========================================================================
    // Query
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function getOperator(address operator) external view returns (Operator memory) {
        return OperatorRegistryStorage.layout().operators[operator];
    }

    /// @inheritdoc IOperatorRegistry
    function getOperatorCount() external view returns (uint256) {
        return OperatorRegistryStorage.layout().operatorList.length;
    }

    // =========================================================================
    // Shared membership vocabulary (MembershipBase)
    //
    // OperatorRegistry cannot inherit the EnumerableSet-backed `Registry` base: its
    // membership fields (`operatorList` + `operatorListIndex`, raw-index convention) are
    // pinned at slot-locked EIP-7201 offsets by test/StorageSlots.t.sol, and an
    // EnumerableSet.AddressSet has a different internal representation. So it overrides the
    // shared `MembershipBase` surface directly over its locked storage — same vocabulary
    // (`isEntity`/`totalEntities`/`entity` + `checkEntity`) as the factories, zero storage
    // change. An operator address is a member iff its Operator record is `active` (kept in
    // strict lockstep with `operatorList` by register/deregister).
    // =========================================================================

    /// @inheritdoc MembershipBase
    function isEntity(address account) public view override returns (bool) {
        return OperatorRegistryStorage.layout().operators[account].active;
    }

    /// @inheritdoc MembershipBase
    function totalEntities() public view override returns (uint256) {
        return OperatorRegistryStorage.layout().operatorList.length;
    }

    /// @inheritdoc MembershipBase
    function entity(uint256 index) public view override returns (address) {
        return OperatorRegistryStorage.layout().operatorList[index];
    }

    /// @inheritdoc IOperatorRegistry
    function trackedCommitmentCount() external view returns (uint256) {
        return OperatorRegistryStorage.layout().trackedCommitmentCount;
    }

    // =========================================================================
    // Config views
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function minOperatorStake() external view returns (uint256) {
        return OperatorRegistryStorage.layout().minOperatorStake;
    }

    /// @inheritdoc IOperatorRegistry
    function maxDelegationsPerOperator() external view returns (uint256) {
        return OperatorRegistryStorage.layout().maxDelegationsPerOperator;
    }

    /// @inheritdoc IOperatorRegistry
    function commitmentManager() external view returns (address) {
        return OperatorRegistryStorage.layout().commitmentManager;
    }

    // =========================================================================
    // Admin
    // =========================================================================

    /// @notice Update the minimum operator stake threshold.
    function setMinOperatorStake(uint256 minStake_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        OperatorRegistryStorage.layout().minOperatorStake = minStake_;
    }

    /// @notice Update the maximum delegations per operator cap.
    function setMaxDelegationsPerOperator(uint256 max_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        OperatorRegistryStorage.layout().maxDelegationsPerOperator = max_;
    }

    // =========================================================================
    // Acceptance Policy
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function getAcceptancePolicy() external view returns (address arbiter, uint16 floor, address token) {
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        return (s.requiredArbiter, s.minMaxPenaltyBps, s.requiredToken);
    }

    /// @inheritdoc IOperatorRegistry
    function tightenPolicy(uint16 newFloor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFloor > BPS_DENOMINATOR) revert PenaltyExceedsMax();
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        uint16 old = s.minMaxPenaltyBps;
        if (newFloor <= old) revert PolicyNotTightening(old, newFloor);
        s.minMaxPenaltyBps = newFloor;
        emit AcceptancePolicyTightened(old, newFloor);
    }

    /// @inheritdoc IOperatorRegistry
    function setStrategyAllowed(address strategy, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (strategy == address(0)) revert ZeroStrategy();
        OperatorRegistryStorage.layout().allowedStrategies[strategy] = allowed;
        emit StrategyAllowlistUpdated(strategy, allowed);
    }

    /// @inheritdoc IOperatorRegistry
    function isStrategyAllowed(address strategy) external view returns (bool) {
        return OperatorRegistryStorage.layout().allowedStrategies[strategy];
    }

    /// @inheritdoc IOperatorRegistry
    function operatorForCommitment(uint256 commitmentId) external view returns (address) {
        return OperatorRegistryStorage.layout().commitmentToOperator[commitmentId];
    }

    /// @dev Wired-registry guard: register/delegate only while this registry is the manager's wired
    ///      operator registry. The manager notifies exactly ONE registry on release/forfeit;
    ///      a registry that is not (or is no longer) wired would credit voting power it can
    ///      never unwind — phantom, unbacked stake in governance/service quorums.
    function _requireWired(OperatorRegistryStorage.Layout storage s) internal view {
        address wired = ICommitmentManager(s.commitmentManager).operatorRegistry();
        if (wired != address(this)) revert RegistryNotWired(wired);
    }

    /// @dev Verifies a commitment matches the registry's acceptance policy.
    ///      Called from register() and delegate() after the existing committer/
    ///      counterparty/status checks. Four gates: arbiter must match exactly;
    ///      maxPenaltyBps must meet or exceed the current floor; the backing token
    ///      must be the registry's required token (stake quantities are denominated
    ///      in it); and every bound distribution strategy must be admin-allow-listed.
    ///      Strategy bindings were originally banned outright because
    ///      encumbrance-draining movements (`FromEncumbered*`) shrink `c.amount`
    ///      under the registry's snapshot accounting and leave phantom
    ///      totalDelegatedStake. The allow-list narrows that ban to
    ///      "unvetted strategies only": the admin curates a set of non-draining
    ///      (self-custody) strategies — such as OperatorCommissionCoupon, which lets
    ///      a delegator route commission to the operator — that are safe to bind. An
    ///      empty allow-list (the default) preserves the original reject-all behavior.
    function _verifyAcceptance(
        OperatorRegistryStorage.Layout storage s,
        ICommitmentManager.Commitment memory c,
        uint256 commitmentId
    ) internal view {
        if (c.arbiter != s.requiredArbiter) {
            revert WrongArbiter(s.requiredArbiter, c.arbiter);
        }
        if (c.maxPenaltyBps < s.minMaxPenaltyBps) {
            revert PenaltyTooLow(s.minMaxPenaltyBps, c.maxPenaltyBps);
        }
        if (c.token != s.requiredToken) revert WrongToken(s.requiredToken, c.token);
        // Bound strategies are rejected unless the admin has allow-listed each one.
        address[] memory strategies = ICommitmentManager(s.commitmentManager).strategiesOf(commitmentId);
        for (uint256 i; i < strategies.length; ++i) {
            if (!s.allowedStrategies[strategies[i]]) revert StrategiesNotAllowed();
        }
    }

    // =========================================================================
    // Operator Metadata
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    /// @dev Only active registered operators may call. Overwrites any prior sidecar
    ///      record with (uri, contentHash, uint64(block.timestamp)) and emits the update event.
    ///      Metadata is stored in a sidecar map isolated from the hot-path Operator record so
    ///      isOperator getOperatorStake getOperatorSet reads are unaffected.
    function setOperatorMetadata(string calldata uri, bytes32 contentHash) external nonReentrant {
        //  MDO: enforce URI length cap before any SSTORE
        if (bytes(uri).length > MAX_METADATA_URI_LENGTH) revert URITooLong();

        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();

        // only active registered operators may set their own metadata
        if (!s.operators[msg.sender].active) revert OperatorNotActive();

        uint64 ts = uint64(block.timestamp);
        s.operatorMetadata[msg.sender] =
            IOperatorRegistry.OperatorMetadata({uri: uri, contentHash: contentHash, updatedAt: ts});

        emit OperatorMetadataUpdated(msg.sender, uri, contentHash, ts);
    }

    /// @inheritdoc IOperatorRegistry
    function getOperatorMetadata(address operator) external view returns (IOperatorRegistry.OperatorMetadata memory) {
        return OperatorRegistryStorage.layout().operatorMetadata[operator];
    }

    // =========================================================================
    // Forfeit Recipient Sweep
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    /// @dev Forfeit proceeds for delegations land as a pull-payment credit to this
    ///      registry's FREE balance inside the manager. Without this entry point
    ///      the proceeds would be stranded — the manager gates `withdraw` on
    ///      `msg.sender`, and the registry has no other path that calls it.
    function sweepForfeitProceeds(address token, uint256 amount, address payTo)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (payTo == address(0)) revert ZeroPayoutAddress();

        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        ICommitmentManager(s.commitmentManager).withdraw(token, amount);
        IERC20(token).safeTransfer(payTo, amount);

        emit ForfeitRecipientSwept(token, payTo, amount);
    }

    // =========================================================================
    // Mesh wiring — OperatorRegistry → per-operator FanIn → TokenWeighting
    // =========================================================================

    /// @inheritdoc IOperatorRegistry
    function setMeshWiring(address tokenWeighting_, address meshFactory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tokenWeighting_ == address(0) || meshFactory_ == address(0)) revert ZeroMeshAddress();
        OperatorRegistryStorage.Layout storage s = OperatorRegistryStorage.layout();
        if (s.tokenWeighting != address(0)) revert MeshAlreadyWired();
        s.tokenWeighting = tokenWeighting_;
        s.meshFactory = meshFactory_;
        emit MeshWired(tokenWeighting_, meshFactory_);
    }

    /// @inheritdoc IOperatorRegistry
    function tokenWeighting() external view returns (address) {
        return OperatorRegistryStorage.layout().tokenWeighting;
    }

    /// @inheritdoc IOperatorRegistry
    function stakeDenom() external view returns (bytes32) {
        return _stakeDenom(OperatorRegistryStorage.layout());
    }

    /// @inheritdoc IOperatorRegistry
    function operatorFanIn(address operator) external view returns (address) {
        return OperatorRegistryStorage.layout().operatorFanIn[operator];
    }

    /// @dev The single mesh denom this registry credits, derived injectively from the
    ///      required backing token. One-token↔one-denom: a unit of this registry's
    ///      encumbered capital can only ever contribute to this denom's voting power,
    ///      which blocks a cross-path double-count of the same encumbered capital.
    function _stakeDenom(OperatorRegistryStorage.Layout storage s) internal view returns (bytes32) {
        return bytes32(uint256(uint160(s.requiredToken)));
    }

    /// @dev Credit `amount` of `operator` stake into the mesh: into its per-operator
    ///      FanIn (lazily deployed) and the TokenWeighting sink keyed to the operator.
    ///      Both receive the SAME verified amount, so the FanIn aggregate and the
    ///      operator's TokenWeighting power stay in lockstep with totalDelegatedStake.
    ///      No-op when mesh is unwired.
    function _meshOnIncrease(OperatorRegistryStorage.Layout storage s, address operator, uint256 amount) internal {
        address tw = s.tokenWeighting;
        if (tw == address(0) || amount == 0) return;

        bytes32 denom = _stakeDenom(s);
        address fanIn = s.operatorFanIn[operator];
        if (fanIn == address(0)) {
            // consumer = TokenWeighting (graph edge FanIn → TW); manager = this registry
            // (only it can credit/release — the verified-backing binding).
            fanIn = IMeshFactory(s.meshFactory).deployFanIn(tw, address(this));
            s.operatorFanIn[operator] = fanIn;
            IFanIn(fanIn).registerProvider(operator, denom, denom, s.minMaxPenaltyBps, 0);
            emit OperatorFanInDeployed(operator, fanIn, denom);
        }
        IFanIn(fanIn).stake(operator, denom, amount);
        ITokenWeighting(tw).stake(operator, denom, amount);
    }

    /// @dev Drive `operator`'s mesh voting power to EXACTLY zero, releasing its full
    ///      live FanIn aggregate and TokenWeighting stake read directly from the mesh.
    ///      Used on deregister so an inactive operator can never retain phantom mesh
    ///      power, regardless of any stale/stranded routing left by an independently
    ///      released or forfeited self-stake. Reading the live stake (rather than a
    ///      stored snapshot) makes the unwind exact: it releases precisely what is
    ///      there, so it never under-releases (leaving residue) nor over-releases
    ///      (reverting) — correctness does not depend on the `_meshOnDecrease` clamp.
    ///      No-op when mesh is unwired.
    function _meshDrain(OperatorRegistryStorage.Layout storage s, address operator) internal {
        address tw = s.tokenWeighting;
        if (tw == address(0)) return;

        bytes32 denom = _stakeDenom(s);

        address fanIn = s.operatorFanIn[operator];
        if (fanIn != address(0)) {
            uint256 fanInStake = IFanIn(fanIn).totalStake(denom);
            if (fanInStake > 0) IFanIn(fanIn).releaseStake(denom, fanInStake);
        }

        uint256 twStake = ITokenWeighting(tw).currentStake(operator, denom);
        if (twStake > 0) ITokenWeighting(tw).releaseStake(operator, denom, twStake);
    }

    /// @dev Decrement `amount` of `operator` stake from the mesh. Clamps to the live
    ///      stake so a registry wired mid-life (operators credited before wiring) can
    ///      never underflow the FanIn/TokenWeighting accounting. No-op when unwired.
    function _meshOnDecrease(OperatorRegistryStorage.Layout storage s, address operator, uint256 amount) internal {
        address tw = s.tokenWeighting;
        if (tw == address(0) || amount == 0) return;

        bytes32 denom = _stakeDenom(s);

        address fanIn = s.operatorFanIn[operator];
        if (fanIn != address(0)) {
            uint256 fanInStake = IFanIn(fanIn).totalStake(denom);
            uint256 relFanIn = amount > fanInStake ? fanInStake : amount;
            if (relFanIn > 0) IFanIn(fanIn).releaseStake(denom, relFanIn);
        }

        uint256 twStake = ITokenWeighting(tw).currentStake(operator, denom);
        uint256 relTw = amount > twStake ? twStake : amount;
        if (relTw > 0) ITokenWeighting(tw).releaseStake(operator, denom, relTw);
    }

    // =========================================================================
    // Historical stake checkpoints (stakeAt)
    // =========================================================================

    /// @dev Append (or same-block rewrite) a timestamped checkpoint of `operator`'s aggregate
    ///      `totalDelegatedStake`. Called on every stake mutation (register/delegate/release/
    ///      forfeit) with the operator's POST-mutation stake. Checkpoints are kept strictly
    ///      increasing in timestamp: if the tail checkpoint shares this block's timestamp it is
    ///      overwritten in place (multiple same-block mutations collapse to the final value),
    ///      otherwise a new checkpoint is appended. This keeps `stakeAt`'s binary search and hint
    ///      validation well-defined. Reverts on the (practically-unreachable) `uint192` overflow
    ///      rather than silently truncating a checkpoint value.
    function _pushStakeCheckpoint(OperatorRegistryStorage.Layout storage s, address operator, uint256 newStake)
        internal
    {
        if (newStake > type(uint192).max) revert StakeCheckpointOverflow();

        OperatorRegistryStorage.StakeTrace storage trace = s.operatorStakeTrace[operator];
        uint64 nowTs = uint64(block.timestamp);
        uint192 val = uint192(newStake);
        uint256 len = trace.length;

        if (len > 0) {
            OperatorRegistryStorage.StakeCheckpoint storage last = trace.points[len - 1];
            if (last.timestamp == nowTs) {
                // Same-block mutation: rewrite the tail in place (mapping-backed → clean overwrite).
                last.stake = val;
                emit StakeCheckpointed(operator, nowTs, newStake);
                return;
            }
        }

        trace.points[len] = OperatorRegistryStorage.StakeCheckpoint({timestamp: nowTs, stake: val});
        trace.length = len + 1;
        emit StakeCheckpointed(operator, nowTs, newStake);
    }

    // =========================================================================
    // UUPS Upgrade Authorization
    // =========================================================================

    /// @dev Only DEFAULT_ADMIN_ROLE can authorize upgrades
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
