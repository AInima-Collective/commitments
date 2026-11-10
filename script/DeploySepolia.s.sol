// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {console} from "forge-std/Script.sol";

import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";
import {CommitmentsGovernor} from "src/periphery/governance/CommitmentsGovernor.sol";
import {CommitmentsTimelock} from "src/periphery/governance/CommitmentsTimelock.sol";
import {GovernorFactory} from "src/periphery/governance/GovernorFactory.sol";
import {MerkleSnapshot} from "src/extensions/rewards/MerkleSnapshot.sol";
import {CommitmentsRewardsCoordinator} from "src/extensions/rewards/CommitmentsRewardsCoordinator.sol";
import {RewardsCoordinatorFactory} from "src/extensions/rewards/RewardsCoordinatorFactory.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

import {DeployCore} from "./DeployCore.sol";
import {FaucetToken} from "./FaucetToken.sol";

/// @title DeploySepolia
/// @notice Composing, broadcast-ready deploy of the full v2 Commitments stack to
///         Ethereum Sepolia (chainId 11155111). UNLIKE `Simulate.s.sol` this
///         script does NOT derive Anvil-mnemonic accounts and does NOT seed any
///         demo state (deposits / commitments / operators / agreements). It
///         deploys contracts in dependency order and prints every address for the
///         deployment record.
///
/// @dev Deploys:
///        1. Faucet backing ERC-20 (`FaucetToken`, public mint).
///        2. VaultFactory + one ERC-4626 vault wrapping the faucet token.
///        3. The shared core (`DeployCore`): manager, adapters, strategies,
///           ManualArbiter, OperatorRegistry staked in raw faucet tokens, the mesh
///           with a 1:1 weight on that stake denom, and the service registry.
///        4. Optional governance + rewards factories (DEPLOY_GOVERNANCE / DEPLOY_REWARDS).
///
/// Roles default to the broadcaster (`msg.sender`):
///
///   PRIVATE_KEY            — deployer key (required by `--broadcast`; not read here)
///   ADMIN_ADDRESS          — DEFAULT_ADMIN_ROLE / PAUSER holder. Must equal the
///                            broadcaster: the deploy makes admin-only wiring calls.
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
contract DeploySepolia is DeployCore {
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
    FaucetToken faucetToken;
    VaultFactory vaultFactory;
    CommitmentsVault vault;
    GovernorFactory governorFactory;
    RewardsCoordinatorFactory rewardsFactory;

    function run() external {
        _loadConfig();
        require(admin == msg.sender, "DeploySepolia: ADMIN_ADDRESS must be the broadcaster");

        vm.startBroadcast();
        _deploy();
        vm.stopBroadcast();

        _printSummary();
    }

    /// @dev The whole composition, split out of `run` so a test can run it without a broadcast.
    ///      The caller must be `admin`.
    function _deploy() internal {
        // 1. Faucet backing token (public mint).
        faucetToken = new FaucetToken(faucetName, faucetSymbol, faucetDecimals);
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

        // 3. The shared core. Stake is raw faucet tokens at a 1:1 weight, so voting
        //    power is in raw faucet units, like STAKE_THRESHOLD.
        _deployCore(
            CoreConfig({
                admin: admin,
                arbiterOwner: arbiterOwner,
                stakeToken: address(faucetToken),
                unbondingPeriod: unbondingPeriod,
                minOperatorStake: minOperatorStake,
                maxOperators: maxOperators,
                weightingSalt: keccak256("sepolia.tw.v1"),
                stakeWeight: BPS_DENOMINATOR,
                serviceThreshold: stakeThreshold,
                quorumNumerator: quorumNumerator,
                quorumDenominator: quorumDenominator
            })
        );

        // 4. Optional governance / rewards factories (impls only; instances are
        //     spawned later via factory.deploy / deployCoordinator). Only this
        //     broadcaster, the factory's deployer, may later call setCanonicalGovernor.
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
