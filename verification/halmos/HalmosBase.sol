// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";

import {LedgerOpsLib} from "src/core/manager/libraries/LedgerOpsLib.sol";
import {CommitmentLifecycleLib} from "src/core/manager/libraries/CommitmentLifecycleLib.sol";
import {MovementLib} from "src/core/manager/libraries/MovementLib.sol";
import {AgreementLib} from "src/extensions/agreements/AgreementLib.sol";
import {MutualLib} from "src/extensions/mutuals/MutualLib.sol";

/// @title HalmosBase — shared setup for symbolic harnesses
/// @notice Halmos does not auto-deploy/link external libraries. The `halmos`
///         foundry profile statically links the manager's five DELEGATECALL
///         libraries at the fixed addresses below (see foundry.toml); every
///         harness must etch the deployed library code there before touching
///         the manager. Keep the two lists in sync.
abstract contract HalmosBase is Test {
    address internal constant LEDGER_OPS_LIB = 0x00000000000000000000000000000000000f1001;
    address internal constant COMMITMENT_LIFECYCLE_LIB = 0x00000000000000000000000000000000000f1002;
    address internal constant MOVEMENT_LIB = 0x00000000000000000000000000000000000F1003;
    address internal constant AGREEMENT_LIB = 0x00000000000000000000000000000000000F1004;
    address internal constant MUTUAL_LIB = 0x00000000000000000000000000000000000F1005;

    /// @dev Halmos doesn't support vm.getDeployedCode, so each library is CREATE-deployed
    ///      from its (statically linked) creation code and its runtime is etched at the
    ///      pinned address. The library call-protection guard compares address(this) to the
    ///      CREATE address, which never matches under DELEGATECALL — so etching a copy at a
    ///      different address is safe for the delegatecall paths we verify.
    function _etchManagerLibs() internal {
        _etchLib(type(LedgerOpsLib).creationCode, LEDGER_OPS_LIB);
        _etchLib(type(CommitmentLifecycleLib).creationCode, COMMITMENT_LIFECYCLE_LIB);
        _etchLib(type(MovementLib).creationCode, MOVEMENT_LIB);
        _etchLib(type(AgreementLib).creationCode, AGREEMENT_LIB);
        _etchLib(type(MutualLib).creationCode, MUTUAL_LIB);
    }

    function _etchLib(bytes memory creationCode, address target) private {
        address deployed;
        assembly {
            deployed := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        require(deployed != address(0), "HalmosBase: lib deploy failed");
        vm.etch(target, deployed.code);
    }
}
