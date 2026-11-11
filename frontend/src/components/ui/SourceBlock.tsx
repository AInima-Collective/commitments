import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'

/**
 * Languages supported by {@link SourceBlock}'s `data-language` attribute. The
 * value is purely informational — used by CSS hooks for syntax-tinting and by
 * a future build step that may swap in a true highlighter. SourceBlock itself
 * renders source text verbatim and does not tokenize.
 */
export type SourceLang = 'tsx' | 'ts' | 'css' | 'json'

export interface SourceBlockProps {
  /** Source text to display verbatim inside `<pre><code>`. */
  source: string
  /** Hint for the renderer — emitted as `data-language` on the `<code>` node. */
  language?: SourceLang
  /** Start expanded. Defaults to `false` so the block stays visually quiet. */
  defaultExpanded?: boolean
  /** Extra class names appended to the root element. */
  className?: string
  /** Optional uppercase caption rendered above the toggle row. */
  label?: string
}

/**
 * Collapsible source-code preview with a copy-to-clipboard button. Authored
 * for the `/design` and `/design/recipes` routes (see Phase 28-03 plan): each
 * showcase pairs a rendered example with a `<SourceBlock>` carrying the JSX
 * snippet a developer would copy to reuse the primitive.
 *
 * - **Collapsed by default.** The toggle button carries `aria-expanded` so
 *   screen readers can read the disclosure state. Label text flips between
 *   "SHOW SOURCE" and "HIDE SOURCE".
 * - **Copy button.** Visible only while expanded — invokes
 *   `navigator.clipboard.writeText` and shows a transient "COPIED" affordance
 *   for ~1500ms. Cleanup on unmount prevents stale state on remount.
 * - **No syntax highlighting.** Raw text only, monospace via the design
 *   token. The `data-language` attribute lets a future build step (or CSS
 *   hook) decorate without changing this component's API.
 *
 * Styling: uses the existing `.ds-card` chrome plus the new
 * `.ds-source-block` utility introduced in tokens.css.
 */
export function SourceBlock({
  source,
  language = 'tsx',
  defaultExpanded = false,
  className,
  label,
}: SourceBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending copy-feedback timer on unmount so the setState never
  // fires after the component is gone.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current)
        copyTimeoutRef.current = null
      }
    }
  }, [])

  function handleToggle() {
    setExpanded((v) => !v)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(source)
    } catch {
      /* clipboard write may reject in jsdom or restrictive contexts —
       * still flip the local UI so the user gets feedback. */
    }
    setCopied(true)
    if (copyTimeoutRef.current !== null) {
      clearTimeout(copyTimeoutRef.current)
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false)
      copyTimeoutRef.current = null
    }, 1500)
  }

  const rootClass = ['ds-source-block', className].filter(Boolean).join(' ')

  return (
    <div className={rootClass} data-language={language}>
      {label && <div className="ds-source-block-label">{label}</div>}
      <div className="ds-source-block-toolbar">
        <Button
          variant="ghost"
          size="sm"
          className="ds-source-block-toggle"
          aria-expanded={expanded}
          onClick={handleToggle}
        >
          {expanded ? 'HIDE SOURCE' : 'SHOW SOURCE'}
        </Button>
        {expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="ds-source-block-copy"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy source'}
            title={copied ? 'Copied' : 'Copy source'}
          >
            {copied ? 'COPIED' : 'COPY'}
          </Button>
        )}
      </div>
      {expanded && (
        <pre className="ds-source-block-pre">
          <code data-language={language}>{source}</code>
        </pre>
      )}
    </div>
  )
}
