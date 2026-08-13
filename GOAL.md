# Goal: Ship trustworthy familiar-value display

**Status:** Ready for implementation

**Product source of truth:** [`docs/design/rfcs/value-display.md`](docs/design/rfcs/value-display.md)

**Design reference:** `/app/design/value`

## Finish line

Ship one production value-display system that lets a person understand the
current economic size of a commitment in USD, EUR, or ETH while keeping the
exact on-chain backing amount visible wherever it can affect a decision or a
transaction.

The rollout is complete when the value hierarchy is consistent across the app,
the display preference works without a wallet, and stale, missing, unknown, or
development-only pricing can never masquerade as a current market value.

## Product decisions locked for this goal

These decisions close the RFC's open questions for the first production
release. Do not reopen them during implementation unless a correctness blocker
is found.

- The default display unit is **USD**. Do not infer it from browser locale yet.
- The choices are **USD, EUR, ETH, and Shares**. Do not add each vault's
  underlying asset to the selector in this release.
- This is one browser-local application preference, stored under
  `commitments.display-unit`. It works before wallet connection and survives a
  reload. Wallet address and chain changes do not change it.
- Put the compact selector in persistent app chrome. Do not create a Settings
  page for one choice.
- USD, EUR, and ETH lead with an approximate current quote. The exact committed
  amount sits directly beneath or beside it in the same visual group.
- `Shares` means “show the exact backing units first.” A raw ERC-20 commitment
  must render its real token symbol (for example, `USDC`), not falsely call the
  amount shares.
- Exact backing units remain authoritative. Every derived market quote carries
  an accessible “approximately” marker and can never change transaction
  arguments.
- Users continue entering exact backing units in this goal. Show a live quote
  beside the field, but do not add quote-denominated input or promise a fixed
  quote at execution time.
- Add a review step before every wallet request that creates, proposes, accepts,
  or delegates a commitment. It must state the exact units that will be signed.
- In a transaction review, “exact” means the complete canonical token amount:
  no compact notation and no hidden/truncated significant digits. A tooltip is
  not sufficient for the number the wallet will sign.
- A quote is **live** for five minutes from its oldest required input. After
  that, it is stale and loses headline status.
- Historical **At commitment** value and percentage change do not ship in this
  goal. They remain absent until both block-correct vault conversion and market
  history exist.
- Static development prices are fixtures, not live market data. They may be
  enabled explicitly in local development, must be visibly identified as demo
  data, and must never be an automatic production fallback.

## User-visible grammar

### Live quote

```text
Current value
≈ $28,788.37
8.4251 cvWETH committed
```

### Shares preference

```text
Committed
8.4251 cvWETH
Exact on-chain amount
```

### Stale or unavailable quote

```text
Committed
8.4251 cvWETH
Current market value unavailable
```

Loading reserves the quote line but renders the exact amount immediately. A
failed or stale request promotes the exact amount; it never renders `$0`, `€0`,
`0 ETH`, a blank headline, or a fixture as if it were live.

Use **Value / committed** for list columns. Use **Current value** on details and
reviews. Use **Estimated impact** for a proposed penalty or forfeiture. Avoid
the ambiguous standalone label **Amount** where both economic value and exact
units are being presented.

## Core semantic contract

Production code should converge on one shared vocabulary. Exact type and file
names may change, but the states and information below must not be collapsed.

```ts
type DisplayUnit = 'usd' | 'eur' | 'eth' | 'shares'
type QuoteUnit = Exclude<DisplayUnit, 'shares'>

type QuoteValue = {
  amount: bigint
  decimals: number
  unit: QuoteUnit
  source: string
  updatedAt: number
  inputs: QuoteInputProvenance[]
}

type QuoteState =
  | ({ kind: 'live' } & QuoteValue)
  | {
      kind: 'stale'
      previous: QuoteValue
      staleSince: number
    }
  | { kind: 'demo'; value: QuoteValue }
  | { kind: 'unavailable'; reason: QuoteUnavailableReason }
  | { kind: 'loading' }
```

The distinction between zero, loading, stale, and unavailable is mandatory.
Do not use `null` to mean all four states. JSON transports fixed-point amounts
as base-10 strings plus explicit decimals; valuation math uses `bigint` after
ingress.

