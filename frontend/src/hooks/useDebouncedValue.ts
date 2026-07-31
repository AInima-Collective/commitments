import { useEffect, useState } from 'react'

/**
 * Returns `value` after `delayMs` of inactivity. Useful for live form
 * validation that should only run after the user pauses typing — debounce
 * the input value, then run validation against the debounced result so the
 * UI doesn't yell on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
