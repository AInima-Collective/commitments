import { useEffect, useState } from 'react'
import {
  BrandMark,
  GitHubMark,
  MARKS,
  SocialLink,
  SourceBlock,
  XMark,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

const COLOR_TOKENS: Array<{ name: string; cssVar: string; note?: string }> = [
  { name: 'bg', cssVar: '--bg', note: 'page' },
  { name: 'surface', cssVar: '--surface', note: 'card' },
  { name: 'surface-2', cssVar: '--surface-2', note: 'nested' },
  { name: 'surface-3', cssVar: '--surface-3', note: 'pressed' },
  { name: 'border', cssVar: '--border' },
  { name: 'border-strong', cssVar: '--border-strong' },
  { name: 'text', cssVar: '--text', note: 'primary' },
  { name: 'text-muted', cssVar: '--text-muted', note: 'secondary' },
  { name: 'text-subtle', cssVar: '--text-subtle', note: 'labels' },
  { name: 'accent', cssVar: '--accent', note: 'single accent' },
  { name: 'success', cssVar: '--success' },
  { name: 'warn', cssVar: '--warn' },
  { name: 'error', cssVar: '--error' },
]

const TYPE_SCALE: Array<{ token: string; cssVar: string; sample: string }> = [
  { token: '2xl', cssVar: '--text-2xl', sample: 'Commitments Protocol' },
  { token: 'xl', cssVar: '--text-xl', sample: 'Page Heading' },
  { token: 'lg', cssVar: '--text-lg', sample: 'Section Heading' },
  { token: 'base', cssVar: '--text-base', sample: 'The body text — the workhorse of the system.' },
  { token: 'sm', cssVar: '--text-sm', sample: 'Secondary metadata, table cells, helper text.' },
  { token: 'xs', cssVar: '--text-xs', sample: 'Captions, footnotes, label-uppercase.' },
]

const SPACE_SCALE: Array<{ token: string; cssVar: string; px: number }> = [
  { token: '1', cssVar: '--space-1', px: 4 },
  { token: '2', cssVar: '--space-2', px: 8 },
  { token: '3', cssVar: '--space-3', px: 12 },
  { token: '4', cssVar: '--space-4', px: 16 },
  { token: '6', cssVar: '--space-6', px: 24 },
  { token: '8', cssVar: '--space-8', px: 32 },
  { token: '12', cssVar: '--space-12', px: 48 },
  { token: '16', cssVar: '--space-16', px: 64 },
]

function ColorSwatch({ name, cssVar, note, theme }: { name: string; cssVar: string; note?: string; theme: 'light' | 'dark' }) {
  const [hex, setHex] = useState('')
  useEffect(() => {
    const rs = getComputedStyle(document.documentElement)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the resolved token colour from the DOM after a theme change
    setHex(rs.getPropertyValue(cssVar).trim())
  }, [cssVar, theme])

  const isLight = theme === 'light'
  const checkerLight = name === 'bg' || name === 'surface' || name === 'surface-2' || name === 'surface-3' || name === 'border' || name === 'border-strong'

  return (
    <div className="ds-stack ds-stack-2">
      <div
        style={{
          background: `var(${cssVar})`,
          height: 64,
          border: `1px solid ${checkerLight && isLight ? 'var(--border-strong)' : 'var(--border)'}`,
        }}
      />
      <div className="ds-stack ds-stack-1">
        <div className="ds-text-sm">{name}</div>
        <div className="ds-label" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-subtle)' }}>{hex || cssVar}</div>
        {note && <div className="ds-text-xs ds-subtle">{note}</div>}
      </div>
    </div>
  )
}

const SRC_COLOR =
  `<ColorSwatch name="bg" cssVar="--bg" note="page" theme={theme} />`

const SRC_TYPOGRAPHY =
  `<div style={{ fontSize: 'var(--text-2xl)' }}>Commitments Protocol</div>
<div style={{ fontSize: 'var(--text-base)' }}>Body text — workhorse</div>`

const SRC_SPACING =
  `<div style={{ height: 12, width: 'var(--space-4)', background: 'var(--accent)' }} />`

export function ColorSection({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="color"
        title="Color"
        lead="Grayscale carries the structure. A single accent calls action. Three muted semantic hues handle transaction state — never decoration."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
        {COLOR_TOKENS.map((t) => (
          <ColorSwatch key={t.cssVar} name={t.name} cssVar={t.cssVar} note={t.note} theme={theme} />
        ))}
      </div>
      <SourceBlock label="example" source={SRC_COLOR} />
    </section>
  )
}

