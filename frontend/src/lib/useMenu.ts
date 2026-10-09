import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const ITEMS = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])'

/**
 * WAI-ARIA menu-button keyboard behaviour for a `role="menu"` popup:
 * focus moves to the first item on open; ↑/↓/Home/End move between items;
 * Escape closes and returns focus to the trigger; Tab closes; clicking
 * outside closes.
 */
export function useMenu(
  open: boolean,
  onClose: () => void,
  menuRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])

    // Wait a frame for the popup to mount (it animates in)
    const raf = requestAnimationFrame(() => items()[0]?.focus())

    const onKeyDown = (e: KeyboardEvent) => {
      const menu = menuRef.current
      if (!menu) return
      const list = items()
      const index = list.indexOf(document.activeElement as HTMLElement)
      const inside = menu.contains(document.activeElement) || triggerRef.current?.contains(document.activeElement)
      if (!inside) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onCloseRef.current()
          triggerRef.current?.focus()
          break
        case 'ArrowDown':
          e.preventDefault()
          list[(index + 1) % list.length]?.focus()
          break
        case 'ArrowUp':
          e.preventDefault()
          list[(index - 1 + list.length) % list.length]?.focus()
          break
        case 'Home':
          e.preventDefault()
          list[0]?.focus()
          break
        case 'End':
          e.preventDefault()
          list[list.length - 1]?.focus()
          break
        case 'Tab':
          onCloseRef.current()
          break
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onCloseRef.current()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown)
    const menuEl = menuRef.current
    const triggerEl = triggerRef.current
    return () => {
      // Closing with focus still on an item (e.g. an item opened a dialog): hand focus back
      // to the trigger so it isn't lost when the item unmounts, and dialogs restore to it
      if (menuEl?.contains(document.activeElement)) triggerEl?.focus()
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, menuRef, triggerRef])
}
