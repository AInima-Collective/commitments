import { useMemo, useState, type ReactNode } from 'react'
import { useNowSelect } from '../../hooks/useNow'
import { Button, MediaRow } from '../ui'

export type ActivityEventType =
  | 'deposit'
  | 'withdrawal'
  | 'commitment-created'
  | 'commitment-released'
  | 'forfeit-proposed'
  | 'forfeit-finalized'
  | 'forfeit-canceled'
  | 'yield-distributed'
  | 'yield-claimed'
  | 'mutual-loss'
  | 'premium-yield'
  | 'proposal-received'
  | 'proposal-sent'
  | 'proposal-accepted'
  | 'proposal-rejected'
  | 'unbond-ready'
  | 'vault-paused'
  | 'vault-unpaused'

export type ActivityEventTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

export interface ActivityEvent {
  /** Stable identifier — used as React key. */
  id: string
  type: ActivityEventType
  /** Unix seconds at which the event was recorded. */
  timestamp: number
  /** Originating tx hash for explorer links. */
  txHash?: `0x${string}`
  /** Pre-rendered title content — protocol-specific copy lives at the call site. */
  title: ReactNode
  /** Optional secondary text — usually addresses, amounts. */
  meta?: ReactNode
  /** Optional trailing slot — value, action button. */
  trailing?: ReactNode
  /** Forced tone override — defaults are derived from `type`. */
  tone?: ActivityEventTone
  /** Optional row click handler — opens a drawer, navigates, etc. */
  onClick?: () => void
  /**
   * Accessible name for the row action. Required whenever `onClick` is set:
   * `title` is a ReactNode, so it cannot be reused as a label, and the row's
   * action overlay is visually empty. Something like
   * `Review commitment #28`.
   */
  actionLabel?: string
}

export interface ActivityFeedProps {
  events: ActivityEvent[]
  /** Group rows by date heading. Default `'date'`. */
  groupBy?: 'date' | 'none'
  /** Initial number of rows shown when more are available. Default 20. */
  pageSize?: number
  /** Notified on "show more" click. When omitted, the feed implements
   * client-side pagination by expanding the rendered slice. */
  onLoadMore?: () => void
  /** Show skeleton rows. */
  isLoading?: boolean
  /** Rendered when `events.length === 0` and `!isLoading`. */
  emptyState?: ReactNode
  className?: string
}

const DEFAULT_TONE_BY_TYPE: Record<ActivityEventType, ActivityEventTone> = {
  deposit: 'success',
  withdrawal: 'success',
  'commitment-created': 'info',
  'commitment-released': 'success',
  'forfeit-proposed': 'warn',
  'forfeit-finalized': 'danger',
  'forfeit-canceled': 'success',
  'yield-distributed': 'success',
  'yield-claimed': 'success',
  'mutual-loss': 'danger',
  'premium-yield': 'success',
  'proposal-received': 'info',
  'proposal-sent': 'info',
  'proposal-accepted': 'success',
  'proposal-rejected': 'neutral',
  'unbond-ready': 'success',
  'vault-paused': 'warn',
  'vault-unpaused': 'info',
}

const GLYPH_BY_TYPE: Record<ActivityEventType, string> = {
  deposit: '↓',
  withdrawal: '↑',
  'commitment-created': '+',
  'commitment-released': '✓',
  'forfeit-proposed': '!',
  'forfeit-finalized': '✗',
  'forfeit-canceled': '↺',
  'yield-distributed': '$',
  'yield-claimed': '$',
  'mutual-loss': '−',
  'premium-yield': '$',
  'proposal-received': '→',
  'proposal-sent': '←',
  'proposal-accepted': '✓',
  'proposal-rejected': '✗',
  'unbond-ready': '✓',
  'vault-paused': '⏸',
  'vault-unpaused': '▶',
}

// A non-positive (or absent) timestamp means the source row has no usable date
// — e.g. an older indexer commitment row missing `createdAt`. Render an em-dash
// rather than a misleading "Jan 1 1970"; such events sort to the bottom.
const NO_DATE = '—'

function formatDateHeading(unixSecs: number, nowUnixSecs: number): string {
  if (!(unixSecs > 0)) return NO_DATE
  const ms = unixSecs * 1000
  const date = new Date(ms)
  const now = new Date(nowUnixSecs * 1000)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: now.getFullYear() === date.getFullYear() ? undefined : 'numeric' })
}

