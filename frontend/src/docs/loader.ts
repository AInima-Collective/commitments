// Single source of truth for the /app/docs route.
//
// Vite glob is anchored at this file, so `../../../docs` resolves to
// the repository's docs directory (one level above the frontend package). The
// `?raw` query gives us the markdown text without parsing. The glob is eager
// because the sidebar index needs every page's frontmatter title, and `?raw`
// cannot yield the frontmatter alone. The corpus (about 1 MB raw) therefore
// lands in the lazily loaded Docs route chunk, never the entry chunk: only
// pages/Docs.tsx and components/docs import this module.

import {
  TOP_LEVEL_ORDER,
  PROTOCOL_SECTION_ORDER,
  STANDARDS_SECTION_ORDER,
  LEGACY_ROUTE_ALIASES,
  EXCLUDED_PATHS,
  FRIENDLY_TITLES,
} from './_order'

// Minimal frontmatter parser — replaces gray-matter on the browser path.
// gray-matter pulls in Buffer (a Node global) at module init, which throws
// `ReferenceError: Buffer is not defined` in the Vite dev server. We only
// need three scalar fields here (title, order, generated) so a tiny inline
// parser is simpler than a Buffer polyfill, smaller bundle, no Node shim.
//
// Supported shape:
//   ---
//   title: Some title         # quoted or unquoted
//   order: 5                  # parsed as Number when numeric
//   generated: true           # 'true' / 'false' coerced to boolean
//   ---
//   <body>
//
// Everything else is preserved as a string (or omitted if absent). Unknown
// keys are ignored. Falls back to `{ data: {}, content: raw }` when the
// document lacks a frontmatter block, matching gray-matter's behaviour.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
function matter(raw: string): { data: Record<string, unknown>; content: string } {
  const m = FRONTMATTER_RE.exec(raw)
  if (!m) return { data: {}, content: raw }
  const data: Record<string, unknown> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colon = trimmed.indexOf(':')
    if (colon === -1) continue
    const key = trimmed.slice(0, colon).trim()
    let value: string = trimmed.slice(colon + 1).trim()
    // strip a single layer of quoting (matches the simple fields in our docs)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value === 'true') data[key] = true
    else if (value === 'false') data[key] = false
    else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = Number(value)
    else data[key] = value
  }
  return { data, content: raw.slice(m[0].length) }
}

const DOCS_PREFIX = '../../../docs/'

// Keep the glob literal: it is the compile-time manifest for hand-written
// guides and design RFCs as well as generated contract reference pages.
const eagerModules = import.meta.glob('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function stripPrefix(key: string): string {
  return key.startsWith(DOCS_PREFIX) ? key.slice(DOCS_PREFIX.length) : key
}

