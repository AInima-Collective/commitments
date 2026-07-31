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

/// @dev Strategy that, on `claim`, returns ONE escrow-payout movement (FromEscrowToFree by
///      default, or FromEscrowToExternal) built from constructor-configured fields. The `from`
///      is always the strategy itself (the escrow sentinel MovementLib requires). All other
///      hooks return an empty batch.
contract OneMoveClaimStrategy is IDistributionStrategy {
    MovementKind internal kind;
    address internal to;
    address internal token;
    uint256 internal units;

    function configure(MovementKind kind_, address to_, address token_, uint256 units_) external {
        kind = kind_;
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

    function distribute(DistributeContext calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function claim(ClaimContext calldata, bytes calldata) external view returns (TokenMovement[] memory moves) {
        moves = new TokenMovement[](1);
        // `from` is the strategy itself — the escrow sentinel the manager checks (§D.5).
        moves[0] = TokenMovement({kind: kind, from: address(this), to: to, token: token, units: units});
    }

    function pending(ClaimContext calldata, bytes calldata) external pure returns (uint256) {
        return 0;
    }
}

/// @title EscrowIsolationSmokeTest — INV-5 (ERC §D.5): a movement debits ONLY the calling
///        strategy's own escrow. Two strategies (A, B) each hold funded escrow in the same
///        token; a claim driven through A that pays out of A's escrow leaves B's escrow
///        untouched on every path.
/// @dev Run: FOUNDRY_PROFILE=halmos halmos --solver z3 --contract EscrowIsolationSmokeTest
contract EscrowIsolationSmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;
    OneMoveClaimStrategy internal stratA;
    OneMoveClaimStrategy internal stratB;

    address internal constant COMMITTER = address(0x10001);
    address internal constant ARBITER = address(0x10002);
    address internal constant COUNTERPARTY = address(0x10003);
    address internal constant ADAPTER = address(0x10004);

    uint256 internal constant DEPOSIT = 1_000e18;
    uint256 internal constant AMOUNT = 400e18;
    uint256 internal constant ESCROW_A = 300e18;
    uint256 internal constant ESCROW_B = 200e18;

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

        stratA = new OneMoveClaimStrategy();
        stratB = new OneMoveClaimStrategy();

        // Bind only strategy A to the commitment (claim requires a bound strategy). B is bound
        // to no commitment but holds funded escrow — the bystander whose escrow must not move.
        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = AMOUNT;
        p.maxPenaltyBps = 5_000;
        p.challengeWindow = 86_400;
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding({strategy: address(stratA), params: ""});
        vm.prank(COMMITTER);
        commitmentId = manager.createCommitment(p);

        // Fund both strategies' escrow (permissionless).
        token.mint(address(this), ESCROW_A + ESCROW_B);
        token.approve(address(manager), type(uint256).max);
        manager.fundStrategy(address(stratA), address(token), ESCROW_A);
        manager.fundStrategy(address(stratB), address(token), ESCROW_B);
    }

    /// @notice INV-5: a claim through A that pays SYMBOLIC `units` out of A's escrow (to a legal
    ///         party, via a symbolic escrow-payout kind) leaves B's escrow EXACTLY unchanged on
    ///         every path — success or revert. The claim can only debit A's own escrow.
    /// @dev `kindSel` selects FromEscrowToFree vs FromEscrowToExternal (the two claim-legal
    ///      escrow kinds). `units` symbolic and bounded by DEPOSIT to keep paths tight.
    function check_INV5_escrowBIsolated(uint256 units, bool kindSel) public {
        vm.assume(units <= DEPOSIT);

        MovementKind kind = kindSel ? MovementKind.FromEscrowToExternal : MovementKind.FromEscrowToFree;
        stratA.configure(kind, COUNTERPARTY, address(token), units);

        uint256 escBPre = manager.escrowOf(address(token), address(stratB));
        assert(escBPre == ESCROW_B);

        try manager.claim(commitmentId, address(stratA), "") {
            // A paid out; B is untouched.
            assert(manager.escrowOf(address(token), address(stratB)) == ESCROW_B);
        } catch {
            // Any revert (over-escrow, zero units, ...) still cannot touch B.
            assert(manager.escrowOf(address(token), address(stratB)) == ESCROW_B);
        }
    }

    /// @notice INV-5 corollary: A's own escrow is what shrinks, bounded by A's escrow balance.
    ///         For an in-range, nonzero `units`, the claim succeeds and A's escrow drops by
    ///         exactly `units`; B remains fixed. For `units > ESCROW_A` it reverts
    ///         (InsufficientEscrow), leaving BOTH escrows unchanged.
    function check_INV5_debitsOnlyCallerEscrow(uint256 units) public {
        vm.assume(units >= 1 && units <= DEPOSIT);

        stratA.configure(MovementKind.FromEscrowToFree, COMMITTER, address(token), units);

        uint256 escAPre = manager.escrowOf(address(token), address(stratA));

        try manager.claim(commitmentId, address(stratA), "") {
            assert(units <= ESCROW_A);
            assert(escAPre - manager.escrowOf(address(token), address(stratA)) == units);
            assert(manager.escrowOf(address(token), address(stratB)) == ESCROW_B);
        } catch {
            assert(units > ESCROW_A);
            assert(manager.escrowOf(address(token), address(stratA)) == escAPre);
            assert(manager.escrowOf(address(token), address(stratB)) == ESCROW_B);
        }
    }
}
