// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {
    IMeshFactory,
    FAN_IN_TYPE_ID,
    FAN_OUT_TYPE_ID,
    TOKEN_WEIGHTING_TYPE_ID
} from "src/extensions/mesh/interfaces/IMeshFactory.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {Factory} from "src/shared/factories/Factory.sol";
import {Multicallable} from "src/shared/utilities/Multicallable.sol";

/// @title MeshFactory
/// @notice Deploys FanIn, FanOut, and TokenWeighting mesh nodes as minimal clones.
///         Each deploy*() call atomically clones the implementation and calls initialize() in the same
///         transaction, preventing initializer front-running.
///         Gas cost per clone + initialize is below 200k.
/// @dev Shares the extracted `Factory` base: the three node implementations are
///      whitelisted at construction, each self-verified against its type id from `IMeshFactory.sol`, so the
///      factory can only ever clone vetted node types. The `deploy*` entry points remain
///      PERMISSIONLESS (the OperatorRegistry lazily clones per-operator FanIn nodes) — they
///      just gate on the whitelist/blacklist ladder, so the factory owner can `blacklist` a
///      node implementation to freeze new clones of it. `Multicallable` lets a caller batch
///      several node deploys (e.g. FanIn + TokenWeighting) into one transaction.
contract MeshFactory is IMeshFactory, Factory, Multicallable {
    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice FanIn implementation contract (immutable)
    address public immutable fanInImpl;

    /// @notice FanOut implementation contract (immutable)
    address public immutable fanOutImpl;

    /// @notice TokenWeighting implementation contract (immutable)
    address public immutable tokenWeightingImpl;

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /// @param _fanInImpl Address of the deployed FanInNode implementation
    /// @param _fanOutImpl Address of the deployed FanOutNode implementation
    /// @param _tokenWeightingImpl Address of the deployed TokenWeighting implementation
    /// @dev Whitelists each implementation via the `Factory` base, self-verifying it against
    ///      the node's type id (`FAN_IN_TYPE_ID`, ...). The deployer becomes the owner of the
    ///      implementation-set controls (whitelist additions / blacklist valve).
    constructor(address _fanInImpl, address _fanOutImpl, address _tokenWeightingImpl) Factory(msg.sender) {
        fanInImpl = _fanInImpl;
        fanOutImpl = _fanOutImpl;
        tokenWeightingImpl = _tokenWeightingImpl;

        _whitelistImplementation(_fanInImpl, FAN_IN_TYPE_ID);
        _whitelistImplementation(_fanOutImpl, FAN_OUT_TYPE_ID);
        _whitelistImplementation(_tokenWeightingImpl, TOKEN_WEIGHTING_TYPE_ID);
    }

    // ============================================================
    // DEPLOY (non-deterministic)
    // ============================================================

    /// @inheritdoc IMeshFactory
    function deployFanIn(address consumer, address manager) external returns (address clone) {
        clone = _cloneVetted(fanInImpl);
        FanInNode(clone).initialize(consumer, manager);
        emit NodeDeployed(fanInImpl, clone, "fan_in");
    }

    /// @inheritdoc IMeshFactory
    function deployFanOut(address provider, address manager) external returns (address clone) {
        clone = _cloneVetted(fanOutImpl);
        FanOutNode(clone).initialize(provider, manager);
        emit NodeDeployed(fanOutImpl, clone, "fan_out");
    }

    /// @inheritdoc IMeshFactory
    function deployTokenWeighting(address provider, address governance) external returns (address clone) {
        clone = _cloneVetted(tokenWeightingImpl);
        TokenWeighting(clone).initialize(provider, governance);
        emit NodeDeployed(tokenWeightingImpl, clone, "token_weighting");
    }

    // ============================================================
    // DEPLOY DETERMINISTIC (salt-based)
    // ============================================================

    /// @inheritdoc IMeshFactory
    /// @dev salt is scoped to `keccak256(msg.sender, salt)` so a front-runner
    ///      cannot claim a predicted address with attacker-controlled init parameters.
    function deployFanInAt(bytes32 salt, address consumer, address manager) external returns (address clone) {
        clone = _cloneVettedDeterministic(fanInImpl, _scopeSalt(salt));
        FanInNode(clone).initialize(consumer, manager);
        emit NodeDeployed(fanInImpl, clone, "fan_in");
    }

    /// @inheritdoc IMeshFactory
    function deployFanOutAt(bytes32 salt, address provider, address manager) external returns (address clone) {
        clone = _cloneVettedDeterministic(fanOutImpl, _scopeSalt(salt));
        FanOutNode(clone).initialize(provider, manager);
        emit NodeDeployed(fanOutImpl, clone, "fan_out");
    }

    /// @inheritdoc IMeshFactory
    function deployTokenWeightingAt(bytes32 salt, address provider, address governance)
        external
        returns (address clone)
    {
        clone = _cloneVettedDeterministic(tokenWeightingImpl, _scopeSalt(salt));
        TokenWeighting(clone).initialize(provider, governance);
        emit NodeDeployed(tokenWeightingImpl, clone, "token_weighting");
    }

    // ============================================================
    // ADDRESS PREDICTION
    // ============================================================

    /// @inheritdoc IMeshFactory
    /// @dev prediction MUST mirror the salt scoping used by the deploy*At
    ///      variants. The caller passes their own bytes32; this function scopes by
    ///      `msg.sender` so the prediction matches the address the SAME caller would
    ///      get on deploy.
    function predictFanInAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(fanInImpl, _scopeSalt(salt), address(this));
    }

    /// @inheritdoc IMeshFactory
    function predictFanOutAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(fanOutImpl, _scopeSalt(salt), address(this));
    }

    /// @inheritdoc IMeshFactory
    function predictTokenWeightingAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(tokenWeightingImpl, _scopeSalt(salt), address(this));
    }

    // ============================================================
    // INTERNAL
    // ============================================================

    /// @dev scope a caller-supplied salt by `msg.sender` so deterministic
    ///      addresses are isolated per-caller. Two callers using the same `salt` will
    ///      derive different addresses.
    function _scopeSalt(bytes32 salt) internal view returns (bytes32) {
        return keccak256(abi.encode(msg.sender, salt));
    }
}
