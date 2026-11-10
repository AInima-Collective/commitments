// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {ILinkedMutualPolicy} from "src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol";

/// @title OptimisticMutualArbiter
/// @notice The pluggable mutual arbiter for a Mutual: a bonded/optimistic loss-
///         declaration path that sits between a claim proposer and the custody root's two-phase
///         `initiateMutualLoss` / `executeMutualLoss`. This is where the dispute model lives —
///         the Mutuals core (ERC-COMMITMENTS-MUTUALS) deliberately keeps native-token bond custody OUT of the
///         manager and
///         delegates it to a pluggable arbiter (mirrors `OptimisticInsuranceArbiter` for the
///         per-commitment path).
/// @dev Flow: a proposer posts an ERC-20 `bond` and declares a loss; the manager's mutual challenge
///      window opens. A dispute committee (the `owner`) may VETO during the window — that cancels
///      the declaration in the manager and slashes the bond to `treasury`. If undisputed, anyone
///      calls `manager.executeMutualLoss` directly once the window elapses, and anyone reclaims the
///      bond to the proposer here (or the next `proposeLoss` does it). One active claim per mutual
///      (mirrors the manager's INV-7).
contract OptimisticMutualArbiter is IArbiter, Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev The cover-binding snapshot `proposeLossFor` takes is emitted in `CoverBindingSnapshotted`,
    ///      not stored: nothing on chain reads it.
    struct Claim {
        address proposer;
        uint64 proposedAt;
        bool resolved; // bond reclaimed or slashed
        uint256 bond;
    }

    ICommitmentManager public immutable manager;
    IERC20 public immutable bondToken;
    uint256 public immutable minBond;
    address public treasury;
    /// @notice The LinkedMutualPolicy whose cover bindings `proposeLossFor` snapshots. Owner-set
    ///         after deploy (avoids a constructor-signature break / policy<->arbiter deploy cycle).
    ///         Optional: when unset, only the plain `proposeLoss` (no snapshot) is usable.
    address public coverPolicy;

    /// @dev mutualId => active/last claim.
    mapping(uint256 => Claim) public claims;

    event LossProposed(uint256 indexed mutualId, address indexed proposer, uint256 lossNumeraire, uint256 bond);
    event LossVetoed(uint256 indexed mutualId, address indexed proposer, uint256 slashedBond);
    event BondReclaimed(uint256 indexed mutualId, address indexed proposer, uint256 bond);
    event TreasuryUpdated(address indexed treasury);
    event CoverPolicyUpdated(address indexed coverPolicy);
    event CoverBindingSnapshotted(
        uint256 indexed mutualId, uint256 indexed coverBindingId, uint256 notional, uint64 expiry, address policyholder
    );

    error ZeroAddress();
    error BondTooLow();
    error ClaimActive();
    error NoClaim();
    error AlreadyResolved();
    error LossNotExecuted();
    error VetoWindowClosed();
    error LossNotCancelled();
    error CoverPolicyUnset();
    error BindingMutualMismatch();

    constructor(address manager_, address bondToken_, uint256 minBond_, address treasury_, address owner_)
        Ownable(owner_)
    {
        if (manager_ == address(0) || bondToken_ == address(0) || treasury_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        manager = ICommitmentManager(manager_);
        bondToken = IERC20(bondToken_);
        minBond = minBond_;
        treasury = treasury_;
    }

    /// @inheritdoc IArbiter
    function commitmentManager() external view returns (address) {
        return address(manager);
    }

    /// @inheritdoc IArbiter
    /// @dev Drives the mutual loss lifecycle only (`activateMutual` via
    ///      {activate}, `initiateMutualLoss` via {proposeLoss}, `cancelMutualLoss`
    ///      via {veto}); it never touches per-commitment or agreement actions.
    function arbiterCapabilities() external pure returns (uint256) {
        return ArbiterCapabilities.MUTUAL_LOSS;
    }

    /// @inheritdoc IArbiter
    /// @dev The bonded dispute terms live in on-chain state; no off-chain
    ///      pointer is published.
    function arbiterMetadataURI() external pure returns (string memory) {
        return "";
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IArbiter).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Wire the LinkedMutualPolicy whose cover bindings `proposeLossFor` snapshots. Set
    ///         post-deploy to avoid a constructor break and the policy<->arbiter deploy cycle.
    function setCoverPolicy(address coverPolicy_) external onlyOwner {
        if (coverPolicy_ == address(0)) revert ZeroAddress();
        coverPolicy = coverPolicy_;
        emit CoverPolicyUpdated(coverPolicy_);
    }

    /// @notice Activate a mutual whose arbiter is this contract (owner-gated). Members can only join
    ///         an active mutual, so activation means the committee accepts the mutual; it does not
    ///         wait for target capacity.
    function activate(uint256 mutualId) external onlyOwner {
        manager.activateMutual(mutualId);
    }

    /// @notice Post a bond and declare a mutual loss, opening the manager's mutual challenge window.
    ///         No cover binding is referenced.
    function proposeLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash, uint256 bond)
        external
        nonReentrant
    {
        _proposeLoss(mutualId, lossNumeraire, evidenceHash, bond);
    }

    /// @notice Post a bond and declare a mutual loss, snapshotting a cover binding into the claim for
    ///         AUDITABILITY ONLY. Reads `{notional, expiry, policyholder}` from the LinkedMutual-
    ///         Policy and emits it in `CoverBindingSnapshotted`; the snapshot gates NOTHING — the core
    ///         settles whatever is validated regardless of whether a funded policy exists (plan Risk #2,
    ///         premium-without-cover is accepted arbiter/social trust). Otherwise identical to
    ///         `proposeLoss`. The binding must belong to `mutualId`.
    function proposeLossFor(
        uint256 mutualId,
        uint256 lossNumeraire,
        bytes32 evidenceHash,
        uint256 bond,
        uint256 coverBindingId
    ) external nonReentrant {
        address policy = coverPolicy;
        if (policy == address(0)) revert CoverPolicyUnset();
        ILinkedMutualPolicy.CoverBinding memory b = ILinkedMutualPolicy(policy).getCoverBinding(coverBindingId);
        if (b.mutualId != mutualId) revert BindingMutualMismatch();

        _proposeLoss(mutualId, lossNumeraire, evidenceHash, bond);
        emit CoverBindingSnapshotted(mutualId, coverBindingId, b.notional, b.expiry, b.policyholder);
    }

    /// @dev Shared propose body. Bond custody + claim recording + manager initiation. A prior
    ///      unresolved claim whose manager proposal has executed or been cancelled is refunded to
    ///      its proposer first; only a claim still pending in the manager reverts `ClaimActive`.
    function _proposeLoss(uint256 mutualId, uint256 lossNumeraire, bytes32 evidenceHash, uint256 bond) internal {
        if (bond < minBond) revert BondTooLow();
        Claim storage c = claims[mutualId];
        if (c.proposedAt != 0 && !c.resolved) {
            ICommitmentManager.MutualLossProposal memory p = manager.getMutualLossProposal(mutualId);
            if (!p.executed && !p.cancelled) revert ClaimActive();
            _refund(mutualId, c);
        }

        bondToken.safeTransferFrom(msg.sender, address(this), bond);
        claims[mutualId] =
            Claim({proposer: msg.sender, proposedAt: uint64(block.timestamp), resolved: false, bond: bond});

        // The manager enforces arbiter == address(this), the window, and the rate limit.
        manager.initiateMutualLoss(mutualId, lossNumeraire, evidenceHash);
        emit LossProposed(mutualId, msg.sender, lossNumeraire, bond);
    }

    /// @notice Dispute committee veto, only WITHIN the manager's mutual challenge window: cancel the
    ///         declaration in the manager and slash the proposer's bond to the treasury. Gating to
    ///         the window preserves the optimistic guarantee — an undisputed proposal that survives
    ///         its window can no longer be vetoed-and-slashed (it simply executes).
    function veto(uint256 mutualId) external onlyOwner nonReentrant {
        Claim storage c = claims[mutualId];
        if (c.proposedAt == 0 || c.resolved) revert NoClaim();
        uint64 window = manager.getMutual(mutualId).challengeWindow;
        if (block.timestamp >= uint256(c.proposedAt) + window) revert VetoWindowClosed();

        c.resolved = true;
        manager.cancelMutualLoss(mutualId); // arbiter == address(this)

        uint256 slashed = c.bond;
        if (slashed > 0) bondToken.safeTransfer(treasury, slashed);
        emit LossVetoed(mutualId, c.proposer, slashed);
    }

    /// @notice After an UNDISPUTED loss has executed in the manager, return the bond to the
    ///         proposer. Permissionless: the refund always goes to `proposer`. Reverts until the
    ///         manager has marked the proposal executed.
    function reclaimBond(uint256 mutualId) external nonReentrant {
        Claim storage c = claims[mutualId];
        if (c.proposedAt == 0) revert NoClaim();
        if (c.resolved) revert AlreadyResolved();
        if (!manager.getMutualLossProposal(mutualId).executed) revert LossNotExecuted();
        _refund(mutualId, c);
    }

    /// @notice Recover the bond and clear the claim when the manager proposal was CANCELLED without
    ///         executing — notably by the permissionless `cancelStaleMutualLoss` (reachable by
    ///         anyone after window + TTL, e.g. if forfeiture was paused or the proposer never
    ///         executed). Without this the bond would be permanently stuck and `proposeLoss` would
    ///         revert `ClaimActive` forever, bricking the mutual's claim path (red-team #1).
    ///         The proposer is refunded (a stale-cancel is not a committee judgment of bad faith;
    ///         the `veto` path is the one that slashes).
    function reclaimOnCancelled(uint256 mutualId) external nonReentrant {
        Claim storage c = claims[mutualId];
        if (c.proposedAt == 0) revert NoClaim();
        if (c.resolved) revert AlreadyResolved();
        ICommitmentManager.MutualLossProposal memory p = manager.getMutualLossProposal(mutualId);
        if (p.executed) revert AlreadyResolved(); // executed -> use reclaimBond
        if (!p.cancelled) revert LossNotCancelled(); // still pending -> nothing to recover
        _refund(mutualId, c);
    }

    /// @dev Mark the claim resolved and return its bond to the proposer.
    function _refund(uint256 mutualId, Claim storage c) private {
        c.resolved = true;
        uint256 bond = c.bond;
        if (bond > 0) bondToken.safeTransfer(c.proposer, bond);
        emit BondReclaimed(mutualId, c.proposer, bond);
    }
}
