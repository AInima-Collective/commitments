import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { CodeBlock } from './CodeBlock'
import { MermaidBlock } from './MermaidBlock'

type Props = {
  /** Markdown body with frontmatter already stripped. */
  content: string
  /** Path of the source doc (e.g. `protocol/architecture/overview.md`) — used to resolve relative links. */
  sourcePath: string
  /** Frontmatter metadata for banner / title rendering. */
  meta?: Record<string, unknown>
}

// How docs links are authored inside markdown source (e.g. `/docs/protocol/…`).
const MD_DOCS_BASE = '/docs'
// The in-app route docs render under (the app shell is mounted at /app).
const ROUTE_DOCS_BASE = '/app/docs'
const REPOSITORY_BLOB_BASE = 'https://github.com/AInima-Collective/commitments/blob/main'

/** Resolve a relative `.md` link from a source page to an `/app/docs/...` route. */
function resolveDocLink(href: string, sourcePath: string): string | null {
  if (!href) return null
  if (/^[a-z]+:\/\//i.test(href)) return null // absolute URL
  if (href.startsWith('mailto:')) return null
  if (href.startsWith('#')) return null

  // Already an absolute docs link in the markdown source — remap to the route.
  if (href.startsWith(MD_DOCS_BASE + '/') || href === MD_DOCS_BASE) {
    return ROUTE_DOCS_BASE + href.slice(MD_DOCS_BASE.length).replace(/\.md(?=$|[#?])/, '')
  }

  // Compute the target relative to the repository root. Prefixing with `docs`
  // lets us distinguish an ordinary docs link from a deliberate link that
  // traverses into another repository directory such as `src/`.
  const sourceDir = sourcePath.includes('/') ? sourcePath.replace(/\/[^/]*$/, '') : ''
  const segments: string[] = ['docs']
  if (!href.startsWith('/')) {
    if (sourceDir) segments.push(...sourceDir.split('/'))
  }
  for (const seg of href.replace(/^\/+/, '').split('/')) {
    if (seg === '..') segments.pop()
    else if (seg !== '.' && seg !== '') segments.push(seg)
  }
  let joined = segments.join('/')
  let anchor = ''
  const hashIdx = joined.indexOf('#')
  if (hashIdx >= 0) {
    anchor = joined.slice(hashIdx)
    joined = joined.slice(0, hashIdx)
  }
  if (!joined.startsWith('docs/')) {
    return `${REPOSITORY_BLOB_BASE}/${joined}${anchor}`
  }
  joined = joined.slice('docs/'.length).replace(/\.md$/, '')
  return `${ROUTE_DOCS_BASE}/${joined}${anchor}`
}

function isExternal(href: string): boolean {
  return /^[a-z]+:\/\//i.test(href) || href.startsWith('mailto:')
}

export function MarkdownPage({ content, sourcePath, meta }: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  // Scroll to anchor on hash change (react-markdown emits ids via rehype-slug).
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 })
      return
    }
    const id = decodeURIComponent(location.hash.slice(1))
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [location.pathname, location.hash])

  const components: Components = {
    a({ href, children, ...rest }) {
      if (!href) return <a {...rest}>{children}</a>
      if (isExternal(href)) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        )
      }
      if (href.startsWith('#')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              navigate(`${location.pathname}${href}`)
            }}
            {...rest}
          >
            {children}
          </a>
        )
      }
      const route = resolveDocLink(href, sourcePath)
      if (!route) return <a href={href} {...rest}>{children}</a>
      if (isExternal(route)) {
        return (
          <a href={route} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        )
      }
      return <Link to={route}>{children}</Link>
    },
    code({ className, children, ...rest }) {
      // Inline code (no language class, single-line)
      const langMatch = /language-([\w-]+)/.exec(className ?? '')
      const codeStr = String(children).replace(/\n$/, '')
      if (!langMatch) {
        return (
          <code className="ds-doc-inline-code" {...rest}>
            {children}
          </code>
        )
      }
      const lang = langMatch[1].toLowerCase()
      if (lang === 'mermaid') return <MermaidBlock chart={codeStr} />
      return <CodeBlock lang={lang} code={codeStr} />
    },
    pre({ children }) {
      // CodeBlock and MermaidBlock render their own wrappers, so unwrap <pre>.
      return <>{children}</>
    },
  }

  return (
    <article className="ds-doc">
      {meta?.generated === true && (
        <div className="ds-doc-banner" role="note">
          <strong>Generated:</strong> this page is auto-generated from Solidity NatSpec
          {typeof meta.source === 'string' ? (
            <>
              {' '}— edit <code>{meta.source}</code>.
            </>
          ) : (
            '.'
          )}
        </div>
      )}
      {typeof meta?.status === 'string' && (
        <div className="ds-doc-status">
          <span className="ds-badge ds-badge--accent">{meta.status as string}</span>
          {(typeof meta?.eip === 'string' || typeof meta?.eip === 'number') && (
            <span className="ds-mono-num"> EIP {String(meta.eip)}</span>
          )}
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            { behavior: 'wrap', properties: { className: ['ds-doc-heading-anchor'] } },
          ],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