A quote's provenance must be sufficient to inspect:

- the exact backing token and amount;
- whether it is a direct ERC-20 or an ERC-4626 share;
- the underlying asset and amount for a share;
- the shares-to-assets conversion and its read block when available;
- each market or FX input, source, and timestamp; and
- the oldest input that determined freshness.

Market identity must not be established by an arbitrary token's self-reported
symbol. Authorize a symbol/provider mapping through a chain-and-address-aware
asset registry or another explicit trusted configuration. An unknown token
named `USDC` must remain unpriced.

The Shares preference does not make heterogeneous units additive. On a
multi-token aggregate, show an exact per-token/vault breakdown. A single exact
headline is allowed only when every included amount has the same backing-token
address; otherwise do not manufacture a “total shares” number.

## Implementation plan

Complete these phases in order. Do not migrate production surfaces onto a
partially trustworthy price contract.

### Phase 1 — Make the quote feed honest and multi-unit

Starting points:

- `indexer/src/api/prices.ts`
- a new focused price-contract test next to the endpoint
- `frontend/src/hooks/useAssetPrices.ts`
- `frontend/src/lib/claimableYield.ts`

Deliverables:

- [ ] Replace the USD-only, symbol-authoritative response with a versioned
      current-quote contract that can return USD, EUR, and ETH for explicitly
      recognized assets.
- [ ] Return fixed-point decimal strings, decimals, source, and `updatedAt` for
      every quote input. Keep provider-specific parsing inside the indexer.
- [ ] If EUR or ETH is composed from multiple inputs, preserve every component
      in provenance and use the oldest component timestamp for freshness.
- [ ] On provider failure, retain the last successful quote with its original
      timestamp so it naturally becomes stale. Do not replace it with a newly
      timestamped static value.
- [ ] With no prior successful quote, return unavailable. Unknown or
      unauthorized asset addresses are also unavailable.
- [ ] Gate deterministic fixture quotes behind explicit development
      configuration and mark them `fixture`/`demo`; production configuration
      fails closed.
- [ ] Replace `getPrice()`'s current “stale means undefined” behavior with an
      API that exposes live, stale, unavailable, and loading states to callers.
- [ ] Keep requests batched and query keys stable by normalized asset identity
      and quote-unit set.
- [ ] Preserve a temporary compatibility adapter only while existing USD
      consumers are being migrated; remove it before this goal is closed.

Phase gate: endpoint tests cover successful multi-unit quotes, partial provider
payloads, timeout/error with and without a previous value, stale timestamps,
fixture gating, an unknown asset, and a symbol-collision asset.

### Phase 2 — Add the preference and generic quote renderer

Starting points:

- `frontend/src/main.tsx`
- `frontend/src/components/shell/TopBar.tsx`
- `frontend/src/components/ui/UsdAmount.tsx`
- `frontend/src/components/ui/TokenAmount.tsx`
- `frontend/src/components/ui/index.ts`
- `frontend/src/styles/tokens.css`

Deliverables:

- [ ] Add a small `ValueDisplayProvider`/hook at application scope. Validate
      stored input, tolerate denied storage, default to USD, and synchronize a
      change across open tabs when storage events are available.
- [ ] Add a compact TopBar control that is present while disconnected and at
      mobile widths. Use menu/radio-group semantics, expose the selected value,
      support keyboard navigation and Escape, and restore focus on close.
- [ ] Add a generic `QuoteAmount` UI primitive for USD, EUR, and ETH. It knows
      formatting, not tokens, vaults, commitments, or pricing.
- [ ] Keep `UsdAmount` as a thin compatibility wrapper only if useful; all new
      production behavior goes through the multi-unit primitive.
- [ ] Render fiat with conventional two-decimal display precision and ETH with
      useful significant precision. Keep the full value in the canonical
      tooltip/title.
- [ ] A positive quote smaller than the visible precision renders as
      `<$0.01`, `<€0.01`, or the ETH equivalent rather than zero.
- [ ] Give `≈` an accessible label of “approximately.” Do not rely on color to
      distinguish estimates from exact units.
