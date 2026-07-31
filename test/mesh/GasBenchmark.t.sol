// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";

/// @title GasBenchmark
/// @notice Verifies that clone + initialize cost is below 200k gas per node type (D-12).
///         Gas measured as the delta of gasleft() before and after the factory.deploy*() call.
contract GasBenchmark is Test {
    MeshFactory public factory;

    address public consumer = address(0x10);
    address public manager = address(0x11);
    address public providerAddr = address(0x12);
    address public governance = address(0x13);

    uint256 public constant GAS_LIMIT = 200_000;

    function setUp() public {
        FanInNode fanInImpl = new FanInNode();
        FanOutNode fanOutImpl = new FanOutNode();
        TokenWeighting twImpl = new TokenWeighting();

        factory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
    }

    // ============================================================
    // GAS BENCHMARKS
    // ============================================================

    /// @notice FanIn clone + initialize must cost less than 200k gas
    function test_cloneDeploymentUnder200k_FanIn() public {
        uint256 gasBefore = gasleft();
        factory.deployFanIn(consumer, manager);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("FanIn clone+init gas", gasUsed);
        assertLt(gasUsed, GAS_LIMIT, "FanIn clone+initialize exceeds 200k gas");
    }

    /// @notice FanOut clone + initialize must cost less than 200k gas
    function test_cloneDeploymentUnder200k_FanOut() public {
        uint256 gasBefore = gasleft();
        factory.deployFanOut(providerAddr, manager);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("FanOut clone+init gas", gasUsed);
        assertLt(gasUsed, GAS_LIMIT, "FanOut clone+initialize exceeds 200k gas");
    }

    /// @notice TokenWeighting clone + initialize must cost less than 200k gas
    function test_cloneDeploymentUnder200k_TokenWeighting() public {
        uint256 gasBefore = gasleft();
        factory.deployTokenWeighting(providerAddr, governance);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("TokenWeighting clone+init gas", gasUsed);
        assertLt(gasUsed, GAS_LIMIT, "TokenWeighting clone+initialize exceeds 200k gas");
    }

    /// @notice Deterministic FanIn clone + initialize must also be under 200k gas
    function test_cloneDeploymentUnder200k_FanIn_deterministic() public {
        bytes32 salt = keccak256("bench-salt-fan-in");

        uint256 gasBefore = gasleft();
        factory.deployFanInAt(salt, consumer, manager);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("FanIn deterministic clone+init gas", gasUsed);
        assertLt(gasUsed, GAS_LIMIT, "FanIn deterministic clone+initialize exceeds 200k gas");
    }
}
