// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ERC20StaticAdapter} from "src/backing/ERC20StaticAdapter.sol";
import {ERC4626Adapter} from "src/backing/ERC4626Adapter.sol";
import {IndexAppreciationYield} from "src/distributions/IndexAppreciationYield.sol";
import {FlatFeeAtCreate} from "src/distributions/FlatFeeAtCreate.sol";
import {CounterpartyPremiumStream} from "src/distributions/CounterpartyPremiumStream.sol";
import {OperatorCommissionCoupon} from "src/extensions/services/distributions/OperatorCommissionCoupon.sol";

/// @title DeployAdaptersAndStrategies
/// @notice Deploys the reference backing adapters (stateless singletons, shared by every
///         commitment) and the reference distribution strategies (one deployment per manager —
///         their hooks are manager-only and the manager binding is immutable).
/// @dev Required environment variables:
///      COMMITMENT_MANAGER_ADDRESS — the CommitmentManager proxy the strategies serve
///
///      Optional environment variables:
///      OPERATOR_REGISTRY_ADDRESS — the OperatorRegistry the commission coupon resolves
///        operators from. When set, an OperatorCommissionCoupon is also deployed (the admin
///        must still allow-list it via `registry.setStrategyAllowed`).
///
///      Example usage:
///        export COMMITMENT_MANAGER_ADDRESS=0x...
///        forge script script/DeployAdaptersAndStrategies.s.sol --rpc-url $RPC_URL --broadcast
contract DeployAdaptersAndStrategies is Script {
    function run() external {
        address manager = vm.envAddress("COMMITMENT_MANAGER_ADDRESS");
        address registry = vm.envOr("OPERATOR_REGISTRY_ADDRESS", address(0));

        vm.startBroadcast();

        ERC20StaticAdapter erc20Adapter = new ERC20StaticAdapter();
        console.log("ERC20StaticAdapter:", address(erc20Adapter));

        ERC4626Adapter erc4626Adapter = new ERC4626Adapter();
        console.log("ERC4626Adapter:", address(erc4626Adapter));

        IndexAppreciationYield indexYield = new IndexAppreciationYield(manager);
        console.log("IndexAppreciationYield:", address(indexYield));

        FlatFeeAtCreate flatFee = new FlatFeeAtCreate(manager);
        console.log("FlatFeeAtCreate:", address(flatFee));

        CounterpartyPremiumStream premiumStream = new CounterpartyPremiumStream(manager);
        console.log("CounterpartyPremiumStream:", address(premiumStream));

        if (registry != address(0)) {
            OperatorCommissionCoupon commissionCoupon = new OperatorCommissionCoupon(manager, registry);
            console.log("OperatorCommissionCoupon:", address(commissionCoupon));
        }

        vm.stopBroadcast();
    }
}