- [ ] Document the primitive in `/app/design` with live, zero, small-positive,
      stale, unavailable, compact, and display-size examples.

Layer rule: preference state and `QuoteAmount` may live in the UI/application
layer. They must not import commitment or vault code.

### Phase 3 — Generalize token-aware valuation

Starting points:

- `frontend/src/hooks/useClaimableUsd.ts`
- `frontend/src/lib/claimableYield.ts`
- `frontend/src/hooks/useTokenMeta.ts`
- `frontend/src/config/contracts.ts`

Deliverables:

- [ ] Extract the claimable-yield-specific valuation into a general pure math
      module plus a batched hook/resolver usable by commitments, portfolios,
      services, and claimable yield.
- [ ] For a direct ERC-20, price the exact raw amount using its real decimals
      and an explicitly recognized asset identity.
- [ ] For an ERC-4626 share, resolve the vault asset and current
      shares-to-assets conversion before pricing the underlying. Never price a
      vault share by looking up its share symbol.
- [ ] Deduplicate metadata, `asset()`, and conversion-rate reads per distinct
      token/vault. Do not add per-row network requests to a list.
- [ ] Preserve integer/fixed-point math through multiplication, division,
      quote conversion, aggregation, and sorting. JavaScript `number` is not a
      valuation intermediate.
- [ ] Return the full quote state and provenance, not only a number or `null`.
- [ ] Provide pure helpers for quote comparison and aggregation. A total is
      unavailable if any included value is unavailable unless the UI explicitly
      labels it as a partial priced subtotal.
- [ ] Permit raw-unit aggregation and sorting only when every item has the same
      backing token identity. Equal symbols are insufficient.
- [ ] Make current conversion/quote reads refresh without blocking exact amount
      rendering or wallet-independent page use.

Phase gate: pure tests cover direct tokens and shares across 6, 15, 18, and 27
decimals; rates above and below one; floor rounding; tiny non-zero values; USD,
EUR, and ETH; oldest-input freshness; missing conversion; missing price;
heterogeneous aggregation; and actual zero distinct from unavailable.

### Phase 4 — Build the protocol value stack and migrate read surfaces

Add one protocol-aware composition, provisionally `CommitmentValue`, that pairs
`QuoteAmount` with the canonical `TokenAmount`. It owns the RFC hierarchy,
labels, fallback, and provenance affordance; feature components should not
reimplement those rules.

| Surface | Required result | Main starting points |
|---|---|---|
| Shared commitment lists | Preferred current quote first, exact units second, `Value / committed` header | `components/commitment/commitmentCells.tsx`, `CommitmentsTable.tsx` |
| Protocol explorer list | Same value stack and safe sorting as shared lists | `components/explorer/EntityBrowser.tsx` |
| Commitment detail | Current value hero, exact units, inspectable conversion/source/freshness | `pages/CommitmentDetail.tsx`, `CommitmentDetailContent.tsx` |
| Arbiter queue | Economic value and exact stake remain visible beside the resolve action | `components/arbiter/ArbiterQueue.tsx` |
| Operator delegation summary | Preferred value plus exact delegated units | `components/mesh/OperatorDetail.tsx` |
| Agreement proposals | Both legs use the shared hierarchy from each viewer's perspective | `components/agreement/ProposalCard.tsx`, `AgreementProposalDrawer.tsx` |
| Existing quote-native summaries | Follow USD/EUR/ETH preference without hiding their canonical token facts | `PortfolioHero`, `ClaimableYieldPanel`, service/vault summaries, portfolio/commitment graphs |

Sorting rules:

- In USD, EUR, or ETH mode, compare live displayed quotes. Unpriced/stale rows
  follow live rows in both directions, with commitment identity as a stable
  tiebreaker.
- In Shares mode, raw sorting is available only when every visible row has the
  same backing-token address. Otherwise disable that sort with an explanation.
- Never compare ten shares from one vault with five shares from another.
- Existing urgency/default sorting remains unchanged until the person selects
  the value column.

When Shares is selected on a heterogeneous portfolio, service, graph, or other
aggregate, replace the quote total with the exact per-token breakdown already
used to derive it. Do not retain a USD headline under a Shares preference and do
not sum differently denominated raw units.

