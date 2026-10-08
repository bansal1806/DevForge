import { Suspense, lazy, useState } from 'react'
import { useCommandPalette } from '../../contexts/CommandPalette'

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })))

/**
 * Mounts the palette (and cmdk with it) the first time it opens, then keeps it
 * mounted so later opens are instant and the close animation can play.
 */
export function CommandPaletteHost() {
  const { open } = useCommandPalette()
  const [wanted, setWanted] = useState(open)
  if (open && !wanted) setWanted(true)
  if (!wanted) return null
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  )
}
