---
title: Value display for share-denominated commitments
status: draft
---

# RFC: Value display for share-denominated commitments

Commitments are created and enforced in backing-token units, commonly ERC-4626
vault shares. Most people evaluate those commitments in a familiar quote unit:
USD, EUR, ETH, or the vault's underlying asset. Rendering only shares is
technically precise but makes position size, risk, and opportunity cost hard to
understand.

This RFC defines the product grammar for showing both facts without implying
that a market quote is part of the on-chain commitment.

The interactive comparison lives at `/app/design/value`.

## Decision

Use a **quote-first, shares-second** value stack:

1. Lead with an estimated value in the user's preferred display unit.
2. Keep the exact committed share amount immediately beneath it.
3. Label the valuation moment as **Current value** or **At commitment**.
4. Prefix every derived quote with `≈`.
5. Expose conversion and price provenance on detail and confirmation surfaces.
6. When a trustworthy quote is unavailable, promote exact shares to the
   headline instead of showing zero, a blank fiat amount, or an old quote as if
   it were current.

The primary number answers “What is this worth?” The secondary number answers
“What did the protocol commit?” Neither replaces the other.

## Why this direction

Three hierarchies were compared in the design exploration.

| Direction | Strength | Failure |
|---|---|---|
| Quote first, shares second | Fast to scan; signed unit remains visible | Requires disciplined estimate labels and fallback behavior |
| Shares first, quote second | Protocol fact has maximum emphasis | Preserves the comprehension problem reported by users |
| One unit at a time | Lowest visual density | Hides either economic meaning or the contractual amount behind a control |

Quote-first is the only direction that answers the user's first question while
keeping the enforceable quantity in the same glance.

## Display preference

There is one user preference:

- **Primary value unit:** USD, EUR, ETH, or Shares.

It is an application display preference, not a wallet or protocol setting. It
must be available before wallet connection and should initially persist in the
local browser. If the product later gains user profiles, optional cross-device
sync may mirror the local preference; wallet connection must not be required.

Use a compact control in persistent app chrome showing the current unit, such
as `USD ▾`. Do not add a dedicated Settings page for this single choice.

The following are product guarantees, not settings:

- exact shares remain visible on consequential surfaces;
- lists show current value rather than a configurable historical basis;
- details may add the value at commitment when reliable history exists;
- derived values carry `≈` and provenance;
- stale or missing prices automatically fall back to shares;
- rounding and price-source selection are consistent across the application.

## Surface rules

### Dense lists

Render the preferred quote as the first line and exact shares as the second
line. Use a column label such as **Value / committed**, not the ambiguous
**Amount**. Sorting on that column uses the displayed quote basis when every row
has a trustworthy comparable value. Rows without a quote sort after quoted rows
and retain deterministic secondary ordering.

Do not compare heterogeneous raw share amounts. Ten vault shares in one vault
are not necessarily larger than five shares in another.

### Commitment detail

Lead with **Current value** and exact committed shares. The expanded context may
show:

- value at commitment;
- percentage change since commitment;
- shares-to-underlying conversion rate;
- underlying asset amount;
- market-price source and freshness;
- the block or timestamp used for a historical valuation.

Value change is informational. It is not protocol P&L unless the product can
separate vault yield, asset-price movement, fees, deposits, withdrawals, and
forfeitures correctly.

### Create and confirmation flows

People may enter a familiar quote-unit value as a calculator convenience. Before
the wallet request, the interface must state the exact shares that will be
signed. The final confirmation uses language such as:

> You will commit exactly 8.4251 cvWETH shares. The displayed market value can
> change.

The quote does not become an on-chain guarantee. If a flow needs a minimum
economic value at execution time, that requires separate protocol or transaction
constraints and is outside this display RFC.

### Risk and forfeiture

Any penalty, maximum loss, or proposed forfeiture should use the same dual-unit
grammar. The estimated quote leads for comprehension, while the exact affected
shares remain visible before an irreversible action.

## Valuation model

For ERC-4626 backing, a current quote is conceptually:

```text
committed shares
  × current underlying assets per share
  × current price of the underlying in the preferred unit
  = estimated current value
```

The computation must preserve token-specific decimals and use integer math until
the presentation boundary. A vault-share token cannot be priced as if its symbol
were the underlying asset symbol; shares must first convert through the vault.

### Current value

Current value requires:

