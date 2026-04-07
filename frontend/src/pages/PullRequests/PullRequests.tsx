import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { GitPullRequest, MessageSquare } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getPullRequests } from '../../lib/api'
import styles from '../shared/SharedPages.module.css'

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({ 
    opacity: 1, 
    y: 0, 
    transition: { 
      delay: i * 0.05, 
      duration: 0.4, 
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number] 
    } 
  }),
}

export default function PullRequests() {
  const { pullRequests, setPullRequests, loading, setLoading, setError } = useStore()

  useEffect(() => {
    setLoading(true)
    getPullRequests()
      .then(setPullRequests)
      .catch((err) => {
        console.error(err)
        setError('Failed to load pull requests')
      })
      .finally(() => setLoading(false))
  }, [setPullRequests, setLoading, setError])

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><GitPullRequest size={24} /> Pull Requests</h1>
        <p className={styles['page-subtitle']}>Review and merge code changes across all repositories.</p>
      </motion.div>

      <div className={styles['filters-bar']}>
        <button className={`${styles['filter-btn']} ${styles['filter-btn--active']}`}>Open</button>
        <button className={styles['filter-btn']}>Closed</button>
        <button className={styles['filter-btn']}>Merged</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading pull requests...</div>
      ) : pullRequests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No pull requests found.</div>
      ) : (
        pullRequests.map((pr, i) => (
          <motion.div key={pr.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <div className={styles['list-item']}>
              <div className={`${styles['list-item-icon']} ${pr.status === 'open' ? styles['list-item-icon--emerald'] : styles['list-item-icon--purple']}`}>
                <GitPullRequest size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>
                  {pr.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>#{pr.id.slice(0, 8)}</span>
                </div>
                <div className={styles['list-item-desc']}>
                  {pr.repo?.name || 'Unknown Repo'} · opened by {pr.author?.name || 'Developer'}
                </div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}><MessageSquare size={12} /> 0</span>
                </div>
              </div>
              <div className={styles['list-item-right']}>
                <span className={`${styles['list-item-badge']} ${styles[`list-item-badge--${pr.status}`]}`}>{pr.status}</span>
                <span className={styles['list-item-time']}>{new Date(pr.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  )
}
