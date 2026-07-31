import { describe, expect, it } from 'vitest'
import matter from 'gray-matter'
import { allEntries, getEntryBySlug } from '../loader'

// Eagerly load all doc bodies so we can scan their links without async.
const bodies = import.meta.glob('../../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const DOCS_PREFIX = '../../../../docs/'

const LINK_RE = /\[[^\]]+\]\(([^)\s]+)\)/g

function isExternal(href: string): boolean {
  return /^[a-z]+:\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('#')
}

function resolveRelative(from: string, href: string): string {
  const sourceDir = from.includes('/') ? from.replace(/\/[^/]*$/, '') : ''
  const segments: string[] = []
  if (!href.startsWith('/')) {
    if (sourceDir) segments.push(...sourceDir.split('/'))
  }
  for (const seg of href.replace(/^\/+/, '').split('/')) {
    if (seg === '..') segments.pop()
    else if (seg !== '.' && seg !== '') segments.push(seg)
  }
  return segments.join('/').split('#')[0]
}

function escapesDocsRoot(from: string, href: string): boolean {
  if (href.startsWith('/')) return false
  let depth = from.includes('/') ? from.split('/').length - 1 : 0
  for (const segment of href.split('/')) {
    if (segment === '..') {
      if (depth === 0) return true
      depth -= 1
    } else if (segment !== '.' && segment !== '') {
      depth += 1
    }
  }
  return false
}

describe('docs internal links', () => {
  it('every relative .md link points to a real doc', () => {
    const broken: { from: string; href: string; resolved: string }[] = []
    // Archived pages are direct-only and therefore absent from allEntries, but
    // deliberate links into the archive still need to resolve to real files.
    const known = new Set(Object.keys(bodies).map((key) => key.slice(DOCS_PREFIX.length)))

    for (const entry of allEntries) {
      const key = `${DOCS_PREFIX}${entry.path}`
      const raw = bodies[key]
      if (!raw) continue
      const { content } = matter(raw)
      LINK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = LINK_RE.exec(content)) !== null) {
        const href = m[1]
        if (isExternal(href)) continue
        if (!href.includes('.md')) continue // anchor-only links handled separately
        // Links that leave docs/ are rendered as repository source links by
        // MarkdownPage and are outside this docs-route existence check.
        if (escapesDocsRoot(entry.path, href)) continue

        // Routes already absolute under /docs are produced by the generator;
        // verify they resolve via slug instead of file path.
        if (href.startsWith('/docs/')) {
          const slug = href.replace(/^\/docs\/?/, '').replace(/\.md(?=$|[#?])/, '').split('#')[0]
          if (slug !== '' && !getEntryBySlug(slug)) {
            broken.push({ from: entry.path, href, resolved: slug })
          }
          continue
        }

        const resolved = resolveRelative(entry.path, href)
        if (!known.has(resolved)) {
          broken.push({ from: entry.path, href, resolved })
        }
      }
    }

    if (broken.length) {
      const lines = broken.map((b) => `  ${b.from} -> ${b.href} (resolved=${b.resolved})`)
      throw new Error(`broken markdown links:\n${lines.join('\n')}`)
    }
    expect(broken.length).toBe(0)
  })
})
