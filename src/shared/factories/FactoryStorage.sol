// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title FactoryStorage
/// @notice EIP-7201 namespaced storage for the shared `Factory` base.
/// @dev Namespaced so the base can be mixed into any factory (plain or proxied) without
///      colliding with the deriving contract's own sequential storage.
library FactoryStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.common.factory.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x9c5f997961ba594fafda5f777162bd350a932cae08a93720ff21c267243bb400;

    struct Layout {
        /// @dev implementation address -> whitelisted for deployment.
        mapping(address => bool) whitelisted;
        /// @dev implementation address -> blacklisted (the kill-valve; overrides whitelist).
        mapping(address => bool) blacklisted;
        /// @dev implementation address -> the self-verified type id recorded at whitelist time.
        mapping(address => bytes32) implTypeId;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
