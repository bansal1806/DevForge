import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

export type ThemePreference = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

// Night Forge stays the default until every page has a Daylight design;
// the inline script in index.html must use the same key and default.
const STORAGE_KEY = 'devforge-theme'
const DEFAULT_PREFERENCE: ThemePreference = 'system'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: DEFAULT_PREFERENCE,
  resolved: 'dark',
  setPreference: () => undefined,
})

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'system' || stored === 'dark' || stored === 'light') return stored
  } catch {
    // Storage unavailable (private mode, blocked cookies)
  }
  return DEFAULT_PREFERENCE
}

// The OS color scheme as an external store, so "system" follows it live
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')
const subscribeToScheme = (onChange: () => void) => {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const systemDark = useSyncExternalStore(subscribeToScheme, () => darkQuery().matches, () => true)
  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f0c0a' : '#faf6f1')
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not persisted; still applies for this session
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext)
