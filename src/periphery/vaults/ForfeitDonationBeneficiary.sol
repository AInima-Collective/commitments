// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";

/// @title ForfeitDonationBeneficiary
/// @notice Names a VAULT'S DEPOSITORS as a commitment's counterparty. Forfeit proceeds
///         (shares of `sourceVault`, paid into this contract's free balance on the
///         manager, pull-payment) are swept permissionlessly: withdrawn from the
///         manager, redeemed to the underlying, and donated into `targetVault` —
///         lifting NAV per share uniformly for every remaining depositor. No admin
///         keys, no owner, one one-way code path; trust is rooted in the immutable
///         (manager, sourceVault, targetVault) triple a committer opts into.
///
///         Canonical uses:
///         - Agent-managed vault (use-cases/agent-bonds.md): `source == target` — the
///           manager of vault V bonds shares OF V; slashing the manager redeems its
///           shares and donates the assets back into V, making V's depositors whole.
///           (Redeem-then-donate burns supply and returns the assets: NAV/share rises.)
///         - Cross-vault underwriting (use-cases/cross-vault-underwriting.md):
///           `source != target` — the underwriter's Vault-B shares are redeemed and
///           the proceeds donated to insured Vault A (both over the same asset).
contract ForfeitDonationBeneficiary is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice The two vaults share one underlying asset; donation would revert or
    ///         misdenominate otherwise.
    error AssetMismatch(address sourceAsset, address targetAsset);

    /// @notice Nothing to sweep: no source-vault shares on the manager ledger or in
    ///         direct balance.
    error NothingToSweep();

    error ZeroAddress();

    /// @notice A sweep converted `shares` of `sourceVault` into `assets` donated to
    ///         `targetVault`.
    event ForfeitDonated(uint256 shares, uint256 assets);

    /// @notice The commitment manager holding forfeited shares in this contract's
    ///         free balance.
    ICommitmentManager public immutable manager;

    /// @notice The vault whose shares this contract receives on forfeit.
    IERC4626 public immutable sourceVault;

    /// @notice The vault the redeemed assets are donated into (may equal source).
    ICommitmentsVault public immutable targetVault;

    /// @notice The shared underlying of both vaults (checked equal at construction).
    IERC20 public immutable asset;

    constructor(address manager_, address sourceVault_, address targetVault_) {
        if (manager_ == address(0) || sourceVault_ == address(0) || targetVault_ == address(0)) {
            revert ZeroAddress();
        }
        address srcAsset = IERC4626(sourceVault_).asset();
        address tgtAsset = IERC4626(targetVault_).asset();
        if (srcAsset != tgtAsset) revert AssetMismatch(srcAsset, tgtAsset);
        manager = ICommitmentManager(manager_);
        sourceVault = IERC4626(sourceVault_);
        targetVault = ICommitmentsVault(targetVault_);
        asset = IERC20(tgtAsset);
    }

    /// @notice Permissionlessly convert every forfeited share this contract holds into
    ///         a donation to `targetVault`: manager free balance is withdrawn first,
    ///         then the full direct share balance (tolerating direct transfers) is
    ///         redeemed and the proceeds donated.
    /// @return assets The underlying amount donated.
    function sweep() external nonReentrant returns (uint256 assets) {
        uint256 ledgerShares = manager.freeBalance(address(sourceVault), address(this));
        if (ledgerShares > 0) manager.withdraw(address(sourceVault), ledgerShares);

        uint256 shares = IERC20(address(sourceVault)).balanceOf(address(this));
        if (shares == 0) revert NothingToSweep();

        assets = sourceVault.redeem(shares, address(this), address(this));

        asset.forceApprove(address(targetVault), assets);
        targetVault.donate(assets);

        emit ForfeitDonated(shares, assets);
    }
}
