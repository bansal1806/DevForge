import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookMarked, Check, Code2, Compass, CornerDownLeft, GitPullRequest, LayoutDashboard, LogIn, LogOut,
  Monitor, Moon, Palette, Search, Star, Sun, User, CircleDot, Lock,
} from 'lucide-react'
import { useCommandPalette } from '../../contexts/CommandPalette'
import type { PaletteCommand } from '../../contexts/CommandPalette'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { getRepositories } from '../../lib/api'
import type { Repository } from '../../lib/api'
import { Kbd } from '../ui'
import { EASE_OUT, spring } from '../../lib/motion'
import styles from './CommandPalette.module.css'

// Items carry their id after this separator so values stay unique, but only
// the visible label and keywords take part in matching.
const ID_SEPARATOR = '\u0000'

/**
 * Predictable ranking: exact/prefix/word matches beat substring matches,
 * which beat in-order fuzzy matches; internal ids never match.
 */
function scoreCommand(value: string, search: string, keywords?: string[]) {
  const query = search.trim().toLowerCase()
  if (!query) return 1
  const label = value.split(ID_SEPARATOR)[0].toLowerCase()
  const haystacks = [label, ...(keywords || []).map((k) => k.toLowerCase())]

  let best = 0
  for (const text of haystacks) {
    const weight = text === label ? 1 : 0.8
    if (text === query) best = Math.max(best, 1 * weight)
    else if (text.startsWith(query)) best = Math.max(best, 0.9 * weight)
    else if (text.split(/[\s/._-]+/).some((word) => word.startsWith(query))) best = Math.max(best, 0.8 * weight)
    else if (text.includes(query)) best = Math.max(best, 0.6 * weight)
    else {
      let i = 0
      for (const ch of text) if (ch === query[i]) i++
      if (i === query.length) best = Math.max(best, 0.2 * weight)
    }
  }
  return best
}

function Item({ command, onRun }: { command: PaletteCommand, onRun: (c: PaletteCommand) => void }) {
  return (
    <Command.Item
      className={styles.item}
      value={`${command.label}${ID_SEPARATOR}${command.id}`}
      keywords={command.keywords}
      onSelect={() => onRun(command)}
    >
      <span className={styles.itemIcon}>{command.icon}</span>
      <span className={styles.itemLabel}>{command.label}</span>
      {command.hint && <span className={styles.itemHint}>{command.hint}</span>}
      {command.shortcut && (
        <span className={styles.keys}>
          {command.shortcut.map((k) => <Kbd key={k}>{k}</Kbd>)}
        </span>
      )}
    </Command.Item>
  )
}

function Group({ heading, children }: { heading: string, children: ReactNode }) {
  return <Command.Group heading={heading}>{children}</Command.Group>
}

