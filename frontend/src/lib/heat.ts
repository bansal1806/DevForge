import type { PointerEvent } from 'react'

/**
 * Cursor heat: records the pointer position on the element as CSS variables
 * (--heat-x / --heat-y) so a `.heat-surface` glow can follow it. Writes
 * straight to the style — no React state, no re-renders.
 */
export function trackHeat(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--heat-x', `${e.clientX - rect.left}px`)
  el.style.setProperty('--heat-y', `${e.clientY - rect.top}px`)
}
