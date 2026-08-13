import { index, onchainTable, primaryKey } from 'ponder'

/**
 * Commitments indexed by `id` (the numeric commitmentId). Each row reflects
 * the current canonical state — status transitions via UPDATE on the relevant
 * lifecycle event.
 */
export const commitment = onchainTable(
  'commitment',
  (t) => ({
    /** Per-manager commitment id as emitted on chain. NOT unique across managers
     *  — disambiguate via the (manager, id) composite primary key below. */
    id: t.bigint().notNull(),
    // The party that committed the backing (Commitment.committer on chain). v2
    // term for what v1 called the "depositor".
    committer: t.hex().notNull(),
    arbiter: t.hex().notNull(),
    counterparty: t.hex().notNull(),
    // Backing token (any ERC-20/4626 the manager custodies) and the read-only
    // pricing adapter bound at creation. `amount` is raw token units.
    token: t.hex().notNull(),
    adapter: t.hex().notNull(),
    amount: t.bigint().notNull(),
    maxPenaltyBps: t.integer().notNull(),
    status: t.text().notNull(), // 'active' | 'unbonding' | 'forfeitPending' | 'forfeited' | 'released' | 'expired'
    // Forfeit lifecycle
    forfeitPenaltyBps: t.integer(),
    // Wall-clock start of the currently active/latest proposal. This is kept
    // separately from the nominal end so commitment-scoped APIs can describe
    // each repeated attempt without reconstructing it from vault activity.
    forfeitInitiatedAt: t.bigint(),
    // Nominal event-time end used for index ordering only. Live executability
    // additionally applies manager lifetime pause credit.
    forfeitChallengeEnd: t.bigint(),
    forfeitSharesExecuted: t.bigint(),
    forfeitCounterparty: t.hex(),
    // Per-commitment unbond lifecycle (depositor self-release path).
    //   unbondInitiatedAt — block.timestamp of CommitmentUnbondRequested. Null
    //                       once cancelled or finalized (CommitmentReleased).
    //   unbondMaturesAt   — initiatedAt + vault.unbondingPeriod (emitted in event).
    // While `status === 'unbonding'`, depositor has called requestUnbond() but
    // not finalizeUnbond(). Forfeit precedence: an active forfeit flips status to
    // 'forfeitPending' even if unbond is in flight; on forfeit cancel we restore
    // 'unbonding' iff unbondInitiatedAt is still set.
    unbondInitiatedAt: t.bigint(),
    unbondMaturesAt: t.bigint(),
    // Absolute expiry (unix seconds) as emitted in CommitmentCreated's `expiresAt`
    // arg. 0n means "no expiry". Persisted straight from the event — no chain read
    // workaround needed since the event now carries it.
    expiresAt: t.bigint(),
    // Distribution-strategy yield is no longer summarized on the commitment row.
    // Per-(commitment, strategy) claimable is read live via
    // `manager.pending(id, strategy, claimData)`; the payout history lives in the
    // `distribution` table (DistributionPaid events) and the bound strategies in
    // `strategyBinding`. Forfeit proceeds land in the recipient's manager free
    // balance (read `manager.freeBalance(token, recipient)`).
    // Block refs
    createdBlock: t.bigint().notNull(),
    // Unix-seconds block timestamp of CommitmentCreated. Nullable for migration
    // compat (existing rows on a live indexer stay NULL until backfill); the
    // frontend activity feed reads this to render real creation dates instead of
    // epoch-zero (a block NUMBER can't be turned into a date client-side).
    createdAt: t.bigint(),
    createdTx: t.hex().notNull(),
    updatedBlock: t.bigint().notNull(),
    // Metadata — populated by the metadata fetcher in Plan 03 event handlers.
    // metadataURI: raw URI as emitted on chain (null before first event carrying metadata; "" when producer passed empty sentinel)
    // metadataHash: bytes32 content hash as emitted on chain (null before first event; 0x000...000 when no attestation)
    // metadataStatus: one of 'empty' | 'ok' | 'mismatch' | 'unreachable' (null until first fetch attempt)
    // metadataContent: parsed JSON content (null when not yet fetched or JSON.parse failed)
    // metadataContentRaw: raw text bytes (null when not yet fetched; populated when bytes fetched but JSON.parse fails)
    metadataURI: t.text(),
    metadataHash: t.hex(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'mismatch' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
    // v2.5 Part B: third-party contributions opt-in. Flips true on the first
    // ContributionsEnabled event for this commitment (auto-fired on the
    // depositor's first self-contribution). Defaults false.
    acceptsContributions: t.boolean().notNull().default(false),
    // Denormalized vault address. There is no `manager.vault()` in v2 — instead
    // this mirrors `token` when the backing token IS a CommitmentsVault share
    // (resolved against the indexed `vault` table at handler time), and is NULL
    // for plain-ERC-20 backing. Lets the vault-scoped endpoints keep filtering
    // by a single denormalized column without a join.
    vault: t.hex(),
    // Source CommitmentManager — the address that emitted CommitmentCreated.
    // Part of the composite primary key so two managers' independent id
    // spaces (each starts at 0) don't collide on insert.
    manager: t.hex().notNull(),
    // Operator beneficiary, populated by OperatorRegistry handlers:
    //   - OperatorRegistered → set to the operator (this commitment is their self-stake)
    //   - DelegationCreated  → set to the operator (this commitment is delegated to them)
    // Null for commitments that aren't routed through the OperatorRegistry
    // (counterparty != operatorRegistry — bilateral commitments, agent vault
    // beneficiary, etc.). Drives the per-service stake-summary endpoint.
    operatorBeneficiary: t.hex(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.manager, t.id] }),
    committerIdx: index().on(t.committer),
    counterpartyIdx: index().on(t.counterparty),
    arbiterIdx: index().on(t.arbiter),
    tokenIdx: index().on(t.token),
    statusIdx: index().on(t.status),
    metadataStatusIdx: index().on(t.metadataStatus),
    vaultIdx: index().on(t.vault),
    managerIdx: index().on(t.manager),
    operatorBeneficiaryIdx: index().on(t.operatorBeneficiary),
  })
)

/**
 * Per-event forfeit lifecycle log. Each row captures one transition emitted by
 * the manager (initiated, executed, cancelled, cancelled-stale) with
 * blockTimestamp + txHash so the frontend can render a precise timeline.
 *
 * The current commitment row continues to hold the *latest* forfeit state
 * (forfeitPenaltyBps, forfeitChallengeEnd, forfeitSharesExecuted, forfeitCounterparty)
 * for fast dossier lookups; this table is the audit trail.
 *
 * `vault` is denormalized from the parent commitment so the forfeit-ledger
 * endpoint can filter without a join.
 */
