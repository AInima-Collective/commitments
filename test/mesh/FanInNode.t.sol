// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {
    IFlowQuery,
    ProviderInfo,
    ConsumerInfo,
    AvailableDenom,
    StakeInfo
} from "src/extensions/mesh/interfaces/IFlowQuery.sol";
import {MockConsumer} from "../helpers/MockConsumer.sol";

contract FanInNodeTest is Test {
    FanInNode public fanIn;
    MockConsumer public consumer;

    address public manager = address(0x1);
    address public provider1 = address(0x2);
    address public provider2 = address(0x3);
    address public unauthorized = address(0x9);

    bytes32 public constant DENOM_IN_1 = keccak256("ETH");
    bytes32 public constant DENOM_IN_2 = keccak256("USDC");
    bytes32 public constant DENOM_OUT_1 = keccak256("fan_eth");
    bytes32 public constant DENOM_OUT_2 = keccak256("fan_usdc");

    uint16 public constant MAX_PENALTY = 1000; // 10%
    uint64 public constant UNBONDING_PERIOD = 7 days;

    function setUp() public {
        // Phase 21.4: the impl is locked via _initialized in its constructor; clone it.
        address impl = address(new FanInNode());
        fanIn = FanInNode(Clones.clone(impl));
        consumer = new MockConsumer();

        // Initialize fan-in with consumer and manager
        fanIn.initialize(address(consumer), manager);
    }

    // ============================================================
    // INITIALIZE TESTS
    // ============================================================

    function test_initialize_setsConsumerAndManager() public view {
        assertEq(fanIn.consumer(), address(consumer));
        assertEq(fanIn.manager(), manager);
    }

    function test_initialize_onlyOnce() public {
        vm.expectRevert();
        fanIn.initialize(address(0x99), address(0x88));
    }

    // ============================================================
    // REGISTER PROVIDER TESTS
    // ============================================================

    function test_registerProvider() public {
        vm.prank(manager);
        vm.expectEmit(true, true, true, true);
        emit FanInNode.ProviderRegistered(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Verify denom mapping was stored
        assertEq(fanIn.inputDenoms(provider1, DENOM_IN_1), DENOM_OUT_1);

        // Verify output source stored
        (address storedProvider, bytes32 storedDenomIn) = fanIn.outputSources(DENOM_OUT_1);
        assertEq(storedProvider, provider1);
        assertEq(storedDenomIn, DENOM_IN_1);
    }

    function test_registerProvider_denomCollision() public {
        // Register provider1 with DENOM_OUT_1
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Attempt to register provider2 with the same DENOM_OUT_1 — should revert
        vm.prank(manager);
        vm.expectRevert(FanInNode.DenomOutCollision.selector);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
    }

    function test_registerProvider_duplicateInput() public {
        // Register (provider1, DENOM_IN_1) once
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Attempt to register same (provider1, DENOM_IN_1) again — should revert
        vm.prank(manager);
        vm.expectRevert(FanInNode.InputAlreadyRegistered.selector);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);
    }

    function test_registerProvider_onlyManager() public {
        vm.prank(unauthorized);
        vm.expectRevert(FanInNode.OnlyManager.selector);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
    }

    // ============================================================
    // STAKE TESTS
    // ============================================================

    function test_stake() public {
        // Register provider
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Manager credits the provider's stake (verified-backing binding).
        vm.prank(manager);
        vm.expectEmit(true, true, false, true);
        emit FanInNode.Staked(provider1, DENOM_IN_1, DENOM_OUT_1, 1000e18);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);

        // Verify total stake updated
        assertEq(fanIn.totalStake(DENOM_OUT_1), 1000e18);
    }

    function test_stake_accumulates() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 500e18);

        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 300e18);

        assertEq(fanIn.totalStake(DENOM_OUT_1), 800e18);
    }

    function test_stake_onlyManager() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Non-manager (even the provider itself) cannot credit stake — only the
        // verifying manager may, which is the verified-backing binding.
        vm.prank(provider1);
        vm.expectRevert(FanInNode.OnlyManager.selector);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);
    }

    function test_stake_unregisteredProvider() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // Manager crediting an unregistered provider reverts.
        vm.prank(manager);
        vm.expectRevert(FanInNode.UnregisteredProvider.selector);
        fanIn.stake(unauthorized, DENOM_IN_1, 1000e18);
    }

    function test_stake_unregisteredDenom() public {
        // Register provider1 with DENOM_IN_1, but try to stake with DENOM_IN_2
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        vm.prank(manager);
        vm.expectRevert(FanInNode.UnregisteredProvider.selector);
        fanIn.stake(provider1, DENOM_IN_2, 1000e18);
    }

    function test_stake_multipleProviders() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);

        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);
        vm.prank(manager);
        fanIn.stake(provider2, DENOM_IN_2, 500e18);

        assertEq(fanIn.totalStake(DENOM_OUT_1), 1000e18);
        assertEq(fanIn.totalStake(DENOM_OUT_2), 500e18);
    }

    // ============================================================
    // RELEASE STAKE TESTS
    // ============================================================

    function test_releaseStake() public {
        // Setup: register provider and stake
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);

        // Consumer releases stake — provider is derived internally (Phase 20.7)
        consumer.releaseStake(address(fanIn), DENOM_OUT_1, 400e18);

        assertEq(fanIn.totalStake(DENOM_OUT_1), 600e18);
        assertEq(consumer.releaseCallCount(), 1);
    }

    function test_releaseStake_onlyConsumer() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);

        vm.prank(unauthorized);
        vm.expectRevert(FanInNode.OnlyConsumer.selector);
        fanIn.releaseStake(DENOM_OUT_1, 400e18);
    }

    function test_releaseStake_insufficientStake() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 100e18);

        vm.expectRevert(FanInNode.InsufficientStake.selector);
        consumer.releaseStake(address(fanIn), DENOM_OUT_1, 200e18);
    }

    function test_releaseStake_emitsRegisteredProvider() public {
        // Phase 20.7 (Pashov F10): the consumer cannot poison the StakeReleased event by
        // supplying an arbitrary provider — the address is derived from outputSources.
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);

        vm.expectEmit(true, false, false, true);
        emit FanInNode.StakeReleased(provider1, DENOM_OUT_1, 400e18);
        consumer.releaseStake(address(fanIn), DENOM_OUT_1, 400e18);
    }

    // ============================================================
    // IFLOWQUERY VIEW TESTS
    // ============================================================

    function test_flowQuery_nodeType() public view {
        // Phase 21.2: nodeType() returns bytes32; nodeTypeName() returns the string.
        string memory nType = fanIn.nodeTypeName();
        assertEq(nType, "fan_in");
    }

    function test_flowQuery_providers_empty() public view {
        ProviderInfo[] memory provs = fanIn.providers();
        assertEq(provs.length, 0);
    }

    function test_flowQuery_providers() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);

        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);
        vm.prank(manager);
        fanIn.stake(provider2, DENOM_IN_2, 500e18);

        ProviderInfo[] memory provs = fanIn.providers();
        assertEq(provs.length, 2);

        // Provider1 is index 0
        assertEq(provs[0].provider, provider1);
        assertEq(provs[0].stakes.length, 1);
        assertEq(provs[0].stakes[0].denom, DENOM_IN_1);
        assertEq(provs[0].stakes[0].amount, 1000e18);
        assertEq(provs[0].stakes[0].maxPenaltyBps, MAX_PENALTY);
        assertEq(provs[0].stakes[0].unbondingPeriod, UNBONDING_PERIOD);
    }

    function test_flowQuery_consumers() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.stake(provider1, DENOM_IN_1, 1000e18);

        ConsumerInfo[] memory cons = fanIn.consumers();
        assertEq(cons.length, 1);
        assertEq(cons[0].consumer, address(consumer));
        assertEq(cons[0].stakes.length, 1);
        assertEq(cons[0].stakes[0].denom, DENOM_OUT_1);
        assertEq(cons[0].stakes[0].amount, 1000e18);
    }

    function test_flowQuery_availableDenoms() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        vm.prank(manager);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);

        AvailableDenom[] memory denoms = fanIn.availableDenoms();
        assertEq(denoms.length, 2);

        // Check both denoms are present (order matches provider registration)
        assertEq(denoms[0].local, DENOM_OUT_1);
        assertEq(denoms[0].sourceProvider, provider1);
        assertEq(denoms[0].sourceDenom, DENOM_IN_1);

        assertEq(denoms[1].local, DENOM_OUT_2);
        assertEq(denoms[1].sourceProvider, provider2);
        assertEq(denoms[1].sourceDenom, DENOM_IN_2);
    }

    // ============================================================
    // DENOM COLLISION TESTS (critical for mesh safety)
    // ============================================================

    function test_denomCollision_twoProvidersSameDenomOut() public {
        vm.prank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);

        // provider2 tries to register with the same output denom
        vm.prank(manager);
        vm.expectRevert(FanInNode.DenomOutCollision.selector);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
    }

    // Phase 20.2 (Pashov F1): FanInNode no longer accepts rewards. The
    // distributeRewards entry was removed because FanIn lacks per-provider
    // accounting and a claim path; tokens sent in were permanently locked.
    // Reward distribution belongs on FanOutNode / TokenWeighting.

    // ============================================================
    // PAGINATION (Phase 21.2)
    // ============================================================

    function test_providersPaged_slicesArray() public {
        vm.startPrank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);
        vm.stopPrank();

        ProviderInfo[] memory page = fanIn.providersPaged(0, 1);
        assertEq(page.length, 1);
        assertEq(page[0].provider, provider1);

        page = fanIn.providersPaged(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0].provider, provider2);

        // Past-end returns empty.
        page = fanIn.providersPaged(2, 5);
        assertEq(page.length, 0);

        // Limit larger than remaining clamps.
        page = fanIn.providersPaged(0, 100);
        assertEq(page.length, 2);
    }

    function test_availableDenomsPaged_slicesArray() public {
        vm.startPrank(manager);
        fanIn.registerProvider(provider1, DENOM_IN_1, DENOM_OUT_1, MAX_PENALTY, UNBONDING_PERIOD);
        fanIn.registerProvider(provider2, DENOM_IN_2, DENOM_OUT_2, MAX_PENALTY, UNBONDING_PERIOD);
        vm.stopPrank();

        AvailableDenom[] memory page = fanIn.availableDenomsPaged(0, 1);
        assertEq(page.length, 1);
        assertEq(page[0].local, DENOM_OUT_1);

        page = fanIn.availableDenomsPaged(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0].local, DENOM_OUT_2);
    }
}
