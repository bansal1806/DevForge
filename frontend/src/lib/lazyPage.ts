import { lazy } from 'react'
import type { ComponentType } from 'react'

const RELOAD_KEY = 'devforge-chunk-reload'

/**
 * React.lazy for route pages, resilient to redeploys: if a chunk 404s because
 * the user's tab still references an old build, reload once to pick up the new
 * asset names. A second failure is rethrown to the route's error boundary.
 */
export function lazyPage<T extends ComponentType<object>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().then(
      (mod) => {
        sessionStorage.removeItem(RELOAD_KEY)
        return mod
      },
      (err: unknown) => {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1')
          window.location.reload()
          // Never resolves: the page is going away
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }
    )
  )
}
