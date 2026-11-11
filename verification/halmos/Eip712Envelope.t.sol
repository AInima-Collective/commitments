// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {CommitmentManager} from "src/core/manager/CommitmentManager.sol";
import {ICommitmentManager as ICM} from "src/core/interfaces/ICommitmentManager.sol";
import {MockERC20} from "test/helpers/MockERC20.sol";
import {HalmosBase} from "./HalmosBase.sol";

/// @title Eip712Envelope — periphery Halmos harness (PROPERTIES.md §P4)
/// @notice EIP-712 envelope verification for the relayer create path
///         (`CommitmentManager.createCommitmentFor`, `CREATE_COMMITMENT_TYPEHASH`).
///         DIFFERENTIAL form: a concrete signature is produced over a concrete params
///         set A with a concrete private key; the harness then symbolically TAMPERS one
///         signed field and asserts the tampered call cannot succeed — the envelope
///         authorizes params A and nothing else. Plus concrete nonce-replay and deadline
///         checks.
///
///         Properties proved:
///           - P4-712-BIND: for a SYMBOLIC tampered value of a single signed field
///             (amount / counterparty / arbiter / nonce / deadline), the EIP-712 typed-data
///             digest that `createCommitmentFor` recomputes and feeds to signature
///             verification DIFFERS from the signed digest whenever the field differs. This
///             is the "params A does not authorize params B" statement at the layer halmos
///             reasons about soundly (keccak256 is modeled). It reproduces the manager's
///             exact digest assembly (CommitmentLifecycleLib._isValidCreateSignature). The
///             ecrecover step that turns "different digest" into "different recovered signer"
///             is NOT halmos-decidable (SYMBOLIC-TAMPER GAP, C1) — but a signature is bound
///             to exactly one digest, so a provably-different digest is a provably-different
///             authorization.
///           - P4-712-NONCE: the same valid signature submitted twice — the second call
///             reverts (`InvalidNonce`), because the first consumed the signer's nonce.
///             Replaying an envelope is impossible. (End-to-end through the real manager.)
///           - P4-712-DEADLINE: a call at `block.timestamp > deadline` reverts
///             (`SignatureExpired`) even with an otherwise-valid signature. (End-to-end.)
///           - P4-712-HAPPY (anchor / non-vacuity): the untampered signature at the
///             correct nonce and a live deadline SUCCEEDS end-to-end and returns id ≥ 1 —
///             proving the replay/deadline reverts are not vacuous (the accept branch through
///             ecrecover + create is reachable), and that the reproduced digest matches the
///             manager's (else the happy path could not have verified).
///
/// @dev Concessions:
///        C1. SYMBOLIC-TAMPER GAP (ecrecover is uninterpreted in halmos). Halmos models
///            the `ecrecover` precompile as an UNINTERPRETED function and does NOT gain
///            precision when the digest is concrete: it is free to pick a path where a
///            DIFFERENT digest "recovers" to `committer`. We confirmed BOTH forms fail
///            end-to-end: symbolic tamper yields witness `p_arbiter == 0x01`, and a CONCRETE
///            tamper (arbiter = 0x40098) yields an empty (`∅`) counterexample — halmos let the
///            call succeed on the tampered params regardless. So "tampered params revert
///            end-to-end" is NOT halmos-provable; it is owned by Foundry (real ecrecover) and
///            is asserted in the Foundry manager suite. What halmos CAN prove soundly is the
///            DIGEST-BINDING half: the typed-data digest the manager verifies against differs
///            the instant any signed field differs (keccak256 is modeled). Since an ECDSA
///            signature authorizes exactly one digest, a provably-different digest is a
///            provably-different (hence unauthorized) envelope. The P4-712-BIND checks assert
///            that, reproducing the manager's exact digest assembly. The end-to-end
///            nonce-replay and deadline reverts do NOT depend on ecrecover discrimination
///            (they reuse the identical signed digest / short-circuit before verification) and
///            are proved through the real manager.
///        C2. P4-712-BIND covers amount / counterparty / arbiter / nonce / deadline, each
///            flipped to a SYMBOLIC alternate. All 14 typehash fields feed the single struct
///            hash identically; these five are representative witnesses that the digest is not
///            field-selective. The `_structHash`/`_digest` reproduction is validated against
///            the manager by P4-712-HAPPY (a mismatch would make the happy path fail to
///            verify).
///        C3. Strategy-free params (empty strategies array ⇒ strategiesHash over an empty
///            array) and empty metadata, matching the create-path scene of the other
///            manager harnesses.
///        C4. Domain separator is recomputed from the EIP-712 domain (name "Commitments",
///            version "1", chainid, verifyingContract == manager proxy) to match
///            `_domainSeparatorV4()` the manager passes into the lib.
///
///      Run: FOUNDRY_PROFILE=halmos halmos --contract Eip712Envelope
contract Eip712Envelope is HalmosBase {
    CommitmentManager internal manager;
    MockERC20 internal token;

    // Concrete signer key: committer = vm.addr(PK).
    uint256 internal constant PK = 0xA11CE;
    address internal committer;

    address internal constant ARBITER = address(0x40001);
    address internal constant COUNTERPARTY = address(0x40002);
    address internal constant ADAPTER = address(0x40004);
    address internal constant RELAYER = address(0x40003);

    uint256 internal constant DEPOSIT = 10_000e18;
    uint256 internal constant AMOUNT = 1_000e18;
    uint16 internal constant MAX_PENALTY_BPS = 5_000;
    uint64 internal constant CHALLENGE_WINDOW = 86_400;
    uint64 internal constant EXPIRES_AT = 0;
    uint256 internal constant DEADLINE = 1_000_000;

    bytes32 internal constant CREATE_COMMITMENT_TYPEHASH = keccak256(
        "CreateCommitment(address committer,address arbiter,address counterparty,address token,"
        "address adapter,uint256 amount,uint16 maxPenaltyBps,uint64 challengeWindow,uint64 expiresAt,"
        "bytes32 strategiesHash,string metadataURI,bytes32 metadataHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal domainSeparator;
    bytes internal sig; // signature over params A at nonce 0

    function setUp() public {
        _etchManagerLibs();
        committer = vm.addr(PK);

        CommitmentManager impl = new CommitmentManager();
        manager = CommitmentManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(CommitmentManager.initialize, (address(0xAD), 7 days, 14 days))
                )
            )
        );

        token = new MockERC20("Backing", "BCK", 18);
        token.mint(committer, DEPOSIT);
        vm.prank(committer);
        token.approve(address(manager), type(uint256).max);
        vm.prank(committer);
        manager.deposit(address(token), DEPOSIT);

        // Keep the deadline live.
        vm.warp(1);

        domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("Commitments")),
                keccak256(bytes("1")),
                block.chainid,
                address(manager)
            )
        );

        // Sign params A at nonce 0.
        sig = _sign(_paramsA(), 0, DEADLINE);
    }

    // ---- params + digest helpers (mirror CommitmentLifecycleLib._isValidCreateSignature) ----

    function _paramsA() internal view returns (ICM.CommitmentParams memory p) {
        p.arbiter = ARBITER;
        p.counterparty = COUNTERPARTY;
        p.token = address(token);
        p.adapter = ADAPTER;
        p.amount = AMOUNT;
        p.maxPenaltyBps = MAX_PENALTY_BPS;
        p.challengeWindow = CHALLENGE_WINDOW;
        p.expiresAt = EXPIRES_AT;
        // strategies empty, metadata empty.
    }

    function _structHash(ICM.CommitmentParams memory p, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 strategiesHash = keccak256(abi.encode(p.strategies));
        return keccak256(
            bytes.concat(
                abi.encode(
                    CREATE_COMMITMENT_TYPEHASH, committer, p.arbiter, p.counterparty, p.token, p.adapter, p.amount
                ),
                abi.encode(
                    uint256(p.maxPenaltyBps),
                    uint256(p.challengeWindow),
                    uint256(p.expiresAt),
                    strategiesHash,
                    keccak256(bytes(p.metadataURI)),
                    p.metadataHash,
                    nonce,
                    deadline
                )
            )
        );
    }

    function _digest(ICM.CommitmentParams memory p, uint256 nonce, uint256 deadline) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, _structHash(p, nonce, deadline)));
    }

    function _sign(ICM.CommitmentParams memory p, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, _digest(p, nonce, deadline));
        return abi.encodePacked(r, s, v);
    }

    // =========================================================================
    // P4-712-HAPPY (anchor): the untampered envelope succeeds
    // =========================================================================

    /// @notice The valid signature over params A at nonce 0 with a live deadline creates a
    ///         commitment (id >= 1) and consumes the signer's nonce. This anchors the
    ///         reachability of the accept branch so the reverting checks below are non-vacuous.
    function check_createCommitmentFor_validEnvelopeSucceeds() public {
        vm.prank(RELAYER);
        uint256 id = manager.createCommitmentFor(committer, _paramsA(), DEADLINE, 0, sig);
        assert(id >= 1);
        assert(manager.nonces(committer) == 1);
    }

    // =========================================================================
    // P4-712-BIND: flipping any signed field changes the verified digest
    // =========================================================================
    //
    // The digest the manager verifies against is _digest(params, nonce, deadline). A
    // signature authorizes exactly one digest, so proving the digest DIFFERS the instant a
    // field differs proves params A does not authorize params B. keccak256 is modeled by
    // halmos, so these are sound; the ecrecover step is the documented gap (C1).

    /// @notice A SYMBOLIC amount != AMOUNT yields a digest != the signed digest.
    function check_digestBinds_amount(uint256 amount) public view {
        vm.assume(amount != AMOUNT);
        ICM.CommitmentParams memory p = _paramsA();
        p.amount = amount;
        assert(_digest(p, 0, DEADLINE) != _digest(_paramsA(), 0, DEADLINE));
    }

    /// @notice A SYMBOLIC counterparty != COUNTERPARTY yields a different digest.
    function check_digestBinds_counterparty(address counterparty) public view {
        vm.assume(counterparty != COUNTERPARTY);
        ICM.CommitmentParams memory p = _paramsA();
        p.counterparty = counterparty;
        assert(_digest(p, 0, DEADLINE) != _digest(_paramsA(), 0, DEADLINE));
    }

    /// @notice A SYMBOLIC arbiter != ARBITER yields a different digest.
    function check_digestBinds_arbiter(address arbiter) public view {
        vm.assume(arbiter != ARBITER);
        ICM.CommitmentParams memory p = _paramsA();
        p.arbiter = arbiter;
        assert(_digest(p, 0, DEADLINE) != _digest(_paramsA(), 0, DEADLINE));
    }

    /// @notice A SYMBOLIC nonce != 0 yields a different digest (the envelope is nonce-bound).
    function check_digestBinds_nonce(uint256 nonce) public view {
        vm.assume(nonce != 0);
        assert(_digest(_paramsA(), nonce, DEADLINE) != _digest(_paramsA(), 0, DEADLINE));
    }

    /// @notice A SYMBOLIC deadline != DEADLINE yields a different digest.
    function check_digestBinds_deadline(uint256 deadline) public view {
        vm.assume(deadline != DEADLINE);
        assert(_digest(_paramsA(), 0, deadline) != _digest(_paramsA(), 0, DEADLINE));
    }

    // =========================================================================
    // P4-712-NONCE: the same envelope cannot be replayed
    // =========================================================================

    /// @notice The valid envelope submitted twice: the first consumes nonce 0; the second
    ///         (same signature, same nonce-0 payload) reverts — the signer's nonce is now 1,
    ///         so the replayed nonce no longer matches. No second commitment is created.
    function check_createCommitmentFor_replayRejected() public {
        vm.prank(RELAYER);
        uint256 id1 = manager.createCommitmentFor(committer, _paramsA(), DEADLINE, 0, sig);
        assert(id1 >= 1);
        assert(manager.nonces(committer) == 1);

        vm.prank(RELAYER);
        try manager.createCommitmentFor(committer, _paramsA(), DEADLINE, 0, sig) returns (uint256) {
            assert(false); // replay must fail (InvalidNonce)
        } catch {
            assert(manager.nonces(committer) == 1); // still only one consumed
        }
    }

    // =========================================================================
    // P4-712-DEADLINE: an expired envelope reverts
    // =========================================================================

    /// @notice At any `block.timestamp > DEADLINE` the call reverts (SignatureExpired) even
    ///         with the valid signature. The deadline is honored regardless of signature
    ///         validity. Symbolic over the warped timestamp.
    function check_createCommitmentFor_expiredDeadlineReverts(uint64 nowTs) public {
        vm.assume(nowTs > DEADLINE);
        vm.warp(nowTs);

        vm.prank(RELAYER);
        try manager.createCommitmentFor(committer, _paramsA(), DEADLINE, 0, sig) returns (uint256) {
            assert(false); // past the deadline it must revert
        } catch {
            assert(manager.nonces(committer) == 0); // nonce untouched
        }
    }
}
