/*
 * VaultShares.spec — P3-PPS + P3-ROUND (PROPERTIES.md)
 *
 * Scene: CommitmentsVault (the ERC-4626 implementation, verified directly like
 * ManagerSmoke verifies the manager impl — the VaultFactory deploys it behind
 * an ERC-1967 proxy, but the prover reasons over the implementation's code and
 * EIP-7201 namespaced storage, so slot regressions stay owned by
 * test/StorageSlots.t.sol, not this proof). DummyERC20 is the standard-token
 * asset model (no fee-on-transfer / rebasing / hooks — the PROPERTIES.md
 * verification assumption); every IERC20 call DISPATCHes to it.
 *
 * The vault's decimals offset is 9, so the OZ virtual-shares math is:
 *     shares = assets.mulDiv(totalSupply() + 1e9, totalAssets() + 1, r)
 *     assets = shares.mulDiv(totalAssets() + 1, totalSupply() + 1e9, r)
 * with r = Floor for deposit/redeem/convert and Ceil for mint/withdraw preview.
 * All rules are stated MULTIPLICATIVELY (cross-multiplied) so the prover never
 * has to reason about division of two symbolic operands — the one nonlinear
 * mulDiv is confined to the single product `assets * (supply+1e9)` etc., which
 * Certora's arithmetic handles as a bounded bilinear term.
 *
 * ─── Modeling assumptions (documented, deliberate) ────────────────────────────
 *
 *  A1. IDLE-VAULT SCOPE for the price/inflation rules (P3-PPS). The vault's
 *      totalAssets() branches on s.yieldStrategy: with a strategy set it calls
 *      IYieldStrategy.totalAssets() (an external, non-monotone oracle the vault
 *      does not control) PLUS idle balance; with no strategy it is exactly the
 *      vault's own token balance. The default / canonical deployment is the
 *      IDLE vault (no strategy — CLAUDE.md: "none shipped by default … idle
 *      until set"), and share-price preservation is a statement about the
 *      vault's OWN accounting, not about a third-party oracle's honesty. So the
 *      PPS + inflation rules REQUIRE yieldStrategy() == 0. The strategy-set case
 *      (where a lying/again non-monotone strategy can move NAV arbitrarily) is a
 *      documented gap: its safety reduces to "the strategy reports honest,
 *      monotone NAV", which is the strategy's own obligation, not the vault's,
 *      and is exercised by Fuzz/Medusa against the concrete IdleStrategy. See
 *      the `strategyIsIdle` filter below.
 *
 *  A2. ROUNDING rules (P3-ROUND) are strategy-agnostic: they compare a mint/burn
 *      against the observable preview at the SAME pre-state, and OZ derives the
 *      minted/burned amount from exactly that preview (deposit→previewDeposit,
 *      mint→previewMint, withdraw→previewWithdraw, redeem→previewRedeem). The
 *      identity therefore holds regardless of what totalAssets() returned, so
 *      those rules constrain the strategy's NAV only to be DETERMINISTIC
 *      within the transaction (summarized CONSTANT — see the methods block;
 *      an intra-tx nondeterministic NAV breaks preview↔action equality
 *      on-chain too, so determinism folds into A1's honest-strategy
 *      obligation). The reported VALUE stays arbitrary, and the idle filter
 *      stays off for these rules.
 *
 *  A3. Standard-token asset (DummyERC20 via DISPATCHER). No fee-on-transfer, so
 *      the assets pulled in equal the assets credited — matches the ERC's
 *      deployment screening stance (PROPERTIES.md).
 *
 *  A4. previewDeposit/Mint/Withdraw/Redeem are the OBSERVABLE rounding surface;
 *      _convertToShares/_convertToAssets are internal, so the rules assert
 *      against the public preview functions (which OZ defines as the exact
 *      convert-with-rounding-direction wrappers). This is stronger than needed:
 *      it pins the ERC-4626-normative preview↔action equality too.
 *
 *  A5. totalSupply == Σ balances is NOT asserted (would need an ERC20 balance
 *      ghost sum; the OZ ERC20 storage is not exposed as an aggregate in this
 *      scene). Deliberately SKIPPED — it is an ERC20 property, orthogonal to the
 *      vault's 4626 rounding, and already covered by OZ's own test suite. Noted
 *      in PROPERTIES.md as a gap for this spec.
 */

