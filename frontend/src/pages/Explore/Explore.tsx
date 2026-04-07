import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BookOpen, GitFork, Star, TrendingUp } from 'lucide-react'
import { getExploreRepos } from '../../lib/api'
import type { Repository } from '../../lib/api'
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

export default function Explore() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getExploreRepos()
      .then(setRepos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><BookOpen size={24} /> Explore</h1>
        <p className={styles['page-subtitle']}>Discover trending repositories and projects.</p>
      </motion.div>

      <div className={styles['filters-bar']}>
        <button className={`${styles['filter-btn']} ${styles['filter-btn--active']}`}><TrendingUp size={14} /> Trending</button>
        <button className={styles['filter-btn']}>Most Stars</button>
        <button className={styles['filter-btn']}>Recently Created</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading trending repositories...</div>
      ) : repos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No repositories to explore yet.</div>
      ) : (
        repos.map((repo, i) => (
          <motion.div key={repo.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <Link to={`/repo/${repo.id}`} className={styles['list-item']}>
              <div className={styles['list-item-icon']} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <GitFork size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>
                  {repo.owner?.name || 'DevForge'}/{repo.name}
                </div>
                <div className={styles['list-item-desc']}>{repo.description || 'No description provided.'}</div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3178c6', display: 'inline-block' }} /> 
                    TypeScript
                  </span>
                  <span className={styles['list-item-meta-tag']}><Star size={12} /> 0</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))
      )}
    </div>
  )
}
