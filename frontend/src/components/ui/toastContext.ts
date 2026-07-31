import { createContext } from 'react'
import type { ToastContextValue } from './useToasts'

/**
 * @internal — module-private React context wired by {@link ToastProvider}
 * and consumed by {@link useToasts}. Lives in its own file so the provider
 * module can stay component-only (Vite/React Fast Refresh requirement).
 *
 * Never re-export this from `components/ui/index.ts`. Pages call
 * `useToasts()`; they should not read this context directly.
 */
export const ToastContext = createContext<ToastContextValue | null>(null)
