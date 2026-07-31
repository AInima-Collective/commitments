import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DocsSidebar } from '../components/docs/Sidebar'
import { MarkdownPage } from '../components/docs/MarkdownPage'
import { getEntryBySlug, loadDocBody, type DocEntry } from '../docs/loader'

export default function Docs() {
  const params = useParams<{ '*': string }>()
  const slug = (params['*'] ?? '').replace(/\/+$/, '')
  const entry = getEntryBySlug(slug)
  const sidebarRoot = ['standards', 'protocol', 'design', 'background'].find(
    (section) => slug === section || slug.startsWith(`${section}/`),
  )

  if (!sidebarRoot) {
    return (
      <div className="ds-doc-shell" data-layout="single">
        <main className="ds-doc-shell-content">
          {entry ? <DocBody entry={entry} /> : <NotFound slug={slug} />}
        </main>
      </div>
    )
  }
  return (
    <div className="ds-doc-shell">
      <aside className="ds-doc-shell-sidebar">
        <DocsSidebar rootSlug={sidebarRoot} />
      </aside>
      <main className="ds-doc-shell-content">
        {entry ? <DocBody entry={entry} /> : <NotFound slug={slug} />}
      </main>
    </div>
  )
}

function DocBody({ entry }: { entry: DocEntry }) {
  const [state, setState] = useState<{
    content: string
    meta: Record<string, unknown>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription reset; see frontend/docs/eslint-disable-rationale.md §Pattern-3
    setState(null)
    setError(null)
    loadDocBody(entry)
      .then((body) => {
        if (!cancelled) setState({ content: body.content, meta: body.data })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  if (error) {
    return (
      <div className="ds-doc">
        <h1>Failed to load page</h1>
        <pre>{error}</pre>
      </div>
    )
  }
  if (!state) {
    return <div className="ds-doc ds-doc--loading">Loading…</div>
  }
  return <MarkdownPage content={state.content} sourcePath={entry.path} meta={state.meta} />
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="ds-doc">
      <h1>Page not found</h1>
      <p>
        No doc matches <code>/docs/{slug}</code>. Pick a section from the sidebar.
      </p>
    </div>
  )
}
