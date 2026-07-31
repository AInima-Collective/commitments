// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {OperatorRegistry} from "src/extensions/services/operator-registry/OperatorRegistry.sol";
import {IOperatorRegistry} from "src/extensions/services/interfaces/IOperatorRegistry.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

/// @dev Minimal EIP-1271 smart-contract wallet: validates a signature by recovering it and
///      comparing to a fixed owner key. Mirrors the reference wallet used elsewhere in the suite.
contract MockERC1271Wallet is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == owner) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xffffffff;
    }
}

/// @title OperatorRegistrySigTest
/// @notice Covers the issue-#44 EIP-712 signature-delegated register/delegate surface:
///         `registerWithSig` / `delegateWithSig` for both EOA and EIP-1271 signers, nonce
///         replay protection, `deadline` expiry, `increaseNonce` invalidation, the same-block
///         register⇄deregister flip guard, and acceptance-policy parity with the direct path.
contract OperatorRegistrySigTest is ManagerTestBase {
    OperatorRegistry internal registry;

    address internal arbiter = makeAddr("arbiter");
    address internal relayer = makeAddr("relayer");

    // EOA signers (need known private keys to produce EIP-712 signatures).
    address internal operatorEoa;
    uint256 internal operatorEoaKey;
    address internal stakerEoa;
    uint256 internal stakerEoaKey;

    // EIP-1271 contract signers and their owner keys.
    MockERC1271Wallet internal operatorWallet;
    address internal operatorWalletOwner;
    uint256 internal operatorWalletOwnerKey;
    MockERC1271Wallet internal stakerWallet;
    address internal stakerWalletOwner;
    uint256 internal stakerWalletOwnerKey;

    uint256 internal constant MIN_OPERATOR_STAKE = 100e18;
    uint256 internal constant MAX_DELEGATIONS = 1024;
    uint256 internal constant DEPOSIT_AMOUNT = 500e18;
    uint16 internal constant MAX_PENALTY_BPS = 5000;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public override {
        super.setUp();

        OperatorRegistry regImpl = new OperatorRegistry();
        registry = OperatorRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(
                        OperatorRegistry.initialize,
                        (
                            address(manager),
                            MIN_OPERATOR_STAKE,
                            MAX_DELEGATIONS,
                            admin,
                            arbiter,
                            uint16(0),
                            address(token)
                        )
                    )
                )
            )
        );

        vm.prank(admin);
        manager.setOperatorRegistry(address(registry));

        (operatorEoa, operatorEoaKey) = makeAddrAndKey("operatorEoa");
        (stakerEoa, stakerEoaKey) = makeAddrAndKey("stakerEoa");

        (operatorWalletOwner, operatorWalletOwnerKey) = makeAddrAndKey("operatorWalletOwner");
        (stakerWalletOwner, stakerWalletOwnerKey) = makeAddrAndKey("stakerWalletOwner");
        operatorWallet = new MockERC1271Wallet(operatorWalletOwner);
        stakerWallet = new MockERC1271Wallet(stakerWalletOwner);

        _deposit(operatorEoa, DEPOSIT_AMOUNT);
        _deposit(stakerEoa, DEPOSIT_AMOUNT);
        _deposit(address(operatorWallet), DEPOSIT_AMOUNT);
        _deposit(address(stakerWallet), DEPOSIT_AMOUNT);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _createCommitment(address committer, uint256 amount, uint16 penaltyBps)
        internal
        returns (uint256 commitmentId)
    {
        commitmentId = _createAs(committer, _baseParams(arbiter, address(registry), amount, penaltyBps));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("CommitmentsOperatorRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(registry)
            )
        );
    }

    function _registerDigest(address operator, uint256 commitmentId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(registry.REGISTER_TYPEHASH(), operator, commitmentId, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _delegateDigest(address staker, address operator, uint256 commitmentId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(registry.DELEGATE_TYPEHASH(), staker, operator, commitmentId, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // =========================================================================
    // registerWithSig — happy paths (EOA + EIP-1271)
    // =========================================================================

    function test_registerWithSig_EOA() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        vm.expectEmit(true, false, false, true, address(registry));
        emit IOperatorRegistry.OperatorRegistered(operatorEoa, id, MIN_OPERATOR_STAKE);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);

        assertTrue(registry.isOperator(operatorEoa), "operator active");
        assertEq(registry.getOperatorStake(operatorEoa), MIN_OPERATOR_STAKE, "stake credited");
        assertEq(registry.sigNonces(operatorEoa), 1, "nonce consumed");
    }

    function test_registerWithSig_ERC1271() public {
        address op = address(operatorWallet);
        uint256 id = _createCommitment(op, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        // The wallet's owner key signs; SignatureChecker routes to isValidSignature.
        bytes memory sig = _sign(operatorWalletOwnerKey, _registerDigest(op, id, 0, deadline));

        vm.prank(relayer);
        registry.registerWithSig(op, id, deadline, 0, sig);

        assertTrue(registry.isOperator(op), "contract operator active");
        assertEq(registry.getOperatorStake(op), MIN_OPERATOR_STAKE, "stake credited");
        assertEq(registry.sigNonces(op), 1, "nonce consumed");
    }

    // =========================================================================
    // delegateWithSig — happy paths (EOA + EIP-1271)
    // =========================================================================

    function _registerOperatorEoaDirect() internal returns (uint256) {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.prank(operatorEoa);
        registry.register(id);
        return id;
    }

    function test_delegateWithSig_EOA() public {
        _registerOperatorEoaDirect();

        uint256 id = _createCommitment(stakerEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(stakerEoaKey, _delegateDigest(stakerEoa, operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        vm.expectEmit(true, true, true, true, address(registry));
        emit IOperatorRegistry.DelegationCreated(stakerEoa, operatorEoa, id, MIN_OPERATOR_STAKE);
        registry.delegateWithSig(stakerEoa, operatorEoa, id, deadline, 0, sig);

        assertEq(registry.getOperatorStake(operatorEoa), 2 * MIN_OPERATOR_STAKE, "delegation credited");
        assertEq(registry.sigNonces(stakerEoa), 1, "nonce consumed");
    }

    function test_delegateWithSig_ERC1271() public {
        _registerOperatorEoaDirect();

        address staker = address(stakerWallet);
        uint256 id = _createCommitment(staker, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(stakerWalletOwnerKey, _delegateDigest(staker, operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        registry.delegateWithSig(staker, operatorEoa, id, deadline, 0, sig);

        assertEq(registry.getOperatorStake(operatorEoa), 2 * MIN_OPERATOR_STAKE, "delegation credited");
        assertEq(registry.sigNonces(staker), 1, "nonce consumed");
    }

    // =========================================================================
    // Replay / expiry / nonce invalidation
    // =========================================================================

    function test_registerWithSig_expiredDeadline_reverts() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.SignatureExpired.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    function test_registerWithSig_wrongNonce_reverts() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        // Sign over nonce 1 while the on-chain nonce is 0.
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 1, deadline));

        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.InvalidNonce.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 1, sig);
    }

    function test_registerWithSig_tamperedSig_reverts() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        // Sign for a different commitmentId than the one submitted -> recovers a non-signer.
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id + 1, 0, deadline));

        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.InvalidSignature.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    function test_registerWithSig_replay_reverts() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);

        // Deregister in a later block so the record is clear, then replay the same signature.
        vm.roll(block.number + 1);
        vm.prank(operatorEoa);
        registry.deregister();

        vm.roll(block.number + 1);
        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.InvalidNonce.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    function test_increaseNonce_invalidatesOutstandingSignature() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        // Signer bumps their nonce before the relayer submits.
        vm.expectEmit(true, false, false, true, address(registry));
        emit IOperatorRegistry.NonceIncreased(operatorEoa, 1);
        vm.prank(operatorEoa);
        registry.increaseNonce();
        assertEq(registry.sigNonces(operatorEoa), 1, "nonce bumped");

        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.InvalidNonce.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    // =========================================================================
    // Same-block register⇄deregister flip guard
    // =========================================================================

    function test_sameBlockFlip_directPath_blocked() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        vm.startPrank(operatorEoa);
        registry.register(id);
        vm.expectRevert(IOperatorRegistry.SameBlockToggle.selector);
        registry.deregister();
        vm.stopPrank();

        // A block later, deregister succeeds.
        vm.roll(block.number + 1);
        vm.prank(operatorEoa);
        registry.deregister();
        assertFalse(registry.isOperator(operatorEoa), "deregistered next block");
    }

    function test_sameBlockFlip_signedPath_blocked() public {
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);

        // Same block: the operator cannot deregister (relayer-submitted register set the toggle).
        vm.prank(operatorEoa);
        vm.expectRevert(IOperatorRegistry.SameBlockToggle.selector);
        registry.deregister();
    }

    // Regression: the toggle guard stores `block.number + 1`, so a first-ever
    // register at block 0 must NOT collide with the zero-init sentinel. Foundry
    // defaults to block 1; forge-script simulation and fresh anvil run at block 0,
    // where the old `== block.number` check spuriously reverted the first register.
    function test_register_atBlockZero_notFalselyBlocked() public {
        vm.roll(0);
        assertEq(block.number, 0, "at genesis block");
        uint256 id = _createCommitment(operatorEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);

        vm.prank(operatorEoa);
        registry.register(id); // must not revert SameBlockToggle at block 0
        assertTrue(registry.isOperator(operatorEoa), "registered at block 0");

        // The guard still catches a genuine same-(block 0) re-toggle.
        vm.prank(operatorEoa);
        vm.expectRevert(IOperatorRegistry.SameBlockToggle.selector);
        registry.deregister();
    }

    // =========================================================================
    // Acceptance-policy parity with the direct path
    // =========================================================================

    function test_registerWithSig_wrongArbiter_reverts_sameAsDirect() public {
        address wrongArbiter = makeAddr("wrongArbiter");
        ICM.CommitmentParams memory p =
            _baseParams(wrongArbiter, address(registry), MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 id = _createAs(operatorEoa, p);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.WrongArbiter.selector, arbiter, wrongArbiter));
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    function test_registerWithSig_belowMinStake_reverts_sameAsDirect() public {
        uint256 low = MIN_OPERATOR_STAKE - 1;
        uint256 id = _createCommitment(operatorEoa, low, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IOperatorRegistry.InsufficientStake.selector, low, MIN_OPERATOR_STAKE));
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }

    function test_registerWithSig_signerNotCommitter_reverts() public {
        // Commitment committed by stakerEoa; signature by operatorEoa for operatorEoa identity.
        uint256 id = _createCommitment(stakerEoa, MIN_OPERATOR_STAKE, MAX_PENALTY_BPS);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(operatorEoaKey, _registerDigest(operatorEoa, id, 0, deadline));

        vm.prank(relayer);
        vm.expectRevert(IOperatorRegistry.NotCommitmentOwner.selector);
        registry.registerWithSig(operatorEoa, id, deadline, 0, sig);
    }
}
