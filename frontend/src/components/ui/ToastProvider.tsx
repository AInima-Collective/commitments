import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Toast } from './Toast'
import { ToastContext } from './toastContext'
import type { PushArgs, ToastContextValue, ToastState } from './useToasts'

const STACK_LIMIT = 3
const AUTO_DISMISS_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([])
  // Monotonic id ref keeps tests deterministic (no crypto.randomUUID, no
  // Math.random) and survives strict-mode double-renders cleanly.
  const idRef = useRef(0)
  // Track every active auto-dismiss timer so we can clear on dismiss / unmount.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (args: PushArgs): string => {
      idRef.current += 1
      const id = String(idRef.current)
      const next: ToastState = { id, ...args }
      setToasts((prev) => {
        const appended = [...prev, next]
        if (appended.length <= STACK_LIMIT) return appended
        // FIFO eviction — clear the evicted toast's timer before dropping it.
        const overflow = appended.length - STACK_LIMIT
        const evicted = appended.slice(0, overflow)
        for (const e of evicted) {
          const timer = timersRef.current.get(e.id)
          if (timer !== undefined) {
            clearTimeout(timer)
            timersRef.current.delete(e.id)
          }
        }
        return appended.slice(overflow)
      })
      // Schedule auto-dismiss for non-danger tones; danger is sticky.
      if (args.tone !== 'danger') {
        const timer = setTimeout(() => {
          // Read latest dismiss closure via the ref of state-setter; calling
          // the stable `dismiss` is safe because it filters by id.
          dismiss(id)
        }, AUTO_DISMISS_MS)
        timersRef.current.set(id, timer)
      }
      return id
    },
    [dismiss],
  )

  // Clear every pending timer when the provider unmounts so timers don't
  // outlive the React tree (matters in tests + hot-reload).
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="ds-toast-region ds-toast-region--top-right"
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            tone={t.tone}
            title={t.title}
            icon={t.icon}
            actions={t.actions}
            onDismiss={() => dismiss(t.id)}
          >
            {t.body}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
