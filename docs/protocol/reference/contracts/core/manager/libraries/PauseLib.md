---
title: PauseLib
status: generated
source: src/core/manager/libraries/PauseLib.sol
generated: true
---
# PauseLib
**Title:**
PauseLib

Cumulative pause budget + window-classified clock-stop arithmetic (ERC §A.6
erratum). The circuit breaker (`forfeiturePaused`) hard-blocks `executeForfeit` /
`executeMutualLoss` for as long as it is set, but the time it can CREDIT against the
protocol's constraining windows is a cumulative per-manager budget: once
`cumulativePaused` reaches `maxPauseDuration`, further pause time stops every clock
adjustment — an adversarial pauser cannot buy unbounded delay by re-pausing, and an
unattended pause self-neutralizes.

Window classification (the erratum's core distinction):
- CONSTRAINING windows (forfeit/mutual-loss challenge windows, unbonding period,
deallocation window, re-init rate limit, commitment expiry) elapse in EFFECTIVE time —
wall-clock minus the budget-clamped pause overlap witnessed by the window's own
`cumulativePausedAtStart` snapshot. Pausing cannot shrink contest time or let a
committer wait out an exit delay while loss execution is inoperable.
- LIVENESS backstops (the stale-TTLs, agreement proposal expiries, premium-stream
clocks) run on WALL CLOCK and are never stopped — freezing the stale-TTLs IS the pin
this erratum exists to kill.
A scalar accumulator cannot compute a window's pause overlap, so each timed record
snapshots `creditablePaused` at its own start; the overlap is the (monotone) difference.
All new storage defaults to zero, and a zero `maxPauseDuration` clamps every credit to
zero — a manager with no budget (including any pre-erratum deployment upgraded in place)
behaves byte-for-byte as pure wall clock.


## Functions
### creditablePaused

Total pause time creditable against any window, clamped to the lifetime budget.

Monotone non-decreasing: `cumulativePaused` only grows (on unpause), the in-flight
episode (`pausedAt != 0`) accrues with wall time, and the clamp cap is immutable.
Snapshots taken from this function therefore never exceed later reads — the
per-window overlap `creditablePaused() - snapshotAtStart` is always in
`[0, wall-clock elapsed since the snapshot]`.


```solidity
function creditablePaused(CommitmentManagerStorage.Layout storage s) internal view returns (uint64);
```

### pauseCreditSince

Budget-clamped pause time credited since a record's `creditablePaused` snapshot —
the single subtraction every clock-stop site anchors on (window maturities,
effective elapsed time, and the stale-threshold window-end anchor all add or
subtract exactly this quantity).


```solidity
function pauseCreditSince(CommitmentManagerStorage.Layout storage s, uint64 snapshotAtStart)
    internal
    view
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`s`|`CommitmentManagerStorage.Layout`||
|`snapshotAtStart`|`uint64`|`creditablePaused()` captured when the record was created. A record started mid-pause snapshots the episode's already-elapsed portion, so only pause time after the start is ever credited (overlap correctness). Monotonicity of `creditablePaused` makes the difference non-negative for any genuine snapshot.|


### effectiveElapsed

Wall-clock time since `since`, minus the budget-clamped pause time that overlapped
the span — the EFFECTIVE elapsed time a constraining window has actually run.


```solidity
function effectiveElapsed(CommitmentManagerStorage.Layout storage s, uint64 since, uint64 snapshotAtStart)
    internal
    view
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`s`|`CommitmentManagerStorage.Layout`||
|`since`|`uint64`|Window start (wall clock, non-zero for any live record).|
|`snapshotAtStart`|`uint64`|`creditablePaused()` captured when the record was created.|


### staleAt

The wall-clock instant a two-phase proposal goes stale (ERC §A.6b anti-pin):
`initiatedAt + window_effective + ttl`. The window-end anchor moves out by the
budget-capped pause credit since initiation, but the TTL itself is NEVER
clock-stopped — a pause can neither stale-cancel an honest proposal whose contest
window never effectively ran, nor pin parties behind an abandoned proposal beyond
the budget-bounded horizon. Shared by the forfeit and mutual-loss backstops so the
two liveness formulas cannot drift apart.


```solidity
function staleAt(
    CommitmentManagerStorage.Layout storage s,
    uint64 initiatedAt,
    uint64 window,
    uint64 snapshotAtStart,
    uint64 ttl
) internal view returns (uint256);
```
