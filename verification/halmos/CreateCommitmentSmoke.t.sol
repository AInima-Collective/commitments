// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title CreateCommitmentSmokeTest — Halmos smoke test (PROPERTIES.md INV-10)
/// @notice Symbolic check through `createCommitment`, which crosses all three
///         [I]-rated compatibility hazards in one path:
///         1. `nonReentrant` from OZ ReentrancyGuardTransient (EIP-1153 tstore/tload),
///         2. DELEGATECALL into the external library CommitmentLifecycleLib,
///         3. the ERC-1967/UUPS proxy in front of the manager.
///         If Halmos executes this soundly, the P0–P2 harness plan is viable.
/// @dev Run: FOUNDRY_PROFILE=halmos halmos --solver z3
///      (yices, the 0.3.x default solver, ships no linux-arm64 build).
contract CreateCommitmentSmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;

    address internal constant COMMITTER = address(0x10001);
    address internal constant ARBITER = address(0x10002);
    address internal constant COUNTERPARTY = address(0x10003);
    address internal constant ADAPTER = address(0x10004);

    uint256 internal constant DEPOSIT = 1_000e18;

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
        token.mint(COMMITTER, DEPOSIT);
        vm.prank(COMMITTER);
        token.approve(address(manager), type(uint256).max);
        vm.prank(COMMITTER);
        manager.deposit(address(token), DEPOSIT);
    }

    /// @notice INV-10 + ledger effect, for ALL valid (amount, maxPenaltyBps, challengeWindow):
    ///         the returned id is >= 1 (0 is the non-attribution sentinel) and exactly
    ///         `amount` moves free -> encumbered for the committer.
    function check_createCommitment_INV10_idNonZeroAndEncumbersExactly(
        uint256 amount,
        uint16 maxPenaltyBps,
        uint64 challengeWindow
    ) public {
        vm.assume(amount >= 1 && amount <= DEPOSIT);
        vm.assume(maxPenaltyBps <= 10_000);
        vm.assume(challengeWindow >= 86_400); // DEFAULT_MIN_CHALLENGE_WINDOW

        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = amount;
        p.maxPenaltyBps = maxPenaltyBps;
        p.challengeWindow = challengeWindow;
        // expiresAt = 0 (no expiry), no strategies, empty metadata.

        vm.prank(COMMITTER);
        uint256 id = manager.createCommitment(p);

        assert(id >= 1);
        assert(manager.freeBalance(address(token), COMMITTER) == DEPOSIT - amount);
        assert(manager.encumberedBalance(address(token), COMMITTER) == amount);
    }
}
