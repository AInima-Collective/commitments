// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";
import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {FlatFeeAtCreate} from "src/distributions/FlatFeeAtCreate.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {ManualArbiter} from "src/periphery/arbiters/ManualArbiter.sol";
import {TwoTierArbiter} from "src/periphery/arbiters/TwoTierArbiter.sol";
import {AttestationArbiter} from "src/periphery/arbiters/AttestationArbiter.sol";
import {OptimisticInsuranceArbiter} from "src/periphery/arbiters/OptimisticInsuranceArbiter.sol";
import {ERC8004IdentityRegistryDev} from "src/periphery/agents/ERC8004IdentityRegistryDev.sol";
import {IERC8004IdentityRegistry} from "src/vendor/erc8004/interfaces/IERC8004IdentityRegistry.sol";
import {ForfeitDonationBeneficiary} from "src/periphery/vaults/ForfeitDonationBeneficiary.sol";
import {MutualRegistry} from "src/extensions/mutuals/MutualRegistry.sol";
import {OptimisticMutualArbiter} from "src/extensions/mutuals/OptimisticMutualArbiter.sol";
import {ClaimRouter} from "src/extensions/mutuals/ClaimRouter.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";
import {LinkedMutualPolicy} from "src/extensions/mutuals/LinkedMutualPolicy.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {Outflow} from "src/extensions/mesh/interfaces/IFanOut.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {GovernorFactory} from "src/periphery/governance/GovernorFactory.sol";
import {TokenWeightingVotesShim} from "src/periphery/governance/TokenWeightingVotesShim.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";
import {VaultCoverConduit} from "src/periphery/vaults/VaultCoverConduit.sol";
import {MockERC20} from "../test/helpers/MockERC20.sol";
import {MockERC20Permit} from "../test/helpers/MockERC20Permit.sol";
import {SkimmingMockStrategy} from "../test/helpers/SkimmingMockStrategy.sol";

