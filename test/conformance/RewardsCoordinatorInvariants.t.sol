// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {ICommitmentsRewardsCoordinator} from "src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MerkleHelper} from "../rewards/MerkleHelper.sol";

/// @notice Handler that drives the rewards coordinator with random sequences
///         of deposit / submitRoot / processClaim / time-warp / disableRoot.
///         Tracks ghost variables sufficient to assert INV-1 (cumulative-claim
///         monotonicity), the upper bound clause, and total solvency.
contract RewardsCoordinatorHandler is Test {
    CommitmentsRewardsCoordinator public coord;
    MerkleSnapshot public snap;
    MockERC20 public token;
    address public service;
    address public updater;

    address[] public earners;
    bytes32[] public submittedRoots;

    /// @dev rootId => (earner => cumulativeAmountForThatRoot). Only populated
    ///      for roots we *submitted*; reads return 0 for unknown.
    mapping(bytes32 => mapping(address => uint256)) public leafFor;

    /// @dev Largest cumulative seen *across all submitted roots* per earner.
    ///      INV-1's upper-bound check is `claimed[earner] <= maxLeaf[earner]`
    ///      after a successful claim against the most recent active root.
    mapping(address => uint256) public maxLeaf;

    /// @dev claimed[earner] tracked by the handler in lock-step with the
    ///      coordinator. Used to assert monotonicity.
    mapping(address => uint256) public ghostClaimed;

    uint256 public totalDeposited;
    uint256 public totalPaidOut;

    uint64 public constant DELAY = 7 days;

    constructor(
        CommitmentsRewardsCoordinator coord_,
        MerkleSnapshot snap_,
        MockERC20 token_,
        address[] memory earners_,
        address service_,
        address updater_
    ) {
        coord = coord_;
        snap = snap_;
        token = token_;
        for (uint256 i = 0; i < earners_.length; ++i) {
            earners.push(earners_[i]);
        }
        service = service_;
        updater = updater_;
    }

    // -------------------------------------------------------------------------
    // Fuzzed actions
    // -------------------------------------------------------------------------

    function deposit(uint96 amount) external {
        amount = uint96(bound(amount, 1, 1_000_000e6));
        token.mint(address(this), amount);
        token.approve(address(coord), amount);
        coord.depositRewards(address(token), amount);
        totalDeposited += amount;
    }

    /// @dev Submit a root that assigns each earner a non-decreasing cumulative
    ///      amount. This guarantees INV-1's upper-bound clause holds for any
    ///      claim against this root: `cumulativeAmount(root) >= claimed[earner]`.
    ///
    ///      We intentionally produce well-formed roots (cumulative_n >=
    ///      cumulative_{n-1}) so the invariant is observable; adversarial
    ///      regressions get tested in coordinator unit tests, not here.
    function submitNewRoot(uint64[5] calldata cumulativeBumps) external {
        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](earners.length);
        for (uint256 i = 0; i < earners.length; ++i) {
            uint256 bump = bound(cumulativeBumps[i], 0, 1_000e6);
            uint256 newCum = maxLeaf[earners[i]] + bump;
            leaves[i] = MerkleHelper.Leaf({earner: earners[i], token: address(token), cumulativeAmount: newCum});
        }

        bytes32 rootId = MerkleHelper.buildRoot(leaves);
        if (rootId == bytes32(0)) return;
        if (snap.rootById(rootId).submittedAt != 0) return; // already submitted

        vm.prank(updater);
        try snap.submitRoot(rootId) {
            submittedRoots.push(rootId);
            for (uint256 i = 0; i < earners.length; ++i) {
                leafFor[rootId][earners[i]] = leaves[i].cumulativeAmount;
                if (leaves[i].cumulativeAmount > maxLeaf[earners[i]]) {
                    maxLeaf[earners[i]] = leaves[i].cumulativeAmount;
                }
            }
        } catch {}
    }

    function timeWarp(uint64 secs) external {
        secs = uint64(bound(secs, 1, 30 days));
        vm.warp(block.timestamp + secs);
    }

    function claim(uint8 earnerSeed, uint8 rootSeed) external {
        if (submittedRoots.length == 0 || earners.length == 0) return;
        bytes32 rootId = submittedRoots[rootSeed % submittedRoots.length];
        if (!snap.isActive(rootId)) return;

        address earner = earners[earnerSeed % earners.length];
        uint256 cumulative = leafFor[rootId][earner];
        // Need to rebuild the leaf set for this root in submission order.
        MerkleHelper.Leaf[] memory leaves = new MerkleHelper.Leaf[](earners.length);
        uint256 idx;
        for (uint256 i = 0; i < earners.length; ++i) {
            leaves[i] = MerkleHelper.Leaf({
                earner: earners[i], token: address(token), cumulativeAmount: leafFor[rootId][earners[i]]
            });
            if (earners[i] == earner) idx = i;
        }

        bytes32[] memory proof = MerkleHelper.buildProof(leaves, idx);
        uint256 expectedDelta = cumulative > ghostClaimed[earner] ? cumulative - ghostClaimed[earner] : 0;
        if (expectedDelta == 0) return; // would NoOp-revert; skip
        if (token.balanceOf(address(coord)) < expectedDelta) return; // would InsufficientBalance; skip

        vm.prank(earner);
        try coord.processClaim(rootId, address(token), cumulative, proof) returns (uint256 paid) {
            ghostClaimed[earner] = cumulative;
            totalPaidOut += paid;
            assertEq(paid, expectedDelta, "paid != expected delta");
        } catch {}
    }
}

