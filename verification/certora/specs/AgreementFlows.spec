/*
 * AgreementFlows.spec — P2 bilateral agreement flow caps (PROPERTIES.md)
 *
 * Same scene as ManagerLedger.spec. INV-E1: settlement flow per direction is
 * bounded by an immutable per-direction lifetime cap, cumulatives only
 * ratchet up, and one settle moves exactly `units` payer-encumbrance into the
 * receiver's free balance (pull payment, no external transfer).
 */

using DummyERC20 as backing;

methods {
    function freeBalance(address, address) external returns (uint256) envfree;
    function encumberedBalance(address, address) external returns (uint256) envfree;
    function getCommitment(uint256) external returns (ICommitmentManager.Commitment memory) envfree;
    function getAgreementSettlement(uint256) external returns (uint128, uint128, uint128, uint128) envfree;
    function getAgreementPair(uint256) external returns (uint256, uint256) envfree;

    function backing.balanceOf(address) external returns (uint256) envfree;
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external => NONDET;

    // Unresolved-call routing (run-260713 triage, family A): OZ v5 SafeERC20's
    // assembly-built token call defeats static sighash matching and fell to
    // AUTO havoc. Same justification as ManagerLedger.spec.
    unresolved external in _._ => DISPATCH [
        backing.transfer(address, uint256),
        backing.transferFrom(address, address, uint256),
        backing.balanceOf(address)
    ] default NONDET;
}

// Component accessors over the tuple-returning view (CVL invariant
// expressions can't destructure tuples inline).
function maxPToAOf(uint256 agreementId) returns uint128 {
    uint128 a; uint128 b; uint128 c; uint128 d;
    (a, b, c, d) = getAgreementSettlement(agreementId);
    return a;
}

function maxAToPOf(uint256 agreementId) returns uint128 {
    uint128 a; uint128 b; uint128 c; uint128 d;
    (a, b, c, d) = getAgreementSettlement(agreementId);
    return b;
}

function cumulPToAOf(uint256 agreementId) returns uint128 {
    uint128 a; uint128 b; uint128 c; uint128 d;
    (a, b, c, d) = getAgreementSettlement(agreementId);
    return c;
}

function cumulAToPOf(uint256 agreementId) returns uint128 {
    uint128 a; uint128 b; uint128 c; uint128 d;
    (a, b, c, d) = getAgreementSettlement(agreementId);
    return d;
}

/// INV-E1 (invariant form): cumulative flow per direction never exceeds its
/// cap; a zero cap implies zero cumulative (settlement disabled).
invariant cumulativeFlowsWithinCaps(uint256 agreementId)
    cumulPToAOf(agreementId) <= maxPToAOf(agreementId)
        && cumulAToPOf(agreementId) <= maxAToPOf(agreementId)
    filtered {
        // Family F: upgradeToAndCall delegatecalls into a symbolic
        // implementation and havocs all storage (ManagerSmoke precedent).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
    {
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

/// INV-E1 (ratchet): cumulatives never decrease, caps never change, under any
/// method.
rule settlementBookkeepingRatchets(env e, method f, calldataarg args, uint256 agreementId)
    filtered {
        // Family F (see cumulativeFlowsWithinCaps).
        f -> f.selector != sig:upgradeToAndCall(address, bytes).selector
    }
{
    require e.msg.sender != currentContract;
    uint128 maxPToA0; uint128 maxAToP0; uint128 cumulPToA0; uint128 cumulAToP0;
    (maxPToA0, maxAToP0, cumulPToA0, cumulAToP0) = getAgreementSettlement(agreementId);
    // Live agreement only: caps are copied once at acceptance; before that the
    // record is zeroed and acceptance itself initializes it.
    require maxPToA0 != 0 || maxAToP0 != 0;

    f(e, args);

    uint128 maxPToA1; uint128 maxAToP1; uint128 cumulPToA1; uint128 cumulAToP1;
    (maxPToA1, maxAToP1, cumulPToA1, cumulAToP1) = getAgreementSettlement(agreementId);
    assert cumulPToA1 >= cumulPToA0 && cumulAToP1 >= cumulAToP0,
        "INV-E1: cumulative settled flow only ratchets up";
    assert maxPToA1 == maxPToA0 && maxAToP1 == maxAToP0,
        "INV-E1: per-direction caps are immutable once live";
}

/// INV-E1 (effect): one settleAgreement moves exactly `units` from the payer
/// committer's encumbrance to the receiver committer's free balance — ledger
/// credit only, no token leaves the manager.
rule settleShiftsExactlyUnits(env e, uint256 agreementId, bool fromProposer, uint256 units, bytes32 evidenceHash) {
    require e.msg.sender != currentContract;
    uint256 payerCid; uint256 receiverCid; uint256 cidA; uint256 cidB;
    (cidA, cidB) = getAgreementPair(agreementId);
    payerCid = fromProposer ? cidA : cidB;
    receiverCid = fromProposer ? cidB : cidA;

    address payer = getCommitment(payerCid).committer;
    address receiver = getCommitment(receiverCid).committer;
    require payer != receiver;
    require getCommitment(payerCid).token == backing;

    mathint managerBalBefore = backing.balanceOf(currentContract);
    mathint payerEncBefore = encumberedBalance(backing, payer);
    mathint receiverFreeBefore = freeBalance(backing, receiver);
    mathint payerAmountBefore = getCommitment(payerCid).amount;
    mathint receiverAmountBefore = getCommitment(receiverCid).amount;
    mathint receiverEncBefore = encumberedBalance(backing, receiver);

    settleAgreement(e, agreementId, fromProposer, units, evidenceHash);

    assert to_mathint(backing.balanceOf(currentContract)) == managerBalBefore,
        "INV-E1: settlement is pull-payment — no external transfer";
    assert to_mathint(encumberedBalance(backing, payer)) == payerEncBefore - units,
        "INV-E1: payer encumbrance debited by exactly units";
    assert to_mathint(freeBalance(backing, receiver)) == receiverFreeBefore + units,
        "INV-E1: receiver free balance credited by exactly units";
    assert to_mathint(getCommitment(payerCid).amount) == payerAmountBefore - units,
        "INV-E1: only the payer leg's residual shrinks";
    // INV-E2 (ERC-COMMITMENTS-AGREEMENTS §5, deviate-risk item 11 of the MUST
    // map): the receiver leg is untouched — its residual and its committer's
    // encumbrance are bit-identical across the settle, whether or not the two
    // legs share a token.
    assert to_mathint(getCommitment(receiverCid).amount) == receiverAmountBefore,
        "INV-E2: receiver leg residual untouched by settlement";
    assert to_mathint(encumberedBalance(backing, receiver)) == receiverEncBefore,
        "INV-E2: receiver committer's encumbrance untouched by settlement";
}