export const forfeitEvent = onchainTable(
  'forfeit_event',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${commitmentId}-${blockNumber}-${logIndex}`
    commitmentId: t.bigint().notNull(),
    kind: t.text().notNull(), // 'initiated' | 'executed' | 'cancelled' | 'cancelledStale'
    // Lifecycle-specific fields; null on transitions that don't carry them.
    penaltyBps: t.integer(),
    challengeWindow: t.bigint(), // seconds, copied across an attempt when known
    challengeEnd: t.bigint(), // nominal event-time end, before pause credit
    // Proposal start copied onto every transition in an attempt. Unlike the
    // event timestamp, this remains the initiation anchor on execute/cancel.
    proposalInitiatedAt: t.bigint().notNull(),
    sharesToForfeit: t.bigint(), // executed only — raw backing-token units forfeited (ForfeitExecuted.unitsForfeited)
    counterparty: t.hex(), // parent counterparty when known
    // Denormalized parent fields — keep the forfeit-ledger query single-table.
    committer: t.hex().notNull(),
    arbiter: t.hex().notNull(),
    vault: t.hex(),
    // Manager that emitted the forfeit event — mirrors the parent commitment's
    // `manager` column. Nullable for migration compatibility.
    manager: t.hex(),
    blockNumber: t.bigint().notNull(),
    logIndex: t.integer().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    commitmentIdx: index().on(t.commitmentId),
    commitmentManagerIdx: index().on(t.manager, t.commitmentId),
    blockIdx: index().on(t.blockNumber),
    vaultIdx: index().on(t.vault),
    managerIdx: index().on(t.manager),
    kindIdx: index().on(t.kind),
  }),
)

/** Normalized current state for mechanism-owned claims, appeals, and attestations. */
export const arbitrationCase = onchainTable(
  'arbitration_case',
  (t) => ({
    id: t.text().primaryKey(), // `${arbiter}-${caseId}`
    mechanism: t.text().notNull(),
    arbiter: t.hex().notNull(),
    caseId: t.bigint().notNull(),
    commitmentId: t.bigint(),
    manager: t.hex(),
    phase: t.text().notNull(),
    terminalOutcome: t.text(),
    nextDeadline: t.bigint(),
    openedAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    arbiterIdx: index().on(t.arbiter),
    commitmentIdx: index().on(t.manager, t.commitmentId),
    mechanismIdx: index().on(t.mechanism),
    phaseIdx: index().on(t.phase),
  }),
)

/** Event-level mechanism history with an explicit arbiter-mechanism source. */
export const arbitrationMechanismEvent = onchainTable(
  'arbitration_mechanism_event',
  (t) => ({
    id: t.text().primaryKey(),
    mechanism: t.text().notNull(),
    arbiter: t.hex().notNull(),
    caseId: t.bigint().notNull(),
    commitmentId: t.bigint(),
    manager: t.hex(),
    kind: t.text().notNull(),
    actor: t.hex(),
    phase: t.text().notNull(),
    deadline: t.bigint(),
    outcome: t.text(),
    blockNumber: t.bigint().notNull(),
    logIndex: t.integer().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    arbiterIdx: index().on(t.arbiter),
    caseIdx: index().on(t.arbiter, t.caseId),
    commitmentIdx: index().on(t.manager, t.commitmentId),
    blockIdx: index().on(t.blockNumber),
  }),
)

/**
 * Agreement — two linked commitments. `commitmentIdA < commitmentIdB` is not
 * enforced; order is as emitted.
 */
export const agreement = onchainTable(
  'agreement',
  (t) => ({
    /** Per-manager agreement id. Composite PK `(manager, id)` below
     *  prevents collisions across managers. */
    id: t.bigint().notNull(),
    manager: t.hex().notNull(),
    commitmentIdA: t.bigint().notNull(),
    commitmentIdB: t.bigint().notNull(),
    status: t.text().notNull(), // 'active' | 'forfeited' | 'released' | 'partialForfeitA' | 'partialForfeitB'
    acceptedBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
    // Metadata — mirrored from agreementProposal on acceptAgreement (no re-fetch; same bytes).
    // metadataURI: raw URI as emitted on chain (null before first event carrying metadata; "" when producer passed empty sentinel)
    // metadataHash: bytes32 content hash as emitted on chain (null before first event; 0x000...000 when no attestation)
    // metadataStatus: one of 'empty' | 'ok' | 'mismatch' | 'unreachable' (null until first fetch attempt)
    // metadataContent: parsed JSON content (null when not yet fetched or JSON.parse failed)
    // metadataContentRaw: raw text bytes (null when not yet fetched; populated when bytes fetched but JSON.parse fails)
    metadataURI: t.text(),
    metadataHash: t.hex(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'mismatch' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
    // v2.5 bilateral-settlement caps + cumulatives. Default 0 means the
    // agreement opted out (settle disabled — settleAgreement reverts
    // SettlementCapZero). Cap fields are read from getAgreementSettlement
    // on accept since the AgreementProposed event doesn't carry them
    // (intentional — keeps event ABI stable across the v2.5 bump).
    maxFlowProposerToAcceptor: t.bigint().notNull().default(0n),
    maxFlowAcceptorToProposer: t.bigint().notNull().default(0n),
    cumulativeProposerToAcceptor: t.bigint().notNull().default(0n),
    cumulativeAcceptorToProposer: t.bigint().notNull().default(0n),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.manager, t.id] }),
    aIdx: index().on(t.commitmentIdA),
    bIdx: index().on(t.commitmentIdB),
    managerIdx: index().on(t.manager),
    statusIdx: index().on(t.status),
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

/**
 * v2.5 — every AgreementSettled event produces one row. Lets the frontend
 * render a settlement history per agreement without scanning logs.
 */
export const agreementSettlement = onchainTable(
  'agreement_settlement',
  (t) => ({
    id: t.text().primaryKey(), // `${agreementId}-${blockNumber}-${logIndex}`
    agreementId: t.bigint().notNull(),
    fromProposer: t.boolean().notNull(),
    shares: t.bigint().notNull(),
    cumulativeAfterPToA: t.bigint().notNull(),
    cumulativeAfterAToP: t.bigint().notNull(),
    evidenceHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    // Denormalized vault address — derived at handler time from the
    // parent commitments (which in turn store it). Both sides of an
    // agreement always share the same vault today (manager is single-
    // vault). Nullable for migration compat.
    vault: t.hex(),
    /** Manager that emitted AgreementSettled — lets queries disambiguate
     *  (manager, agreementId) pairs without joining. Nullable for migration. */
    manager: t.hex(),
  }),
  (t) => ({
    agreementIdx: index().on(t.agreementId),
    blockIdx: index().on(t.blockNumber),
    vaultIdx: index().on(t.vault),
    managerIdx: index().on(t.manager),
  })
)

/**
 * v2.5 Part B — every EncumbranceContributed event produces one row.
 */
export const contribution = onchainTable(
  'contribution',
  (t) => ({
    id: t.text().primaryKey(), // `${commitmentId}-${blockNumber}-${logIndex}`
    commitmentId: t.bigint().notNull(),
    contributor: t.hex().notNull(),
    receiver: t.hex().notNull(),
    shares: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    // Denormalized vault address — derived at handler time from the parent
    // commitment row. Nullable for migration compat (existing rows may be
    // NULL until backfill).
    vault: t.hex(),
    /** Manager that emitted EncumbranceContributed — disambiguates the
     *  (manager, commitmentId) lookup. Nullable for migration. */
    manager: t.hex(),
  }),
  (t) => ({
    commitmentIdx: index().on(t.commitmentId),
    contributorIdx: index().on(t.contributor),
    vaultIdx: index().on(t.vault),
    managerIdx: index().on(t.manager),
  })
)

/**
 * v2.5 — every Vault Donation event produces one row. Cross-vault underwriting
 * uses this to surface "loss-recovery donations" landing on the insured vault.
 */
export const donation = onchainTable(
  'donation',
  (t) => ({
    id: t.text().primaryKey(), // `${vault}-${blockNumber}-${logIndex}`
    vault: t.hex().notNull(),
    donor: t.hex().notNull(),
    assets: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    vaultIdx: index().on(t.vault),
    donorIdx: index().on(t.donor),
  })
)

export const agreementProposal = onchainTable(
  'agreement_proposal',
  (t) => ({
    /** Per-manager proposal id. Composite PK `(manager, id)` below
     *  prevents collisions across managers. */
    id: t.bigint().notNull(),
    manager: t.hex().notNull(),
    proposer: t.hex().notNull(),
    acceptor: t.hex().notNull(),
    status: t.text().notNull(), // 'open' | 'accepted' | 'cancelled' | 'expired'
    proposedBlock: t.bigint().notNull(),
    resolvedBlock: t.bigint(),
    // agreementId once accepted (from AgreementAccepted's indexed proposalId).
    agreementId: t.bigint(),
    // ── Per-leg economic terms (from the AgreementProposedTerms companion event) ──
    // The manager no longer exposes a getAgreementProposal view; these columns are
    // the canonical indexed replacement. Nullable: populated by the terms handler,
    // which fires in the same tx right after AgreementProposed inserts the row.
    arbiter: t.hex(),
    proposerToken: t.hex(),
    proposerAdapter: t.hex(),
    proposerAmount: t.bigint(),
    proposerMaxPenaltyBps: t.integer(),
    acceptorToken: t.hex(),
    acceptorAdapter: t.hex(),
    acceptorAmount: t.bigint(),
    acceptorMaxPenaltyBps: t.integer(),
    challengeWindow: t.bigint(),
    expiresAt: t.bigint(),
    maxFlowProposerToAcceptor: t.bigint(),
    maxFlowAcceptorToProposer: t.bigint(),
    // Metadata — populated by the metadata fetcher in Plan 03 event handlers.
    // metadataURI: raw URI as emitted on chain (null before first event carrying metadata; "" when producer passed empty sentinel)
    // metadataHash: bytes32 content hash as emitted on chain (null before first event; 0x000...000 when no attestation)
    // metadataStatus: one of 'empty' | 'ok' | 'mismatch' | 'unreachable' (null until first fetch attempt)
    // metadataContent: parsed JSON content (null when not yet fetched or JSON.parse failed)
    // metadataContentRaw: raw text bytes (null when not yet fetched; populated when bytes fetched but JSON.parse fails)
    metadataURI: t.text(),
    metadataHash: t.hex(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'mismatch' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.manager, t.id] }),
    proposerIdx: index().on(t.proposer),
    acceptorIdx: index().on(t.acceptor),
    managerIdx: index().on(t.manager),
    statusIdx: index().on(t.status),
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

export const operator = onchainTable(
  'operator',
  (t) => ({
    address: t.hex().primaryKey(),
    // Snapshot at registration time per StakeRegistry — may drift after delegations move.
    // For a current authoritative value query the on-chain TokenWeighting voting power.
    weight: t.bigint().notNull().default(0n),
    signingKey: t.hex(),
    status: t.text().notNull(), // 'registered' | 'deregistered'
    registeredBlock: t.bigint().notNull(),
    // Unix timestamp (seconds) of the registration block — distinct from
    // registeredBlock (block number). The frontend renders this directly as a
    // date; keep both since registeredBlock is still used as a chain cursor.
    registeredAt: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
    // OperatorRegistry dossier mirror (Indexer Improvements #1).
    // selfStake: the operator's own committed stake amount (set on OperatorRegistered.stake;
    //   cleared to 0n when the self-stake commitment is later released or forfeited).
    // selfStakeCommitmentId: the commitmentId backing selfStake — used by Delegation*/Forfeited
    //   handlers to detect whether the affected delegation IS the operator's self-stake.
    // totalDelegatedStake: self + delegated stake mirrored from OperatorRegistry.getOperator().totalDelegatedStake.
    //   Maintained by OperatorRegistered (init), DelegationCreated (+= amount), DelegationReleased (-= amount),
    //   DelegationForfeited (-= fullAmount looked up from the commitment table). Floor-clamped at 0n.
    // activeDelegationCount: count of active delegations including self-stake (1 on registration).
    // services: derived from metadataContent.services (string[]) on each metadata fetch — used for tag indexing.
    selfStake: t.bigint().notNull().default(0n),
    selfStakeCommitmentId: t.bigint(),
    totalDelegatedStake: t.bigint().notNull().default(0n),
    activeDelegationCount: t.integer().notNull().default(0),
    services: t.text().array(),
    // Metadata — current value only; updated on every OperatorMetadataUpdated event.
    // Historical metadata accessible via Ponder's event log (no dedicated history table for v1).
    // metadataURI: raw URI as emitted on chain (null before first OperatorMetadataUpdated event; "" when cleared)
    // metadataHash: bytes32 content hash as emitted on chain (null before first event; 0x000...000 when no attestation)
    // metadataStatus: one of 'empty' | 'ok' | 'mismatch' | 'unreachable' (null until first fetch attempt)
    // metadataContent: parsed JSON content (null when not yet fetched or JSON.parse failed)
    // metadataContentRaw: raw text bytes (null when not yet fetched; populated when bytes fetched but JSON.parse fails)
    metadataURI: t.text(),
    metadataHash: t.hex(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'mismatch' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
  }),
  (t) => ({
    statusIdx: index().on(t.status),
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

/**
 * ERC-8004 agent identities (issue #33) — one row per registered agent NFT.
 *
 * The registry is ERC-721 based: `agentId` is the tokenId (STARTS AT ZERO —
 * never a "no agent" sentinel), the token owner is the agent's controlling
 * account, and `tokenURI` is the agent's registration-file URI (`agentURI`).
 * Composite PK `(registry, agentId)` mirrors the commitment table's
 * (manager, id) convention — single registry per chain today, forward-compat
 * with multiple.
 *
 * `owner` is the badge-lookup axis: "is this address a registered agent's
 * owner?" — the frontend bulk-queries `agents(where: { owner_in: [...] })`
 * over Ponder's auto-generated GraphQL.
 *
 * `agentWallet` mirrors the reserved on-chain metadata key `"agentWallet"`
 * (auto-set to the registrant at register time, auto-CLEARED on every ERC-721
 * transfer). NULL when unset/cleared.
 *
 * Metadata columns follow the operator conventions. The registry stores no
 * on-chain content hash for the agentURI, so `fetchMetadata` is called with
 * the zero hash and `metadataStatus` is one of 'empty' | 'ok' | 'unreachable'
 * — never 'mismatch'.
 */
export const agent = onchainTable(
  'agent',
  (t) => ({
    agentId: t.bigint().notNull(),
    registry: t.hex().notNull(),
    owner: t.hex().notNull(),
    agentWallet: t.hex(),
    agentURI: t.text().notNull(), // may be "" (register() without a URI)
    metadataStatus: t.text(), // 'empty' | 'ok' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
    registeredBlock: t.bigint().notNull(),
    registeredAt: t.bigint().notNull(), // unix seconds of the Registered block
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.registry, t.agentId] }),
    ownerIdx: index().on(t.owner),
    agentWalletIdx: index().on(t.agentWallet),
    registryIdx: index().on(t.registry),
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

/**
 * Registry membership — one row per (operator, registry) pair so multi-registry
 * deployments (e.g. Simulate's USDC + WETH OperatorRegistry pair) can faithfully
 * report which registries an operator participates in.
 *
 * The `operator` table above continues to hold a single mirrored row per
 * operator address (latest registry to touch it wins for the metadata mirror);
 * this table is the canonical source for "is this operator registered with
 * registry X?" queries.
 */
export const registryMembership = onchainTable(
  'registry_membership',
  (t) => ({
    id: t.text().primaryKey(), // `${registry}-${operator}`
    operator: t.hex().notNull(),
    registry: t.hex().notNull(),
    selfStakeCommitmentId: t.bigint(),
    selfStake: t.bigint().notNull().default(0n),
    status: t.text().notNull(), // 'registered' | 'deregistered'
    registeredBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    operatorIdx: index().on(t.operator),
    registryIdx: index().on(t.registry),
    statusIdx: index().on(t.status),
  }),
)

/**
 * Mesh nodes discovered via MeshFactory's NodeDeployed event.
 *
 * `governor` is populated lazily — when a Governor's ProposalExecuted handler
 * sees a `weight_update` action targeting this mesh node, the executing
 * Governor address is stamped here so the frontend can show
 * "controlled by DAO X" on TokenWeighting nodes.
 */
export const meshNode = onchainTable(
  'mesh_node',
  (t) => ({
    address: t.hex().primaryKey(),
    impl: t.hex().notNull(),
    nodeType: t.text().notNull(), // 'fan_in' | 'fan_out' | 'token_weighting'
    deployedBlock: t.bigint().notNull(),
    governor: t.hex(),
  }),
  (t) => ({
    typeIdx: index().on(t.nodeType),
    governorIdx: index().on(t.governor),
  })
)

/**
 * Stake flow edges — every Staked / StakeReleased event produces a row.
 * Sum over this table (positive for Staked, negative for StakeReleased) gives
 * the current outstanding stake per (from, to, denom).
 */
export const stakeFlow = onchainTable(
  'stake_flow',
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    from: t.hex().notNull(),
    toNode: t.hex().notNull(),
    denom: t.hex().notNull(),
    amount: t.bigint().notNull(), // signed: +stake, -release
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (t) => ({
    fromIdx: index().on(t.from),
    toIdx: index().on(t.toNode),
    denomIdx: index().on(t.denom),
    blockIdx: index().on(t.blockNumber),
  })
)

/**
 * Current voting power per operator in OperatorServiceRegistry.
 */
export const operatorWeight = onchainTable(
  'operator_weight',
  (t) => ({
    operator: t.hex().primaryKey(),
    weight: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  })
)

/**
 * Simple running aggregates per address for the graph node dossier.
 */
export const accountStats = onchainTable(
  'account_stats',
  (t) => ({
    address: t.hex().primaryKey(),
    commitmentsOut: t.integer().notNull().default(0), // as depositor
    commitmentsIn: t.integer().notNull().default(0), // as counterparty
    convictionOut: t.bigint().notNull().default(0n), // sum(amount * maxPenaltyBps / 10000) as depositor
    convictionIn: t.bigint().notNull().default(0n), // sum(amount * maxPenaltyBps / 10000) as counterparty
    activeCount: t.integer().notNull().default(0),
    forfeitedCount: t.integer().notNull().default(0),
    releasedCount: t.integer().notNull().default(0),
  })
)

/**
 * Distribution-strategy bindings — one row per CommitmentBoundToStrategy event.
 *
 * Lets the frontend resolve "which strategies is commitment N bound to" (and the
 * reverse "which commitments feed strategy S") without a chain read, and supplies
 * the `strategyParams` needed to construct the `claimData` argument for a live
 * `manager.pending(id, strategy, claimData)` read.
 */
export const strategyBinding = onchainTable(
  'strategy_binding',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${commitmentId}-${strategy}` (lowercased)
    manager: t.hex().notNull(),
    commitmentId: t.bigint().notNull(),
    strategy: t.hex().notNull(),
    strategyParams: t.hex().notNull(), // raw abi-encoded binding params
    boundBlock: t.bigint().notNull(),
  }),
  (t) => ({
    commitmentIdx: index().on(t.manager, t.commitmentId),
    strategyIdx: index().on(t.strategy),
  })
)