Detail provenance is inspectable but secondary. It includes the current
shares-to-underlying conversion, underlying amount, quote source, and freshness.
Do not add an `At commitment` row, historical estimate, or change percentage.

### Phase 5 — Migrate creation, acceptance, and risk decisions

Every transaction-capable surface must show exact arguments before invoking a
wallet. Prefer a shared review composition rather than bespoke confirmation
copy.

| Flow | Required result | Main starting points |
|---|---|---|
| Custom/direct commitment | Live estimate near exact-unit input; `Review commitment` before `flow.submit` | `commitment/modes/DelegateMode.tsx` |
| Marketplace commitment | Same treatment for editable amount, offer range, funding shortfall, and final review | `commitment/modes/OfferMode.tsx` |
| Operator delegation | Estimate near input and exact reviewed delegation before approval/create | `mesh/DelegateToOperatorForm.tsx` |
| Agreement proposal | Both legs valued in the existing review step; exact proposed units remain explicit | `agreement/ProposeAgreementForm.tsx`, `OfferProposeMode.tsx` |
| Agreement acceptance | Viewer sees the quote and exact amount their wallet will encumber immediately before accept | `agreement/ProposalCard.tsx`, `AgreementProposalDrawer.tsx` |
| Resolve and forfeit | Current stake and proposed impact lead with quote and retain exact affected units | `commitment/ResolveCommitmentModal.tsx`, `actions/ResolveActionRow.tsx` |
| Arbitration and history | Units at risk/executed use the same dual grammar where a current estimate is meaningful | `arbiter/ArbitrationPanel.tsx`, `commitment/ForfeitDetail.tsx`, `vault/ForfeitLedgerTab.tsx` |

The final create review includes this semantic statement, adapted to the real
token:

> You will commit exactly 8.4251 cvWETH. Its displayed market value is an
> estimate and can change.

Requirements:

- [ ] The review UI is app-controlled and appears before the first wallet
      request, including an ERC-20 approval request.
- [ ] The reviewed exact commitment and wallet funding/approval amounts render
      their complete canonical decimal values without compacting or truncating
      significant digits.
- [ ] Changing form input invalidates/closes an old review; the confirmed raw
      amount is the amount passed to the write call.
- [ ] A missing quote never blocks a valid exact-unit transaction. The review
      promotes exact units and explains that current market value is unavailable.
- [ ] Maximum penalty and selected penalty show both estimated economic impact
      and exact affected units. Use the exact integer BPS calculation already
      used for the transaction.
- [ ] Funding/free-balance messages retain exact units; quotes may supplement
      them but never replace the balance needed for execution.
- [ ] Success toasts retain the exact units even when they also show a preferred
      quote.

### Phase 6 — Complete the preference boundary and graduate the exploration

- [ ] Audit production uses of `UsdAmount`, `USD`, dollar formatting, and
      symbol-based `getPrice`. A market-derived quote follows the selected
      USD/EUR/ETH unit; a genuinely USD-denominated protocol fact stays USD and
      is documented as such.
- [ ] Keep exact token-denominated inputs and balances exact. The display
      preference changes quote presentation, not protocol units.
- [ ] Update graph labels, tooltips, legends, and empty/error copy so changing
      the unit cannot leave a dollar label on EUR/ETH data.
- [ ] Replace the exploration page's local quote/value-stack implementations
      with the graduated shared components where possible. Keep only its
      deterministic example data and comparison framing.
- [ ] Add the protocol value stack and review pattern to `/app/design` and the
      relevant design recipe page.
- [ ] Update the RFC status from `draft` to `accepted` only after every
      production acceptance criterion below passes.
- [ ] Record historical-value work as a follow-on; do not add placeholder
      production UI that implies the data exists.

## Production acceptance criteria

This goal is done only when all statements are observable in the running app.

1. A disconnected person can select USD, EUR, ETH, or Shares in app chrome;
   the selection persists after reload and is unchanged by wallet/chain changes.
2. Every production commitment list shows a preferred current estimate plus the
   exact backing amount, or promotes the exact amount when pricing is not live.
