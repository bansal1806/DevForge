import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Bell, Plus, GitBranch, GitFork, User, Shield, LogOut, Code2, Bug } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/api'
import { useCommandPalette, useRegisterCommands } from '../../contexts/CommandPalette'
import { Kbd } from '../ui'
import NewRepositoryModal from '../Modals/NewRepositoryModal'
import NewGistModal from '../Modals/NewGistModal'
import styles from './Navbar.module.css'
import '../Dropdown.css'

export default function Navbar() {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [isNewRepoOpen, setIsNewRepoOpen] = useState(false)
  const [isNewGistOpen, setIsNewGistOpen] = useState(false)
  const { setOpen: openPalette } = useCommandPalette()
  const navRef = useRef<HTMLElement>(null)
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  // Only platform admins see the observability dashboard link
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getCurrentUser()
      .then((me) => { if (!cancelled) setIsAdmin(me.role === 'admin') })
      .catch(() => { if (!cancelled) setIsAdmin(false) })
    return () => { cancelled = true }
  }, [user])
  const { setRepositories, setLoading } = useStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setActiveDropdown(null)
  }

  // Global actions available from the command palette
  useRegisterCommands('Create', [
    { id: 'create-repo', label: 'New repository', icon: <GitFork size={16} />, keywords: ['create', 'repo'], perform: () => setIsNewRepoOpen(true) },
    { id: 'create-gist', label: 'New gist', icon: <Code2 size={16} />, keywords: ['create', 'snippet'], perform: () => setIsNewGistOpen(true) },
  ])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dropdownVariants = {
    hidden: { opacity: 0, scale: 0.95, y: -5 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
    exit: { opacity: 0, scale: 0.95, y: -5, transition: { duration: 0.15 } }
  }

  return (
    <motion.nav
      ref={navRef}
      className={styles.navbar}
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
    >
      {/* Brand */}
      <Link to="/dashboard" className={styles['navbar-brand']}>
        <div className={styles['navbar-logo']}>
          <GitBranch size={18} color="white" />
        </div>
        <span className={styles['navbar-title']}>
          Dev<span className={styles['navbar-title-accent']}>Forge</span>
        </span>
      </Link>

      {/* Search Bar */}
      <div className={styles['navbar-center']}>
        <button
          type="button"
          className={styles['navbar-search']}
          onClick={() => openPalette(true)}
          aria-label="Open command palette"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={16} className={styles['navbar-search-icon']} />
          <span className={styles['navbar-search-placeholder']}>Search or jump to…</span>
          <span className={styles['navbar-search-shortcut']}>
            <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div className={styles['navbar-actions']}>
        <div style={{ position: 'relative' }}>
          <motion.button
            className={styles['navbar-new-btn']}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveDropdown(activeDropdown === 'new' ? null : 'new')}
          >
            <Plus size={16} /> New
          </motion.button>

          <AnimatePresence>
            {activeDropdown === 'new' && (
              <motion.div className="dropdown-menu" variants={dropdownVariants} initial="hidden" animate="visible" exit="exit">
                <button className="dropdown-item" onClick={() => { setActiveDropdown(null); setIsNewRepoOpen(true) }}><GitFork size={14}/> New Repository</button>
                <button className="dropdown-item" onClick={() => { setActiveDropdown(null); setIsNewGistOpen(true) }}><Code2 size={14}/> New Gist</button>
                <Link to="/repositories" className="dropdown-item" onClick={() => setActiveDropdown(null)}><Bug size={14}/> New Issue</Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            className={styles['navbar-action-btn']}
            onClick={() => setActiveDropdown(activeDropdown === 'notifications' ? null : 'notifications')}
          >
            <Bell size={18} />
            <span className={styles['notification-dot']} />
          </button>

          <AnimatePresence>
            {activeDropdown === 'notifications' && (
              <motion.div className="dropdown-menu" style={{ width: '250px' }} variants={dropdownVariants} initial="hidden" animate="visible" exit="exit">
                <div style={{ padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Notifications</div>
                <div className="dropdown-divider" />
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No new notifications</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ position: 'relative' }}>
          <div
            className={styles['navbar-avatar']}
            onClick={() => setActiveDropdown(activeDropdown === 'avatar' ? null : 'avatar')}
            style={{ cursor: 'pointer', textTransform: 'uppercase' }}
          >
            {user?.email ? user.email.charAt(0) : 'U'}
          </div>

          <AnimatePresence>
            {activeDropdown === 'avatar' && (
              <motion.div className="dropdown-menu" variants={dropdownVariants} initial="hidden" animate="visible" exit="exit">
                <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Signed in as <b style={{ color: 'var(--text-primary)'}}>{user?.email}</b></div>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { setActiveDropdown(null); navigate(`/profile/${user?.id}`) }}><User size={14}/> Your Profile</button>
                {isAdmin && (
                  <button className="dropdown-item" onClick={() => { setActiveDropdown(null); navigate('/admin') }}><Shield size={14}/> Admin dashboard</button>
                )}
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleSignOut}><LogOut size={14}/> Sign out</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <NewRepositoryModal
        isOpen={isNewRepoOpen}
        onClose={() => setIsNewRepoOpen(false)}
        onSuccess={() => {
          setLoading(true)
          import('../../lib/api').then(api => api.getRepositories()).then(setRepositories).finally(() => setLoading(false))
        }}
      />

      <NewGistModal
        isOpen={isNewGistOpen}
        onClose={() => setIsNewGistOpen(false)}
        onSuccess={() => {
          // If on gists page, the list will need refresh. For now just show toast or let user navigate.
          if (window.location.pathname === '/gists') {
             window.location.reload();
          }
        }}
      />
    </motion.nav>
  )
}