function isExcluded(rel: string): boolean {
  return EXCLUDED_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`))
}

export type DocEntry = {
  /** Path relative to the repository docs directory, e.g. `protocol/architecture/overview.md`. */
  path: string
  /** Route slug, e.g. `architecture/overview` or '' for the index. */
  slug: string
  /** Display title from frontmatter or filename. */
  title: string
  /** Optional ordering hint from frontmatter. */
  order?: number
  /** True when this page came from `forge doc`. */
  generated: boolean
}

function defaultSlugFor(rel: string): string {
  if (rel === 'README.md') return ''
  // `architecture/README.md` -> `architecture`
  if (rel.endsWith('/README.md')) return rel.slice(0, -'/README.md'.length)
  // `_index.md` -> the directory itself (used by generated contracts index)
  if (rel.endsWith('/_index.md')) return rel.slice(0, -'/_index.md'.length)
  return rel.replace(/\.md$/, '')
}

function slugFor(rel: string): string {
  return defaultSlugFor(rel)
}

function pathForSlug(slug: string): string | undefined {
  const norm = slug.replace(/^\/+|\/+$/g, '')
  if (LEGACY_ROUTE_ALIASES[norm] !== undefined) return LEGACY_ROUTE_ALIASES[norm]
  if (norm === '') return 'README.md'
  // Try direct match
  const direct = `${norm}.md`
  if (eagerModules[`${DOCS_PREFIX}${direct}`]) return direct
  // Try as directory README/_index
  const readme = `${norm}/README.md`
  if (eagerModules[`${DOCS_PREFIX}${readme}`]) return readme
  const index = `${norm}/_index.md`
  if (eagerModules[`${DOCS_PREFIX}${index}`]) return index
  return undefined
}

function titleize(rel: string): string {
  if (FRIENDLY_TITLES[rel]) return FRIENDLY_TITLES[rel]
  const base = rel.replace(/\.md$/, '').split('/').pop() || rel
  if (/^[A-Z][A-Z0-9_-]+$/.test(base)) return base // ERC-COMMITMENTS, FOLLOWUPS
  return base
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseEntry(rel: string, body: string): DocEntry {
  const fm = matter(body)
  const titleFromFm = typeof fm.data.title === 'string' ? fm.data.title : undefined
  const orderFromFm = typeof fm.data.order === 'number' ? fm.data.order : undefined
  // FRIENDLY_TITLES wins when set so the sidebar can show short labels even
  // when the source doc has a long descriptive frontmatter title (e.g. the
  // ERC spec's "Commitments — Liens on ERC-4626 Vaults" gets shown as
  // "ERC Spec" in the nav).
  const friendly = FRIENDLY_TITLES[rel]
  return {
    path: rel,
    slug: slugFor(rel),
    title: friendly ?? titleFromFm ?? titleize(rel),
    order: orderFromFm,
    generated: fm.data.generated === true,
  }
}

const parsedEntries: DocEntry[] = Object.entries(eagerModules)
  .map(([key, body]) => [stripPrefix(key), body] as const)
  .map(([rel, body]) => parseEntry(rel, body))

// Public/navigation/search entries exclude the historical archive. Lookups are
// built from every parsed page so an explicit archive URL remains available.
export const allEntries: DocEntry[] = parsedEntries.filter((entry) => !isExcluded(entry.path))

const entriesByPath = new Map<string, DocEntry>(parsedEntries.map((e) => [e.path, e]))
const entriesBySlug = new Map<string, DocEntry>(parsedEntries.map((e) => [e.slug, e]))

export function getEntryBySlug(slug: string): DocEntry | undefined {
  const norm = slug.replace(/^\/+|\/+$/g, '')
  if (entriesBySlug.has(norm)) return entriesBySlug.get(norm)
  const path = pathForSlug(norm)
  return path ? entriesByPath.get(path) : undefined
}

export async function loadDocBody(entry: DocEntry): Promise<{ data: Record<string, unknown>; content: string }> {
  const key = `${DOCS_PREFIX}${entry.path}`
  const raw = eagerModules[key]
  if (raw === undefined) throw new Error(`docs: no body for ${entry.path}`)
  const fm = matter(raw)
  return { data: fm.data, content: fm.content }
}

// ---- Sidebar tree ---------------------------------------------------------

export type TreeNode = {
  name: string
  title: string
  slug: string
  order: number
  isPage: boolean
  children: TreeNode[]
}

function topLevelOrder(name: string): number {
  const idx = TOP_LEVEL_ORDER.indexOf(name)
  return idx === -1 ? 1000 + name.charCodeAt(0) : idx
}

function protocolOrder(name: string): number {
  const idx = PROTOCOL_SECTION_ORDER.indexOf(name)
  return idx === -1 ? 1000 + name.charCodeAt(0) : idx
}

function standardsOrder(name: string): number {
  const idx = STANDARDS_SECTION_ORDER.indexOf(name)
  return idx === -1 ? 1000 + name.charCodeAt(0) : idx
}

function ensureNode(parent: TreeNode, segment: string, fullSlug: string): TreeNode {
  let child = parent.children.find((c) => c.name === segment)
  if (!child) {
    let order = 500
    if (parent === root) order = topLevelOrder(fullSlug)
    else if (parent.slug === 'protocol') order = protocolOrder(segment)
    else if (parent.slug === 'standards') order = standardsOrder(segment)
    child = {
      name: segment,
      title: titleize(segment),
      slug: fullSlug,
      order,
      isPage: false,
      children: [],
    }
    parent.children.push(child)
  }
  return child
}

const root: TreeNode = { name: '', title: 'Docs', slug: '', order: 0, isPage: true, children: [] }

for (const entry of allEntries) {
  if (entry.path === 'README.md') {
    root.title = entry.title
    continue
  }
  const segments = entry.slug.split('/').filter(Boolean)
  let cursor = root
  for (let i = 0; i < segments.length; i++) {
    const last = i === segments.length - 1
    const fullSlug = segments.slice(0, i + 1).join('/')
    const node = ensureNode(cursor, segments[i], fullSlug)
    if (last) {
      node.isPage = true
      node.title = entry.title
      // Frontmatter `order` fine-tunes nested ordering, but a top-level node's
      // position is governed solely by TOP_LEVEL_ORDER (assigned in ensureNode).
      // Don't let a top-level doc's frontmatter (e.g. protocol/README.md's
      // `order: 0`) override the configured nav order.
      if (entry.order !== undefined && cursor !== root) node.order = entry.order
    }
    cursor = node
  }
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  for (const c of node.children) sortTree(c)
}
sortTree(root)

export const docsTree: TreeNode = root