/**
 * Distribution payouts — one row per DistributionPaid event (ERC §D.7), the
 * uniform payout feed emitted on every recipient-crediting movement regardless
 * of execution path. `commitmentId = 0` is the non-attribution sentinel for
 * cross-commitment payouts (e.g. the rewards coordinator); `context` is a
 * strategy-defined bytes32 tag.
 *
 * Drives the per-account claimable/earned history that the v1 yield columns used
 * to summarize on the commitment row.
 */
export const distribution = onchainTable(
  'distribution',
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    strategy: t.hex().notNull(),
    recipient: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    commitmentId: t.bigint().notNull(), // 0 = non-attribution sentinel
    context: t.hex().notNull(),
    manager: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    recipientIdx: index().on(t.recipient),
    strategyIdx: index().on(t.strategy),
    commitmentIdx: index().on(t.manager, t.commitmentId),
    tokenIdx: index().on(t.token),
    blockIdx: index().on(t.blockNumber),
  })
)

/**
 * Strategy hook failures — one row per StrategyHookFailed event (ERC §D.6). A
 * guarded lifecycle hook reverted; the strategy's in-flight accrual is parked in
 * escrow (never forfeited) and can be re-driven by the permissionless
 * `sweepFailedHook`. The frontend surfaces these as a "parked accrual — sweep
 * available" call-to-action. There is no on-chain "resolved" event, so rows are
 * append-only; treat the most recent failure per (commitment, strategy) as the
 * live signal and let the sweep CTA no-op if already cleared.
 */
