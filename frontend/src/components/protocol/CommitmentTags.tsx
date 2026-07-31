import { type MouseEvent } from 'react'

export type CommitmentTagsSize = 'xs' | 'sm'

export interface CommitmentTagsProps {
  /** Normalized tags — feed it `metadataTags(row)`. */
  tags: readonly string[]
  size?: CommitmentTagsSize
  /**
   * Makes each tag a filter control. Click events are stopped before they
   * bubble, so the same markup works inside a click-to-open table row and
   * inside a `MediaRow` overlay without either swallowing the other.
   */
  onSelect?: (tag: string) => void
  /** Tags currently applied as filters — rendered as active. */
  active?: readonly string[]
  /** Cap the rendered tags, collapsing the rest into a `+N` marker. */
  max?: number
  className?: string
}

/**
 * A commitment's `tags`, as chips.
 *
 * `tags` is one of two `commitment.v1` fields the product used to fetch,
 * verify, store, and then never show. It is also the only field on the schema
 * that groups commitments across counterparties and tokens, which makes it the
 * one worth making clickable.
 */
export function CommitmentTags({
  tags,
  size = 'xs',
  onSelect,
  active,
  max,
  className,
}: CommitmentTagsProps) {
  if (tags.length === 0) return null
  const visible = max !== undefined ? tags.slice(0, max) : tags
  const hidden = tags.length - visible.length
  const cls = ['ds-tag-list', className].filter(Boolean).join(' ')

  return (
    <span className={cls} data-size={size}>
      {visible.map((tag) => {
        const isActive = active?.includes(tag) ?? false
        if (!onSelect) {
          return (
            // Chips clamp at 14ch, so the full value has to stay reachable.
            <span key={tag} className="ds-tag" data-active={isActive || undefined} title={tag}>
              {tag}
            </span>
          )
        }
        const handle = (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
          onSelect(tag)
        }
        return (
          <button
            key={tag}
            type="button"
            className="ds-tag"
            data-active={isActive || undefined}
            aria-pressed={isActive}
            title={isActive ? `Remove the ${tag} filter` : `Filter by ${tag}`}
            onClick={handle}
          >
            {tag}
          </button>
        )
      })}
      {hidden > 0 && (
        <span className="ds-tag ds-tag--overflow" title={tags.slice(visible.length).join(', ')}>
          +{hidden}
        </span>
      )}
    </span>
  )
}
