import { createContext } from 'react'

export type Theme = 'light' | 'dark'

export type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

/**
 * @internal — module-private React context wired by {@link ThemeProvider}
 * and consumed by {@link useTheme}. Lives in its own file so the provider
 * module can stay component-only (Vite/React Fast Refresh requirement).
 *
 * Never re-export this from `components/ui/index.ts`. Pages call
 * `useTheme()`; they should not read this context directly.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null)

export const THEME_STORAGE_KEY = 'commitments.theme'
