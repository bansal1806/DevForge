import { useEffect, useRef } from 'react'

const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

/** Calls `onUnlock` when the Konami code is typed (ignored while typing in a field). */
export function useKonami(onUnlock: () => void) {
  const callback = useRef(onUnlock)
  useEffect(() => {
    callback.current = onUnlock
  }, [onUnlock])

  useEffect(() => {
    let position = 0
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      position = key === SEQUENCE[position] ? position + 1 : key === SEQUENCE[0] ? 1 : 0
      if (position === SEQUENCE.length) {
        position = 0
        callback.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