- the commitment's exact backing token and amount;
- share decimals and symbol;
- `convertToAssets(shares)` or an equivalent current conversion;
- underlying asset decimals and symbol;
- a fresh market price for the underlying;
- the selected quote-unit conversion when the preference is not USD.

The existing frontend already has token-aware ERC-4626 valuation in the
claimable-yield path and a USD price endpoint. Production work should generalize
that valuation rather than duplicate share math at render sites.

### Value at commitment

Historical value requires both values at the commitment block:

- the vault's shares-to-underlying conversion rate; and
- the underlying asset's price in the selected quote unit.

Do not reconstruct historical value from today's share rate or today's market
price. If either historical input is unavailable, omit the historical quote and
show the exact shares.

### EUR and ETH

The current price API is USD-shaped. Supporting EUR needs a trustworthy USD/EUR
rate with its own timestamp. Supporting ETH needs the underlying/USD and ETH/USD
quotes, unless a direct underlying/ETH market is deliberately selected. The
freshness of the composed value is the age of its oldest input.

## Freshness and failure states

The UI must distinguish:

- **Live:** every required input is within the accepted freshness window;
- **Stale:** a prior quote exists but is too old to present as current;
- **Unavailable:** at least one required conversion or price is missing;
- **Historical unavailable:** the current quote may still render, but the
  at-commitment comparison is omitted.

Stale values may remain inspectable in provenance details with their timestamp,
but they do not retain headline status. Never map unavailable pricing to `$0`,
`€0`, or `0 ETH`.

## Accessibility and formatting

- Full precision remains available through the canonical amount tooltip/title.
- Quote and share lines must not rely on color alone to communicate hierarchy.
- `≈` has an accessible label of “approximately.”
- Currency controls use radio-group semantics and expose the selected value.
- Fiat uses conventional fixed minor-unit precision in ordinary views; compact
  notation retains full precision in the tooltip.
- Exact shares use the backing token's real decimals and symbol rather than the
  generic word `shares` whenever metadata is available.

## Production architecture

The design exploration intentionally keeps its valuation examples local. A
production implementation should introduce shared behavior in this order:

1. A small display-preference provider/hook with local persistence.
2. A quote-unit amount primitive capable of USD, EUR, and ETH presentation.
3. A token-aware valuation hook that converts raw ERC-20 amounts directly and
   ERC-4626 shares through their underlying asset.
4. A protocol-aware value-stack composition that always pairs a quote with the
   exact commitment amount.
5. Migration of list, detail, creation, confirmation, penalty, and forfeiture
   surfaces.
6. Historical snapshot/indexer support before enabling **At commitment** in
   production.

The preference and generic quote renderer belong in the UI/application layer.
Share conversion and commitment terminology stay in hooks and protocol-aware
components; generic UI primitives must not import protocol code.

## Acceptance criteria

A production rollout is complete only when all of the following are true:

1. A user can select USD, EUR, ETH, or Shares before connecting a wallet, and
   the choice persists across reloads.
2. Commitment lists lead with comparable preferred-unit estimates and keep exact
   shares in every row.
3. Commitment details show current value, exact shares, and inspectable quote
   provenance.
4. Create and confirmation flows state the exact signed shares before the wallet
   request.
5. Penalty and forfeiture previews show both estimated economic impact and exact
   affected shares.
6. Missing or stale pricing promotes shares without showing a false zero.
7. Heterogeneous vault shares are never summed or sorted as though raw units were
   comparable.
8. **At commitment** is absent until block-correct share conversion and market
   history are both available.
9. Desktop and mobile surfaces preserve the same information hierarchy and
   remain keyboard accessible.
10. The design-system reference documents the shared quote and value-stack
    components once they graduate from exploration.

## Non-goals

- Changing the on-chain commitment unit from shares.
- Guaranteeing a fiat or ETH value at execution time.
- Choosing an oracle for protocol enforcement.
- Treating an estimated quote as accounting or tax cost basis.
- Building user profiles solely to synchronize this preference.

## Open product questions

- Whether USD should be the universal initial default or inferred from a broader
  explicit locale preference.
- Whether the chrome control should include the vault's underlying asset in
  addition to USD, EUR, ETH, and Shares.
- The freshness threshold appropriate for each asset class.
- Whether percentage change belongs in the default detail view or an expanded
  valuation disclosure.

These questions do not change the core hierarchy: familiar value first, exact
shares always present.
