import { NavLink, useLocation } from 'react-router-dom'
import { docsTree, type TreeNode } from '../../docs/loader'

function isActiveSection(node: TreeNode, pathname: string): boolean {
  // Pathname like `/app/docs/protocol/architecture/overview`. The node's slug
  // is a path under /app/docs, e.g. `protocol`. A section is active when the
  // current route is at or below the section root.
  if (!node.slug) return pathname === '/app/docs' || pathname === '/app/docs/'
  const prefix = `/app/docs/${node.slug}`
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function findNode(node: TreeNode, slug: string): TreeNode | undefined {
  if (node.slug === slug) return node
  for (const child of node.children) {
    const found = findNode(child, slug)
    if (found) return found
  }
  return undefined
}

function NodeItem({
  node,
  depth,
  pathname,
  forceExpanded,
}: {
  node: TreeNode
  depth: number
  pathname: string
  forceExpanded?: boolean
}) {
  const hasChildren = node.children.length > 0
  // At the root level, only expand a node when the user is inside it. Below
  // the root we always show the full subtree so context is visible.
  const expanded = forceExpanded ?? (depth === 0 ? isActiveSection(node, pathname) : true)

  if (!hasChildren && node.isPage) {
    return (
      <NavLink
        to={`/app/docs/${node.slug}`}
        end
        className="ds-doc-sidebar-link"
        style={{ paddingLeft: `calc(0.75rem + ${depth * 0.75}rem)` }}
      >
        {node.title}
      </NavLink>
    )
  }
  return (
    <div className="ds-doc-sidebar-group">
      {node.isPage ? (
        <NavLink
          to={`/app/docs/${node.slug}`}
          end
          className="ds-doc-sidebar-link ds-doc-sidebar-link--section"
          style={{ paddingLeft: `calc(0.75rem + ${depth * 0.75}rem)` }}
        >
          {node.title}
        </NavLink>
      ) : (
        <div
          className="ds-doc-sidebar-section"
          style={{ paddingLeft: `calc(0.75rem + ${depth * 0.75}rem)` }}
        >
          {node.title}
        </div>
      )}
      {expanded && (
        <div className="ds-doc-sidebar-children">
          {node.children.map((child) => (
            <NodeItem
              key={child.slug || child.name}
              node={child}
              depth={depth + 1}
              pathname={pathname}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DocsSidebar({ rootSlug = '' }: { rootSlug?: string } = {}) {
  const { pathname } = useLocation()
  const root = rootSlug ? findNode(docsTree, rootSlug) : docsTree
  if (!root) return null
  const rootHref = root.slug ? `/app/docs/${root.slug}` : '/app/docs'
  return (
    <nav className="ds-doc-sidebar" aria-label="Documentation">
      <NavLink to={rootHref} end className="ds-doc-sidebar-link ds-doc-sidebar-link--root">
        {root.title || 'Overview'}
      </NavLink>
      {root.children.map((node) => (
        <NodeItem
          key={node.slug || node.name}
          node={node}
          depth={0}
          pathname={pathname}
          forceExpanded
        />
      ))}
    </nav>
  )
}
