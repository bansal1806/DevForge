import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Bug, Code2, GitFork, GitPullRequest, Hammer, LayoutDashboard, LogOut, Menu, Plus, Search, Shield, Star, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getRepositories } from '../../lib/api'
import { useCommandPalette, useRegisterCommands } from '../../contexts/CommandPalette'
import { Avatar, Button, IconButton, Kbd, Modal, ThemeToggle } from '../ui'
import NewRepositoryModal from '../Modals/NewRepositoryModal'
import NewGistModal from '../Modals/NewGistModal'
import styles from './Navbar.module.css'
import '../Dropdown.css'

const MOBILE_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: GitFork, label: 'Repositories', path: '/repositories' },
  { icon: GitPullRequest, label: 'Pull requests', path: '/pull-requests' },
  { icon: Bug, label: 'Issues', path: '/issues' },
  { icon: Code2, label: 'Gists', path: '/gists' },
  { icon: Star, label: 'Starred', path: '/starred' },
  { icon: BookOpen, label: 'Explore', path: '/explore' },
]

const dropdown = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.14 } },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.1 } },
}

export default function Navbar() {
  const [menu, setMenu] = useState<'new' | 'account' | null>(null)
  const [isNewRepoOpen, setIsNewRepoOpen] = useState(false)
  const [isNewGistOpen, setIsNewGistOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const { user } = useAuth()
  const { setRepositories } = useStore()
  const { setOpen: openPalette } = useCommandPalette()
  const navigate = useNavigate()
  const location = useLocation()

  // Profile name + platform role (admins see the observability link)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getCurrentUser()
      .then((me) => { if (!cancelled) { setIsAdmin(me.role === 'admin'); setDisplayName(me.name || null) } })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [user])

  // Close menus on outside click / Escape
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  useRegisterCommands('Create', [
    { id: 'create-repo', label: 'New repository', icon: <GitFork size={16} />, keywords: ['create', 'repo'], perform: () => setIsNewRepoOpen(true) },
    { id: 'create-gist', label: 'New gist', icon: <Code2 size={16} />, keywords: ['create', 'snippet'], perform: () => setIsNewGistOpen(true) },
  ])

  const name = displayName || (user?.user_metadata?.full_name as string | undefined) || user?.email?.split('@')[0] || 'You'

  const signOut = async () => {
    setMenu(null)
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <header className={styles.navbar} ref={navRef}>
      <IconButton className={styles.menuButton} label="Open navigation" icon={<Menu size={18} />} onClick={() => setMobileOpen(true)} />

      <Link to="/dashboard" className={styles.brand} aria-label="DevForge dashboard">
        <span className={styles.brandMark}><Hammer size={15} /></span>
        <span className={styles.brandName}>DevForge</span>
      </Link>

      <div className={styles.center}>
        <button
          type="button"
          className={styles.search}
          onClick={() => openPalette(true)}
          aria-label="Search or jump to (command palette)"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={16} />
          <span className={styles.searchText}>Search or jump to…</span>
          <span className={styles.searchKeys}><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>

      <div className={styles.actions}>
        <div className={styles.menuWrap}>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={15} />}
            aria-haspopup="menu"
            aria-expanded={menu === 'new'}
            onClick={() => setMenu(menu === 'new' ? null : 'new')}
          >
            <span className={styles.newLabel}>New</span>
          </Button>
          <AnimatePresence>
            {menu === 'new' && (
              <motion.div role="menu" className="dropdown-menu" variants={dropdown} initial="hidden" animate="visible" exit="exit">
                <button role="menuitem" className="dropdown-item" onClick={() => { setMenu(null); setIsNewRepoOpen(true) }}><GitFork size={14} /> New repository</button>
                <button role="menuitem" className="dropdown-item" onClick={() => { setMenu(null); setIsNewGistOpen(true) }}><Code2 size={14} /> New gist</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={styles.menuWrap}>
          <button
            className={styles.avatarButton}
            aria-label={`Account menu for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menu === 'account'}
            onClick={() => setMenu(menu === 'account' ? null : 'account')}
          >
            <Avatar name={name} size={32} />
          </button>
          <AnimatePresence>
            {menu === 'account' && (
              <motion.div role="menu" className={`dropdown-menu ${styles.accountMenu}`} variants={dropdown} initial="hidden" animate="visible" exit="exit">
                <div className={styles.accountHead}>
                  <Avatar name={name} size={36} />
                  <div className={styles.accountText}>
                    <strong>{name}</strong>
                    <span>{user?.email}</span>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <button role="menuitem" className="dropdown-item" onClick={() => { setMenu(null); navigate(`/profile/${user?.id}`) }}><User size={14} /> Your profile</button>
                {isAdmin && (
                  <button role="menuitem" className="dropdown-item" onClick={() => { setMenu(null); navigate('/admin') }}><Shield size={14} /> Admin dashboard</button>
                )}
                <div className="dropdown-divider" />
                <div className={styles.themeRow}>
                  <span>Theme</span>
                  <ThemeToggle showLabels={false} />
                </div>
                <div className="dropdown-divider" />
                <button role="menuitem" className="dropdown-item" onClick={signOut}><LogOut size={14} /> Sign out</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Modal open={mobileOpen} onClose={() => setMobileOpen(false)} side="right" title="Navigate">
        <nav className={styles.mobileNav} aria-label="Primary">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.mobileLink} ${location.pathname === item.path ? styles.mobileLinkActive : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={18} /> {item.label}
            </Link>
          ))}
        </nav>
      </Modal>

      <NewRepositoryModal
        isOpen={isNewRepoOpen}
        onClose={() => setIsNewRepoOpen(false)}
        onSuccess={() => { getRepositories().then(setRepositories).catch(() => undefined) }}
      />
      <NewGistModal
        isOpen={isNewGistOpen}
        onClose={() => setIsNewGistOpen(false)}
        onSuccess={() => { if (window.location.pathname === '/gists') window.location.reload() }}
      />
    </header>
  )
}
