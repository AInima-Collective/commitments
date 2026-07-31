// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";
import {MockBandValuationAdapter} from "../mocks/MockBandValuationAdapter.sol";

/// @title HeterogeneousPremiumTest
/// @notice INV-P11..P14 of the heterogeneous Mutual mode, asserted as CHECKED
///         properties. Heterogeneous mode decouples the PREMIUM (reward) denominator from the loss
///         denominator: `premiumWeight` is derived from a manipulation-resistant band adapter,
///         band-clamped to `[floor,ceil]*value/1e4` (ceil <= 1e4 so no inflation), then haircut, and
///         is permissionlessly DOWN-ONLY re-markable. A subordinate "junior" shortfall absorber is
///         funded by a split of every premium receipt and drawn at settle to top up the beneficiary's
///         recovery. The loss legs (Lambda / owed / forfeitTransfer) are byte-for-byte the audited homogeneous-v1
///         path; these tests prove the heterogeneous reward machinery never reaches into them.
///
///         INV-P11 — remark keeps `premiumWeight` within `[floor,ceil]*adapterValue` and is monotone
///                   non-increasing across repeated remarks (a raise is a no-op floored at current);
///                   `ceil > 1e4` (and the other config bounds) are rejected at configure.
///         INV-P12 — remark REVERTS while a loss is pending and provably leaves every loss-side field
///                   (creditedValue / E_i / totalShares / lossSnapshot / cumulativeLoss) unchanged; a
///                   malicious remarker can neither wedge nor reduce a legitimate claim.
///         INV-P13 — the junior pool is funded-drawn; the settle-time draw is `<= pool` and
///                   FAILURE-ISOLATED (settle completes and the loss legs execute even on an empty /
///                   clamped pool); junior capital never enters `activeCover`/`totalShares`/`Pi`; a
///                   residual shortfall beyond the pool simply falls to the beneficiary (subordination).
///         INV-P14 — `effCover <= (1-haircut)/1e4 * bandWeight`; a haircut or a depreciating remark only
///                   ever REDUCES effCover and never the loss-side recovery.
///         INV-P9' — heterogeneous mutuals keep the running-delta identity `activeCover == Σ effCover`
///                   exact even though `premiumWeight != creditedValue`, while the homogeneous
///                   `activeCover == totalShares − settledTotal` identity is (correctly) NOT asserted.
contract HeterogeneousPremiumTest is Test {
    CommitmentManager internal manager;
    MockERC20 internal token; // mutual numeraire (also the member collateral in most tests)
    MockERC20 internal other; // a distinct heterogeneous collateral
    MockBandValuationAdapter internal band;

    address internal admin = makeAddr("admin");
    address internal arbiter = makeAddr("mutualArbiter");
    address internal beneficiary = makeAddr("beneficiary");
    address internal adapter = makeAddr("adapter");
    address internal policyholder = makeAddr("policyholder");

    address internal va; // valuationAuthority
    uint256 internal vaKey;

    address internal u1 = makeAddr("u1");
    address internal u2 = makeAddr("u2");

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint64 internal constant MEMBER_WINDOW = 1 days;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    /// @dev Member commitment ids of the mutual under test (for the Σ effCover walk).
    uint256[] internal gCids;

    function setUp() public {
        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(address(impl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days)))
            )
        );
        token = new MockERC20("Numeraire", "NUM", 18);
        other = new MockERC20("Other", "OTH", 18);
        band = new MockBandValuationAdapter();
        band.setPrice(address(token), WAD); // par
        band.setPrice(address(other), WAD); // par

        (va, vaKey) = makeAddrAndKey("valuationAuthority");

        address[2] memory us = [u1, u2];
        for (uint256 i; i < us.length; i++) {
            token.mint(us[i], 1_000_000e18);
            other.mint(us[i], 1_000_000e18);
            vm.startPrank(us[i]);
            token.approve(address(manager), type(uint256).max);
            other.approve(address(manager), type(uint256).max);
            manager.deposit(address(token), 1_000_000e18);
            manager.deposit(address(other), 1_000_000e18);
            vm.stopPrank();
        }
        token.mint(policyholder, 1_000_000e18);
        vm.prank(policyholder);
        token.approve(address(manager), type(uint256).max);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev Create + configure + activate a heterogeneous mutual whose numeraire is `token`, with a
    ///      single-collateral haircut table `{collateral => haircutBps}`.
    function _createHetero(uint64 juniorBps, address collateral, uint64 haircutBps) internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            valuationAuthority: va,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);

        address[] memory cols = new address[](1);
        cols[0] = collateral;
        uint64[] memory hc = new uint64[](1);
        hc[0] = haircutBps;
        ICM.HeteroConfig memory cfg = ICM.HeteroConfig({
            bandAdapter: address(band),
            valuationFloorBps: 0,
            valuationCeilBps: uint64(BPS), // par ceiling: no inflation above adapter value
            juniorBps: juniorBps,
            collaterals: cols,
            haircutBps: hc
        });
        vm.prank(va);
        manager.configureHeterogeneous(gid, cfg);
        vm.prank(arbiter);
        manager.activateMutual(gid);
    }

    function _attestation(uint256 gid, address committer, address tok, uint256 ei, uint128 credited, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 inner = keccak256(
            abi.encode("MutualValuation", block.chainid, address(manager), gid, committer, tok, ei, credited, deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vaKey, MessageHashUtils.toEthSignedMessageHash(inner));
        return abi.encode(deadline, abi.encodePacked(r, s, v));
    }

    /// @dev Join `who` to heterogeneous `gid` posting `collateral`; attests creditedValue == E_i so the
    ///      loss denominator (totalShares) equals E_i while `premiumWeight` is the band+haircut weight.
    function _joinHetero(uint256 gid, address who, address collateral, uint256 amount, uint16 bps)
        internal
        returns (uint256 cid)
    {
        uint256 ei = (amount * bps) / BPS;
        uint128 credited = uint128(ei);
        uint256 deadline = block.timestamp + 365 days;
        bytes memory att = _attestation(gid, who, collateral, ei, credited, deadline);

        ICM.CommitmentParams memory p;
        p.arbiter = arbiter;
        p.counterparty = beneficiary;
        p.token = collateral;
        p.adapter = adapter;
        p.amount = amount;
        p.maxPenaltyBps = bps;
        p.challengeWindow = MEMBER_WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p, credited, att);
        gCids.push(cid);
    }

    function _fund(uint256 gid, uint256 amount, uint64 duration) internal {
        vm.prank(policyholder);
        manager.fundMutualPremium(gid, amount, duration);
    }

    function _declareAndExecute(uint256 gid, uint256 loss) internal {
        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, loss, bytes32("ev"));
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(gid);
    }

    function _activeCover(uint256 g) internal view returns (uint128 r) {
        (, r,,,,,,,) = manager.getMutualPremiumState(g);
    }

    function _settledTotal(uint256 g) internal view returns (uint256 r) {
        (,, r,,,,,,) = manager.getMutualPremiumState(g);
    }

    function _premiumPool(uint256 g) internal view returns (uint256 r) {
        (,,,,,,,, r) = manager.getMutualPremiumState(g);
    }

    /// @dev effCover the contract way: premiumWeight·min(E_i−settled, c.amount)/E_i.
    function _effCover(uint256 cid) internal view returns (uint256) {
        ICM.Membership memory m = manager.getMembership(cid);
        if (m.mutualId == 0 || m.forfeitableUnits == 0) return 0;
        uint256 deliverable = m.forfeitableUnits - m.settledUnits;
        uint256 amt = manager.getCommitment(cid).amount;
        if (amt < deliverable) deliverable = amt;
        return Math.mulDiv(m.premiumWeight, deliverable, m.forfeitableUnits);
    }

    /// @dev INV-P9' (heterogeneous): the running-delta identity `activeCover == Σ effCover` stays exact
    ///      across every op, while the homogeneous `activeCover == totalShares − settledTotal` identity
    ///      is NOT asserted (premiumWeight != creditedValue breaks it by design).
    function _assertP9prime(uint256 gid) internal view {
        uint256 sumEff;
        for (uint256 i; i < gCids.length; i++) {
            uint256 cid = gCids[i];
            ICM.Membership memory m = manager.getMembership(cid);
            if (m.mutualId != gid) continue;
            assertLe(m.forfeitableUnits - m.settledUnits, manager.getCommitment(cid).amount, "P9': Belt-2 clamp inert");
            sumEff += _effCover(cid);
        }
        assertEq(uint256(_activeCover(gid)), sumEff, "INV-P9': activeCover == sum effCover");
    }

    // =========================================================================
    // INV-P11 — band bounds + monotone non-increasing remark
    // =========================================================================

    function test_invP11_joinWeightIsBandHaircut() public {
        uint256 gid = _createHetero(0, address(token), 1_000); // 10% haircut
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000); // E_i = 100e18

        // bandWeight = value(token, 100e18) = 100e18 (par, ceil 1e4); haircut 10% => 90e18.
        assertEq(manager.getMembership(c1).premiumWeight, 90e18, "premiumWeight == band+haircut");
        // The loss denominator is the attested creditedValue == E_i, distinct from premiumWeight.
        assertEq(manager.getMembership(c1).creditedValue, 100e18, "creditedValue == attested E_i");
        assertEq(uint256(_activeCover(gid)), 90e18, "activeCover == effCover == premiumWeight");
        _assertP9prime(gid);
    }

    function test_invP11_remarkMonotoneNonIncreasing() public {
        uint256 gid = _createHetero(0, address(token), 1_000); // 10% haircut
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000);
        uint128 w0 = manager.getMembership(c1).premiumWeight; // 90e18

        // (a) Depreciate 50%: band recomputes to 50e18, haircut => 45e18 < current => ratchets down.
        band.setPrice(address(token), WAD / 2);
        manager.remark(gid, c1);
        uint128 w1 = manager.getMembership(c1).premiumWeight;
        assertEq(w1, 45e18, "remark ratchets to band+haircut on depreciation");
        assertLt(w1, w0, "monotone: down");
        _assertP9prime(gid);

        // (b) APPRECIATE back to par: a remark that would RAISE the weight is a no-op floored at current.
        band.setPrice(address(token), WAD);
        manager.remark(gid, c1);
        uint128 w2 = manager.getMembership(c1).premiumWeight;
        assertEq(w2, w1, "INV-P11: remark never raises the weight (floored at current)");
        _assertP9prime(gid);

        // (c) Depreciate further: ratchets down again. Within band: weight <= ceil*value/1e4 == value.
        band.setPrice(address(token), WAD / 5); // 0.2
        manager.remark(gid, c1);
        uint128 w3 = manager.getMembership(c1).premiumWeight;
        assertEq(w3, 18e18, "20e18 band * 0.9 haircut");
        assertLe(w3, w2, "monotone: down");
        // INV-P11 band membership: weight is bounded above by the (un-haircut) band ceiling.
        uint256 bandHi = band.value(address(token), 100e18); // ceil 1e4 => == adapter value
        assertLe(uint256(w3), bandHi, "weight within [floor,ceil]*adapterValue");
        _assertP9prime(gid);
    }

    function test_invP11_configBoundsRejected() public {
        // ceil > 1e4 (inflation) rejected.
        _expectBadConfig(address(band), 0, uint64(BPS) + 1, 0, address(token), 0);
        // floor > ceil rejected.
        _expectBadConfig(address(band), 5_001, 5_000, 0, address(token), 0);
        // juniorBps > 1e4 rejected.
        _expectBadConfig(address(band), 0, uint64(BPS), uint64(BPS) + 1, address(token), 0);
        // per-collateral haircut > 1e4 rejected.
        _expectBadConfig(address(band), 0, uint64(BPS), 0, address(token), uint64(BPS) + 1);
        // zero adapter rejected.
        _expectBadConfig(address(0), 0, uint64(BPS), 0, address(token), 0);
    }

    function _expectBadConfig(
        address bandAdapter,
        uint64 floorBps,
        uint64 ceilBps,
        uint64 juniorBps,
        address collateral,
        uint64 haircutBps
    ) internal {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            valuationAuthority: va,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(p);
        address[] memory cols = new address[](1);
        cols[0] = collateral;
        uint64[] memory hc = new uint64[](1);
        hc[0] = haircutBps;
        ICM.HeteroConfig memory cfg = ICM.HeteroConfig({
            bandAdapter: bandAdapter,
            valuationFloorBps: floorBps,
            valuationCeilBps: ceilBps,
            juniorBps: juniorBps,
            collaterals: cols,
            haircutBps: hc
        });
        vm.prank(va);
        vm.expectRevert(ICM.InvalidHeteroConfig.selector);
        manager.configureHeterogeneous(gid, cfg);
    }

    function test_invP11_configImmutableAndAuthorityOnly() public {
        uint256 gid = _createHetero(0, address(token), 1_000);
        // Already configured (and activated) => MutualAlreadyConfigured / MutualAlreadyActive.
        ICM.HeteroConfig memory cfg = _parConfig();
        vm.prank(va);
        vm.expectRevert(); // active => MutualAlreadyActive (configured + active both true)
        manager.configureHeterogeneous(gid, cfg);

        // A homogeneous mutual (valuationAuthority == 0) can never be configured (authority check).
        ICM.MutualParams memory hp = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            valuationAuthority: address(0),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 hgid = manager.createMutual(hp);
        vm.prank(va);
        vm.expectRevert(ICM.NotValuationAuthority.selector);
        manager.configureHeterogeneous(hgid, cfg);
    }

    function _parConfig() internal view returns (ICM.HeteroConfig memory cfg) {
        address[] memory cols = new address[](1);
        cols[0] = address(token);
        uint64[] memory hc = new uint64[](1);
        hc[0] = 0;
        cfg = ICM.HeteroConfig({
            bandAdapter: address(band),
            valuationFloorBps: 0,
            valuationCeilBps: uint64(BPS),
            juniorBps: 0,
            collaterals: cols,
            haircutBps: hc
        });
    }

    // =========================================================================
    // INV-P12 — remark frozen during a loss; loss-side fields untouched; no claim wedge
    // =========================================================================

    function test_invP12_remarkRevertsDuringPendingLoss() public {
        uint256 gid = _createHetero(0, address(token), 1_000);
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000);

        vm.prank(arbiter);
        manager.initiateMutualLoss(gid, 10e18, bytes32(0));

        band.setPrice(address(token), WAD / 2);
        vm.expectRevert(ICM.MutualLossPending.selector);
        manager.remark(gid, c1);
    }

    function test_invP12_remarkLeavesLossSideUnchanged() public {
        uint256 gid = _createHetero(0, address(token), 1_000);
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000);

        ICM.Membership memory before = manager.getMembership(c1);
        ICM.Mutual memory gBefore = manager.getMutual(gid);

        band.setPrice(address(token), WAD / 4); // 0.25
        manager.remark(gid, c1);

        ICM.Membership memory afterM = manager.getMembership(c1);
        ICM.Mutual memory gAfter = manager.getMutual(gid);

        // ONLY premiumWeight (and the premium aggregates) may move. Every loss-side field is frozen.
        assertLt(afterM.premiumWeight, before.premiumWeight, "premiumWeight ratcheted down");
        assertEq(afterM.creditedValue, before.creditedValue, "INV-P12: creditedValue unchanged");
        assertEq(afterM.forfeitableUnits, before.forfeitableUnits, "INV-P12: E_i unchanged");
        assertEq(afterM.settledUnits, before.settledUnits, "INV-P12: settledUnits unchanged");
        assertEq(afterM.lossSnapshot, before.lossSnapshot, "INV-P12: lossSnapshot unchanged");
        assertEq(gAfter.totalShares, gBefore.totalShares, "INV-P12: totalShares unchanged");
        assertEq(gAfter.cumulativeLoss, gBefore.cumulativeLoss, "INV-P12: Lambda unchanged");
    }

    function test_invP12_maliciousRemarkCannotReduceLossRecovery() public {
        uint256 gid = _createHetero(0, address(token), 1_000);
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000);

        // An attacker depreciates the band to the floor and spams remark BEFORE the loss is declared.
        band.setPrice(address(token), 0); // zero band value
        manager.remark(gid, c1);
        manager.remark(gid, c1); // idempotent no-op at the floor
        assertEq(manager.getMembership(c1).premiumWeight, 0, "weight ratcheted to zero (premium side only)");

        // The loss recovery is wholly independent of the premium weight: owed == E_i * Lambda.
        uint256 benBefore = manager.freeBalance(address(token), beneficiary);
        _declareAndExecute(gid, 50e18); // totalShares 100e18 => Lambda 0.5e18
        assertEq(manager.pendingMemberLoss(c1), 50e18, "owed driven by E_i & totalShares, not premiumWeight");
        manager.settleMemberLoss(c1);
        assertEq(
            manager.freeBalance(address(token), beneficiary) - benBefore,
            50e18,
            "INV-P12: full loss recovery despite a malicious zero-remark"
        );
    }

    // =========================================================================
    // INV-P13 — junior absorber: funded-drawn, isolated from the premium denominator, failure-safe
    // =========================================================================

    function test_invP13_juniorSplitFundingAndDraw() public {
        uint256 gid = _createHetero(2_000, address(token), 1_000); // 20% junior split, 10% haircut
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000); // premiumWeight 90e18, activeCover 90e18
        assertEq(uint256(_activeCover(gid)), 90e18, "activeCover == effCover");

        // Fund 100e18: 20e18 -> junior pool, 80e18 -> premium stream. Junior never enters activeCover.
        _fund(gid, 100e18, 100);
        assertEq(manager.getMutualJuniorPool(gid), 20e18, "INV-P13: junior == juniorBps * received");
        assertEq(_premiumPool(gid), 80e18, "premium pool == remainder");
        assertEq(uint256(_activeCover(gid)), 90e18, "INV-P13: junior funding does not touch activeCover");

        // Full premium accrues over the window; then a 50% loss is declared.
        vm.warp(block.timestamp + 100);
        _declareAndExecute(gid, 50e18); // Lambda 0.5e18

        uint256 benBefore = manager.freeBalance(address(token), beneficiary);
        manager.settleMemberLoss(c1); // owed 50e18; junior draw = haircut*owed/1e4 = 10%*50e18 = 5e18

        // Beneficiary recovery = loss leg (50e18) + junior top-up (5e18).
        assertEq(manager.freeBalance(address(token), beneficiary) - benBefore, 55e18, "loss leg + junior top-up");
        assertEq(manager.getMutualJuniorPool(gid), 15e18, "junior pool drawn by exactly the top-up");
        _assertP9prime(gid);
        _assertPartition(gid);
    }

    function test_invP13_drawClampedToPool_residualToBeneficiary() public {
        // Small junior pool (5e18) against a large haircut top-up demand (25e18): the draw clamps to the
        // pool and the residual shortfall (un-topped-up) simply falls to the beneficiary (subordination).
        uint256 gid = _createHetero(500, address(token), 5_000); // 5% junior split, 50% haircut
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000); // premiumWeight 50e18

        _fund(gid, 100e18, 100); // junior 5e18, premium 95e18
        assertEq(manager.getMutualJuniorPool(gid), 5e18, "junior pool seeded small");
        vm.warp(block.timestamp + 100);

        _declareAndExecute(gid, 50e18); // Lambda 0.5e18 => owed 50e18
        uint256 benBefore = manager.freeBalance(address(token), beneficiary);
        manager.settleMemberLoss(c1); // demanded top-up = 50%*50e18 = 25e18, clamped to pool 5e18

        // Loss leg (50e18) + clamped junior draw (5e18); the other 20e18 of demand is the beneficiary's
        // subordinated shortfall (never minted from thin air). Settle did NOT revert.
        assertEq(manager.freeBalance(address(token), beneficiary) - benBefore, 55e18, "loss leg + clamped draw");
        assertEq(manager.getMutualJuniorPool(gid), 0, "junior pool fully drained by the clamp");
        _assertPartition(gid);
    }

    function test_invP13_emptyJuniorPoolSettleStillCompletes() public {
        // Heterogeneous mutual with a haircut but NO junior funding (juniorBps 0): a settle must apply the
        // loss leg and never revert on the absent pool (failure isolation).
        uint256 gid = _createHetero(0, address(token), 2_000);
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000);
        assertEq(manager.getMutualJuniorPool(gid), 0, "no junior pool");

        _declareAndExecute(gid, 50e18);
        uint256 benBefore = manager.freeBalance(address(token), beneficiary);
        manager.settleMemberLoss(c1); // must not revert; loss leg applies
        assertEq(manager.freeBalance(address(token), beneficiary) - benBefore, 50e18, "loss leg only (no junior)");
        assertEq(manager.getMembership(c1).settledUnits, 50e18, "loss leg applied, not bricked");
        assertEq(manager.getMutualJuniorPool(gid), 0, "junior pool stays empty");
    }

    // =========================================================================
    // INV-P14 — effCover bounded by the haircut; haircut/remark only reduces effCover, never recovery
    // =========================================================================

    function test_invP14_effCoverBoundedByHaircut() public {
        uint64 haircut = 2_500; // 25%
        uint256 gid = _createHetero(0, address(token), haircut);
        uint256 c1 = _joinHetero(gid, u1, address(token), 80e18, 10_000); // E_i = 80e18

        uint256 bandWeight = band.value(address(token), 80e18); // 80e18
        uint256 effCover = _effCover(c1);
        assertEq(
            effCover, (bandWeight * (BPS - haircut)) / BPS, "effCover == (1-haircut) * bandWeight (full deliverable)"
        );
        assertLe(effCover, (bandWeight * (BPS - haircut)) / BPS, "INV-P14: effCover <= (1-haircut)/1e4 * bandWeight");
    }

    function test_invP14_remarkReducesEffCoverNotRecovery() public {
        // Two identical mutuals; one member gets a depreciating remark, the other does not. The remarked
        // member's effCover is strictly smaller, yet its loss recovery (owed at settle) is identical.
        uint256 gA = _createHetero(0, address(token), 1_000);
        uint256 cA = _joinHetero(gA, u1, address(token), 100e18, 10_000);
        uint256 effA_before = _effCover(cA);

        band.setPrice(address(token), WAD / 2);
        manager.remark(gA, cA);
        band.setPrice(address(token), WAD); // restore for mutual B's join at par
        uint256 effA_after = _effCover(cA);
        assertLt(effA_after, effA_before, "INV-P14: depreciating remark reduces effCover");

        delete gCids;
        uint256 gB = _createHetero(0, address(token), 1_000);
        uint256 cB = _joinHetero(gB, u2, address(token), 100e18, 10_000); // not remarked
        assertGt(_effCover(cB), effA_after, "control member keeps the larger effCover");

        // Loss recovery is identical: both owe E_i * Lambda regardless of the premium weight.
        _declareAndExecute(gA, 50e18);
        _declareAndExecute(gB, 50e18);
        assertEq(
            manager.pendingMemberLoss(cA), manager.pendingMemberLoss(cB), "INV-P14: recovery independent of remark"
        );
        assertEq(manager.pendingMemberLoss(cA), 50e18, "owed == E_i * Lambda");
    }

    // =========================================================================
    // INV-P9' — heterogeneous running-delta identity holds; homogeneous identity does NOT
    // =========================================================================

    function test_invP9prime_runningDeltaExactAcrossOps() public {
        uint256 gid = _createHetero(1_500, address(token), 1_000); // junior 15%, haircut 10%
        uint256 c1 = _joinHetero(gid, u1, address(token), 100e18, 10_000); // weight 90e18
        _assertP9prime(gid);
        uint256 c2 = _joinHetero(gid, u2, address(token), 100e18, 10_000); // weight 90e18
        _assertP9prime(gid);

        // Demonstrate the homogeneous identity is BROKEN here (premiumWeight != creditedValue).
        uint256 totalShares = manager.getMutual(gid).totalShares; // 200e18 (attested E_i)
        assertEq(uint256(_activeCover(gid)), 180e18, "activeCover == sum effCover (haircut)");
        assertTrue(
            uint256(_activeCover(gid)) != totalShares - _settledTotal(gid), "homogeneous identity intentionally broken"
        );

        _fund(gid, 100e18, 100);
        _assertP9prime(gid);
        vm.warp(block.timestamp + 50);
        manager.claimMemberPremium(c1);
        _assertP9prime(gid);

        _declareAndExecute(gid, 100e18); // totalShares 200e18 => Lambda 0.5e18
        manager.settleMemberLoss(c1); // owed 50e18
        _assertP9prime(gid);
        manager.settleMemberLoss(c2);
        _assertP9prime(gid);

        // A depreciating remark mid-life: still exact.
        band.setPrice(address(token), WAD / 2);
        manager.remark(gid, c1);
        _assertP9prime(gid);

        // Exit + release: removes a member from activeCover; still exact.
        vm.prank(u1);
        manager.requestMutualExit(c1);
        _assertP9prime(gid);
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.releaseMutualMember(c1);
        _assertP9prime(gid);
        _assertPartition(gid);
    }

    // =========================================================================
    // Funding gate — allowed for a CONFIGURED hetero mutual; reverts for attested-unconfigured
    // =========================================================================

    function test_fundAllowedForConfiguredHetero() public {
        uint256 gid = _createHetero(2_000, address(token), 1_000);
        _joinHetero(gid, u1, address(token), 100e18, 10_000);
        _fund(gid, 100e18, 100); // must NOT revert
        assertEq(manager.getMutualJuniorPool(gid), 20e18, "junior funded");
        assertEq(_premiumPool(gid), 80e18, "premium funded");
    }

    function test_fundRevertsForAttestedUnconfigured() public {
        // valuationAuthority set, but configureHeterogeneous NEVER called => bandAdapter == 0 => the homogeneous-only
        // fence still closes the premium money path (HeterogeneousPremiumUnsupported).
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            valuationAuthority: va,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);

        uint256 ei = 100e18;
        uint128 credited = uint128(ei);
        uint256 deadline = block.timestamp + 365 days;
        bytes memory att = _attestation(gid, u1, address(token), ei, credited, deadline);
        ICM.CommitmentParams memory cp;
        cp.arbiter = arbiter;
        cp.counterparty = beneficiary;
        cp.token = address(token);
        cp.adapter = adapter;
        cp.amount = 100e18;
        cp.maxPenaltyBps = 10_000;
        cp.challengeWindow = MEMBER_WINDOW;
        cp.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        manager.joinMutual(gid, cp, credited, att);

        vm.prank(policyholder);
        vm.expectRevert(ICM.HeterogeneousPremiumUnsupported.selector);
        manager.fundMutualPremium(gid, 100e18, 100);
    }

    // =========================================================================
    // Homogeneous regression — remark forbidden; junior/haircut machinery absent
    // =========================================================================

    function test_homogeneousRemarkReverts() public {
        // A homogeneous mutual has bandAdapter == 0 => remark reverts NotHeterogeneous and there is no
        // junior pool (the homogeneous hot path is byte-for-byte unchanged).
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: arbiter,
            numeraire: address(token),
            beneficiary: beneficiary,
            valuationAuthority: address(0),
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        uint256 gid = manager.createMutual(p);
        vm.prank(arbiter);
        manager.activateMutual(gid);

        ICM.CommitmentParams memory cp;
        cp.arbiter = arbiter;
        cp.counterparty = beneficiary;
        cp.token = address(token);
        cp.adapter = adapter;
        cp.amount = 100e18;
        cp.maxPenaltyBps = 10_000;
        cp.challengeWindow = MEMBER_WINDOW;
        cp.strategies = new StrategyBinding[](0);
        vm.prank(u1);
        uint256 c1 = manager.joinMutual(gid, cp, 0, "");

        // premiumWeight == creditedValue == E_i exactly (homogeneous mode).
        ICM.Membership memory m = manager.getMembership(c1);
        assertEq(m.premiumWeight, m.creditedValue, "homogeneous: premiumWeight == creditedValue");

        vm.expectRevert(ICM.NotHeterogeneous.selector);
        manager.remark(gid, c1);
        assertEq(manager.getMutualJuniorPool(gid), 0, "homogeneous: no junior pool");
    }

    // =========================================================================
    // Partition (INV-P1/P13) cross-check on the single-numeraire scenarios
    // =========================================================================

    /// @dev 5-compartment partition on `token`: free + enc + esc + premium pool + junior pool == balance.
    function _assertPartition(uint256 gid) internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(token));
        assertEq(
            free + enc + esc + _premiumPool(gid) + manager.getMutualJuniorPool(gid),
            token.balanceOf(address(manager)),
            "INV-P1/P13: 5-compartment partition closes"
        );
    }
}
