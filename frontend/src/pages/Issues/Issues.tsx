import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bug, MessageSquare } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getIssues } from '../../lib/api'
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

export default function Issues() {
  const { issues, setIssues, loading, setLoading, setError } = useStore()

  useEffect(() => {
    setLoading(true)
    getIssues()
      .then(setIssues)
      .catch((err) => {
        console.error(err)
        setError('Failed to load issues')
      })
      .finally(() => setLoading(false))
  }, [setIssues, setLoading, setError])

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><Bug size={24} /> Issues</h1>
        <p className={styles['page-subtitle']}>Track bugs and feature requests across your projects.</p>
      </motion.div>

      <div className={styles['filters-bar']}>
        <button className={`${styles['filter-btn']} ${styles['filter-btn--active']}`}>Open</button>
        <button className={styles['filter-btn']}>Closed</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading issues...</div>
      ) : issues.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No issues found.</div>
      ) : (
        issues.map((issue, i) => (
          <motion.div key={issue.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <div className={styles['list-item']}>
              <div className={`${styles['list-item-icon']} ${issue.status === 'open' ? styles['list-item-icon--amber'] : styles['list-item-icon--purple']}`}>
                <Bug size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>
                  {issue.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>#{issue.id.slice(0, 8)}</span>
                </div>
                <div className={styles['list-item-desc']}>
                  {issue.repo?.name || 'Unknown Repo'} · opened by {issue.author?.name || 'Developer'}
                </div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}><MessageSquare size={12} /> 0</span>
                </div>
              </div>
              <div className={styles['list-item-right']}>
                <span className={`${styles['list-item-badge']} ${styles[`list-item-badge--${issue.status}`]}`}>{issue.status}</span>
                <span className={styles['list-item-time']}>{new Date(issue.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  )
}
