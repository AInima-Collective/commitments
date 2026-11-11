/**
 * Design lab — the surface for choosing a visual direction against the real
 * app rather than a mockup.
 *
 * Three axes are live: palette, type stack, and brand mark. Picking any of
 * them writes to <html> and localStorage immediately (see
 * components/ui/labTheme.ts), so navigating away from this page carries the
 * selection into the dashboard, the vault, the landing page — everywhere.
 *
 * The preview panels below each carry their own [data-theme] / [data-palette]
 * / [data-type] attributes, so they render their candidate's real token values
 * regardless of what the surrounding page is currently set to. Nothing here
 * re-declares a colour.
 *
 * This page is scaffolding. When a direction is chosen, delete it along with
 * labTheme.ts and the losing blocks in tokens.css.
 */

import { PageHeader } from '../components/protocol'
import {
  BrandMark,
  Button,
  Card,
  Notice,
  StatBlock,
  ThemeToggle,
  useLabTheme,
  useTheme,
  type MarkId,
  type PaletteId,
  type TypeStackId,
} from '../components/ui'
import '../styles/lab.css'

const SPECIMEN_HEADLINE = 'An agreement that makes itself real'
const SPECIMEN_ITALIC =
  'Capital is posted, an arbiter is named, and the promise becomes a thing the chain can act on.'

/** Both themes, previewed side by side inside whichever theme is active. */
const THEMES = ['light', 'dark'] as const

