import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const APP = 'DevForge'
/** Stop waiting for a heading after this long (slow page / no h1). */
const GIVE_UP_MS = 4000

/**
 * After each client-side navigation, once the new page has rendered its <h1>:
 * - document.title becomes "<h1> · DevForge" (tabs, history, screen readers)
 * - focus moves to <main>, so keyboard and screen-reader users start at the
 *   new content instead of wherever the old page left them.
 * The first load keeps normal browser behaviour.
 */
export function useRouteAnnouncer(mainId = 'main') {
  const { pathname } = useLocation()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    const main = document.getElementById(mainId)
    if (!main) return
    // Compare paths rather than counting runs: StrictMode runs effects twice
    const initial = lastPath.current === null || lastPath.current === pathname
    lastPath.current = pathname
    let done = false

    const settle = () => {
      const text = main.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()
      // Skeletons have no h1 and some pages render it empty until data arrives
      if (!text || main.querySelector('[aria-busy="true"]')) return false
      document.title = `${text} · ${APP}`
      // Don't steal focus from something on the new page that already took it (e.g. a dialog)
      if (!initial && (document.activeElement === document.body || !main.contains(document.activeElement))) {
        main.focus({ preventScroll: true })
      }
      done = true
      return true
    }

    if (settle()) return
    const observer = new MutationObserver(() => { if (!done && settle()) observer.disconnect() })
    observer.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-busy'] })
    const timer = window.setTimeout(() => {
      observer.disconnect()
      if (!done) document.title = APP
    }, GIVE_UP_MS)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [pathname, mainId])
}
