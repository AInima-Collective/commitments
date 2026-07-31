// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title ForfeitBoundarySmokeTest — P1-WINDOW boundary liveness (mutation finding M15, MUTATION-RESULTS.md)
/// @notice The mutation pass showed that a `<` -> `<=` weakening of the challenge-window
///         check (CommitmentLifecycleLib._forfeitEffects) survives the fuzz layers: every
///         handler warps to `initiatedAt + window + 1`, never sampling the exact boundary
///         tick where the two comparisons differ. This check pins the boundary: forfeit
///         MUST be executable at exactly `initiatedAt + challengeWindow` (the spec forbids
///         execution BEFORE the window elapses; the boundary tick is the first legal one),
///         and MUST revert one second earlier.
contract ForfeitBoundarySmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;

    address internal constant COMMITTER = address(0x20001);
    address internal constant ARBITER = address(0x20002);
    address internal constant COUNTERPARTY = address(0x20003);
    address internal constant ADAPTER = address(0x20004);

    uint256 internal constant AMOUNT = 500e18;
    uint64 internal constant WINDOW = 86_400;

    uint256 internal commitmentId;
    uint64 internal initiatedAt;

    function setUp() public {
        _etchManagerLibs();
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (address(0xAD), 7 days, 14 days))
                )
            )
        );

        token = new MockERC20("Backing", "BCK", 18);
        token.mint(COMMITTER, AMOUNT);
        vm.prank(COMMITTER);
        token.approve(address(manager), type(uint256).max);
        vm.prank(COMMITTER);
        manager.deposit(address(token), AMOUNT);

        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = AMOUNT;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = WINDOW;

        vm.prank(COMMITTER);
        commitmentId = manager.createCommitment(p);

        vm.prank(ARBITER);
        manager.initiateForfeit(commitmentId, 10_000);
        initiatedAt = manager.getForfeitProposal(commitmentId).initiatedAt;
    }

    /// @notice P1-WINDOW liveness at the boundary: at exactly `initiatedAt + window` the
    ///         forfeit executes (permissionlessly) and the counterparty is credited.
    function check_executeForfeit_succeedsAtExactWindowBoundary() public {
        vm.warp(uint256(initiatedAt) + WINDOW);

        manager.executeForfeit(commitmentId); // must not revert at the first legal tick

        assert(manager.getCommitment(commitmentId).forfeited);
        assert(manager.freeBalance(address(token), COUNTERPARTY) == AMOUNT);
    }

    /// @notice P1-WINDOW safety one tick earlier: at `initiatedAt + window - 1` execution
    ///         reverts and no state moves.
    function check_executeForfeit_revertsOneSecondBeforeBoundary() public {
        vm.warp(uint256(initiatedAt) + WINDOW - 1);

        try manager.executeForfeit(commitmentId) {
            assert(false); // inside the window must never execute
        } catch {
            assert(!manager.getCommitment(commitmentId).forfeited);
            assert(manager.freeBalance(address(token), COUNTERPARTY) == 0);
        }
    }
}