export default function Lab() {
  const {
    palette,
    type,
    mark,
    setPalette,
    setTypeStack,
    setMark,
    palettes,
    typeStacks,
    markGroups,
  } = useLabTheme()
  const { theme } = useTheme()

  return (
    <div className="ds-page lab-page">
      <PageHeader
        eyebrow="lab"
        title="Design lab"
        lead="Three axes, live. Anything you pick here applies to the whole app immediately and survives a reload — leave this page and the dashboard, vault, and landing page all follow."
      />

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="lab-bar" role="group" aria-label="Design axes">
        <div className="lab-bar-group">
          <span className="lab-bar-label">Palette</span>
          <div className="lab-picker">
            {palettes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="lab-picker-option"
                aria-pressed={palette === p.id}
                onClick={() => setPalette(p.id as PaletteId)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-bar-group">
          <span className="lab-bar-label">Type</span>
          <div className="lab-picker">
            {typeStacks.map((t) => (
              <button
                key={t.id}
                type="button"
                className="lab-picker-option"
                aria-pressed={type === t.id}
                onClick={() => setTypeStack(t.id as TypeStackId)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-bar-group lab-bar-spacer">
          <span className="lab-bar-label">Theme</span>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Palette ──────────────────────────────────────────────────────── */}
      <section className="lab-section" aria-labelledby="lab-palette">
        <div className="lab-section-head">
          <h2 id="lab-palette">Palette</h2>
          <p className="lab-section-note">
            All four are grayscale. They differ only in the temperature and contrast of the neutral
            ramp — there is no brand hue in any of them.
          </p>
          <p className="ds-subtle ds-text-sm">
            The three chips under each ramp are the only colour left in the system: success, warn,
            error. They are shown at roughly the size they actually appear, because that is the
            size at which they have to survive. Each card renders both themes at once.
          </p>
        </div>

        <div className="lab-grid lab-grid--wide">
          {palettes.map((p) => (
            <button
              key={p.id}
              type="button"
              className="lab-option"
              aria-pressed={palette === p.id}
              onClick={() => setPalette(p.id as PaletteId)}
            >
              <span className="lab-option-head">
                <span className="lab-option-name">{p.label}</span>
                {palette === p.id ? <span className="lab-option-flag">Active</span> : null}
              </span>

              <span className="lab-palette-split">
                {THEMES.map((t) => (
                  <span key={t} className="lab-palette-half" data-theme={t} data-palette={p.id}>
                    <span className="lab-theme-tag">{t}</span>
                    <span className="lab-ramp" aria-hidden="true">
                      <span className="lab-ramp-step lab-ramp-step--bg" />
                      <span className="lab-ramp-step lab-ramp-step--surface" />
                      <span className="lab-ramp-step lab-ramp-step--surface-2" />
                      <span className="lab-ramp-step lab-ramp-step--surface-3" />
                      <span className="lab-ramp-step lab-ramp-step--border" />
                      <span className="lab-ramp-step lab-ramp-step--muted" />
                      <span className="lab-ramp-step lab-ramp-step--text" />
                    </span>
                    <span className="lab-semantics" aria-hidden="true">
                      <span className="lab-semantic-chip lab-semantic-chip--success" />
                      <span className="lab-semantic-chip lab-semantic-chip--warn" />
                      <span className="lab-semantic-chip lab-semantic-chip--error" />
                    </span>
                    <span className="lab-mini">
                      <span className="lab-mini-btn">Commit</span>
                      <span className="lab-mini-btn lab-mini-btn--ghost">Release</span>
                      <span className="lab-mini-text">1,240.0000</span>
                    </span>
                  </span>
                ))}
              </span>

              <span className="lab-option-note">{p.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Type ─────────────────────────────────────────────────────────── */}
      <section className="lab-section" aria-labelledby="lab-type">
        <div className="lab-section-head">
          <h2 id="lab-type">Type</h2>
          <p className="lab-section-note">
            Mono keeps the data, the labels, and the controls. The serif carries the voice —
            headings, hero copy, and the italic asides.
          </p>
          <p className="ds-subtle ds-text-sm">
            Each specimen is rendered in its own stack at true size, including the mono it ships
            with. The size compensation per family is already applied, so what you are comparing is
            character rather than scale. &ldquo;Mono (control)&rdquo; is the current app, for reference.
          </p>
        </div>

        <div className="lab-grid lab-grid--wide">
          {typeStacks.map((t) => (
            <button
              key={t.id}
              type="button"
              className="lab-option"
              aria-pressed={type === t.id}
              onClick={() => setTypeStack(t.id as TypeStackId)}
            >
              <span className="lab-option-head">
                <span className="lab-option-name">{t.label}</span>
                {type === t.id ? <span className="lab-option-flag">Active</span> : null}
              </span>

              <span className="lab-specimen" data-type={t.id}>
                <span className="lab-specimen-display">{SPECIMEN_HEADLINE}</span>
                <span className="lab-specimen-italic">{SPECIMEN_ITALIC}</span>
                <span className="lab-specimen-data">
                  <span className="lab-specimen-field">
                    <span className="lab-specimen-term">Encumbered</span>
                    <span className="lab-specimen-value">1,240.0000 WETH</span>
                  </span>
                  <span className="lab-specimen-field">
                    <span className="lab-specimen-term">Free</span>
                    <span className="lab-specimen-value">310.5521 WETH</span>
                  </span>
                  <span className="lab-specimen-field">
                    <span className="lab-specimen-term">Arbiter</span>
                    <span className="lab-specimen-value">0x71C7…976F</span>
                  </span>
                </span>
                <span className="lab-specimen-meta">Mono: {t.mono}</span>
              </span>

              <span className="lab-option-note">{t.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Marks ────────────────────────────────────────────────────────── */}
      <section className="lab-section" aria-labelledby="lab-marks">
        <div className="lab-section-head">
          <h2 id="lab-marks">Mark</h2>
          <p className="lab-section-note">
            Twelve candidates across three directions. None of them use colour — the palette has no
            hue left to spend on a logo, so every one is ink on paper.
          </p>
          <p className="ds-subtle ds-text-sm">
            Judge these at 12px first. That is the topnav size, and it is where most of these die.
            The lockup strip at the bottom shows each one in the actual nav context.
          </p>
        </div>

        {markGroups.map((group) => (
          <div key={group.id} className="ds-stack ds-stack-4">
            <div className="ds-stack ds-stack-1">
              <h3>{group.label}</h3>
              <p className="ds-subtle ds-text-sm">{group.note}</p>
            </div>
            <div className="lab-grid lab-grid--marks">
              {group.marks.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="lab-option lab-mark"
                  aria-pressed={mark === m.id}
                  onClick={() => setMark(m.id as MarkId)}
                >
                  <span className="lab-option-head">
                    <span className="lab-option-name">{m.label}</span>
                    {mark === m.id ? <span className="lab-option-flag">Active</span> : null}
                  </span>

                  <span className="lab-mark-stage">
                    <BrandMark size="xl" mark={m.id as MarkId} />
                  </span>

                  <span className="lab-mark-scale">
                    {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
                      <span key={size} className="lab-mark-scale-item">
                        <BrandMark size={size} mark={m.id as MarkId} />
                        <span className="lab-mark-scale-label">
                          {{ xs: 12, sm: 16, md: 24, lg: 48 }[size]}
                        </span>
                      </span>
                    ))}
                  </span>

                  <span className="lab-option-note">{m.note}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="ds-stack ds-stack-3">
          <h3>In the nav lockup</h3>
          <p className="ds-subtle ds-text-sm">
            Real size, real weight, real spacing. This is the comparison that decides it.
          </p>
          <div className="lab-lockups">
            {markGroups.flatMap((g) => [...g.marks]).map((m) => (
              <button
                key={m.id}
                type="button"
                className="lab-lockup"
                aria-pressed={mark === m.id}
                onClick={() => setMark(m.id as MarkId)}
              >
                <BrandMark mark={m.id as MarkId} />
                <span>commitments</span>
                <span className="lab-lockup-id">{m.id}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Applied ──────────────────────────────────────────────────────── */}
      <section className="lab-section" aria-labelledby="lab-applied">
        <div className="lab-section-head">
          <h2 id="lab-applied">In situ</h2>
          <p className="lab-section-note">
            A slice of the real app under the current selection. The panel on the left is in the
            opposite theme, so both are visible without toggling.
          </p>
        </div>

        <div className="lab-applied-split">
          {THEMES.map((t) => (
            <div key={t} className="lab-applied" data-theme={t} data-palette={palette}>
              <div className="ds-stack ds-stack-2">
                <span className="ds-page-eyebrow">{t} · {palette} · {type}</span>
                <h2 className="ds-page-title">Commitment #4172</h2>
                <p className="ds-page-lead">
                  Backed by 1,240.0000 WETH of vault shares. Arbitrated by Aegis Council.
                </p>
              </div>

              <div className="ds-stat-grid" data-cols="3">
                <StatBlock label="Encumbered" value="1,240.0000" meta="WETH" />
                <StatBlock label="Free" value="310.5521" meta="WETH" />
                <StatBlock label="Forfeitable" value="620.0000" meta="WETH" tone="danger" />
              </div>

              <Notice tone="warn" title="Forfeit proposed">
                The forfeit execution delay has at least 19h 44m remaining. This timer does not
                itself give either party a generic on-chain contest action.
              </Notice>

              <div className="lab-applied-row">
                <Button variant="primary" size="sm">Release</Button>
                <Button size="sm">Contest</Button>
                <Button variant="destructive" size="sm">Forfeit</Button>
                <span className="ds-badge ds-badge--success">Active</span>
                <span className="ds-badge ds-badge--warn">Pending</span>
                <span className="ds-badge ds-badge--muted">Released</span>
              </div>

              <Card density="compact">
                <div className="ds-stack ds-stack-2">
                  <h3>Backing</h3>
                  <p className="ds-muted ds-text-sm">
                    Vault shares stay productive while encumbered. Yield accrues to the committer
                    until the arbiter rules.
                  </p>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <p className="ds-subtle ds-text-sm">
          Current selection: <strong>{palette}</strong> palette · <strong>{type}</strong> type ·{' '}
          <strong>{mark}</strong> mark · <strong>{theme}</strong> theme. Stored in localStorage
          under <code className="ds-doc-inline-code">commitments.palette</code> /{' '}
          <code className="ds-doc-inline-code">commitments.type</code> /{' '}
          <code className="ds-doc-inline-code">commitments.mark</code>.
        </p>
      </section>
    </div>
  )
}
