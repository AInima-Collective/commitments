// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IERC8004IdentityRegistry
/// @notice Consumer-facing surface of the ERC-8004 Identity Registry ("Trustless Agents"),
///         as deployed behind the canonical ERC-1967/UUPS proxy
///         `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` on 20+ chains (Optimism included;
///         implementation `getVersion() == "2.0.0"`). The registry is ERC-721 based:
///         `agentId` is the tokenId, the token owner is the agent's controlling account,
///         and the ERC-721 `tokenURI` IS the agent's registration URI (there is no separate
///         `agentURI` getter). Agent ids start at ZERO — never treat `agentId == 0` as
///         "not an agent"; resolve existence via `balanceOf`/`ownerOf` instead.
/// @dev Verbatim implementation source lives in `../IdentityRegistryUpgradeable.sol`
///      (see `src/vendor/erc8004/README.md` for provenance). This interface intentionally omits the
///      standard ERC-721 approval/transfer surface — cast to IERC721 when needed.
interface IERC8004IdentityRegistry {
    /// @notice One key/value pair of on-chain agent metadata (ERC-8004 §Identity).
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    /// @notice A new agent identity was minted. `agentURI` may be empty (the no-URI
    ///         `register()` overload); `owner` is the minting account.
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    /// @notice On-chain metadata write. `indexedMetadataKey`'s topic is
    ///         `keccak256(bytes(metadataKey))`; the readable key repeats in data.
    ///         The reserved key `"agentWallet"` is auto-set at register and auto-CLEARED
    ///         (empty value) on every ERC-721 transfer.
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );

    /// @notice The agent's registration URI changed via `setAgentURI`.
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    // ---- Registration (three overloads) ----

    function register() external returns (uint256 agentId);
    function register(string memory agentURI) external returns (uint256 agentId);
    function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId);

    // ---- URI (tokenURI == agentURI) ----

    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function tokenURI(uint256 tokenId) external view returns (string memory);

    // ---- On-chain metadata ----

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;

    // ---- Agent wallet (reserved metadata key "agentWallet") ----

    function getAgentWallet(uint256 agentId) external view returns (address);
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external;
    function unsetAgentWallet(uint256 agentId) external;

    // ---- Identity resolution ----

    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
    function getVersion() external pure returns (string memory);
}
