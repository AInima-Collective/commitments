// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {EnvelopeSig} from "../../helpers/EnvelopeSig.sol";

import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";
import {MockEligibility} from "../../helpers/Mocks.sol";

/// @dev A genuinely block-checkpointed voting-power source (the spec §3 requirement that
///      `getVotingPowerAt` / `getTotalPowerAt` return the value *as of* a past block, not the
///      live value). Mirrors the production `TokenWeighting` use of OZ `Checkpoints.Trace`.
contract CheckpointedVotingPowerSource is IVotingPowerSource {
    using Checkpoints for Checkpoints.Trace208;

    mapping(address => Checkpoints.Trace208) internal power;
    Checkpoints.Trace208 internal total;

    function setPower(address who, uint208 v) external {
        uint208 old = power[who].latest();
        power[who].push(uint48(block.number), v);
        uint208 t = total.latest();
        total.push(uint48(block.number), t + v - old);
    }

    function getVotingPower(address who) external view returns (uint256) {
        return power[who].latest();
    }

    function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256) {
        return power[who].upperLookup(uint48(blockNumber));
    }

    function getTotalPower() external view returns (uint256) {
        return total.latest();
    }

    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256) {
        return total.upperLookup(uint48(blockNumber));
    }
}

/// @title ServiceManagerHandler
/// @notice Invariant-fuzz handler driving register / deregister / signing-key rotation against a
///         real OperatorServiceRegistry from a fixed pool of operators and signing keys (so the
///         handler can produce valid proof-of-possession signatures). Backs INV-S3.
contract ServiceManagerHandler is Test {
    OperatorServiceRegistry public sm;
    MockEligibility public eligibility;
    CheckpointedVotingPowerSource public source;

    address[] public operators;
    address[] public signingKeys;
    uint256[] public signingKeyPks;

    constructor(
        OperatorServiceRegistry sm_,
        MockEligibility eligibility_,
        CheckpointedVotingPowerSource source_,
        address[] memory operators_,
        address[] memory signingKeys_,
        uint256[] memory signingKeyPks_
    ) {
        sm = sm_;
        eligibility = eligibility_;
        source = source_;
        operators = operators_;
        signingKeys = signingKeys_;
        signingKeyPks = signingKeyPks_;
    }

    function operatorCount() external view returns (uint256) {
        return operators.length;
    }

    function getOperator(uint256 i) external view returns (address) {
        return operators[i];
    }

    function signingKeyCount() external view returns (uint256) {
        return signingKeys.length;
    }

    function getSigningKey(uint256 i) external view returns (address) {
        return signingKeys[i];
    }

    // =========================================================================
    // Ops
    // =========================================================================

    function enrollServiceOperator(uint256 opSeed, uint208 powerSeed) external {
        address op = operators[opSeed % operators.length];
        if (sm.operatorRegistered(op)) return;
        eligibility.setOperator(op, true);
        source.setPower(op, uint208(bound(powerSeed, 1, 1e24)));
        vm.prank(op);
        sm.enrollServiceOperator();
    }

    function withdrawServiceOperator(uint256 opSeed) external {
        address op = operators[opSeed % operators.length];
        if (!sm.operatorRegistered(op)) return;
        vm.prank(op);
        sm.withdrawServiceOperator(op);
    }

    function rotateSigningKey(uint256 opSeed, uint256 keySeed) external {
        address op = operators[opSeed % operators.length];
        if (!sm.operatorRegistered(op)) return;

        uint256 ki = keySeed % signingKeys.length;
        address key = signingKeys[ki];
        // Skip keys already owned by a *different* operator — the contract would revert and the
        // ascending-uniqueness ghost would be unaffected, but skipping keeps the run productive.
        address owner = sm.getLatestOperatorForSigningKey(key);
        if (owner != address(0) && owner != op) return;

        bytes32 h = keccak256(abi.encode(op, address(sm), block.chainid));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKeyPks[ki], h);
        vm.prank(op);
        sm.updateOperatorSigningKey(key, abi.encodePacked(r, s, v));
    }

    function roll(uint256 n) external {
        vm.roll(block.number + bound(n, 1, 5));
    }
}

