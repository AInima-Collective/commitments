// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {LinkedMutualPolicy} from "src/extensions/mutuals/LinkedMutualPolicy.sol";
import {MutualLib} from "src/extensions/mutuals/MutualLib.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";

/// @title VaultCoverConduit
/// @notice The vault's keyless policyholder-of-record in the underwritten-vault pattern
///         (use-cases/agent-bonds.md): it turns the premium share skimmed from the vault's own
///         yield (pushed here in the underlying by a `PremiumSkimStrategy`) into funding for the
///         mutual's premium stream, so EVERY deposit into the vault is ambient-covered — no
///         depositor ever buys cover individually.
///
///         Why `fundStandby` and not `bindCover`: mutual loss coverage is STRUCTURAL — a validated
///         loss marks down member commitments regardless of any recorded notional (the arbiter's
///         binding snapshot is auditability only, never a settlement gate) — so a notional binding
///         would buy the vault nothing enforceable, while ratcheting `activeNotionalSold` (there is
///         no early un-bind) and distorting the scheduler's utilization price. Standby funding is
///         the exact fit: the vault pays the underwriters' reservation fee on the pool's
///         offered-but-unallocated capacity.
///
///         `poke()` is permissionless and skips rather than reverts when there is nothing to fund
///         (dust, no budget, no underwriters, no standby capacity, a duration under the floor). It
///         does revert when the vault refuses the deposit leg (deposits paused, or over the
///         strategy's cap), even if a share budget is already waiting.
///
///         When `activeCover == 0` (no underwriters) premium accrual pauses and funds pool up
///         here; members that later join are paid from the backlog on the next poke. Note the
///         members remain slashable throughout — a premium-stream lapse pauses underwriter pay,
///         never the cover itself.
///
///         Funding math: the budget (this contract's vault-share balance, after depositing any
///         underlying it holds) is converted to a stream duration by inverting the scheduler's
///         quote, which is linear in duration: `duration = budget · 1y / quoteStandby(1y)`. While
///         a stream is live the duration is clamped to the remaining stream time, which makes the
///         core's `PremiumRateDecreased` guard unreachable (adding premium over ≤ the remaining
///         window can only raise the rate). Floor rounding keeps `premium ≤ budget` always.
///
///         No admin, no owner: the immutable (vault, policy, mutualId) triple is the whole trust
///         surface, mirroring `ForfeitDonationBeneficiary`.
contract VaultCoverConduit is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice The mutual's numeraire must be the vault's own shares — the conduit pays premium
    ///         in shares minted from the skimmed underlying.
    error NumeraireMismatch(address numeraire, address vault);

    error ZeroAddress();

    /// @notice `maxStreamDuration_` below the core's 1-minute stream floor can never fund.
    error DurationBelowStreamFloor();

    /// @notice A poke funded the mutual's premium stream.
    event PremiumFunded(uint256 indexed mutualId, uint256 premium, uint64 duration);

    /// @dev Scheduler quote horizon used for the budget→duration inversion.
    uint64 internal constant ONE_YEAR = 365 days;

    /// @notice The custody root running the mutual's premium stream.
    ICommitmentManager public immutable manager;

    /// @notice The covered vault; also the mutual's numeraire token (shares).
    ICommitmentsVault public immutable vault;

    /// @notice The vault's underlying asset (what the skim strategy pushes here).
    IERC20 public immutable asset;

    /// @notice The premium policy this conduit funds standby through.
    LinkedMutualPolicy public immutable policy;

    /// @notice The pricing scheduler behind `policy` (read for the duration inversion).
    PremiumScheduler public immutable scheduler;

    /// @notice The mutual whose underwriters cover the vault.
    uint256 public immutable mutualId;

    /// @notice Cap on a single poke's stream duration, so one thin poke never locks a
    ///         year-long stream (later pokes can only raise a live rate).
    uint64 public immutable maxStreamDuration;

    /// @notice Underlying-balance dust floor below which a poke skips the vault deposit.
    uint256 public immutable minFundAssets;

    /// @param vault_ The covered `CommitmentsVault`.
    /// @param policy_ The `LinkedMutualPolicy` fronting the mutual's premium stream.
    /// @param mutualId_ The covering mutual; MUST already be registered with
    ///        `numeraire == vault_` (checked here).
    /// @param maxStreamDuration_ Per-poke stream-duration cap (≥ the core's 1-minute floor).
    /// @param minFundAssets_ Underlying dust floor for the deposit leg.
    constructor(address vault_, address policy_, uint256 mutualId_, uint64 maxStreamDuration_, uint256 minFundAssets_) {
        if (vault_ == address(0) || policy_ == address(0)) revert ZeroAddress();
        if (maxStreamDuration_ < MutualLib.MIN_STREAM_DURATION) revert DurationBelowStreamFloor();

        vault = ICommitmentsVault(vault_);
        policy = LinkedMutualPolicy(policy_);
        manager = LinkedMutualPolicy(policy_).manager();
        scheduler = LinkedMutualPolicy(policy_).scheduler();
        asset = IERC20(ICommitmentsVault(vault_).asset());
        mutualId = mutualId_;
        maxStreamDuration = maxStreamDuration_;
        minFundAssets = minFundAssets_;

        address numeraire = LinkedMutualPolicy(policy_).manager().getMutual(mutualId_).numeraire;
        if (numeraire != vault_) revert NumeraireMismatch(numeraire, vault_);
    }

    /// @notice Permissionlessly advance the funding pipeline: deposit any skimmed underlying into
    ///         the vault (shares mint to this contract — dilution-neutral), then convert the whole
    ///         share budget into a standby premium stream for the mutual. Skips (returns zeros)
    ///         whenever a step has nothing to do: dust balance, no budget, no underwriters, no
    ///         standby capacity, or a duration below the core's stream floor.
    /// @return premium Numeraire (share) premium pulled into the stream this poke.
    /// @return duration Stream duration funded this poke.
    function poke() external nonReentrant returns (uint256 premium, uint64 duration) {
        // 1. Underlying → shares. Premium re-enters the vault as principal on the strategy side,
        //    so this leg never feeds back into the next skim.
        uint256 assets = asset.balanceOf(address(this));
        if (assets >= minFundAssets && assets > 0) {
            asset.forceApprove(address(vault), assets);
            vault.deposit(assets, address(this));
        }

        uint256 budget = vault.balanceOf(address(this));
        duration = _durationFor(budget);
        if (duration == 0) return (0, 0);

        // The policy pulls exactly the standby quote for `duration`, which floor rounding keeps
        // at or under `budget`.
        IERC20(address(vault)).forceApprove(address(policy), budget);
        premium = policy.fundStandby(mutualId, duration);
        emit PremiumFunded(mutualId, premium, duration);
    }

    /// @dev Invert the scheduler's linear-in-duration standby quote into the longest stream the
    ///      budget can pay, clamped to the live stream's remaining window (rate-guard safety), the
    ///      per-poke cap, and the core's floor. Returns 0 to signal "skip".
    function _durationFor(uint256 budget) internal view returns (uint64) {
        if (budget == 0) return 0;

        // Wound down or wiped out: the core takes no more premium (`fundMutualPremium` reverts),
        // and `activeCover` stays large until members settle, so skip here.
        ICommitmentManager.Mutual memory g = manager.getMutual(mutualId);
        if (g.terminal || g.exhausted) return 0;

        (, uint128 activeCover,,,, uint64 periodFinish,,,) = manager.getMutualPremiumState(mutualId);
        if (activeCover == 0) return 0; // no underwriters: accumulate, cover stays structural

        uint256 perYear = scheduler.quoteStandby(mutualId, ONE_YEAR);
        if (perYear == 0) return 0;

        uint256 duration = (budget * uint256(ONE_YEAR)) / perYear;
        if (block.timestamp < periodFinish) {
            // Live stream: adding over ≤ the remaining window can only raise the rate, so the
            // core's PremiumRateDecreased guard is unreachable.
            uint256 remaining = uint256(periodFinish) - block.timestamp;
            if (duration > remaining) duration = remaining;
        }
        if (duration > maxStreamDuration) duration = maxStreamDuration;
        if (duration < MutualLib.MIN_STREAM_DURATION) return 0;
        // The quote is linear in duration, so this is exactly "the quote for `duration` floors to
        // zero"; skip rather than let `fundStandby` revert `NoStandbyCapacity`.
        if (perYear * duration < ONE_YEAR) return 0;
        return uint64(duration);
    }
}