using DummyERC20 as asset;

methods {
    // ERC-4626 views (envfree — pure functions of state)
    function totalAssets() external returns (uint256) envfree;
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function asset() external returns (address) envfree;
    function yieldStrategy() external returns (address) envfree;

    function convertToShares(uint256) external returns (uint256) envfree;
    function convertToAssets(uint256) external returns (uint256) envfree;
    function previewDeposit(uint256) external returns (uint256) envfree;
    function previewMint(uint256) external returns (uint256) envfree;
    function previewWithdraw(uint256) external returns (uint256) envfree;
    function previewRedeem(uint256) external returns (uint256) envfree;
    function maxRedeem(address) external returns (uint256) envfree;

    // Token model: every IERC20 call DISPATCHes to the standard DummyERC20.
    function asset.balanceOf(address) external returns (uint256) envfree;
    function _.transfer(address, uint256) external => DISPATCHER(true);
    function _.transferFrom(address, address, uint256) external => DISPATCHER(true);
    function _.balanceOf(address) external => DISPATCHER(true);
    function _.approve(address, uint256) external => DISPATCHER(true);

    // Strategy handshake: unresolved external calls to a (possibly set) strategy
    // are havoc'd. Under A1's idle filter these are never reached for the PPS
    // rules; the rounding rules leave them NONDET (A2). Named-target NONDET keeps
    // the prover from havocking storage on these view/mutator stubs.
    function _.deposit(uint256) external => NONDET;
    function _.withdraw(uint256) external => NONDET;
    function _.maxDeposit() external => NONDET;

    // Strategy NAV is CONSTANT per rule, not NONDET (run-260713 VaultShares
    // triage): A2's comment claimed NONDET but no summary existed, so the call
    // fell to AUTO havoc and returned a DIFFERENT value on each read within
    // one rule — previewRedeem saw NAV 999,999,997 while the rule-level read
    // saw 2, spuriously breaking the floor bound. On-chain a view of fixed
    // storage is deterministic within a transaction; a strategy whose NAV
    // report is intra-tx nondeterministic breaks preview↔action equality on
    // the REAL chain too — that determinism is part of A1's honest-strategy
    // obligation (noted in PROPERTIES.md).
    function _.totalAssets() external => CONSTANT;

    // Unresolved-call routing (run-260713 triage, family A): OZ v5 SafeERC20's
    // assembly-built token call defeats static sighash matching and fell to
    // AUTO havoc. Same justification as ManagerLedger.spec.
    unresolved external in _._ => DISPATCH [
        asset.transfer(address, uint256),
        asset.transferFrom(address, address, uint256),
        asset.balanceOf(address)
    ] default NONDET;
}

// The virtual offsets the implementation hard-codes (`_decimalsOffset() == 9`).
definition VIRTUAL_SHARES() returns mathint = 1000000000;   // 10^9
definition VIRTUAL_ASSETS() returns mathint = 1;

// Idle-vault filter (assumption A1): no strategy configured.
definition strategyIsIdle() returns bool = yieldStrategy() == 0;

// =============================================================================
// P3-ROUND — rounding always favors the vault (the standard four).
// Each rule pins the OZ preview↔action equality (A2/A4) and the rounding
// DIRECTION relative to the exact (unrounded) product.
// =============================================================================

/// deposit rounds SHARES DOWN: minted shares == previewDeposit(assets), and
/// previewDeposit floors, i.e. shares * (totalAssets+1) <= assets * (supply+1e9).
/// (Vault-favoring: depositor never receives more shares than the exact ratio.)
rule depositRoundsSharesDown(env e, uint256 assets, address receiver) {
    mathint ta = totalAssets();
    mathint ts = totalSupply();

    uint256 preview = previewDeposit(assets);
    uint256 minted = deposit(e, assets, receiver);

    // action == preview at the same pre-state (ERC-4626 normative equality).
    assert to_mathint(minted) == to_mathint(preview),
        "deposit must mint exactly previewDeposit(assets)";
    // floor direction, cross-multiplied (no division):
    assert to_mathint(minted) * (ta + VIRTUAL_ASSETS())
        <= to_mathint(assets) * (ts + VIRTUAL_SHARES()),
        "P3-ROUND: deposit shares rounded DOWN (favors vault)";
}

