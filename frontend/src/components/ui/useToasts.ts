import { useContext, type ReactNode } from 'react'
import { ToastContext } from './toastContext'
import type { ToastTone } from './Toast'

/**
 * Caller-supplied shape passed to {@link useToasts}.push. The shape is
 * deliberately a strict subset of the {@link Toast} primitive's slot
 * vocabulary — see components/ui/CONTRIBUTING.md §1 (composition) and §6
 * (no imperative emitters).
 */
export type PushArgs = {
  tone?: ToastTone
  title?: ReactNode
  body?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}

/** Stored in the provider's state list; carries the synthesized id. */
export type ToastState = PushArgs & { id: string }

/** Public hook return shape. */
export type ToastContextValue = {
  toasts: ToastState[]
  push: (args: PushArgs) => string
  dismiss: (id: string) => void
}

/**
 * Returns the active toast list plus push/dismiss dispatchers.
 *
 * Throws if called outside a {@link ToastProvider} so missing-provider bugs
 * surface during render instead of silently no-oping.
 */
export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToasts must be called inside <ToastProvider>')
  }
  return ctx
}
