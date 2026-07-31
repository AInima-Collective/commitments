// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    IDistributionStrategy,
    TokenMovement,
    CreatedContext,
    DistributeContext,
    ClaimContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";

/// @dev Adversarial-mode discriminators. `mode` is set per-strategy by the harness so Medusa
///      can steer each bound strategy between hostile and benign behaviour across a sequence.
enum HostileMode {
    Benign, // returns no movements; the "cleared" state a sweep re-drives into
    Revert, // reverts in every guarded lifecycle hook
    GasBurn, // burns unbounded gas (OOG inside the 500k cap) via an SSTORE loop
    ReturnBomb, // returns a huge TokenMovement[] to blow the returndata / decode budget
    FailNThenSucceed // reverts the first N guarded hook calls, then behaves Benign
}

/// @title AdversarialStrategy
/// @notice A single mode-switchable hostile strategy implementing the full IDistributionStrategy
///         surface. Only the two GUARDED lifecycle hooks (`onCommitmentReleased`,
///         `onCommitmentForfeited`) misbehave — `onCommitmentCreated` is NOT guarded (a revert
///         there aborts creation, ERC §C.1), so it always succeeds so the harness can actually
///         bind the strategy. `distribute` / `claim` bubble on the entry-point path and are left
///         benign here; the property under test is guarded-hook parking, not the bubbling path.
/// @dev The behaviour is entirely a function of the harness-set `mode` (+ `failuresRemaining` for
///      FailNThenSucceed), so Medusa explores both the failure and the success/re-drive paths by
///      toggling mode between calls. No movements are ever returned on success, so a strategy
///      switching Benign never itself perturbs the partition — the property isolates parking.
contract AdversarialStrategy is IDistributionStrategy {
    HostileMode public mode;

    /// @dev Countdown for FailNThenSucceed. Decremented on each guarded hook entry while > 0;
    ///      once it hits 0 the strategy behaves Benign, so a later sweepFailedHook re-drive lands.
    uint256 public failuresRemaining;

    /// @dev Storage sink for the gas-burn loop (SSTORE is the dominant cost, so this OOGs well
    ///      inside the 500k cap).
    uint256 private _sink;

    // ---- harness controls -------------------------------------------------

    function setMode(HostileMode m) external {
        mode = m;
    }

    function setFailures(uint256 n) external {
        failuresRemaining = n;
    }

    // ---- IDistributionStrategy -------------------------------------------

    /// @notice NOT guarded — must succeed or commitment creation aborts. Always benign.
    function onCommitmentCreated(CreatedContext calldata) external {}

    function onCommitmentReleased(LifecycleContext calldata) external returns (TokenMovement[] memory) {
        return _misbehave();
    }

    function onCommitmentForfeited(ForfeitContext calldata) external returns (TokenMovement[] memory) {
        return _misbehave();
    }

    /// @dev The heart of the adversary. Called inside the manager's 500k-gas guarded frame; any
    ///      failure here MUST park (record `failedHookSelector` + emit) and leave the lifecycle
    ///      transition intact.
    function _misbehave() internal returns (TokenMovement[] memory) {
        HostileMode m = mode;

        if (m == HostileMode.FailNThenSucceed) {
            if (failuresRemaining > 0) {
                failuresRemaining -= 1;
                revert("adversary: transient down");
            }
            return new TokenMovement[](0); // cleared — the re-drive success path
        }

        if (m == HostileMode.Revert) {
            revert("adversary: always down");
        }

        if (m == HostileMode.GasBurn) {
            _burnGas();
            return new TokenMovement[](0); // unreachable — OOG first
        }

        if (m == HostileMode.ReturnBomb) {
            return _returnBomb();
        }

        // Benign
        return new TokenMovement[](0);
    }

    /// @dev Unbounded SSTORE loop. Under the 500k cap this always OOGs; the guarded frame catches
    ///      the OOG-revert exactly like an explicit revert.
    function _burnGas() internal {
        uint256 x = _sink;
        // solhint-disable-next-line no-empty-blocks
        for (uint256 i = 0;; i++) {
            x = uint256(keccak256(abi.encode(x, i)));
            _sink = x; // cold/warm SSTORE — the dominant gas sink
        }
    }

    /// @dev Return a large movement array. Building + ABI-encoding + returndata-copying it in the
    ///      capped frame either OOGs or exceeds the decode budget on the manager side — either way
    ///      the guarded frame's `catch` fires. Every entry has `units == 0`, so on the vanishingly
    ///      unlikely event it DID decode, `_applyOne` reverts `MovementZeroUnits` and it STILL parks.
    function _returnBomb() internal pure returns (TokenMovement[] memory bomb) {
        bomb = new TokenMovement[](50_000);
        // Left zero-initialized; the sheer size is the weapon.
    }

    function distribute(DistributeContext calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function claim(ClaimContext calldata, bytes calldata) external pure returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    function pending(ClaimContext calldata, bytes calldata) external pure returns (uint256) {
        return 0;
    }
}
