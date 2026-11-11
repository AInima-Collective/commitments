// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {deployManager} from "../../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";

/// @title RegistryHandler
/// @notice Invariant-fuzz handler driving a real CommitmentManager + OperatorRegistry through
///         randomized register / delegate / release / forfeit / deregister sequences. It mirrors
///         the registry's expected accounting in a ghost ledger of "tracked" commitments so the
///         test contract can cross-check the on-chain `Operator` record against an independent
///         model — the same shape as `test/manager/conformance/PartitionInvariant.t.sol`.
///
///         Backs ERC-COMMITMENTS-SERVICES §5 invariants:
///           INV-S1 (operator stake accounting): per active operator,
///             `totalDelegatedStake == Σ credited snapshots` and
///             `activeDelegationCount == count` of its still-tracked commitments;
///             release/forfeit decrement by the same snapshot they credited.
///           INV-S2 (acceptance binding): every tracked commitment names the registry as
///             counterparty, the required arbiter and token, meets the penalty floor, and
///             binds zero distribution strategies.
contract RegistryHandler is Test {
    CommitmentManager public manager;
    OperatorRegistry public registry;
    MockERC20 public token;
    ERC20StaticAdapter public adapter;

    address public arbiter;
    uint16 public floor; // registry minMaxPenaltyBps
    uint256 public minStake;

    uint64 internal constant WINDOW = 1 days;
    uint256 internal constant SEED_BALANCE = 1_000_000e18;

    address[] public actors;

    /// @dev One row per commitment ever presented to the registry.
    struct Track {
        uint256 id;
        address operator; // the operator the stake is credited to
        uint256 credited; // amount credited at register/delegate time
        bool active; // still tracked by the registry (not released/forfeited/deregistered)
        bool isSelf; // self-stake (vs delegation)
    }

    Track[] public tracks;
    address[] public knownOperators;
    mapping(address => bool) public seenOperator;
    mapping(address => uint256) public selfTrackIndex; // operator => index into tracks (+1; 0 = none)

    constructor(
        CommitmentManager manager_,
        OperatorRegistry registry_,
        MockERC20 token_,
        ERC20StaticAdapter adapter_,
        address arbiter_,
        uint16 floor_,
        uint256 minStake_
    ) {
        manager = manager_;
        registry = registry_;
        token = token_;
        adapter = adapter_;
        arbiter = arbiter_;
        floor = floor_;
        minStake = minStake_;

        for (uint256 i = 0; i < 5; i++) {
            address actor = makeAddr(string.concat("regActor", vm.toString(i)));
            actors.push(actor);
            token.mint(actor, SEED_BALANCE);
            vm.startPrank(actor);
            token.approve(address(manager), type(uint256).max);
            manager.deposit(address(token), SEED_BALANCE);
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _baseParams(address counterparty, uint256 amount, uint16 penaltyBps)
        internal
        view
        returns (ICM.CommitmentParams memory p)
    {
        p.arbiter = arbiter;
        p.counterparty = counterparty;
        p.token = address(token);
        p.adapter = address(adapter);
        p.amount = amount;
        p.maxPenaltyBps = penaltyBps;
        p.challengeWindow = WINDOW;
        p.expiresAt = 0;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
    }

    // =========================================================================
    // Ops
    // =========================================================================

    function register(uint256 actorSeed, uint256 amountSeed, uint16 penaltySeed) external {
        // Advance a block per op so the same-block register⇄deregister flip guard (issue #44)
        // never masks a legitimate lifecycle transition during the randomized campaign.
        vm.roll(block.number + 1);
        address op = _actor(actorSeed);
        if (registry.isOperator(op)) return;

        uint256 free = manager.freeBalance(address(token), op);
        if (free < minStake) return;
        uint256 amount = bound(amountSeed, minStake, free);
        uint16 penalty = uint16(bound(penaltySeed, floor, 10_000));

        vm.prank(op);
        uint256 id = manager.createCommitment(_baseParams(address(registry), amount, penalty));
        vm.prank(op);
        registry.register(id);

        tracks.push(Track({id: id, operator: op, credited: amount, active: true, isSelf: true}));
        selfTrackIndex[op] = tracks.length; // +1 offset
        if (!seenOperator[op]) {
            seenOperator[op] = true;
            knownOperators.push(op);
        }
    }

    function delegate(uint256 stakerSeed, uint256 opSeed, uint256 amountSeed, uint16 penaltySeed) external {
        (bool ok, address op) = _pickActiveOperator(opSeed);
        if (!ok) return;
        address staker = _actor(stakerSeed);

        uint256 free = manager.freeBalance(address(token), staker);
        if (free == 0) return;
        uint256 amount = bound(amountSeed, 1, free);
        uint16 penalty = uint16(bound(penaltySeed, floor, 10_000));

        vm.prank(staker);
        uint256 id = manager.createCommitment(_baseParams(address(registry), amount, penalty));
        vm.prank(staker);
        registry.delegate(op, id);

        tracks.push(Track({id: id, operator: op, credited: amount, active: true, isSelf: false}));
    }

    function release(uint256 trackSeed) external {
        (bool ok, uint256 idx) = _pickActiveTrack(trackSeed);
        if (!ok) return;
        Track storage tr = tracks[idx];

        vm.prank(arbiter);
        manager.releaseCommitment(tr.id);
        tr.active = false;
        if (tr.isSelf) selfTrackIndex[tr.operator] = 0;
    }

    function forfeit(uint256 trackSeed, uint16 penaltySeed) external {
        (bool ok, uint256 idx) = _pickActiveTrack(trackSeed);
        if (!ok) return;
        Track storage tr = tracks[idx];

        ICM.Commitment memory c = manager.getCommitment(tr.id);
        uint16 penalty = uint16(bound(penaltySeed, 0, c.maxPenaltyBps));
        vm.prank(arbiter);
        manager.initiateForfeit(tr.id, penalty);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(tr.id);

        tr.active = false;
        if (tr.isSelf) selfTrackIndex[tr.operator] = 0;
    }

    function deregister(uint256 opSeed) external {
        // Advance a block per op so the same-block flip guard (issue #44) never masks a
        // legitimate deregister during the randomized campaign.
        vm.roll(block.number + 1);
        (bool ok, address op) = _pickActiveOperator(opSeed);
        if (!ok) return;
        // Intended lifecycle: the self-stake is the operator's anchor and is the *last*
        // tracked commitment standing when deregistering. We require that the self-stake is
        // still tracked AND is the operator's sole active commitment. This deliberately
        // avoids the out-of-order path where the arbiter released the self-stake while a
        // delegation remained: deregister clears only the self-stake routing (§2.2), so a
        // leftover delegation would stay routed to the operator and a subsequent
        // re-register would overwrite the Operator record, orphaning it. See the divergence
        // note filed on issue #22.
        uint256 si = selfTrackIndex[op];
        if (si == 0) return;
        if (_activeTrackCount(op) != 1) return;
        if (registry.getOperator(op).activeDelegationCount != 1) return;

        vm.prank(op);
        registry.deregister();

        // The self-stake commitment stays live on-chain but is no longer tracked.
        tracks[si - 1].active = false;
        selfTrackIndex[op] = 0;
    }

    function _activeTrackCount(address op) internal view returns (uint256 count) {
        uint256 n = tracks.length;
        for (uint256 i = 0; i < n; i++) {
            if (tracks[i].active && tracks[i].operator == op) count++;
        }
    }

    // =========================================================================
    // Pickers
    // =========================================================================

    function _pickActiveOperator(uint256 seed) internal view returns (bool, address) {
        uint256 n = knownOperators.length;
        if (n == 0) return (false, address(0));
        for (uint256 i = 0; i < n; i++) {
            address op = knownOperators[(seed + i) % n];
            if (registry.isOperator(op)) return (true, op);
        }
        return (false, address(0));
    }

    function _pickActiveTrack(uint256 seed) internal view returns (bool, uint256) {
        uint256 n = tracks.length;
        if (n == 0) return (false, 0);
        for (uint256 i = 0; i < n; i++) {
            uint256 idx = (seed + i) % n;
            if (tracks[idx].active) return (true, idx);
        }
        return (false, 0);
    }

    // =========================================================================
    // Introspection
    // =========================================================================

    function trackCount() external view returns (uint256) {
        return tracks.length;
    }

    function operatorCount() external view returns (uint256) {
        return knownOperators.length;
    }

    function getTrack(uint256 i) external view returns (Track memory) {
        return tracks[i];
    }

    function getKnownOperator(uint256 i) external view returns (address) {
        return knownOperators[i];
    }
}

/// @title OperatorRegistryInvariantTest
/// @notice Fuzz-grade conformance harness for ERC-COMMITMENTS-SERVICES §5 INV-S1 / INV-S2,
///         asserted across randomized register / delegate / release / forfeit / deregister
///         sequences against the real direct-custody CommitmentManager.
contract OperatorRegistryInvariantTest is Test {
    CommitmentManager internal manager;
    OperatorRegistry internal registry;
    MockERC20 internal token;
    ERC20StaticAdapter internal adapter;
    RegistryHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal arbiter = makeAddr("serviceArbiter");

    uint16 internal constant FLOOR = 2_000; // minMaxPenaltyBps
    uint256 internal constant MIN_STAKE = 100e18;
    uint256 internal constant MAX_DELEGATIONS = 1024;

    function setUp() public {
        manager = deployManager(admin, 7 days, 14 days);

        token = new MockERC20("Backing", "BCK", 18);
        adapter = new ERC20StaticAdapter();

        OperatorRegistry rImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(rImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), MIN_STAKE, MAX_DELEGATIONS, admin, arbiter, FLOOR, address(token))
                    )
                )
            )
        );

        // Wire the registry so onDelegationReleased / onDelegationForfeited fire.
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        handler = new RegistryHandler(manager, registry, token, adapter, arbiter, FLOOR, MIN_STAKE);
        targetContract(address(handler));
    }

    /// @dev INV-S1: per active operator, the registry's running aggregates equal an
    ///      independent sum over the still-tracked commitments credited to that operator.
    ///      Equality after every release/forfeit proves the hooks decrement by exactly
    ///      the credited snapshot.
    function invariant_S1_operatorStakeAccounting() public view {
        uint256 nOps = handler.operatorCount();
        uint256 nTracks = handler.trackCount();
        for (uint256 o = 0; o < nOps; o++) {
            address op = handler.getKnownOperator(o);
            if (!registry.isOperator(op)) continue;

            uint256 sum;
            uint256 count;
            for (uint256 i = 0; i < nTracks; i++) {
                RegistryHandler.Track memory tr = handler.getTrack(i);
                if (tr.active && tr.operator == op) {
                    sum += tr.credited;
                    count += 1;
                }
            }

            IOperatorRegistry.Operator memory rec = registry.getOperator(op);
            assertEq(rec.totalDelegatedStake, sum, "INV-S1: totalDelegatedStake == Sigma credited");
            assertEq(rec.activeDelegationCount, count, "INV-S1: activeDelegationCount == tracked count");
        }
    }

    /// @dev INV-S2: every commitment the registry still tracks satisfies the four-gate
    ///      acceptance policy, the credited snapshot has not drifted from the live amount,
    ///      and the commitment binds no distribution strategies.
    function invariant_S2_acceptanceBinding() public view {
        uint256 nTracks = handler.trackCount();
        (address reqArbiter, uint16 minPenalty, address reqToken) = registry.getAcceptancePolicy();
        for (uint256 i = 0; i < nTracks; i++) {
            RegistryHandler.Track memory tr = handler.getTrack(i);
            if (!tr.active) continue;

            ICM.Commitment memory c = manager.getCommitment(tr.id);
            assertEq(c.counterparty, address(registry), "INV-S2: counterparty == registry");
            assertEq(c.arbiter, reqArbiter, "INV-S2: arbiter == requiredArbiter");
            assertEq(c.token, reqToken, "INV-S2: token == requiredToken");
            assertGe(c.maxPenaltyBps, minPenalty, "INV-S2: maxPenaltyBps >= floor");
            assertEq(manager.strategiesOf(tr.id).length, 0, "INV-S2: no bound strategies");
            assertEq(tr.credited, c.amount, "INV-S2: credited snapshot == live amount (no drift)");
            assertFalse(c.released, "INV-S2: tracked commitment not released");
            assertFalse(c.forfeited, "INV-S2: tracked commitment not forfeited");
        }
    }
}