/// @title Simulate
/// @notice Deploys the full v2 Commitments Protocol stack on Anvil and seeds it with
///         realistic test data: funded accounts, vault-share-backed manager deposits,
///         commitments with distribution strategies, registered operators, delegations,
///         agreements, mesh topology, service middleware, mutuals, and governance.
///
/// @dev v2 topology: ONE token-agnostic direct-custody CommitmentManager replaces the
///      per-vault managers of v1. CommitmentsVault is now a clean yield-bearing
///      ERC-4626, and its SHARES are the canonical backing: depositors funnel USDC/WETH
///      THROUGH the vaults into cvUSDC/cvWETH shares, which the manager custodies and
///      prices via ERC4626Adapter. Commitments, operator stake, delegations, agreements,
///      and mutual lines are all backed by these locked, still-earning shares.
///      ERC20StaticAdapter remains deployed for reference but the seed no longer routes
///      backing through it. Strategy fees, insurance bonds, and reward pools are still
///      paid in the raw asset (USDC).
///
///      Configure scenarios via environment variables:
///
///      NUM_DEPOSITORS      — number of depositor accounts to fund (default: 5)
///      NUM_OPERATORS       — number of operators to register (default: 3)
///      NUM_COMMITMENTS     — commitments per depositor (default: 2)
///      NUM_AGREEMENTS   — bilateral agreements to create (default: 2)
///      DEPOSIT_AMOUNT      — tokens per depositor in whole units (default: 10000)
///      MIN_OPERATOR_STAKE  — minimum operator stake in whole units (default: 500)
///      UNBONDING_PERIOD    — manager unbonding seconds (default: 60)
///      CHALLENGE_WINDOW    — forfeit challenge seconds (default/minimum: 86400)
///
///      Anvil defaults:
///        RPC_URL = http://127.0.0.1:8545
///        Wallets derived from mnemonic: "test test test test test test test test test test test junk"
///
/// Usage:
///   anvil &
///   forge script script/Simulate.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow
///
///   `--slow` is REQUIRED: TokenWeighting / governance use OZ Checkpoints whose state
///   depends on block.number advancing between txs. Batched broadcast collapses txs
///   into one block -> gas underestimates -> mid-script reverts. One tx per block.
contract Simulate is Script {
    // ─── Scenario config (env overridable) ───────────────────────────────────
    uint256 numDepositors;
    uint256 numOperators;
    uint256 numCommitments;
    uint256 numAgreements;
    uint256 depositAmount;
    uint256 ethDepositAmount;
    uint256 usdtDepositAmount;
    uint256 minOperatorStake;
    uint64 unbondingPeriod;
    uint64 challengeWindow;

    // ─── Deployed contracts ──────────────────────────────────────────────────
    // USDC is permit-enabled (ERC-2612) so the dashboard's raw-USDC backing
    // deposit exercises the one-tx `depositWithPermit` path; weth/usdt stay
    // plain to keep the two-tx approve → deposit flow demoable too.
    MockERC20Permit usdc;
    MockERC20 weth;
    MockERC20 usdt;
    VaultFactory vaultFactory;
    // Clean yield-bearing ERC-4626 vaults. The USDC vault's SHARES double as
    // appreciating backing inside the manager (ERC4626Adapter pricing) — donating
    // USDC to the vault lifts the share index, which IndexAppreciationYield then
    // routes to commitment counterparties as premium.
    CommitmentsVault usdcVault;
    CommitmentsVault wethVault;
    // cvUSDT: a third vault so the risk-coverage demo has a yield-bearing
    // stablecoin position to protect (the De-Peg mutual's policyholders hold
    // cvUSDT). Like the others it runs idle, with real donate-backed NAV.
    CommitmentsVault usdtVault;
    // NOTE: the plain vaults run idle (no yield strategy). NAV moves only through
    // donate() with real backing tokens (see _seedDistributableYield) — never a
    // fabricated reported-assets ledger. No MockStrategy is bound here; doing so
    // would mint fake NAV with no tokens behind it.
    // ONE direct-custody manager for ALL backing tokens (raw USDC, raw WETH, and
    // cvUSDC vault shares all live in the same per-(token, user) ledger).
    CommitmentManager manager;
    ERC20StaticAdapter erc20Adapter;
    ERC4626Adapter erc4626Adapter;
    IndexAppreciationYield indexYield;
    FlatFeeAtCreate flatFee;
    OperatorRegistry operatorRegistry;
    MeshFactory meshFactory;
    // Reference arbiter: owned by `arbiter.addr` (anvil account 1). Every
    // commitment/agreement in this seed names address(manualArbiter) as its
    // arbiter rather than arbiter.addr directly, so the registry's requiredArbiter
    // gate is exercised by a real contract and forfeit demos go through the arbiter
    // API (arbiter.addr -> manualArbiter.initiateForfeit -> manager.initiateForfeit).
    ManualArbiter manualArbiter;
    TwoTierArbiter twoTierArbiter;
    AttestationArbiter attestationArbiter;

    // ─── Marketplace pattern reference contracts ──────────────────────────────
    OptimisticInsuranceArbiter optimisticArbiter; // §5.2/§5.3 reality.eth-style

    // ─── ERC-8004 agent identity (agent-bond use case + issue #33) ────────────
    // Canonical IdentityRegistry implementation behind a dev bootstrap proxy —
    // production chains bind to the canonical 0x8004A169… deployment instead.
    // agentId is an ERC-721 tokenId and STARTS AT ZERO (never a "no agent"
    // sentinel); the seeded agent persona posts a fully-slashable cvUSDC bond
    // behind an SLA, arbitrated by the optimistic insurance arbiter.
    IERC8004IdentityRegistry agentIdentityRegistry;
    uint256 seededAgentId;
    uint256 agentBondCommitmentId;
    // Underwritten agent vault (the coverage-market pattern, use-cases/agent-bonds.md):
    // the agent runs cvaDAI's strategy through a fee-skimming wrapper; underwriters
    // (the agent first among them) join a cvaDAI-numeraire mutual covering the vault's
    // drawdown floor; the skim pays the agent a fixed operator fee and funds the
    // underwriters' premium stream via a keyless conduit — so every deposit is
    // ambient-covered. A proven breach marks the underwriters down and the mutual's
    // beneficiary (the ForfeitDonationBeneficiary) donates the settlement back into
    // the vault, restoring depositor NAV.
    MockERC20 dai;
    CommitmentsVault agentVault;
    SkimmingMockStrategy agentVaultStrategy;
    ForfeitDonationBeneficiary agentVaultBeneficiary;
    VaultCoverConduit vaultCoverConduit;
    // The cvaDAI market needs its own DAI-bonded arbiters: claim/loss bonds MUST be
    // denominated in the market's payout token (DAI, 18 decimals) — reusing the
    // USDC-bonded instances would misprice bond floors by 12 orders of magnitude.
    OptimisticInsuranceArbiter daiOptimisticArbiter;
    OptimisticMutualArbiter agentMutualArbiter;
    uint256 agentMutualId;

    // ─── Mutuals (risk coverage through shared-loss pools) ────────────────────
    // A MutualRegistry wraps manager Mutuals as pooled, shared-loss insurance
    // products; one shared OptimisticMutualArbiter (bonded loss-declaration,
    // claims keyed by mutualId) is the dispute model; the premium leg is the
    // PremiumScheduler (utilization-curve pricing) + LinkedMutualPolicy (binds
    // cover, pulls the premium, funds the core stream). The seed registers THREE
    // ACTIVE homogeneous (oracle-free, cvUSDC-numeraire) mutuals — each a distinct
    // peril — fills them with underwriters, and binds a live cover policy so a
    // premium stream is actually flowing to members on first load. Each mutual has
    // its own ClaimRouter beneficiary whose claimant is that peril's policyholder.
    // NB: the executed-loss flow is driven from the admin page (the 2-day mutual
    // challenge window can't elapse under --broadcast); see the admin Risk tab.
    MutualRegistry mutualRegistry;
    OptimisticMutualArbiter optimisticMutualArbiter;
    PremiumScheduler premiumScheduler;
    LinkedMutualPolicy mutualPolicy;
    // Per-peril beneficiaries (claimant = the peril's policyholder).
    ClaimRouter navClaimRouter;
    ClaimRouter depegClaimRouter;
    ClaimRouter slashingClaimRouter;
    // mutualId of each seeded peril.
    uint256 navMutualId;
    uint256 depegMutualId;
    uint256 slashingMutualId;

    // ─── service middleware ──────────────────────────────────────────────────────
    OperatorServiceRegistry stakeRegistry;

    // ─── Mesh nodes ──────────────────────────────────────────────────────────
    address fanInNode;
    address fanOutNode;
    address tokenWeightingNode;

    // ─── Governance (reference DAO) ───────────────────────────────────────────
    GovernorFactory governorFactory;
    CommitmentsGovernor governor;
    CommitmentsTimelock timelock;
    TokenWeightingVotesShim votesShim;
    uint256 seededGovernanceProposalId;

    /// @dev Voting window for user-created proposals after the bootstrap
    ///      `setVotingPeriod` proposal executes. With anvil's 2-second
    ///      interval mining (enabled in `just dev-up` after seeding), 30
    ///      blocks ≈ 60 seconds of votable Active state.
    uint32 constant USABLE_VOTING_PERIOD = 30;

    // ─── Seeded ids (tracked rather than recomputed — robust under config) ───
    uint256[] indexYieldCommitmentIds; // one per depositor (vault-share backed)
    uint256 flatFeeCommitmentId;
    uint256 contributionCommitmentId; // depositor 0's first raw commitment
    uint256 unbondCommitmentId; // depositor 0's vault-share commitment

    // ─── Wallets ────────────────────────────────────────────────────────────
    // Anvil's default mnemonic — keys are derived at m/44'/60'/0'/0/{index}, so
    // `vm.deriveKey(MNEMONIC, i)` matches the accounts MetaMask shows when users
    // import the mnemonic. Simulate's depositors map to real Anvil accounts.
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

    struct Wallet {
        address addr;
        uint256 key;
    }

    Wallet admin;
    Wallet arbiter;
    Wallet[] depositors;
    Wallet[] operators;
    Wallet agent; // the AI agent persona (ERC-8004 registered, posts the agent bond)

    function run() external {
        _loadConfig();
        _deriveWallets();
        _deploy();
        _seedVaultMetadata();
        _fundWallets();
        _createDeposits();
        // Read the pinned payloads before anything writes a metadataURI. See
        // the catalogue section for why this is a file handoff and not an
        // inline literal.
        _loadMetadata();
        _createCommitments();
        // Deploy + wire the mesh BEFORE operators register: register/delegate now
        // credit the mesh automatically via OperatorRegistry._meshOnIncrease, so the
        // wiring (and per-denom weights) must already be in place for power to flow.
        _deployMeshTopology();
        _registerOperators();
        _createAgreements();
        _deployServiceMiddleware();
        _seedServiceMetadata();
        _wireMeshConsumer();
        _registerOperatorsInMiddleware();
        _deployGovernance();
        _seedGovernanceProposal();
        _seedDistributableYield();
        _seedUnbondingState();
        _seedV2_5Surfaces();
        _deployMarketplacePatternContracts();
        _seedOptimisticClaim();
        _seedAgentBond();
        _seedMutuals();
        // After _seedMutuals: the underwriting market reuses the shared mutual
        // periphery (registry / scheduler / policy) deployed there.
        _seedAgentVaultUnderwriting();
        _printSummary();
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  CONFIG
    // ═════════════════════════════════════════════════════════════════════════

    function _loadConfig() internal {
        numDepositors = vm.envOr("NUM_DEPOSITORS", uint256(5));
        numOperators = vm.envOr("NUM_OPERATORS", uint256(3));
        numCommitments = vm.envOr("NUM_COMMITMENTS", uint256(2));
        numAgreements = vm.envOr("NUM_AGREEMENTS", uint256(2));
        depositAmount = vm.envOr("DEPOSIT_AMOUNT", uint256(10_000)) * 1e6; // USDC has 6 decimals
        // WETH funding per depositor; whole ether units, default 5.
        ethDepositAmount = vm.envOr("ETH_DEPOSIT_AMOUNT", uint256(5)) * 1e18;
        // USDT funding per depositor (6 decimals, like USDC). Backs the cvUSDT
        // vault depositors who buy De-Peg cover.
        usdtDepositAmount = vm.envOr("USDT_DEPOSIT_AMOUNT", uint256(10_000)) * 1e6;
        // Operator stake is denominated in the registry's requiredToken — now cvUSDC
        // vault shares (15 decimals: USDC's 6 + the vault's decimals offset of 9), so
        // the floor is expressed in share units (~1 cvUSDC ≈ 1 USDC at par NAV).
        minOperatorStake = vm.envOr("MIN_OPERATOR_STAKE", uint256(500)) * 1e15;
        // Keep local unbonding short enough to exercise its full lifecycle. The
        // forfeit challenge window remains conformant with the shipping manager's
        // hard one-day floor; override it only with a value at least as large.
        unbondingPeriod = uint64(vm.envOr("UNBONDING_PERIOD", uint256(60)));
        challengeWindow = uint64(vm.envOr("CHALLENGE_WINDOW", uint256(1 days)));

        require(numOperators <= numDepositors, "Simulate: need at least as many depositors as operators");
        require(numCommitments >= 1, "Simulate: NUM_COMMITMENTS must be >= 1");
        require(challengeWindow >= 1 days, "Simulate: CHALLENGE_WINDOW must be >= 86400");

        console.log("");
        console.log("=== Simulation Config (v2 direct-custody manager) ===");
        console.log("Depositors:      ", numDepositors);
        console.log("Operators:       ", numOperators);
        console.log("Commitments/user:", numCommitments);
        console.log("Agreements:   ", numAgreements);
        console.log("Deposit (USDC):  ", depositAmount / 1e6);
        console.log("Funding (WETH):  ", ethDepositAmount / 1e18);
        console.log("Min Op Stake:    ", minOperatorStake / 1e15);
        console.log("Unbonding (sec): ", uint256(unbondingPeriod));
        console.log("Challenge (sec): ", uint256(challengeWindow));
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  ACCOUNT DERIVATION
    // ═════════════════════════════════════════════════════════════════════════

    function _deriveWallets() internal {
        // Index 0 = admin (Anvil's first pre-funded account)
        uint256 adminKey = vm.deriveKey(ANVIL_MNEMONIC, 0);
        admin = Wallet(vm.addr(adminKey), adminKey);

        // Index 1 = arbiter (independent third party)
        uint256 arbiterKey = vm.deriveKey(ANVIL_MNEMONIC, 1);
        arbiter = Wallet(vm.addr(arbiterKey), arbiterKey);

        // Indices 2..(2+numDepositors-1) = depositors — so account #2 in
        // MetaMask is "Depositor 0" with deposits, commitments, etc.
        for (uint256 i = 0; i < numDepositors; i++) {
            uint256 key = vm.deriveKey(ANVIL_MNEMONIC, uint32(2 + i));
            depositors.push(Wallet(vm.addr(key), key));
        }

        // First numOperators depositors double as operators
        for (uint256 i = 0; i < numOperators; i++) {
            operators.push(depositors[i]);
        }

        // Next index after the depositors = the AI agent persona.
        uint256 agentKey = vm.deriveKey(ANVIL_MNEMONIC, uint32(2 + numDepositors));
        agent = Wallet(vm.addr(agentKey), agentKey);

        console.log("Admin (account 0):  ", admin.addr);
        console.log("Arbiter (account 1):", arbiter.addr);
        console.log("Depositors:", numDepositors, "(accounts 2..N)");
        console.log("Agent persona:      ", agent.addr);
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  DEPLOYMENT
    // ═════════════════════════════════════════════════════════════════════════

    function _deploy() internal {
        vm.startBroadcast(admin.key);

        // 1. Mock tokens
        usdc = new MockERC20Permit("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdt = new MockERC20("Tether USD", "USDT", 6);
        console.log("USDC Token:         ", address(usdc));
        console.log("WETH Token:         ", address(weth));
        console.log("USDT Token:         ", address(usdt));

        // 2. Vaults — clean ERC-4626 (v2: instant exits, no encumbrance, no manager
        //    pointer). deployVault(asset, admin, strategy); we deploy them idle (no
        //    yield strategy). NAV rises only through donate() with real backing
        //    tokens (see _seedDistributableYield) — honest appreciation, not a
        //    fabricated reported-assets ledger.
        CommitmentsVault vaultImpl = new CommitmentsVault();
        vaultFactory = new VaultFactory(address(vaultImpl));
        usdcVault = CommitmentsVault(vaultFactory.deployVault(address(usdc), admin.addr, address(0)));
        wethVault = CommitmentsVault(vaultFactory.deployVault(address(weth), admin.addr, address(0)));
        usdtVault = CommitmentsVault(vaultFactory.deployVault(address(usdt), admin.addr, address(0)));

        console.log("CommitmentsVault (USDC):", address(usdcVault));
        console.log("CommitmentsVault (WETH):", address(wethVault));
        console.log("CommitmentsVault (USDT):", address(usdtVault));
        console.log("  (idle - NAV via donate() only)");

        // 3. THE CommitmentManager — one token-agnostic custody root for every
        //    backing token in this seed (raw USDC, raw WETH, cvUSDC shares).
        CommitmentManager cmImpl = new CommitmentManager();
        bytes memory cmInit = abi.encodeCall(CommitmentManager.initialize, (admin.addr, unbondingPeriod, 14 days));
        ERC1967Proxy cmProxy = new ERC1967Proxy(address(cmImpl), cmInit);
        manager = CommitmentManager(address(cmProxy));
        console.log("CommitmentManager:  ", address(manager));

        // 4. Backing adapters — stateless singletons. ERC20StaticAdapter prices
        //    plain tokens at a constant 1e18 index; ERC4626Adapter prices vault
        //    shares at convertToAssets(1e18) so the index appreciates with NAV.
        erc20Adapter = new ERC20StaticAdapter();
        erc4626Adapter = new ERC4626Adapter();
        console.log("ERC20StaticAdapter: ", address(erc20Adapter));
        console.log("ERC4626Adapter:     ", address(erc4626Adapter));

        // 5. Distribution strategies — bound to commitments at create time via
        //    StrategyBinding. One deployment per manager (hooks are manager-only).
        indexYield = new IndexAppreciationYield(address(manager));
        flatFee = new FlatFeeAtCreate(address(manager));
        console.log("IndexAppreciationYield:", address(indexYield));
        console.log("FlatFeeAtCreate:    ", address(flatFee));

        // 6. ManualArbiter — contract arbiter owned by arbiter.addr (anvil
        //    account 1). Forfeit/release demos go arbiter.addr -> manualArbiter.X
        //    -> manager.X.
        manualArbiter = new ManualArbiter(arbiter.addr, address(manager));
        console.log("ManualArbiter:      ", address(manualArbiter));

        // Two-tier reference court: account #1 is the fast primary controller;
        // account #0 is the final appeal controller. The 1h execution buffer
        // makes the required manager delay 25h, visibly separate from both
        // court deadlines.
        twoTierArbiter = new TwoTierArbiter(
            address(manager),
            arbiter.addr,
            admin.addr,
            1 days,
            1 days,
            1 hours,
            "ipfs://bafkreicourtdemopolicy000000000000000000000000000000000000",
            keccak256("commitments.demo.two-tier-policy.v1")
        );
        console.log("TwoTierArbiter:     ", address(twoTierArbiter));

        // 7. OperatorRegistry — single registry for the single manager. v2
        //    acceptance policy (7-arg initialize): commitments presented to
        //    register/delegate must name address(manualArbiter) as arbiter,
        //    carry maxPenaltyBps >= 10_000, be backed by cvUSDC vault SHARES (the
        //    requiredToken — stake quantities are denominated in it, so operators
        //    secure services with productive capital), and have NO bound
        //    distribution strategies (audit H-5). The mesh denom and its voting
        //    weight (set in _deployMeshTopology) follow this token.
        OperatorRegistry orImpl = new OperatorRegistry();
        bytes memory orInit = abi.encodeCall(
            OperatorRegistry.initialize,
            (
                address(manager),
                minOperatorStake,
                1024,
                admin.addr,
                address(manualArbiter),
                uint16(10_000),
                address(usdcVault)
            )
        );
        ERC1967Proxy orProxy = new ERC1967Proxy(address(orImpl), orInit);
        operatorRegistry = OperatorRegistry(address(orProxy));
        console.log("OperatorRegistry:   ", address(operatorRegistry));

        // 8. Wire the manager's delegation callbacks to the registry.
        manager.setOperatorRegistry(address(operatorRegistry));
        console.log("Wiring complete.");

        // 9. Mesh implementations + factory
        FanInNode fanInImpl = new FanInNode();
        FanOutNode fanOutImpl = new FanOutNode();
        TokenWeighting twImpl = new TokenWeighting();
        meshFactory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
        console.log("MeshFactory:        ", address(meshFactory));

        // 10. ERC-8004 Identity Registry — the vendored canonical implementation
        //     behind a dev bootstrap proxy (src/vendor/erc8004/README.md). Dev chains only;
        //     production consumers bind to the canonical registry address.
        ERC8004IdentityRegistryDev agentRegImpl = new ERC8004IdentityRegistryDev();
        ERC1967Proxy agentRegProxy = new ERC1967Proxy(
            address(agentRegImpl), abi.encodeCall(ERC8004IdentityRegistryDev.initializeDev, (admin.addr))
        );
        agentIdentityRegistry = IERC8004IdentityRegistry(address(agentRegProxy));
        console.log("ERC8004 IdentityRegistry:", address(agentIdentityRegistry));

        // 11. The agent-managed vault: cvaDAI over a fresh mock DAI (its own asset,
        //     so the factory's one-vault-per-asset rule keeps it factory-deployed and
        //     therefore indexer-discovered via VaultDeployed) plus the restitution
        //     beneficiary that donates mutual loss settlements back to the vault's
        //     depositors. The fee-skimming strategy the agent operates is deployed in
        //     _seedAgentVaultUnderwriting (it needs the coverage mutual's conduit);
        //     deposits before then sit idle and setYieldStrategy sweeps them in.
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        agentVault = CommitmentsVault(vaultFactory.deployVault(address(dai), admin.addr, address(0)));
        agentVaultBeneficiary =
            new ForfeitDonationBeneficiary(address(manager), address(agentVault), address(agentVault));
        console.log("DAI Token:          ", address(dai));
        console.log("CommitmentsVault (DAI, agent-managed):", address(agentVault));
        console.log("  restitution beneficiary:", address(agentVaultBeneficiary));

        vm.stopBroadcast();
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  VAULT METADATA
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Sets a `vault.v1` metadata sidecar on each deployed vault so the
    ///      indexer's `VaultMetadataUpdated` handler and the frontend's vault
    ///      list / detail surfaces have rendered titles, descriptions, and
    ///      tags on first sync. Admin holds `DEFAULT_ADMIN_ROLE` on both
    ///      vaults. The URIs are inline `data:application/json;base64,` so
    ///      the indexer resolves content directly without a gateway — same
    ///      pattern used for commitment / agreement / operator metadata.
    function _seedVaultMetadata() internal {
        console.log("--- Seeding vault metadata ---");

        vm.startBroadcast(admin.key);

        // Each payload trimmed to fit under the contract's 512-byte URI cap.
        string memory usdcJson = string.concat(
            '{"schemaVersion":"vault.v1",',
            '"name":"Commitments USDC Vault",',
            '"description":"Productive USDC backing protocol commitments.",',
            '"logoURI":"/assets/usdc.png",',
            '"tags":["demo","usdc"],',
            '"riskTier":"conservative",',
            '"curator":{"name":"Demo Labs","website":"https://example.com/"},',
            '"strategy":{"name":"Idle (USDC)",',
            '"summary":"No yield strategy; NAV moves only by donation."}}'
        );
        usdcVault.setMetadata(
            string.concat("data:application/json;base64,", Base64.encode(bytes(usdcJson))), keccak256(bytes(usdcJson))
        );
        console.log("  usdcVault: metadata set");

        string memory ethJson = string.concat(
            '{"schemaVersion":"vault.v1",',
            '"name":"Commitments WETH Vault",',
            '"description":"Wrapped ETH collateral.",',
            '"logoURI":"/assets/eth.png",',
            '"tags":["demo","weth"],',
            '"riskTier":"conservative",',
            '"curator":{"name":"Demo Labs","website":"https://example.com/"},',
            '"strategy":{"name":"Idle (WETH)",',
            '"summary":"No yield strategy; NAV moves only by donation."}}'
        );
        wethVault.setMetadata(
            string.concat("data:application/json;base64,", Base64.encode(bytes(ethJson))), keccak256(bytes(ethJson))
        );
        console.log("  wethVault: metadata set");

        string memory usdtJson = string.concat(
            '{"schemaVersion":"vault.v1",',
            '"name":"Commitments USDT Vault",',
            '"description":"Yield-bearing USDT savings.",',
            '"logoURI":"/assets/usdt.png",',
            '"tags":["demo","usdt"],',
            '"riskTier":"moderate",',
            '"curator":{"name":"Demo Labs","website":"https://example.com/"},',
            '"strategy":{"name":"Idle (USDT)",',
            '"summary":"No yield strategy; De-Peg cover available."}}'
        );
        usdtVault.setMetadata(
            string.concat("data:application/json;base64,", Base64.encode(bytes(usdtJson))), keccak256(bytes(usdtJson))
        );
        console.log("  usdtVault: metadata set");

        vm.stopBroadcast();
        console.log("");
    }

    /// @dev Sets a `service.v1` metadata sidecar on the stake registry so the
    ///      indexer's `ServiceURIUpdated` handler and the frontend's services
    ///      list / detail surfaces have a populated operator-service card on first
    ///      sync. Admin holds `DEFAULT_ADMIN_ROLE` on the registry.
    function _seedServiceMetadata() internal {
        console.log("--- Seeding service metadata ---");

        vm.startBroadcast(admin.key);

        string memory serviceJson = string.concat(
            '{"schemaVersion":"service.v1",',
            '"name":"Operator Service",',
            '"description":"Off-chain service validated by an operator quorum.",',
            '"website":"https://example.com/",',
            '"twitter":"https://twitter.com/example_service"}'
        );
        stakeRegistry.setServiceURI(string.concat("data:application/json;base64,", Base64.encode(bytes(serviceJson))));
        console.log("  operator service: metadata set");

        vm.stopBroadcast();
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  FUND ACCOUNTS
    // ═════════════════════════════════════════════════════════════════════════

    function _fundWallets() internal {
        // Fund all derived accounts with ETH for gas (account 0 has 10000 ETH on Anvil)
        vm.startBroadcast(admin.key);
        for (uint256 i = 0; i < depositors.length; i++) {
            payable(depositors[i].addr).transfer(10 ether);
            usdc.mint(depositors[i].addr, depositAmount);
            weth.mint(depositors[i].addr, ethDepositAmount);
            usdt.mint(depositors[i].addr, usdtDepositAmount);
        }
        payable(arbiter.addr).transfer(1 ether);
        // Also fund arbiter with a smaller USDC amount (for testing forfeit scenarios)
        usdc.mint(arbiter.addr, depositAmount / 10);
        // The agent persona: gas + capital for its bonds, plus an in-wallet USDC
        // reserve for optimistic dispute bonds. DAI funds the agent-managed-vault
        // story: the agent's own skin plus three depositors to protect.
        payable(agent.addr).transfer(10 ether);
        usdc.mint(agent.addr, depositAmount);
        uint256 daiWhole = (depositAmount / 1e6) * 1e18; // same whole-unit scale at 18 decimals
        dai.mint(agent.addr, daiWhole / 5); // 20% skin-in-the-game bond
        for (uint256 i = 0; i < depositors.length && i < 3; i++) {
            dai.mint(depositors[i].addr, daiWhole);
        }
        vm.stopBroadcast();

        console.log(
            "Funded %d depositors with %d USDC + %d WETH each",
            depositors.length,
            depositAmount / 1e6,
            ethDepositAmount / 1e18
        );
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  DEPOSITS — vault shares are the canonical backing
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Every depositor funnels their capital THROUGH the vaults so that the
    ///      manager custodies appreciating vault SHARES — the canonical v2 backing
    ///      (priced via ERC4626Adapter, so the index lifts when vault NAV grows):
    ///        USDC -> usdcVault.deposit -> cvUSDC shares -> manager.deposit(cvUSDC)
    ///        WETH -> wethVault.deposit -> cvWETH shares -> manager.deposit(cvWETH)
    ///      Almost everything (commitments, operator stake, delegations, agreements,
    ///      mutual members) is then backed by these shares. The ~10%% USDC / 20%%
    ///      WETH kept in-wallet covers strategy fees, insurance bonds, and donations —
    ///      flows that are paid in the raw asset rather than locked as backing.
    function _createDeposits() internal {
        console.log("--- Deposits (manager custody, vault-share backed) ---");
        uint256 usdcVaultLeg = (depositAmount * 90) / 100; // -> cvUSDC -> manager
        uint256 wethVaultLeg = (ethDepositAmount * 80) / 100; // -> cvWETH -> manager
        uint256 usdtVaultLeg = (usdtDepositAmount * 70) / 100; // -> cvUSDT, kept in-wallet

        for (uint256 i = 0; i < depositors.length; i++) {
            vm.startBroadcast(depositors[i].key);

            // USDC -> cvUSDC shares -> manager. Approve cvUSDC to the manager too,
            // so strategy fees funded from in-wallet shares (e.g. FlatFeeAtCreate)
            // can be pulled later.
            usdc.approve(address(usdcVault), type(uint256).max);
            uint256 usdcShares = usdcVault.deposit(usdcVaultLeg, depositors[i].addr);
            usdcVault.approve(address(manager), type(uint256).max);
            manager.deposit(address(usdcVault), usdcShares);

            // WETH -> cvWETH shares -> manager.
            weth.approve(address(wethVault), type(uint256).max);
            uint256 wethShares = wethVault.deposit(wethVaultLeg, depositors[i].addr);
            wethVault.approve(address(manager), type(uint256).max);
            manager.deposit(address(wethVault), wethShares);

            // USDT -> cvUSDT shares. Mostly kept IN-WALLET as a protected savings
            // position (the holder buys De-Peg cover on it); these are not posted as
            // manager backing. Approve the manager so the holder can post them later.
            usdt.approve(address(usdtVault), type(uint256).max);
            uint256 usdtShares = usdtVault.deposit(usdtVaultLeg, depositors[i].addr);
            usdtVault.approve(address(manager), type(uint256).max);

            // Depositor 0 (anvil account #2, 0x3C44…) ALSO posts half of its cvUSDT
            // shares into the manager ledger, so the dashboard "Your assets" surfaces
            // a non-zero cvUSDT free balance (freeBalance(cvUSDT, 0x3C44…) > 0). The
            // rest stays in-wallet as the protected position above.
            uint256 usdtManagerLeg = 0;
            if (i == 0) {
                usdtManagerLeg = usdtShares / 2;
                manager.deposit(address(usdtVault), usdtManagerLeg);
            }

            vm.stopBroadcast();

            console.log("  Depositor %d: %d USDC -> cvUSDC -> manager", i, usdcVaultLeg / 1e6);
            console.log("              %d WETH -> cvWETH -> manager", wethVaultLeg / 1e18);
            console.log("              %d USDT -> cvUSDT (in-wallet, protected)", usdtVaultLeg / 1e6);
            if (usdtManagerLeg > 0) {
                console.log("              + cvUSDT shares -> manager ledger:", usdtManagerLeg);
            }
        }
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  COMMITMENTS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Strategy-free CommitmentParams builder against the configured window.
    function _params(
        address arbiter_,
        address counterparty_,
        address token_,
        address adapter_,
        uint256 amount,
        uint16 maxPenaltyBps
    ) internal view returns (ICommitmentManager.CommitmentParams memory p) {
        p.arbiter = arbiter_;
        p.counterparty = counterparty_;
        p.token = token_;
        p.adapter = adapter_;
        p.amount = amount;
        p.maxPenaltyBps = maxPenaltyBps;
        p.challengeWindow = challengeWindow;
        p.expiresAt = 0;
        p.strategies = new StrategyBinding[](0);
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
    }

    // ─── Metadata catalogue ──────────────────────────────────────────────────
    //
    //  Payload TEXT is not written here. It lives in `script/metadata/
    //  catalogue.mjs`, gets pinned by `script/pin-metadata.mjs` before this
    //  script runs, and arrives as `script/metadata-manifest.json`.
    //
    //  The ordering is forced, not stylistic: `metadataURI` is immutable once
    //  written and this is Solidity, which cannot POST to IPFS. So pinning
    //  happens first and the two processes meet at a file.
    //
    //  What that buys is room. `metadataURI` is capped at 512 bytes on chain,
    //  and an inline `data:application/json;base64,` URI has to carry the whole
    //  document inside that — about 360 bytes of JSON, which is one sentence
    //  once a `termsURI` is present. An `ipfs://` CIDv1 URI is 66 bytes no
    //  matter how long the document is. The catalogue's `full` payloads run to
    //  ~740 bytes; as `data:` URIs they would be over 1000 and the contract
    //  would reject them.
    //
    //  With no daemon the prepare step emits the catalogue's `short` variants
    //  as `data:` URIs instead, so `just dev-up` still works end to end with
    //  Docker stopped. Both paths produce a coherent corpus; only the prose
    //  length differs.

    /// @dev The manifest, read once from disk. Empty until `_loadMetadata()`.
    string internal metadataManifest;
    /// @dev `"full"` (pinned) or `"short"` (inline fallback) — logged for the
    ///      benefit of anyone wondering why descriptions are one line long.
    string internal metadataVariant;

    /// @dev Read the manifest produced by `script/pin-metadata.mjs`. Fails loudly:
    ///      a missing manifest means the prepare step did not run, and seeding
    ///      an entire corpus with no metadata is not a good silent default.
    function _loadMetadata() internal {
        metadataManifest = vm.readFile("script/metadata-manifest.json");
        metadataVariant = vm.parseJsonString(metadataManifest, ".variant");
        console.log("--- Metadata manifest ---");
        console.log("  variant:", metadataVariant);
        console.log("  service:", vm.parseJsonString(metadataManifest, ".service"));
        console.log("");
    }

    /// @dev Look up one catalogue entry. Returns the URI to write on chain and
    ///      the exact bytes it resolves to, so the caller hashes what the
    ///      manifest actually carries rather than a re-serialization of it.
    function _catalogEntry(string memory key) internal view returns (string memory uri, string memory json) {
        uri = vm.parseJsonString(metadataManifest, string.concat('.payloads["', key, '"].uri'));
        json = vm.parseJsonString(metadataManifest, string.concat('.payloads["', key, '"].json'));
    }

    /// @dev Attach a well-formed, hash-attested payload — the `ok` status.
    ///      Asserts the cap rather than letting `createCommitment` revert with
    ///      an opaque gas-estimation failure three frames deeper.
    function _withMetadata(ICommitmentManager.CommitmentParams memory p, string memory key) internal view {
        (string memory uri, string memory json) = _catalogEntry(key);
        require(bytes(uri).length > 0, "Simulate: metadata key missing from the manifest");
        require(bytes(uri).length <= 512, "Simulate: metadata URI over the 512-byte cap");
        p.metadataURI = uri;
        p.metadataHash = keccak256(bytes(json));
    }

    /// @dev The `AgreementParams` counterpart of {@link _withMetadata}. Same
    ///      manifest, same byte contract; a different struct, because an
    ///      agreement carries its metadata on the proposal rather than on
    ///      either leg. Both accepted legs inherit what is set here.
    function _withAgreementMetadata(ICommitmentManager.AgreementParams memory p, string memory key) internal view {
        (string memory uri, string memory json) = _catalogEntry(key);
        require(bytes(uri).length > 0, "Simulate: agreement metadata key missing from the manifest");
        require(bytes(uri).length <= 512, "Simulate: agreement metadata URI over the 512-byte cap");
        p.metadataURI = uri;
        p.metadataHash = keccak256(bytes(json));
    }

    /// @dev Attach a valid payload under a deliberately WRONG hash, so the
    ///      indexer resolves the bytes and classifies them `mismatch`. The UI
    ///      contract for this state is that the off-chain title never gets to
    ///      act as a heading — the row falls back to its derived label.
    function _withMismatchedMetadata(ICommitmentManager.CommitmentParams memory p, string memory key) internal view {
        _withMetadata(p, key);
        p.metadataHash = keccak256("commitments: deliberately wrong hash, seeded to exercise the mismatch path");
    }

    /// @dev Point at a URI that cannot resolve, so `unreachable` has a live
    ///      example. The URI itself lives in the manifest — see the catalogue's
    ///      `UNREACHABLE_URI` for why it is an RFC 2606 `.invalid` host and not
    ///      an unpinned CID (a real Kubo gateway answers those with 200 and an
    ///      empty body, which reads as `mismatch`, not `unreachable`).
    function _withUnreachableMetadata(ICommitmentManager.CommitmentParams memory p) internal view {
        p.metadataURI = vm.parseJsonString(metadataManifest, ".unreachableUri");
        p.metadataHash = keccak256("commitments: seeded unreachable metadata, no bytes exist to match this");
    }

    /// @dev Penalty profile per depositor index — kept as a function (not a local
    ///      array) so the per-section helpers stay under the stack limit.
    function _penaltyProfile(uint256 idx) internal pure returns (uint16) {
        uint16[4] memory penalties = [uint16(1000), uint16(2500), uint16(5000), uint16(10_000)];
        return penalties[idx % 4];
    }

    /// @dev Index-appreciation shares routed to the counterparty. Depositor 0's
    ///      share is non-zero ON PURPOSE: _seedDistributableYield claims its accrual.
    function _yieldShareProfile(uint256 idx) internal pure returns (uint16) {
        uint16[4] memory yieldShares = [uint16(1000), uint16(250), uint16(500), uint16(0)];
        return yieldShares[idx % 4];
    }

    function _createCommitments() internal {
        console.log("--- Commitments ---");
        _createIndexYieldCommitments();
        _createGeneralCommitments();
        _createFlatFeeCommitment();
        _createWethCommitments();
        console.log("");
    }

    /// @dev Vault-share commitments bound to IndexAppreciationYield — one per
    ///      depositor. Backing is cvUSDC priced via ERC4626Adapter, so a vault
    ///      donation later lifts the index and the strategy accrues.
    function _createIndexYieldCommitments() private {
        for (uint256 i = 0; i < depositors.length; i++) {
            uint256 shareAmount = (manager.freeBalance(address(usdcVault), depositors[i].addr) * 40) / 100;
            if (shareAmount == 0) continue;

            ICommitmentManager.CommitmentParams memory p = _params(
                address(manualArbiter),
                arbiter.addr,
                address(usdcVault),
                address(erc4626Adapter),
                shareAmount,
                _penaltyProfile(i)
            );
            p.strategies = new StrategyBinding[](1);
            p.strategies[0] =
                StrategyBinding({strategy: address(indexYield), params: abi.encode(_yieldShareProfile(i))});

            _indexYieldMetadata(p, i);

            vm.startBroadcast(depositors[i].key);
            uint256 id = manager.createCommitment(p);
            vm.stopBroadcast();

            indexYieldCommitmentIds.push(id);
            if (i == 0) unbondCommitmentId = id;
            console.log("  Depositor %d: indexYield commitment %d (cvUSDC, 1e15 units): %d", i, id, shareAmount / 1e15);
        }
    }

    /// @dev Metadata for the index-yield family. Depositor 2 is left
    ///      metadata-free on purpose so the `empty` path — and the structural
    ///      label the row falls back to — stays visible in the running app.
    ///      Depositor 4 carries a valid payload under a wrong hash so
    ///      `mismatch` has a live example too.
    function _indexYieldMetadata(ICommitmentManager.CommitmentParams memory p, uint256 i) private view {
        if (i == 0) {
            _withMetadata(p, "indexYield.0");
        } else if (i == 1) {
            _withMetadata(p, "indexYield.1");
        } else if (i == 3) {
            _withMetadata(p, "indexYield.3");
        } else if (i == 4) {
            _withMismatchedMetadata(p, "indexYield.4");
        }
        // i == 2: metadata-free on purpose — see the doc comment above.
    }

    /// @dev General cvUSDC-backed commitments (ERC4626Adapter, strategy-free) —
    ///      (numCommitments - 1) per depositor so NUM_COMMITMENTS keeps its meaning.
    ///      Backed by locked vault shares: the underlying USDC keeps earning while
    ///      the shares secure the commitment.
    function _createGeneralCommitments() private {
        uint256 perDepositor = numCommitments > 1 ? numCommitments - 1 : 0;
        for (uint256 i = 0; i < depositors.length && perDepositor > 0; i++) {
            uint256 perCommitment =
                ((manager.freeBalance(address(usdcVault), depositors[i].addr) * 30) / 100) / perDepositor;
            if (perCommitment == 0) continue;

            vm.startBroadcast(depositors[i].key);
            for (uint256 j = 0; j < perDepositor; j++) {
                address counterparty = j % 2 == 0 ? depositors[(i + 1) % depositors.length].addr : arbiter.addr;
                ICommitmentManager.CommitmentParams memory p = _params(
                    address(manualArbiter),
                    counterparty,
                    address(usdcVault),
                    address(erc4626Adapter),
                    perCommitment,
                    _penaltyProfile(i + j)
                );
                // Only the first commitment per depositor is named. Any extra
                // ones (NUM_COMMITMENTS > 2) exist to bulk out the list and
                // would need a title table that scales with the env var.
                if (j == 0) _generalMetadata(p, i);
                uint256 id = manager.createCommitment(p);
                if (i == 0 && j == 0) contributionCommitmentId = id;
                console.log("  Depositor %d: cvUSDC commitment %d, amount %d (cvUSDC)", i, id, perCommitment / 1e15);
            }
            vm.stopBroadcast();
        }
    }

    /// @dev Metadata for the general cvUSDC family. Depositor 3 points at an
    ///      unpinned CID (`unreachable`), depositor 4 is metadata-free.
    function _generalMetadata(ICommitmentManager.CommitmentParams memory p, uint256 i) private view {
        if (i == 0) {
            _withMetadata(p, "general.0");
        } else if (i == 1) {
            _withMetadata(p, "general.1");
        } else if (i == 2) {
            _withMetadata(p, "general.2");
        } else if (i == 3) {
            _withUnreachableMetadata(p);
        }
        // i == 4: metadata-free on purpose.
    }

    /// @dev FlatFeeAtCreate commitment (depositor 0), backed by cvUSDC shares. The
    ///      fee is denominated in the commitment's backing token (FlatFeeAtCreate
    ///      keys its credit on `ctx.base.token`), so it is paid in cvUSDC, not raw
    ///      USDC. It is credit-prefunded: strategy.prefund BEFORE create, or the
    ///      creation hook reverts (compatibility-refusal path). Depositor 0 mints a
    ///      little cvUSDC into their wallet (a vault deposit whose shares are NOT
    ///      forwarded to the manager) to cover it.
    function _createFlatFeeCommitment() private {
        uint256 fee = 25e15; // 25 cvUSDC, paid from depositor 0's in-wallet shares
        uint256 amount = (manager.freeBalance(address(usdcVault), depositors[0].addr) * 10) / 100;
        if (amount == 0) return;

        ICommitmentManager.CommitmentParams memory p =
            _params(address(manualArbiter), arbiter.addr, address(usdcVault), address(erc4626Adapter), amount, 2500);
        p.strategies = new StrategyBinding[](1);
        p.strategies[0] = StrategyBinding({strategy: address(flatFee), params: abi.encode(fee)});
        _withMetadata(p, "flatFee.0");

        vm.startBroadcast(depositors[0].key);
        // Mint ~30 cvUSDC into the wallet (par NAV), then prefund the committer's fee
        // credit on the strategy from those in-wallet shares.
        usdcVault.deposit(30e6, depositors[0].addr);
        usdcVault.approve(address(flatFee), fee);
        flatFee.prefund(depositors[0].addr, address(usdcVault), fee);
        flatFeeCommitmentId = manager.createCommitment(p);
        vm.stopBroadcast();
        console.log("  Depositor 0: flatFee commitment %d (fee %d cvUSDC prefunded)", flatFeeCommitmentId, fee / 1e15);
    }

    /// @dev cvWETH-backed commitments — mixed-token rows in the UI. Backed by
    ///      wethVault shares (cvWETH, priced via ERC4626Adapter) rather than raw WETH.
    function _createWethCommitments() private {
        console.log("--- Commitments (cvWETH) ---");
        for (uint256 i = 0; i < depositors.length; i++) {
            uint256 wethAmount = (manager.freeBalance(address(wethVault), depositors[i].addr) * 30) / 100;
            if (wethAmount == 0) continue;

            ICommitmentManager.CommitmentParams memory p = _params(
                address(manualArbiter),
                depositors[(i + 1) % depositors.length].addr,
                address(wethVault),
                address(erc4626Adapter),
                wethAmount,
                _penaltyProfile(i)
            );
            _wethMetadata(p, i);

            vm.startBroadcast(depositors[i].key);
            uint256 id = manager.createCommitment(p);
            vm.stopBroadcast();
            console.log("  Depositor %d: cvWETH commitment %d, amount %d (1e24 units)", i, id, wethAmount / 1e24);
        }
    }

    /// @dev Metadata for the cvWETH family. Depositor 2 is metadata-free, so
    ///      each of the three backing families has at least one unnamed row and
    ///      the derived labels get exercised across tokens rather than in one
    ///      corner of the list. Tags deliberately overlap with the cvUSDC
    ///      families (`sla`, `relay`, `attestation`) so tag filtering returns
    ///      mixed-token results.
    function _wethMetadata(ICommitmentManager.CommitmentParams memory p, uint256 i) private view {
        if (i == 0) {
            _withMetadata(p, "weth.0");
        } else if (i == 1) {
            _withMetadata(p, "weth.1");
        } else if (i == 3) {
            _withMetadata(p, "weth.3");
        } else if (i == 4) {
            _withMetadata(p, "weth.4");
        }
        // i == 2: metadata-free on purpose.
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  OPERATORS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Registration/delegation commitments must match the registry's v2
    ///      acceptance policy: arbiter == manualArbiter, maxPenaltyBps >= 10_000,
    ///      token == cvUSDC vault shares (the requiredToken), and NO bound
    ///      strategies. Operators thus secure services with productive capital —
    ///      the staked shares keep earning yield while they back the registration.
    function _registerOperators() internal {
        console.log("--- Operators ---");

        for (uint256 i = 0; i < operators.length; i++) {
            uint256 shareFree = manager.freeBalance(address(usdcVault), operators[i].addr);
            uint256 stakeAmount = (shareFree * 50) / 100;
            if (stakeAmount < minOperatorStake) stakeAmount = minOperatorStake;
            if (stakeAmount > shareFree) {
                console.log("  Operator", i, "SKIPPED (insufficient free cvUSDC)");
                continue;
            }

            vm.startBroadcast(operators[i].key);

            // Create commitment with registry as counterparty.
            ICommitmentManager.CommitmentParams memory regParams = _params(
                address(manualArbiter),
                address(operatorRegistry),
                address(usdcVault),
                address(erc4626Adapter),
                stakeAmount,
                10_000 // full forfeitability required by registry policy
            );
            // Operator 2 stays unnamed on purpose so the derived label for a
            // registry-counterparty commitment keeps a live example.
            if (i == 0) _withMetadata(regParams, "operator.0");
            else if (i == 1) _withMetadata(regParams, "operator.1");
            uint256 commitmentId = manager.createCommitment(regParams);

            // Register as operator
            operatorRegistry.register(commitmentId);

            // Attach operator profile metadata so the Mesh > Operators tab renders a
            // populated OperatorProfileCard rather than just the raw address.
            string memory operatorJson = string.concat(
                '{"schemaVersion":"operator.v1","name":"Operator Node ',
                vm.toString(i),
                '","description":"Demo operator.",',
                '"website":"https://example.com/",',
                '"p2pEndpoint":"p2p://operator-',
                vm.toString(i),
                '.example","services":["operator-safety","commitments-arbiter"],',
                '"social":{"github":"https://github.com/example",',
                '"twitter":"https://twitter.com/example_service"}}'
            );
            operatorRegistry.setOperatorMetadata(
                string.concat("data:application/json;base64,", Base64.encode(bytes(operatorJson))),
                keccak256(bytes(operatorJson))
            );

            vm.stopBroadcast();

            console.log("  Operator %d: registered with %d cvUSDC (commitment %d)", i, stakeAmount / 1e15, commitmentId);

            // Have some non-operator depositors delegate to this operator
            _delegateToOperator(i);
        }
        console.log("");
    }

    function _delegateToOperator(uint256 operatorIdx) internal {
        // Non-operator depositors delegate a portion to this operator
        for (uint256 d = numOperators; d < depositors.length; d++) {
            // Only delegate to first operator they haven't delegated to yet
            if ((d % numOperators) != operatorIdx) continue;

            uint256 shareFree = manager.freeBalance(address(usdcVault), depositors[d].addr);
            uint256 delegationAmount = (shareFree * 30) / 100;
            if (delegationAmount == 0) continue;

            vm.startBroadcast(depositors[d].key);

            // Strategy-free, requiredToken-backed (cvUSDC), policy-conformant commitment.
            ICommitmentManager.CommitmentParams memory delParams = _params(
                address(manualArbiter),
                address(operatorRegistry),
                address(usdcVault),
                address(erc4626Adapter),
                delegationAmount,
                10_000
            );
            // The second delegation stays unnamed so the "Delegation to
            // <operator name>" derived tier keeps a live example.
            if (d == numOperators) _withMetadata(delParams, "delegation.3");
            uint256 commitmentId = manager.createCommitment(delParams);
            operatorRegistry.delegate(operators[operatorIdx].addr, commitmentId);

            vm.stopBroadcast();

            console.log("    Staker %d: delegated %d cvUSDC to operator %d", d, delegationAmount / 1e15, operatorIdx);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  AGREEMENTS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev AgreementParams with per-leg terms. Seeded agreements are same-token
    ///      (both legs cvUSDC / ERC4626Adapter, or cvWETH for the mixed-token pair)
    ///      and strategy-free; the first agreement opts into bilateral settlement via
    ///      per-direction flow caps and one settle event.
    function _agreementParams(
        address acceptor,
        address token_,
        address adapter_,
        uint256 proposerAmount,
        uint256 acceptorAmount
    ) internal view returns (ICommitmentManager.AgreementParams memory p) {
        p.arbiter = address(manualArbiter);
        p.acceptor = acceptor;
        p.proposerLeg = ICommitmentManager.LegTerms({
            token: token_,
            adapter: adapter_,
            amount: proposerAmount,
            maxPenaltyBps: 3000, // 30% max penalty
            strategies: new StrategyBinding[](0)
        });
        p.acceptorLeg = ICommitmentManager.LegTerms({
            token: token_,
            adapter: adapter_,
            amount: acceptorAmount,
            maxPenaltyBps: 3000,
            strategies: new StrategyBinding[](0)
        });
        p.challengeWindow = challengeWindow;
        p.proposalDuration = 3 days;
        p.metadataURI = "";
        p.metadataHash = bytes32(0);
        p.maxFlowProposerToAcceptor = 0;
        p.maxFlowAcceptorToProposer = 0;
    }

    function _createAgreements() internal {
        console.log("--- Agreements ---");

        uint256 created = 0;
        for (uint256 i = 0; i < numAgreements && i < depositors.length - 1; i++) {
            Wallet memory proposer = depositors[i];
            Wallet memory acceptor = depositors[i + 1];

            uint256 proposerAmount = (manager.freeBalance(address(usdcVault), proposer.addr) * 20) / 100;
            uint256 acceptorAmount = (manager.freeBalance(address(usdcVault), acceptor.addr) * 20) / 100;
            if (proposerAmount == 0 || acceptorAmount == 0) {
                console.log("  Agreement", i, "SKIPPED (insufficient free cvUSDC)");
                continue;
            }

            ICommitmentManager.AgreementParams memory p = _agreementParams(
                acceptor.addr, address(usdcVault), address(erc4626Adapter), proposerAmount, acceptorAmount
            );

            // First agreement carries real terms + bilateral settlement caps so
            // the indexer and the settlement-history UI have live data to render.
            // Caps are 50% of each side's encumbered amount in each direction.
            //
            // Both legs inherit this payload when the proposal is accepted (see
            // metadata.md), so the two commitments render the same title. What
            // distinguishes them on screen is the side, which the derived label
            // carries — see the note on paired rows in `commitmentLabel`.
            if (i == 0) {
                _withAgreementMetadata(p, "agreement.0");
                p.maxFlowProposerToAcceptor = uint128(proposerAmount / 2);
                p.maxFlowAcceptorToProposer = uint128(acceptorAmount / 2);
            }

            // Propose
            vm.startBroadcast(proposer.key);
            uint256 proposalId = manager.proposeAgreement(p);
            vm.stopBroadcast();
            console.log("  Proposed: id %d", proposalId);

            // Accept (creates the two linked commitments)
            vm.startBroadcast(acceptor.key);
            (uint256 agreementId,,) = manager.acceptAgreement(proposalId);
            vm.stopBroadcast();
            console.log("  Accepted: agreement %d", agreementId);

            // One settle event on the cap-enabled agreement so the indexer's
            // agreementSettlement table has real data on first sync.
            // Direction proposer -> acceptor; exposure = 25% of cap.
            if (i == 0 && p.maxFlowProposerToAcceptor > 0) {
                uint256 units = uint256(p.maxFlowProposerToAcceptor / 4);
                vm.startBroadcast(arbiter.key);
                manualArbiter.settleAgreement(agreementId, true, units, keccak256("sim.evidence.v1"));
                vm.stopBroadcast();
                console.log("  Settled (P->A): %d units", units);
            }

            created++;
        }

        // ---- One cvWETH-backed agreement so the agreement page shows mixed-token rows ----
        if (depositors.length >= 2) {
            uint256 wethProposerAmount = (manager.freeBalance(address(wethVault), depositors[0].addr) * 25) / 100;
            uint256 wethAcceptorAmount = (manager.freeBalance(address(wethVault), depositors[1].addr) * 25) / 100;

            if (wethProposerAmount > 0 && wethAcceptorAmount > 0) {
                ICommitmentManager.AgreementParams memory wp = _agreementParams(
                    depositors[1].addr,
                    address(wethVault),
                    address(erc4626Adapter),
                    wethProposerAmount,
                    wethAcceptorAmount
                );
                _withAgreementMetadata(wp, "agreement.weth");

                vm.startBroadcast(depositors[0].key);
                uint256 wethProposalId = manager.proposeAgreement(wp);
                vm.stopBroadcast();

                vm.startBroadcast(depositors[1].key);
                (uint256 wethAgreementId,,) = manager.acceptAgreement(wethProposalId);
                vm.stopBroadcast();

                console.log("  WETH agreement: proposalId %d -> agreementId %d", wethProposalId, wethAgreementId);
                created++;
            }
        }

        console.log("  Total agreements:", created);
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  MESH TOPOLOGY
    // ═════════════════════════════════════════════════════════════════════════

    function _deployMeshTopology() internal {
        console.log("--- Mesh Topology ---");

        vm.startBroadcast(admin.key);

        // TokenWeighting is the IVotingPowerSource for the middleware. The PROVIDER is
        // the OperatorRegistry: register/delegate/release/forfeit/deregister flow stake
        // through OperatorRegistry._meshOnIncrease/_meshOnDecrease, which call
        // tw.stake / tw.releaseStake (onlyProvider). Governance stays with admin so the
        // weight policy below (and the governance proposal later) can be set/tuned.
        tokenWeightingNode =
            meshFactory.deployTokenWeightingAt(keccak256("sim.tw.v1"), address(operatorRegistry), admin.addr);
        console.log("TokenWeighting:  ", tokenWeightingNode);

        // Per-denom governance weights — risk POLICY, NOT a price oracle. Voting power is
        // `stake * weight / 10_000` (BPS), so each weight folds BOTH the token's decimal
        // scale AND a governance risk factor into a single 18-decimal "USD-equivalent"
        // voting unit. Denoms are token-address-keyed to match OperatorRegistry._stakeDenom,
        // which now keys on cvUSDC (the requiredToken) — so the credited axis is cvUSDC.
        //   cvUSDC (15-dec, 1.0x risk): 1e3 decimal lift (18-15) * 1e4 BPS        = 1e7
        //   WETH   (18-dec, ~4000 USD/ETH, 0.8x risk): 1e4 BPS * 4000 * 0.8       = 3.2e7
        // The cvUSDC weight is chosen so 1 cvUSDC stake -> 1e18 voting units (a cvUSDC share
        // is ~1 USDC at par NAV), preserving the same power exposure operators carried under
        // raw-USDC staking. The WETH denom is a forward-compat illustrative row (zero stake
        // here — operators stake cvUSDC only); the ~4000 ETH/USD figure is a governance-set
        // parameter with no on-chain oracle dependency.
        bytes32 usdcStakeDenom = _denomFor(address(usdcVault));
        bytes32 wethStakeDenom = _denomFor(address(weth));
        TokenWeighting(tokenWeightingNode).updateWeight(usdcStakeDenom, CVUSDC_DENOM_WEIGHT);
        TokenWeighting(tokenWeightingNode).updateWeight(wethStakeDenom, WETH_DENOM_WEIGHT);
        console.log("  cvUSDC denom weight: 1e7 (3-dec lift * BPS, 1.0x risk)");
        console.log("  WETH denom weight: 3.2e7 (BPS * 4000 USD/ETH * 0.8x risk, illustrative)");

        // Wire the registry -> mesh pipeline ONCE. From here, every register/delegate
        // credits the operator's per-operator FanIn AND this TokenWeighting sink with the
        // SAME verified amount; release/forfeit/deregister debit it. The registry is the
        // FanIn manager (the verified-backing binding) and this TokenWeighting's provider.
        operatorRegistry.setMeshWiring(tokenWeightingNode, address(meshFactory));
        console.log("  Registry mesh wiring set (TokenWeighting + MeshFactory)");

        // FanOut deploys here (no upstream dependency on the StakeRegistry);
        // FanIn waits for StakeRegistry deployment so it can be wired with
        // the real service consumer. See `_wireMeshConsumer`.
        fanOutNode = meshFactory.deployFanOutAt(keccak256("sim.fanout.v1"), admin.addr, admin.addr);
        console.log("FanOutNode:      ", fanOutNode);

        vm.stopBroadcast();
        console.log("");
    }

    /// @dev Mesh denom for a backing token — MUST match OperatorRegistry._stakeDenom
    ///      (the registry credits exactly this denom for its requiredToken). One-token
    ///      ↔ one-denom keeps a unit of encumbered capital on a single voting axis.
    function _denomFor(address token_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(token_)));
    }

    /// @dev Governance risk-policy weights (NOT a price oracle). See `_deployMeshTopology`.
    uint256 constant CVUSDC_DENOM_WEIGHT = 1e7; // 3-dec lift (1e3, 18-15) * BPS (1e4), 1.0x risk
    uint256 constant WETH_DENOM_WEIGHT = 32_000_000; // BPS (1e4) * 4000 USD/ETH * 0.8x risk

    /// @dev Runs after `_deployServiceMiddleware` so FanIn can use the real
    ///      StakeRegistry as its consumer. Wires the demo topology:
    ///        FanOut → FanIn (usdcStake, 50%/100%)
    ///        TokenWeighting → FanIn (usdcStake, 50%/1d) + (wethStake, 80%/7d)
    ///      so the Mesh Explorer's topology view has labeled edges to render.
    function _wireMeshConsumer() internal {
        console.log("--- Mesh Wiring (post-StakeRegistry) ---");

        vm.startBroadcast(admin.key);

        // Token-address-keyed denoms — same axis the registry credits into TokenWeighting.
        // The USDC-side stake axis is keyed on cvUSDC (the registry's requiredToken).
        bytes32 usdcStakeDenom = _denomFor(address(usdcVault));
        bytes32 wethStakeDenom = _denomFor(address(weth));

        fanInNode = meshFactory.deployFanInAt(keccak256("sim.fanin.v1"), address(stakeRegistry), admin.addr);
        console.log("FanInNode:       ", fanInNode);

        // FanOut → FanIn: route 100% of admin's usdcStake outflow with a
        // 50% max-forfeitable ceiling. Admin hasn't staked into FanOut yet, so
        // the exposure check trivially passes (locked=0 → totalForfeitable=0).
        Outflow[] memory outflows = new Outflow[](1);
        outflows[0] = Outflow({consumer: fanInNode, maxPenaltyBps: 5_000, portionBps: 10_000});
        FanOutNode(fanOutNode).setOutflows(usdcStakeDenom, outflows);
        console.log("  FanOut.setOutflows(usdcStake -> FanIn, 50%%/100%%)");

        // FanIn provider registry: TokenWeighting feeds usdcStake (50%/1d)
        // and wethStake (80%/7d) into FanIn. These rows drive the per-denom
        // security parameters in the inspector.
        FanInNode(fanInNode).registerProvider(tokenWeightingNode, usdcStakeDenom, usdcStakeDenom, 5_000, 1 days);
        FanInNode(fanInNode).registerProvider(tokenWeightingNode, wethStakeDenom, wethStakeDenom, 8_000, 7 days);
        console.log("  FanIn.registerProvider(TokenWeighting, usdcStake, 50%%/1d)");
        console.log("  FanIn.registerProvider(TokenWeighting, wethStake, 80%%/7d)");

        vm.stopBroadcast();
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SERVICE MIDDLEWARE
    // ═════════════════════════════════════════════════════════════════════════

    function _deployServiceMiddleware() internal {
        console.log("--- Service Middleware ---");

        vm.startBroadcast(admin.key);

        // Deploy OperatorServiceRegistry (impl + proxy). The TokenWeighting mesh node
        // is the IVotingPowerSource — per-operator power is read directly from the mesh.
        OperatorServiceRegistry srImpl = new OperatorServiceRegistry();
        bytes memory srInit = abi.encodeCall(
            OperatorServiceRegistry.initialize,
            (
                address(operatorRegistry),
                tokenWeightingNode,
                admin.addr,
                minOperatorStake / 2, // threshold = half min operator stake
                2, // quorum numerator (2/3)
                3 // quorum denominator
            )
        );
        ERC1967Proxy srProxy = new ERC1967Proxy(address(srImpl), srInit);
        stakeRegistry = OperatorServiceRegistry(address(srProxy));
        console.log("OperatorServiceRegistry:", address(srProxy));
        console.log("  votingPowerSource ->", tokenWeightingNode);

        // Reference quorum-attestation arbiter. It is configured even when no
        // envelope has acted yet so the UI can display its operator-service
        // controller and ordering model as a trusted mechanism deployment.
        attestationArbiter = new AttestationArbiter(address(manager), address(stakeRegistry));
        console.log("AttestationArbiter: ", address(attestationArbiter));

        vm.stopBroadcast();
        console.log("");
    }

    function _registerOperatorsInMiddleware() internal {
        console.log("--- Operator Registration ---");

        for (uint256 i = 0; i < operators.length; i++) {
            // 1. Operator registers in middleware
            vm.startBroadcast(operators[i].key);
            stakeRegistry.enrollServiceOperator();
            vm.stopBroadcast();

            // 2. Operator sets their signing key (derived: opKey + large offset)
            uint256 signingKeyPk = operators[i].key + 100;
            address signingKeyAddr = vm.addr(signingKeyPk);

            bytes32 messageHash = keccak256(abi.encode(operators[i].addr, address(stakeRegistry), block.chainid));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKeyPk, messageHash);
            bytes memory signingKeySig = abi.encodePacked(r, s, v);

            vm.startBroadcast(operators[i].key);
            stakeRegistry.updateOperatorSigningKey(signingKeyAddr, signingKeySig);
            vm.stopBroadcast();

            console.log("  Operator %d: registered, signing key %s", i, vm.toString(signingKeyAddr));
        }

        // Voting power was already credited when each operator registered/delegated in
        // `_registerOperators` (OperatorRegistry._meshOnIncrease -> TokenWeighting), so
        // the mesh is the live source of truth here — no separate staking step.
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SEED YIELD + UNBONDING (so the dev UI exercises both states immediately)
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev v2 yield path: donate USDC to the USDC vault to lift NAV per cvUSDC
    ///      share. The ERC4626Adapter index (convertToAssets) appreciates, so
    ///      `distributeAll` on every vault-share commitment bound to
    ///      IndexAppreciationYield sweeps the accrual into strategy escrow.
    ///      Without this, distribute() is a no-op on a fresh seed.
    ///
    ///      The donation is intentionally large (~5% of vault TVL) so even small
    ///      commitments produce non-trivial accrual without truncating to 0.
    ///      Finishes with one real `claim` (arbiter = counterparty of depositor
    ///      0's premium commitment) so the claim surface has data too.
    function _seedDistributableYield() internal {
        console.log("--- Seeding distributable yield ---");
        uint256 donation = usdcVault.totalAssets() / 20; // 5% NAV lift
        if (donation == 0 || indexYieldCommitmentIds.length == 0) {
            console.log("  Skipped (no vault TVL or no premium commitments)");
            console.log("");
            return;
        }

        vm.startBroadcast(admin.key);
        usdc.mint(admin.addr, donation);
        usdc.approve(address(usdcVault), donation);
        usdcVault.donate(donation);
        vm.stopBroadcast();
        console.log("  Donated %d USDC to usdcVault (index lifted)", donation / 1e6);

        // Lift cvWETH + cvUSDT NAV too (backed donations) so every vault shows real
        // appreciation on first load, not just cvUSDC. ~3% of each vault's TVL.
        uint256 wethDonation = wethVault.totalAssets() / 33;
        uint256 usdtDonation = usdtVault.totalAssets() / 33;
        vm.startBroadcast(admin.key);
        if (wethDonation > 0) {
            weth.mint(admin.addr, wethDonation);
            weth.approve(address(wethVault), wethDonation);
            wethVault.donate(wethDonation);
        }
        if (usdtDonation > 0) {
            usdt.mint(admin.addr, usdtDonation);
            usdt.approve(address(usdtVault), usdtDonation);
            usdtVault.donate(usdtDonation);
        }
        vm.stopBroadcast();
        console.log("  Lifted cvWETH + cvUSDT NAV (base yield)");

        // distributeAll is permissionless; zero-share bindings are a harmless
        // no-op (lastIndex updates, no movement), so no per-id filtering and no
        // try/catch — under --slow --broadcast foundry re-simulates every
        // recorded call as a tx, so caught reverts would still break the run.
        vm.startBroadcast(admin.key);
        for (uint256 i = 0; i < indexYieldCommitmentIds.length; i++) {
            manager.distributeAll(indexYieldCommitmentIds[i]);
        }
        vm.stopBroadcast();
        console.log("  Distributed yield on %d commitment(s)", indexYieldCommitmentIds.length);

        // Claim the accrual on depositor 0's premium commitment. Its yield share
        // is non-zero by construction (yieldShares[0] = 1000) and the counterparty
        // is arbiter.addr, so the arbiter claims raw cvUSDC out of escrow.
        vm.startBroadcast(arbiter.key);
        manager.claim(indexYieldCommitmentIds[0], address(indexYield), "");
        vm.stopBroadcast();
        console.log("  Arbiter claimed premium on commitment %d", indexYieldCommitmentIds[0]);
        console.log("");
    }

    /// @dev Requests unbond on depositor 0's premium commitment so the
    ///      Commitments table renders the UNBONDING badge + maturity countdown
    ///      out of the box. With UNBONDING_PERIOD defaulting to 60s, the
    ///      "ready to finalize" UI surfaces a minute after seed completes.
    function _seedUnbondingState() internal {
        if (unbondCommitmentId == 0) return;
        console.log("--- Seeding unbonding state ---");
        vm.startBroadcast(depositors[0].key);
        manager.requestUnbond(unbondCommitmentId);
        vm.stopBroadcast();
        console.log("  Depositor 0 requested unbond on commitment %d", unbondCommitmentId);
        console.log("  -> matures in %d seconds; UI shows UNBONDING badge", uint256(unbondingPeriod));
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  v2.5 SEED — donations + contributions
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Seed a vault donation event and an opted-in commitment with one
    ///         third-party contribution so the indexer's `donation` and `contribution`
    ///         tables and the frontend's matching surfaces have data on first sync.
    function _seedV2_5Surfaces() internal {
        if (depositors.length < 2) return;
        console.log("--- Seeding v2.5 surfaces (donate + contribute) ---");

        // Donation: depositor 0 donates from their in-wallet USDC reserve.
        uint256 donationAmount = 100 * 1e6; // 100 USDC
        if (usdc.balanceOf(depositors[0].addr) >= donationAmount) {
            vm.startBroadcast(depositors[0].key);
            usdc.approve(address(usdcVault), donationAmount);
            usdcVault.donate(donationAmount);
            vm.stopBroadcast();
            console.log("  Donated %d USDC to usdcVault by depositor 0", donationAmount / 1e6);
        }

        // Contribution: depositor 0's first raw commitment. The committer
        // self-contributes 1 unit to opt in (first contributor enables); the
        // sponsor (depositor 1) then contributes meaningfully from their cvUSDC
        // free balance so the contribution table has a third-party row. The
        // contribution is denominated in the commitment's backing token (cvUSDC).
        if (contributionCommitmentId != 0) {
            vm.startBroadcast(depositors[0].key);
            manager.contributeEncumbered(contributionCommitmentId, 1);
            vm.stopBroadcast();
            console.log("  Depositor 0 enabled contributions on commitment %d", contributionCommitmentId);

            uint256 sponsorFree = manager.freeBalance(address(usdcVault), depositors[1].addr);
            uint256 contribution = sponsorFree / 20; // 5% of depositor 1's free
            if (contribution > 0) {
                vm.startBroadcast(depositors[1].key);
                manager.contributeEncumbered(contributionCommitmentId, contribution);
                vm.stopBroadcast();
                console.log(
                    "  Depositor 1 contributed %d cvUSDC to commitment %d",
                    contribution / 1e15,
                    contributionCommitmentId
                );
            }
        }
        console.log("");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  MARKETPLACE PATTERNS — optimistic insurance arbiter, linked-premium
    //  router. One arbiter / router per pattern; marketplace cards point at
    //  these addresses.
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Deploys the §5.2/§5.3 optimistic insurance arbiter and the §5.1
    ///      linked-premium router.
    function _deployMarketplacePatternContracts() internal {
        console.log("--- Marketplace Pattern Contracts ---");

        vm.startBroadcast(admin.key);

        // OptimisticInsuranceArbiter — USDC bond, 100 USDC minBond plus a 1%
        // value-scaled floor, winner-take-all distribution. Claims resolve by
        // bond timeout (top-of-stack wins); no third-party escalation. The
        // answer timeout tracks the seed's challenge window because
        // `proposeClaim` requires `commitment.challengeWindow >= answerTimeout`
        // (the propose-time manager hold must not be executable before the
        // claim resolves).
        optimisticArbiter = new OptimisticInsuranceArbiter(
            address(manager),
            address(usdc), // bond token = USDC
            100 * 1e6, // minBond
            100, // bondBps: proposer bond >= 1% of adapter-quoted claim value
            challengeWindow, // answerTimeout (== seed challenge window)
            10_000, // winnerShareBps = winner-take-all
            address(0) // no treasury (winner takes all)
        );
        console.log("OptimisticInsuranceArbiter:", address(optimisticArbiter));

        // Second instance for the cvaDAI market, bonded in DAI: claim bonds must be
        // denominated in the adapter's payout token — reusing the USDC-bonded
        // arbiter would misprice the value-scaled floor by 12 orders of magnitude
        // (see the bondBps NatSpec). Deployed HERE (after the USDC instance) so the
        // env writer's deploy-order mapping stays [0]=USDC, [1]=DAI.
        daiOptimisticArbiter = new OptimisticInsuranceArbiter(
            address(manager),
            address(dai), // bond token matches cvaDAI's payout denomination
            100e18, // minBond: 100 DAI
            100, // +1% of the adapter-quoted claim value
            challengeWindow, // answerTimeout tracks the seed window
            10_000, // winner-take-all
            address(0)
        );
        console.log("OptimisticInsuranceArbiter (DAI):", address(daiOptimisticArbiter));

        vm.stopBroadcast();
        console.log("");
    }

    /// @dev Seeds an open, disputed optimistic-insurance claim so the §5.2/§5.3
    ///      marketplace card has live state to render. Depositor 1 plays
    ///      the underwriter (the depositor whose backing can be forfeited);
    ///      depositor 2 plays the policyholder (the claimant). The claim's
    ///      amount is 30% of the commitment max-penalty. The underwriter then
    ///      posts the required doubled bond with a 10% counter-assertion. This
    ///      leaves one commitment, one live claim, and the matching repriced
    ///      manager proposal available for cross-surface development testing.
    function _seedOptimisticClaim() internal {
        if (depositors.length < 3) return;
        console.log("--- Seeding optimistic insurance claim ---");

        Wallet memory uw = depositors[1];
        Wallet memory ph = depositors[2];

        uint256 free = manager.freeBalance(address(usdcVault), uw.addr);
        uint256 commitAmount = (free * 25) / 100;
        if (commitAmount == 0) {
            console.log("  Skipped (depositor 1 has no free cvUSDC)");
            console.log("");
            return;
        }

        // 1. Underwriter creates a commitment with the optimistic arbiter, backed by
        //    cvUSDC shares, naming the policyholder as counterparty (forfeit beneficiary).
        //    The dispute BOND is separate and posted in raw USDC (the arbiter's bond token).
        vm.startBroadcast(uw.key);
        ICommitmentManager.CommitmentParams memory coverParams = _params(
            address(optimisticArbiter), ph.addr, address(usdcVault), address(erc4626Adapter), commitAmount, 5_000
        );
        _withMetadata(coverParams, "optimisticCover.0");
        uint256 commitmentId = manager.createCommitment(coverParams);
        vm.stopBroadcast();
        console.log("  Underwriter commitment %d: %d cvUSDC", commitmentId, commitAmount / 1e15);

        // 2. Policyholder approves the bond token (USDC) to the arbiter and
        //    proposes a claim of 30% of the commitment's amount. The bond
        //    floor is value-scaled (max of minBond and bondBps of the
        //    adapter-quoted claim value), so quote it via the arbiter.
        uint128 bondAmount = uint128(optimisticArbiter.bondFloor(commitmentId, 3_000));
        if (usdc.balanceOf(ph.addr) < bondAmount) {
            vm.startBroadcast(admin.key);
            usdc.mint(ph.addr, bondAmount);
            vm.stopBroadcast();
        }
        vm.startBroadcast(ph.key);
        usdc.approve(address(optimisticArbiter), type(uint256).max);
        uint256 claimId = optimisticArbiter.proposeClaim(
            commitmentId, 3_000, keccak256("sim.evidence.policyholder"), keccak256("sim.template.v1"), bondAmount
        );
        vm.stopBroadcast();
        console.log("  Open claim id %d (3000 bps), bond=%d USDC", claimId, uint256(bondAmount) / 1e6);

        // 3. Underwriter disputes with the protocol-required doubled bond.
        //    disputeClaim atomically cancels/re-opens the manager hold at the
        //    counter-asserted 1000 bps, so all three UI layers have live state.
        uint128 disputeBond = bondAmount * 2;
        if (usdc.balanceOf(uw.addr) < disputeBond) {
            vm.startBroadcast(admin.key);
            usdc.mint(uw.addr, disputeBond);
            vm.stopBroadcast();
        }
        vm.startBroadcast(uw.key);
        usdc.approve(address(optimisticArbiter), type(uint256).max);
        optimisticArbiter.disputeClaim(claimId, 1_000, keccak256("sim.evidence.underwriter"), disputeBond);
        vm.stopBroadcast();
        console.log("  Disputed claim id %d (1000 bps), bond=%d USDC", claimId, uint256(disputeBond) / 1e6);

        console.log("");
    }

    /// @dev Seeds the agent-bond use case (docs/protocol/use-cases/agent-bonds.md):
    ///      the agent persona registers an ERC-8004 identity (inline data: URI so the
    ///      indexer resolves the registration file without a gateway), funnels USDC
    ///      through the vault into cvUSDC shares, and posts a fully-slashable bond
    ///      commitment behind a content-addressed SLA, arbitrated by the optimistic
    ///      insurance arbiter. Depositor 0 plays the served user (counterparty). The
    ///      bond stays claim-free so the frontend shows a healthy agent with live,
    ///      still-earning backing (the open-claim demo already exists above).
    function _seedAgentBond() internal {
        console.log("--- Seeding ERC-8004 agent bond ---");

        // 1. Identity. agentId is an ERC-721 tokenId and starts at ZERO.
        string memory regJson = string.concat(
            '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1",',
            '"name":"Demo Intent Agent",',
            '"description":"Autonomous intent-execution agent; posts a slashable cvUSDC bond behind its SLA.",',
            '"services":[{"name":"A2A","endpoint":"https://agent.example/.well-known/agent-card.json"}],',
            '"x402Support":true,"active":true,',
            '"supportedTrust":["reputation","crypto-economic"]}'
        );
        vm.startBroadcast(agent.key);
        seededAgentId = agentIdentityRegistry.register(
            string.concat("data:application/json;base64,", Base64.encode(bytes(regJson)))
        );

        // 2. Capital goes to work: USDC -> cvUSDC shares -> manager free balance
        //    (the same productive-backing funnel the depositors use).
        uint256 capital = (depositAmount * 90) / 100;
        usdc.approve(address(usdcVault), type(uint256).max);
        uint256 bondShares = usdcVault.deposit(capital, agent.addr);
        usdcVault.approve(address(manager), type(uint256).max);
        manager.deposit(address(usdcVault), bondShares);

        // 3. The bond: fully slashable, SLA terms content-addressed on-chain. The
        //    seed challenge window == the arbiter's answerTimeout, satisfying the
        //    `challengeWindow >= answerTimeout` gate on proposeClaim.
        ICommitmentManager.CommitmentParams memory p = _params(
            address(optimisticArbiter),
            depositors[0].addr,
            address(usdcVault),
            address(erc4626Adapter),
            bondShares,
            10_000
        );
        // The SLA payload keeps its machine-readable fields but now declares a
        // `schemaVersion` and a `title`, per metadata.md. Previously it used
        // `type: "agent-sla.v1"`, which left the row unnamed and the detail
        // page showing a raw JSON dump. `agentId` is gone from the document:
        // it is assigned here at seed time while the catalogue is pinned
        // beforehand, and the agent is the committer on this commitment
        // anyway, which is the authoritative identification.
        _withMetadata(p, "agentBond.0");
        agentBondCommitmentId = manager.createCommitment(p);
        vm.stopBroadcast();

        console.log("  Agent %s registered as agentId %d", agent.addr, seededAgentId);
        console.log("  Agent bond commitment %d: %d cvUSDC (fully slashable)", agentBondCommitmentId, bondShares / 1e15);
        console.log("");
    }

    /// @dev The underwritten-agent-vault story (the coverage-market pattern): three
    ///      depositors fund cvaDAI (plain in-wallet vault positions — the protected
    ///      parties); underwriters (the agent with the lead stake plus two personas)
    ///      join a cvaDAI-numeraire mutual covering the vault's 5% drawdown floor;
    ///      the agent's fee-skimming strategy takes 20% of realized gains — 10% of
    ///      the skim to the agent as its operator fee, the rest to the keyless
    ///      VaultCoverConduit, which funds the underwriters' premium stream — so ALL
    ///      deposits are automatically covered. A breach is declared as a mutual
    ///      loss; settled units flow to the ForfeitDonationBeneficiary whose sweep
    ///      donates them back into the vault. Drive the breach with
    ///      `just demo-agent-breach`.
    function _seedAgentVaultUnderwriting() internal {
        if (address(mutualRegistry) == address(0)) {
            console.log("--- Underwritten agent vault (skipped: mutual periphery not seeded) ---");
            console.log("");
            return;
        }
        console.log("--- Seeding underwritten agent vault (cvaDAI coverage market) ---");

        // 1. cvaDAI metadata sidecar (indexer + vault surfaces).
        // NB: the base64 data URI must stay <= 512 bytes (MAX_METADATA_URI_LENGTH),
        // so the raw JSON budget is ~360 bytes — keep the description tight.
        string memory vaultJson = string.concat(
            '{"schemaVersion":"vault.v1",',
            '"name":"Agent Alpha DAI Vault",',
            '"description":"Deposits are auto-covered by an underwriter mutual paid from this vault\'s own yield; a proven 5% drawdown marks underwriters down to restore NAV.",',
            '"tags":["demo","dai","agent-managed","underwritten"],',
            '"riskTier":"aggressive",',
            '"curator":{"name":"Demo Intent Agent (ERC-8004 #0)"}}'
        );
        vm.startBroadcast(admin.key);
        agentVault.setMetadata(
            string.concat("data:application/json;base64,", Base64.encode(bytes(vaultJson))), keccak256(bytes(vaultJson))
        );

        // 2. The cvaDAI coverage market: fresh DAI-bonded mutual arbiter (bond token
        //    must match the market's payout denomination), registered against the
        //    restitution beneficiary — settled units donate back into the vault.
        agentMutualArbiter = new OptimisticMutualArbiter(address(manager), address(dai), 100e18, admin.addr, admin.addr);
        agentMutualArbiter.setCoverPolicy(address(mutualPolicy));
        string memory perilURI = _perilURI(
            "cvaDAI Drawdown Floor",
            // Kept short: the inline data: URI must fit MutualRegistry's 512-byte peril URI cap.
            "Vault-funded cover for cvaDAI depositors: the strategy skims part of realized yield as premium, and underwriters absorb drawdowns beyond the floor.",
            "cvaDAI NAV/share falls >5% below its post-skim high-water mark; loss = convertToShares(shortfall below floor)"
        );
        ICommitmentManager.MutualParams memory gp = ICommitmentManager.MutualParams({
            arbiter: address(agentMutualArbiter),
            numeraire: address(agentVault),
            beneficiary: address(agentVaultBeneficiary),
            challengeWindow: 172_800, // 2 days (hard mutual floor)
            deallocationWindow: 172_800
        });
        agentMutualId = mutualRegistry.registerMutual(
            gp, uint128(5_000 * 1e27), uint64(block.timestamp + 180 days), perilURI, keccak256(bytes(perilURI))
        );
        agentMutualArbiter.activate(agentMutualId);

        // 3. The keyless funding leg: conduit (vault's policyholder-of-record), then
        //    the fee-skimming strategy wired to it. Binding the strategy sweeps the
        //    vault's idle deposits in.
        vaultCoverConduit =
            new VaultCoverConduit(address(agentVault), address(mutualPolicy), agentMutualId, 30 days, 1e18);
        agentVaultStrategy = new SkimmingMockStrategy(
            address(dai), address(agentVault), agent.addr, address(vaultCoverConduit), 2_000, 1_000
        );
        vm.stopBroadcast();

        // 4. Depositors fund the vault (in-wallet shares — the protected parties).
        //    90% deposited; the 10% DAI reserve stays in-wallet for loss-declaration
        //    bonds (the DAI mutual arbiter's floor is 100 DAI).
        for (uint256 i = 0; i < depositors.length && i < 3; i++) {
            vm.startBroadcast(depositors[i].key);
            dai.approve(address(agentVault), type(uint256).max);
            agentVault.deposit((dai.balanceOf(depositors[i].addr) * 90) / 100, depositors[i].addr);
            vm.stopBroadcast();
        }
        vm.startBroadcast(admin.key);
        agentVault.setYieldStrategy(address(agentVaultStrategy));
        vm.stopBroadcast();

        // 5. Underwriters join: the agent leads with its full DAI stake (skin in the
        //    game AND its premium upside); two personas co-underwrite smaller lines.
        _underwriteAgentVault(agent, dai.balanceOf(agent.addr));
        vm.startBroadcast(admin.key);
        dai.mint(depositors[3].addr, 1_000e18);
        dai.mint(depositors[4].addr, 500e18);
        vm.stopBroadcast();
        _underwriteAgentVault(depositors[3], 1_000e18);
        _underwriteAgentVault(depositors[4], 500e18);

        // 6. The agent "performs": 2% backed yield, skimmed and poked so the market
        //    is LIVE at seed time — operator fee in the agent's wallet, premium
        //    stream paying the underwriters.
        vm.startBroadcast(admin.key);
        uint256 yieldAmount = agentVault.totalAssets() / 50;
        dai.mint(admin.addr, yieldAmount);
        dai.approve(address(agentVaultStrategy), yieldAmount);
        agentVaultStrategy.simulateBackedYield(yieldAmount);
        (uint256 opFee, uint256 premiumShare) = agentVaultStrategy.skim();
        (uint256 premium, uint64 streamDuration) = vaultCoverConduit.poke();
        vm.stopBroadcast();

        (,,, uint128 rewardRate,,,,,) = manager.getMutualPremiumState(agentMutualId);
        require(rewardRate > 0, "agent mutual premium stream must be live at seed time");
        console.log("  Coverage mutual %d: 3 underwriters, agent leads", agentMutualId);
        console.log("  Skim: %d DAI operator fee (agent), %d DAI premium share", opFee / 1e18, premiumShare / 1e18);
        console.log(
            "  Stream: %d cvaDAI premium over %d days (rewardRate > 0)", premium / 1e27, streamDuration / 86_400
        );
        console.log("");
    }

    /// @dev Underwriter path for the cvaDAI market: DAI (already in-wallet) -> cvaDAI
    ///      shares -> manager free balance -> mutual membership. maxPenaltyBps =
    ///      10_000 so E_i == shares in homogeneous mode.
    function _underwriteAgentVault(Wallet memory member, uint256 daiAmount) internal {
        vm.startBroadcast(member.key);
        dai.approve(address(agentVault), daiAmount);
        uint256 shares = agentVault.deposit(daiAmount, member.addr);
        agentVault.approve(address(manager), type(uint256).max);
        manager.deposit(address(agentVault), shares);

        ICommitmentManager.CommitmentParams memory p = _params(
            address(agentMutualArbiter),
            address(agentVaultBeneficiary),
            address(agentVault),
            address(erc4626Adapter),
            shares,
            10_000
        );
        p.challengeWindow = 86_400; // 1 day (member commitment; the mutual window governs losses)

        uint256 commitmentId = manager.joinMutual(agentMutualId, p);
        vm.stopBroadcast();
        console.log("  Underwriter %s: commitment %d (%d cvaDAI)", member.addr, commitmentId, shares / 1e27);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  MUTUALS — pooled shared-loss insurance ("risk coverage through mutuals")
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Seeds the protocol's flagship use case: three live risk-coverage mutuals,
    ///      each a distinct peril, all homogeneous (oracle-free) and cvUSDC-numeraired:
    ///
    ///        A. cvUSDC Vault NAV Shortfall / Guaranteed-APY  — pays cvUSDC savers when the
    ///           vault strategy returns under its target (or on a NAV drawdown / hack).
    ///        B. USDT De-Peg Protection                       — pays cvUSDT holders if USDT depegs.
    ///        C. Operator Slashing Cover                      — reimburses delegators on a slash.
    ///
    ///      Shared periphery: one MutualRegistry, one bonded OptimisticMutualArbiter (claims are
    ///      keyed by mutualId), and the premium leg — a PremiumScheduler (utilization-curve
    ///      pricing) + LinkedMutualPolicy (binds cover, pulls the premium, funds the core stream).
    ///      Each peril gets its OWN ClaimRouter beneficiary whose claimant is that peril's
    ///      policyholder. For every mutual we: register + activate, fill with underwriters, then
    ///      bind a LIVE cover policy so a premium stream is actually flowing to members on first
    ///      load (members have claimable premium immediately).
    ///
    ///      ⚠️ HARD mutual timer floors (MutualLib, no override): challengeWindow >= 2 days,
    ///      deallocationWindow >= challengeWindow. Both set to 172800s here.
    ///
    ///      ⚠️ NO executed-loss flow here: the 2-day mutual challenge window can't elapse under
    ///      `--broadcast`. The loss path (declare → settle → claim) is driven from the admin Risk
    ///      tab over real wall-clock time.
    function _seedMutuals() internal {
        if (depositors.length < 5) {
            console.log("--- Mutuals (skipped: needs >= 5 depositors) ---");
            console.log("");
            return;
        }
        console.log("--- Seeding risk-coverage mutuals (A: NAV/APY, B: De-Peg, C: Slashing) ---");

        _seedMutualPeriphery();

        // ── Mutual A: cvUSDC Vault NAV Shortfall / Guaranteed-APY ───────────────
        navClaimRouter = _deployRouter(depositors[3].addr); // claimant = the protected cvUSDC saver
        navMutualId = _registerActivateMutual(
            _perilURI(
                "cvUSDC Vault NAV Shortfall Cover",
                "Guaranteed-APY protection for cvUSDC savers: pays out if the vault strategy returns below its target APY or on an exploit.",
                "cvUSDC vault NAV falls below the guaranteed floor"
            ),
            uint128(5_000 * 1e15),
            address(navClaimRouter)
        );
        _joinMutual(depositors[0], navMutualId, address(navClaimRouter), 1_500 * 1e6, "mutual.nav");
        _joinMutual(depositors[1], navMutualId, address(navClaimRouter), 1_000 * 1e6, "mutual.nav");
        _joinMutual(depositors[2], navMutualId, address(navClaimRouter), 500 * 1e6, "mutual.nav");
        _bindCover(depositors[3], navMutualId, 2_000 * 1e15, 180 days);

        // ── Mutual B: USDT De-Peg Protection ────────────────────────────────────
        depegClaimRouter = _deployRouter(depositors[4].addr); // claimant = the cvUSDT holder
        depegMutualId = _registerActivateMutual(
            _perilURI(
                "USDT De-Peg Protection",
                "Pays cvUSDT holders if USDT trades below $0.97 for a sustained window. Underwritten in cvUSDC so cover capital is uncorrelated with the peg.",
                "USDT trades below $0.97 (sustained)"
            ),
            uint128(4_000 * 1e15),
            address(depegClaimRouter)
        );
        _joinMutual(depositors[1], depegMutualId, address(depegClaimRouter), 1_200 * 1e6, "mutual.depeg");
        _joinMutual(depositors[2], depegMutualId, address(depegClaimRouter), 800 * 1e6, "mutual.depeg");
        _joinMutual(depositors[3], depegMutualId, address(depegClaimRouter), 500 * 1e6, "mutual.depeg");
        _bindCover(depositors[4], depegMutualId, 1_500 * 1e15, 180 days);

        // ── Mutual C: Operator Slashing Cover ───────────────────────────────────
        slashingClaimRouter = _deployRouter(depositors[3].addr); // claimant = a delegator
        slashingMutualId = _registerActivateMutual(
            _perilURI(
                "Operator Slashing Cover",
                "Reimburses delegators when a registered operator is slashed for a fault. Underwriters share the loss across the pool.",
                "a registered operator is slashed"
            ),
            uint128(4_000 * 1e15),
            address(slashingClaimRouter)
        );
        // Underwriters are the registered operators (depositors 0..2).
        _joinMutual(depositors[0], slashingMutualId, address(slashingClaimRouter), 1_000 * 1e6, "mutual.slashing");
        _joinMutual(depositors[1], slashingMutualId, address(slashingClaimRouter), 1_000 * 1e6, "mutual.slashing");
        _joinMutual(depositors[2], slashingMutualId, address(slashingClaimRouter), 1_000 * 1e6, "");
        _bindCover(depositors[3], slashingMutualId, 1_500 * 1e15, 180 days);

        console.log("  Three ACTIVE mutuals with members + live premium streams (Lambda=0, no loss)");
        console.log("");
    }

    /// @dev Deploy the shared mutual periphery and wire the premium leg.
    function _seedMutualPeriphery() internal {
        uint256 minBond = 100 * 1e6; // 100 USDC loss-declaration bond (raw USDC)
        vm.startBroadcast(admin.key);
        mutualRegistry = new MutualRegistry(address(manager));
        optimisticMutualArbiter =
            new OptimisticMutualArbiter(address(manager), address(usdc), minBond, admin.addr, admin.addr);
        premiumScheduler = new PremiumScheduler(address(manager), admin.addr);
        mutualPolicy = new LinkedMutualPolicy(address(manager), address(premiumScheduler));

        // Wire: scheduler -> policy, a default utilization curve, and the cover-policy pointer
        // the arbiter (loss-claim cover snapshots) references.
        premiumScheduler.setPolicy(address(mutualPolicy));
        // base 2%/yr; +8%/yr below the 80% kink; +50%/yr above; 5x leverage cap.
        premiumScheduler.setDefaultCurve(0.02e18, 0.08e18, 0.5e18, 0.8e18, 50_000);
        optimisticMutualArbiter.setCoverPolicy(address(mutualPolicy));
        vm.stopBroadcast();

        console.log("MutualRegistry:  ", address(mutualRegistry));
        console.log("OptimisticMutualArbiter:", address(optimisticMutualArbiter));
        console.log("PremiumScheduler:   ", address(premiumScheduler));
        console.log("LinkedMutualPolicy: ", address(mutualPolicy));
    }

    /// @dev Deploy a per-peril ClaimRouter beneficiary with the given claimant (the policyholder
    ///      who collects on a settled loss).
    function _deployRouter(address claimant) internal returns (ClaimRouter router) {
        vm.startBroadcast(admin.key);
        router = new ClaimRouter(address(manager), claimant);
        vm.stopBroadcast();
    }

    /// @dev Register a homogeneous (oracle-free) cvUSDC mutual against `beneficiary` and activate it.
    ///      Members can only join an ACTIVE mutual; the arbiter owner (admin) flips it active.
    function _registerActivateMutual(string memory perilURI, uint128 targetCapacity, address beneficiary)
        internal
        returns (uint256 mutualId)
    {
        bytes32 perilHash = keccak256(bytes(perilURI));
        uint64 termEnd = uint64(block.timestamp + 180 days);
        ICommitmentManager.MutualParams memory gp = ICommitmentManager.MutualParams({
            arbiter: address(optimisticMutualArbiter),
            numeraire: address(usdcVault),
            beneficiary: beneficiary,
            challengeWindow: 172_800, // 2 days (hard mutual floor)
            deallocationWindow: 172_800 // >= challengeWindow
        });
        vm.startBroadcast(admin.key);
        mutualId = mutualRegistry.registerMutual(gp, targetCapacity, termEnd, perilURI, perilHash);
        optimisticMutualArbiter.activate(mutualId);
        vm.stopBroadcast();
        console.log("  Registered + activated mutualId %d (target %d cvUSDC)", mutualId, targetCapacity / 1e15);
    }

    /// @dev Inline `data:application/json;base64,` peril metadata (schema `peril.v1`), mirroring the
    ///      vault/commitment metadata pattern so the indexer resolves name/description without a
    ///      gateway. The frontend renders `name` as the peril label.
    function _perilURI(string memory name, string memory description, string memory trigger)
        internal
        pure
        returns (string memory)
    {
        string memory json = string.concat(
            '{"schemaVersion":"peril.v1","name":"',
            name,
            '","description":"',
            description,
            '","trigger":"',
            trigger,
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Mint fresh USDC to `member`, route it through the vault into cvUSDC shares in the
    ///      manager, then `joinMutual` (committer = caller, counterparty = the mutual beneficiary).
    ///      The join line is the ACTUAL shares minted (vault NAV has lifted from earlier donations,
    ///      so a fixed share figure can't be assumed). maxPenaltyBps = 10_000 so E_i == amount ==
    ///      creditedValue; the member commitment's own challengeWindow is 1 day.
    function _joinMutual(
        Wallet memory member,
        uint256 mutualId,
        address beneficiary,
        uint256 usdcNotional,
        string memory metadataKey
    ) internal {
        vm.startBroadcast(admin.key);
        usdc.mint(member.addr, usdcNotional);
        vm.stopBroadcast();

        vm.startBroadcast(member.key);
        // USDC -> cvUSDC shares -> manager free balance. Members are existing depositors, so
        // cvUSDC is already max-approved to the manager (see _createDeposits).
        usdc.approve(address(usdcVault), usdcNotional);
        uint256 shares = usdcVault.deposit(usdcNotional, member.addr);
        manager.deposit(address(usdcVault), shares);

        ICommitmentManager.CommitmentParams memory p = _params(
            address(optimisticMutualArbiter), beneficiary, address(usdcVault), address(erc4626Adapter), shares, 10_000
        );
        p.challengeWindow = 86_400; // 1 day (>= MIN_CHALLENGE_WINDOW; member commitment)
        // The mutual publishes a `peril.v1` document naming its covered event;
        // the member commitments that FUND it used to say nothing. Keyed by
        // peril rather than by member: everyone underwriting one mutual
        // underwrites the same thing, and the differences are amounts.
        if (bytes(metadataKey).length > 0) _withMetadata(p, metadataKey);

        uint256 commitmentId = manager.joinMutual(mutualId, p);
        vm.stopBroadcast();
        console.log("  Member %s joined mutual %d: commitment %d", member.addr, mutualId, commitmentId);
    }

    /// @dev Bind a LIVE cover policy: `policyholder` gets fresh cvUSDC in-wallet (the premium
    ///      currency = the cvUSDC numeraire), approves the policy, and binds `notional` of cover for
    ///      `duration`. This pulls the priced premium and funds the mutual's Synthetix premium
    ///      stream, so members start accruing claimable premium immediately.
    function _bindCover(Wallet memory policyholder, uint256 mutualId, uint256 notional, uint64 duration) internal {
        // 500 USDC of premium budget -> cvUSDC in the policyholder's wallet.
        uint256 premiumBudget = 500 * 1e6;
        vm.startBroadcast(admin.key);
        usdc.mint(policyholder.addr, premiumBudget);
        vm.stopBroadcast();

        vm.startBroadcast(policyholder.key);
        usdc.approve(address(usdcVault), premiumBudget);
        usdcVault.deposit(premiumBudget, policyholder.addr); // cvUSDC kept in-wallet
        usdcVault.approve(address(mutualPolicy), type(uint256).max);
        uint256 bindingId = mutualPolicy.bindCover(mutualId, notional, duration);
        vm.stopBroadcast();
        console.log("  Cover bound on mutual %d: binding %d (%d cvUSDC notional)", mutualId, bindingId, notional / 1e15);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  GOVERNANCE (reference DAO)
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Deploy the canonical Commitments DAO bound to the existing
    ///         TokenWeighting mesh node. Admin transfers TokenWeighting
    ///         governance over to the Timelock so the DAO can drive
    ///         updateWeight via successful proposals.
    ///
    /// @dev Dev parameters are short on purpose so a full lifecycle (propose
    ///      -> active -> succeeded -> queued -> executed) fits inside a
    ///      Simulate run. Mainnet deploys override these via DAOConfig.
    function _deployGovernance() internal {
        console.log("--- Governance ---");

        vm.startBroadcast(admin.key);

        // 1. Impls + factory.
        CommitmentsGovernor governorImpl = new CommitmentsGovernor();
        CommitmentsTimelock timelockImpl = new CommitmentsTimelock();
        governorFactory = new GovernorFactory(address(governorImpl), address(timelockImpl));
        console.log("GovernorFactory:    ", address(governorFactory));

        // 2. Deploy the reference DAO.
        // Dev parameters bootstrap to votingPeriod=1 so the seed lifecycle
        // (propose → vote → queue → execute) walks under `forge script --slow`
        // in four consecutive blocks without time-warping anvil. The third
        // seeded proposal (`_seedGovernanceProposal`) calls
        // governor.setVotingPeriod(USABLE_VOTING_PERIOD) so user-created
        // proposals get a 60-second voting window once anvil's interval
        // mining is enabled. Mainnet deploys override all of these: typical
        // config is votingDelay=1d, votingPeriod=7d, timelock=2d,
        // lateQuorumExtension=1d.
        GovernorFactory.DAOConfig memory cfg = GovernorFactory.DAOConfig({
            name: "Commitments DAO",
            source: IVotingPowerSource(tokenWeightingNode),
            timelockMinDelay: 0, // seconds; mainnet would use ~2 days
            votingDelay: 0, // blocks; vote becomes Active at the next block
            votingPeriod: 1, // blocks; bumped to USABLE_VOTING_PERIOD by the
            // governance bootstrap proposal so user-created proposals
            // get a usable voting window
            proposalThreshold: 0,
            quorumNumerator: 4, // 4% of past total power
            lateQuorumExtension: 0 // disabled in seed; mainnet would set ~1d
        });
        GovernorFactory.DAODeployment memory dao = governorFactory.deploy(cfg);
        governor = CommitmentsGovernor(payable(dao.governor));
        timelock = CommitmentsTimelock(payable(dao.timelock));
        votesShim = TokenWeightingVotesShim(dao.shim);

        // Mark canonical so the indexer + frontend index this instance as the
        // protocol's reference DAO.
        governorFactory.setCanonicalGovernor(dao.governor);

        console.log("Governor:           ", dao.governor);
        console.log("Timelock:           ", dao.timelock);
        console.log("VotesShim:          ", dao.shim);
        console.log("  votingPowerSource ->", tokenWeightingNode);
        console.log("  canonical:        true");

        // 3. Hand TokenWeighting governance to the Timelock so the DAO can
        //    update weights via proposals (whitepaper §6).
        TokenWeighting(tokenWeightingNode).transferGovernance(address(timelock));
        console.log("  TokenWeighting governance -> Timelock");

        vm.stopBroadcast();
        console.log("");
    }

    /// @notice Seed three representative proposals so the frontend has data to
    ///         render: a TokenWeighting weight-update (whitepaper §6 use case),
    ///         a metadata-only signaling proposal, and a governance self-update.
    ///         All run end-to-end so the indexer sees the full
    ///         Pending->Active->Succeeded->Queued->Executed transitions.
    ///
    /// @dev Vote weight here comes from operators[] who were credited voting power
    ///      when they registered/delegated (OperatorRegistry -> TokenWeighting). The
    ///      `--slow` flag (used by Simulate per CLAUDE.md) ensures Checkpoints advance
    ///      correctly between propose/vote/queue/execute steps.
    function _seedGovernanceProposal() internal {
        if (operators.length == 0) {
            console.log("--- Governance Proposals (skipped: no operators) ---");
            return;
        }
        console.log("--- Governance Proposals ---");

        bytes32 usdcStakeDenom = _denomFor(address(usdcVault));

        // ----- Proposal 1: weight update -----
        {
            address[] memory targets = new address[](1);
            uint256[] memory values = new uint256[](1);
            bytes[] memory calldatas = new bytes[](1);
            targets[0] = tokenWeightingNode;
            values[0] = 0;
            // Apply a 10% governance risk haircut to the cvUSDC denom: 1e7 -> 9e6 (0.9x),
            // keeping the 18-dec normalization intact (a raw bps value would wipe it out).
            calldatas[0] = abi.encodeCall(TokenWeighting.updateWeight, (usdcStakeDenom, (CVUSDC_DENOM_WEIGHT * 9) / 10));
            string memory description = "[Weight] Apply 0.9x risk haircut to cvUSDC denom";
            seededGovernanceProposalId = _runProposalLifecycle(targets, values, calldatas, description, "weight_update");
        }

        // ----- Proposal 2: signaling (metadata-only) -----
        // Empty calldata to the timelock = no-op; description carries the signal.
        {
            address[] memory targets = new address[](1);
            uint256[] memory values = new uint256[](1);
            bytes[] memory calldatas = new bytes[](1);
            targets[0] = address(timelock);
            values[0] = 0;
            calldatas[0] = "";
            string memory description = "[Signal] Adopt mesh-aware risk tier metadata schema v1";
            _runProposalLifecycle(targets, values, calldatas, description, "signaling");
        }

        // ----- Proposal 3: governance self-update -----
        // Bumps votingPeriod from 1 (seed-tight) to USABLE_VOTING_PERIOD so
        // user-created proposals get a real voting window. Walks the full
        // lifecycle while votingPeriod=1 is still in effect — the new value
        // takes effect for proposals created AFTER this one executes.
        {
            address[] memory targets = new address[](1);
            uint256[] memory values = new uint256[](1);
            bytes[] memory calldatas = new bytes[](1);
            targets[0] = address(governor);
            values[0] = 0;
            calldatas[0] = abi.encodeWithSignature("setVotingPeriod(uint32)", USABLE_VOTING_PERIOD);
            string memory description = string(
                abi.encodePacked(
                    "[Governance] Bump votingPeriod 1 -> ",
                    Strings.toString(USABLE_VOTING_PERIOD),
                    " for usable voting window"
                )
            );
            _runProposalLifecycle(targets, values, calldatas, description, "governance");
        }
        console.log("");
    }

    /// @dev Walk a proposal through propose -> vote -> queue -> execute.
    ///      Seed-tuned config (votingDelay=0, votingPeriod=1,
    ///      lateQuorumExtension=0, timelockMinDelay=0) keeps the lifecycle to
    ///      four consecutive blocks. operators[0] alone clears 4% quorum.
    ///
    ///      `vm.roll(block.number + 1)` between steps is required so the
    ///      simulation pass advances block.number — without it, every
    ///      simulated tx happens at the same block, and castVote reverts
    ///      Pending-state. During the actual `--broadcast --slow` pass
    ///      vm.roll is inert against the real chain, but each tx mines a
    ///      new anvil block naturally so both passes agree on the resulting
    ///      proposal state.
    function _runProposalLifecycle(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        string memory label
    ) internal returns (uint256 proposalId) {
        // OZ Governor reads a proposal whose snapshot block is 0 as nonexistent. On a fresh anvil
        // the simulation pass starts at block 0 and only vm.roll moves it, so make sure T >= 1.
        if (block.number == 0) vm.roll(1);

        // Block T: propose. voteStart=T, voteEnd=T+1.
        vm.startBroadcast(operators[0].key);
        proposalId = governor.propose(targets, values, calldatas, description);
        vm.stopBroadcast();
        vm.roll(block.number + 1);

        console.log("Proposal:");
        console.log("  label:         ", label);
        console.log("  id:            ", proposalId);

        // Block T+1: cast a single For vote. State is Active
        // (clock T+1 > snapshot T && deadline T+1 >= clock T+1).
        vm.startBroadcast(operators[0].key);
        governor.castVote(proposalId, 1);
        vm.stopBroadcast();
        vm.roll(block.number + 1);

        // Block T+2: queue. State is Succeeded (clock T+2 > deadline T+1,
        // forVotes > 0 > againstVotes, quorum cleared). timelockMinDelay=0
        // so eta = block.timestamp at T+2.
        bytes32 descriptionHash = keccak256(bytes(description));
        vm.startBroadcast(operators[0].key);
        governor.queue(targets, values, calldatas, descriptionHash);
        vm.stopBroadcast();
        vm.roll(block.number + 1);

        // Block T+3: execute. timestamp(T+3) >= eta(T+2 timestamp).
        vm.startBroadcast(operators[0].key);
        governor.execute(targets, values, calldatas, descriptionHash);
        vm.stopBroadcast();
        vm.roll(block.number + 1);

        console.log("  -> executed");
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SUMMARY
    // ═════════════════════════════════════════════════════════════════════════

    function _printSummary() internal view {
        console.log("===============================================");
        console.log("  SIMULATION COMPLETE (v2 topology)");
        console.log("===============================================");
        console.log("");
        console.log("--- Contract Addresses ---");
        console.log("USDC Token:         ", address(usdc));
        console.log("WETH Token:         ", address(weth));
        console.log("CommitmentsVault (USDC):", address(usdcVault));
        console.log("CommitmentsVault (WETH):", address(wethVault));
        console.log("CommitmentManager:  ", address(manager));
        console.log("ERC20StaticAdapter: ", address(erc20Adapter));
        console.log("ERC4626Adapter:     ", address(erc4626Adapter));
        console.log("IndexAppreciationYield:", address(indexYield));
        console.log("FlatFeeAtCreate:    ", address(flatFee));
        console.log("ManualArbiter:      ", address(manualArbiter));
        console.log("TwoTierArbiter:     ", address(twoTierArbiter));
        console.log("AttestationArbiter: ", address(attestationArbiter));
        console.log("  owner:            ", arbiter.addr);
        console.log("OperatorRegistry:   ", address(operatorRegistry));
        console.log("StakeRegistry:      ", address(stakeRegistry));
        console.log("MeshFactory:        ", address(meshFactory));
        console.log("FanInNode:          ", fanInNode);
        console.log("FanOutNode:         ", fanOutNode);
        console.log("TokenWeighting:     ", tokenWeightingNode);
        console.log("");
        console.log("--- Governance (canonical DAO) ---");
        console.log("GovernorFactory:    ", address(governorFactory));
        console.log("Governor:           ", address(governor));
        console.log("Timelock:           ", address(timelock));
        console.log("VotesShim:          ", address(votesShim));
        console.log("Seeded proposalId:  ", seededGovernanceProposalId);
        console.log("");
        console.log("--- Marketplace Pattern Contracts ---");
        console.log("OptimisticInsuranceArbiter:", address(optimisticArbiter));
        console.log("");
        console.log("--- ERC-8004 Agent Identity ---");
        console.log("IdentityRegistry:   ", address(agentIdentityRegistry));
        console.log("  agent persona:    ", agent.addr);
        console.log("  agentId:          ", seededAgentId);
        console.log("  bond commitmentId:", agentBondCommitmentId);
        console.log("  underwritten agent vault (cvaDAI):", address(agentVault));
        console.log("    skim strategy:  ", address(agentVaultStrategy));
        console.log("    cover conduit:  ", address(vaultCoverConduit));
        console.log("    mutual arbiter: ", address(agentMutualArbiter));
        console.log("    beneficiary:    ", address(agentVaultBeneficiary));
        console.log("    coverage mutualId:", agentMutualId);
        console.log("    breach demo:     just demo-agent-breach");
        console.log("");
        console.log("--- Risk-coverage Mutuals ---");
        console.log("MutualRegistry:  ", address(mutualRegistry));
        console.log("OptimisticMutualArbiter:", address(optimisticMutualArbiter));
        console.log("PremiumScheduler:   ", address(premiumScheduler));
        console.log("LinkedMutualPolicy: ", address(mutualPolicy));
        console.log("  A NAV/APY mutualId:   ", navMutualId);
        console.log("    router:             ", address(navClaimRouter));
        console.log("  B De-Peg mutualId:    ", depegMutualId);
        console.log("    router:             ", address(depegClaimRouter));
        console.log("  C Slashing mutualId:  ", slashingMutualId);
        console.log("    router:             ", address(slashingClaimRouter));
        console.log("  numeraire cvUSDC (homogeneous); ACTIVE, Lambda=0, live premium streams");
        console.log("");
        console.log("--- Test Wallets ---");
        console.log("Admin (account 0):   ", admin.addr);
        console.log("Arbiter (account 1): ", arbiter.addr);
        for (uint256 i = 0; i < depositors.length && i < 5; i++) {
            console.log("Depositor", i, ":       ", depositors[i].addr);
        }
        if (depositors.length > 5) {
            console.log("  ... and", depositors.length - 5, "more");
        }
        console.log("");
        console.log("--- Mesh Nodes (for frontend explorer) ---");
        console.log("Enter any of these in the Mesh Explorer:");
        console.log("  FanIn:            ", fanInNode);
        console.log("  FanOut:           ", fanOutNode);
        console.log("  TokenWeighting:   ", tokenWeightingNode);
        console.log("");
        console.log("Import account 2 into MetaMask:");
        console.log("  Private key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
        console.log("===============================================");
    }
}
