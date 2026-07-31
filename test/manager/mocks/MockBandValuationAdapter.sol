// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IBandValuationAdapter} from "src/extensions/mutuals/interfaces/IBandValuationAdapter.sol";

/// @title MockBandValuationAdapter
/// @notice Test double for the heterogeneous-mode band valuation adapter (ERC-COMMITMENTS-MUTUALS). Models a
///         manipulation-resistant per-unit price (a TWAP / ERC-4626 redemption-rate stand-in) that a
///         test sets explicitly — it is NOT a single-block spot oracle. `value(token, amount)` returns
///         `amount * priceWad[token] / 1e18`, so a unit price of `1e18` is par. Tests can lower the
///         price to drive a down-only `remark`.
contract MockBandValuationAdapter is IBandValuationAdapter {
    uint256 internal constant WAD = 1e18;

    /// @dev token => numeraire price per whole unit, 1e18-scaled. Unset (0) prices a token at zero.
    mapping(address => uint256) public priceWad;

    /// @notice Set the (manipulation-resistant) per-unit price for `token` (1e18 = par).
    function setPrice(address token, uint256 newPriceWad) external {
        priceWad[token] = newPriceWad;
    }

    /// @inheritdoc IBandValuationAdapter
    function value(address token, uint256 amount) external view returns (uint256) {
        return (amount * priceWad[token]) / WAD;
    }
}