contract RewardsCoordinatorInvariantsTest is Test {
    RewardsCoordinatorHandler internal handler;
    CommitmentsRewardsCoordinator internal coord;
    MerkleSnapshot internal snap;
    MockERC20 internal token;
    address[] internal earners;

    address internal service = address(0xCAFE);
    address internal updater = address(0xBEEF);

    function setUp() public {
        // Deploy implementations and factory.
        MerkleSnapshot snapImpl = new MerkleSnapshot();
        CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
        RewardsCoordinatorFactory factory = new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), 1 days);
        (address coordAddr, address snapAddr) = factory.deployCoordinator(service, updater, 7 days);
        coord = CommitmentsRewardsCoordinator(coordAddr);
        snap = MerkleSnapshot(snapAddr);

        token = new MockERC20("USDC", "USDC", 6);

        earners = new address[](5);
        for (uint256 i = 0; i < earners.length; ++i) {
            earners[i] = address(uint160(0xE0 + i));
        }

        handler = new RewardsCoordinatorHandler(coord, snap, token, earners, service, updater);

        // Restrict the invariant runner to the handler.
        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.submitNewRoot.selector;
        selectors[2] = handler.timeWarp.selector;
        selectors[3] = handler.claim.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // -------------------------------------------------------------------------
    // INV-1: cumulative-claim monotonicity
    // -------------------------------------------------------------------------

    /// @notice For every earner, the on-chain `claimed[earner][token]` value
    ///         matches the handler's ghost — proving every claim moved the
    ///         cumulative forward (never backward) by exactly the delta paid.
    function invariant_INV1_monotonicity() public view {
        for (uint256 i = 0; i < earners.length; ++i) {
            address earner = earners[i];
            uint256 onChain = coord.claimed(earner, address(token));
            uint256 ghost = handler.ghostClaimed(earner);
            assertEq(onChain, ghost, "INV-1: on-chain claimed diverges from monotonic ghost");
        }
    }

    /// @notice Upper-bound clause: claimed never exceeds the largest cumulative
    ///         leaf ever submitted for this earner.
    function invariant_INV1_upperBound() public view {
        for (uint256 i = 0; i < earners.length; ++i) {
            address earner = earners[i];
            assertLe(
                coord.claimed(earner, address(token)),
                handler.maxLeaf(earner),
                "INV-1-bound: claimed exceeds max leaf ever submitted"
            );
        }
    }

    /// @notice Solvency: total tokens paid out never exceed total deposited.
    function invariant_solvency() public view {
        assertLe(handler.totalPaidOut(), handler.totalDeposited(), "solvency: paid out > deposited");
    }

    /// @notice Coordinator's free token balance equals deposited - paidOut.
    function invariant_balance_matches_ledger() public view {
        assertEq(
            token.balanceOf(address(coord)),
            handler.totalDeposited() - handler.totalPaidOut(),
            "coord token balance != deposited - paid out"
        );
    }
}