/** ⌘K / Ctrl+K command palette: jump anywhere, run page actions, switch theme. */
export function CommandPalette() {
  const { open, setOpen, sources } = useCommandPalette()
  const { user } = useAuth()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [repos, setRepos] = useState<Repository[]>([])

  // Fresh repository list each time the palette opens
  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    getRepositories()
      .then((data) => { if (!cancelled) setRepos(data) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [open, user])

  // Lock page scroll while open (focus restore is handled by the provider)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  const run = (command: PaletteCommand) => {
    close()
    // Let the palette unmount before the action (e.g. opening a dialog)
    window.setTimeout(command.perform, 0)
  }

  const go = (path: string) => () => navigate(path)

  const navigation: PaletteCommand[] = user
    ? [
        { id: 'nav-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, perform: go('/dashboard') },
        { id: 'nav-repos', label: 'Your repositories', icon: <BookMarked size={16} />, perform: go('/repositories') },
        { id: 'nav-explore', label: 'Explore', icon: <Compass size={16} />, keywords: ['discover', 'trending'], perform: go('/explore') },
        { id: 'nav-prs', label: 'Pull requests', icon: <GitPullRequest size={16} />, perform: go('/pull-requests') },
        { id: 'nav-issues', label: 'Issues', icon: <CircleDot size={16} />, perform: go('/issues') },
        { id: 'nav-gists', label: 'Gists', icon: <Code2 size={16} />, keywords: ['snippets'], perform: go('/gists') },
        { id: 'nav-starred', label: 'Starred', icon: <Star size={16} />, perform: go('/starred') },
        { id: 'nav-profile', label: 'Your profile', icon: <User size={16} />, perform: go(`/profile/${user.id}`) },
        { id: 'nav-styleguide', label: 'Design system', icon: <Palette size={16} />, keywords: ['styleguide', 'components'], perform: go('/styleguide') },
      ]
    : [
        { id: 'nav-home', label: 'Home', icon: <LayoutDashboard size={16} />, perform: go('/') },
        { id: 'nav-styleguide', label: 'Design system', icon: <Palette size={16} />, perform: go('/styleguide') },
      ]

  const themeCommands: PaletteCommand[] = [
    { id: 'theme-dark', label: 'Night Forge theme', icon: <Moon size={16} />, keywords: ['dark', 'theme'], hint: preference === 'dark' ? 'current' : undefined, perform: () => setPreference('dark') },
    { id: 'theme-light', label: 'Daylight theme', icon: <Sun size={16} />, keywords: ['light', 'theme'], hint: preference === 'light' ? 'current' : undefined, perform: () => setPreference('light') },
    { id: 'theme-system', label: 'Match system theme', icon: <Monitor size={16} />, keywords: ['auto', 'os', 'theme'], hint: preference === 'system' ? 'current' : undefined, perform: () => setPreference('system') },
  ]

  const account: PaletteCommand[] = user
    ? [{ id: 'sign-out', label: 'Sign out', icon: <LogOut size={16} />, perform: () => { supabase.auth.signOut().then(() => navigate('/')) } }]
    : [{ id: 'sign-in', label: 'Sign in', icon: <LogIn size={16} />, perform: go('/auth') }]

  const contextual = sources
    .map((source) => ({ group: source.group, commands: source.getCommands() }))
    .filter((s) => s.commands.length > 0)

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className={styles.panel}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring}
          >
            <Command
              label="Command palette"
              loop
              filter={scoreCommand}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }}
            >
              <div className={styles.inputRow}>
                <Search size={18} aria-hidden="true" />
                <Command.Input
                  autoFocus
                  className={styles.input}
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Jump to a page, repository or action…"
                />
                <Kbd>Esc</Kbd>
              </div>

              <Command.List className={styles.list}>
                <Command.Empty className={styles.empty}>Nothing matches “{search}”.</Command.Empty>

                {contextual.map(({ group, commands }) => (
                  <Group key={group} heading={group}>
                    {commands.map((c) => <Item key={c.id} command={c} onRun={run} />)}
                  </Group>
                ))}

                {repos.length > 0 && (
                  <Group heading="Repositories">
                    {repos.slice(0, 50).map((repo) => (
                      <Item
                        key={repo.id}
                        onRun={run}
                        command={{
                          id: `repo-${repo.id}`,
                          label: repo.name,
                          hint: repo.description?.slice(0, 40) || undefined,
                          icon: repo.is_private ? <Lock size={16} /> : <BookMarked size={16} />,
                          keywords: ['repository', repo.description || ''],
                          perform: go(`/repo/${repo.id}`),
                        }}
                      />
                    ))}
                  </Group>
                )}

                <Group heading="Jump to">
                  {navigation.map((c) => <Item key={c.id} command={c} onRun={run} />)}
                </Group>

                <Group heading="Preferences">
                  {themeCommands.map((c) => (
                    <Item key={c.id} onRun={run} command={{ ...c, icon: c.hint ? <Check size={16} /> : c.icon }} />
                  ))}
                </Group>

                <Group heading="Account">
                  {account.map((c) => <Item key={c.id} command={c} onRun={run} />)}
                </Group>

                {search.trim() && (
                  <Command.Group heading="Search" forceMount>
                    <Command.Item
                      className={styles.item}
                      value={`Search Explore${ID_SEPARATOR}search`}
                      forceMount
                      onSelect={() => run({ id: 'search', label: '', perform: () => navigate(`/explore?q=${encodeURIComponent(search.trim())}`) })}
                    >
                      <span className={styles.itemIcon}><Search size={16} /></span>
                      <span className={styles.itemLabel}>Search Explore for “{search.trim()}”</span>
                    </Command.Item>
                  </Command.Group>
                )}
              </Command.List>

              <div className={styles.footer}>
                <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                <span><Kbd><CornerDownLeft size={11} /></Kbd> run</span>
                <span><Kbd>Ctrl</Kbd><Kbd>K</Kbd> toggle</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
