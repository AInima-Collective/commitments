// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";

library CommitmentsVaultStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.vault.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0xd62ba88301cd6e23855b29b3b11f9c34a7180a29b65824433abb96cbef250e00;

    struct Layout {
        // Yield strategy (address(0) = idle mode) — packs with depositsPaused.
        address yieldStrategy;
        bool depositsPaused;
        // Vault-level metadata sidecar (uri, contentHash, updatedAt).
        // Mirrors OperatorRegistry.OperatorMetadata so off-chain indexers can render
        // vault descriptions, audit links, risk blurbs, etc. via the same triple.
        ICommitmentsVault.VaultMetadata vaultMetadata;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
