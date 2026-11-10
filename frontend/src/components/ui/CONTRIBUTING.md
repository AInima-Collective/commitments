# components/ui — Contributor contract

These six rules are the public contract of the design system primitive layer.
Every primitive in `components/ui/` follows them. Every PR adding or changing
a primitive is reviewed against them. Rules are documented here so contributors
can ship without re-deriving the spec.

## 1. Composition over configuration

Rule: primitives compose; they do not embed feature knowledge. A primitive
should be reusable by `components/protocol/` and any feature folder without
modification. If you find yourself adding `commitmentId`, `operatorAddress`,
`vaultId`, or any other domain identifier as a prop to a `components/ui/`
primitive, the component belongs in `components/protocol/` instead.

The shared shape across announcement-style surfaces (`Notice`, `Toast`,
banner-style errors) is a five-slot vocabulary: `icon`, `title`, `children`
(message body), `actions`, plus the semantic `tone`. New surfaces follow
that same shape so callers don't have to relearn the API per primitive.

```tsx
// GOOD — Notice is a generic surface; the page wraps it with domain content.
<Notice tone="warn" title="Withdrawal pending" actions={<Button>View</Button>}>
  Your unbonding period is 7 days.
</Notice>

// BAD — encodes commitment knowledge into a primitive.
<Notice commitmentId={id} operatorAddress={addr} />
```

## 2. `size` and `tone` vocabulary

Rule: the scale prop is `size`, not `variant`. Allowed values:
`xs | sm | md | lg | xl` (or the named-scale equivalents already used by
`TokenAmount`: `inline | default | display`). The semantic prop is `tone`.
Allowed values: `neutral | info | success | warn | danger`, plus two extras:
`accent` on primitives that colour a value, series or segment (`StatBlock`,
`VaultHeader`, `YieldSparkline`, `TimeSeriesChart`, `AllocationBar`), and
`muted` on the last two. No bespoke names —
`small`, `large`, `huge`, `error`, `positive`, `negative`, `important`,
`critical` are forbidden. A data state such as stale or unavailable is not a
tone.

Both props are forwarded to `data-size` and `data-tone` attributes on the
root element so styling is attribute-driven CSS, not prop-mapped class soup.

```tsx
<TokenAmount size="default" amount={amount} decimals={18} />
<Notice tone="danger" title="Slash window open" />
<StatBlock label="Total stake" value={total} />
<Notice tone="success" icon={<CheckIcon />}>Deposit confirmed.</Notice>
```

## 3. `as` prop for polymorphism

Rule: primitives that can semantically be a different element accept `as` to
re-target the root tag while preserving styles, refs, and accessibility. The
default is the most accessible tag for the primary use case; `as` is opt-in
when the surrounding markup demands a different element. Forwarded refs work
through `as` — `as="a"` still gets a typed anchor ref.

```tsx
// AddressDisplay defaults to <span>; render as <a> when it links out.
<AddressDisplay as="a" href={`/explorer/${addr}`} address={addr} />

// StatBlock renders as <li> inside a stat list.
<ul className="stat-list">
  <StatBlock as="li" label="Stake" value={amount} />
  <StatBlock as="li" label="Yield" value={yieldAmount} />
</ul>
```

## 4. Full-precision `title`

Rule: any visible value that is truncated, rounded, or compacted MUST surface
the canonical full value via the `title` attribute on the truncated element.
This is non-negotiable — it is how every dashboard avoids hiding precision
from operators. `formatTokenAmount` returns `full` exactly so this attribute
is always available; never throw it away.

This is not just for token amounts. Truncated addresses, compacted durations,
and formatted percentages all carry `title` on whatever element renders them.

```tsx
// formatTokenAmount returns `full` so the title always carries 18 decimals.
const parts = formatTokenAmount(amount, 18)
<span title={`${parts.full} ${symbol}`}>
  {parts.int}
  {parts.fraction && <span>{parts.fraction}</span>}
</span>

// Truncated addresses always carry the full hex in title.
<AddressDisplay address={addr} title={addr} />
```

## 5. Controlled and uncontrolled pairs

Rule: every interactive primitive supports BOTH a controlled API
(`value` + `onChange`, or `open` + `onOpenChange`) AND an uncontrolled API
(`defaultValue` or `defaultOpen`). The pattern matches Radix conventions even
though we do not depend on Radix. If a primitive cannot reasonably support
both, document why in its TSX file's JSDoc.

This split is what lets pages own state without being forced into it. Quick
prototypes use the uncontrolled API; production callers that need to react
to state use the controlled one.

```tsx
// Controlled — the page owns `open` state.
const [open, setOpen] = useState(false)
<Drawer open={open} onOpenChange={setOpen}>...</Drawer>

// Uncontrolled — the primitive manages its own state.
<Drawer defaultOpen={false}>...</Drawer>
```

## 6. No imperative hook APIs

Rule: hooks return state shapes and dispatchers, never imperative handles.
There is no `useDialog().open()`, no `toast.success(...)` global emitter, no
`ref.current.show()`. Pages own state; primitives expose render-prop or
controlled-state APIs only. This rule keeps SSR safe, keeps lifecycles
observable, and keeps tests deterministic.

If a primitive seems to demand an imperative API, the right answer is almost
always "expose the state shape, let the caller render the children". See
how `useToasts` exposes a list rather than a fire-and-forget emitter.

```tsx
// GOOD — useToasts returns the list plus dispatchers. ToastProvider renders
// the list, so a page only pushes.
const { push } = useToasts()
return (
  <Button onClick={() => push({ tone: 'success', title: 'Saved.' })}>
    Save
  </Button>
)

// BAD — imperative emitter; pages can't observe lifecycle, can't SSR.
toast.success('Saved.')
```

---

These rules are enforced by:

- `eslint.config.js` — layering (`ui → protocol → feature`), no `formatUnits`
  in feature folders, no hex literals outside `tokens.css`
- Code review — rules 1, 2, 3, 4, 5, 6 (no automated check yet for the
  composition shape; rely on reviewers)

When in doubt: if the rule isn't here, it isn't a rule. Add a section in a
follow-up PR rather than enforcing tribal knowledge through review comments.