export function TypographySection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="typography"
        title="Typography"
        lead="Geist Mono throughout. Tight tracking for headings, slight wide-tracking for uppercase labels. Tabular numerals on numeric data so columns align."
      />
      <div className="ds-stack ds-stack-6">
        {TYPE_SCALE.map((t) => (
          <div key={t.token} className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>{t.token}</div>
            <div style={{ fontSize: `var(${t.cssVar})`, lineHeight: 'var(--leading-tight)' }}>{t.sample}</div>
          </div>
        ))}
        <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
          <div className="ds-label" style={{ minWidth: 64 }}>label</div>
          <div className="ds-label">UPPERCASE · TRACKED · LABEL</div>
        </div>
        <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
          <div className="ds-label" style={{ minWidth: 64 }}>numeric</div>
          <div className="ds-mono-num ds-text-lg">1,247.328573 / 0.0042 / 12.40</div>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_TYPOGRAPHY} />
    </section>
  )
}

export function BrandSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="brand"
        title="Brand"
        lead="The mark paints entirely from currentColor — the palette has no brand hue to spend on a logo, so it is ink on paper and inherits the surrounding text colour. Renders whichever candidate is currently selected; pass mark to pin a specific one. Candidates and the live picker live on /app/lab."
      />
      <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <BrandMark size="xs" />
          <span className="ds-text-xs ds-subtle">xs · 12</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <BrandMark size="sm" />
          <span className="ds-text-xs ds-subtle">sm · 16</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <BrandMark size="md" />
          <span className="ds-text-xs ds-subtle">md · 24</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <BrandMark size="lg" />
          <span className="ds-text-xs ds-subtle">lg · 48</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <BrandMark size="xl" />
          <span className="ds-text-xs ds-subtle">xl · 96</span>
        </span>
      </div>

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">candidates</div>
        <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {MARKS.map((m) => (
            <span key={m.id} className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
              <BrandMark size="lg" mark={m.id} />
              <span className="ds-text-xs ds-subtle">{m.id}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SocialLinkSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="social-link"
        title="Social Link"
        lead="Icon-only link/button into an external surface. Square footprint scales with size; the glyph fills from currentColor so it themes automatically. Defaults to an anchor; pass as=button for in-app actions. Always set label (becomes aria-label + title). Use the bundled GitHubMark / XMark glyphs or any currentColor icon."
      />
      <div className="ds-row ds-row-6" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <SocialLink
            href="https://github.com/AInima-Collective/commitments"
            label="GitHub"
            target="_blank"
            rel="noreferrer noopener"
            icon={<GitHubMark />}
          />
          <span className="ds-text-xs ds-subtle">github · sm</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <SocialLink
            href="https://x.com/jakehartnell"
            label="X (Twitter)"
            target="_blank"
            rel="noreferrer noopener"
            icon={<XMark />}
          />
          <span className="ds-text-xs ds-subtle">x · sm</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <SocialLink href="https://x.com/jakehartnell" label="X · md" size="md" target="_blank" rel="noreferrer noopener" icon={<XMark />} />
          <span className="ds-text-xs ds-subtle">md</span>
        </span>
        <span className="ds-stack ds-stack-2" style={{ alignItems: 'center' }}>
          <SocialLink href="https://x.com/jakehartnell" label="X · lg" size="lg" target="_blank" rel="noreferrer noopener" icon={<XMark />} />
          <span className="ds-text-xs ds-subtle">lg</span>
        </span>
      </div>
    </section>
  )
}

export function SpacingSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="spacing"
        title="Spacing"
        lead="Four-pixel base. Eight is the default rhythm; four is for tight clusters; sixteen and up open the grid."
      />
      <div className="ds-stack ds-stack-2">
        {SPACE_SCALE.map((s) => (
          <div key={s.token} className="ds-row" style={{ gap: 'var(--space-4)' }}>
            <div className="ds-label" style={{ minWidth: 48 }}>{s.token}</div>
            <div style={{ height: 12, width: s.px, background: 'var(--accent)' }} />
            <div className="ds-text-xs ds-subtle ds-mono-num">{s.px}px</div>
          </div>
        ))}
      </div>
      <SourceBlock label="example" source={SRC_SPACING} />
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">grid utilities</div>
        <div className="ds-text-sm ds-subtle" style={{ maxWidth: '70ch' }}>
          <code>.ds-grid-2 / -3 / -4</code> are fixed N-column grids;
          <code> .ds-grid-auto-fit</code> is the responsive
          <code> repeat(auto-fit, minmax(300px, 1fr))</code> pattern that
          survives a 360px viewport without horizontal scroll. Use it for
          card-spread sections (curator + strategy, TVL + APY chart pair).
        </div>
        <div className="ds-grid-auto-fit">
          <div className="ds-card">
            <div className="ds-label">card a</div>
            <div className="ds-text-sm ds-muted">.ds-grid-auto-fit child</div>
          </div>
          <div className="ds-card">
            <div className="ds-label">card b</div>
            <div className="ds-text-sm ds-muted">300px min, 1fr max</div>
          </div>
          <div className="ds-card">
            <div className="ds-label">card c</div>
            <div className="ds-text-sm ds-muted">--space-4 gap</div>
          </div>
        </div>
      </div>
    </section>
  )
}
