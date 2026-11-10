// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {EnvelopeSig} from "../helpers/EnvelopeSig.sol";

import {AttestationArbiter} from "src/periphery/arbiters/AttestationArbiter.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {ServiceEnvelopeVerifier} from "src/extensions/services/service-registry/ServiceEnvelopeVerifier.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {StrategyBinding} from "src/core/interfaces/IDistributionStrategy.sol";
import {OperatorServiceRegistry} from "src/extensions/services/service-registry/OperatorServiceRegistry.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";
import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";
import {ManagerTestBase} from "../helpers/ManagerTestBase.sol";

// =============================================================================
// Mocks
// =============================================================================

/// @notice Minimal eligibility oracle — just tracks which addresses are operators.
contract MockEligibility {
    mapping(address => bool) public ops;

    function set(address op, bool yes) external {
        ops[op] = yes;
    }

    function isOperator(address op) external view returns (bool) {
        return ops[op];
    }
}

/// @notice Minimal voting power source — flat per-operator power.
contract MockVotingPower is IVotingPowerSource {
    mapping(address => uint256) private _power;
    uint256 private _total;

    function set(address op, uint256 p) external {
        _total = _total + p - _power[op];
        _power[op] = p;
    }

    function getVotingPower(address op) external view returns (uint256) {
        return _power[op];
    }

    function getVotingPowerAt(address op, uint256) external view returns (uint256) {
        return _power[op];
    }

    function getTotalPower() external view returns (uint256) {
        return _total;
    }

    function getTotalPowerAt(uint256) external view returns (uint256) {
        return _total;
    }
}

// =============================================================================
// Tests
// =============================================================================

