// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";

/// @title IArbiter
/// @notice Capability interface for contracts named as the `arbiter` field on a
///         Commitment. `CommitmentManager` still authenticates the arbiter by
///         `msg.sender` equality — naming a contract as arbiter is the trust
///         act, and no on-chain interface check gates dispatch. This interface
///         exists so a counterparty, service, or indexer can *introspect* an
///         arbiter before opting into it:
///
///           - `commitmentManager()` — the manager this arbiter is wired to, so
///             a integrator can confirm it targets the expected instance.
///           - `arbiterCapabilities()` — a bitmap (see {ArbiterCapabilities}) of
///             the manager actions this arbiter can dispatch. A counterparty can
///             refuse an arbiter that lacks `SETTLE_AGREEMENT`, or a mutual can
///             require `MUTUAL_LOSS`, without reading the arbiter's source.
///           - `arbiterMetadataURI()` — an off-chain pointer (jurisdiction,
///             policy, dispute process, contact) for the human trust decision.
///
///         Support is advertised through ERC-165 so callers can probe with
///         `try arbiter.supportsInterface(type(IArbiter).interfaceId)` and fall
///         back gracefully for legacy marker-only arbiters.
/// @dev The `interfaceId` is `commitmentManager ^ arbiterCapabilities ^
///      arbiterMetadataURI` (the IArbiter-specific selectors, excluding the
///      inherited ERC-165 selector, per the ERC-165 composition convention).
interface IArbiter is IERC165 {
    /// @notice Returns the CommitmentManager this arbiter dispatches to.
    /// @dev Implementations should make this immutable to preserve the trust
    ///      model commitments opt into when naming this contract as arbiter.
    function commitmentManager() external view returns (address);

    /// @notice Bitmap of manager actions this arbiter is able to dispatch.
    /// @dev Bits are defined in {ArbiterCapabilities}. An arbiter MUST only set
    ///      a bit it can actually execute — the value is a self-declaration the
    ///      capability is *reachable*, not a guarantee any particular call will
    ///      succeed (auth/state preconditions still apply at dispatch time).
    function arbiterCapabilities() external view returns (uint256);

    /// @notice Optional off-chain metadata pointer (URI) describing the
    ///         arbiter's policy, jurisdiction, or dispute process.
    /// @dev Empty string if the arbiter publishes no metadata. Not consumed
    ///      on-chain; surfaced for the human/service trust decision.
    function arbiterMetadataURI() external view returns (string memory);
}