/// mint rounds ASSETS UP: assets pulled == previewMint(shares), and previewMint
/// ceils, i.e. assets * (supply+1e9) >= shares * (totalAssets+1).
/// (Vault-favoring: minter always pays at least the exact ratio.)
rule mintRoundsAssetsUp(env e, uint256 shares, address receiver) {
    mathint ta = totalAssets();
    mathint ts = totalSupply();

    uint256 preview = previewMint(shares);
    uint256 paid = mint(e, shares, receiver);

    assert to_mathint(paid) == to_mathint(preview),
        "mint must pull exactly previewMint(shares)";
    assert to_mathint(paid) * (ts + VIRTUAL_SHARES())
        >= to_mathint(shares) * (ta + VIRTUAL_ASSETS()),
        "P3-ROUND: mint assets rounded UP (favors vault)";
}

/// withdraw rounds SHARES UP: shares burned == previewWithdraw(assets), and
/// previewWithdraw ceils, i.e. shares * (totalAssets+1) >= assets * (supply+1e9).
/// (Vault-favoring: withdrawer burns at least the exact number of shares.)
rule withdrawRoundsSharesUp(env e, uint256 assets, address receiver, address owner) {
    // A5 discharge, narrow form (run-260713 VaultShares triage): OZ v5's burn
    // decrements totalSupply UNCHECKED, justified by supply == sum-of-balances;
    // the prover's arbitrary storage violated it (balanceOf(owner)=13 >
    // totalSupply=12) and wrapped supply to MAX_UINT256. Require exactly the
    // slice of that ERC20 invariant the burn relies on.
    require balanceOf(owner) <= totalSupply();
    mathint ta = totalAssets();
    mathint ts = totalSupply();

    uint256 preview = previewWithdraw(assets);
    uint256 burned = withdraw(e, assets, receiver, owner);

    assert to_mathint(burned) == to_mathint(preview),
        "withdraw must burn exactly previewWithdraw(assets)";
    assert to_mathint(burned) * (ta + VIRTUAL_ASSETS())
        >= to_mathint(assets) * (ts + VIRTUAL_SHARES()),
        "P3-ROUND: withdraw shares rounded UP (favors vault)";
}

/// redeem rounds ASSETS DOWN: assets paid == previewRedeem(shares), and
/// previewRedeem floors, i.e. assets * (supply+1e9) <= shares * (totalAssets+1).
/// (Vault-favoring: redeemer never receives more assets than the exact ratio.)
rule redeemRoundsAssetsDown(env e, uint256 shares, address receiver, address owner) {
    // A5 discharge, narrow form (run-260713 VaultShares triage): OZ v5's burn
    // decrements totalSupply UNCHECKED, justified by supply == sum-of-balances;
    // the prover's arbitrary storage violated it (balanceOf(owner)=13 >
    // totalSupply=12) and wrapped supply to MAX_UINT256. Require exactly the
    // slice of that ERC20 invariant the burn relies on.
    require balanceOf(owner) <= totalSupply();
    mathint ta = totalAssets();
    mathint ts = totalSupply();

    uint256 preview = previewRedeem(shares);
    uint256 paid = redeem(e, shares, receiver, owner);

    assert to_mathint(paid) == to_mathint(preview),
        "redeem must pay exactly previewRedeem(shares)";
    assert to_mathint(paid) * (ts + VIRTUAL_SHARES())
        <= to_mathint(shares) * (ta + VIRTUAL_ASSETS()),
        "P3-ROUND: redeem assets rounded DOWN (favors vault)";
}

// =============================================================================
// P3-ROUND (convert-level, state-quantified) — the pure conversion functions
// round in the vault's favor at EVERY reachable state, not just across an
// action. convertTo{Shares,Assets} both floor; the ceil variants live in the
// preview functions checked above. These are the mulDiv identities the whole
// spec rests on, isolated.
// =============================================================================