/// @title ServiceManagerInvariantTest
/// @notice Fuzz-grade conformance harness for ERC-COMMITMENTS-SERVICES §5 INV-S3 (signing-key
///         uniqueness) as a stateful invariant, plus INV-S4 (validation soundness) as bounded
///         property tests over each gate of the §4.5 algorithm.
contract ServiceManagerInvariantTest is Test {
    OperatorServiceRegistry internal sm;
    MockEligibility internal eligibility;
    CheckpointedVotingPowerSource internal source;
    ServiceManagerHandler internal handler;

    address internal admin = makeAddr("admin");

    uint256 internal constant THRESHOLD = 100;
    uint256 internal constant QNUM = 2;
    uint256 internal constant QDEN = 3;

    // Fixed pools so signatures can be produced.
    address[] internal operators;
    uint256[] internal operatorPks;
    address[] internal signingKeys;
    uint256[] internal signingKeyPks;

    function setUp() public {
        eligibility = new MockEligibility();
        source = new CheckpointedVotingPowerSource();

        OperatorServiceRegistry impl = new OperatorServiceRegistry();
        sm = OperatorServiceRegistry(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        OperatorServiceRegistry.initialize,
                        (address(eligibility), address(source), admin, THRESHOLD, QNUM, QDEN)
                    )
                )
            )
        );

        for (uint256 i = 0; i < 4; i++) {
            (address op, uint256 opPk) = makeAddrAndKey(string.concat("op", vm.toString(i)));
            operators.push(op);
            operatorPks.push(opPk);
        }
        for (uint256 i = 0; i < 6; i++) {
            (address k, uint256 kPk) = makeAddrAndKey(string.concat("key", vm.toString(i)));
            signingKeys.push(k);
            signingKeyPks.push(kPk);
        }

        handler = new ServiceManagerHandler(sm, eligibility, source, operators, signingKeys, signingKeyPks);
        targetContract(address(handler));
    }

    // =========================================================================
    // INV-S3 — signing-key uniqueness (stateful invariant)
    // =========================================================================

    /// @dev At any block, the key->operator checkpoint resolves a signing key to at most one
    ///      operator, and the operator->key / key->operator views are consistent inverses for
    ///      every currently-assigned key.
    function invariant_S3_signingKeyUniqueness() public view {
        uint256 nKeys = handler.signingKeyCount();
        uint256 nOps = handler.operatorCount();

        // Each signing key resolves to at most one operator, and that operator (if any) holds
        // exactly this key as its latest.
        for (uint256 k = 0; k < nKeys; k++) {
            address key = handler.getSigningKey(k);
            address owner = sm.getLatestOperatorForSigningKey(key);
            if (owner == address(0)) continue;
            assertEq(sm.getLatestOperatorSigningKey(owner), key, "INV-S3: key<->operator inverse");
        }

        // No two distinct operators share the same non-zero latest signing key.
        for (uint256 a = 0; a < nOps; a++) {
            address keyA = sm.getLatestOperatorSigningKey(handler.getOperator(a));
            if (keyA == address(0)) continue;
            for (uint256 b = a + 1; b < nOps; b++) {
                address keyB = sm.getLatestOperatorSigningKey(handler.getOperator(b));
                if (keyB == address(0)) continue;
                assertTrue(keyA != keyB, "INV-S3: distinct operators never share a key");
            }
        }
    }

    // =========================================================================
    // INV-S4 — validation soundness (bounded property tests over §4.5)
    // =========================================================================

    struct Signer {
        address op;
        uint256 opKeyPk; // signing key pk
        address signingKey;
        uint256 weight;
    }

    /// @dev Registers two operators with checkpointed power, signs an envelope, and asserts
    ///      `validate` passes iff the signed weight clears BOTH the absolute threshold and the
    ///      quorum fraction read at the reference block — the §4.5 step-5 dual gate.
    function testFuzz_S4_thresholdAndQuorumGates(uint208 w0, uint208 w1, bool includeSecond) public {
        w0 = uint208(bound(w0, 1, 1e21));
        w1 = uint208(bound(w1, 1, 1e21));

        _register(0, 0, w0);
        _register(1, 1, w1);

        vm.roll(block.number + 1);
        uint32 refBlock = uint32(block.number - 1);

        // Signer set: operator0 always, operator1 optionally.
        uint256 count = includeSecond ? 2 : 1;
        uint256 signedWeight = includeSecond ? uint256(w0) + uint256(w1) : uint256(w0);
        uint256 totalWeight = uint256(w0) + uint256(w1);

        bool meetsThreshold = signedWeight >= THRESHOLD;
        bool meetsQuorum = signedWeight * QDEN >= QNUM * totalWeight;
        bool expectPass = meetsThreshold && meetsQuorum;

        IServiceHandler.Envelope memory env = _env("s4-tq");
        IServiceHandler.SignatureData memory sig = _signSorted(env, _firstN(count), refBlock);

        if (expectPass) {
            sm.validate(env, sig); // must not revert
        } else {
            vm.expectRevert();
            sm.validate(env, sig);
        }
    }

    /// @dev A reference block older than `maxReferenceBlockAge` behind head MUST be rejected with
    ///      the distinguished `StaleReferenceBlock` error (§4.6), even with a fully-sufficient
    ///      signer set.
    function testFuzz_S4_staleReferenceRejected(uint96 maxAge, uint256 extra) public {
        maxAge = uint96(bound(maxAge, 1, 50));
        extra = bound(extra, 1, 50);

        vm.prank(admin);
        sm.setMaxReferenceBlockAge(maxAge);

        _register(0, 0, 1e21); // dominant weight: clears threshold + quorum alone
        _register(1, 1, 1);

        uint32 refBlock = uint32(block.number);
        // Advance strictly past the window: head - refBlock > maxAge.
        vm.roll(block.number + maxAge + extra);

        IServiceHandler.Envelope memory env = _env("s4-stale");
        IServiceHandler.SignatureData memory sig = _signSorted(env, _firstN(1), refBlock);

        vm.expectRevert(abi.encodeWithSelector(IServiceManager.StaleReferenceBlock.selector, refBlock, maxAge));
        sm.validate(env, sig);
    }

    /// @dev A signer whose key resolved at the reference block but who has since deregistered MUST
    ///      NOT be counted (§4.5 step 3 current-registration gate). Here the deregistration drops
    ///      the only sufficient signer, so a previously-passing envelope now fails.
    function testFuzz_S4_deregisteredSignerExcluded(uint208 w0) public {
        w0 = uint208(bound(w0, THRESHOLD, 1e21));

        _register(0, 0, w0); // alone clears threshold (>=THRESHOLD) and is 100% of power → quorum
        vm.roll(block.number + 1);
        uint32 refBlock = uint32(block.number - 1);

        IServiceHandler.Envelope memory env = _env("s4-dereg");
        IServiceHandler.SignatureData memory sig = _signSorted(env, _firstN(1), refBlock);

        // Sanity: passes while registered.
        sm.validate(env, sig);

        // Deregister AFTER the reference block; the historical key still resolves, but the live
        // registration check must now exclude it.
        vm.prank(operators[0]);
        sm.withdrawServiceOperator(operators[0]);

        vm.expectRevert(IServiceManager.SignerNotRegistered.selector);
        sm.validate(env, sig);
    }

    /// @dev A live-block sentinel and a future/at-head reference block MUST be rejected (§4.6).
    function testFuzz_S4_referenceBlockBounds(uint256 future) public {
        _register(0, 0, 1e21);
        vm.roll(block.number + 1);

        IServiceHandler.Envelope memory env = _env("s4-bounds");

        // Live sentinel.
        IServiceHandler.SignatureData memory sentinel = _signSorted(env, _firstN(1), type(uint32).max);
        vm.expectRevert(IServiceManager.InvalidReferenceBlock.selector);
        sm.validate(env, sentinel);

        // At or beyond head.
        uint32 futureBlock = uint32(bound(future, block.number, block.number + 1000));
        IServiceHandler.SignatureData memory ahead = _signSorted(env, _firstN(1), futureBlock);
        vm.expectRevert(IServiceManager.InvalidReferenceBlock.selector);
        sm.validate(env, ahead);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _register(uint256 opIdx, uint256 keyIdx, uint208 weight) internal {
        eligibility.setOperator(operators[opIdx], true);
        source.setPower(operators[opIdx], weight);
        vm.prank(operators[opIdx]);
        sm.enrollServiceOperator();

        bytes32 h = keccak256(abi.encode(operators[opIdx], address(sm), block.chainid));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKeyPks[keyIdx], h);
        vm.prank(operators[opIdx]);
        sm.updateOperatorSigningKey(signingKeys[keyIdx], abi.encodePacked(r, s, v));
    }

    /// @dev Returns the first `n` (operatorIndex == keyIndex) signer descriptors.
    function _firstN(uint256 n) internal view returns (Signer[] memory out) {
        out = new Signer[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = Signer({op: operators[i], opKeyPk: signingKeyPks[i], signingKey: signingKeys[i], weight: 0});
        }
    }

    function _env(string memory label) internal pure returns (IServiceHandler.Envelope memory) {
        return IServiceHandler.Envelope({
            eventId: bytes20(keccak256(abi.encodePacked(label))), ordering: bytes12(0), payload: bytes(label)
        });
    }

    /// @dev Sorts the signer set by signing-key address (ascending, as §4.5 requires) and signs
    ///      the EIP-191 digest over the envelope.
    function _signSorted(IServiceHandler.Envelope memory env, Signer[] memory set, uint32 refBlock)
        internal
        view
        returns (IServiceHandler.SignatureData memory)
    {
        // insertion sort by signingKey address
        for (uint256 i = 1; i < set.length; i++) {
            Signer memory cur = set[i];
            uint256 j = i;
            while (j > 0 && set[j - 1].signingKey > cur.signingKey) {
                set[j] = set[j - 1];
                j--;
            }
            set[j] = cur;
        }

        bytes32 digest = EnvelopeSig.digest(address(sm), env);
        address[] memory signers = new address[](set.length);
        bytes[] memory sigs = new bytes[](set.length);
        for (uint256 i = 0; i < set.length; i++) {
            signers[i] = set[i].signingKey;
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(set[i].opKeyPk, digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }
        return IServiceHandler.SignatureData({signers: signers, signatures: sigs, referenceBlock: refBlock});
    }
}
