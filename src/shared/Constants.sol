// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// Canonical denominator for generic basis-point arithmetic.
uint256 constant BPS_DENOMINATOR = 10_000;

// Canonical unit for generic 18-decimal fixed-point arithmetic.
uint256 constant WAD = 1e18;

// ---- Commitment manager caps (ERC-COMMITMENTS §0.3 and the agreements extension) ----

// MUST-level cap on strategies bound to one commitment (or one agreement leg).
uint256 constant MAX_STRATEGIES = 8;

// Cap on a commitment's or an agreement proposal's `metadataURI`, in bytes.
uint256 constant MAX_METADATA_URI_LENGTH = 512;

// Longest `proposalDuration` an agreement proposal may carry.
uint64 constant MAX_PROPOSAL_DURATION = 30 days;

// Stale forfeit proposals can be force-cancelled by anyone after
// `initiatedAt + challengeWindow + FORFEIT_PROPOSAL_TTL` (ERC §C.4).
uint64 constant FORFEIT_PROPOSAL_TTL = 14 days;

// SHOULD-level floor on the per-hook gas cap (§D.6). `initialize` sets the cap to it; the admin may
// raise it, never lower it below this.
uint64 constant HOOK_GAS_CAP_FLOOR = 500_000;

// Gas reserved for post-hook bookkeeping when sizing the min-gas guard (§D.6 rule 3).
uint64 constant HOOK_GAS_RESERVE = 50_000;
