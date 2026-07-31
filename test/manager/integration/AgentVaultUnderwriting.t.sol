// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {ForfeitDonationBeneficiary} from "src/periphery/vaults/ForfeitDonationBeneficiary.sol";
import {VaultCoverConduit} from "src/periphery/vaults/VaultCoverConduit.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";
import {LinkedMutualPolicy} from "src/extensions/mutuals/LinkedMutualPolicy.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";
import {SkimmingMockStrategy} from "../../helpers/SkimmingMockStrategy.sol";

/// @title AgentVaultUnderwritingTest
/// @notice End-to-end walk of the underwritten-vault pattern (the coverage-market successor to
///         the bilateral vault-manager bond in docs/protocol/use-cases/agent-bonds.md): an agent
///         runs a vault's strategy; underwriters (the agent first among them) join a
///         vault-share-numeraire mutual covering the vault's drawdown floor; a skim on realized
///         yield pays the agent a fixed operator fee and funds the underwriters' premium stream
///         through a keyless conduit — so every deposit is ambient-covered; a real drawdown
///         beyond the floor is declared as a mutual loss, marks the underwriters down pro-rata,
///         and the settlement is donated back into the vault, restoring NAV/share to the floor.
contract AgentVaultUnderwritingTest is Test {
    CommitmentManager internal manager;
    CommitmentsVault internal vault;
    SkimmingMockStrategy internal strategy;
    ForfeitDonationBeneficiary internal beneficiary;
    VaultCoverConduit internal conduit;
    ERC4626Adapter internal adapter;
    PremiumScheduler internal scheduler;
    LinkedMutualPolicy internal policy;
    OptimisticMutualArbiter internal arbiter;
    MockERC20 internal dai;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent"); // strategy operator + lead underwriter
    address internal carol = makeAddr("carol"); // third-party co-underwriter
    address internal alice = makeAddr("alice"); // protected depositor
    address internal bob = makeAddr("bob"); // protected depositor
    address internal watcher = makeAddr("watcher"); // permissionless loss proposer
    address internal committee = makeAddr("committee"); // mutual arbiter owner (veto authority)
    address internal treasury = makeAddr("treasury");
    address internal pricingOwner = makeAddr("pricingOwner");
    address internal yielder = makeAddr("yielder"); // funds backed yield

    uint64 internal constant MUTUAL_WINDOW = 2 days;
    uint256 internal constant MIN_BOND = 100e18;
    uint16 internal constant SKIM_BPS = 2_000; // 20% of new gains
    uint16 internal constant OP_FEE_BPS = 1_000; // 10% of the skim → agent
    uint16 internal constant MAX_DRAWDOWN_BPS = 500; // the peril floor

    uint256 internal constant DEPOSIT = 10_000e18; // per protected depositor
    uint256 internal constant AGENT_STAKE = 2_000e18; // agent's underwriting capital (DAI)
    uint256 internal constant CAROL_STAKE = 1_000e18;

    uint256 internal mutualId;
    uint256 internal agentCid;
    uint256 internal carolCid;
    uint256 internal aliceShares;
    uint256 internal bobShares;

    // Phase-spanning intermediates of the big loop test (kept in storage: stack depth).
    uint128 internal coverBefore;
    uint256 internal hwmAssets;
    uint256 internal floorAssets;
    uint256 internal aliceFloorValue;
    uint256 internal lossShares;

    function setUp() public {
        CommitmentManager cmImpl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(cmImpl), abi.encodeCall(CommitmentManager.initialize, (admin, 7 days, 14 days))
                )
            )
        );
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        CommitmentsVault vaultImpl = new CommitmentsVault();
        vault = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(vaultImpl),
                    abi.encodeCall(
                        CommitmentsVault.initialize,
                        (IERC20(address(dai)), "Agent Alpha DAI", "cvaDAI", admin, address(0))
                    )
                )
            )
        );
        adapter = new ERC4626Adapter();
        beneficiary = new ForfeitDonationBeneficiary(address(manager), address(vault), address(vault));

        scheduler = new PremiumScheduler(address(manager), pricingOwner);
        policy = new LinkedMutualPolicy(address(manager), address(scheduler));
        arbiter = new OptimisticMutualArbiter(address(manager), address(dai), MIN_BOND, treasury, committee);
        vm.startPrank(pricingOwner);
        scheduler.setPolicy(address(policy));
        scheduler.setDefaultCurve(0.02e18, 0.1e18, 0.5e18, 0.8e18, 50_000);
        vm.stopPrank();
        vm.prank(committee);
        arbiter.setCoverPolicy(address(policy));

        // The coverage market: numeraire = the vault's own shares; settlements pay the
        // restitution beneficiary, whose sweep donates back into the vault.
        mutualId = manager.createMutual(
            ICM.MutualParams({
                arbiter: address(arbiter),
                numeraire: address(vault),
                beneficiary: address(beneficiary),
                valuationAuthority: address(0),
                challengeWindow: MUTUAL_WINDOW,
                deallocationWindow: MUTUAL_WINDOW
            })
        );
        vm.prank(committee);
        arbiter.activate(mutualId);

        conduit = new VaultCoverConduit(address(vault), address(policy), mutualId, 30 days, 1e18);

        // The agent's fee-taking strategy, wired to the conduit; bound by the vault admin.
        strategy = new SkimmingMockStrategy(address(dai), address(vault), agent, address(conduit), SKIM_BPS, OP_FEE_BPS);
        vm.prank(admin);
        vault.setYieldStrategy(address(strategy));

        dai.mint(alice, DEPOSIT);
        dai.mint(bob, DEPOSIT);
        dai.mint(watcher, MIN_BOND);
        dai.mint(yielder, type(uint128).max);
        vm.prank(yielder);
        dai.approve(address(strategy), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _depositAs(address who, uint256 assets) internal returns (uint256 shares) {
        vm.startPrank(who);
        dai.approve(address(vault), assets);
        shares = vault.deposit(assets, who);
        vm.stopPrank();
    }

    /// @dev Underwriter path: DAI → shares → manager free balance → mutual membership.
    function _underwrite(address who, uint256 daiAmount) internal returns (uint256 cid) {
        dai.mint(who, daiAmount);
        uint256 shares = _depositAs(who, daiAmount);
        vm.startPrank(who);
        vault.approve(address(manager), shares);
        manager.deposit(address(vault), shares);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = address(beneficiary);
        p.token = address(vault);
        p.adapter = address(adapter);
        p.amount = shares;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = 1 days;
        p.strategies = new StrategyBinding[](0);
        cid = manager.joinMutual(mutualId, p, 0, "");
        vm.stopPrank();
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc) = manager.ledgerTotals(address(vault));
        (,,,,,,,, uint256 premiumPool) = manager.getMutualPremiumState(mutualId);
        uint256 juniorPool = manager.getMutualJuniorPool(mutualId);
        // INV-1 extended by the mutual pools: the share token's whole partition.
        assertEq(
            free + enc + esc + premiumPool + juniorPool, vault.balanceOf(address(manager)), "INV-1 for the share token"
        );
    }

    function _premiumState() internal view returns (uint128 activeCover, uint128 rate, uint64 finish) {
        (, activeCover,, rate,, finish,,,) = manager.getMutualPremiumState(mutualId);
    }

    // ---------------------------------------------------------------------
    // The full market loop
    // ---------------------------------------------------------------------

    function test_underwritingLoop_yieldPaysCover_breachRestoresNav() public {
        // ---- 1. Depositors fund the agent-managed vault; underwriters join the market. ----
        aliceShares = _depositAs(alice, DEPOSIT);
        bobShares = _depositAs(bob, DEPOSIT);
        agentCid = _underwrite(agent, AGENT_STAKE);
        carolCid = _underwrite(carol, CAROL_STAKE);
        _partitionHolds();

        (coverBefore,,) = _premiumState();
        assertGt(coverBefore, 0);

        // ---- 2. The strategy earns; the skim pays the operator fee and routes the premium. ----
        uint256 yieldAmount = (vault.totalAssets() * 200) / 10_000; // 2%
        vm.prank(yielder);
        strategy.simulateBackedYield(yieldAmount);

        (uint256 opFee, uint256 premiumShare) = strategy.skim();
        assertEq(opFee, (((yieldAmount * SKIM_BPS) / 10_000) * OP_FEE_BPS) / 10_000);
        assertEq(dai.balanceOf(agent), opFee); // the fixed-fee leg, in the agent's wallet
        assertEq(dai.balanceOf(address(conduit)), premiumShare);

        // ---- 3. Ambient cover: the conduit turns the premium share into a live stream. ----
        (uint256 premium, uint64 duration) = conduit.poke();
        assertGt(premium, 0);
        (, uint128 rate,) = _premiumState();
        assertGt(rate, 0);

        // ---- 4. Underwriters accrue pro-rata (agent staked 2x carol). ----
        vm.warp(block.timestamp + duration / 2);
        uint256 agentPending = manager.pendingMemberPremium(agentCid);
        uint256 carolPending = manager.pendingMemberPremium(carolCid);
        assertGt(agentPending, 0);
        assertApproxEqRel(agentPending, carolPending * 2, 1e15); // 2:1 stakes, 0.1% tolerance

        // ---- 5. The drawdown floor, measured against the post-skim high-water NAV. ----
        hwmAssets = vault.totalAssets();
        floorAssets = (hwmAssets * (10_000 - MAX_DRAWDOWN_BPS)) / 10_000;
        aliceFloorValue = (floorAssets * aliceShares) / vault.totalSupply();

        // ---- 6. The breach: an 8% strategy loss punches through the 5% floor. ----
        strategy.simulateLoss((hwmAssets * 800) / 10_000);
        uint256 assetsAfterLoss = vault.totalAssets();
        assertLt(assetsAfterLoss, floorAssets);
        assertLt(vault.convertToAssets(aliceShares), aliceFloorValue);

        // A skim is impossible under the mark — the loss must be socialized, not re-charged.
        vm.expectRevert(); // NothingToSkim
        strategy.skim();

        // ---- 7. Anyone declares the loss: shortfall below the floor, in shares. ----
        lossShares = vault.convertToShares(floorAssets - assetsAfterLoss);
        vm.startPrank(watcher);
        dai.approve(address(arbiter), MIN_BOND);
        arbiter.proposeLoss(mutualId, lossShares, keccak256("nav-breach"), MIN_BOND);
        vm.stopPrank();

        // ---- 8. Unvetoed after the window: Λ bumps; members settle to the beneficiary. ----
        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        manager.executeMutualLoss(mutualId);

        uint256 agentAmountBefore = manager.getCommitment(agentCid).amount;
        uint256[] memory ids = new uint256[](2);
        ids[0] = agentCid;
        ids[1] = carolCid;
        manager.settleMembers(ids);

        // Marked down pro-rata; commitments survive for future losses.
        uint256 agentAmountAfter = manager.getCommitment(agentCid).amount;
        assertLt(agentAmountAfter, agentAmountBefore);
        assertFalse(manager.getCommitment(agentCid).forfeited);
        (uint128 coverAfter,,) = _premiumState();
        assertLt(coverAfter, coverBefore);
        _partitionHolds();

        // ---- 9. Restitution: the beneficiary's sweep donates the settlement back. ----
        uint256 donated = beneficiary.sweep();
        assertGt(donated, 0);
        assertGe(vault.convertToAssets(aliceShares) + 1, aliceFloorValue); // NAV back to ≥ floor (±1 wei rounding)
        assertGe(vault.convertToAssets(bobShares) + 1, (floorAssets * bobShares) / (vault.totalSupply() + lossShares));
        _partitionHolds();

        // ---- 10. Aftermath: honest proposer reclaims; underwriters keep earned premium. ----
        vm.prank(watcher);
        arbiter.reclaimBond(mutualId);
        assertEq(dai.balanceOf(watcher), MIN_BOND);

        uint256 agentFreeBefore = manager.freeBalance(address(vault), agent);
        manager.claimMemberPremium(agentCid);
        manager.claimMemberPremium(carolCid);
        assertGt(manager.freeBalance(address(vault), agent), agentFreeBefore); // premium survived the loss
        _partitionHolds();
    }

    // ---------------------------------------------------------------------
    // False loss: vetoed, vault untouched
    // ---------------------------------------------------------------------

    function test_falseLoss_vetoed_vaultAndUnderwritersUntouched() public {
        aliceShares = _depositAs(alice, DEPOSIT);
        agentCid = _underwrite(agent, AGENT_STAKE);
        uint256 aliceValue = vault.convertToAssets(aliceShares);
        uint256 agentAmount = manager.getCommitment(agentCid).amount;

        // No drawdown happened; a bogus loss lands anyway.
        vm.startPrank(watcher);
        dai.approve(address(arbiter), MIN_BOND);
        arbiter.proposeLoss(mutualId, 100e18, keccak256("bogus"), MIN_BOND);
        vm.stopPrank();

        vm.prank(committee);
        arbiter.veto(mutualId);
        assertEq(dai.balanceOf(treasury), MIN_BOND); // proposer's bond slashed

        vm.warp(block.timestamp + MUTUAL_WINDOW + 1);
        vm.expectRevert(ICM.NoMutualLossPending.selector);
        manager.executeMutualLoss(mutualId);

        // Nothing moved: depositor NAV and the underwriter's stake are intact.
        assertEq(vault.convertToAssets(aliceShares), aliceValue);
        assertEq(manager.getCommitment(agentCid).amount, agentAmount);
        _partitionHolds();
    }
}
