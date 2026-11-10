// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {deployManager} from "../helpers/ManagerTestBase.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {ForfeitDonationBeneficiary} from "src/periphery/vaults/ForfeitDonationBeneficiary.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title ForfeitDonationBeneficiaryTest
/// @notice Unit surface of the permissionless forfeit→donate sweep: ledger + direct
///         balances both swept, zero-state reverts, constructor validation, and the
///         NAV-per-share lift for remaining depositors.
contract ForfeitDonationBeneficiaryTest is Test {
    CommitmentManager internal manager;
    CommitmentsVault internal vault;
    ForfeitDonationBeneficiary internal beneficiary;
    MockERC20 internal dai;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal donor = makeAddr("donor"); // stands in for the slashed committer

    function setUp() public {
        manager = deployManager(admin, 7 days, 14 days);
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        CommitmentsVault impl = new CommitmentsVault();
        vault = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        CommitmentsVault.initialize, (IERC20(address(dai)), "Vault", "cvDAI", admin, address(0))
                    )
                )
            )
        );
        beneficiary = new ForfeitDonationBeneficiary(address(manager), address(vault), address(vault));

        dai.mint(alice, 1_000e18);
        vm.startPrank(alice);
        dai.approve(address(vault), 1_000e18);
        vault.deposit(1_000e18, alice);
        vm.stopPrank();
    }

    /// @dev Simulates the forfeit outcome: shares land in the beneficiary's manager
    ///      free balance (what executeForfeit does for a counterparty).
    function _fundBeneficiaryViaManager(uint256 assets) internal returns (uint256 shares) {
        dai.mint(donor, assets);
        vm.startPrank(donor);
        dai.approve(address(vault), assets);
        shares = vault.deposit(assets, donor);
        vault.approve(address(manager), shares);
        manager.depositFor(address(vault), shares, address(beneficiary));
        vm.stopPrank();
    }

    function test_sweep_fromManagerLedger_liftsNav() public {
        uint256 navBefore = vault.convertToAssets(1e18);
        _fundBeneficiaryViaManager(100e18);

        uint256 donated = beneficiary.sweep();

        assertGt(donated, 0);
        assertEq(manager.freeBalance(address(vault), address(beneficiary)), 0);
        assertEq(vault.balanceOf(address(beneficiary)), 0);
        assertGt(vault.convertToAssets(1e18), navBefore, "NAV per share must rise");
        // Alice captures (nearly all of) the donation — donor's shares were burned.
        assertGt(vault.convertToAssets(vault.balanceOf(alice)), 1_000e18 + 99e18);
    }

    function test_sweep_directTransferredShares() public {
        // Shares sent straight to the contract (no manager ledger) still sweep.
        dai.mint(donor, 50e18);
        vm.startPrank(donor);
        dai.approve(address(vault), 50e18);
        uint256 shares = vault.deposit(50e18, donor);
        vault.transfer(address(beneficiary), shares);
        vm.stopPrank();

        uint256 donated = beneficiary.sweep();
        assertGt(donated, 0);
        assertEq(vault.balanceOf(address(beneficiary)), 0);
    }

    function test_sweep_empty_reverts() public {
        vm.expectRevert(ForfeitDonationBeneficiary.NothingToSweep.selector);
        beneficiary.sweep();
    }

    function test_constructor_assetMismatch_reverts() public {
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        CommitmentsVault impl = new CommitmentsVault();
        CommitmentsVault other = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        CommitmentsVault.initialize, (IERC20(address(usdc)), "Other", "cvUSDC", admin, address(0))
                    )
                )
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(ForfeitDonationBeneficiary.AssetMismatch.selector, address(dai), address(usdc))
        );
        new ForfeitDonationBeneficiary(address(manager), address(vault), address(other));
    }

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert(ForfeitDonationBeneficiary.ZeroAddress.selector);
        new ForfeitDonationBeneficiary(address(0), address(vault), address(vault));
    }
}
