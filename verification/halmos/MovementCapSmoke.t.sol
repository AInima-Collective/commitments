// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {
    IDistributionStrategy,
    TokenMovement,
    MovementKind,
    StrategyBinding,
    CreatedContext,
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @dev Minimal deterministic strategy for the INV-4 harness. It accepts its binding
///      (onCommitmentCreated is a no-op) and, on `distribute`, returns exactly ONE
///      TokenMovement built from constructor-configured fields. All other hooks return
///      an empty batch. Keeping the movement to a single, fully-configured instruction
///      bounds the symbolic paths through MovementLib's validation.
contract OneMoveDistributeStrategy is IDistributionStrategy {
    MovementKind internal kind;
    address internal from;
    address internal to;
    address internal token;
    uint256 internal units;

    function configure(MovementKind kind_, address from_, address to_, address token_, uint256 units_) external {
        kind = kind_;
        from = from_;
        to = to_;
        token = token_;
        units = units_;
    }

    function onCommitmentCreated(CreatedContext calldata) external {}

    function onCommitmentReleased(LifecycleContext calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function onCommitmentForfeited(ForfeitContext calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function distribute(DistributeContext calldata) external view returns (TokenMovement[] memory moves) {
        moves = new TokenMovement[](1);
        moves[0] = TokenMovement({kind: kind, from: from, to: to, token: token, units: units});
    }

    function claim(ClaimContext calldata, bytes calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function pending(ClaimContext calldata, bytes calldata) external pure returns (uint256) {
        return 0;
    }
}

/// @title MovementCapSmokeTest — INV-4 (ERC §D.5): strategy movement debits are bounded by
///        the bound commitment's `amount`, and recipients are restricted to the commitment's
///        parties (committer / counterparty) or, for accrual, the strategy's own escrow.
/// @notice Drives `manager.distribute(id, strategy)` where the bound strategy emits ONE
///         movement whose `to`/`units` are symbolic, and asserts the ledger effect (not just
///         non-revert): the committer's encumbered position shrinks by exactly `units`, the
///         running debit never exceeds `amount`, and any recipient outside the allow-list makes
///         the whole call revert (encumbered unchanged).
/// @dev Run: FOUNDRY_PROFILE=halmos halmos --solver z3 --contract MovementCapSmokeTest
contract MovementCapSmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;
    OneMoveDistributeStrategy internal strat;

    address internal constant COMMITTER = address(0x10001);
    address internal constant ARBITER = address(0x10002);
    address internal constant COUNTERPARTY = address(0x10003);
    address internal constant ADAPTER = address(0x10004);

    uint256 internal constant DEPOSIT = 1_000e18;
    uint256 internal constant AMOUNT = 400e18; // bound commitment amount (concrete → tight paths)

    uint256 internal commitmentId;

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

        strat = new OneMoveDistributeStrategy();

        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = AMOUNT;
        p.maxPenaltyBps = 5_000;
        p.challengeWindow = 86_400;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding({strategy: address(strat), params: ""});

        vm.prank(COMMITTER);
        commitmentId = manager.createCommitment(p);
    }

    /// @dev Create a second commitment with a caller-chosen `maxPenaltyBps` and the same single
    ///      bound strategy. Used to linearize `ExposureLib.exposureOf` for the symbolic-`units`
    ///      check (penalty 0 ⇒ exposure math is a no-op, so the debit path is fully linear and
    ///      halmos does not have to reason about the `amount * bps / 10_000` multiply/divide).
    function _createWith(uint16 penaltyBps) internal returns (uint256 id) {
        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = AMOUNT;
        p.maxPenaltyBps = penaltyBps;
        p.challengeWindow = 86_400;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding({strategy: address(strat), params: ""});
        vm.prank(COMMITTER);
        id = manager.createCommitment(p);
    }

    /// @notice INV-4 cap + ledger effect. A FromEncumberedToExternal payout to the committer
    ///         (a legal party) for a SYMBOLIC `units` either:
    ///           - reverts (units == 0 → MovementZeroUnits), leaving encumbered untouched, OR
    ///           - succeeds, shrinking encumbered by exactly `units`, with `units <= amount`.
    ///         In every non-reverting path the debit is bounded by the commitment's `amount`.
    /// @dev BOUND: `maxPenaltyBps == 0` so `ExposureLib.exposureOf` is identically 0 and the
    ///      exposure-shrink is a no-op — this linearizes the debit path (the nonlinear
    ///      `amount * bps / 10_000` on a symbolic post-debit `amount` otherwise times out).
    ///      The cap/exposure interaction on a nonzero penalty is owned by the Foundry/Medusa
    ///      conformance suite (real arithmetic). `units` is capped at AMOUNT here; the strictly
    ///      over-cap case is proved in `check_INV4_overCapAlwaysReverts`.
    function check_INV4_encumberedDebitBoundedByAmount(uint256 units) public {
        vm.assume(units <= AMOUNT); // valid debits live in [1, AMOUNT]; over-cap covered separately

        uint256 id = _createWith(0);

        strat.configure(MovementKind.FromEncumberedToExternal, COMMITTER, COMMITTER, address(token), units);

        uint256 encPre = manager.encumberedBalance(address(token), COMMITTER);

        try manager.distribute(id, address(strat)) {
            uint256 encPost = manager.encumberedBalance(address(token), COMMITTER);
            // Exactly `units` debited, and the debit never exceeds the commitment amount.
            assert(encPre - encPost == units);
            assert(encPre - encPost <= AMOUNT);
        } catch {
            // Only the zero-units guard may reject an in-range `units`; encumbered unchanged.
            assert(units == 0);
            assert(manager.encumberedBalance(address(token), COMMITTER) == encPre);
        }
    }

    /// @notice INV-4 over-cap rejection. A payout of `units > amount` MUST revert
    ///         (MovementExceedsCommitment), leaving encumbered untouched — the debit can never
    ///         exceed the commitment's `amount`.
    function check_INV4_overCapAlwaysReverts(uint256 units) public {
        vm.assume(units > AMOUNT);
        vm.assume(units <= DEPOSIT); // keep the symbolic value bounded

        strat.configure(MovementKind.FromEncumberedToExternal, COMMITTER, COMMITTER, address(token), units);

        uint256 encPre = manager.encumberedBalance(address(token), COMMITTER);

        try manager.distribute(commitmentId, address(strat)) {
            assert(false); // over-cap must never apply
        } catch {
            assert(manager.encumberedBalance(address(token), COMMITTER) == encPre);
        }
    }

    /// @notice INV-4 recipient allow-list. For a FromEncumberedToExternal payout of a fixed,
    ///         in-cap `units`, the distribute call SUCCEEDS iff the movement `to` is a legal
    ///         party (committer or counterparty) and REVERTS (MovementRecipientNotParty) for
    ///         every other recipient — asserted via the ledger effect.
    function check_INV4_recipientRestrictedToParties(address to) public {
        uint256 units = 100e18; // concrete, strictly < AMOUNT

        strat.configure(MovementKind.FromEncumberedToExternal, COMMITTER, to, address(token), units);

        uint256 encPre = manager.encumberedBalance(address(token), COMMITTER);

        try manager.distribute(commitmentId, address(strat)) {
            // Success is only reachable for the two legal external recipients.
            assert(to == COMMITTER || to == COUNTERPARTY);
            assert(encPre - manager.encumberedBalance(address(token), COMMITTER) == units);
        } catch {
            // Any non-party recipient is rejected; encumbered untouched.
            assert(to != COMMITTER && to != COUNTERPARTY);
            assert(manager.encumberedBalance(address(token), COMMITTER) == encPre);
        }
    }
}
