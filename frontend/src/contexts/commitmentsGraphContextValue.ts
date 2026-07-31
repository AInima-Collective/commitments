import { createContext } from 'react'
import type {
  AgreementsGraphPayload,
  MeshGraphPayload,
} from '../lib/graph/types'

export type GraphContextValue = {
  agreements: {
    data: AgreementsGraphPayload | undefined
    isLoading: boolean
    error: unknown
  }
  mesh: {
    data: MeshGraphPayload | undefined
    isLoading: boolean
    error: unknown
  }
  hasIndexer: boolean
}

/**
 * @internal — module-private React context wired by
 * {@link CommitmentsGraphProvider} and consumed by {@link useCommitmentsGraph}.
 * Lives in its own file so the provider module can stay component-only
 * (Vite/React Fast Refresh requirement).
 */
export const GraphContext = createContext<GraphContextValue | null>(null)
