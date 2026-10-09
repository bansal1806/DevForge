import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Bug, Code2, GitFork, GitPullRequest, LayoutDashboard, Lock, Star } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getRepositories } from '../../lib/api'
import { spring } from '../../lib/motion'
import styles from './Sidebar.module.css'

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: GitFork, label: 'Repositories', path: '/repositories', count: 'repos' as const },
  { icon: GitPullRequest, label: 'Pull requests', path: '/pull-requests' },
  { icon: Bug, label: 'Issues', path: '/issues' },
  { icon: Code2, label: 'Gists', path: '/gists' },
  { icon: Star, label: 'Starred', path: '/starred' },
  { icon: BookOpen, label: 'Explore', path: '/explore' },
]

// Same palette as avatars, so a repo keeps its color everywhere
const DOT_COLORS = ['#e8541b', '#c2410c', '#6d45d6', '#0f766e', '#2a62c9', '#9d174d', '#b45309', '#4d5b6b']
const dotFor = (id: string) => {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return DOT_COLORS[hash % DOT_COLORS.length]
}

type ApiStatus = 'checking' | 'online' | 'offline'

/** Pings the real health endpoint instead of claiming a status. */
function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('checking')
  useEffect(() => {
    let cancelled = false
    const check = () =>
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => { if (!cancelled) setStatus(r.ok ? 'online' : 'offline') })
        .catch(() => { if (!cancelled) setStatus('offline') })
    check()
    const timer = window.setInterval(check, 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  return status
}

export default function Sidebar() {
  const location = useLocation()
  const { repositories, setRepositories } = useStore()
  const status = useApiStatus()

  // Recent repos must not depend on having visited the dashboard first
  useEffect(() => {
    if (repositories.length > 0) return
    let cancelled = false
    getRepositories().then((data) => { if (!cancelled) setRepositories(data) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [repositories.length, setRepositories])

  const recent = [...repositories]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6)

  return (
    <aside className={styles.sidebar} aria-label="Primary">
      <nav className={styles.section}>
        {NAV.map((item) => {
          const active = location.pathname === item.path
          const count = item.count === 'repos' && repositories.length > 0 ? repositories.length : null
          return (
            <Link key={item.path} to={item.path} className={`${styles.link} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
              {active && <motion.span layoutId="sidebar-active" className={styles.activeBg} transition={spring} />}
              <item.icon size={17} className={styles.icon} />
              <span className={styles.label}>{item.label}</span>
              {count !== null && <span className={styles.count}>{count}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={styles.section}>
        <div className={styles.heading}>Recent repositories</div>
        {recent.length === 0 ? (
          <div className={styles.emptyRecent}>No repositories yet</div>
        ) : (
          recent.map((repo) => {
            const active = location.pathname === `/repo/${repo.id}`
            return (
              <Link key={repo.id} to={`/repo/${repo.id}`} className={`${styles.repo} ${active ? styles.repoActive : ''}`} title={repo.name}>
                <span className={styles.dot} style={{ background: dotFor(repo.id) }} aria-hidden="true" />
                <span className={styles.repoName}>{repo.name}</span>
                {repo.is_private && <Lock size={12} className={styles.lock} aria-label="Private" />}
              </Link>
            )
          })
        )}
      </div>

      <div className={styles.footer}>
        <span className={`${styles.status} ${styles[status]}`} aria-hidden="true" />
        {status === 'checking' ? 'Checking API…' : status === 'online' ? 'API online' : 'API unreachable'}
      </div>
    </aside>
  )
}