function formatTimeStamp(unixSecs: number): string {
  if (!(unixSecs > 0)) return NO_DATE
  return new Date(unixSecs * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * ActivityFeed — protocol-aware list-of-events surface composed over MediaRow.
 * The taxonomy of event types is fixed (see ActivityEventType); call sites
 * provide pre-rendered title/meta/trailing nodes since copy is feature-specific.
 *
 * This is the rendering surface for the Dashboard activity stream and any
 * other "what happened" panel (per-vault activity, per-operator history).
 */
export function ActivityFeed({
  events,
  groupBy = 'date',
  pageSize = 20,
  onLoadMore,
  isLoading,
  emptyState,
  className,
}: ActivityFeedProps) {
  const [shown, setShown] = useState(pageSize)
  // Headings read only the local day, so re-render when the day turns, not
  // every second.
  const today = useNowSelect((now) => {
    const d = new Date(Number(now) * 1000)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000
  })

  const visibleEvents = useMemo(
    () => (onLoadMore ? events : events.slice(0, shown)),
    [events, shown, onLoadMore],
  )

  const cls = ['ds-activity-feed', className].filter(Boolean).join(' ')

  if (!isLoading && events.length === 0) {
    return <div className={cls}>{emptyState ?? <div className="ds-subtle ds-text-sm">No activity yet.</div>}</div>
  }

  const groups: Array<{ heading: string; events: ActivityEvent[] }> = []
  if (groupBy === 'date') {
    const byHeading = new Map<string, ActivityEvent[]>()
    for (const ev of visibleEvents) {
      const heading = formatDateHeading(ev.timestamp, today)
      const list = byHeading.get(heading) ?? []
      list.push(ev)
      byHeading.set(heading, list)
    }
    for (const [heading, list] of byHeading) {
      groups.push({ heading, events: list })
    }
  } else {
    groups.push({ heading: '', events: visibleEvents })
  }

  const hasMore = onLoadMore ? true : events.length > shown

  return (
    <div className={cls} aria-label="Activity">
      {isLoading && events.length === 0 ? (
        <div className="ds-stack ds-stack-2" aria-busy>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ds-media-row" aria-hidden>
              <span className="ds-media-row-leading">·</span>
              <span className="ds-media-row-body">
                <span className="ds-media-row-title ds-skeleton" style={{ height: 12, width: '60%' }} />
                <span className="ds-media-row-meta ds-skeleton" style={{ height: 10, width: '40%' }} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.heading} className="ds-activity-feed-group">
            {g.heading && (
              <header className="ds-activity-feed-heading">{g.heading}</header>
            )}
            <ul className="ds-stack ds-stack-0" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.events.map((ev) => {
                const tone = ev.tone ?? DEFAULT_TONE_BY_TYPE[ev.type]
                const glyph = GLYPH_BY_TYPE[ev.type]
                return (
                  <MediaRow
                    key={ev.id}
                    as="li"
                    action={
                      ev.onClick
                        ? { label: ev.actionLabel ?? 'Open this event', onClick: ev.onClick }
                        : undefined
                    }
                    tone={tone}
                    leading={
                      <span className="ds-activity-feed-glyph" aria-hidden>
                        {glyph}
                      </span>
                    }
                    title={ev.title}
                    meta={
                      ev.meta !== undefined ? (
                        <span className="ds-row ds-row-2" style={{ alignItems: 'baseline' }}>
                          <span className="ds-text-xs ds-subtle" style={{ minWidth: 56 }}>
                            {formatTimeStamp(ev.timestamp)}
                          </span>
                          <span>{ev.meta}</span>
                        </span>
                      ) : (
                        <span className="ds-text-xs ds-subtle">{formatTimeStamp(ev.timestamp)}</span>
                      )
                    }
                    trailing={ev.trailing}
                  />
                )
              })}
            </ul>
          </section>
        ))
      )}

      {hasMore && (
        <div className="ds-row" style={{ justifyContent: 'center' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onLoadMore) onLoadMore()
              else setShown((s) => s + pageSize)
            }}
          >
            Show more
          </Button>
        </div>
      )}
    </div>
  )
}
