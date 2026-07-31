// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";

/// @dev Minimal 4626-shaped mock: only the two views the adapter reads.
contract Mock4626 {
    address public asset;
    uint256 internal _indexNumerator; // assets per 1e18 shares

    constructor(address asset_, uint256 indexNumerator_) {
        asset = asset_;
        _indexNumerator = indexNumerator_;
    }

    function setIndex(uint256 indexNumerator_) external {
        _indexNumerator = indexNumerator_;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return (shares * _indexNumerator) / 1e18;
    }
}

/// @dev A 4626 whose views revert — adapters must surface the revert, not swallow it.
contract Reverting4626 {
    function asset() external pure returns (address) {
        revert("broken");
    }

    function convertToAssets(uint256) external pure returns (uint256) {
        revert("broken");
    }
}

contract AdaptersTest is Test {
    ERC20StaticAdapter internal staticAdapter;
    ERC4626Adapter internal erc4626Adapter;
    address internal constant TOKEN = address(0x7011);
    address internal constant UNDERLYING = address(0xA55E7);

    function setUp() public {
        staticAdapter = new ERC20StaticAdapter();
        erc4626Adapter = new ERC4626Adapter();
    }

    function test_staticAdapter_indexIsConstant1e18(address anyToken) public view {
        assertEq(staticAdapter.indexNow(anyToken), 1e18);
    }

    function test_staticAdapter_payoutDenominationIsTokenItself(address anyToken) public view {
        assertEq(staticAdapter.payoutDenomination(anyToken), anyToken);
    }

    function test_erc4626Adapter_readsConvertToAssetsAt1e18Scale() public {
        Mock4626 vaultToken = new Mock4626(UNDERLYING, 1.5e18);
        assertEq(erc4626Adapter.indexNow(address(vaultToken)), 1.5e18);

        vaultToken.setIndex(2e18);
        assertEq(erc4626Adapter.indexNow(address(vaultToken)), 2e18, "index tracks the venue live");
    }

    function test_erc4626Adapter_payoutDenominationIsUnderlyingAsset() public {
        Mock4626 vaultToken = new Mock4626(UNDERLYING, 1e18);
        assertEq(erc4626Adapter.payoutDenomination(address(vaultToken)), UNDERLYING);
    }

    function test_erc4626Adapter_bubblesVenueReverts() public {
        Reverting4626 broken = new Reverting4626();
        vm.expectRevert(bytes("broken"));
        erc4626Adapter.indexNow(address(broken));
        vm.expectRevert(bytes("broken"));
        erc4626Adapter.payoutDenomination(address(broken));
    }
}
