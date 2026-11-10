import { Button } from './Button'
import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      size="sm"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '◐' : '◑'}</span>
      <span>{theme}</span>
    </Button>
  )
}
