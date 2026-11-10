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
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {OptimisticInsuranceArbiter} from "src/periphery/arbiters/OptimisticInsuranceArbiter.sol";
import {ERC8004IdentityRegistryDev} from "src/periphery/agents/ERC8004IdentityRegistryDev.sol";
import {IERC8004IdentityRegistry} from "src/vendor/erc8004/interfaces/IERC8004IdentityRegistry.sol";
import {MockERC20} from "../../helpers/MockERC20.sol";

/// @title AgentBondTest
/// @notice End-to-end walk of the agent-accountability-bond use case
///         (docs/protocol/use-cases/agent-bonds.md): an AI agent with an ERC-8004
///         identity posts a slashable, YIELD-BEARING bond (CommitmentsVault shares)
///         behind an off-chain SLA whose terms live in `metadataURI`/`metadataHash`.
///         Disputes resolve through the OptimisticInsuranceArbiter's bond game —
///         no committee, no oracle.
///
///         Happy path: the SLA term passes claim-free; the agent unbonds through the
///         manager's unbonding period and exits with its principal PLUS the vault
///         yield that accrued while the shares sat encumbered.
///
///         Breach path: a user opens a bonded claim, the agent counter-asserts 0,
///         the user escalates; the top-of-stack answer wins by timeout, the manager
///         forfeit executes after the challenge window, and the user is paid the
///         agent's shares (pull-payment into free balance) plus the winner's share
///         of the agent's losing dispute bond.
contract AgentBondTest is Test {
    CommitmentManager internal manager;
    CommitmentsVault internal vault;
    ERC4626Adapter internal adapter;
    OptimisticInsuranceArbiter internal arbiter;
    IERC8004IdentityRegistry internal registry;
    MockERC20 internal usdc;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent"); // the AI agent's controlling account
    address internal user = makeAddr("user"); // service consumer, bond counterparty
    address internal treasury = makeAddr("treasury");
    address internal feePayer = makeAddr("feePayer"); // stand-in source of vault yield

    uint64 internal constant UNBONDING = 7 days;
    uint64 internal constant ANSWER_TIMEOUT = 1 days;
    uint64 internal constant CHALLENGE_WINDOW = 2 days; // must be >= ANSWER_TIMEOUT
    uint256 internal constant MIN_BOND = 10e6; // 10 USDC flat claim bond

    uint256 internal constant AGENT_CAPITAL = 1_000e6; // 1,000 USDC
    uint256 internal constant VAULT_YIELD = 100e6; // +10% NAV over the term

    // The SLA the agent commits to. On-chain the commitment carries only the URI and
    // this content hash; watchers and the arbiter's claim game price breaches off-chain.
    string internal constant SLA_JSON =
        '{"type":"agent-sla.v1","service":"intent-execution","maxDrawdownBps":500,"responseBlocks":10}';

    uint256 internal agentId;
    uint256 internal bondShares;
    uint256 internal commitmentId;

    function setUp() public {
        // Custody root.
        manager = deployManager(admin, UNBONDING, 14 days);

        // Productive backing: idle-strategy vault over USDC, priced by the 4626 adapter.
        usdc = new MockERC20("USD Coin", "USDC", 6);
        CommitmentsVault vaultImpl = new CommitmentsVault();
        vault = CommitmentsVault(
            address(
                new ERC1967Proxy(
                    address(vaultImpl),
                    abi.encodeCall(
                        CommitmentsVault.initialize,
                        (IERC20(address(usdc)), "Commitments USDC", "cvUSDC", admin, address(0))
                    )
                )
            )
        );
        adapter = new ERC4626Adapter();

        // Optimistic claim game, bonded in USDC. 50/50 winner/treasury split.
        arbiter = new OptimisticInsuranceArbiter(
            address(manager), address(usdc), MIN_BOND, 0, ANSWER_TIMEOUT, 5_000, treasury
        );

        // ERC-8004 identity registry (canonical impl behind a dev proxy).
        ERC8004IdentityRegistryDev regImpl = new ERC8004IdentityRegistryDev();
        registry = IERC8004IdentityRegistry(
            address(
                new ERC1967Proxy(address(regImpl), abi.encodeCall(ERC8004IdentityRegistryDev.initializeDev, (admin)))
            )
        );

        usdc.mint(agent, AGENT_CAPITAL + 20e6); // capital + one dispute bond
        usdc.mint(user, 50e6); // claim bonds
        usdc.mint(feePayer, VAULT_YIELD);
    }

    function _partitionHolds() internal view {
        (uint256 free, uint256 enc, uint256 esc, uint256 mp) = manager.ledgerTotals(address(vault));
        assertEq(free + enc + esc + mp, vault.balanceOf(address(manager)), "INV-1 for the share token");
    }

    /// @dev Steps 1-3 shared by both paths: identity, productive backing, the bond itself.
    function _postBond() internal {
        // ---- 1. The agent registers its ERC-8004 identity. agentId is an ERC-721
        //         tokenId and starts at ZERO — resolve the agent via ownerOf, never
        //         by treating 0 as a sentinel. ----
        vm.prank(agent);
        agentId = registry.register("ipfs://agent-registration");
        assertEq(agentId, 0);
        assertEq(registry.ownerOf(agentId), agent);

        // ---- 2. Capital goes to work: USDC -> vault shares -> manager free balance. ----
        vm.startPrank(agent);
        usdc.approve(address(vault), AGENT_CAPITAL);
        bondShares = vault.deposit(AGENT_CAPITAL, agent);
        vault.approve(address(manager), bondShares);
        manager.deposit(address(vault), bondShares);
        vm.stopPrank();
        _partitionHolds();

        // ---- 3. The bond: fully slashable, SLA terms content-addressed on-chain. ----
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = user;
        p.token = address(vault);
        p.adapter = address(adapter);
        p.amount = bondShares;
        p.maxPenaltyBps = 10_000;
        p.challengeWindow = CHALLENGE_WINDOW;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "ipfs://agent-sla";
        p.metadataHash = keccak256(bytes(SLA_JSON));

        vm.prank(agent);
        commitmentId = manager.createCommitment(p);

        assertEq(manager.encumberedBalance(address(vault), agent), bondShares);
        assertEq(manager.getCommitment(commitmentId).metadataHash, keccak256(bytes(SLA_JSON)));
        _partitionHolds();
    }

    /// @dev The shares keep earning while encumbered: NAV-lifting donation into the vault.
    function _accrueYield() internal {
        vm.startPrank(feePayer);
        usdc.approve(address(vault), VAULT_YIELD);
        vault.donate(VAULT_YIELD);
        vm.stopPrank();
        // The adapter index (assets per 1e18 shares) rose with NAV — same shares, more USDC.
        assertGt(vault.convertToAssets(bondShares), AGENT_CAPITAL);
    }

    function test_happyPath_termEndsWithYield() public {
        _postBond();
        _accrueYield();

        // ---- SLA term ends claim-free: the agent unbonds through the manager's
        //      unbonding period (the arbiter keeps forfeit authority the whole way). ----
        vm.prank(agent);
        manager.requestUnbond(commitmentId);
        vm.warp(block.timestamp + UNBONDING + 1);
        manager.finalizeUnbond(commitmentId);

        assertEq(manager.freeBalance(address(vault), agent), bondShares);
        _partitionHolds();

        // ---- Exit: withdraw shares, redeem — principal + the yield earned WHILE bonded. ----
        vm.startPrank(agent);
        manager.withdraw(address(vault), bondShares);
        uint256 redeemed = vault.redeem(bondShares, agent, agent);
        vm.stopPrank();

        assertGt(redeemed, AGENT_CAPITAL, "bond exits with principal + yield");
        assertEq(usdc.balanceOf(agent), 20e6 + redeemed); // never spent its dispute reserve
        _partitionHolds();
    }

    function test_breachPath_optimisticClaimForfeitsBondToUser() public {
        _postBond();
        _accrueYield();

        // ---- 4. Breach: the user opens a bonded claim at 100%. This immediately opens
        //         the manager-side forfeit hold, so the agent cannot unbond/expire away. ----
        vm.startPrank(user);
        usdc.approve(address(arbiter), 50e6);
        uint256 claimId =
            arbiter.proposeClaim(commitmentId, 10_000, keccak256("evidence"), bytes32(0), uint128(MIN_BOND));
        vm.stopPrank();

        // Starting the unbond timer stays allowed (the arbiter retains authority through
        // the window), but the active hold blocks the exit itself: even after the full
        // unbonding period, finalizeUnbond reverts while the claim is pending.
        vm.prank(agent);
        manager.requestUnbond(commitmentId);
        vm.warp(block.timestamp + UNBONDING + 1);
        vm.expectRevert(ICM.UnbondBlockedByForfeit.selector);
        manager.finalizeUnbond(commitmentId);

        // ---- 5. Dispute war: the agent asserts "no breach" (0 bps) at 2x, the user
        //         re-asserts 100% at 4x. Top of stack: user @ 10_000. ----
        vm.startPrank(agent);
        usdc.approve(address(arbiter), 20e6);
        arbiter.disputeClaim(claimId, 0, keccak256("counter-evidence"), uint128(2 * MIN_BOND));
        vm.stopPrank();

        vm.prank(user);
        arbiter.disputeClaim(claimId, 10_000, keccak256("more-evidence"), uint128(4 * MIN_BOND));

        // ---- 6. Timeout resolution: nobody outbids for answerTimeout; then the manager
        //         challenge window (restarted at the last dispute) elapses and the forfeit
        //         executes. The user's payout lands as FREE share balance (pull-payment). ----
        vm.warp(block.timestamp + CHALLENGE_WINDOW + 1);
        arbiter.finalizeClaim(claimId);
        arbiter.executeClaim(claimId);

        assertTrue(manager.getCommitment(commitmentId).forfeited);
        assertEq(manager.forfeitedUnitsOf(commitmentId), bondShares);
        assertEq(manager.freeBalance(address(vault), user), bondShares);
        assertEq(manager.encumberedBalance(address(vault), agent), 0);
        _partitionHolds();

        // Bond game settles: the user's 10+40 USDC come back, the agent's losing 20 USDC
        // split 50/50 between the winning asserter and the treasury.
        assertEq(usdc.balanceOf(user), 50e6 + 10e6);
        assertEq(usdc.balanceOf(treasury), 10e6);

        // ---- 7. The user exits to underlying: shares -> withdraw -> redeem. The payout
        //         carries the accrued yield — slashed productive capital, not idle margin. ----
        vm.startPrank(user);
        manager.withdraw(address(vault), bondShares);
        uint256 redeemed = vault.redeem(bondShares, user, user);
        vm.stopPrank();
        assertGt(redeemed, AGENT_CAPITAL, "forfeit pays principal + accrued yield");
        _partitionHolds();
    }

    function test_falseClaim_deniedByTimeoutKeepsBondAlive() public {
        _postBond();

        // A false claim: the agent counter-asserts 0 and the claimant abandons.
        vm.startPrank(user);
        usdc.approve(address(arbiter), MIN_BOND);
        uint256 claimId = arbiter.proposeClaim(commitmentId, 10_000, keccak256("bogus"), bytes32(0), uint128(MIN_BOND));
        vm.stopPrank();

        vm.startPrank(agent);
        usdc.approve(address(arbiter), 2 * MIN_BOND);
        arbiter.disputeClaim(claimId, 0, keccak256("refutation"), uint128(2 * MIN_BOND));
        vm.stopPrank();

        vm.warp(block.timestamp + ANSWER_TIMEOUT + 1);
        arbiter.finalizeClaim(claimId);

        // Denied: the hold is cancelled, the commitment stays live, the agent keeps its
        // bond AND pockets the winner's share of the claimant's forfeited bond.
        assertFalse(manager.getCommitment(commitmentId).forfeited);
        assertEq(manager.encumberedBalance(address(vault), agent), bondShares);
        assertEq(usdc.balanceOf(agent), 20e6 + 5e6); // refunded 20 + 50% of the 10 claim bond
        _partitionHolds();
    }
}
