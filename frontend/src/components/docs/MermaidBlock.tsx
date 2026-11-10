import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../ui'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidPromise
}

let mermaidCounter = 0

export function MermaidBlock({ chart }: { chart: string }) {
  const { theme } = useTheme()
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++mermaidCounter}`)

  useEffect(() => {
    let cancelled = false
    getMermaid().then(async (mermaid) => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'light' ? 'default' : 'dark',
        })
        const { svg } = await mermaid.render(idRef.current, chart)
        if (!cancelled) {
          setSvg(svg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => {
      cancelled = true
    }
  }, [chart, theme])

  if (error) {
    return (
      <pre className="ds-doc-mermaid-error" role="alert">
        mermaid render failed: {error}
      </pre>
    )
  }
  return <div className="ds-doc-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}
