import { parseEther } from 'viem'
import {
  Skeleton,
  SourceBlock,
  TokenAmount,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

const SRC_LOADING =
  `<Skeleton width={180} />
<Skeleton shape="circle" width={32} height={32} />
<span className="ds-spinner ds-spinner--md" />`

export function LoadingSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="loading"
        title="Loading & Placeholders"
        lead="Skeletons reserve space so async reads don't shift the page. Spinners and dots cover the inline cases. Overlays let an existing panel refresh without wiping its values. Match the placeholder to the eventual content's shape — a skeleton operator row should look like an operator row, not a generic gray bar."
      />

      {/* Skeleton shapes */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">skeleton · shapes</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>text</div>
            <Skeleton width={180} />
            <span className="ds-subtle">— line height ~0.85em, paired with body copy</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>title</div>
            <Skeleton shape="title" width={240} />
            <span className="ds-subtle">— heading height, ~1.4em</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>circle</div>
            <Skeleton shape="circle" width={32} height={32} />
            <Skeleton shape="circle" width={48} height={48} />
            <span className="ds-subtle">— stand-in for avatars and token icons</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>block</div>
            <Skeleton shape="block" width={120} height={60} />
            <span className="ds-subtle">— charts, panels, cards</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>button</div>
            <Skeleton shape="button" />
            <Skeleton shape="button" style={{ minWidth: 120 }} />
            <span className="ds-subtle">— action surfaces while permissions resolve</span>
          </div>
        </div>
      </div>

      {/* Skeleton paragraph and animation variants */}
      <div className="ds-grid-2">
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">skeleton · paragraph</div>
          <div className="ds-skeleton-paragraph">
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
          <div className="ds-text-xs ds-subtle">Last line auto-shortens to evoke prose flow without committing to any specific copy length.</div>
        </div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">skeleton · animation</div>
          <div className="ds-stack ds-stack-2 ds-text-sm">
            <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
              <div className="ds-label" style={{ minWidth: 72 }}>pulse</div>
              <Skeleton width={200} />
            </div>
            <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
              <div className="ds-label" style={{ minWidth: 72 }}>shimmer</div>
              <Skeleton animation="shimmer" width={200} />
            </div>
            <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
              <div className="ds-label" style={{ minWidth: 72 }}>still</div>
              <Skeleton animation="still" width={200} />
            </div>
          </div>
          <div className="ds-text-xs ds-subtle">
            Pulse reads on any surface; shimmer suits richer panels; still hints at structure without animation (good for nested skeletons).
          </div>
        </div>
      </div>

      {/* Skeleton compositions */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">skeleton · compositions</div>
        <div className="ds-grid-3">
          {/* Operator row */}
          <div className="ds-card ds-stack ds-stack-3">
            <div className="ds-label">operator row</div>
            <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton shape="circle" width={32} height={32} />
              <div className="ds-stack ds-stack-1" style={{ flex: 1 }}>
                <Skeleton width="70%" />
                <Skeleton width="45%" />
              </div>
              <Skeleton shape="block" animation="still" width={56} height={16} style={{ borderRadius: 999 }} />
            </div>
            <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton shape="circle" width={32} height={32} />
              <div className="ds-stack ds-stack-1" style={{ flex: 1 }}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </div>
              <Skeleton shape="block" animation="still" width={56} height={16} style={{ borderRadius: 999 }} />
            </div>
          </div>

          {/* Stat tile */}
          <div className="ds-card ds-stack ds-stack-3">
            <div className="ds-label">stat tile</div>
            <div className="ds-stack ds-stack-2">
              <Skeleton width={100} />
              <Skeleton shape="title" width={140} height={32} />
              <Skeleton width={80} />
            </div>
          </div>

          {/* Commitment card */}
          <div className="ds-card ds-stack ds-stack-3">
            <div className="ds-label">commitment card</div>
            <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={80} />
              <Skeleton shape="block" animation="still" width={56} height={16} style={{ borderRadius: 999 }} />
            </div>
            <div className="ds-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton shape="circle" width={24} height={24} />
              <Skeleton shape="title" height={24} style={{ flex: 1 }} />
            </div>
            <div className="ds-row" style={{ gap: 'var(--space-2)' }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} shape="circle" animation="still" width={8} height={8} />
              ))}
              <Skeleton style={{ flex: 1, marginLeft: 'var(--space-2)' }} />
            </div>
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Compositions match the eventual content's shape so swapping in real data doesn't shift the layout. Inert decorations (e.g. lifecycle dots) use <code>--still</code> to keep one focal point of motion per row.
        </div>
      </div>

      {/* Skeleton table */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">skeleton · table</div>
        <table className="ds-table">
          <thead>
            <tr>
              <th>operator</th>
              <th style={{ textAlign: 'right' }}>stake</th>
              <th style={{ textAlign: 'right' }}>commission</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((i) => (
              <tr key={i}>
                <td>
                  <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                    <Skeleton shape="circle" width={20} height={20} />
                    <Skeleton width={140} />
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Skeleton width={80} style={{ marginLeft: 'auto' }} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Skeleton width={48} style={{ marginLeft: 'auto' }} />
                </td>
                <td>
                  <Skeleton shape="block" animation="still" width={56} height={16} style={{ borderRadius: 999 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spinners */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">spinner · sizes</div>
        <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--xs" />
            <span className="ds-text-xs ds-subtle">xs</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--sm" />
            <span className="ds-text-xs ds-subtle">sm · default</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--md" />
            <span className="ds-text-xs ds-subtle">md</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--lg" />
            <span className="ds-text-xs ds-subtle">lg</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--xl" />
            <span className="ds-text-xs ds-subtle">xl</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <span className="ds-spinner ds-spinner--md ds-spinner--muted" />
            <span className="ds-text-xs ds-subtle">muted</span>
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Inline transactional copy uses <code>sm</code>; full-card or page loads use <code>lg</code>/<code>xl</code>. The muted tone reads as ambient background work, not a foreground action.
        </div>
      </div>

      {/* Loading dots */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">loading dots · inline</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div>
            Resolving operator metadata
            <span className="ds-loading-dots" style={{ marginLeft: 4 }}>
              <span /><span /><span />
            </span>
          </div>
          <div className="ds-subtle">
            Verifying content hash
            <span className="ds-loading-dots" style={{ marginLeft: 4 }}>
              <span /><span /><span />
            </span>
          </div>
          <div className="ds-text-xs ds-subtle">
            Use when a spinner would over-promise progress — for tasks where you can't predict completion.
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">loading overlay · refresh and first-load</div>
        <div className="ds-grid-2">
          <div className="ds-card ds-stack ds-stack-3 ds-loading-overlay-host">
            <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="ds-label">total assets</div>
              <span className="ds-text-xs ds-subtle">refreshing</span>
            </div>
            <div className="ds-stat-value">
              <TokenAmount amount={parseEther('1247.32')} decimals={18} symbol="ETH" />
            </div>
            <div className="ds-stat-delta ds-stat-delta--success ds-text-xs">+0.42% · 24h</div>
            <div className="ds-loading-overlay">
              <span className="ds-spinner ds-spinner--md ds-spinner--muted" />
              <span>refreshing…</span>
            </div>
          </div>
          <div className="ds-card ds-stack ds-stack-3 ds-loading-overlay-host" style={{ minHeight: 140 }}>
            <div className="ds-label">operators</div>
            <div className="ds-loading-overlay ds-loading-overlay--solid">
              <span className="ds-spinner ds-spinner--md" />
              <span>loading operators</span>
            </div>
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Refresh-style overlay tints the panel so the previous value is still partially legible — important for figures that update frequently (TVL, share price). The solid variant fully masks the panel for first-load cases where there's no prior value worth preserving.
        </div>
      </div>

      {/* Indeterminate progress */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">indeterminate progress · top sliver</div>
        <div className="ds-card ds-stack ds-stack-3" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ds-progress">
            <div className="ds-progress-bar ds-progress-bar--indeterminate" />
          </div>
          <div className="ds-stack ds-stack-2" style={{ padding: 'var(--space-4)' }}>
            <div className="ds-label">commitments</div>
            <div className="ds-text-sm ds-subtle">syncing latest events from chain…</div>
          </div>
        </div>
        <div className="ds-card ds-stack ds-stack-3" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ds-progress">
            <div className="ds-progress-bar" style={{ width: '62%' }} />
          </div>
          <div className="ds-stack ds-stack-2" style={{ padding: 'var(--space-4)' }}>
            <div className="ds-label">deploying service manager</div>
            <div className="ds-text-sm ds-subtle">step 5 of 8 · waiting for confirmations</div>
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Indeterminate animates left-to-right when total work is unknown. Determinate uses an inline width for known progress (multi-step deploys, batched indexing).
        </div>
      </div>
      <SourceBlock label="example" source={SRC_LOADING} />
    </section>
  )
}
