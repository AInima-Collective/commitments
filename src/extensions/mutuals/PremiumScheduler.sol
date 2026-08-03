// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ILinkedMutualPolicy} from "src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol";
import {BPS_DENOMINATOR, WAD} from "src/shared/Constants.sol";

/// @title PremiumScheduler
/// @notice The pricing brain for a Mutual's premium stream. Off the audited custody
///         path: the core (`fundMutualPremium`) is pricing-agnostic and only sets a future rate; all
///         pricing discretion lives here, under the `owner` (the pricing authority).
///
///         Pricing is a two-slope kinked utilization curve on the **demand/supply** axis —
///         `u = activeNotionalSold / activeCover` — so when underwriters flee (cover shrinks) the
///         per-unit price RISES, retaining capacity. The curve is monotone non-decreasing in `u` by
///         construction (all slopes are unsigned), so capacity flight can only raise price.
///
/// @dev Fixed-point convention (documented precisely, asserted by the `PremiumPolicy` test suite):
///      - `u` (utilization) is a WAD fraction (1e18 == 100%): `u = activeNotionalSold * 1e18 / activeCover`.
///      - `base`, `slope1`, `slope2` are ANNUALIZED rate fractions in WAD (e.g. 0.02e18 == 2%/yr).
///      - `kink` is a WAD utilization fraction (e.g. 0.8e18 == 80%).
///      - `rate(u) = base + slope1 * min(u, kink) / 1e18 + slope2 * max(0, u - kink) / 1e18`  (WAD/yr).
///      - `premium = notional * rate(u) / 1e18 * duration / SECONDS_PER_YEAR`  (numeraire units).
///      The premium is the integral of `notional * rate / year` over `duration` seconds at a flat
///      rate; it funds the Synthetix stream the core runs for exactly that `duration`.
contract PremiumScheduler is Ownable2Step {
    /// @notice Seconds in a 365-day year — annualization base for the rate.
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    /// @notice Two-slope kinked utilization-curve parameters plus the MCR/leverage cap.
    /// @dev `set` distinguishes a configured per-mutual override from the global default.
    struct CurveParams {
        uint256 base; // WAD/yr at u == 0
        uint256 slope1; // WAD/yr slope below the kink
        uint256 slope2; // WAD/yr slope above the kink
        uint256 kink; // WAD utilization at which the slope steepens
        uint256 maxLeverageBps; // cap: activeNotionalSold + notional <= maxLeverageBps * activeCover / 1e4
        bool set; // true once a per-mutual override is written
    }

    /// @notice The custody root the priced stream funds.
    ICommitmentManager public immutable manager;

    /// @notice The cover-binding ledger (utilization numerator). Set once by the owner after deploy
    ///         to break the policy<->scheduler construction cycle.
    ILinkedMutualPolicy public policy;

    /// @notice Global default curve, used for any mutual without a per-mutual override.
    CurveParams private _defaultCurve;
    /// @notice mutualId => per-mutual curve override.
    mapping(uint256 => CurveParams) private _mutualCurve;

    event PolicySet(address indexed policy);
    event DefaultCurveSet(uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps);
    event MutualCurveSet(
        uint256 indexed mutualId, uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps
    );

    error ZeroAddress();
    error PolicyUnset();
    error InvalidCurve();
    error LeverageCapExceeded(uint256 wouldBeSold, uint256 cap);
    /// @notice The pricing authority (owner) coincides with the mutual's arbiter or beneficiary — it
    ///         is the funding party and could underprice itself, so binding through it is refused.
    error PricingAuthorityCaptured();

    constructor(address manager_, address owner_) Ownable(owner_) {
        if (manager_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    /// @notice Wire the LinkedMutualPolicy whose `activeNotionalSold` feeds the utilization curve.
    function setPolicy(address policy_) external onlyOwner {
        if (policy_ == address(0)) revert ZeroAddress();
        policy = ILinkedMutualPolicy(policy_);
        emit PolicySet(policy_);
    }

    /// @notice Set the global default curve used for mutuals without an override.
    function setDefaultCurve(uint256 base, uint256 slope1, uint256 slope2, uint256 kink, uint256 maxLeverageBps)
        external
        onlyOwner
    {
        _validateCurve(kink, maxLeverageBps);
        _defaultCurve = CurveParams(base, slope1, slope2, kink, maxLeverageBps, true);
        emit DefaultCurveSet(base, slope1, slope2, kink, maxLeverageBps);
    }

    /// @notice Set a per-mutual curve override (takes precedence over the default for that mutual).
    function setMutualCurve(
        uint256 mutualId,
        uint256 base,
        uint256 slope1,
        uint256 slope2,
        uint256 kink,
        uint256 maxLeverageBps
    ) external onlyOwner {
        _validateCurve(kink, maxLeverageBps);
        _mutualCurve[mutualId] = CurveParams(base, slope1, slope2, kink, maxLeverageBps, true);
        emit MutualCurveSet(mutualId, base, slope1, slope2, kink, maxLeverageBps);
    }

    // ---------------------------------------------------------------------
    // Capture resistance
    // ---------------------------------------------------------------------

    /// @notice Revert if the pricing authority (owner) is the mutual's arbiter or beneficiary. Called
    ///         by LinkedMutualPolicy at bind time so the funding party can never underprice its
    ///         own cover (capture defense, plan OBJ-2 line 2).
    function assertNotCaptured(uint256 mutualId) public view {
        ICommitmentManager.Mutual memory g = manager.getMutual(mutualId);
        address authority = owner();
        if (authority == g.arbiter || authority == g.beneficiary) revert PricingAuthorityCaptured();
    }

    /// @notice True iff the pricing authority is independent of the mutual's arbiter and beneficiary.
    function isPricingAuthorityIndependent(uint256 mutualId) external view returns (bool) {
        ICommitmentManager.Mutual memory g = manager.getMutual(mutualId);
        address authority = owner();
        return authority != g.arbiter && authority != g.beneficiary;
    }

    // ---------------------------------------------------------------------
    // Pricing views
    // ---------------------------------------------------------------------

    /// @notice The curve in force for `mutualId` (per-mutual override if set, else the default).
    function curveFor(uint256 mutualId) public view returns (CurveParams memory) {
        CurveParams memory c = _mutualCurve[mutualId];
        return c.set ? c : _defaultCurve;
    }

    /// @notice Price `notional` of cover for `duration` seconds against the mutual's current
    ///         utilization. Enforces the MCR/leverage cap — reverts `LeverageCapExceeded` when
    ///         `activeNotionalSold + notional > maxLeverageBps * activeCover / 1e4` (the cap the core
    ///         never enforces). The leverage check runs first, so `activeCover == 0` reverts the cap
    ///         before any division by `activeCover`.
    /// @param mutualId the backing Mutual
    /// @param notional cover notional being bound (numeraire units)
    /// @param duration stream length in seconds
    /// @return premiumAmount numeraire premium that funds the stream for `duration`
    function quote(uint256 mutualId, uint256 notional, uint64 duration) public view returns (uint256 premiumAmount) {
        CurveParams memory c = curveFor(mutualId);
        (, uint128 activeCover,,,,,,,) = manager.getMutualPremiumState(mutualId);
        uint256 sold = _activeNotionalSold(mutualId);

        // MCR / leverage cap — bounds notional-sold against live cover (core stays policy-free).
        uint256 cap = Math.mulDiv(c.maxLeverageBps, activeCover, BPS_DENOMINATOR);
        uint256 wouldBeSold = sold + notional;
        if (wouldBeSold > cap) revert LeverageCapExceeded(wouldBeSold, cap);

        // Reaching here implies activeCover > 0 (else cap == 0 and any notional > 0 reverted above).
        uint256 u = Math.mulDiv(sold, WAD, activeCover);
        premiumAmount = _premium(c, u, notional, duration);
    }

    /// @notice Price the STANDBY reservation fee on offered-but-unallocated cover
    ///         (`activeCover - activeNotionalSold`) for `duration`. Funds the EXISTING `Pi` stream —
    ///         no new core index. Priced at the same curve rate as live cover; returns 0 when there
    ///         is no unallocated cover (caller should treat 0 as "nothing to reserve").
    /// @param mutualId the backing Mutual
    /// @param duration stream length in seconds
    /// @return premiumAmount numeraire reservation fee (0 if no standby capacity)
    function quoteStandby(uint256 mutualId, uint64 duration) public view returns (uint256 premiumAmount) {
        (, uint128 activeCover,,,,,,,) = manager.getMutualPremiumState(mutualId);
        uint256 sold = _activeNotionalSold(mutualId);
        if (activeCover == 0 || sold >= activeCover) return 0;

        uint256 standby = uint256(activeCover) - sold;
        CurveParams memory c = curveFor(mutualId);
        uint256 u = Math.mulDiv(sold, WAD, activeCover);
        premiumAmount = _premium(c, u, standby, duration);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev `rate(u) = base + slope1*min(u,kink)/1e18 + slope2*max(0,u-kink)/1e18` (WAD/yr).
    function _rate(CurveParams memory c, uint256 u) internal pure returns (uint256) {
        uint256 below = u < c.kink ? u : c.kink;
        uint256 above = u > c.kink ? u - c.kink : 0;
        return c.base + Math.mulDiv(c.slope1, below, WAD) + Math.mulDiv(c.slope2, above, WAD);
    }

    /// @dev `premium = notional * rate(u)/1e18 * duration / SECONDS_PER_YEAR`.
    function _premium(CurveParams memory c, uint256 u, uint256 notional, uint64 duration)
        internal
        pure
        returns (uint256)
    {
        uint256 rate = _rate(c, u);
        uint256 perYear = Math.mulDiv(notional, rate, WAD);
        return Math.mulDiv(perYear, duration, SECONDS_PER_YEAR);
    }

    /// @dev Read the utilization numerator, treating an unset policy as zero notional sold.
    function _activeNotionalSold(uint256 mutualId) internal view returns (uint256) {
        ILinkedMutualPolicy p = policy;
        if (address(p) == address(0)) revert PolicyUnset();
        return p.getActiveNotionalSold(mutualId);
    }

    /// @dev Reject nonsensical curve params. Slopes are unsigned so monotonicity is automatic; we
    ///      only bound `kink <= WAD` (utilization is a fraction) and require a nonzero leverage cap.
    function _validateCurve(uint256 kink, uint256 maxLeverageBps) internal pure {
        if (kink > WAD || maxLeverageBps == 0) revert InvalidCurve();
    }
}
