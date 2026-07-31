import { Navigate, useParams } from 'react-router-dom'

/**
 * Legacy `/mutuals` and `/mutuals/:mutualId` → `/marketplace[/...]` redirects.
 * The mutuals discovery list became the risk-coverage Marketplace; these keep
 * old links and bookmarks working. The `:mutualId` is preserved when present.
 */
export function MutualsRedirect() {
  const { mutualId } = useParams<{ mutualId: string }>()
  const to = mutualId ? `/app/marketplace/${mutualId}` : '/app/marketplace'
  return <Navigate to={to} replace />
}
