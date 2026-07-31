/**
 * The seed's metadata catalogue.
 *
 * Every off-chain payload the simulation attaches to a commitment or an
 * agreement is authored here, once, keyed by a name the Solidity script looks
 * up. `script/pin-metadata.mjs` turns this into `script/metadata-manifest.json`
 * and `Simulate.s.sol` reads that back.
 *
 * ── Why every entry has two variants ────────────────────────────────────────
 *
 * `metadataURI` is capped at 512 bytes on chain. An `ipfs://` CIDv1 URI is 66
 * bytes no matter how long the document is; an inline
 * `data:application/json;base64,` URI carries the whole document, so it fits
 * about 360 bytes of JSON. Measured on a real payload:
 *
 *     all five commitment.v1 fields, real prose  ->  668 B JSON
 *       as a data: URI                           ->  921 B   OVER THE CAP
 *       as an ipfs:// URI                        ->   66 B   fits
 *
 * So the interesting payloads only exist when a pinning backend does. Rather
 * than degrade to a corpus that silently omits half its fields, each entry
 * states both shapes explicitly:
 *
 *   `full`  — what the commitment actually says. Used when pinning succeeds.
 *   `short` — the same commitment, told in one sentence, under the data: cap.
 *             Used when there is no daemon, so `just dev-up` still works with
 *             Docker stopped. This is a hard requirement: making the dev loop
 *             depend on Docker would be worse than the problem being solved.
 *
 * `short` is not a truncation of `full` — a machine-clipped sentence reads like
 * a bug. It is a deliberate summary, and it must stay a fair summary when
 * `full` is edited.
 *
 * ── Authoring rules ─────────────────────────────────────────────────────────
 *
 *  - `schemaVersion` is required on every payload
 *    (docs/protocol/reference/concepts/metadata.md). Not `type`.
 *  - The description must add information the title does not already carry.
 *    "Bilateral commitment with cvWETH vault shares on both sides" under the
 *    title "cvWETH-collateralized mutual pledge" says nothing twice.
 *  - Say what a breach is and who decides, because that is what a
 *    counterparty and an arbiter open the row to find out.
 *  - Tags describe the commitment, not the seed. `demo` is not a tag.
 *  - **No `trustGraphAttestationId`.** The field is documented and rendered,
 *    but nothing in this repo issues trust-graph attestations, so every value
 *    here would be invented. A demo corpus full of plausible-looking
 *    attestation ids that reference nothing is worse than an empty field: it
 *    teaches a reader to trust a pointer that goes nowhere. Populate it when
 *    there is something real to point at.
 */

/**
 * A URI that cannot resolve anywhere, for the `unreachable` demo. The seed
 * points ONE commitment's `metadataURI` at this so the fetch-failure path has a
 * live example. Nothing else should use it.
 *
 * ── Why this is not an unpinned ipfs:// CID ─────────────────────────────────
 *
 * It used to be, on the reasoning that nothing serves an invented CID so the
 * fetch would 404 or time out. That held against the public ipfs.io gateway and
 * broke the moment a real local Kubo gateway was configured: Kubo answers an
 * unresolvable raw CID with **HTTP 200 and an empty body**, in about 5 ms. The
 * fetcher sees `res.ok`, hashes zero bytes, and classifies the row `mismatch` —
 * so the seed silently lost its only `unreachable` example and grew a second
 * `mismatch` instead.
 *
 * `.invalid` is reserved by RFC 2606 and guaranteed never to resolve, so DNS
 * fails, `fetch` throws, and the fetcher lands on `unreachable` the same way on
 * every machine regardless of which gateway is configured. Determinism beats
 * exercising the ipfs:// rewrite here — that path is covered by the seeded rows
 * whose `ipfs://` URIs DO resolve, plus an integration test.
 */
export const UNREACHABLE_URI = 'https://metadata.invalid/commitment.json'

/**
 * Sentinel for `termsURI` in a `full` payload.
 *
 * A `termsURI` that 404s is worse than none: it invites a click and then wastes
 * it. So the prepare step pins the entry's `terms` document FIRST and rewrites
 * this placeholder to the resulting `ipfs://CID` before pinning the payload
 * itself — a link that actually resolves. Entries with no `terms` document
 * simply omit `termsURI`.
 */
export const TERMS_PLACEHOLDER = '__TERMS_CID__'

/**
 * @typedef {object} Entry
 * @property {Record<string, unknown>} full  Complete payload; needs a pinning backend.
 * @property {Record<string, unknown>} short One-sentence variant that fits a data: URI.
 * @property {string} [terms] Markdown terms document, pinned separately and
 *   linked from `full.termsURI`. Only reachable on the pinning path.
 */

