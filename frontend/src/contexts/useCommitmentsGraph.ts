import { useContext } from 'react'
import { GraphContext, type GraphContextValue } from './commitmentsGraphContextValue'

export function useCommitmentsGraph(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) {
    throw new Error('useCommitmentsGraph must be used inside CommitmentsGraphProvider')
  }
  return ctx
}
