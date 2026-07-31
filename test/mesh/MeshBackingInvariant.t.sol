// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @title MeshBackingInvariantTest
/// @notice Plan STEP 4: proves the 1-capital-unit ↔ 1-denom backing invariant at the
///         OperatorRegistry ↔ mesh boundary. Across arbitrary register / delegate /
///         release / forfeit / deregister sequences against the REAL CommitmentManager:
///
///           INV-A  per operator: tw.currentStake(op, denom) == registry.getOperatorStake(op)
///           INV-B  Σ tw.currentStake(op, denom) == tw.totalStake(denom)
///           INV-C  tw.totalStake(denom) ≤ Σ encumberedBalance(token, staker)
///                  (mesh voting power for the token can never exceed real, registry-
///                   verified encumbrance — the binding STEP 3 enforces in FanIn.stake)
///
///         and that the registry credits EXACTLY ONE denom (derived injectively from the
///         backing token), so a unit of encumbered capital contributes to exactly one
///         denom's power.
contract MeshBackingInvariantTest is ManagerTestBase {
    OperatorRegistry internal registry;
    MeshFactory internal meshFactory;
    TokenWeighting internal tw;

    address internal arbiter = makeAddr("arbiter");
    bytes32 internal denom;

    address[] internal opActors;
    address[] internal stakerActors;

    struct Active {
        uint256 id;
        address operator;
    }

    Active[] internal active;

    uint16 internal constant PENALTY = 10_000;
    uint256 internal constant FUND = 1_000_000e18;

    function setUp() public override {
        super.setUp();

        // Registry: requiredArbiter = arbiter (EOA), no penalty floor, requiredToken = token.
        OperatorRegistry impl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), 1, 1024, admin, arbiter, uint16(0), address(token))
                    )
                )
            )
        );
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        // Mesh: TokenWeighting provider = registry; registry is the FanIn manager.
        FanInNode fanInImpl = new FanInNode();
        FanOutNode fanOutImpl = new FanOutNode();
        TokenWeighting twImpl = new TokenWeighting();
        meshFactory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
        tw = TokenWeighting(meshFactory.deployTokenWeighting(address(registry), admin));

        // Governance sets a full-precision normalization weight (decimals + risk).
        vm.prank(admin);
        tw.updateWeight(bytes32(uint256(uint160(address(token)))), 1e16);

        vm.prank(admin);
        registry.setMeshWiring(address(tw), address(meshFactory));

        denom = registry.stakeDenom();
        assertEq(denom, bytes32(uint256(uint160(address(token)))), "denom must derive from requiredToken");

        for (uint256 i = 0; i < 3; i++) {
            address op = makeAddr(string.concat("op", vm.toString(i)));
            address st = makeAddr(string.concat("st", vm.toString(i)));
            opActors.push(op);
            stakerActors.push(st);
            _deposit(op, FUND);
            _deposit(st, FUND);
        }
    }

    // =========================================================================
    // Fuzz driver
    // =========================================================================

    /// forge-config: default.fuzz.runs = 512
    function testFuzz_meshNeverExceedsEncumbrance(uint256 seed) public {
        for (uint256 step = 0; step < 32; step++) {
            uint256 action = uint256(keccak256(abi.encode(seed, step, "a"))) % 5;
            uint256 r = uint256(keccak256(abi.encode(seed, step, "r")));

            if (action == 0) {
                _tryRegister(r);
            } else if (action == 1) {
                _tryDelegate(r);
            } else if (action == 2) {
                _tryRelease(r);
            } else if (action == 3) {
                _tryForfeit(r);
            } else {
                _tryDeregister(r);
            }

            _assertInvariants();
        }
    }

    // =========================================================================
    // Actions (all best-effort; skip when preconditions unmet)
    // =========================================================================

    function _tryRegister(uint256 r) internal {
        // Advance a block per op so the same-block register⇄deregister flip guard (issue #44)
        // never masks a legitimate lifecycle transition during the randomized campaign.
        vm.roll(block.number + 1);
        address op = opActors[r % opActors.length];
        if (registry.isOperator(op)) return;
        uint256 amount = bound(r, 1e18, 50_000e18);
        if (manager.freeBalance(address(token), op) < amount) return;
        uint256 id = _createAs(op, _baseParams(arbiter, address(registry), amount, PENALTY));
        vm.prank(op);
        registry.register(id);
        active.push(Active({id: id, operator: op}));
    }

    function _tryDelegate(uint256 r) internal {
        address op = opActors[r % opActors.length];
        if (!registry.isOperator(op)) return;
        address st = stakerActors[(r >> 8) % stakerActors.length];
        uint256 amount = bound(r, 1e18, 50_000e18);
        if (manager.freeBalance(address(token), st) < amount) return;
        uint256 id = _createAs(st, _baseParams(arbiter, address(registry), amount, PENALTY));
        vm.prank(st);
        registry.delegate(op, id);
        active.push(Active({id: id, operator: op}));
    }

    function _tryRelease(uint256 r) internal {
        if (active.length == 0) return;
        uint256 idx = r % active.length;
        uint256 id = active[idx].id;
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        _removeActive(idx);
    }

    function _tryForfeit(uint256 r) internal {
        if (active.length == 0) return;
        uint256 idx = r % active.length;
        uint256 id = active[idx].id;
        vm.prank(arbiter);
        manager.initiateForfeit(id, PENALTY);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.executeForfeit(id);
        _removeActive(idx);
    }

    function _tryDeregister(uint256 r) internal {
        // Advance a block per op so the same-block flip guard (issue #44) never masks a
        // legitimate deregister during the randomized campaign.
        vm.roll(block.number + 1);
        address op = opActors[r % opActors.length];
        if (!registry.isOperator(op)) return;
        IOperatorRegistry.Operator memory o = registry.getOperator(op);
        // deregister only permitted once every tracked commitment except (at most) the
        // operator's own LIVE self-stake has closed — mirror the on-chain S9 gate exactly.
        // `activeDelegationCount == 1` alone is NOT deregisterable when the self-stake already
        // closed independently (the zombie-active state count==1 is a live third-party
        // delegation): the registry reverts ActiveDelegationsExist there by design. Skipping
        // that case keeps the fuzzer from attempting a call the S9 fix correctly rejects.
        if (o.activeDelegationCount != (o.selfStakeActive ? 1 : 0)) return;
        // remove the operator's self-stake commitment from our active set first.
        uint256 selfId = o.selfStakeCommitmentId;
        for (uint256 i = 0; i < active.length; i++) {
            if (active[i].id == selfId) {
                _removeActive(i);
                break;
            }
        }
        vm.prank(op);
        registry.deregister();
    }

    function _removeActive(uint256 idx) internal {
        active[idx] = active[active.length - 1];
        active.pop();
    }

    // =========================================================================
    // Invariants
    // =========================================================================

    function _assertInvariants() internal view {
        uint256 sumCurrent;
        for (uint256 i = 0; i < opActors.length; i++) {
            address op = opActors[i];
            // INV-A: mesh raw stake == registry-tracked stake for an ACTIVE operator,
            //        and exactly zero for an inactive (deregistered) one. `deregister`
            //        only flips `active` and zeroes the mesh power; it deliberately
            //        leaves `totalDelegatedStake` (getOperatorStake) untouched, so the
            //        lockstep is conditioned on the operator still being active.
            uint256 expected = registry.getOperator(op).active ? registry.getOperatorStake(op) : 0;
            assertEq(tw.currentStake(op, denom), expected, "INV-A: tw.currentStake != expected mesh power");
            sumCurrent += tw.currentStake(op, denom);
        }

        // INV-B: per-staker mesh stake aggregates to the denom total.
        assertEq(sumCurrent, tw.totalStake(denom), "INV-B: sum currentStake != totalStake(denom)");

        // INV-C: mesh stake for the token never exceeds real encumbrance for the token.
        uint256 totalEncumbered;
        for (uint256 i = 0; i < opActors.length; i++) {
            totalEncumbered += manager.encumberedBalance(address(token), opActors[i]);
            totalEncumbered += manager.encumberedBalance(address(token), stakerActors[i]);
        }
        assertLe(tw.totalStake(denom), totalEncumbered, "INV-C: mesh stake exceeds encumbrance");
    }

    // =========================================================================
    // 1-token ↔ 1-denom: no cross-path double-count across two token registries
    // =========================================================================

    function test_oneTokenOneDenom_noCrossCount() public {
        // Second backing token + registry + TokenWeighting sink.
        MockERC20 token2 = new MockERC20("Backing2", "BK2", 6);
        OperatorRegistry impl2 = new OperatorRegistry();
        OperatorRegistry registry2 = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(impl2),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (address(manager), 1, 1024, admin, arbiter, uint16(0), address(token2))
                    )
                )
            )
        );
        TokenWeighting tw2 = TokenWeighting(meshFactory.deployTokenWeighting(address(registry2), admin));
        vm.prank(admin);
        registry2.setMeshWiring(address(tw2), address(meshFactory));

        // Denoms are injective in the backing token → distinct, never collide.
        assertTrue(registry.stakeDenom() != registry2.stakeDenom(), "denoms must differ per token");
        assertEq(registry2.stakeDenom(), bytes32(uint256(uint160(address(token2)))), "denom2 derive");

        // The manager only fires hooks to ONE registry; point it at registry2 for this leg.
        vm.prank(admin);
        manager.setOperatorRegistry(address(registry2));

        // Fund + register an operator under token2.
        address op = opActors[0];
        token2.mint(op, 100e6);
        vm.startPrank(op);
        token2.approve(address(manager), 100e6);
        manager.deposit(address(token2), 100e6);
        vm.stopPrank();

        // ManagerTestBase._baseParams is hardcoded to the primary `token`; build manually.
        uint256 id = _createToken2Commitment(op, address(token2), 100e6, registry2);
        vm.prank(op);
        registry2.register(id);

        // token2's denom carries token2 stake; token1's denom is untouched (no cross-count).
        assertEq(tw2.totalStake(registry2.stakeDenom()), 100e6, "token2 denom must hold token2 stake");
        assertEq(tw.totalStake(registry.stakeDenom()), 0, "token1 denom must be unaffected by token2 stake");
        assertEq(tw2.totalStake(registry.stakeDenom()), 0, "token1 denom absent on tw2");
    }

    /// @dev Inline commitment builder for the token2 leg (ManagerTestBase._baseParams
    ///      is hardcoded to the primary `token`).
    function _createToken2Commitment(address committer, address token2, uint256 amount, OperatorRegistry reg2)
        internal
        returns (uint256 id)
    {
        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = address(reg2);
        p.token = token2;
        p.adapter = address(staticAdapter);
        p.amount = amount;
        p.maxPenaltyBps = PENALTY;
        p.challengeWindow = WINDOW;
        vm.prank(committer);
        id = manager.createCommitment(p);
    }
}