export const strategyHookFailure = onchainTable(
  'strategy_hook_failure',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${commitmentId}-${strategy}-${blockNumber}-${logIndex}`
    manager: t.hex().notNull(),
    commitmentId: t.bigint().notNull(),
    strategy: t.hex().notNull(),
    hookSelector: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    commitmentIdx: index().on(t.manager, t.commitmentId),
    strategyIdx: index().on(t.strategy),
  })
)

/**
 * Per-strategy credit-ledger flows — one row per self-custody strategy
 * `Prefunded` (kind='prefund') or `CreditRefunded` (kind='refund') event.
 *
 * Self-custody strategies (ERC §D.7, e.g. FlatFeeAtCreate) hold a
 * per-(committer, token) credit balance the committer prefunds and can reclaim;
 * `creditOf(committer, token)` is the live on-chain value and these rows are the
 * queryable history behind it. `funder` is the payer on a prefund and the
 * committer reclaiming on a refund; `committer` is the credited account in both.
 */
export const strategyCreditFlow = onchainTable(
  'strategy_credit_flow',
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    strategy: t.hex().notNull(),
    manager: t.hex().notNull(),
    kind: t.text().notNull(), // 'prefund' | 'refund'
    funder: t.hex().notNull(),
    committer: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    strategyIdx: index().on(t.strategy),
    committerIdx: index().on(t.committer, t.token),
    blockIdx: index().on(t.blockNumber),
  })
)

/**
 * FanIn provider registrations — one row per `ProviderRegistered` event.
 *
 * Used by the Mesh Explorer to answer "what's the forfeiture budget per denom
 * on this FanIn?" without an N+1 chain read fan-out. The mesh contract stores
 * these per-(node, denomOut) so the natural primary key is composite.
 */
export const fanInProvider = onchainTable(
  'fan_in_provider',
  (t) => ({
    id: t.text().primaryKey(), // `${fanInAddress}-${denomOut}`
    fanInNode: t.hex().notNull(),
    provider: t.hex().notNull(),
    denomIn: t.hex().notNull(),
    denomOut: t.hex().notNull(),
    maxPenaltyBps: t.integer().notNull(),
    unbondingPeriod: t.bigint().notNull(),
    registeredBlock: t.bigint().notNull(),
  }),
  (t) => ({
    nodeIdx: index().on(t.fanInNode),
    providerIdx: index().on(t.provider),
  })
)

/**
 * FanOut outflows — consumer + portion + max-penalty config per
 * (FanOut, staker, denom, consumer). Populated by chain-reading
 * `getOutflows(staker, denom)` on every `OutflowsSet` event since the
 * event itself only emits the count, not the consumers.
 *
 * Used by the Mesh Explorer's topology graph to draw FanOut → consumer
 * edges with portionBps + maxPenaltyBps labels.
 */
export const fanOutOutflow = onchainTable(
  'fan_out_outflow',
  (t) => ({
    id: t.text().primaryKey(), // `${fanOutAddress}-${staker}-${denom}-${consumer}`
    fanOutNode: t.hex().notNull(),
    staker: t.hex().notNull(),
    denom: t.hex().notNull(),
    consumer: t.hex().notNull(),
    maxPenaltyBps: t.integer().notNull(),
    portionBps: t.integer().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    nodeIdx: index().on(t.fanOutNode),
    consumerIdx: index().on(t.consumer),
  })
)

/**
 * TokenWeighting denom weights — current value per (node, denom).
 *
 * Updated on every `WeightUpdated` event. The Mesh Explorer renders these
 * inline next to each denom in the inspector so the "1.0x / 0.8x"
 * normalization is visible without a chain read.
 */
export const meshDenomWeight = onchainTable(
  'mesh_denom_weight',
  (t) => ({
    id: t.text().primaryKey(), // `${tokenWeightingAddress}-${denom}`
    nodeAddress: t.hex().notNull(),
    denom: t.hex().notNull(),
    weightBps: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    nodeIdx: index().on(t.nodeAddress),
  })
)

/**
 * Per-(token, user) encumbered-balance positions in the manager ledger.
 *
 * Tracks ONLY `encumbered` because it is the one side the manager's event
 * stream pins down exactly: EncumbranceIncreased (+units), the three attributable
 * decrement events (EncumbranceReleased / EncumbranceMovedToEscrow /
 * EncumbrancePaidExternal, each -units against the committer), EncumbranceTransferred
 * (move between users), EncumbranceContributed (+= the commitment's committer), and
 * ForfeitExecuted (-= the forfeited committer). The `free` side is intentionally not
 * indexed: although the decrement events are now attributable by path, only the
 * EncumbranceReleased path conserves the holder's total (free goes up) — the escrow
 * and external paths move value out of the ledger entirely — so a single derived
 * free balance would still drift. Read the authoritative free balance live via
 * `manager.freeBalance(token, user)` (a cheap view, queried per connected
 * account on the frontend).
 *
 * Enough for graph sizing (conviction/stake) — the use the old per-user
 * `vaultPosition.encumberedShares` served, now token-aware.
 */
export const ledgerPosition = onchainTable(
  'ledger_position',
  (t) => ({
    id: t.text().primaryKey(), // `${token}-${user}` (both lowercased)
    token: t.hex().notNull(),
    user: t.hex().notNull(),
    encumbered: t.bigint().notNull().default(0n),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    userIdx: index().on(t.user),
    tokenIdx: index().on(t.token),
  })
)

/**
 * Append-only log of every ledger movement that changes a user's free or
 * encumbered balance. `ledgerPosition` above is the *current* encumbered
 * balance; this is the history that produces it, and it adds the free side.
 *
 * Deltas are SIGNED (ponder maps `bigint` to numeric(78,0), so negatives are
 * fine). Folding the rows for one (user, token) in block order reproduces both
 * balances at every point in time — which is what the dashboard's portfolio
 * chart needs and what no other table can answer.
 *
 * WHY THIS DOESN'T CONTRADICT `ledgerPosition`'s "free is not derivable" note:
 * that comment predates the split of the old overloaded `EncumbranceDecreased`
 * into attributable events, and it is about deriving a single authoritative
 * *current* free balance. That remains true, for exactly one path — see the
 * DistributionPaid caveat below. Consumers of this table must therefore treat
 * the free series as a *shape* anchored to a live `manager.freeBalance` read,
 * not as an independent source of truth. The frontend's `useBalanceHistory`
 * does precisely that.
 *
 * THE ONE GAP: `MovementKind.FromEscrowToFree` credits free[recipient] and
 * `FromEscrowToExternal` transfers out of custody, and BOTH emit exactly
 * `DistributionPaid(strategy, recipient, token, amount, ...)` with nothing to
 * tell them apart (MovementLib._applyFromEscrow emits one line for both
 * branches). The only off-chain discriminator is the presence of a matching
 * ERC-20 `Transfer` in the same tx, which would mean binding every backing
 * token. So DistributionPaid is recorded here as an ANNOTATION — both deltas
 * are zero, `kind = 'distribution'` — and never moves a balance. Fixing this
 * properly means adding the movement kind to the event; tracked as protocol
 * feedback, not worked around here.
 *
 * Row ids are `${txHash}-${logIndex}-${leg}`: one event can produce two legs
 * (a transfer debits one user and credits another), and `leg` disambiguates.
 */
export const ledgerFlow = onchainTable(
  'ledger_flow',
  (t) => ({
    id: t.text().primaryKey(),
    user: t.hex().notNull(),
    token: t.hex().notNull(),
    manager: t.hex().notNull(),
    /** Signed change to the user's free balance in raw token units. */
    freeDelta: t.bigint().notNull().default(0n),
    /** Signed change to the user's encumbered balance in raw token units. */
    encumberedDelta: t.bigint().notNull().default(0n),
    /**
     * Movement path, for annotating the chart and reading the history back:
     * 'deposit' | 'withdraw' | 'encumber' | 'release' | 'escrow' | 'external'
     * | 'transferIn' | 'transferOut' | 'contributeOut' | 'contributeIn'
     * | 'forfeitOut' | 'forfeitIn' | 'settleOut' | 'settleIn' | 'distribution'
     * | 'premiumOut' | 'premiumIn' | 'juniorOut' | 'juniorIn'
     */
    kind: t.text().notNull(),
    /** Attributed commitment, when the path names one. Null otherwise. */
    commitmentId: t.bigint(),
    blockNumber: t.bigint().notNull(),
    /**
     * Position of the emitting log WITHIN ITS BLOCK — the EVM numbers logs per
     * block, not per transaction, so (blockNumber, logIndex) totally orders
     * every row and is the sort the history fold depends on.
     *
     * Ordering by blockTimestamp alone is NOT enough and fails visibly: a
     * deposit and the encumbrance it funds routinely land in the same block, so
     * the tiebreak decides whether the fold sees "deposit then encumber" or
     * "encumber then deposit", and the latter drives the free balance negative
     * for the rest of the series. Timestamp also repeats across blocks under
     * instant mining, which no within-block tiebreak can fix.
     */
    logIndex: t.integer().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    // The endpoint's only access pattern: one user's history in fold order,
    // optionally narrowed to a token. Ordered on (blockNumber, logIndex) to
    // match the query exactly; blockTimestamp is a payload column here, used
    // for the window cutoff and the x-axis but never for sorting.
    userOrderIdx: index().on(t.user, t.blockNumber, t.logIndex),
    userTokenOrderIdx: index().on(t.user, t.token, t.blockNumber, t.logIndex),
  })
)

/**
 * Vaults discovered via VaultFactory's VaultDeployed event, with metadata
 * mirrored from each `VaultMetadataUpdated` emit. The metadata columns share
 * the same shape used by `operator` (URI, hash, status, parsed content) and
 * are populated through the shared `metadataFetcher` so the frontend can
 * render `vault.v1` payloads — name, description, logoURI, riskTier, curator,
 * strategy — without re-reading on-chain.
 *
 * `asset`/`name`/`symbol`/`decimals` are read from the vault contract once on
 * first sight. They are nullable for migration compat with rows seeded by a
 * pre-Phase-29 indexer; new VaultDeployed events fill them in.
 */
export const vault = onchainTable(
  'vault',
  (t) => ({
    address: t.hex().primaryKey(),
    asset: t.hex(),
    name: t.text(),
    symbol: t.text(),
    decimals: t.integer(),
    deployedBlock: t.bigint(),
    // Metadata — current value only; updated on every VaultMetadataUpdated event.
    metadataURI: t.text(),
    metadataHash: t.hex(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'mismatch' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
  }),
  (t) => ({
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

/**
 * Services registered via OperatorServiceRegistry. One row per registry
 * (single-service per stake-registry deployment in v1) keyed by registry
 * address. Metadata follows the `service.v1` schema; unlike the other
 * entities the registry stores only a URI (no on-chain contentHash) so
 * status is one of 'empty' | 'ok' | 'unreachable' — never 'mismatch'.
 */
export const service = onchainTable(
  'service',
  (t) => ({
    address: t.hex().primaryKey(),
    metadataURI: t.text(),
    metadataStatus: t.text(), // 'empty' | 'ok' | 'unreachable'
    metadataContent: t.jsonb(),
    metadataContentRaw: t.text(),
    updatedBlock: t.bigint(),
  }),
  (t) => ({
    metadataStatusIdx: index().on(t.metadataStatus),
  })
)

/**
 * Per-service operator membership — written on every
 * OperatorServiceRegistry:OperatorRegistered / OperatorDeregistered emit.
 * An operator may belong to multiple services; the existing `operator`
 * row (keyed by address) only mirrors the *latest* registry to touch it,
 * so this junction table is the source of truth for "which operators
 * back service S".
 *
 * Drives /services/:address/stake-summary: registered operators × their
 * commitments grouped by vault → per-vault committed stake totals.
 */
export const serviceOperator = onchainTable(
  'service_operator',
  (t) => ({
    id: t.text().primaryKey(), // `${service}-${operator}`
    service: t.hex().notNull(),
    operator: t.hex().notNull(),
    status: t.text().notNull(), // 'registered' | 'deregistered'
    weight: t.bigint().notNull().default(0n), // snapshot at registration
    registeredBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    serviceIdx: index().on(t.service),
    operatorIdx: index().on(t.operator),
    statusIdx: index().on(t.status),
  })
)

/**
 * Governance — DAO instances deployed by GovernorFactory. One row per
 * GovernorDeployed event. `isCanonical` is set true for the governor
 * marked by setCanonicalGovernor() (typically the protocol's reference DAO).
 *
 * Config fields (votingDelay/Period/threshold/quorum*) are read once at
 * deploy time from the chain and cached here so frontend pages render
 * without per-row chain reads.
 */
export const governor = onchainTable(
  'governor',
  (t) => ({
    address: t.hex().primaryKey(),
    timelock: t.hex().notNull(),
    shim: t.hex().notNull(),
    votingPowerSource: t.hex().notNull(),
    name: t.text().notNull(),
    isCanonical: t.boolean().notNull().default(false),
    factory: t.hex().notNull(),
    deployer: t.hex().notNull(),
    createdBlock: t.bigint().notNull(),
    createdTx: t.hex().notNull(),
    // Config snapshot at deploy time.
    votingDelay: t.bigint().notNull(),
    votingPeriod: t.bigint().notNull(),
    proposalThreshold: t.bigint().notNull(),
    quorumNumerator: t.bigint().notNull(),
    quorumDenominator: t.bigint().notNull(),
    timelockMinDelay: t.bigint().notNull(),
  }),
  (t) => ({
    sourceIdx: index().on(t.votingPowerSource),
    canonicalIdx: index().on(t.isCanonical),
    factoryIdx: index().on(t.factory),
  }),
)

/**
 * Governance proposals — keyed by `${governor}-${proposalIdHex}` so multiple
 * Governor instances can coexist. `state` is derived (and persisted) from the
 * lifecycle events plus the periodic state-flip tick. `kind` is decoded from
 * the action set at index time (one of weight_update, forfeit_arbitration,
 * treasury, signaling, mixed) so the frontend can render per-kind action
 * cards without re-decoding calldata.
 *
 * Lifecycle txHashes are denormalized into the row so the timeline UI is a
 * single read; per-vote rows live in the `vote` table.
 */
export const proposal = onchainTable(
  'proposal',
  (t) => ({
    id: t.text().primaryKey(), // `${governor.toLowerCase()}-${proposalIdHex}`
    governor: t.hex().notNull(),
    proposalId: t.bigint().notNull(),
    proposer: t.hex().notNull(),
    description: t.text().notNull(),
    descriptionHash: t.hex().notNull(),
    voteStart: t.bigint().notNull(),
    voteEnd: t.bigint().notNull(),
    eta: t.bigint(),
    forVotes: t.bigint().notNull().default(0n),
    againstVotes: t.bigint().notNull().default(0n),
    abstainVotes: t.bigint().notNull().default(0n),
    quorumAtSnapshot: t.bigint(),
    state: t.text().notNull(), // pending|active|canceled|defeated|succeeded|queued|expired|executed
    kind: t.text().notNull(), // weight_update|forfeit_arbitration|treasury|signaling|mixed
    createdBlock: t.bigint().notNull(),
    createdTx: t.hex().notNull(),
    canceledBlock: t.bigint(),
    canceledTx: t.hex(),
    queuedBlock: t.bigint(),
    queuedTx: t.hex(),
    executedBlock: t.bigint(),
    executedTx: t.hex(),
  }),
  (t) => ({
    governorIdx: index().on(t.governor),
    proposerIdx: index().on(t.proposer),
    stateIdx: index().on(t.state),
    kindIdx: index().on(t.kind),
  }),
)

/**
 * Decoded proposal action rows — one row per (governor, proposalId, index)
 * triple from the targets[]/values[]/calldatas[] arrays.
 *
 * Decoder lives in src/decode/governanceActions.ts. `kind` matches one of
 * the proposal.kind enum values; `decoded` carries kind-specific decoded
 * fields:
 *   weight_update     → { tokenWeighting, denom, newWeightBps }
 *   forfeit_arbitration → { manager, op, commitmentId, penaltyBps? }
 *   treasury          → { signature?, args?, rawCalldata }
 *   signaling         → null
 */
export const proposalAction = onchainTable(
  'proposal_action',
  (t) => ({
    id: t.text().primaryKey(), // `${governor.toLowerCase()}-${proposalIdHex}-${index}`
    governor: t.hex().notNull(),
    proposalId: t.bigint().notNull(),
    actionIndex: t.integer().notNull(),
    target: t.hex().notNull(),
    value: t.bigint().notNull(),
    calldata: t.hex().notNull(),
    kind: t.text().notNull(),
    selector: t.hex(),
    decoded: t.jsonb(),
  }),
  (t) => ({
    proposalIdx: index().on(t.governor, t.proposalId),
    kindIdx: index().on(t.kind),
    selectorIdx: index().on(t.selector),
  }),
)

/**
 * Per-vote log — one row per VoteCast / VoteCastWithParams. Unique by
 * (governor, proposalId, voter); OZ Governor reverts on double-vote so
 * there's no collision risk.
 */
export const vote = onchainTable(
  'vote',
  (t) => ({
    id: t.text().primaryKey(), // `${governor.toLowerCase()}-${proposalIdHex}-${voter.toLowerCase()}`
    governor: t.hex().notNull(),
    proposalId: t.bigint().notNull(),
    voter: t.hex().notNull(),
    support: t.integer().notNull(), // 0=against, 1=for, 2=abstain
    weight: t.bigint().notNull(),
    reason: t.text().notNull().default(''),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    proposalIdx: index().on(t.governor, t.proposalId),
    voterIdx: index().on(t.voter),
    blockIdx: index().on(t.blockNumber),
  }),
)

// ============================================================================
// Mutual / Synthetic Mutual — pooled, mutualised forfeiture
// ============================================================================

/**
 * One row per Mutual created on a CommitmentManager (`MutualCreated`).
 *
 * A Mutual mutualises forfeiture across many members: a single loss event
 * (`MutualLossExecuted`) bumps the mutual's `cumulativeLoss` (Lambda — a 1e18-scaled,
 * monotonic, ≤1e18 cumulative loss FRACTION), and each member owes raw units =
 * `forfeitableUnits * (Lambda - lossSnapshot) / 1e18`, settled lazily to the
 * mutual `beneficiary`. `totalShares` is the sum of active members' `creditedValue`
 * and only moves on join/release (never on loss).
 *
 * Accounting fields are refreshed (chain-read via `getMutual`) on every
 * mutual event that moves value, so the row is always a current snapshot.
 *
 * The trailing `targetCapacity` / `termEnd` / `perilURI` / `perilHash` columns are
 * the denormalized "synthetic mutual" annotation: they are NULL for a bare
 * mutual and populated from `MutualRegistry.MutualRegistered` when a mutual is
 * wrapped as an insurance mutual (see src/mutual.ts).
 *
 * `status`:
 *   'forming'    — created, not yet activated (no new members admitted to cover yet).
 *   'active'     — activated; accepting members / covering the peril.
 *   'terminated' — mutual wound down (`MutualTerminated`; `terminal` is also true).
 */
export const mutual = onchainTable(
  'mutual',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${mutualId}` (manager lowercased)
    manager: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    arbiter: t.hex().notNull(),
    numeraire: t.hex().notNull(),
    beneficiary: t.hex().notNull(),
    valuationAuthority: t.hex().notNull(), // 0x0 ⇒ homogeneous mode (creditedValue == forfeitableUnits)
    challengeWindow: t.bigint().notNull().default(0n), // seconds (uint64 on chain)
    deallocationWindow: t.bigint().notNull().default(0n), // seconds (uint64 on chain)
    totalShares: t.bigint().notNull().default(0n), // Σ active members' creditedValue
    cumulativeLoss: t.bigint().notNull().default(0n), // Lambda, 1e18-scaled, monotonic, ≤1e18
    active: t.boolean().notNull().default(false),
    terminal: t.boolean().notNull().default(false),
    status: t.text().notNull(), // 'forming' | 'active' | 'terminated'
    // ---- Premium index (reward side, §G premium) — refreshed via getMutualPremiumState ----
    premiumPerShareStored: t.bigint().notNull().default(0n), // Pi — 1e18-scaled cumulative premium-per-share
    activeCover: t.bigint().notNull().default(0n), // uint128 on chain; the streaming reward denominator
    settledTotal: t.bigint().notNull().default(0n), // Σ premium streamed-and-banked so far
    rewardRate: t.bigint().notNull().default(0n), // uint128 on chain; premium/sec of the live stream
    lastUpdate: t.bigint().notNull().default(0n), // uint64 on chain; last Pi accrual timestamp
    periodFinish: t.bigint().notNull().default(0n), // uint64 on chain; stream end timestamp
    premiumRemainder: t.bigint().notNull().default(0n), // carried fixed-point dust
    bankedTotal: t.bigint().notNull().default(0n), // Σ unclaimed member rewardBank
    premiumPool: t.bigint().notNull().default(0n), // reserve (funded − claimed)
    // ---- Heterogeneous mode (ERC §H §8 / M4) — set once via configureHeterogeneous, then the
    // band/junior config is immutable; `juniorPool` moves with funding / settle-draw / sweep. NULL/0
    // for homogeneous & attested-unconfigured mutuals (bandAdapter NULL ⇒ not heterogeneous).
    bandAdapter: t.hex(), // manipulation-resistant valuation adapter; NULL ⇒ homogeneous (M1 behaviour)
    valuationFloorBps: t.bigint().notNull().default(0n), // band lower bound on premiumWeight (uint64)
    valuationCeilBps: t.bigint().notNull().default(0n), // band upper bound; ≤1e4 (uint64)
    juniorBps: t.bigint().notNull().default(0n), // premium-funding split to the junior absorber (uint64)
    juniorPool: t.bigint().notNull().default(0n), // junior reserve, funded − drawn (5th partition compartment)
    // Synthetic-mutual annotation (denormalized from MutualRegistered) — NULL for bare mutuals.
    targetCapacity: t.bigint(),
    termEnd: t.bigint(),
    perilURI: t.text(),
    perilHash: t.text(),
    // Underwritten-vault association (denormalized from the VaultCoverConduit's
    // PremiumFunded events): the vault whose deposits this mutual ambient-covers
    // and the keyless conduit funding the premium stream on its behalf. NULL for
    // ordinary mutuals — nullable keeps live-indexer migrations safe.
    coveredVault: t.hex(),
    conduit: t.hex(),
    createdBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    managerIdx: index().on(t.manager),
    mutualIdIdx: index().on(t.mutualId),
    arbiterIdx: index().on(t.arbiter),
    beneficiaryIdx: index().on(t.beneficiary),
    statusIdx: index().on(t.status),
  }),
)

