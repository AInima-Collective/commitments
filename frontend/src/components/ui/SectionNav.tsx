import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface SectionNavItem {
  /** DOM `id` of the target section. The nav scrolls to `#${id}`. */
  id: string
  label: ReactNode
  /** Optional small numeric / textual badge. */
  count?: ReactNode
}

export interface SectionNavProps {
  items: SectionNavItem[]
  /** When `true` (default), the nav sticks to the top while the user scrolls. */
  sticky?: boolean
  /** Pixel offset added to the scroll target — useful when a parent header is
   *  also sticky and would otherwise overlap the section. Default 16. */
  scrollOffset?: number
  /** Override the auto-detected active item. */
  activeId?: string
  className?: string
  'aria-label'?: string
}

const DEFAULT_OFFSET = 16

/**
 * Scroll-spy section navigation. Renders one tab per section id; clicking a
 * tab smooth-scrolls to the corresponding `#id` anchor and an
 * `IntersectionObserver` highlights whichever section is currently in view.
 *
 * Composes the existing `ds-tabs` styling so it reads identically to the
 * tab strips used elsewhere — only the semantics differ (anchor scroll vs.
 * content swap).
 *
 * Pages should set a `scroll-margin-top` on each target section equal to
 * the sticky-nav height so the section header lands below the bar.
 */
export function SectionNav({
  items,
  sticky = true,
  scrollOffset = DEFAULT_OFFSET,
  activeId,
  className,
  'aria-label': ariaLabel,
}: SectionNavProps) {
  const [autoActive, setAutoActive] = useState<string | undefined>(items[0]?.id)
  const observerRef = useRef<IntersectionObserver | null>(null)
  // Click-driven highlight wins for ~600ms over the IntersectionObserver so
  // the tab visibly responds to the click instead of fighting the
  // mid-scroll observer. Cleared by a setTimeout so render never reads time.
  const clickSuppressRef = useRef(false)
  const clickTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return
    const ids = items.map((i) => i.id)
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (clickSuppressRef.current) return
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (top) {
          setAutoActive(top.target.id)
        }
      },
      {
        // Pull the top boundary down by the offset so a section near the top
        // becomes active just as it lands beneath the sticky nav.
        rootMargin: `-${scrollOffset + 60}px 0px -55% 0px`,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )
    targets.forEach((t) => observer.observe(t))
    observerRef.current = observer
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [items, scrollOffset])

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    },
    [],
  )

  function handleClick(id: string, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    clickSuppressRef.current = true
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      clickSuppressRef.current = false
      clickTimerRef.current = null
    }, 600)
    setAutoActive(id)
    const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset
    window.scrollTo({ top, behavior: 'smooth' })
    // Update history so the URL reflects the section without a jump.
    if (typeof history?.replaceState === 'function') {
      history.replaceState(null, '', `#${id}`)
    }
  }

  const active = activeId ?? autoActive
  const root = ['ds-section-nav', className].filter(Boolean).join(' ')

  return (
    <nav
      className={root}
      data-sticky={sticky ? 'true' : undefined}
      aria-label={ariaLabel ?? 'Section navigation'}
    >
      <div className="ds-tabs" role="tablist">
        {items.map((item) => {
          const isActive = active === item.id
          return (
            <a
              key={item.id}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'location' : undefined}
              href={`#${item.id}`}
              className="ds-tab"
              onClick={(e) => handleClick(item.id, e)}
            >
              {item.label}
              {item.count !== undefined && item.count !== null && (
                <span className="ds-tab-count">{item.count}</span>
              )}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
