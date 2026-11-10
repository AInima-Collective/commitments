// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

/// @title OperatorServiceRegistryStorage
/// @notice namespaced storage layout for OperatorServiceRegistry.
/// @dev The registry is a thin service-middleware glue layer: service-operator
///      enrollment, signing keys, quorum/threshold configuration, and signature
///      validation. It custodies no stake — per-operator voting power is delegated
///      to an external IVotingPowerSource (typically a TokenWeighting mesh node
///      driven by OperatorRegistry), so none of the stake/denom/weight state lives
///      here.
library OperatorServiceRegistryStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("commitments.operator.service.registry.storage")) - 1))
    ///      & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_SLOT = 0x418dd2b5e11d9e35fce8a7d9738c52cb30b94ce19c88d11fc41605c0f36a0100;

    struct Layout {
        // =====================================================================
        // External references
        // =====================================================================

        /// @dev The Commitments OperatorRegistry (validates operator eligibility)
        address operatorRegistry;

        /// @dev External source of operator voting power (e.g., TokenWeighting mesh node)
        address votingPowerSource;

        // =====================================================================
        // Operator tracking
        // =====================================================================

        /// @dev operator -> registered in this middleware
        mapping(address => bool) operatorRegistered;

        // =====================================================================
        // Signing key management (checkpoint-tracked)
        // =====================================================================

        /// @dev operator -> signing key history (value = uint160(signingKeyAddress))
        mapping(address => Checkpoints.Trace160) operatorSigningKeyHistory;

        /// @dev signingKey -> operator history (value = uint160(operatorAddress))
        mapping(address => Checkpoints.Trace160) signingKeyOperatorHistory;

        // =====================================================================
        // Quorum threshold configuration (checkpoint-tracked)
        // =====================================================================

        /// @dev Minimum absolute weight required from signers
        Checkpoints.Trace160 thresholdWeightHistory;

        /// @dev Quorum fraction, packed `(numerator << 80) | denominator`; both fit in 80 bits
        Checkpoints.Trace160 quorumHistory;

        // =====================================================================
        // Service metadata
        // =====================================================================

        /// @dev Off-chain service URI
        string serviceURI;

        // =====================================================================
        // Reference-block freshness gate
        // =====================================================================

        /// @dev Maximum allowed age (in blocks) of `referenceBlock` passed to
        ///      `_checkSignatures`. Prevents an attacker from pinning to a stale
        ///      historical snapshot where the operator set or quorum threshold
        ///      was different. 0 means "never set": the read site applies
        ///      `DEFAULT_MAX_REFERENCE_BLOCK_AGE`. Admin can tighten or loosen
        ///      via `setMaxReferenceBlockAge`, which rejects 0.
        uint96 maxReferenceBlockAge;
    }

    /// @notice Returns a storage reference to the Layout struct at STORAGE_SLOT.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