/**
 * Per-member mutual position. One row per `MemberJoined`, keyed by the
 * member's commitment. The member's commitment also lives in the `commitment`
 * table (under the same manager); this row is the mutual-membership overlay.
 *
 *   forfeitableUnits — E_i, the member's at-risk units (raw, in the mutual numeraire
 *                      for homogeneous mode).
 *   creditedValue    — the member's contribution to `totalShares` (== forfeitableUnits
 *                      in homogeneous mode).
 *   settledUnits     — cumulative units already paid to the beneficiary for this member
 *                      (refreshed live via `getMembership` on `MemberSettled`).
 *   lossSnapshot     — the mutual's `cumulativeLoss` at the member's last settlement /
 *                      join; owed = forfeitableUnits * (Lambda - lossSnapshot) / 1e18.
 *
 * `status`:
 *   'active'        — in the mutual, at risk.
 *   'exitRequested' — `MemberExitRequested` (deallocation/unbond requested).
 *   'released'      — `MemberReleased` (left the mutual; no longer at risk).
 */
export const membership = onchainTable(
  'membership',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${commitmentId}` (manager lowercased)
    manager: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    commitmentId: t.bigint().notNull(),
    committer: t.hex().notNull(),
    forfeitableUnits: t.bigint().notNull(), // E_i
    settledUnits: t.bigint().notNull().default(0n),
    creditedValue: t.bigint().notNull(), // uint128 on chain
    lossSnapshot: t.bigint().notNull().default(0n),
    // ---- Premium index (reward side; M1 append-only) — refreshed via getMembership ----
    premiumWeight: t.bigint().notNull().default(0n), // uint128 on chain; == creditedValue in homogeneous v1
    premiumSnapshot: t.bigint().notNull().default(0n), // Pi at join / last sync (reward non-retroactivity)
    rewardBank: t.bigint().notNull().default(0n), // accrued-but-unclaimed premium in numeraire
    status: t.text().notNull(), // 'active' | 'exitRequested' | 'released'
    createdBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    managerIdx: index().on(t.manager),
    mutualIdIdx: index().on(t.mutualId),
    commitmentIdx: index().on(t.commitmentId),
    committerIdx: index().on(t.committer),
    statusIdx: index().on(t.status),
  }),
)

/**
 * Per-event Mutual log, mirroring the `forfeitEvent` pattern — one row
 * per emitted mutual transition with a precise blockTimestamp +
 * txHash so the frontend can render a mutual / mutual timeline.
 *
 * `commitmentId` is populated for member-scoped transitions (memberJoined,
 * memberSettled, exitRequested, memberReleased) and NULL for mutual-scoped ones.
 * `numeraireAmount` carries the event's loss/credit exposure where applicable;
 * `cumulativeLoss` carries the post-event Lambda for loss-execution / settlement
 * rows. `actor` is the proposer / committer where the event identifies one.
 */
export const mutualEvent = onchainTable(
  'mutual_event',
  (t) => ({
    id: t.text().primaryKey(), // `${mutualId}-${blockNumber}-${logIndex}`
    manager: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    commitmentId: t.bigint(), // null for mutual-scoped transitions
    // 'created' | 'activated' | 'memberJoined' | 'lossInitiated' | 'lossExecuted' |
    // 'lossCancelled' | 'lossShortfall' | 'memberSettled' | 'exitRequested' |
    // 'memberReleased' | 'terminated' |
    // heterogeneous (§H §8 / M4): 'heteroConfigured' | 'remarked' | 'juniorFunded' |
    // 'juniorDrawn' | 'juniorSwept'
    kind: t.text().notNull(),
    numeraireAmount: t.bigint(), // loss/credit exposure where applicable
    cumulativeLoss: t.bigint(), // post-event Lambda (lossExecuted / memberSettled)
    actor: t.hex(), // proposer / committer where identified
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    mutualIdx: index().on(t.manager, t.mutualId),
    commitmentIdx: index().on(t.commitmentId),
    kindIdx: index().on(t.kind),
    blockIdx: index().on(t.blockNumber),
  }),
)

/**
 * Per-event premium inflow / outflow ledger for a Mutual's reward side.
 * Mirrors the `mutualEvent` shape but scoped to the §G premium index. One row per
 * `MutualPremiumFunded` / `StandbyFunded` / `PremiumReclaimed` / `MutualPremiumSwept`.
 *
 * `kind`:
 *   'funded'    — a policyholder funded/extended the stream (`MutualPremiumFunded`);
 *                 `amount` is the MEASURED received delta; rewardRate/periodFinish post-funding.
 *   'standby'   — the LinkedMutualPolicy funded standby premium (`StandbyFunded`);
 *                 `actor` is the funder, `amount` the premium paid (rewardRate/periodFinish NULL).
 *   'reclaimed' — the policyholder-of-record reclaimed the unstreamed remainder
 *                 (`PremiumReclaimed`); `amount` is the unstreamed reclaim, `actor` the recipient.
 *   'swept'     — terminal sweep of a wound-down mutual's residual reserve
 *                 (`MutualPremiumSwept`); `amount` swept, `actor` the recipient.
 */
export const premiumFunding = onchainTable(
  'premium_funding',
  (t) => ({
    id: t.text().primaryKey(), // `${mutualId}-${blockNumber}-${logIndex}`
    manager: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    kind: t.text().notNull(), // 'funded' | 'standby' | 'reclaimed' | 'swept'
    actor: t.hex(), // funder / recipient where the event identifies one
    amount: t.bigint().notNull(),
    rewardRate: t.bigint(), // post-funding stream rate (funded only); NULL otherwise
    periodFinish: t.bigint(), // post-funding stream end (funded only); NULL otherwise
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    mutualIdx: index().on(t.manager, t.mutualId),
    kindIdx: index().on(t.kind),
    blockIdx: index().on(t.blockNumber),
  }),
)

/**
 * One row per `MemberPremiumClaimed` — a member's accrued premium paid to its
 * committer (via `claimMemberPremium`, `settleAndClaim`, or the auto-pay on
 * `releaseGroupMember`). `mutualId` is resolved from the membership row (the event
 * itself only carries `commitmentId`).
 */
export const premiumClaim = onchainTable(
  'premium_claim',
  (t) => ({
    id: t.text().primaryKey(), // `${manager}-${commitmentId}-${blockNumber}-${logIndex}`
    manager: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    commitmentId: t.bigint().notNull(),
    recipient: t.hex().notNull(),
    amount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    recipientIdx: index().on(t.recipient),
    commitmentIdx: index().on(t.commitmentId),
    mutualIdx: index().on(t.manager, t.mutualId),
    blockIdx: index().on(t.blockNumber),
  }),
)

/**
 * Per-binding cover sold by a LinkedMutualPolicy against a Mutual. One
 * row per `CoverBound` (active=true); flipped to active=false by `BindingExpired`.
 * `StandbyFunded` does NOT create a binding — it is a `premiumFunding` kind='standby'
 * row. Keyed by `${policy}-${bindingId}` (the policy is the binding's namespace).
 */
export const coverBinding = onchainTable(
  'cover_binding',
  (t) => ({
    id: t.text().primaryKey(), // `${policy}-${bindingId}` (policy lowercased)
    policy: t.hex().notNull(),
    mutualId: t.bigint().notNull(),
    bindingId: t.bigint().notNull(),
    policyholder: t.hex().notNull(),
    notional: t.bigint().notNull(),
    expiry: t.bigint().notNull(), // uint64 on chain
    premiumPaid: t.bigint().notNull(),
    active: t.boolean().notNull().default(true),
    createdBlock: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (t) => ({
    policyIdx: index().on(t.policy),
    mutualIdx: index().on(t.mutualId),
    policyholderIdx: index().on(t.policyholder),
    activeIdx: index().on(t.active),
  }),
)

/**
 * Underwritten-vault coverage-fee ledger: one row per skim/funding event on an
 * agent-managed vault's premium pipeline. The strategy side is denominated in
 * the vault's UNDERLYING asset (skim / operatorFee / premiumRouted); the
 * conduit side (premiumFunded) is denominated in vault SHARES (the mutual
 * numeraire). Settlement restitution needs no rows here — the beneficiary's
 * sweep lands in the existing `donation` table (donor = the
 * ForfeitDonationBeneficiary) and is labelled at the API layer.
 *
 * `kind`:
 *   'skim'          — YieldSkimmed: `amount` = the fee taken out of new gains.
 *   'operatorFee'   — OperatorFeePaid: `amount` → `recipient` (the agent).
 *   'premiumRouted' — PremiumRouted: `amount` → `recipient` (the conduit).
 *   'premiumFunded' — conduit PremiumFunded: `amount` = share premium pulled
 *                     into the mutual's stream (mutualId set).
 */
export const vaultYieldFee = onchainTable(
  'vault_yield_fee',
  (t) => ({
    id: t.text().primaryKey(), // `${source}-${blockNumber}-${logIndex}` (source lowercased)
    vault: t.hex().notNull(), // denormalized at handler time (strategy.vault() / conduit.vault())
    source: t.hex().notNull(), // the emitting strategy or conduit
    kind: t.text().notNull(), // 'skim' | 'operatorFee' | 'premiumRouted' | 'premiumFunded'
    amount: t.bigint().notNull(),
    recipient: t.hex(), // operator / conduit; NULL for 'skim' and 'premiumFunded'
    mutualId: t.bigint(), // set on 'premiumFunded' rows
    streamDuration: t.bigint(), // seconds; set on 'premiumFunded' rows
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    vaultIdx: index().on(t.vault),
    kindIdx: index().on(t.kind),
    recipientIdx: index().on(t.recipient),
  }),
)