const commitment = (full, short, terms) => ({
  full: { schemaVersion: 'commitment.v1', ...full },
  short: { schemaVersion: 'commitment.v1', ...short },
  ...(terms ? { terms } : {}),
})

/**
 * An `agreement.v1` entry. Same two-variant shape; different field table.
 * `agreementURI` is the bilateral document (the analogue of `termsURI`) and
 * `proposerContact` is who to reach when something goes wrong — on a two-party
 * deal neither is optional in practice, whatever the schema says.
 */
const agreement = (full, short, terms) => ({
  full: { schemaVersion: 'agreement.v1', ...full },
  short: { schemaVersion: 'agreement.v1', ...short },
  ...(terms ? { terms } : {}),
})

/** Shared boilerplate every terms document ends with. */
const enforcement = (arbiter) => `
## Enforcement

Forfeiture runs in two phases. The arbiter announces first; capital moves only
after the challenge window elapses. During the window the committer may dispute,
the arbiter may withdraw the action, and any escalation path named above may
intervene.

The maximum penalty recorded on the commitment bounds any single forfeiture.
Nothing in this document can raise it.

Decided by: ${arbiter}.
`

/** @type {Record<string, Entry>} */
export const CATALOGUE = {
  // ── Index-yield family (cvUSDC, premium routed to the counterparty) ───────

  'indexYield.0': commitment(
    {
      title: 'Weekly market-data delivery',
      description:
        'The committer publishes a consolidated OHLCV feed for the desk every Monday by 00:00 UTC, covering the previous seven days across the venues listed in the terms document.\n\nIndex appreciation on the locked cvUSDC shares routes to the buyer as premium for each week the feed stays live. A missed or materially incomplete delivery is arbitrated against the published schedule, and the arbiter may forfeit up to the stated maximum penalty to the buyer. Two consecutive misses end the arrangement and release the remaining stake.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['data-feed', 'premium', 'sla', 'weekly'],
    },
    {
      title: 'Weekly market-data delivery',
      description:
        'Backs a weekly OHLCV feed for the desk. Index appreciation on the locked shares pays the buyer a premium for each week it stays live.',
      tags: ['data-feed', 'premium', 'sla'],
    },
  ),

  'indexYield.1': commitment(
    {
      title: 'Oracle uptime bond',
      description:
        'Secures a 99.9% monthly availability target on the USDC price oracle, measured at the aggregator against the reference feed named in the terms.\n\nHours missed beyond the target are settled out of the accrued premium first; only a sustained outage past the monthly budget reaches the stake itself. The operator publishes its own downtime report each month, and the arbiter rules on the gap between that report and the aggregator record.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['oracle', 'uptime', 'sla', 'availability'],
    },
    {
      title: 'Oracle uptime bond',
      description:
        'Secures a 99.9% uptime target on the USDC price oracle. Hours missed beyond the target settle out of the accrued premium.',
      tags: ['oracle', 'uptime', 'sla'],
    },
  ),

  'indexYield.3': commitment(
    {
      title: 'Cross-chain relay guarantee',
      description:
        'Relayer stake covering message delivery within two blocks on the USDC lane. The relayer is liable for messages it accepted and failed to deliver, not for messages the source chain never finalized.\n\nLate delivery is compensated from premium; a dropped or censored message is arbitrated case by case against the inclusion proofs, and a proven replay forfeits the full stated penalty to the affected sender.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['relay', 'premium', 'sla', 'bridge'],
    },
    {
      title: 'Cross-chain relay guarantee',
      description:
        'Relayer stake covering message delivery within two blocks on the USDC lane. Late or dropped messages are arbitrated case by case.',
      tags: ['relay', 'premium', 'sla'],
    },
  ),

  // Deliberately attested against the WRONG hash by the seed, so `mismatch`
  // has a live example. The prose is ordinary on purpose: the point of the
  // state is that plausible-looking text is refused promotion, and text that
  // announces itself as suspect would not test that.
  'indexYield.4': commitment(
    {
      title: 'Nightly backup attestation',
      description:
        'The committer publishes a nightly attestation that the desk order book was archived to cold storage, signed with the key registered in the terms document.\n\nA night without a published attestation is a forfeitable miss. The arbiter checks the archive digest against the published attestation before ruling, and a digest that does not match the archive is treated as a miss rather than a dispute.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['attestation', 'backup', 'custody'],
    },
    {
      title: 'Nightly backup attestation',
      description:
        "Backs a nightly proof that the desk's order book was archived. A night without a published attestation is a forfeitable miss.",
      tags: ['attestation', 'backup'],
    },
  ),

  // ── General cvUSDC family ─────────────────────────────────────────────────

  'general.0': commitment(
    {
      title: 'Escrowed milestone payment',
      description:
        'Stake held against delivery of the Q3 settlement integration: the contract deployed to mainnet, the migration run, and the acceptance suite green on the tag named in the terms.\n\nReleased in full on the arbiter sign-off. If the milestone slips past the agreed date without an approved extension, the arbiter forfeits the stated penalty to the buyer and the remainder returns to the committer.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['milestone', 'escrow', 'delivery'],
    },
    {
      title: 'Escrowed milestone payment',
      description:
        'Stake held against delivery of the Q3 settlement integration. Released on arbiter sign-off, forfeited if the milestone slips.',
      tags: ['milestone', 'escrow'],
    },
  ),

  'general.1': commitment(
    {
      title: 'Bug bounty backstop',
      description:
        'Funds the payout ceiling for critical findings in the settlement contracts, so a researcher can verify the money exists before they disclose rather than trusting a published policy.\n\nSeverity is assessed against the rubric in the terms document. The arbiter releases to the researcher on a confirmed critical finding; a disputed severity escalates to the panel named in the terms before any forfeit executes.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['security', 'bounty', 'disclosure'],
    },
    {
      title: 'Bug bounty backstop',
      description:
        'Funds the payout ceiling for critical findings in the settlement contracts, so a researcher can see the money exists before disclosing.',
      tags: ['security', 'bounty'],
    },
  ),

  'general.2': commitment(
    {
      title: 'Liquidity commitment, ETH/USDC',
      description:
        'Market-maker pledge to hold a two-sided book inside 40 bps for thirty days, at or above the depth stated in the terms, during the venue hours listed there.\n\nMeasured on the venue snapshots, not on self-reporting. Withdrawing the quote early, or persistently quoting wider than the band, forfeits a share of the stake to the venue; brief outages inside the published allowance do not.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['liquidity', 'market-making', 'venue'],
    },
    {
      title: 'Liquidity commitment, ETH/USDC',
      description:
        'Market-maker pledge to hold a two-sided book inside 40 bps for thirty days. Withdrawing the quote early forfeits a share of the stake.',
      tags: ['liquidity', 'market-making'],
    },
  ),

  // ── Flat-fee family ───────────────────────────────────────────────────────

  'flatFee.0': commitment(
    {
      title: 'Audited deployment warranty',
      description:
        'A one-off fee is paid at creation; the stake behind it warrants that the tagged release deploys clean against the audited bytecode, with no unreviewed diff between the audit commit and the deployed artifact.\n\nThe arbiter compares the on-chain bytecode against the audited build. A divergence that was not disclosed before deployment forfeits to the deployer of record.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['audit', 'fee', 'release', 'deployment'],
    },
    {
      title: 'Audited deployment warranty',
      description:
        'A fee is paid at creation; the stake warrants that the tagged release deploys clean against the audited bytecode.',
      tags: ['audit', 'fee', 'release'],
    },
  ),

  // ── cvWETH family ─────────────────────────────────────────────────────────

  'weth.0': commitment(
    {
      title: 'Validator performance bond',
      description:
        'cvWETH shares backing attestation performance across the operator’s validator set, measured against the duties recorded on the beacon chain rather than against self-reported uptime.\n\nMissed epochs inside the monthly allowance draw down the premium. Sustained underperformance, or a signed double-attestation, is arbitrated against the recorded duties and forfeits to the delegators named in the terms.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['validator', 'weth', 'sla', 'attestation'],
    },
    {
      title: 'Validator performance bond',
      description:
        'cvWETH backing attestation performance across the operator’s validator set. Missed epochs are arbitrated against the recorded duties.',
      tags: ['validator', 'weth', 'sla'],
    },
  ),

  'weth.1': commitment(
    {
      title: 'Bridge relayer bond',
      description:
        'Secures the WETH lane relayer against censored or replayed messages. The relayer commits to including every finalized message it accepted, in order, within the window stated in the terms.\n\nA proven replay forfeits to the affected sender. Censorship is judged on the inclusion record over a rolling window, so a single missed message is not a breach but a pattern is.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['bridge', 'weth', 'relay', 'censorship'],
    },
    {
      title: 'Bridge relayer bond',
      description:
        'Secures the WETH lane relayer against censored or replayed messages. A proven replay forfeits to the affected sender.',
      tags: ['bridge', 'weth', 'relay'],
    },
  ),

  'weth.3': commitment(
    {
      title: 'Insurance capacity pledge',
      description:
        'cvWETH earmarked as senior-layer capacity for the de-peg mutual: it absorbs loss only after the junior layer is exhausted, in exchange for the lower premium share stated in the terms.\n\nCapacity cannot be withdrawn while a claim window is open. Once the window closes with no claim, the unbonding path is available on the usual notice.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['insurance', 'weth', 'capacity', 'senior'],
    },
    {
      title: 'Insurance capacity pledge',
      description:
        'cvWETH earmarked as senior-layer capacity for the de-peg mutual. It cannot be withdrawn while a claim window is open.',
      tags: ['insurance', 'weth', 'capacity'],
    },
  ),

  'weth.4': commitment(
    {
      title: 'Custody attestation bond',
      description:
        'Backs a monthly proof of reserves for the WETH treasury: a signed statement of holdings, reconciled against the addresses enumerated in the terms document, published within five days of month end.\n\nA month without a published attestation is a forfeitable miss. A published attestation that the arbiter cannot reconcile against on-chain balances is treated as a miss, not as fraud, unless the discrepancy persists across two months.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['custody', 'weth', 'attestation', 'reserves'],
    },
    {
      title: 'Custody attestation bond',
      description:
        'Backs a monthly proof of reserves for the WETH treasury. A month without a published attestation is a forfeitable miss.',
      tags: ['custody', 'weth', 'attestation'],
    },
  ),

  // ── Agent bond (ERC-8004) ─────────────────────────────────────────────────
  //
  // Was published as `{"type":"agent-sla.v1",...}` — no `schemaVersion`, no
  // `title`. Two consequences, both visible in the app: `rendersSchema` was
  // false so the detail page opened a raw JSON dump, and `commitmentLabel`
  // found no title so the row fell back to a derived label. The machine-
  // readable fields are kept; what changed is that the document now says what
  // it is. `agentId` is dropped because it is assigned at seed time and this
  // catalogue is pinned beforehand — the agent is the commitment's committer,
  // which is authoritative anyway.

  'agentBond.0': commitment(
    {
      title: 'Agent intent-execution bond',
      description:
        'A fully slashable bond posted by an autonomous agent behind its published service level: intents executed within ten blocks, drawdown held under 5%.\n\nAnyone may open a bonded claim against a breach through the optimistic arbiter; an unchallenged claim finalizes on timeout with no third-party step. The agent is the committer on this commitment, which is what identifies it.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['agent', 'sla', 'erc-8004', 'bond'],
      service: 'intent-execution',
      maxDrawdownBps: 500,
      responseBlocks: 10,
    },
    {
      title: 'Agent intent-execution bond',
      description:
        'Fully slashable agent bond: intents executed within ten blocks, drawdown under 5%. Anyone may open a bonded claim against a breach.',
      tags: ['agent', 'sla', 'erc-8004'],
      service: 'intent-execution',
      maxDrawdownBps: 500,
      responseBlocks: 10,
    },
  ),

  // ── Operator registration ─────────────────────────────────────────────────

  'operator.0': commitment(
    {
      title: 'Operator registration, safety service',
      description:
        'Stake backing this operator’s registration in the safety service. The registry’s acceptance policy is the substance of the promise: full forfeitability, the shared manual arbiter, and cvUSDC backing, so the stake behind every registered operator is comparable.\n\nThe shares keep earning while they secure the registration. Deregistration releases them on the standard unbonding notice.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['operator', 'registration', 'service', 'safety'],
    },
    {
      title: 'Operator registration, safety service',
      description:
        'Stake backing this operator’s registration. Fully forfeitable under the registry policy; the shares keep earning while registered.',
      tags: ['operator', 'registration', 'service'],
    },
  ),

  'operator.1': commitment(
    {
      title: 'Operator registration, arbitration duty',
      description:
        'Registration stake for an operator that also serves on arbitration panels. Beyond the registry’s acceptance policy, the operator commits to answering panel requests within the published response window.\n\nA missed panel duty is arbitrated against the request log. Repeated non-response is grounds for forfeiture, not merely deregistration.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['operator', 'registration', 'arbitration', 'panel'],
    },
    {
      title: 'Operator registration, arbitration duty',
      description:
        'Registration stake for an operator serving on arbitration panels. Missed panel duties are arbitrated against the request log.',
      tags: ['operator', 'registration', 'arbitration'],
    },
  ),

  // operator.2 is intentionally absent — one registered operator stays unnamed
  // so the derived label ("Operator registry stake") keeps a live example.

  // ── Delegation to an operator ─────────────────────────────────────────────

  'delegation.3': commitment(
    {
      title: 'Delegation to a safety-service operator',
      description:
        'A depositor’s stake placed behind an operator they have chosen, sharing in the service revenue that operator earns and in the consequences if it misbehaves.\n\nThe delegator does not run the operations. What they are underwriting is the operator’s conduct: the same forfeiture conditions apply to delegated stake as to the operator’s own, which is what makes the delegation meaningful rather than a vote of confidence.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['delegation', 'operator', 'service', 'revenue-share'],
    },
    {
      title: 'Delegation to a safety-service operator',
      description:
        'Stake placed behind a chosen operator, sharing its service revenue and its forfeiture conditions.',
      tags: ['delegation', 'operator', 'service'],
    },
  ),

  // delegation.4 intentionally absent — the second delegation stays unnamed so
  // the "Delegation to <operator name>" derived tier stays exercised.

  // ── Mutual membership ─────────────────────────────────────────────────────
  //
  // The mutual already publishes a `peril.v1` document naming its covered
  // event; the member commitments that FUND it said nothing. Keyed by peril
  // rather than by member, because every member of a mutual underwrites the
  // same thing and the differences between them are amounts, not terms.

  'mutual.nav': commitment(
    {
      title: 'Underwriting the vault NAV-drop mutual',
      description:
        'Capacity pledged to a mutual covering a drop in the protected vault’s net asset value below its published floor.\n\nThe member earns a share of the premium stream for as long as the capacity stands, and absorbs a pro-rata share of any loss the arbiter declares. Capacity is locked while a claim window is open. Loss is allocated across capacity present when the loss is declared, not when it is discovered.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['mutual', 'underwriting', 'nav-drop', 'vault'],
    },
    {
      title: 'Underwriting the vault NAV-drop mutual',
      description:
        'Capacity covering a drop in the protected vault’s NAV below its floor. Earns premium; absorbs a pro-rata share of declared loss.',
      tags: ['mutual', 'underwriting', 'nav-drop'],
    },
  ),

  'mutual.depeg': commitment(
    {
      title: 'Underwriting the stablecoin de-peg mutual',
      description:
        'Capacity pledged to a mutual covering a sustained de-peg of the protected stablecoin position beyond the published tolerance band.\n\nA momentary wick is not a de-peg. The claim is assessed against the reference price over the published observation window, so brief dislocations do not trigger a payout and a genuine break does.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['mutual', 'underwriting', 'de-peg', 'stablecoin'],
    },
    {
      title: 'Underwriting the stablecoin de-peg mutual',
      description:
        'Capacity covering a sustained de-peg beyond the tolerance band. Assessed over an observation window, so a momentary wick is not a claim.',
      tags: ['mutual', 'underwriting', 'de-peg'],
    },
  ),

  'mutual.slashing': commitment(
    {
      title: 'Underwriting the validator slashing mutual',
      description:
        'Capacity pledged to a mutual covering slashing losses suffered by member validators.\n\nCorrelated slashing is the risk that matters here: a client bug that hits many members at once can exhaust the pool in a way independent faults cannot. Members should read the concentration limits in the terms before sizing their capacity.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['mutual', 'underwriting', 'slashing', 'validator'],
    },
    {
      title: 'Underwriting the validator slashing mutual',
      description:
        'Capacity covering slashing losses across member validators. Correlated slashing is the concentration risk to read for.',
      tags: ['mutual', 'underwriting', 'slashing'],
    },
  ),

  // ── Optimistic-claim underwriting ─────────────────────────────────────────

  'optimisticCover.0': commitment(
    {
      title: 'Smart-contract cover, optimistically arbitrated',
      description:
        'An underwriter’s capital standing behind a smart-contract-failure policy, with the policyholder named as the party who receives it if the cover pays out.\n\nClaims resolve optimistically: a claim that nobody disputes within the challenge window finalizes on timeout, with no arbitrator step. Disputing requires posting a bond, so the process costs something in both directions and neither side can stall for free.',
      termsURI: TERMS_PLACEHOLDER,
      tags: ['insurance', 'optimistic', 'smart-contract', 'cover'],
    },
    {
      title: 'Smart-contract cover, optimistically arbitrated',
      description:
        'Underwriter capital behind a smart-contract-failure policy. An undisputed claim finalizes on timeout; disputing requires a bond.',
      tags: ['insurance', 'optimistic', 'cover'],
    },
  ),

  // ── Agreements (agreement.v1 — both legs inherit this) ────────────────────

  'agreement.0': agreement(
    {
      title: 'Reciprocal uptime pledge',
      description:
        'A bilateral commitment between two operators: each pre-locks forfeitable stake under a shared arbiter, so a fault on either side compensates the other.\n\nPer-direction settlement caps bound how much can flow each way over the life of the agreement, which is what keeps a single bad month from draining one side. Neither leg can be released without the other.',
      agreementURI: TERMS_PLACEHOLDER,
      proposerContact: 'ops@example.coop',
      tags: ['mutual', 'uptime', 'bilateral', 'reciprocal'],
    },
    {
      title: 'Reciprocal uptime pledge',
      description:
        'Bilateral uptime commitment: each side is forfeitable to the other, under a shared arbiter, with per-direction settlement caps.',
      proposerContact: 'ops@example.coop',
      tags: ['mutual', 'uptime', 'bilateral'],
    },
  ),

  'agreement.weth': agreement(
    {
      title: 'Cross-operator cvWETH treaty',
      description:
        'A bilateral agreement with cvWETH shares on both sides: two operators backstop each other’s liveness, and the stake keeps earning throughout.\n\nThe amounts are deliberately symmetric here, but they need not be. An asymmetric pair is itself a signal about how the two sides price each other’s risk, and it is readable on chain by anyone.',
      agreementURI: TERMS_PLACEHOLDER,
      proposerContact: 'treaty@example.org',
      tags: ['mutual', 'weth', 'bilateral', 'liveness'],
    },
    {
      title: 'Cross-operator cvWETH treaty',
      description:
        'Bilateral liveness backstop with cvWETH on both sides. The stake keeps earning while it stands behind the treaty.',
      proposerContact: 'treaty@example.org',
      tags: ['mutual', 'weth', 'bilateral'],
    },
  ),
}

