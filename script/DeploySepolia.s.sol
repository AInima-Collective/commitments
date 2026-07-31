// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";
import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {FlatFeeAtCreate} from "src/distributions/FlatFeeAtCreate.sol";
import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {ManualArbiter} from "src/periphery/arbiters/ManualArbiter.sol";
import {FanInNode} from "src/extensions/mesh/FanInNode.sol";
import {FanOutNode} from "src/extensions/mesh/FanOutNode.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {MeshFactory} from "src/extensions/mesh/MeshFactory.sol";
import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {GovernorFactory} from "src/periphery/governance/GovernorFactory.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";

// The faucet backing token. MockERC20 (under test/) has a permissionless
// `mint(to, amount)` — exactly the "anyone can mint and exercise commitments"
// faucet the deployment plan calls for. We deploy it as-is rather than adding a
// near-identical src/ token; for Sepolia a public mint is the desired behavior.
import {MockERC20} from "../test/helpers/MockERC20.sol";

/// @title DeploySepolia
/// @notice Composing, broadcast-ready deploy of the full v2 Commitments stack to
///         Ethereum Sepolia (chainId 11155111). UNLIKE `Simulate.s.sol` this
///         script does NOT derive Anvil-mnemonic accounts and does NOT seed any
///         demo state (deposits / commitments / operators / agreements). It
///         deploys contracts in dependency order, wires the manager↔registry
///         callback, and prints every address for the deployment record.
///
/// @dev Deploys in the order the issue checklist mandates:
///        1. Faucet backing ERC-20 (MockERC20, public mint).
///        2. VaultFactory + one ERC-4626 vault wrapping the faucet token.
///        3. CommitmentManager impl + libs (forge auto-links) + ERC1967Proxy.
///        4. Backing adapters (ERC20Static, ERC4626) + strategies.
///        5. ManualArbiter (the registry requires a *contract* arbiter).
///        6. OperatorRegistry impl + proxy.
///        7. Manager → registry wiring (`setOperatorRegistry`).
///        8. Mesh impls + MeshFactory + one TokenWeighting node (the stake
///           registry's voting-power source).
///        9. OperatorServiceRegistry impl + proxy.
///       10. Optional governance + rewards factories (DEPLOY_GOVERNANCE / DEPLOY_REWARDS).
///
/// All roles default to the broadcaster (`msg.sender`) but can be overridden:
///
///   PRIVATE_KEY            — deployer key (required by `--broadcast`; not read here)
///   ADMIN_ADDRESS          — DEFAULT_ADMIN_ROLE / PAUSER holder    (default: msg.sender)
///   ARBITER_OWNER_ADDRESS  — owner of the ManualArbiter            (default: msg.sender)
///   FAUCET_NAME            — backing token name      (default: "Commitments Test USD")
///   FAUCET_SYMBOL          — backing token symbol    (default: "tUSD")
///   FAUCET_DECIMALS        — backing token decimals  (default: 6)
///   UNBONDING_PERIOD       — manager unbonding seconds (default: 86400 = 1 day)
///   MIN_OPERATOR_STAKE     — min operator stake, whole units of the faucet token (default: 100)
///   MAX_OPERATORS          — registry operator cap   (default: 1024)
///   STAKE_THRESHOLD        — stake registry threshold weight, whole units (default: 50)
///   QUORUM_NUMERATOR       — stake registry quorum numerator (default: 2)
///   QUORUM_DENOMINATOR     — stake registry quorum denominator (default: 3)
///   DEPLOY_GOVERNANCE      — "true" to deploy governance impls + factory (default: false)
///   DEPLOY_REWARDS         — "true" to deploy rewards impls + factory   (default: false)
///   MIN_ACTIVATION_DELAY   — rewards activation delay seconds (default: 86400)
///
/// Usage (a human supplies the secrets — DO NOT broadcast from CI without them):
///   forge script script/DeploySepolia.s.sol:DeploySepolia \
///     --rpc-url sepolia --broadcast --verify --slow \
///     --private-key $PRIVATE_KEY
///
///   `--slow` (one tx per block) matches Simulate's rationale: OZ Checkpoints in
///   TokenWeighting are block.number-sensitive. `--verify` uses the [etherscan]
///   table in foundry.toml (ETHERSCAN_API_KEY).
contract DeploySepolia is Script {
    // ─── Config (env overridable) ────────────────────────────────────────────
    address admin;
    address arbiterOwner;
    string faucetName;
    string faucetSymbol;
    uint8 faucetDecimals;
    uint64 unbondingPeriod;
    uint256 minOperatorStake;
    uint256 maxOperators;
    uint256 stakeThreshold;
    uint256 quorumNumerator;
    uint256 quorumDenominator;
    bool deployGovernance;
    bool deployRewards;
    uint64 minActivationDelay;

    // ─── Deployed contracts ──────────────────────────────────────────────────
    MockERC20 faucetToken;
    VaultFactory vaultFactory;
    CommitmentsVault vault;
    CommitmentManager manager;
    ERC20StaticAdapter erc20Adapter;
    ERC4626Adapter erc4626Adapter;
    IndexAppreciationYield indexYield;
    FlatFeeAtCreate flatFee;
    ManualArbiter manualArbiter;
    OperatorRegistry operatorRegistry;
    MeshFactory meshFactory;
    address tokenWeightingNode;
    OperatorServiceRegistry stakeRegistry;
    GovernorFactory governorFactory;
    RewardsCoordinatorFactory rewardsFactory;

    function run() external {
        _loadConfig();

        vm.startBroadcast();

        // 1. Faucet backing token (public mint).
        faucetToken = new MockERC20(faucetName, faucetSymbol, faucetDecimals);
        console.log("FaucetToken (%s):", faucetSymbol, address(faucetToken));

        // 2. VaultFactory + one ERC-4626 vault wrapping the faucet token. Idle
        //    strategy (address(0)) — vault SHARES double as appreciating manager
        //    backing priced via ERC4626Adapter; raw faucet tokens use the static
        //    adapter. Both backing paths are therefore exercisable.
        CommitmentsVault vaultImpl = new CommitmentsVault();
        vaultFactory = new VaultFactory(address(vaultImpl));
        vault = CommitmentsVault(vaultFactory.deployVault(address(faucetToken), admin, address(0)));
        console.log("CommitmentsVault impl:", address(vaultImpl));
        console.log("VaultFactory:        ", address(vaultFactory));
        console.log("CommitmentsVault:    ", address(vault));

        // 3. CommitmentManager — impl + (forge auto-deployed/linked libs) + proxy.
        CommitmentManager cmImpl = new CommitmentManager();
        bytes memory cmInit = abi.encodeCall(CommitmentManager.initialize, (admin, unbondingPeriod, 14 days));
        manager = CommitmentManager(address(new ERC1967Proxy(address(cmImpl), cmInit)));
        console.log("CommitmentManager impl:", address(cmImpl));
        console.log("CommitmentManager:   ", address(manager));

        // 4. Backing adapters + distribution strategies (strategies are
        //    manager-scoped: hooks are gated to this manager).
        erc20Adapter = new ERC20StaticAdapter();
        erc4626Adapter = new ERC4626Adapter();
        indexYield = new IndexAppreciationYield(address(manager));
        flatFee = new FlatFeeAtCreate(address(manager));
        console.log("ERC20StaticAdapter:  ", address(erc20Adapter));
        console.log("ERC4626Adapter:      ", address(erc4626Adapter));
        console.log("IndexAppreciationYield:", address(indexYield));
        console.log("FlatFeeAtCreate:     ", address(flatFee));

        // 5. ManualArbiter — the registry's requiredArbiter must be a contract,
        //    not an EOA. Owned by arbiterOwner, bound to the manager.
        manualArbiter = new ManualArbiter(arbiterOwner, address(manager));
        console.log("ManualArbiter:       ", address(manualArbiter));

        // 6. OperatorRegistry impl + proxy. v2 acceptance policy (7-arg init):
        //    arbiter == manualArbiter, maxPenaltyBps >= 10_000, requiredToken ==
        //    raw faucet token (stake denomination), no bound strategies.
        OperatorRegistry orImpl = new OperatorRegistry();
        bytes memory orInit = abi.encodeCall(
            OperatorRegistry.initialize,
            (
                address(manager),
                minOperatorStake,
                maxOperators,
                admin,
                address(manualArbiter),
                uint16(10_000),
                address(faucetToken)
            )
        );
        operatorRegistry = OperatorRegistry(address(new ERC1967Proxy(address(orImpl), orInit)));
        console.log("OperatorRegistry impl:", address(orImpl));
        console.log("OperatorRegistry:    ", address(operatorRegistry));

        // 7. Post-deploy wiring: manager delegation callbacks -> registry.
        manager.setOperatorRegistry(address(operatorRegistry));
        console.log("Wired: manager.setOperatorRegistry(registry)");

        // 8. Mesh impls + factory + one TokenWeighting node (admin is provider +
        //    governance so it can be re-pointed at the registry/governor later).
        FanInNode fanInImpl = new FanInNode();
        FanOutNode fanOutImpl = new FanOutNode();
        TokenWeighting twImpl = new TokenWeighting();
        meshFactory = new MeshFactory(address(fanInImpl), address(fanOutImpl), address(twImpl));
        tokenWeightingNode = meshFactory.deployTokenWeightingAt(keccak256("sepolia.tw.v1"), admin, admin);
        console.log("MeshFactory:         ", address(meshFactory));
        console.log("TokenWeighting node: ", tokenWeightingNode);

        // 9. OperatorServiceRegistry impl + proxy. Voting-power source is the
        //    TokenWeighting node deployed above.
        OperatorServiceRegistry srImpl = new OperatorServiceRegistry();
        bytes memory srInit = abi.encodeCall(
            OperatorServiceRegistry.initialize,
            (address(operatorRegistry), tokenWeightingNode, admin, stakeThreshold, quorumNumerator, quorumDenominator)
        );
        stakeRegistry = OperatorServiceRegistry(address(new ERC1967Proxy(address(srImpl), srInit)));
        console.log("OperatorServiceRegistry impl:", address(srImpl));
        console.log("OperatorServiceRegistry:", address(stakeRegistry));

        // 10. Optional governance / rewards factories (impls only; instances are
        //     spawned later via factory.deploy / deployCoordinator).
        if (deployGovernance) {
            CommitmentsGovernor govImpl = new CommitmentsGovernor();
            CommitmentsTimelock tlImpl = new CommitmentsTimelock();
            governorFactory = new GovernorFactory(address(govImpl), address(tlImpl));
            console.log("CommitmentsGovernor impl:", address(govImpl));
            console.log("CommitmentsTimelock impl:", address(tlImpl));
            console.log("GovernorFactory:     ", address(governorFactory));
        }
        if (deployRewards) {
            MerkleSnapshot snapImpl = new MerkleSnapshot();
            CommitmentsRewardsCoordinator coordImpl = new CommitmentsRewardsCoordinator();
            rewardsFactory = new RewardsCoordinatorFactory(address(coordImpl), address(snapImpl), minActivationDelay);
            console.log("MerkleSnapshot impl: ", address(snapImpl));
            console.log("RewardsCoordinator impl:", address(coordImpl));
            console.log("RewardsCoordinatorFactory:", address(rewardsFactory));
        }

        vm.stopBroadcast();

        _printSummary();
    }

    function _loadConfig() internal {
        admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        arbiterOwner = vm.envOr("ARBITER_OWNER_ADDRESS", msg.sender);
        faucetName = vm.envOr("FAUCET_NAME", string("Commitments Test USD"));
        faucetSymbol = vm.envOr("FAUCET_SYMBOL", string("tUSD"));
        faucetDecimals = uint8(vm.envOr("FAUCET_DECIMALS", uint256(6)));
        unbondingPeriod = uint64(vm.envOr("UNBONDING_PERIOD", uint256(86_400)));
        uint256 unit = 10 ** uint256(faucetDecimals);
        minOperatorStake = vm.envOr("MIN_OPERATOR_STAKE", uint256(100)) * unit;
        maxOperators = vm.envOr("MAX_OPERATORS", uint256(1024));
        stakeThreshold = vm.envOr("STAKE_THRESHOLD", uint256(50)) * unit;
        quorumNumerator = vm.envOr("QUORUM_NUMERATOR", uint256(2));
        quorumDenominator = vm.envOr("QUORUM_DENOMINATOR", uint256(3));
        deployGovernance = vm.envOr("DEPLOY_GOVERNANCE", false);
        deployRewards = vm.envOr("DEPLOY_REWARDS", false);
        minActivationDelay = uint64(vm.envOr("MIN_ACTIVATION_DELAY", uint256(86_400)));

        console.log("=== DeploySepolia config ===");
        console.log("Admin:           ", admin);
        console.log("Arbiter owner:   ", arbiterOwner);
        console.log("Faucet token:    ", faucetName, faucetSymbol);
        console.log("Unbonding (sec): ", uint256(unbondingPeriod));
        console.log("Deploy governance:", deployGovernance);
        console.log("Deploy rewards:  ", deployRewards);
        console.log("");
    }

    function _printSummary() internal view {
        console.log("");
        console.log("=== Sepolia deployment complete ===");
        console.log("Record these in deployments/sepolia.json (broadcast/ is gitignored):");
        console.log("  faucetToken      ", address(faucetToken));
        console.log("  vaultFactory     ", address(vaultFactory));
        console.log("  vault            ", address(vault));
        console.log("  commitmentManager", address(manager));
        console.log("  operatorRegistry ", address(operatorRegistry));
        console.log("  stakeRegistry    ", address(stakeRegistry));
        console.log("  meshFactory      ", address(meshFactory));
        console.log("  tokenWeighting   ", tokenWeightingNode);
        console.log("  erc20Adapter     ", address(erc20Adapter));
        console.log("  erc4626Adapter   ", address(erc4626Adapter));
        console.log("  manualArbiter    ", address(manualArbiter));
        if (deployGovernance) console.log("  governorFactory  ", address(governorFactory));
        if (deployRewards) console.log("  rewardsFactory   ", address(rewardsFactory));
    }
}
