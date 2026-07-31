import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from './themeContext'

/**
 * Returns the current theme + setters from the nearest {@link ThemeProvider}.
 * Throws if called outside a provider so missing-provider bugs surface during
 * render instead of silently no-oping.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
