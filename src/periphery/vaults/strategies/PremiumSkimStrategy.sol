// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IYieldStrategy} from "src/periphery/vaults/interfaces/IYieldStrategy.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

/// @title PremiumSkimStrategy
/// @notice Abstract `IYieldStrategy` base that skims a configured share of NEW realized gains and
///         splits it between a fixed operator fee (the vault's manager) and a premium recipient
///         (a `VaultCoverConduit` funding the underwriters' premium stream). This is the funding
///         leg of the underwritten-vault pattern (use-cases/agent-bonds.md): the vault's own yield
///         pays the parties who keep its deposits covered.
///
///         Accounting model (high-water-mark discipline):
///         - `principal` tracks the vault's cost basis in the strategy: every vault `deposit`
///           raises it, every `withdraw` lowers it (donations enter through `deposit`, so donated
///           assets are principal and are never re-skimmed).
///         - Gains `G = max(totalAssets − principal, 0)`. Only gains ABOVE `chargedGains` (the
///           high-water mark of gains already charged) are skimmable — a drawdown pushes `G` under
///           the mark and no skim is possible until the venue fully recovers; `chargedGains` never
///           decreases on loss.
///         - `skim()` (permissionless) takes `skimBps` of the new gains, pays
///           `operatorFeeBps` of that fee to `operator` and the remainder to `premiumRecipient`,
///           then re-marks `chargedGains` at the post-skim gains level. Immediately after a skim
///           `G == chargedGains`, so NAV/share never drops below the previously charged mark —
///           a skim can never present as a drawdown breach of the peril floor.
///         - Withdrawals that exceed `principal` carry gains out to depositors; the exited gains
///           are removed from `chargedGains` (floored at zero) rather than treated as a loss.
///           Uncharged gains that exit this way simply escape the skim — the drift is bounded and
///           always in the depositors' favor.
///
///         Production pattern: inherit, route `_managedAssets()` at the live venue's valuation,
///         unwind liquidity in `_beforeWithdraw`, deploy it in `_afterDeposit`, and realize the
///         skim (make `fee` liquid in this contract) in `_realizeSkim`. The dev/demo concrete is
///         `test/helpers/SkimmingMockStrategy.sol`.
///
///         Custody model matches `CommitmentsVault._deposit`/`_withdraw` (push; vault-only moves)
///         — see `IdleStrategy` for the canonical handshake description. No admin, no upgrade:
///         the immutable parameter set is the whole trust surface.
abstract contract PremiumSkimStrategy is IYieldStrategy, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Reverts a fund-moving call from anyone other than the bound vault.
    error OnlyVault();

    /// @notice `skim()` called with no new gains above the charged high-water mark.
    error NothingToSkim();

    /// @notice A bps parameter exceeds 10_000.
    error BpsExceedsMax();

    error ZeroAddress();

    /// @notice New gains were charged: `fee` left the strategy out of `newGains` fresh gains.
    event YieldSkimmed(uint256 newGains, uint256 fee);

    /// @notice The operator's fixed share of a skim was paid out.
    event OperatorFeePaid(address indexed operator, uint256 amount);

    /// @notice The premium share of a skim was routed to the premium recipient.
    event PremiumRouted(address indexed premiumRecipient, uint256 amount);

    /// @inheritdoc IYieldStrategy
    address public immutable override asset;
    /// @inheritdoc IYieldStrategy
    address public immutable override vault;

    /// @notice The vault manager (the agent): receives the fixed-fee leg of every skim.
    address public immutable operator;

    /// @notice Receives the premium leg of every skim (a `VaultCoverConduit` in the underwritten
    ///         vault pattern; any address works).
    address public immutable premiumRecipient;

    /// @notice Share of NEW gains taken by a skim, in bps of the gains above the charged mark.
    uint16 public immutable skimBps;

    /// @notice The operator's share OF the skim, in bps (the remainder funds the premium).
    uint16 public immutable operatorFeeBps;

    /// @notice The vault's cost basis in this strategy: Σ deposits − Σ withdrawals (clamped ≥ 0).
    uint256 public principal;

    /// @notice High-water mark of gains already charged by past skims. Never decreases on loss.
    uint256 public chargedGains;

    /// @param asset_ The ERC-20 this strategy custodies; MUST equal the binding vault's `asset()`.
    /// @param vault_ The `CommitmentsVault` proxy this strategy is bound to.
    /// @param operator_ Receiver of the fixed operator fee.
    /// @param premiumRecipient_ Receiver of the premium share.
    /// @param skimBps_ Share of new gains skimmed (≤ 10_000).
    /// @param operatorFeeBps_ Operator's share of the skim (≤ 10_000).
    constructor(
        address asset_,
        address vault_,
        address operator_,
        address premiumRecipient_,
        uint16 skimBps_,
        uint16 operatorFeeBps_
    ) {
        if (asset_ == address(0) || vault_ == address(0) || operator_ == address(0) || premiumRecipient_ == address(0))
        {
            revert ZeroAddress();
        }
        if (skimBps_ > BPS_DENOMINATOR || operatorFeeBps_ > BPS_DENOMINATOR) revert BpsExceedsMax();
        asset = asset_;
        vault = vault_;
        operator = operator_;
        premiumRecipient = premiumRecipient_;
        skimBps = skimBps_;
        operatorFeeBps = operatorFeeBps_;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Raises the cost basis, then lets the concrete deploy the pushed assets. Donations
    ///      arrive through this same path (the vault pushes donated assets into the strategy),
    ///      so donated value is principal — never skimmed.
    function deposit(uint256 assets) external override onlyVault {
        principal += assets;
        _afterDeposit(assets);
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Lowers the cost basis; a withdrawal beyond `principal` is gains physically leaving to
    ///      depositors — those exited gains are un-tracked from `chargedGains` (floored at zero),
    ///      NOT treated as a loss. The concrete unwinds liquidity in `_beforeWithdraw`; the base
    ///      then pays the vault.
    function withdraw(uint256 assets) external override onlyVault {
        uint256 principal_ = principal;
        if (assets <= principal_) {
            principal = principal_ - assets;
        } else {
            uint256 gainsOut = assets - principal_;
            principal = 0;
            uint256 charged = chargedGains;
            chargedGains = charged > gainsOut ? charged - gainsOut : 0;
        }
        _beforeWithdraw(assets);
        IERC20(asset).safeTransfer(vault, assets);
    }

    /// @inheritdoc IYieldStrategy
    function totalAssets() public view override returns (uint256) {
        return _managedAssets();
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Unbounded by default; concretes with a venue cap override.
    function maxDeposit() external view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /// @notice Preview what `skim()` would move right now.
    /// @return newGains Gains above the charged high-water mark.
    /// @return operatorFee The operator's cut of the skim.
    /// @return premiumShare The premium recipient's cut of the skim.
    function pendingSkim() public view returns (uint256 newGains, uint256 operatorFee, uint256 premiumShare) {
        uint256 gains = _currentGains();
        uint256 charged = chargedGains;
        if (gains <= charged) return (0, 0, 0);
        newGains = gains - charged;
        uint256 fee = (newGains * skimBps) / BPS_DENOMINATOR;
        operatorFee = (fee * operatorFeeBps) / BPS_DENOMINATOR;
        premiumShare = fee - operatorFee;
    }

    /// @notice Permissionlessly charge the gains accrued above the high-water mark: pay the
    ///         operator fee and route the premium share, then re-mark. Reverts when there is
    ///         nothing to charge (no new gains, or the skim rounds to zero).
    /// @return operatorFee The amount paid to `operator`.
    /// @return premiumShare The amount routed to `premiumRecipient`.
    function skim() external nonReentrant returns (uint256 operatorFee, uint256 premiumShare) {
        uint256 newGains;
        (newGains, operatorFee, premiumShare) = pendingSkim();
        uint256 fee = operatorFee + premiumShare;
        if (fee == 0) revert NothingToSkim();

        // Re-mark BEFORE moving funds: post-skim gains level (G − fee) is fully charged.
        chargedGains = _currentGains() - fee;
        _realizeSkim(fee);

        emit YieldSkimmed(newGains, fee);
        if (operatorFee > 0) {
            IERC20(asset).safeTransfer(operator, operatorFee);
            emit OperatorFeePaid(operator, operatorFee);
        }
        if (premiumShare > 0) {
            IERC20(asset).safeTransfer(premiumRecipient, premiumShare);
            emit PremiumRouted(premiumRecipient, premiumShare);
        }
    }

    /// @dev Gains above cost basis, floored at zero (a drawdown reports 0, not negative).
    function _currentGains() internal view returns (uint256) {
        uint256 assets = _managedAssets();
        uint256 principal_ = principal;
        return assets > principal_ ? assets - principal_ : 0;
    }

    /// @notice Current value of everything managed, denominated in the underlying. The concrete's
    ///         venue valuation; MUST reconcile with what `withdraw` can pay.
    function _managedAssets() internal view virtual returns (uint256);

    /// @notice Deploy `assets` that the vault has already pushed into this contract.
    function _afterDeposit(uint256 assets) internal virtual;

    /// @notice Unwind the venue so at least `assets` of the underlying sit liquid in this
    ///         contract, and drop them from the managed valuation.
    function _beforeWithdraw(uint256 assets) internal virtual;

    /// @notice Make `fee` of the underlying liquid in this contract and drop it from the managed
    ///         valuation (it is about to be transferred out by the base).
    function _realizeSkim(uint256 fee) internal virtual;
}
