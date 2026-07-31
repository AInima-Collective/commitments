// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";

/// @title EnvelopeSig
/// @notice Test-side reconstruction of the EIP-712 digest that
///         `OperatorServiceRegistry.validate` verifies quorum signatures against.
///         Centralized so every envelope-signing test derives the digest one way —
///         if the on-chain domain (`name`/`version`) or the `Envelope` type ever
///         changes, this is the single place to update.
/// @dev Mirrors `OperatorServiceRegistry`: EIP-712 domain
///      `("CommitmentsServiceManager", "1", chainId, verifyingContract)` over the
///      `Envelope(bytes20 eventId,bytes12 ordering,bytes payload)` struct (dynamic
///      `payload` hashed per EIP-712).
library EnvelopeSig {
    bytes32 internal constant ENVELOPE_TYPEHASH = keccak256("Envelope(bytes20 eventId,bytes12 ordering,bytes payload)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function structHash(IServiceHandler.Envelope memory env) internal pure returns (bytes32) {
        return keccak256(abi.encode(ENVELOPE_TYPEHASH, env.eventId, env.ordering, keccak256(env.payload)));
    }

    function domainSeparator(uint256 chainId, address verifier) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("CommitmentsServiceManager"), keccak256("1"), chainId, verifier)
        );
    }

    /// @notice Canonical digest a quorum signs for `verifier` on the current chain.
    function digest(address verifier, IServiceHandler.Envelope memory env) internal view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(domainSeparator(block.chainid, verifier), structHash(env));
    }

    /// @notice Digest under an arbitrary domain — for cross-chain / cross-instance
    ///         replay negative tests (a signature minted for the wrong chainId or a
    ///         different verifyingContract must fail on the real instance).
    function digestFor(uint256 chainId, address verifier, IServiceHandler.Envelope memory env)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparator(chainId, verifier), structHash(env));
    }
}
