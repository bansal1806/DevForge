import { lazy } from 'react'
import type { ComponentType } from 'react'

const RELOAD_KEY = 'devforge-chunk-reload'

/** sessionStorage can throw (blocked storage, some private modes) — treat that as "no flag". */
function readFlag() {
  try { return sessionStorage.getItem(RELOAD_KEY) } catch { return '1' }
}
function writeFlag(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(RELOAD_KEY)
    else sessionStorage.setItem(RELOAD_KEY, value)
  } catch { /* storage unavailable */ }
}

/**
 * React.lazy for route pages, resilient to redeploys: if a chunk 404s because
 * the user's tab still references an old build, reload once to pick up the new
 * asset names. A second failure (or no storage to remember the first) is
 * rethrown to the route's error boundary instead of reloading in a loop.
 */
export function lazyPage<T extends ComponentType<object>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().then(
      (mod) => {
        writeFlag(null)
        return mod
      },
      (err: unknown) => {
        if (!readFlag()) {
          writeFlag('1')
          window.location.reload()
          // Never resolves: the page is going away
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }
    )
  )
}