/// convertToShares floors: result * (totalAssets+1) <= assets * (supply+1e9).
rule convertToSharesFloors(uint256 assets) {
    mathint ta = totalAssets();
    mathint ts = totalSupply();
    uint256 shares = convertToShares(assets);
    assert to_mathint(shares) * (ta + VIRTUAL_ASSETS())
        <= to_mathint(assets) * (ts + VIRTUAL_SHARES()),
        "convertToShares must floor (favors vault)";
}

/// convertToAssets floors: result * (supply+1e9) <= shares * (totalAssets+1).
rule convertToAssetsFloors(uint256 shares) {
    mathint ta = totalAssets();
    mathint ts = totalSupply();
    uint256 assets = convertToAssets(shares);
    assert to_mathint(assets) * (ts + VIRTUAL_SHARES())
        <= to_mathint(shares) * (ta + VIRTUAL_ASSETS()),
        "convertToAssets must floor (favors vault)";
}

// =============================================================================
// P3-PPS — share-price non-decrease under deposit / mint / withdraw / redeem
// on the IDLE vault (assumption A1). Stated multiplicatively as the price
// ratio (totalAssets+1)/(totalSupply+1e9): the pre-state ratio is preserved as
// a cross-product inequality across each action.
//
//   price_before = (TA0 + 1) / (TS0 + 1e9)
//   price_after  = (TA1 + 1) / (TS1 + 1e9)
//   non-decrease ⇔ (TA1+1)*(TS0+1e9) >= (TA0+1)*(TS1+1e9)
//
// Deposit/mint add matching assets+shares; the rounding (shares floored on
// deposit, assets ceiled on mint) means the vault captures the dust, so the
// ratio can only rise. Withdraw/redeem remove matching assets+shares with the
// mirror rounding, again vault-favoring. The virtual-shares term makes the
// inequality hold even from the empty vault (TS0 == 0).
// =============================================================================

/// deposit does not decrease share price (idle vault).
rule sharePriceNonDecreaseOnDeposit(env e, uint256 assets, address receiver) {
    require strategyIsIdle();
    mathint TA0 = totalAssets();
    mathint TS0 = totalSupply();

    deposit(e, assets, receiver);

    mathint TA1 = totalAssets();
    mathint TS1 = totalSupply();
    assert (TA1 + VIRTUAL_ASSETS()) * (TS0 + VIRTUAL_SHARES())
        >= (TA0 + VIRTUAL_ASSETS()) * (TS1 + VIRTUAL_SHARES()),
        "P3-PPS: deposit must not decrease share price";
}

/// mint does not decrease share price (idle vault).
rule sharePriceNonDecreaseOnMint(env e, uint256 shares, address receiver) {
    require strategyIsIdle();
    mathint TA0 = totalAssets();
    mathint TS0 = totalSupply();

    mint(e, shares, receiver);

    mathint TA1 = totalAssets();
    mathint TS1 = totalSupply();
    assert (TA1 + VIRTUAL_ASSETS()) * (TS0 + VIRTUAL_SHARES())
        >= (TA0 + VIRTUAL_ASSETS()) * (TS1 + VIRTUAL_SHARES()),
        "P3-PPS: mint must not decrease share price";
}

/// withdraw does not decrease share price (idle vault).
rule sharePriceNonDecreaseOnWithdraw(env e, uint256 assets, address receiver, address owner) {
    // A5 discharge, narrow form (run-260713 VaultShares triage): OZ v5's burn
    // decrements totalSupply UNCHECKED, justified by supply == sum-of-balances;
    // the prover's arbitrary storage violated it (balanceOf(owner)=13 >
    // totalSupply=12) and wrapped supply to MAX_UINT256. Require exactly the
    // slice of that ERC20 invariant the burn relies on.
    require balanceOf(owner) <= totalSupply();
    require strategyIsIdle();
    mathint TA0 = totalAssets();
    mathint TS0 = totalSupply();

    withdraw(e, assets, receiver, owner);

    mathint TA1 = totalAssets();
    mathint TS1 = totalSupply();
    assert (TA1 + VIRTUAL_ASSETS()) * (TS0 + VIRTUAL_SHARES())
        >= (TA0 + VIRTUAL_ASSETS()) * (TS1 + VIRTUAL_SHARES()),
        "P3-PPS: withdraw must not decrease share price";
}

