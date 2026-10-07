import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface PaletteCommand {
  id: string
  label: string
  /** Secondary text shown on the right */
  hint?: string
  icon?: ReactNode
  /** Extra search terms */
  keywords?: string[]
  /** Keys to display, e.g. ['Ctrl', 'S'] */
  shortcut?: string[]
  perform: () => void
}

export interface CommandSource {
  group: string
  /** Read at render time, so labels/visibility stay current without re-registering */
  getCommands: () => PaletteCommand[]
}

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  sources: CommandSource[]
  register: (key: string, source: CommandSource) => void
  unregister: (key: string) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const openRef = useRef(false)
  // Captured before the palette renders: its input autofocuses on mount, so
  // reading document.activeElement any later would return the palette itself
  const opener = useRef<HTMLElement | null>(null)

  const setOpen = useCallback((next: boolean) => {
    if (next === openRef.current) return
    if (next) {
      opener.current = document.activeElement as HTMLElement | null
    } else {
      const target = opener.current
      window.setTimeout(() => target?.focus?.(), 0)
    }
    openRef.current = next
    setOpenState(next)
  }, [])

  const [registry, setRegistry] = useState<Map<string, CommandSource>>(() => new Map())

  const register = useCallback((key: string, source: CommandSource) => {
    setRegistry((current) => new Map(current).set(key, source))
  }, [])

  const unregister = useCallback((key: string) => {
    setRegistry((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
  }, [])

  const toggle = useCallback(() => setOpen(!openRef.current), [setOpen])

  // Ctrl/Cmd+K opens the palette from anywhere, even while typing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle, sources: [...registry.values()], register, unregister }),
    [open, setOpen, toggle, registry, register, unregister]
  )

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return ctx
}

/**
 * Contribute commands to the palette while the calling component is mounted.
 * The latest `commands` are read when the palette renders, so passing a new
 * array every render is fine (no re-registration, no render loops).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRegisterCommands(group: string, commands: PaletteCommand[]) {
  const { register, unregister } = useCommandPalette()
  const key = useId()
  const latest = useRef(commands)

  useEffect(() => {
    latest.current = commands
  })

  useEffect(() => {
    register(key, { group, getCommands: () => latest.current })
    return () => unregister(key)
  }, [key, group, register, unregister])
}