/**
 * Terms documents, one per entry, pinned separately and linked from
 * `full.termsURI`.
 *
 * Kept out of the payload table above so the payloads stay scannable: a
 * `description` is the summary a reader gets in the row, and this is the
 * document they open when the summary is not enough. They are markdown because
 * that is what `commitment.v1` documents `description` as, and a terms document
 * has no reason to be poorer.
 *
 * These exist only on the pinning path. Without a daemon there is nowhere to
 * put them and the `short` payloads carry no `termsURI` at all, which is the
 * honest outcome — better than a link that 404s.
 */
const TERMS = {
  'indexYield.0': `# Weekly market-data delivery

## What is promised

A consolidated OHLCV feed for the desk, published every Monday by 00:00 UTC,
covering the previous seven calendar days.

Venues in scope: the four spot venues enumerated in the buyer's onboarding
packet. Adding or dropping a venue requires the buyer's written agreement and
takes effect the following week.

## What counts as a miss

- No file published by 00:00 UTC Monday.
- A published file missing more than 1% of expected candles for any venue in
  scope.
- Candles that disagree with the venue's own public API beyond rounding.

A file published late but within the same UTC day is a partial miss and draws
down premium only.

## Consideration

Index appreciation on the locked cvUSDC shares routes to the buyer for each
week the feed stays live. Two consecutive misses end the arrangement and
release the remaining stake.
${enforcement('the named manual arbiter')}`,

  'indexYield.1': `# Oracle uptime bond

## What is promised

99.9% monthly availability on the USDC price oracle, measured at the
aggregator against the reference feed, excluding windows where the reference
feed itself is down.

## Measurement

Availability is computed from the aggregator's own request log in one-minute
buckets. A bucket counts as down if no fresh price was served within the
staleness threshold recorded on the feed.

The operator publishes a monthly downtime report. The arbiter rules on the gap
between that report and the aggregator record, not on the report alone.

## Consideration

Hours missed beyond the target settle out of accrued premium first. Only a
sustained outage past the monthly budget reaches the stake.
${enforcement('the named manual arbiter')}`,

  'indexYield.3': `# Cross-chain relay guarantee

## What is promised

Delivery of every message the relayer accepted on the USDC lane within two
blocks of source finality.

The relayer is liable for messages it accepted. It is not liable for messages
the source chain never finalized, nor for destination-chain congestion it can
evidence.

## What counts as a breach

- Late delivery: compensated from premium.
- A dropped or censored message: arbitrated case by case against the inclusion
  proofs.
- A proven replay: forfeits the full stated penalty to the affected sender.

## Evidence

Inclusion proofs from both chains, and the relayer's signed accept log.
${enforcement('the named manual arbiter')}`,

  'indexYield.4': `# Nightly backup attestation

## What is promised

A nightly signed attestation that the desk order book was archived to cold
storage, published by 06:00 UTC, signed with the key registered below.

## What counts as a miss

A night with no published attestation. A published attestation whose digest
does not match the archive is also a miss, not a dispute: the remedy is the
same and the arbiter does not have to rule on intent.

## Evidence

The archive digest, the published attestation, and the signing key's
registration record.
${enforcement('the named manual arbiter')}`,

  'general.0': `# Escrowed milestone payment

## The milestone

The Q3 settlement integration is complete when all three hold:

1. The contract is deployed to mainnet at the tagged commit.
2. The migration has run and reconciled against the pre-migration snapshot.
3. The acceptance suite is green on that tag.

## Timing

Due on the date in the statement of work. An extension requires the buyer's
written agreement before the due date, not after.

## Outcome

Released in full on arbiter sign-off. If the milestone slips without an
approved extension, the stated penalty forfeits to the buyer and the remainder
returns to the committer.
${enforcement('the named manual arbiter')}`,

  'general.1': `# Bug bounty backstop

## Purpose

This commitment funds the payout ceiling for critical findings in the
settlement contracts. A researcher can verify the money exists before they
disclose, rather than trusting a published policy.

## Severity

Assessed against the standard rubric. Critical means direct loss of user funds
or permanent freezing, reachable without privileged access.

## Process

1. The researcher discloses privately.
2. The arbiter confirms severity within ten days.
3. On a confirmed critical finding, the arbiter releases to the researcher.

A disputed severity escalates to the review panel before any forfeit executes.
Public disclosure before the ten days elapse voids the claim.
${enforcement('the named manual arbiter, escalating to the review panel')}`,

  'general.2': `# Liquidity commitment, ETH/USDC

## What is promised

A two-sided book inside 40 bps, at or above the stated depth, during venue
hours, for thirty days.

## Measurement

From the venue's own order-book snapshots, not from self-reporting. The
published allowance covers brief outages; the band is assessed over rolling
five-minute windows rather than instantaneously.

## What counts as a breach

Withdrawing the quote before the term ends, or persistently quoting wider than
the band outside the allowance. Both forfeit a share of the stake to the venue.
${enforcement('the venue operator as named arbiter')}`,

  'flatFee.0': `# Audited deployment warranty

## What is warranted

That the tagged release deploys clean against the audited bytecode: no
unreviewed difference between the audit commit and the deployed artifact.

## Verification

The arbiter compares deployed on-chain bytecode against the audited build,
reproducing it from the audit commit with the recorded compiler settings.

## What counts as a breach

Any divergence not disclosed and accepted before deployment. Disclosed
divergences accepted by the buyer are outside this warranty.

## Consideration

A one-off fee is paid at creation, independent of outcome.
${enforcement('the named manual arbiter')}`,

  'weth.0': `# Validator performance bond

## What is promised

Attestation performance across the operator's validator set, measured against
the duties recorded on the beacon chain rather than against self-reported
uptime.

## Measurement

Per-epoch attestation effectiveness over a rolling month. Missed epochs inside
the monthly allowance draw down premium and no more.

## What counts as a breach

- Sustained underperformance past the monthly allowance.
- A signed double-attestation, at any time, regardless of allowance.

Both forfeit to the delegators named in the delegation record.
${enforcement('the named manual arbiter')}`,

  'weth.1': `# Bridge relayer bond

## What is promised

Inclusion of every finalized message the relayer accepted on the WETH lane, in
order, within the stated window.

## What counts as a breach

- A proven replay: forfeits to the affected sender.
- Censorship: judged on the inclusion record over a rolling window. A single
  missed message is not a breach; a pattern is.

The distinction is deliberate. Relayers drop messages for reasons that are not
misconduct, and a bond that fires on the first miss is a bond nobody posts.
${enforcement('the named manual arbiter')}`,

  'weth.3': `# Insurance capacity pledge

## Position

Senior-layer capacity for the de-peg mutual. This capacity absorbs loss only
after the junior layer is exhausted, in exchange for the lower premium share
recorded on the mutual.

## Lock-up

Capacity cannot be withdrawn while a claim window is open. Once a window closes
with no claim, the standard unbonding path is available on the usual notice.

## Loss allocation

Pro rata across senior capacity at the time the loss is declared, not at the
time it is discovered.
${enforcement('the mutual arbiter')}`,

  'weth.4': `# Custody attestation bond

## What is promised

A monthly proof of reserves for the WETH treasury: a signed statement of
holdings reconciled against the enumerated addresses, published within five
days of month end.

## What counts as a miss

- A month with no published attestation.
- A published attestation the arbiter cannot reconcile against on-chain
  balances.

The second is treated as a miss, not as fraud, unless the discrepancy persists
across two consecutive months. Reconciliation errors are common; sustained ones
are not.
${enforcement('the named manual arbiter')}`,

  'agentBond.0': `# Agent intent-execution bond

## Service level

- Intents executed within **10 blocks** of acceptance.
- Portfolio drawdown held under **5%** from the running high-water mark.
- Every executed intent is reported to the published log.

## What counts as a breach

Either threshold crossed, measured on the agent's own execution log
cross-checked against on-chain fills. The agent is identified by the committer
address on this commitment; no separate registry lookup is required.

## Claims

Anyone may open a bonded claim. An unchallenged claim finalizes on timeout with
no arbitrator step; a challenge requires a counter-bond, so stalling costs the
same as claiming.
${enforcement('the optimistic insurance arbiter')}`,

  'operator.0': `# Operator registration, safety service

## Acceptance policy

The registry accepts a registration only if the backing commitment is fully
forfeitable, arbitrated by the shared manual arbiter, and denominated in the
required token. That uniformity is the point: stake behind one operator is
comparable to stake behind any other.

## Obligations

Run the service as specified, publish the required attestations, and respond to
deregistration notices within the published window.

## Exit

Deregistration releases the stake on the standard unbonding notice. The arbiter
retains the right to act during that window; what it cannot do is block the
exit by refusing to act.
${enforcement('the named manual arbiter')}`,

  'operator.1': `# Operator registration, arbitration duty

Everything in the safety-service registration applies, plus panel duty.

## Panel duty

- Acknowledge a panel request within the published response window.
- Publish a reasoned ruling, or a recusal, before the window closes.

Silence is the failure mode this bond exists to price. A wrong ruling is
appealable; an absent one stalls the whole dispute.

## What counts as a breach

Repeated non-response, not a single missed request. The threshold is in the
registry's published policy.
${enforcement('the named manual arbiter, escalating to the panel')}`,

  'delegation.3': `# Delegation to a safety-service operator

## What the delegator is underwriting

The operator's conduct. Delegated stake carries the same forfeiture conditions
as the operator's own, which is what makes a delegation a commitment rather
than a vote of confidence.

## What the delegator receives

A share of the service revenue the operator earns, streamed for as long as the
delegation stands, plus whatever the underlying vault produces.

## Exit

The delegator may undelegate on the standard unbonding notice without the
operator's cooperation.
${enforcement('the named manual arbiter')}`,

  'mutual.nav': `# Vault NAV-drop mutual

## Covered event

The protected vault's net asset value per share falling below the floor
published on the mutual, measured at the oracle over the observation window.

## Loss allocation

Pro rata across capacity present when the loss is **declared**, not when it is
discovered. Members who joined after the declaration are not exposed to it;
members who left before it are.

## Lock-up

Capacity cannot be withdrawn while a claim window is open.
${enforcement('the optimistic mutual arbiter')}`,

  'mutual.depeg': `# Stablecoin de-peg mutual

## Covered event

The protected stablecoin trading outside its published tolerance band against
the reference price, **sustained across the observation window**.

A momentary wick is not a de-peg. That distinction is the whole design: a
mutual that pays on instantaneous prints is a mutual that pays on oracle noise.

## Loss allocation

Pro rata across capacity at declaration, senior layer after junior.
${enforcement('the optimistic mutual arbiter')}`,

  'mutual.slashing': `# Validator slashing mutual

## Covered event

Slashing penalties incurred by a member validator, excluding penalties from
deliberate double-signing.

## Concentration

Correlated slashing is the risk that matters. A client bug that hits many
members at once can exhaust the pool in a way independent faults cannot, so the
mutual publishes per-client and per-operator concentration limits. Read them
before sizing capacity.

## Loss allocation

Pro rata across capacity at declaration, subject to the per-event cap.
${enforcement('the optimistic mutual arbiter')}`,

  'optimisticCover.0': `# Smart-contract cover

## Covered event

Loss of funds caused by a documented exploit of the protected contract.
Governance actions, oracle failures outside the contract, and user error are
not covered.

## Claim process

1. The policyholder posts a claim with a bond.
2. Anyone may dispute within the challenge window, posting a counter-bond.
3. Undisputed, the claim finalizes on timeout with no arbitrator step.
4. Disputed, it escalates to the arbiter, and the losing bond pays the winner.

Bonds on both sides are what keep the optimistic path honest: claiming and
disputing both cost something.
${enforcement('the optimistic insurance arbiter')}`,

  'agreement.0': `# Reciprocal uptime pledge

## Structure

Two linked commitments under one arbiter. Neither side can release without the
other, and forfeiture on either runs through the same authority.

## Covered fault

Sustained unavailability of the service each party operates, measured against
the counterparty's published monitoring.

## Settlement caps

Per-direction lifetime caps bound how much can flow each way. A bad month for
one side cannot drain the other; the cap is the deliberate limit on how much
this agreement can ever cost.
${enforcement('the shared manual arbiter')}`,

  'agreement.weth': `# Cross-operator cvWETH treaty

## Structure

Two linked commitments, cvWETH on both sides, under one arbiter. The stake
keeps earning throughout; backing this treaty is not a sacrifice of yield.

## Covered fault

Liveness failure by either operator, assessed against the shared monitoring
endpoint named by both parties.

## On symmetry

The amounts here are equal, but they need not be. An asymmetric pair is itself
a signal about how each side prices the other's risk, readable on chain by
anyone.
${enforcement('the shared manual arbiter')}`,
}

for (const [key, terms] of Object.entries(TERMS)) {
  if (!CATALOGUE[key]) throw new Error(`terms document for unknown catalogue key: ${key}`)
  CATALOGUE[key].terms = terms
}

/** Every key, for the prepare step and for validation. */
export const CATALOGUE_KEYS = Object.freeze(Object.keys(CATALOGUE))
