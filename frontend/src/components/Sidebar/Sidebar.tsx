import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  GitFork,
  Code2,
  Bug,
  GitPullRequest,
  BookOpen,
  Star,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import styles from './Sidebar.module.css'

const sidebarVariants = {
  initial: { x: -280, opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay: 0.1 },
  },
}

const itemVariants = {
  initial: { x: -20, opacity: 0 },
  animate: (i: number) => ({
    x: 0,
    opacity: 1,
    transition: { delay: 0.2 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

export default function Sidebar() {
  const location = useLocation()
  const { repositories } = useStore()

  // Use the first 5 repositories as "recent"
  const recentRepos = repositories.slice(0, 5)

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: GitFork, label: 'Repositories', path: '/repositories', badge: repositories.length > 0 ? repositories.length.toString() : undefined },
    { icon: GitPullRequest, label: 'Pull Requests', path: '/pull-requests' },
    { icon: Bug, label: 'Issues', path: '/issues', badge: '3' },
    { icon: Code2, label: 'Gists', path: '/gists' },
    { icon: Star, label: 'Starred', path: '/starred' },
    { icon: BookOpen, label: 'Explore', path: '/explore' },
  ]

  return (
    <motion.aside
      className={styles.sidebar}
      variants={sidebarVariants}
      initial="initial"
      animate="animate"
    >
      {/* Main Navigation */}
      <div className={styles['sidebar-section']}>
        <div className={styles['sidebar-section-label']}>Navigation</div>
        {navItems.map((item, i) => {
          const isActive = location.pathname === item.path
          return (
            <motion.div key={item.label} custom={i} variants={itemVariants} initial="initial" animate="animate">
              <Link
                to={item.path}
                className={`${styles['sidebar-link']} ${isActive ? styles['sidebar-link--active'] : ''}`}
              >
                <item.icon size={18} className={styles['sidebar-link-icon']} />
                {item.label}
                {item.badge && <span className={styles['sidebar-link-badge']}>{item.badge}</span>}
              </Link>
            </motion.div>
          )
        })}
      </div>

      <div className={styles['sidebar-divider']} />

      {/* Recent Repositories */}
      <div className={styles['sidebar-repos']}>
        <div className={styles['sidebar-section-label']} style={{ padding: '0 12px', marginBottom: '8px' }}>
          Recent Repositories
        </div>
        {recentRepos.length === 0 ? (
          <div style={{ padding: '0 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No repositories yet</div>
        ) : (
          recentRepos.map((repo, i) => (
            <motion.div key={repo.id} custom={i + navItems.length} variants={itemVariants} initial="initial" animate="animate">
              <Link to={`/repo/${repo.id}`} className={styles['sidebar-repo-item']}>
                <span className={styles['sidebar-repo-dot']} style={{ background: colors[i % colors.length] }} />
                {repo.name}
              </Link>
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className={styles['sidebar-footer']}>
        <div className={styles['sidebar-footer-info']}>
          <span className={styles['sidebar-footer-status']} />
          API Connected
        </div>
      </div>
    </motion.aside>
  )
}
