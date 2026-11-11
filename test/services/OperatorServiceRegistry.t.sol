// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {EnvelopeSig} from "../helpers/EnvelopeSig.sol";

import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";
import {IOperatorServiceRegistry} from "src/extensions/services/interfaces/IOperatorServiceRegistry.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {MockVotingPowerSource} from "../helpers/Mocks.sol";

/// @dev Minimal mock OperatorRegistry — only implements eligibility.
contract MockOperatorRegistry {
    mapping(address => bool) public activeOperators;

    function setOperator(address op) external {
        activeOperators[op] = true;
    }

    function removeOperator(address op) external {
        activeOperators[op] = false;
    }

    function isOperator(address op) external view returns (bool) {
        return activeOperators[op];
    }
}

contract OperatorServiceRegistryTest is Test {
    OperatorServiceRegistry public registry;
    MockOperatorRegistry public mockOpRegistry;
    MockVotingPowerSource public mockSource;

    address public admin = makeAddr("admin");
    address public operator1;
    uint256 public operator1Key;
    address public operator2;
    uint256 public operator2Key;
    address public signingKey1;
    uint256 public signingKey1Pk;
    address public signingKey2;
    uint256 public signingKey2Pk;

    uint256 constant THRESHOLD = 100;
    uint256 constant QUORUM_NUM = 2;
    uint256 constant QUORUM_DEN = 3;

    function setUp() public {
        (operator1, operator1Key) = makeAddrAndKey("operator1");
        (operator2, operator2Key) = makeAddrAndKey("operator2");
        (signingKey1, signingKey1Pk) = makeAddrAndKey("signingKey1");
        (signingKey2, signingKey2Pk) = makeAddrAndKey("signingKey2");

        mockOpRegistry = new MockOperatorRegistry();
        mockSource = new MockVotingPowerSource();

        OperatorServiceRegistry impl = new OperatorServiceRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorServiceRegistry.initialize,
            (address(mockOpRegistry), address(mockSource), admin, THRESHOLD, QUORUM_NUM, QUORUM_DEN)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = OperatorServiceRegistry(address(proxy));
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    function test_initialize_setsVotingPowerSource() public view {
        assertEq(registry.votingPowerSource(), address(mockSource));
    }

    function test_initialize_zeroSourceReverts() public {
        OperatorServiceRegistry impl = new OperatorServiceRegistry();
        bytes memory initData = abi.encodeCall(
            OperatorServiceRegistry.initialize,
            (address(mockOpRegistry), address(0), admin, THRESHOLD, QUORUM_NUM, QUORUM_DEN)
        );
        vm.expectRevert(IOperatorServiceRegistry.InvalidVotingPowerSource.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_setVotingPowerSource_onlyAdmin() public {
        MockVotingPowerSource newSource = new MockVotingPowerSource();
        vm.prank(address(0xBAD));
        vm.expectRevert();
        registry.setVotingPowerSource(address(newSource));
    }

    function test_setVotingPowerSource_updates() public {
        MockVotingPowerSource newSource = new MockVotingPowerSource();
        newSource.setPower(operator1, 999);

        vm.prank(admin);
        registry.setVotingPowerSource(address(newSource));

        assertEq(registry.votingPowerSource(), address(newSource));
        assertEq(registry.getVotingPower(operator1), 999);
    }

    function test_setVotingPowerSource_zeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(IOperatorServiceRegistry.InvalidVotingPowerSource.selector);
        registry.setVotingPowerSource(address(0));
    }

    // =========================================================================
    // Registration
    // =========================================================================

    function test_registerOperator_success() public {
        mockOpRegistry.setOperator(operator1);
        mockSource.setPower(operator1, 500);

        vm.prank(operator1);
        registry.enrollServiceOperator();

        assertTrue(registry.operatorRegistered(operator1));
    }

    function test_registerOperator_notInRegistry_reverts() public {
        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.NotActiveOperator.selector);
        registry.enrollServiceOperator();
    }

    function test_registerOperator_alreadyRegistered_reverts() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.AlreadyRegistered.selector);
        registry.enrollServiceOperator();
    }

    function test_deregisterOperator_self() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        vm.prank(operator1);
        registry.withdrawServiceOperator(operator1);

        assertFalse(registry.operatorRegistered(operator1));
    }

    function test_deregisterOperator_admin() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        vm.prank(admin);
        registry.withdrawServiceOperator(operator1);

        assertFalse(registry.operatorRegistered(operator1));
    }

    function test_deregisterOperator_unauthorized_reverts() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        vm.prank(address(0xBAD));
        vm.expectRevert(IOperatorServiceRegistry.NotAdminOrSelf.selector);
        registry.withdrawServiceOperator(operator1);
    }

    function test_deregisterOperator_notRegistered_reverts() public {
        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.NotRegistered.selector);
        registry.withdrawServiceOperator(operator1);
    }

    function test_deregister_clearsSigningKey() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);

        vm.prank(operator1);
        registry.withdrawServiceOperator(operator1);

        assertEq(registry.getLatestOperatorSigningKey(operator1), address(0));
        assertEq(registry.getLatestOperatorForSigningKey(signingKey1), address(0));
    }

    // =========================================================================
    // Signing keys
    // =========================================================================

    function test_updateSigningKey_success() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        bytes memory sig = _signPoP(signingKey1Pk, operator1);
        vm.prank(operator1);
        registry.updateOperatorSigningKey(signingKey1, sig);

        assertEq(registry.getLatestOperatorSigningKey(operator1), signingKey1);
        assertEq(registry.getLatestOperatorForSigningKey(signingKey1), operator1);
    }

    function test_updateSigningKey_notRegistered_reverts() public {
        bytes memory sig = _signPoP(signingKey1Pk, operator1);
        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.NotRegistered.selector);
        registry.updateOperatorSigningKey(signingKey1, sig);
    }

    function test_updateSigningKey_invalidSig_reverts() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        bytes memory badSig = _signPoP(operator2Key, operator1); // wrong key
        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.InvalidSigningKeySignature.selector);
        registry.updateOperatorSigningKey(signingKey1, badSig);
    }

    function test_updateSigningKey_alreadyAssigned_reverts() public {
        mockOpRegistry.setOperator(operator1);
        mockOpRegistry.setOperator(operator2);
        vm.prank(operator1);
        registry.enrollServiceOperator();
        vm.prank(operator2);
        registry.enrollServiceOperator();

        vm.prank(operator1);
        registry.updateOperatorSigningKey(signingKey1, _signPoP(signingKey1Pk, operator1));

        vm.prank(operator2);
        vm.expectRevert(IOperatorServiceRegistry.SigningKeyAlreadyAssigned.selector);
        registry.updateOperatorSigningKey(signingKey1, _signPoP(signingKey1Pk, operator2));
    }

    function test_updateSigningKey_zeroAddress_reverts() public {
        mockOpRegistry.setOperator(operator1);
        vm.prank(operator1);
        registry.enrollServiceOperator();

        vm.prank(operator1);
        vm.expectRevert(IOperatorServiceRegistry.InvalidSigningKey.selector);
        registry.updateOperatorSigningKey(address(0), "");
    }

    function test_signingKeyHistory_blockLookup() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        uint32 blockAtKey1 = uint32(block.number);

        vm.roll(block.number + 10);
        vm.prank(operator1);
        registry.updateOperatorSigningKey(signingKey2, _signPoP(signingKey2Pk, operator1));

        vm.roll(block.number + 1);
        assertEq(registry.getOperatorSigningKeyAtBlock(operator1, blockAtKey1), signingKey1);
        assertEq(registry.getLatestOperatorSigningKey(operator1), signingKey2);
    }

    // =========================================================================
    // Voting-power view delegation
    // =========================================================================

    function test_getVotingPower_delegatesToSource() public {
        mockSource.setPower(operator1, 1234);
        assertEq(registry.getVotingPower(operator1), 1234);
        assertEq(registry.getOperatorWeight(operator1), 1234);
    }

    function test_getTotalPower_delegatesToSource() public {
        mockSource.setPower(operator1, 500);
        mockSource.setPower(operator2, 300);
        assertEq(registry.getTotalPower(), 800);
    }

    function test_getVotingPowerAt_delegatesToSource() public {
        mockSource.setPowerAt(operator1, 42, 999);
        assertEq(registry.getVotingPowerAt(operator1, 42), 999);
    }

    // =========================================================================
    // Signature validation
    // =========================================================================

    function test_validate_singleSigner_success() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        IServiceHandler.Envelope memory env = _env("ok");
        IServiceHandler.SignatureData memory sig = _sign(env, _pks(signingKey1Pk), _addrs(signingKey1));
        registry.validate(env, sig);
    }

    function test_validate_multiSigner_quorum() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        _registerAndSetKey(operator2, operator2Key, signingKey2, signingKey2Pk);
        mockSource.setPower(operator1, 1000);
        mockSource.setPower(operator2, 500);

        (address[] memory addrs, uint256[] memory pks) =
            _sortedSigners(signingKey1, signingKey1Pk, signingKey2, signingKey2Pk);
        IServiceHandler.Envelope memory env = _env("multi");
        IServiceHandler.SignatureData memory sig = _sign(env, pks, addrs);
        registry.validate(env, sig);
    }

    function test_validate_lengthMismatch_revertsWithInterfaceError() public {
        IServiceHandler.Envelope memory env = _env("length-mismatch");
        address[] memory signers = new address[](1);
        bytes[] memory signatures = new bytes[](0);
        IServiceHandler.SignatureData memory sig = IServiceHandler.SignatureData({
            signers: signers, signatures: signatures, referenceBlock: uint32(block.number - 1)
        });

        vm.expectRevert(IServiceManager.LengthMismatch.selector);
        registry.validate(env, sig);
    }

    function test_validate_emptySigners_revertsWithInterfaceError() public {
        IServiceHandler.Envelope memory env = _env("empty-signers");
        IServiceHandler.SignatureData memory sig = IServiceHandler.SignatureData({
            signers: new address[](0), signatures: new bytes[](0), referenceBlock: uint32(block.number - 1)
        });

        vm.expectRevert(IServiceManager.InvalidLength.selector);
        registry.validate(env, sig);
    }

    function test_validate_insufficientQuorum_reverts() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        _registerAndSetKey(operator2, operator2Key, signingKey2, signingKey2Pk);
        mockSource.setPower(operator1, 1000);
        mockSource.setPower(operator2, 10_000); // operator1 alone is ~9%, below 2/3

        IServiceHandler.Envelope memory env = _env("low");
        IServiceHandler.SignatureData memory sig = _sign(env, _pks(signingKey1Pk), _addrs(signingKey1));
        vm.expectRevert();
        registry.validate(env, sig);
    }

    function test_validate_insufficientThreshold_reverts() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, THRESHOLD - 1);

        IServiceHandler.Envelope memory env = _env("sub");
        IServiceHandler.SignatureData memory sig = _sign(env, _pks(signingKey1Pk), _addrs(signingKey1));
        vm.expectRevert(IServiceManager.InsufficientSignedStake.selector);
        registry.validate(env, sig);
    }

    function test_validate_invalidSignature_reverts() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        IServiceHandler.Envelope memory env = _env("badsig");
        // Sign with operator2's key, claim it's signingKey1
        IServiceHandler.SignatureData memory sig = _sign(env, _pks(operator2Key), _addrs(signingKey1));
        vm.expectRevert();
        registry.validate(env, sig);
    }

    /// @notice A quorum signature minted over a digest bound to a DIFFERENT
    ///         chain id is rejected: `validate` recomputes the digest with the
    ///         live `block.chainid`, so the recovered signer no longer matches.
    function test_validate_rejectsWrongChainIdDigest() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        IServiceHandler.Envelope memory env = _env("xchain");
        // Sign over a digest domain-separated with the WRONG chain id.
        bytes32 wrongDigest = EnvelopeSig.digestFor(block.chainid + 1, address(registry), env);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey1Pk, wrongDigest);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        address[] memory signers = new address[](1);
        signers[0] = signingKey1;
        IServiceHandler.SignatureData memory sig = IServiceHandler.SignatureData({
            signers: signers, signatures: sigs, referenceBlock: uint32(block.number - 1)
        });

        vm.expectRevert(IServiceManager.InvalidSignature.selector);
        registry.validate(env, sig);
    }

    /// @notice A quorum signature minted over a digest bound to a DIFFERENT
    ///         verifying instance address is rejected (cross-instance replay
    ///         defense).
    function test_validate_rejectsWrongInstanceDigest() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        IServiceHandler.Envelope memory env = _env("xinst");
        // Sign over a digest domain-separated with some OTHER instance address.
        bytes32 wrongDigest = EnvelopeSig.digestFor(block.chainid, address(0xBEEF), env);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey1Pk, wrongDigest);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        address[] memory signers = new address[](1);
        signers[0] = signingKey1;
        IServiceHandler.SignatureData memory sig = IServiceHandler.SignatureData({
            signers: signers, signatures: sigs, referenceBlock: uint32(block.number - 1)
        });

        vm.expectRevert(IServiceManager.InvalidSignature.selector);
        registry.validate(env, sig);
    }

    function test_validate_unsortedSigners_reverts() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        _registerAndSetKey(operator2, operator2Key, signingKey2, signingKey2Pk);
        mockSource.setPower(operator1, 1000);
        mockSource.setPower(operator2, 1000);

        // Force reverse order
        (address[] memory addrs, uint256[] memory pks) =
            _sortedSigners(signingKey1, signingKey1Pk, signingKey2, signingKey2Pk);
        // swap
        address tmpA = addrs[0];
        addrs[0] = addrs[1];
        addrs[1] = tmpA;
        uint256 tmpK = pks[0];
        pks[0] = pks[1];
        pks[1] = tmpK;
        IServiceHandler.Envelope memory env = _env("unsorted");
        IServiceHandler.SignatureData memory sig = _sign(env, pks, addrs);
        vm.expectRevert(IServiceManager.NotSorted.selector);
        registry.validate(env, sig);
    }

    /// @notice Audit H-6: `referenceBlock == type(uint32).max` is no longer accepted
    ///         (the magic-value path was removed because the corresponding "use live"
    ///         readers let a caller pin to whatever block was convenient). Validation
    ///         must use a real recent past block.
    function test_validate_referenceBlockMax_reverts() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        IServiceHandler.Envelope memory env = _env("live");
        bytes32 digest = EnvelopeSig.digest(address(registry), env);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey1Pk, digest);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        address[] memory signers = new address[](1);
        signers[0] = signingKey1;

        IServiceHandler.SignatureData memory sigData =
            IServiceHandler.SignatureData({signers: signers, signatures: sigs, referenceBlock: type(uint32).max});
        vm.expectRevert(IServiceManager.InvalidReferenceBlock.selector);
        registry.validate(env, sigData);
    }

    function test_isValidSignature_ERC1271() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        mockSource.setPower(operator1, 1000);

        // ERC1271 forwards the digest as-is to _checkSignatures (no eth-prefix wrap);
        // callers must sign the exact digest they pass in.
        bytes32 digest = keccak256("hello");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey1Pk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        address[] memory signers = new address[](1);
        signers[0] = signingKey1;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        // Audit H-6: pass a real past block. _registerAndSetKey rolled forward, so
        // block.number - 1 covers the registration checkpoint.
        bytes memory encoded = abi.encode(signers, sigs, uint32(block.number - 1));
        bytes4 ret = registry.isValidSignature(digest, encoded);
        assertEq(ret, IERC1271.isValidSignature.selector);
    }

    // =========================================================================
    // Admin / views
    // =========================================================================

    function test_updateStakeThreshold() public {
        vm.prank(admin);
        registry.updateStakeThreshold(500);
    }

    function test_updateQuorum_appliesFromNextBlock() public {
        _registerAndSetKey(operator1, operator1Key, signingKey1, signingKey1Pk);
        _registerAndSetKey(operator2, operator2Key, signingKey2, signingKey2Pk);
        mockSource.setPower(operator1, 600);
        mockSource.setPower(operator2, 400); // operator1 alone holds exactly 3/5

        IServiceHandler.Envelope memory env = _env("quorum");
        IServiceHandler.SignatureData memory sig = _sign(env, _pks(signingKey1Pk), _addrs(signingKey1));
        vm.expectRevert(abi.encodeWithSelector(IServiceManager.InsufficientQuorum.selector, 600, THRESHOLD, 1000));
        registry.validate(env, sig);

        vm.prank(admin);
        registry.updateQuorum(3, 5);
        vm.roll(block.number + 1);
        registry.validate(env, _sign(env, _pks(signingKey1Pk), _addrs(signingKey1)));
    }

    function test_updateQuorum_denominatorAbove80Bits_reverts() public {
        vm.prank(admin);
        vm.expectRevert(IServiceManager.InvalidQuorumParameters.selector);
        registry.updateQuorum(1, uint256(type(uint80).max) + 1);
    }

    function test_updateQuorum_invalidParameters_revertsWithInterfaceError() public {
        vm.prank(admin);
        vm.expectRevert(IServiceManager.InvalidQuorumParameters.selector);
        registry.updateQuorum(2, 1);
    }

    function test_setServiceURI() public {
        vm.prank(admin);
        registry.setServiceURI("https://example.com");
        assertEq(registry.getServiceURI(), "https://example.com");
    }

    function test_onlyAdmin_threshold_reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        registry.updateStakeThreshold(1);
    }

    function test_onlyAdmin_quorum_reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        registry.updateQuorum(1, 2);
    }

    function test_getStakeRegistry_returnsOperatorRegistry() public view {
        assertEq(registry.getStakeRegistry(), address(mockOpRegistry));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _signPoP(uint256 keyPk, address operator) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encode(operator, address(registry), block.chainid));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, h);
        return abi.encodePacked(r, s, v);
    }

    function _registerAndSetKey(
        address op,
        uint256,
        /* opKey */
        address key,
        uint256 keyPk
    )
        internal
    {
        mockOpRegistry.setOperator(op);
        vm.prank(op);
        registry.enrollServiceOperator();
        bytes memory sig = _signPoP(keyPk, op);
        vm.prank(op);
        registry.updateOperatorSigningKey(key, sig);
        // Audit H-6: validation now requires `referenceBlock < block.number`. Roll
        // forward so subsequent `_sign` calls have a real past block to point at.
        vm.roll(block.number + 1);
    }

    function _env(string memory label) internal pure returns (IServiceHandler.Envelope memory) {
        return IServiceHandler.Envelope({
            eventId: bytes20(keccak256(abi.encodePacked(label))), ordering: bytes12(0), payload: bytes(label)
        });
    }

    function _sign(IServiceHandler.Envelope memory env, uint256[] memory pks, address[] memory signers)
        internal
        view
        returns (IServiceHandler.SignatureData memory)
    {
        bytes32 digest = EnvelopeSig.digest(address(registry), env);
        bytes[] memory sigs = new bytes[](pks.length);
        for (uint256 i; i < pks.length; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pks[i], digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }
        // Audit H-6: `type(uint32).max` is no longer accepted; pass a real recent
        // past block. Tests advance `block.number` past the registration checkpoints
        // before signing so `upperLookup(referenceBlock)` resolves.
        return
            IServiceHandler.SignatureData({
                signers: signers, signatures: sigs, referenceBlock: uint32(block.number - 1)
            });
    }

    function _pks(uint256 k1) internal pure returns (uint256[] memory out) {
        out = new uint256[](1);
        out[0] = k1;
    }

    function _addrs(address a1) internal pure returns (address[] memory out) {
        out = new address[](1);
        out[0] = a1;
    }

    function _sortedSigners(address a1, uint256 k1, address a2, uint256 k2)
        internal
        pure
        returns (address[] memory addrs, uint256[] memory pks)
    {
        addrs = new address[](2);
        pks = new uint256[](2);
        if (a1 < a2) {
            addrs[0] = a1;
            addrs[1] = a2;
            pks[0] = k1;
            pks[1] = k2;
        } else {
            addrs[0] = a2;
            addrs[1] = a1;
            pks[0] = k2;
            pks[1] = k1;
        }
    }
}
