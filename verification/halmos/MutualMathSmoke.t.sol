// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title MutualMathSmokeTest — Halmos harness for the shared-loss mutual math (ERC §G).
/// @notice Bounded, per-call symbolic checks over MutualLib's loss index Λ (`cumulativeLoss`), the
///         Synthetix-style premium index Π (`premiumPerShareStored`), and the per-member settlement
///         accounting. Owns the Halmos column of PROPERTIES.md rows INV-G2, INV-G3, INV-G6, P2-MONO.
///
///         Scene (built concretely in setUp): ONE (oracle-free) mutual with TWO members, both denominated in a single token. Symbolic inputs are the
///         declared loss, the premium funding amount/duration, and (where relevant) the settle timing;
///         all are `vm.assume`-bounded to `<= 1_000e18` (well under the uint128 denominator cap) so the
///         nonlinear `Math.mulDiv` on the index denominators stays tractable for z3.
///
/// @dev Run: FOUNDRY_PROFILE=halmos halmos --contract MutualMathSmokeTest --solver z3
///
///      Every mutual is oracle-free: each member posts the numeraire and its weight is
///      `creditedValue == E_i` exactly (see MutualLib `_effCover`). This keeps every property's
///      loss-side denominator (`totalShares`) and premium-side denominator (`activeCover`) linear in
///      the member weights, so a proof here covers the arithmetic core.
contract MutualMathSmokeTest is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;

    address internal constant ARBITER = address(0x20001);
    address internal constant BENEFICIARY = address(0x20002);
    address internal constant MEMBER_A = address(0x20003);
    address internal constant MEMBER_B = address(0x20004);
    address internal constant FUNDER = address(0x20005);
    address internal constant ADAPTER = address(0x20006);

    // Concrete per-member deposit and lien parameters. Member E_i = amount * maxPenaltyBps / 1e4.
    uint256 internal constant DEPOSIT = 1_000e18;
    uint256 internal constant MEMBER_AMOUNT = 400e18;
    uint16 internal constant MEMBER_PENALTY_BPS = 5_000; // E_i = 200e18 per member
    uint256 internal constant MEMBER_EI = 200e18; // exposure per member (== creditedValue)

    uint64 internal constant MUTUAL_WINDOW = 2 days; // == MUTUAL_MIN_CHALLENGE_WINDOW
    uint64 internal constant COMMIT_WINDOW = 86_400; // per-commitment DEFAULT_MIN_CHALLENGE_WINDOW

    uint256 internal mutualId;
    uint256 internal cidA;
    uint256 internal cidB;

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

        // Fund the two members (join deposits E_i-backing capital via the manager ledger).
        _fund(MEMBER_A);
        _fund(MEMBER_B);
        // The premium funder needs a WALLET balance: `fundMutualPremium` does a measured-receipt
        // `transferFrom` from the funder's token wallet (NOT its manager free balance). Two funds of up
        // to 1_000e18 each ⇒ mint 2_000e18 and approve the manager.
        token.mint(FUNDER, 2_000e18);
        vm.prank(FUNDER);
        token.approve(address(manager), type(uint256).max);

        // Oracle-free mutual: creditedValue == E_i; the adapter address is never consulted.
        ICM.MutualParams memory mp = ICM.MutualParams({
            arbiter: ARBITER,
            numeraire: address(token),
            beneficiary: BENEFICIARY,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        mutualId = manager.createMutual(mp);
        vm.prank(ARBITER);
        manager.activateMutual(mutualId);

        cidA = _join(MEMBER_A);
        cidB = _join(MEMBER_B);
    }

    function _fund(address who) internal {
        token.mint(who, DEPOSIT);
        vm.prank(who);
        token.approve(address(manager), type(uint256).max);
        vm.prank(who);
        manager.deposit(address(token), DEPOSIT);
    }

    function _join(address who) internal returns (uint256 cid) {
        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = BENEFICIARY; // mutual requires counterparty == beneficiary (no forfeit-to-self)
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = MEMBER_AMOUNT;
        p.maxPenaltyBps = MEMBER_PENALTY_BPS;
        p.challengeWindow = COMMIT_WINDOW;
        p.strategies = new StrategyBinding[](0); // members bind no strategies (OBJ-7)
        vm.prank(who);
        cid = manager.joinMutual(mutualId, p);
    }

    /// @dev Initiate a symbolic loss, warp past the mutual challenge window, and execute it. Returns
    ///      the pre-execute Λ so callers can assert monotonicity. `declared` is bounded well under the
    ///      uint128 `totalShares` cap; both branches of the headroom clamp are reachable (declared may
    ///      exceed or stay within headroom = totalShares at Λ == 0).
    function _initiateAndExecute(uint256 declared) internal returns (uint256 lambdaPre) {
        vm.prank(ARBITER);
        manager.initiateMutualLoss(mutualId, declared, bytes32(0));

        ICM.MutualLossProposal memory prop = manager.getMutualLossProposal(mutualId);
        vm.warp(uint256(prop.initiatedAt) + MUTUAL_WINDOW + 1);

        lambdaPre = manager.getMutual(mutualId).cumulativeLoss;
        manager.executeMutualLoss(mutualId);
    }

    // =========================================================================
    // INV-G2 + P2-MONO (loss half): Λ ≤ 1e18 and Λ monotone non-decreasing
    // =========================================================================

    /// @notice INV-G2: after `executeMutualLoss` with a SYMBOLIC declared loss, the shared loss index
    ///         Λ (`cumulativeLoss`) is hard-capped at 1e18 AND never decreases (the P2-MONO loss half).
    ///         With `totalShares == 2 * E_i == 400e18` at Λ == 0, `headroom == totalShares`, so
    ///         `applied == min(declared, totalShares)` and `Λ' == applied * 1e18 / totalShares <= 1e18`.
    /// @dev BOUND: `declared <= 1_000e18` (> totalShares, so the clamp branch is reachable; keeps the
    ///      symbolic value inside uint128 and the `applied * 1e18 / totalShares` divide tractable).
    function check_INVG2_lambdaCappedAndMonotone(uint256 declared) public {
        vm.assume(declared >= 1 && declared <= 1_000e18);

        uint256 lambdaPre = _initiateAndExecute(declared);
        uint256 lambdaPost = manager.getMutual(mutualId).cumulativeLoss;

        assert(lambdaPost <= 1e18); // INV-G2 cap
        assert(lambdaPost >= lambdaPre); // P2-MONO (loss index monotone non-decreasing)
    }

    // =========================================================================
    // INV-G6: settledUnits ≤ forfeitableUnits per member
    // =========================================================================

    /// @notice INV-G6: after `settleMembers` on a member whose mutual took a SYMBOLIC loss, the
    ///         member's cumulative `settledUnits` never exceeds its frozen `forfeitableUnits` (E_i).
    ///         The settle path draws `owed = min(E_i*(Λ−snap)/1e18, E_i−settled, c.amount)`, so the
    ///         Belt-1 clamp `owed <= E_i − settledUnits` is the load-bearing bound under test.
    /// @dev BOUND: `declared <= 1_000e18`. Uses the batch `settleMembers` entrypoint over the single
    ///      member A.
    function check_INVG6_settledNeverExceedsForfeitable(uint256 declared) public {
        vm.assume(declared >= 1 && declared <= 1_000e18);

        _initiateAndExecute(declared);

        uint256[] memory ids = new uint256[](1);
        ids[0] = cidA;
        manager.settleMembers(ids);

        ICM.Membership memory m = manager.getMembership(cidA);
        assert(m.settledUnits <= m.forfeitableUnits); // INV-G6
        assert(m.forfeitableUnits == MEMBER_EI); // E_i frozen at join — never mutated by settle
    }

    // =========================================================================
    // INV-G3: totalShares == Σ creditedValue (per-operation delta form on join)
    // =========================================================================

    /// @notice INV-G3 (delta form): a `joinMutual` credits `totalShares` by EXACTLY the value it adds
    ///         (`creditedValue == E_i`), and the membership row records that same
    ///         value. Verified as the per-operation delta rather than the full running sum: a third
    ///         member C joins with a SYMBOLIC lien `amount`, and we assert
    ///         `totalShares' − totalShares == creditedValue_C == E_i(amount, bps)`.
    /// @dev BOUND CHOSEN: `amount <= DEPOSIT (1_000e18)` (member C's funded free balance) and a CONCRETE
    ///      `maxPenaltyBps == 5_000`, so `E_i == amount * 5_000 / 1e4 == amount / 2` — a linear, exact
    ///      relation z3 discharges directly. The full Σ-over-all-members identity is impractical
    ///      symbolically (unbounded membership set); the delta form is the inductive step that, with the
    ///      concrete two-member base established in setUp, implies the aggregate INV-G3.
    function check_INVG3_joinCreditsTotalSharesByExactValue(uint256 amount) public {
        // Member C must have E_i >= 1 (join rejects zero forfeitable capacity) and fit its deposit.
        vm.assume(amount >= 2 && amount <= DEPOSIT);

        address memberC = address(0x20007);
        _fund(memberC);

        uint256 sharesPre = manager.getMutual(mutualId).totalShares;

        ICM.CommitmentParams memory p;
        p.arbiter = ARBITER;
        p.counterparty = BENEFICIARY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = amount;
        p.maxPenaltyBps = 5_000; // concrete ⇒ E_i == amount / 2, linear
        p.challengeWindow = COMMIT_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(memberC);
        uint256 cidC = manager.joinMutual(mutualId, p);

        uint256 sharesPost = manager.getMutual(mutualId).totalShares;
        uint256 expectedEi = (amount * 5_000) / 10_000; // the member's totalShares weight

        ICM.Membership memory mc = manager.getMembership(cidC);
        assert(mc.forfeitableUnits == expectedEi); // membership records the exact E_i
        assert(sharesPost - sharesPre == mc.forfeitableUnits); // INV-G3 delta: shares grew by exactly that
    }

    // =========================================================================
    // P2-MONO (premium half): premium index Π monotone non-decreasing (ERC §S6)
    // =========================================================================

    /// @notice P2-MONO (premium half, ERC-COMMITMENTS-MUTUALS §S6): the premium-per-cover index Π
    ///         (`premiumPerShareStored`) never decreases across a `fundMutualPremium` + time-warp. Π
    ///         only accumulates in `_pokePremium` (`premiumPerShareStored += mulDiv(gross, 1e27, cover)`,
    ///         a non-negative delta) and is never written down. We fund a stream with a SYMBOLIC amount
    ///         and duration, warp forward, poke the index (via a second guard-compliant fund that can
    ///         only maintain/raise the rate — the S6 live-stream guard), and assert Π is non-decreasing
    ///         at every observation.
    /// @dev BOUND: `amount1 ∈ [activeCover, 1_000e18]` and CONCRETE `duration == 1 days` so the first
    ///      `rewardRate == amount1 / duration` is exact and the S6 rate-non-decrease guard on the second
    ///      fund is satisfiable. `activeCover == 2 * E_i == 400e18` from the two setUp members. The
    ///      second fund reuses the same amount so `newRate >= rate` holds (PremiumRateDecreased guard).
    function check_P2MONO_premiumIndexNonDecreasing(uint256 amount1) public {
        // Fund at least enough that rewardRate >= 1 wei/sec over a 1-day stream; bound under the cap.
        vm.assume(amount1 >= 1 days && amount1 <= 1_000e18);

        uint64 duration = 1 days;

        // ---- Observation 0: index before any funding (Π == 0).
        (uint256 pi0,,,,,,,,) = manager.getMutualPremiumState(mutualId);

        // First fund: starts the stream. rewardRate == amount1 / duration.
        vm.prank(FUNDER);
        manager.fundMutualPremium(mutualId, amount1, duration);

        // ---- Observation 1: right after funding (poke ran; Π may have advanced by lastUpdate delta 0).
        (uint256 pi1,,,,,,,,) = manager.getMutualPremiumState(mutualId);
        assert(pi1 >= pi0); // P2-MONO

        // Advance time inside the stream window so accrual is non-trivial, then poke via a second fund
        // that MAINTAINS the rate (same amount over the same forward-shifted window ⇒ newRate >= rate,
        // satisfying the S6 live-stream guard). fundMutualPremium calls `_pokePremium`, advancing Π.
        vm.warp(block.timestamp + 12 hours);
        vm.prank(FUNDER);
        manager.fundMutualPremium(mutualId, amount1, duration);

        // ---- Observation 2: after the warp + poke, Π has accrued and never decreased.
        (uint256 pi2,,,,,,,,) = manager.getMutualPremiumState(mutualId);
        assert(pi2 >= pi1); // P2-MONO across the funding/warp/poke sequence
    }
}
