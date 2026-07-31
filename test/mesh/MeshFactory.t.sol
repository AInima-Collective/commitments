// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {IMeshFactory} from "src/extensions/mesh/interfaces/IMeshFactory.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {IFlowQuery} from "src/extensions/mesh/interfaces/IFlowQuery.sol";

contract MeshFactoryTest is Test {
    MeshFactory public factory;

    FanInNode public fanInImpl;
    FanOutNode public fanOutImpl;
    TokenWeighting public twImpl;

    address public consumer = address(0x10);
    address public manager = address(0x11);
    address public providerAddr = address(0x12);
    address public governance = address(0x13);

    function setUp() public {
        // Deploy implementation contracts
        fanInImpl = new FanInNode();
        fanOutImpl = new FanOutNode();
        twImpl = new TokenWeighting();

        // Deploy factory with implementations
        factory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
    }

    // ============================================================
    // FACTORY INVARIANTS
    // ============================================================

    function test_factory_storesImplementations() public view {
        assertEq(factory.fanInImpl(), address(fanInImpl));
        assertEq(factory.fanOutImpl(), address(fanOutImpl));
        assertEq(factory.tokenWeightingImpl(), address(twImpl));
    }

    // ============================================================
    // DEPLOY FAN IN
    // ============================================================

    function test_deployFanIn() public {
        address clone = factory.deployFanIn(consumer, manager);

        // Clone is a valid address
        assertNotEq(clone, address(0));

        // Clone responds to IFlowQuery.nodeType() correctly
        assertEq(IFlowQuery(clone).nodeTypeName(), "fan_in");

        // Clone is initialized (consumer and manager set)
        FanInNode fanIn = FanInNode(clone);
        assertEq(fanIn.consumer(), consumer);
        assertEq(fanIn.manager(), manager);
    }

    function test_deployFanIn_cloneIsNotImplementation() public {
        address clone = factory.deployFanIn(consumer, manager);
        assertNotEq(clone, address(fanInImpl));
    }

    function test_deployFanIn_secondInitializeReverts() public {
        address clone = factory.deployFanIn(consumer, manager);
        vm.expectRevert();
        FanInNode(clone).initialize(address(0x99), address(0x88));
    }

    /// Phase 21.4: the implementation contract itself MUST reject `initialize`.
    /// Only fresh clones (from the factory) can be initialised.
    function test_implementation_initializeReverts_phase21_4() public {
        vm.expectRevert(FanInNode.AlreadyInitialized.selector);
        FanInNode(address(fanInImpl)).initialize(address(0x99), address(0x88));

        vm.expectRevert(FanOutNode.AlreadyInitialized.selector);
        FanOutNode(address(fanOutImpl)).initialize(address(0x99), address(0x88));

        vm.expectRevert(); // TokenWeighting uses ITokenWeighting.AlreadyInitialized
        TokenWeighting(address(twImpl)).initialize(address(0x99), address(0x88));
    }

    function test_deployFanIn_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IMeshFactory.NodeDeployed(address(fanInImpl), address(0), "fan_in");
        factory.deployFanIn(consumer, manager);
    }

    // ============================================================
    // DEPLOY FAN OUT
    // ============================================================

    function test_deployFanOut() public {
        address clone = factory.deployFanOut(providerAddr, manager);

        assertNotEq(clone, address(0));
        assertEq(IFlowQuery(clone).nodeTypeName(), "fan_out");

        FanOutNode fanOut = FanOutNode(clone);
        assertEq(fanOut.provider(), providerAddr);
        assertEq(fanOut.manager(), manager);
    }

    function test_deployFanOut_cloneIsNotImplementation() public {
        address clone = factory.deployFanOut(providerAddr, manager);
        assertNotEq(clone, address(fanOutImpl));
    }

    function test_deployFanOut_secondInitializeReverts() public {
        address clone = factory.deployFanOut(providerAddr, manager);
        vm.expectRevert();
        FanOutNode(clone).initialize(address(0x99), address(0x88));
    }

    // ============================================================
    // DEPLOY TOKEN WEIGHTING
    // ============================================================

    function test_deployTokenWeighting() public {
        address clone = factory.deployTokenWeighting(providerAddr, governance);

        assertNotEq(clone, address(0));
        assertEq(IFlowQuery(clone).nodeTypeName(), "token_weighting");

        TokenWeighting tw = TokenWeighting(clone);
        assertEq(tw.provider(), providerAddr);
        assertEq(tw.governance(), governance);
    }

    function test_deployTokenWeighting_cloneIsNotImplementation() public {
        address clone = factory.deployTokenWeighting(providerAddr, governance);
        assertNotEq(clone, address(twImpl));
    }

    function test_deployTokenWeighting_secondInitializeReverts() public {
        address clone = factory.deployTokenWeighting(providerAddr, governance);
        vm.expectRevert();
        TokenWeighting(clone).initialize(address(0x99), address(0x88));
    }

    // ============================================================
    // DETERMINISTIC DEPLOY
    // ============================================================

    function test_deployDeterministic_fanIn() public {
        bytes32 salt = keccak256("test-fan-in-salt");

        // Predict address
        address predicted = factory.predictFanInAddress(salt);

        // Deploy
        address clone = factory.deployFanInAt(salt, consumer, manager);

        assertEq(clone, predicted, "clone address should match predicted");
        assertEq(IFlowQuery(clone).nodeTypeName(), "fan_in");
    }

    function test_deployDeterministic_fanOut() public {
        bytes32 salt = keccak256("test-fan-out-salt");

        address predicted = factory.predictFanOutAddress(salt);
        address clone = factory.deployFanOutAt(salt, providerAddr, manager);

        assertEq(clone, predicted, "clone address should match predicted");
        assertEq(IFlowQuery(clone).nodeTypeName(), "fan_out");
    }

    function test_deployDeterministic_tokenWeighting() public {
        bytes32 salt = keccak256("test-tw-salt");

        address predicted = factory.predictTokenWeightingAddress(salt);
        address clone = factory.deployTokenWeightingAt(salt, providerAddr, governance);

        assertEq(clone, predicted, "clone address should match predicted");
        assertEq(IFlowQuery(clone).nodeTypeName(), "token_weighting");
    }

    function test_deployDeterministic_sameAddressForSameSalt() public view {
        bytes32 salt = keccak256("idempotent-test");

        address predicted1 = factory.predictFanInAddress(salt);
        address predicted2 = factory.predictFanInAddress(salt);

        assertEq(predicted1, predicted2, "same salt should predict same address");
    }

    // ============================================================
    // MULTIPLE CLONES
    // ============================================================

    function test_multipleClones_haveDistinctAddresses() public {
        address clone1 = factory.deployFanIn(consumer, manager);
        address clone2 = factory.deployFanIn(address(0x20), address(0x21));

        assertNotEq(clone1, clone2, "two clones should have distinct addresses");

        // Both correctly initialized
        assertEq(FanInNode(clone1).consumer(), consumer);
        assertEq(FanInNode(clone2).consumer(), address(0x20));
    }
}