3. The detail page shows current value, exact backing amount, and inspectable
   conversion/price provenance without showing historical value.
4. Create, offer, delegate, propose, and accept flows show the exact raw units
   in an app review before any wallet approval or transaction request.
5. Penalty and forfeiture previews show both the preferred-unit impact and exact
   affected backing units before an irreversible action.
6. Stale, missing, unknown, offline, and fixture-only prices never appear as a
   live headline and never become a false zero.
7. Raw heterogeneous backing amounts are never summed or sorted as comparable.
8. USD, EUR, and ETH values are computed from the same token-aware valuation
   path, with fixed-point math and oldest-input freshness.
9. Desktop and mobile retain the same hierarchy; the selector, provenance, and
   review flows are usable with keyboard alone and expose meaningful names to a
   screen reader.
10. Existing production quote summaries and graphs follow USD/EUR/ETH; in
    Shares mode, heterogeneous totals become exact per-token breakdowns. A
    surface stays USD only when it is explicitly a true USD protocol
    denomination rather than a market-derived quote.
11. The design system documents `QuoteAmount`, the commitment value stack, and
    the transaction-review pattern; feature surfaces import them instead of
    maintaining local copies.
12. `At commitment` and percentage-change UI are absent from production, and
    no current rate or current market price is presented as historical data.

## Automated verification

Add focused tests as part of each phase, then run the full workspace checks:

```sh
pnpm --filter @commitments/indexer test
pnpm --filter @commitments/frontend test
pnpm typecheck
pnpm lint
pnpm --filter @commitments/frontend lint:css
pnpm build
```

Required frontend coverage includes:

- storage default, valid/invalid persisted values, denied storage, and unit
  switching before wallet connection;
- quote formatting for all three quote units, small non-zero values, true zero,
  compact values, full-precision tooltip, and accessible approximation text;
- live/loading/stale/unavailable/fixture states of the value stack;
- direct-token and ERC-4626 valuation with mocked contract reads;
- list sorting with mixed vaults and unpriced rows;
- exact-unit visibility in detail, review, agreement acceptance, and forfeit
  impact, including full canonical precision in transaction reviews; and
- a write-flow assertion that no approval/write mock is invoked before the
  exact-unit review is confirmed.

## Browser QA matrix

Exercise at least one raw ERC-20 commitment and two vault-share commitments with
different decimals/underlyings.

| Dimension | Cases |
|---|---|
| Unit | USD, EUR, ETH, Shares |
| Quote state | live, initial loading, stale last-known, cold unavailable, explicit dev fixture |
| Viewport | desktop around 1440 px, mobile around 390 px |
| Flow | list, detail/provenance, create review, agreement accept, forfeit impact |
| Input | mouse, keyboard only |

For each quote unit, verify that changing the selector updates every visible
market-derived value and its label without changing any exact amount. Simulate
provider loss after a successful response and on a cold start. Verify there is
no horizontal overflow, no quote/exact line collision, no focus loss, no
console error, and no wallet requirement for the preference.

## Performance and trust guardrails

- Exact amounts render even when metadata, conversion, or price requests fail.
- One page batches one quote request per normalized asset set and one conversion
  read group per distinct vault; list size must not create per-row fetches.
- Market values are informational UI only. Do not change contracts, commitment
  arguments, adapter enforcement, or wallet simulation based on a display quote.
- Never infer a provider asset from a token symbol alone.
- Never refresh the timestamp of a cached quote unless its market input was
  actually refreshed.
- Never silently display a partial aggregate as a complete portfolio or
  commitment total.
- Preserve the repository's UI → protocol → feature import boundaries and add
  new components to the correct public barrels.

## Explicit non-goals

- Historical market-price or vault-rate storage.
- “At commitment,” cost basis, P&L, or percentage-change display.
- Quote-denominated transaction input.
- A protocol oracle, fiat guarantee, slippage guard, or minimum economic value
  enforced at execution.
- User accounts or cross-device preference sync.
- Locale-derived default currency or more quote units.
- Replacing exact token balances, deposit/withdraw inputs, or contract-native
  accounting with fiat values.