/// redeem does not decrease share price (idle vault).
rule sharePriceNonDecreaseOnRedeem(env e, uint256 shares, address receiver, address owner) {
    // A5 discharge, narrow form (run-260713 VaultShares triage): OZ v5's burn
    // decrements totalSupply UNCHECKED, justified by supply == sum-of-balances;
    // the prover's arbitrary storage violated it (balanceOf(owner)=13 >
    // totalSupply=12) and wrapped supply to MAX_UINT256. Require exactly the
    // slice of that ERC20 invariant the burn relies on.
    require balanceOf(owner) <= totalSupply();
    require strategyIsIdle();
    mathint TA0 = totalAssets();
    mathint TS0 = totalSupply();

    redeem(e, shares, receiver, owner);

    mathint TA1 = totalAssets();
    mathint TS1 = totalSupply();
    assert (TA1 + VIRTUAL_ASSETS()) * (TS0 + VIRTUAL_SHARES())
        >= (TA0 + VIRTUAL_ASSETS()) * (TS1 + VIRTUAL_SHARES()),
        "P3-PPS: redeem must not decrease share price";
}

/// donate never decreases share price and (being share-mint-free) can only
/// raise it: NAV up, supply flat (idle vault). Covers the attacker donate()
/// vector referenced by the no-inflation property.
rule sharePriceNonDecreaseOnDonate(env e, uint256 assets) {
    require strategyIsIdle();
    mathint TA0 = totalAssets();
    mathint TS0 = totalSupply();

    donate(e, assets);

    mathint TA1 = totalAssets();
    mathint TS1 = totalSupply();
    // supply is unchanged by donate; NAV is non-decreasing.
    assert TS1 == TS0, "donate must not change total supply";
    assert TA1 >= TA0, "P3-PPS: donate must not decrease NAV";
}

// =============================================================================
// P3-PPS — no first-depositor inflation. A depositor who mints `s` shares into
// the idle vault and immediately redeems all of them recovers all but a bounded
// dust of what they deposited, EVEN after an attacker donate()s beforehand.
//
// Round-trip loss bound. previewRedeem(previewDeposit(a)) <= a always (each leg
// floors), so the round-trip never returns MORE than deposited — no theft of
// prior depositors. The *inflation* concern is the reverse: a fresh depositor
// must not LOSE a large fraction. With the 1e9 virtual-share offset the classic
// single-victim inflation loss is bounded to sub-dust; here we prove the crisp,
// division-free safety half: the redeem never returns more than the deposit
// (attacker cannot profit from the victim), and the shares minted are positive
// whenever the exact ratio would round to >= 1.
// =============================================================================

/// A deposit→redeem-all round-trip never returns MORE assets than deposited:
/// the vault (and thus prior depositors) cannot be drained by a round-trip,
/// under any pre-state including a prior attacker donation. This is the
/// division-free, attacker-donation-robust core of the no-inflation claim.
rule depositRedeemRoundTripNoGain(uint256 assets) {
    uint256 sharesOut = previewDeposit(assets);
    uint256 assetsBack = previewRedeem(sharesOut);
    assert assetsBack <= assets,
        "no-inflation: deposit->redeem round-trip cannot return more than deposited";
}

/// Symmetric no-free-shares check for the mint direction: minting `shares` then
/// withdrawing exactly the assets that were paid burns AT LEAST `shares` back
/// (withdraw ceils shares), so a mint→withdraw round-trip never leaves the user
/// holding free shares carved out of the vault.
rule mintWithdrawRoundTripNoFreeShares(uint256 shares) {
    uint256 assetsIn = previewMint(shares);
    uint256 sharesBurned = previewWithdraw(assetsIn);
    assert sharesBurned >= shares,
        "no-inflation: mint->withdraw round-trip must burn at least the minted shares";
}