/// @title AttestationArbiterTest
/// @notice service-attested arbiter dispatch against the real `CommitmentManager`:
///         envelope happy paths for every action (commitment, agreement incl.
///         bilateral settle, and mutual-loss), signature/threshold failure modes,
///         strict per-target ordering, and replay protection via manager state.
contract AttestationArbiterTest is ManagerTestBase {
    // Operators use signing keys distinct from their operator addresses.
    // Each operator has 100 voting power; threshold is 200 (2-of-3 needed).
    struct Op {
        uint256 opKey;
        address opAddr;
        uint256 signKey;
        address signAddr;
    }

    OperatorServiceRegistry public sr;
    MockEligibility public eligibility;
    MockVotingPower public vp;
    AttestationArbiter public arbiter;

    address public committer = makeAddr("committer");
    address public counterparty = makeAddr("counterparty");
    address public proposer = makeAddr("proposer");
    address public acceptor = makeAddr("acceptor");
    address public mutualBeneficiary = makeAddr("mutualBeneficiary");
    address public member = makeAddr("member");

    uint64 public constant MUTUAL_WINDOW = 2 days;

    Op[3] public ops;

    uint256 public constant DEPOSIT = 1000e18;
    uint256 public constant AMOUNT = 100e18;
    uint16 public constant MAX_PENALTY_BPS = 10_000;

    uint256 public constant THRESHOLD = 200;

    function setUp() public override {
        // ---- CommitmentManager + token + adapter (shared fixture) ----
        super.setUp();

        // ---- Service manager infrastructure ----
        eligibility = new MockEligibility();
        vp = new MockVotingPower();

        OperatorServiceRegistry srImpl = new OperatorServiceRegistry();
        ERC1967Proxy srProxy = new ERC1967Proxy(
            address(srImpl),
            abi.encodeCall(
                OperatorServiceRegistry.initialize,
                (address(eligibility), address(vp), admin, THRESHOLD, uint256(2), uint256(3))
            )
        );
        sr = OperatorServiceRegistry(address(srProxy));

        // ---- Register 3 operators with signing keys ----
        for (uint256 i = 0; i < 3; i++) {
            uint256 opKey = uint256(keccak256(abi.encode("op", i)));
            address opAddr = vm.addr(opKey);
            uint256 signKey = uint256(keccak256(abi.encode("signer", i)));
            address signAddr = vm.addr(signKey);
            ops[i] = Op(opKey, opAddr, signKey, signAddr);

            eligibility.set(opAddr, true);
            vp.set(opAddr, 100);

            vm.prank(opAddr);
            sr.enrollServiceOperator();

            // Proof-of-possession signed by the signing key.
            bytes32 pop = keccak256(abi.encode(opAddr, address(sr), block.chainid));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signKey, pop);
            bytes memory popSig = abi.encodePacked(r, s, v);

            vm.prank(opAddr);
            sr.updateOperatorSigningKey(signAddr, popSig);
        }

        // Audit H-6: validation requires `referenceBlock < block.number` and
        // `block.number - referenceBlock <= maxReferenceBlockAge`. Roll forward so
        // signatures point at the registration block, not the current one.
        vm.roll(block.number + 1);

        // ---- Arbiter ----
        arbiter = new AttestationArbiter(address(manager), address(sr));

        // ---- Test principals funded ----
        _deposit(committer, DEPOSIT);
        _deposit(proposer, DEPOSIT);
        _deposit(acceptor, DEPOSIT);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _createCommitment(address from, uint256 amount) internal returns (uint256 cid) {
        cid = _createAs(from, _baseParams(address(arbiter), counterparty, amount, MAX_PENALTY_BPS));
    }

    function _createAgreement() internal returns (uint256 entId, uint256 cidA, uint256 cidB) {
        ICM.AgreementParams memory p;
        p.arbiter = address(arbiter);
        p.acceptor = acceptor;
        p.proposerLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.acceptorLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.challengeWindow = WINDOW;
        p.proposalDuration = 1 days;
        p.metadataURI = "";
        p.metadataHash = bytes32(0);

        vm.prank(proposer);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(acceptor);
        (entId,,) = manager.acceptAgreement(proposalId);
        (cidA, cidB) = manager.getAgreementPair(entId);
    }

    /// @dev The current per-id ordering sequence for `action`'s scope
    ///      (commitment / agreement / mutual) — what an honest signing flow reads.
    function _currentOrdering(uint256 id, AttestationArbiter.Action action) internal view returns (uint96) {
        if (action <= AttestationArbiter.Action.Release) return arbiter.commitmentOrdering(id);
        if (action <= AttestationArbiter.Action.SettleAgreement) return arbiter.agreementOrdering(id);
        return arbiter.mutualOrdering(id);
    }

    /// @dev Builds an envelope carrying the CURRENT ordering sequence (read live
    ///      from the arbiter). 5-arg form: forfeit / release / agreement actions
    ///      whose settle/mutual fields are zero.
    function _buildEnvelope(
        address boundArbiter,
        uint256 id,
        AttestationArbiter.Action action,
        uint16 bps,
        uint256 deadline
    ) internal view returns (IServiceHandler.Envelope memory env) {
        env = _buildEnvelopeAt(boundArbiter, id, action, bps, deadline, _currentOrdering(id, action));
    }

    /// @dev Builds an envelope pinned at an EXPLICIT ordering sequence — used to
    ///      model withheld / stale envelopes signed against an earlier state.
    function _buildEnvelopeAt(
        address boundArbiter,
        uint256 id,
        AttestationArbiter.Action action,
        uint16 bps,
        uint256 deadline,
        uint96 ordering
    ) internal pure returns (IServiceHandler.Envelope memory env) {
        AttestationArbiter.Attestation memory att = AttestationArbiter.Attestation({
            boundArbiter: boundArbiter,
            id: id,
            action: uint8(action),
            penaltyBps: bps,
            deadline: deadline,
            fromProposer: false,
            units: 0,
            numeraire: 0,
            evidenceHash: bytes32(0)
        });
        env = _pack(att, ordering);
    }

    /// @dev Full builder for settle / mutual actions (reads current ordering).
    function _buildEnvelopeFull(AttestationArbiter.Attestation memory att)
        internal
        view
        returns (IServiceHandler.Envelope memory)
    {
        return _pack(att, _currentOrdering(att.id, AttestationArbiter.Action(att.action)));
    }

    /// @dev Encode the payload the way `act` decodes it (explicit fields, matching
    ///      `abi.decode(payload, (Attestation))`), with a per-attestation eventId
    ///      so the shared verifier's consumed-eventId replay defense doesn't
    ///      collide across distinct actions.
    function _pack(AttestationArbiter.Attestation memory att, uint96 ordering)
        internal
        pure
        returns (IServiceHandler.Envelope memory env)
    {
        bytes memory payload = abi.encode(
            att.boundArbiter,
            att.id,
            att.action,
            att.penaltyBps,
            att.deadline,
            att.fromProposer,
            att.units,
            att.numeraire,
            att.evidenceHash
        );
        env = IServiceHandler.Envelope({
            eventId: bytes20(keccak256(abi.encode(payload, ordering))), ordering: bytes12(ordering), payload: payload
        });
    }

    /// @dev Sign the envelope with the first `signerCount` operators' signing keys.
    ///      Signers array is sorted ascending so _checkSignatures accepts.
    function _sign(IServiceHandler.Envelope memory envelope, uint256 signerCount)
        internal
        view
        returns (IServiceHandler.SignatureData memory)
    {
        require(signerCount <= 3, "too many");
        bytes32 digest = EnvelopeSig.digest(address(sr), envelope);

        address[] memory signers = new address[](signerCount);
        uint256[] memory signKeys = new uint256[](signerCount);
        for (uint256 i = 0; i < signerCount; i++) {
            signers[i] = ops[i].signAddr;
            signKeys[i] = ops[i].signKey;
        }
        // Sort ascending
        for (uint256 i = 1; i < signerCount; i++) {
            address a = signers[i];
            uint256 k = signKeys[i];
            uint256 j = i;
            while (j > 0 && signers[j - 1] > a) {
                signers[j] = signers[j - 1];
                signKeys[j] = signKeys[j - 1];
                j--;
            }
            signers[j] = a;
            signKeys[j] = k;
        }

        bytes[] memory sigs = new bytes[](signerCount);
        for (uint256 i = 0; i < signerCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signKeys[i], digest);
            sigs[i] = abi.encodePacked(r, s, v);
        }

        // Audit H-6: pass a real recent past block (not the magic max value).
        return
            IServiceHandler.SignatureData({
                signers: signers, signatures: sigs, referenceBlock: uint32(block.number - 1)
            });
    }

    // =========================================================================
    // Happy paths — all 5 actions
    // =========================================================================

    function testAct_initiateForfeitHappyPath() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        arbiter.act(env, sig);

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertGt(p.initiatedAt, 0, "forfeit proposal should exist");
        assertEq(p.penaltyBps, 5000);
    }

    function testAct_cancelForfeitHappyPath() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        // First, forfeit via attestation.
        IServiceHandler.Envelope memory env1 =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        arbiter.act(env1, _sign(env1, 2));

        // Then cancel.
        IServiceHandler.Envelope memory env2 =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.CancelForfeit, 0, deadline);
        arbiter.act(env2, _sign(env2, 2));

        ICM.ForfeitProposal memory p = manager.getForfeitProposal(cid);
        assertTrue(p.cancelled, "forfeit should be cancelled");
    }

    function testAct_releaseHappyPath() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.Release, 0, deadline);
        arbiter.act(env, _sign(env, 2));

        assertTrue(manager.getCommitment(cid).released);
        assertEq(manager.encumberedBalance(address(token), committer), 0, "release should decumber");
        assertEq(manager.freeBalance(address(token), committer), DEPOSIT, "backing returned to free balance");
    }

    function testAct_forfeitAgreementHappyPath() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();
        uint256 deadline = block.timestamp + 1 hours;

        // Sign a proportional 25% penalty (< the 50% max) — it must flow through to both legs.
        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), entId, AttestationArbiter.Action.ForfeitAgreement, 2500, deadline);
        arbiter.act(env, _sign(env, 2));

        assertGt(manager.getForfeitProposal(cidA).initiatedAt, 0);
        assertGt(manager.getForfeitProposal(cidB).initiatedAt, 0);
        assertEq(manager.getForfeitProposal(cidA).penaltyBps, 2500, "attested penalty flows to leg A");
        assertEq(manager.getForfeitProposal(cidB).penaltyBps, 2500, "attested penalty flows to leg B");
    }

    function testAct_releaseAgreementHappyPath() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), entId, AttestationArbiter.Action.ReleaseAgreement, 0, deadline);
        arbiter.act(env, _sign(env, 2));

        assertTrue(manager.getCommitment(cidA).released);
        assertTrue(manager.getCommitment(cidB).released);
    }

    // =========================================================================
    // Failure modes
    // =========================================================================

    function testAct_revertsOnExpiredDeadline() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        vm.warp(deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(AttestationArbiter.ExpiredAttestation.selector, deadline, block.timestamp)
        );
        arbiter.act(env, sig);
    }

    function testAct_revertsOnWrongBoundArbiter() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;
        address otherArbiter = makeAddr("otherArbiter");

        IServiceHandler.Envelope memory env =
            _buildEnvelope(otherArbiter, cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        vm.expectRevert(
            abi.encodeWithSelector(AttestationArbiter.WrongBoundArbiter.selector, address(arbiter), otherArbiter)
        );
        arbiter.act(env, sig);
    }

    function testAct_revertsOnInsufficientSignatures() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 1); // only 1-of-3, below 200 threshold

        vm.expectRevert(IServiceManager.InsufficientSignedStake.selector);
        arbiter.act(env, sig);
    }

    function testAct_revertsOnUnregisteredSigner() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);

        // Valid sig by a random key NOT registered with the stake registry.
        bytes32 digest = EnvelopeSig.digest(address(sr), env);
        uint256 rogueKey = uint256(keccak256("rogue"));
        address rogue = vm.addr(rogueKey);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogueKey, digest);

        address[] memory signers = new address[](1);
        signers[0] = rogue;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        IServiceHandler.SignatureData memory sd = IServiceHandler.SignatureData({
            signers: signers, signatures: sigs, referenceBlock: uint32(block.number - 1)
        });

        vm.expectRevert(IServiceManager.SignerNotRegistered.selector);
        arbiter.act(env, sd);
    }

    function testAct_revertsOnTamperedPayload() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        // Sign the envelope for action = InitiateForfeit, bps = 5000.
        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        // Tamper the envelope — change penalty bps to 9000, keeping the payload
        // well-formed (9 fields) so it still decodes; only the digest changes.
        env.payload = abi.encode(
            address(arbiter),
            cid,
            uint8(AttestationArbiter.Action.InitiateForfeit),
            uint16(9000),
            deadline,
            false,
            uint256(0),
            uint256(0),
            bytes32(0)
        );

        // validate() recomputes the EIP-712 digest over the tampered payload —
        // different digest → stored signatures don't verify → InvalidSignature.
        vm.expectRevert(IServiceManager.InvalidSignature.selector);
        arbiter.act(env, sig);
    }

    /// @notice Replaying the SAME signed envelope is blocked by the shared
    ///         verifier's consumed-eventId set BEFORE the action re-dispatches.
    function testAct_revertsOnReplaySameEnvelope() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        // First action — initiates forfeit.
        arbiter.act(env, sig);
        assertTrue(arbiter.isEnvelopeConsumed(env.eventId), "envelope should be marked consumed");

        // Replay of the identical signed envelope reverts at the verifier, not
        // the manager (the eventId is already consumed).
        vm.expectRevert(abi.encodeWithSelector(ServiceEnvelopeVerifier.EnvelopeAlreadyConsumed.selector, env.eventId));
        arbiter.act(env, sig);
    }

    // =========================================================================
    // Ordering — stale-replay across proposal instances (S7)
    // =========================================================================

    /// @notice The S7 attack: operators sign a CancelForfeit with a generous
    ///         deadline for forfeit proposal #1; #1 resolves otherwise
    ///         (permissionless stale-cancel — no arbiter involvement); proposal
    ///         #2 later opens on the same commitment; an adversary submits the
    ///         withheld, still-unexpired Cancel envelope. The strict per-id
    ///         ordering sequence makes it revert — proposal #2's Initiate
    ///         consumed the sequence value the stale Cancel was signed at.
    function testAct_revertsOnStaleCancelReplayAcrossProposals() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 365 days; // generous deadline — the attack precondition

        // Proposal #1 via attestation (ordering 0 → 1).
        IServiceHandler.Envelope memory init1 =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        arbiter.act(init1, _sign(init1, 2));

        // Operators sign a Cancel for proposal #1 (at the now-current ordering 1)
        // but it is WITHHELD — never submitted.
        IServiceHandler.Envelope memory staleCancel =
            _buildEnvelopeAt(address(arbiter), cid, AttestationArbiter.Action.CancelForfeit, 0, deadline, 1);
        IServiceHandler.SignatureData memory staleCancelSig = _sign(staleCancel, 2);

        // Proposal #1 resolves WITHOUT the arbiter: permissionless stale-cancel
        // after challengeWindow + TTL. The arbiter's ordering is untouched.
        vm.warp(block.timestamp + WINDOW + 14 days + 1);
        manager.cancelStaleForfeitProposal(cid);

        // Proposal #2 opens via a fresh attestation (ordering 1 → 2).
        IServiceHandler.Envelope memory init2 =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        arbiter.act(init2, _sign(init2, 2));
        assertGt(manager.getForfeitProposal(cid).initiatedAt, 0, "proposal #2 live");
        assertFalse(manager.getForfeitProposal(cid).cancelled, "proposal #2 not cancelled");

        // Adversary lands the withheld Cancel — never authorized for proposal #2.
        vm.expectRevert(abi.encodeWithSelector(AttestationArbiter.OrderingMismatch.selector, uint96(2), uint96(1)));
        arbiter.act(staleCancel, staleCancelSig);

        assertFalse(manager.getForfeitProposal(cid).cancelled, "proposal #2 survives the stale cancel");
    }

    /// @notice An envelope carrying any ordering other than the current
    ///         sequence value reverts — future values can't be pre-consumed.
    function testAct_revertsOnWrongOrdering() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelopeAt(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline, 1);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        vm.expectRevert(abi.encodeWithSelector(AttestationArbiter.OrderingMismatch.selector, uint96(0), uint96(1)));
        arbiter.act(env, sig);
    }

    /// @notice Every dispatched commitment-scoped action bumps the sequence;
    ///         the getter tracks it.
    function testAct_orderingSequencesCommitmentActions() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;
        assertEq(arbiter.commitmentOrdering(cid), 0);

        IServiceHandler.Envelope memory init =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        arbiter.act(init, _sign(init, 2));
        assertEq(arbiter.commitmentOrdering(cid), 1);

        IServiceHandler.Envelope memory cancel =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.CancelForfeit, 0, deadline);
        arbiter.act(cancel, _sign(cancel, 2));
        assertEq(arbiter.commitmentOrdering(cid), 2);
    }

    /// @notice Agreement-scoped actions bump the agreement sequence AND both
    ///         legs' commitment sequences: leg forfeit proposals are created by
    ///         `forfeitAgreement`, so a withheld leg-level CancelForfeit signed
    ///         for a prior leg proposal must go stale when a new agreement-level
    ///         forfeit opens fresh proposals on the legs.
    function testAct_agreementActionBumpsLegOrderings_blocksStaleLegCancel() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();
        uint256 deadline = block.timestamp + 365 days;

        // Agreement forfeit #1 (agr ordering 0 → 1; legs 0 → 1).
        IServiceHandler.Envelope memory forfeit1 =
            _buildEnvelope(address(arbiter), entId, AttestationArbiter.Action.ForfeitAgreement, 0, deadline);
        arbiter.act(forfeit1, _sign(forfeit1, 2));
        assertEq(arbiter.agreementOrdering(entId), 1);
        assertEq(arbiter.commitmentOrdering(cidA), 1);
        assertEq(arbiter.commitmentOrdering(cidB), 1);

        // Operators sign a Cancel for leg A's proposal #1 — WITHHELD.
        IServiceHandler.Envelope memory staleCancel =
            _buildEnvelopeAt(address(arbiter), cidA, AttestationArbiter.Action.CancelForfeit, 0, deadline, 1);
        IServiceHandler.SignatureData memory staleCancelSig = _sign(staleCancel, 2);

        // Both leg proposals go stale and are force-cancelled permissionlessly.
        vm.warp(block.timestamp + WINDOW + 14 days + 1);
        manager.cancelStaleForfeitProposal(cidA);
        manager.cancelStaleForfeitProposal(cidB);

        // Agreement forfeit #2 (agr 1 → 2; legs 1 → 2) opens fresh leg proposals.
        IServiceHandler.Envelope memory forfeit2 =
            _buildEnvelope(address(arbiter), entId, AttestationArbiter.Action.ForfeitAgreement, 0, deadline);
        arbiter.act(forfeit2, _sign(forfeit2, 2));
        assertEq(arbiter.commitmentOrdering(cidA), 2);
        assertEq(arbiter.commitmentOrdering(cidB), 2);

        // The withheld leg cancel signed against proposal #1 cannot touch #2.
        vm.expectRevert(abi.encodeWithSelector(AttestationArbiter.OrderingMismatch.selector, uint96(2), uint96(1)));
        arbiter.act(staleCancel, staleCancelSig);
    }

    /// @notice Reverse direction of the scope lattice: a commitment-scoped
    ///         action on an agreement LEG bumps the parent agreement's
    ///         sequence. The reachable leg-scoped action is `CancelForfeit`
    ///         (single-leg initiate/release revert with `UseAgreementPath`;
    ///         leg proposals come from `forfeitAgreement`). Without the bump,
    ///         a withheld `ReleaseAgreement` signed when the operators intended
    ///         a full amicable unwind could land AFTER they instead cancelled
    ///         only ONE leg's proposal — releasing the OTHER leg out of its
    ///         still-live forfeit proposal (leg release does not re-check for
    ///         a pending forfeit).
    function testAct_legActionBumpsAgreementOrdering_blocksStaleReleaseAgreement() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreement();
        uint256 deadline = block.timestamp + 365 days; // generous deadline — the attack precondition

        // Agreement forfeit opens proposals on both legs (agr 0 → 1; legs 0 → 1).
        IServiceHandler.Envelope memory forfeit =
            _buildEnvelope(address(arbiter), entId, AttestationArbiter.Action.ForfeitAgreement, 0, deadline);
        arbiter.act(forfeit, _sign(forfeit, 2));

        // Operators sign a full ReleaseAgreement at agr seq 1 — WITHHELD.
        IServiceHandler.Envelope memory staleRelease =
            _buildEnvelopeAt(address(arbiter), entId, AttestationArbiter.Action.ReleaseAgreement, 0, deadline, 1);
        IServiceHandler.SignatureData memory staleReleaseSig = _sign(staleRelease, 2);

        // Conditions change: operators instead cancel ONLY leg A's proposal
        // (commitment-scoped — leg A seq 1 → 2, and parent agreement seq 1 → 2).
        IServiceHandler.Envelope memory cancelA =
            _buildEnvelope(address(arbiter), cidA, AttestationArbiter.Action.CancelForfeit, 0, deadline);
        arbiter.act(cancelA, _sign(cancelA, 2));
        assertEq(arbiter.agreementOrdering(entId), 2, "leg action bumps parent agreement ordering");
        assertFalse(manager.getForfeitProposal(cidB).cancelled, "leg B proposal still live");

        // The withheld ReleaseAgreement cannot release leg B out of its forfeit.
        vm.expectRevert(abi.encodeWithSelector(AttestationArbiter.OrderingMismatch.selector, uint96(2), uint96(1)));
        arbiter.act(staleRelease, staleReleaseSig);

        assertFalse(manager.getCommitment(cidB).released, "leg B stays under the live proposal");
    }

    // =========================================================================
    // Events + getters
    // =========================================================================

    function testAct_emitsActedEvent() public {
        uint256 cid = _createCommitment(committer, AMOUNT);
        uint256 deadline = block.timestamp + 1 hours;

        IServiceHandler.Envelope memory env =
            _buildEnvelope(address(arbiter), cid, AttestationArbiter.Action.InitiateForfeit, 5000, deadline);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        vm.expectEmit(true, true, false, true, address(arbiter));
        emit AttestationArbiter.Acted(AttestationArbiter.Action.InitiateForfeit, cid, 5000, deadline);
        arbiter.act(env, sig);
    }

    function testCommitmentManagerGetter() public view {
        assertEq(arbiter.commitmentManager(), address(manager));
    }

    function testServiceManagerIsImmutable() public view {
        assertEq(address(arbiter.serviceManager()), address(sr));
    }

    // =========================================================================
    // Capabilities — now advertises the full arbiter surface
    // =========================================================================

    function testCapabilities_advertisesSettleAndMutual() public view {
        uint256 caps = arbiter.arbiterCapabilities();
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.SETTLE_AGREEMENT), "settle");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.MUTUAL_LOSS), "mutual");
        // and still the original surface
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.INITIATE_FORFEIT), "forfeit");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.RELEASE_AGREEMENT), "release agreement");
    }

    // =========================================================================
    // SettleAgreement — bilateral settlement via envelope
    // =========================================================================

    /// @dev Agreement whose acceptance consents to per-direction settlement caps.
    function _createAgreementWithCaps(uint128 capP2A, uint128 capA2P)
        internal
        returns (uint256 entId, uint256 cidA, uint256 cidB)
    {
        ICM.AgreementParams memory p;
        p.arbiter = address(arbiter);
        p.acceptor = acceptor;
        p.proposerLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.acceptorLeg = ICM.LegTerms(address(token), address(staticAdapter), AMOUNT, 5000, new StrategyBinding[](0));
        p.challengeWindow = WINDOW;
        p.proposalDuration = 1 days;
        p.maxFlowProposerToAcceptor = capP2A;
        p.maxFlowAcceptorToProposer = capA2P;

        vm.prank(proposer);
        uint256 proposalId = manager.proposeAgreement(p);
        vm.prank(acceptor);
        (entId,,) = manager.acceptAgreement(proposalId);
        (cidA, cidB) = manager.getAgreementPair(entId);
    }

    function testAct_settleAgreement_shiftsUnitsAndBumpsLegs() public {
        (uint256 entId, uint256 cidA, uint256 cidB) = _createAgreementWithCaps(50e18, 0);
        uint256 deadline = block.timestamp + 1 hours;

        AttestationArbiter.Attestation memory att = AttestationArbiter.Attestation({
            boundArbiter: address(arbiter),
            id: entId,
            action: uint8(AttestationArbiter.Action.SettleAgreement),
            penaltyBps: 0,
            deadline: deadline,
            fromProposer: true,
            units: 10e18,
            numeraire: 0,
            evidenceHash: keccak256("evidence")
        });
        IServiceHandler.Envelope memory env = _buildEnvelopeFull(att);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        uint256 acceptorFreeBefore = manager.freeBalance(address(token), acceptor);
        arbiter.act(env, sig);

        // fromProposer => payer is the proposer's leg (cidA); the receiver leg is untouched
        // and the settled value lands in the acceptor's free balance.
        assertEq(manager.getCommitment(cidA).amount, AMOUNT - 10e18, "payer leg debited");
        assertEq(manager.getCommitment(cidB).amount, AMOUNT, "receiver leg untouched");
        assertEq(manager.freeBalance(address(token), acceptor), acceptorFreeBefore + 10e18, "receiver paid to free");
        // Agreement seq advanced AND both legs bumped (settle changes leg state).
        assertEq(arbiter.agreementOrdering(entId), 1, "agreement seq bumped");
        assertEq(arbiter.commitmentOrdering(cidA), 1, "leg A seq bumped");
        assertEq(arbiter.commitmentOrdering(cidB), 1, "leg B seq bumped");
    }

    function testAct_settleAgreement_respectsLifetimeCap() public {
        (uint256 entId,,) = _createAgreementWithCaps(15e18, 0);
        uint256 deadline = block.timestamp + 1 hours;

        // Attempt to settle 20e18 in the proposer->acceptor direction, over the 15e18 cap.
        AttestationArbiter.Attestation memory att = AttestationArbiter.Attestation({
            boundArbiter: address(arbiter),
            id: entId,
            action: uint8(AttestationArbiter.Action.SettleAgreement),
            penaltyBps: 0,
            deadline: deadline,
            fromProposer: true,
            units: 20e18,
            numeraire: 0,
            evidenceHash: bytes32(0)
        });
        IServiceHandler.Envelope memory env = _buildEnvelopeFull(att);
        IServiceHandler.SignatureData memory sig = _sign(env, 2);

        // Manager enforces the cap; the whole act() reverts, no sequence moves.
        vm.expectRevert(abi.encodeWithSelector(ICM.SettlementCapExceeded.selector, uint128(20e18), uint128(15e18)));
        arbiter.act(env, sig);
        assertEq(arbiter.agreementOrdering(entId), 0, "no sequence bump on reverted settle");
    }

    // =========================================================================
    // Mutual-loss actions via envelope
    // =========================================================================

    /// @dev Homogeneous mutual arbitrated by this AttestationArbiter.
    function _createMutual() internal returns (uint256 gid) {
        ICM.MutualParams memory p = ICM.MutualParams({
            arbiter: address(arbiter),
            numeraire: address(token),
            beneficiary: mutualBeneficiary,
            challengeWindow: MUTUAL_WINDOW,
            deallocationWindow: MUTUAL_WINDOW
        });
        gid = manager.createMutual(p);
    }

    function _joinMutual(uint256 gid, address who, uint256 amount) internal returns (uint256 cid) {
        _deposit(who, amount);
        ICM.CommitmentParams memory p;
        p.arbiter = address(arbiter);
        p.counterparty = mutualBeneficiary;
        p.token = address(token);
        p.adapter = address(staticAdapter);
        p.amount = amount;
        p.maxPenaltyBps = MAX_PENALTY_BPS;
        p.challengeWindow = WINDOW;
        p.strategies = new StrategyBinding[](0);
        vm.prank(who);
        cid = manager.joinMutual(gid, p);
    }

    /// @dev Submit a mutual-scoped action envelope (activate / initiate / cancel).
    function _actMutual(uint256 gid, AttestationArbiter.Action action, uint256 numeraire, bytes32 evidenceHash)
        internal
    {
        AttestationArbiter.Attestation memory att = AttestationArbiter.Attestation({
            boundArbiter: address(arbiter),
            id: gid,
            action: uint8(action),
            penaltyBps: 0,
            deadline: block.timestamp + 1 hours,
            fromProposer: false,
            units: 0,
            numeraire: numeraire,
            evidenceHash: evidenceHash
        });
        IServiceHandler.Envelope memory env = _buildEnvelopeFull(att);
        arbiter.act(env, _sign(env, 2));
    }

    function testAct_mutualLifecycle_activateInitiateCancel() public {
        uint256 gid = _createMutual();

        // Activate via envelope.
        _actMutual(gid, AttestationArbiter.Action.ActivateMutual, 0, bytes32(0));
        assertTrue(manager.getMutual(gid).active, "mutual activated via envelope");
        assertEq(arbiter.mutualOrdering(gid), 1, "mutual seq bumped on activate");

        // A member joins (only possible once active).
        _joinMutual(gid, member, 100e18);

        // Initiate a loss via envelope.
        _actMutual(gid, AttestationArbiter.Action.InitiateMutualLoss, 40e18, keccak256("evidence"));
        ICM.MutualLossProposal memory prop = manager.getMutualLossProposal(gid);
        assertEq(prop.lossNumeraire, 40e18, "loss declared");
        assertEq(prop.proposer, address(arbiter), "arbiter is proposer");
        assertGt(prop.initiatedAt, 0, "proposal open");
        assertEq(arbiter.mutualOrdering(gid), 2, "mutual seq bumped on initiate");

        // Cancel it via envelope.
        _actMutual(gid, AttestationArbiter.Action.CancelMutualLoss, 0, bytes32(0));
        assertTrue(manager.getMutualLossProposal(gid).cancelled, "loss cancelled via envelope");
        assertEq(arbiter.mutualOrdering(gid), 3, "mutual seq bumped on cancel");
    }

    function testAct_mutualOrdering_staleEnvelopeReverts() public {
        uint256 gid = _createMutual();
        _actMutual(gid, AttestationArbiter.Action.ActivateMutual, 0, bytes32(0)); // seq 0 -> 1
        _joinMutual(gid, member, 100e18);
        _actMutual(gid, AttestationArbiter.Action.InitiateMutualLoss, 40e18, keccak256("ev")); // seq 1 -> 2

        // A CancelMutualLoss withheld from ordering 1 is now stale (current seq is 2).
        IServiceHandler.Envelope memory stale = _buildEnvelopeAt(
            address(arbiter), gid, AttestationArbiter.Action.CancelMutualLoss, 0, block.timestamp + 1 hours, uint96(1)
        );
        IServiceHandler.SignatureData memory sig = _sign(stale, 2);
        vm.expectRevert(abi.encodeWithSelector(AttestationArbiter.OrderingMismatch.selector, uint96(2), uint96(1)));
        arbiter.act(stale, sig);
    }
}
