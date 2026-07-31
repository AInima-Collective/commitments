import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="ds-btn ds-btn--sm"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '◐' : '◑'}</span>
      <span>{theme}</span>
    </button>
  )
}
