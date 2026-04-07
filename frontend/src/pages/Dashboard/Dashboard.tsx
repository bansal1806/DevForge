import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useStore } from '../../store/useStore'
import { getRepositories, getActivity } from '../../lib/api'
import {
  GitFork,
  GitCommit,
  GitPullRequest,
  Bug,
  Star,
  ArrowUpRight,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react'
import styles from './Dashboard.module.css'



const feedIconMap: Record<string, { icon: typeof GitCommit; color: string }> = {
  commit: { icon: GitCommit, color: 'purple' },
  pr: { icon: GitPullRequest, color: 'emerald' },
  issue: { icon: Bug, color: 'amber' },
  star: { icon: Star, color: 'blue' },
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

export default function Dashboard() {
  const { user } = useAuth()
  const { 
    repositories, setRepositories, 
    activity, setActivity,
    loading, setLoading, setError 
  } = useStore()

  useEffect(() => {
    if (user?.id) {
      setLoading(true)
      Promise.all([
        getRepositories(),
        getActivity()
      ])
        .then(([repos, activities]) => {
          setRepositories(repos)
          setActivity(activities)
        })
        .catch((err) => {
          console.error(err)
          setError('Failed to load dashboard data')
        })
        .finally(() => setLoading(false))
    }
  }, [user?.id, setRepositories, setActivity, setLoading, setError])

  const statsData = [
    { icon: GitFork, color: 'blue', value: repositories.length.toString(), label: 'Repositories', trend: '+1', trendDir: 'up' as const },
    { icon: GitCommit, color: 'purple', value: activity.filter(a => a.type === 'commit').length.toString(), label: 'Recent Commits', trend: 'New', trendDir: 'up' as const },
    { icon: GitPullRequest, color: 'emerald', value: activity.filter(a => a.type === 'pr').length.toString(), label: 'Active PRs', trend: '0', trendDir: 'up' as const },
    { icon: Bug, color: 'amber', value: activity.filter(a => a.type === 'issue').length.toString(), label: 'Open Issues', trend: '0', trendDir: 'up' as const },
  ]

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <motion.div
        className={styles['dashboard-header']}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <h1 className={styles['dashboard-greeting']}>
          Good afternoon, <span className="text-gradient">{user?.email?.split('@')[0] || 'Developer'}</span> 👋
        </h1>
        <p className={styles['dashboard-greeting-sub']}>
          Here's what's happening across your projects today.
        </p>
      </motion.div>

      {/* Activity Stats */}
      <motion.div
        className={styles['activity-cards']}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {statsData.map((item) => (
          <motion.div
            key={item.label}
            className={`${styles['activity-card']} ${styles[`activity-card--${item.color}`]}`}
            variants={itemVariants}
            whileHover={{ y: -2 }}
          >
            <div className={styles['activity-card-top']}>
              <div className={`${styles['activity-card-icon']} ${styles[`activity-card-icon--${item.color}`]}`}>
                <item.icon size={20} />
              </div>
              <span className={`${styles['activity-card-trend']} ${styles[`activity-card-trend--${item.trendDir}`]}`}>
                <TrendingUp size={12} /> {item.trend}
              </span>
            </div>
            <div className={styles['activity-card-value']}>{item.value}</div>
            <div className={styles['activity-card-label']}>{item.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Repositories */}
      <motion.div
        className={styles.section}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className={styles['section-header']}>
          <h2 className={styles['section-title']}>Your Repositories</h2>
          <Link to="/repositories" className={styles['section-action']}>
            View all <ArrowRight size={14} />
          </Link>
        </div>

        <div className={styles['repo-grid']}>
          {loading ? (
             <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading repositories...</div>
          ) : repositories.length === 0 ? (
             <div style={{ color: 'var(--text-muted)', padding: '24px' }}>You haven't created any repositories yet.</div>
          ) : (
            repositories.map((repo, i) => (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.08, ease: 'easeOut' }}
              >
                <Link to={`/repo/${repo.id}`} className={styles['repo-card']}>
                  <div className={styles['repo-card-header']}>
                    <span className={styles['repo-card-dot']} style={{ background: '#3b82f6' }} />
                    <span className={styles['repo-card-name']}>{repo.name}</span>
                    <span className={styles['repo-card-visibility']}>{repo.is_private ? 'private' : 'public'}</span>
                  </div>
                  <p className={styles['repo-card-desc']}>{repo.description || 'No description provided.'}</p>
                  <div className={styles['repo-card-meta']}>
                    <span className={styles['repo-card-meta-item']}>
                      <span className={styles['repo-card-lang-dot']} style={{ background: '#3178c6' }} />
                      TS/JS
                    </span>
                    <span className={styles['repo-card-meta-item']}>
                      <Star size={12} /> 0
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>

      {/* Activity Feed */}
      <motion.div
        className={styles.section}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className={styles['section-header']}>
          <h2 className={styles['section-title']}>Recent Activity</h2>
          <Link to="/repositories" className={styles['section-action']}>
            <Clock size={12} /> Full history
          </Link>
        </div>

        <div className={styles['activity-feed']}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading activity...</div>
          ) : activity.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>No recent activity to show.</div>
          ) : (
            activity.map((item, i) => {
              const iconData = feedIconMap[item.type] || feedIconMap.star
              return (
                <Link to={item.type === 'issue' ? `/repo/${item.repo_id}/issues/${item.id}` : item.type === 'pr' ? `/repo/${item.repo_id}/pull-requests/${item.id}` : `/repo/${item.repo_id}`} key={i}>
                  <motion.div
                    className={styles['activity-feed-item']}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.55 + i * 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  >
                    <div className={`${styles['activity-feed-icon']} ${styles[`activity-feed-icon--${iconData.color}`]}`}>
                      <iconData.icon size={16} />
                    </div>
                    <div className={styles['activity-feed-content']}>
                      <div className={styles['activity-feed-title']}>
                        {item.type === 'commit' ? 'Pushed commit to' : item.type === 'pr' ? 'Opened PR on' : 'Opened issue in'}{' '}
                        <span className={styles['activity-feed-repo']}>{item.repo?.name || 'repository'}</span>
                      </div>
                      <div className={styles['activity-feed-msg']}>{item.message || item.title || 'No message provided'}</div>
                      <div className={styles['activity-feed-time']}>{new Date(item.created_at).toLocaleTimeString()}</div>
                    </div>
                    <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </motion.div>
                </Link>
              )
            })
          )}
        </div>
      </motion.div>
    </div>
  )
}
