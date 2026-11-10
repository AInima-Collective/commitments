// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {deployManager} from "../../helpers/ManagerTestBase.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {ForfeitDonationBeneficiary} from "src/periphery/vaults/ForfeitDonationBeneficiary.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {OptimisticInsuranceArbiter} from "src/periphery/arbiters/OptimisticInsuranceArbiter.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";
import {MockStrategy} from "../../helpers/MockStrategy.sol";

/// @title AgentVaultManagerTest
/// @notice End-to-end walk of the agent-managed-vault pattern (the "restitution" half
///         of docs/protocol/use-cases/agent-bonds.md): an agent manages a vault's
///         strategy and bonds shares OF THAT VAULT behind a drawdown-floor SLA, with a
///         `ForfeitDonationBeneficiary` as counterparty. When the strategy loses money
///         (observable on-chain as a NAV drop), anyone opens a claim; the un-defended
///         claim times out, the bond forfeits to the beneficiary, and a permissionless
///         sweep redeems the agent's shares and donates the proceeds back into the
///         vault — every depositor's share value is restored by the agent's capital.
contract AgentVaultManagerTest is Test {
    CommitmentManager internal manager;
    CommitmentsVault internal vault;
    MockStrategy internal strategy;
    ForfeitDonationBeneficiary internal beneficiary;
    ERC4626Adapter internal adapter;
    OptimisticInsuranceArbiter internal arbiter;
    MockERC20 internal dai;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent"); // vault strategy manager, bond committer
    address internal alice = makeAddr("alice"); // protected depositor
    address internal bob = makeAddr("bob"); // protected depositor
    address internal watcher = makeAddr("watcher"); // permissionless claimant

    uint64 internal constant ANSWER_TIMEOUT = 1 days;
    uint64 internal constant CHALLENGE_WINDOW = 2 days;
    uint256 internal constant MIN_BOND = 10e18; // flat 10 DAI claim bond

    uint256 internal constant DEPOSIT = 10_000e18; // per depositor
    uint256 internal constant AGENT_SKIN = 2_000e18; // the agent's bonded capital
    uint256 internal constant STRATEGY_LOSS = 1_500e18; // the breach

    uint256 internal aliceShares;
    uint256 internal bobShares;
    uint256 internal bondShares;
    uint256 internal bondId;

    function setUp() public {
        manager = deployManager(admin, 7 days, 14 days);

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
        // The agent's live strategy — the thing whose performance the SLA covers.
        strategy = new MockStrategy(address(dai), address(vault));
        vm.prank(admin);
        vault.setYieldStrategy(address(strategy));

        adapter = new ERC4626Adapter();
        arbiter = new OptimisticInsuranceArbiter(
            address(manager), address(dai), MIN_BOND, 0, ANSWER_TIMEOUT, 10_000, address(0)
        );
        beneficiary = new ForfeitDonationBeneficiary(address(manager), address(vault), address(vault));

        dai.mint(alice, DEPOSIT);
        dai.mint(bob, DEPOSIT);
        dai.mint(agent, AGENT_SKIN);
        dai.mint(watcher, MIN_BOND);
    }

    function _depositAs(address who, uint256 assets) internal returns (uint256 shares) {
        vm.startPrank(who);
        dai.approve(address(vault), assets);
        shares = vault.deposit(assets, who);
        vm.stopPrank();
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(address(vault));
        assertEq(free + enc + esc + mp, vault.balanceOf(address(manager)), "INV-1 for the share token");
    }

    function test_restitutionLoop_slashedManagerMakesDepositorsWhole() public {
        // ---- 1. Depositors fund the agent-managed vault. ----
        aliceShares = _depositAs(alice, DEPOSIT);
        bobShares = _depositAs(bob, DEPOSIT);

        // ---- 2. The manager bonds shares OF ITS OWN VAULT behind the drawdown SLA,
        //         naming the depositors (via the beneficiary) as counterparty. ----
        bondShares = _depositAs(agent, AGENT_SKIN);
        vm.startPrank(agent);
        vault.approve(address(manager), bondShares);
        manager.deposit(address(vault), bondShares);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = address(beneficiary);
        p.token = address(vault);
        p.adapter = address(adapter);
        p.amount = bondShares;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = CHALLENGE_WINDOW;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "ipfs://agent-vault-sla";
        p.metadataHash = keccak256('{"type":"agent-sla.v1","maxDrawdownBps":500}');
        bondId = manager.createCommitment(p);
        vm.stopPrank();
        _partitionHolds();

        uint256 aliceValueBefore = vault.convertToAssets(aliceShares);
        assertEq(aliceValueBefore, DEPOSIT); // par NAV pre-breach

        // ---- 3. The breach: the agent's strategy loses money. The NAV drop is
        //         on-chain observable — exactly what the SLA's drawdown floor covers. ----
        strategy.simulateLoss(STRATEGY_LOSS);
        uint256 aliceValueAfterLoss = vault.convertToAssets(aliceShares);
        assertLt(aliceValueAfterLoss, aliceValueBefore);

        // ---- 4. Anyone opens the claim; the guilty agent doesn't dispute; the answer
        //         times out and the forfeit executes after the challenge window. ----
        vm.startPrank(watcher);
        dai.approve(address(arbiter), MIN_BOND);
        uint256 claimId = arbiter.proposeClaim(bondId, 10_000, keccak256("nav-breach"), bytes32(0), uint128(MIN_BOND));
        vm.stopPrank();

        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        arbiter.finalizeClaim(claimId);
        arbiter.executeClaim(claimId);

        assertTrue(manager.getCommitment(bondId).forfeited);
        assertEq(manager.freeBalance(address(vault), address(beneficiary)), bondShares);
        _partitionHolds();

        // ---- 5. Restitution: permissionless sweep redeems the agent's shares and
        //         donates the proceeds back — NAV per share rises for everyone left. ----
        uint256 donated = beneficiary.sweep();
        assertGt(donated, 0);
        assertEq(vault.balanceOf(address(beneficiary)), 0);
        assertEq(manager.freeBalance(address(vault), address(beneficiary)), 0);

        // The bond (2,000 DAI of agent capital) exceeds the depositors' share of the
        // 1,500 DAI loss, so alice and bob end up at least whole vs. pre-breach.
        assertGe(vault.convertToAssets(aliceShares), aliceValueBefore);
        assertGe(vault.convertToAssets(bobShares), DEPOSIT);
        // And the agent genuinely paid: its shares are gone, redeemed into the vault.
        assertEq(vault.balanceOf(agent), 0);
        _partitionHolds();
    }

    function test_falseClaim_agentDefendsAndVaultUnaffected() public {
        aliceShares = _depositAs(alice, DEPOSIT);
        bondShares = _depositAs(agent, AGENT_SKIN);
        vm.startPrank(agent);
        vault.approve(address(manager), bondShares);
        manager.deposit(address(vault), bondShares);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = address(beneficiary);
        p.token = address(vault);
        p.adapter = address(adapter);
        p.amount = bondShares;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = CHALLENGE_WINDOW;
        p.strategies = new StrategyBinding[](0);
        bondId = manager.createCommitment(p);
        vm.stopPrank();

        // No loss happened; a claim lands anyway. The agent counter-asserts 0.
        vm.startPrank(watcher);
        dai.approve(address(arbiter), MIN_BOND);
        uint256 claimId = arbiter.proposeClaim(bondId, 10_000, keccak256("bogus"), bytes32(0), uint128(MIN_BOND));
        vm.stopPrank();

        dai.mint(agent, 2 * MIN_BOND);
        vm.startPrank(agent);
        dai.approve(address(arbiter), 2 * MIN_BOND);
        arbiter.disputeClaim(claimId, 0, keccak256("nav-is-fine"), uint128(2 * MIN_BOND));
        vm.stopPrank();

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        // Claim denied: bond intact, vault untouched, winner-take-all pays the agent.
        assertFalse(manager.getCommitment(bondId).forfeited);
        assertEq(manager.encumberedBalance(address(vault), agent), bondShares);
        assertEq(vault.convertToAssets(aliceShares), DEPOSIT);
        assertEq(dai.balanceOf(agent), 2 * MIN_BOND + MIN_BOND); // refund + claimant's bond
        _partitionHolds();
    }
}
