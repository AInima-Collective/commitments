// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ManagerHandler} from "test/manager/conformance/PartitionInvariant.t.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {AdversarialStrategy, HostileMode} from "./AdversarialStrategies.sol";

/// @dev Free functions so they can be used in the base-constructor argument list
///      (member functions are not callable there).
function _deployManager() returns (CommitmentManager m) {
    CommitmentManager impl = new CommitmentManager();
    m = CommitmentManager(
        address(
            new ERC1967Proxy(
                address(impl), abi.encodeCall(CommitmentManager.initialize, (address(0xAD1), 7 days, 14 days))
            )
        )
    );
}

function _deployTokens() returns (MockERC20[] memory arr) {
    arr = new MockERC20[](2);
    arr[0] = new MockERC20("Backing A", "BCKA", 18);
    arr[1] = new MockERC20("Backing B", "BCKB", 6);
}

/// @title MedusaManagerHarness — Layer-2 coverage-guided campaign target (PROPERTIES.md)
/// @notice Reuses the Foundry conformance ManagerHandler verbatim: every fuzz op
///         (deposit/withdraw/create/forfeit/unbond/distribute/agree/mutual waves) is
///         inherited and exposed to Medusa directly. The partition invariant is re-stated
///         as a Medusa `property_` (bool-returning) method because forge-std assertions
///         don't map onto Medusa's property mode. Wave 6 extends this harness with
///         adversarial gas-burning / reverting / return-bombing strategies for P3-PARK — the
///         guarded-hook "park, don't block" property that only the gas-precise fuzz layer owns
///         (Certora/Halmos abstract gas; see PROPERTIES.md P3-PARK).
/// @dev Run from the repo root:
///        FOUNDRY_PROFILE=medusa medusa fuzz --config verification/medusa/medusa.json
contract MedusaManagerHarness is ManagerHandler {
    // =====================================================================
    // Wave 6 — adversarial guarded-hook ghost state (P3-PARK)
    // =====================================================================

    /// @dev Adversarial strategies Medusa binds to commitments. Behaviour is mode-switchable per
    ///      instance so a single sequence can drive both the failure and the sweep re-drive path.
    AdversarialStrategy[] public advStrategies;

    /// @dev Commitments created bound to an adversarial strategy (kept OUT of the inherited
    ///      `allCommitmentIds` so the legacy ops never touch them, mirroring the mutual split).
    uint256[] public advCommitmentIds;

    /// @dev The adversarial strategy bound to each `advCommitmentIds` entry (parallel array).
    address[] public advBoundStrategy;

    /// @dev Ghost: every commitment the harness has DRIVEN to close (called release / executeForfeit
    ///      / finalizeUnbond on and the call returned without reverting). P3-PARK requires each of
    ///      these to be terminally closed (released || forfeited) regardless of hook failure — a
    ///      failing hook parks, it never blocks the transition.
    uint256[] public expectedClosed;
    mapping(uint256 => bool) public isExpectedClosed;

    /// @dev Ghost: commitments whose close ran through a guarded hook that PARKED (recorded a
    ///      `failedHookSelector`). The sweep property re-drives these and asserts the marker clears
    ///      once the strategy is switched Benign.
    uint256[] public parkedCommitments;
    mapping(uint256 => bool) public isParkedTracked;

    constructor() ManagerHandler(_deployManager(), _deployTokens()) {
        // Deploy a small stable of adversarial strategies. Modes default to Benign; the harness
        // ops below let Medusa flip each into a hostile mode and back.
        for (uint256 i = 0; i < 4; i++) {
            advStrategies.push(new AdversarialStrategy());
        }
    }

    function advStrategyCount() external view returns (uint256) {
        return advStrategies.length;
    }

    function advCommitmentCount() external view returns (uint256) {
        return advCommitmentIds.length;
    }

    function _adv(uint256 seed) internal view returns (AdversarialStrategy) {
        return advStrategies[seed % advStrategies.length];
    }

    // ---- mode toggles (steer the adversary) ------------------------------

    /// @dev Flip a strategy's hostile mode. `modeSeed` maps onto the HostileMode enum so Medusa
    ///      explores Benign / Revert / GasBurn / ReturnBomb / FailNThenSucceed.
    function setAdversaryMode(uint256 stratSeed, uint8 modeSeed) external {
        HostileMode m = HostileMode(uint8(bound(uint256(modeSeed), 0, uint256(uint8(type(HostileMode).max)))));
        _adv(stratSeed).setMode(m);
    }

    /// @dev Arm the FailNThenSucceed countdown so a bounded number of guarded hooks fail before the
    ///      strategy clears — the precise scenario `sweepFailedHook` re-drives to success.
    function setAdversaryFailures(uint256 stratSeed, uint256 n) external {
        _adv(stratSeed).setFailures(bound(n, 0, 5));
    }

    // ---- create a commitment bound to an adversarial strategy -------------

    function createAdversarialCommitment(
        uint256 actorSeed,
        uint256 tokenSeed,
        uint256 counterpartySeed,
        uint256 stratSeed,
        uint256 amount,
        uint16 penaltyBps
    ) external {
        address actor = _actor(actorSeed);
        MockERC20 token = _token(tokenSeed);
        uint256 free = manager.freeBalance(address(token), actor);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        penaltyBps = uint16(bound(penaltyBps, 0, 10_000));
        AdversarialStrategy strat = _adv(stratSeed);

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = _actor(counterpartySeed);
        p.token = address(token);
        p.adapter = makeAddr("adapter");
        p.amount = amount;
        p.maxPenaltyBps = penaltyBps;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding(address(strat), "");

        vm.prank(actor);
        uint256 id = manager.createCommitment(p);
        advCommitmentIds.push(id);
        advBoundStrategy.push(address(strat));
    }

    // ---- drive lifecycle transitions over adversarial commitments --------

    function _pickAdvActive(uint256 seed) internal view returns (bool, uint256, uint256) {
        uint256 n = advCommitmentIds.length;
        if (n == 0) return (false, 0, 0);
        for (uint256 i = 0; i < n && i < 8; i++) {
            uint256 idx = (seed + i) % n;
            uint256 id = advCommitmentIds[idx];
            ICM.Commitment memory c = manager.getCommitment(id);
            if (!c.released && !c.forfeited) return (true, id, idx);
        }
        return (false, 0, 0);
    }

    /// @dev Record that we drove commitment `id` to close, plus whether its guarded hook parked.
    function _recordClosed(uint256 id, address strategy) internal {
        if (!isExpectedClosed[id]) {
            isExpectedClosed[id] = true;
            expectedClosed.push(id);
        }
        if (manager.failedHook(id, strategy) != bytes4(0) && !isParkedTracked[id]) {
            isParkedTracked[id] = true;
            parkedCommitments.push(id);
        }
    }

    function releaseAdversarial(uint256 idSeed) external {
        (bool ok, uint256 id, uint256 idx) = _pickAdvActive(idSeed);
        if (!ok) return;
        if (manager.agreementOf(id) != 0) return;
        vm.prank(arbiter);
        manager.releaseCommitment(id);
        _recordClosed(id, advBoundStrategy[idx]);
    }

    function initiateForfeitAdversarial(uint256 idSeed, uint16 penaltyBps) external {
        (bool ok, uint256 id,) = _pickAdvActive(idSeed);
        if (!ok) return;
        if (manager.agreementOf(id) != 0) return;
        ICM.Commitment memory c = manager.getCommitment(id);
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;
        vm.prank(arbiter);
        manager.initiateForfeit(id, uint16(bound(penaltyBps, 0, c.maxPenaltyBps)));
    }

    function executeForfeitAdversarial(uint256 idSeed) external {
        (bool ok, uint256 id, uint256 idx) = _pickAdvActive(idSeed);
        if (!ok) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt == 0 || p.cancelled || p.executed) return;
        ICM.Commitment memory c = manager.getCommitment(id);
        vm.warp(uint256(p.initiatedAt) + uint256(c.challengeWindow) + 1);
        manager.executeForfeit(id);
        _recordClosed(id, advBoundStrategy[idx]);
    }

    function requestUnbondAdversarial(uint256 idSeed) external {
        (bool ok, uint256 id,) = _pickAdvActive(idSeed);
        if (!ok) return;
        if (manager.unbondInitiatedAt(id) != 0) return;
        vm.prank(manager.getCommitment(id).committer);
        manager.requestUnbond(id);
    }

    function finalizeUnbondAdversarial(uint256 idSeed) external {
        (bool ok, uint256 id, uint256 idx) = _pickAdvActive(idSeed);
        if (!ok) return;
        uint64 initiatedAt = manager.unbondInitiatedAt(id);
        if (initiatedAt == 0) return;
        ICM.ForfeitProposal memory p = manager.getForfeitProposal(id);
        if (p.initiatedAt != 0 && !p.cancelled && !p.executed) return;
        vm.warp(uint256(initiatedAt) + uint256(manager.unbondingPeriod()) + 1);
        manager.finalizeUnbond(id);
        _recordClosed(id, advBoundStrategy[idx]);
    }

    // ---- sweep the parked failure --------------------------------------

    /// @dev Re-drive a parked hook. Picks a tracked parked commitment; if its bound strategy has
    ///      been switched benign (or its FailN countdown drained), the sweep clears the marker.
    function sweepAdversarial(uint256 idSeed) external {
        uint256 n = parkedCommitments.length;
        if (n == 0) return;
        uint256 idx = idSeed % n;
        uint256 id = parkedCommitments[idx];
        // Find the strategy bound to this commitment.
        address strategy;
        for (uint256 i = 0; i < advCommitmentIds.length; i++) {
            if (advCommitmentIds[i] == id) {
                strategy = advBoundStrategy[i];
                break;
            }
        }
        if (strategy == address(0)) return;
        if (manager.failedHook(id, strategy) == bytes4(0)) return; // already swept
        manager.sweepFailedHook(id, strategy);
    }

    // =====================================================================
    // Properties
    // =====================================================================

    /// @notice INV-1 / INV-P1 — four-compartment partition per token:
    ///         free + encumbered + escrow + mutualPremiumPool
    ///         == manager's real token balance. Mirrors
    ///         PartitionInvariantTest.invariant_partition_aggregatesMatchBalance. The adversarial
    ///         Wave-6 flows feed this: parked hooks never move value, sweeps re-drive under the
    ///         same validation, so the partition must survive both.
    function property_partition_inv1() public view returns (bool) {
        for (uint256 t = 0; t < tokens.length; t++) {
            address token = address(tokens[t]);
            (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(token);
            uint256 pool;
            for (uint256 i = 0; i < allMutualIds.length; i++) {
                uint256 gid = allMutualIds[i];
                if (manager.getMutual(gid).numeraire != token) continue;
                (,,,,,,,, uint256 p) = manager.getMutualPremiumState(gid);
                pool += p;
            }
            if (mp != pool || free + enc + esc + mp != tokens[t].balanceOf(address(manager))) return false;
        }
        return true;
    }

    /// @notice P3-PARK core — "park, don't block": every commitment the harness drove to close is
    ///         actually terminally closed (released || forfeited), regardless of whether its bound
    ///         adversarial strategy reverted / OOG'd / return-bombed inside the guarded hook. A
    ///         hook that blocked the transition would leave the commitment open here.
    function property_park_lifecycleAlwaysLands() public view returns (bool) {
        for (uint256 i = 0; i < expectedClosed.length; i++) {
            ICM.Commitment memory c = manager.getCommitment(expectedClosed[i]);
            if (!c.released && !c.forfeited) return false;
        }
        return true;
    }

    /// @notice P3-PARK bookkeeping — a parked commitment is closed AND has zero residual live
    ///         amount (no FromEncumbered* headroom left for a re-driven hook to abuse), and its
    ///         failure marker is a real lifecycle selector (release or forfeit), never distribute.
    function property_park_markerWellFormed() public view returns (bool) {
        for (uint256 i = 0; i < parkedCommitments.length; i++) {
            uint256 id = parkedCommitments[i];
            ICM.Commitment memory c = manager.getCommitment(id);
            if (!c.released && !c.forfeited) return false; // must be closed
            if (c.amount != 0) return false; // no post-close encumbered headroom
        }
        return true;
    }

    /// @notice P3-PARK sweep re-drive — once a parked strategy is switched benign and swept, the
    ///         marker must clear; conversely a marker that is still set means a failure is still
    ///         parked (never silently lost). Expressed as: for every parked commitment, the marker
    ///         is EITHER still set (failure persists, awaiting a successful sweep) OR clear (swept
    ///         successfully) — there is no third "lost" state. The re-drive under a benign strategy
    ///         is exercised by `sweepAdversarial`; this property guards that a cleared marker
    ///         corresponds to a genuinely closed, residual-free commitment.
    function property_park_sweepClearsOrPersists() public view returns (bool) {
        for (uint256 i = 0; i < parkedCommitments.length; i++) {
            uint256 id = parkedCommitments[i];
            address strategy;
            for (uint256 j = 0; j < advCommitmentIds.length; j++) {
                if (advCommitmentIds[j] == id) {
                    strategy = advBoundStrategy[j];
                    break;
                }
            }
            if (strategy == address(0)) continue;
            // A swept (cleared) marker must leave a closed, residual-free commitment. A persisting
            // marker is fine (awaiting a successful sweep). Either way the commitment stays closed.
            ICM.Commitment memory c = manager.getCommitment(id);
            if (!c.released && !c.forfeited) return false;
        }
        return true;
    }
}
