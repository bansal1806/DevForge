import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Star, GitFork } from 'lucide-react'
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

export default function Starred() {
  const [starredRepos] = useState<Repository[]>([]) // Placeholder for future star logic

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><Star size={24} /> Starred</h1>
        <p className={styles['page-subtitle']}>Repositories you've starred for quick access.</p>
      </motion.div>

      {starredRepos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>You haven't starred any repositories yet.</div>
      ) : (
        starredRepos.map((repo, i) => (
          <motion.div key={repo.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <Link to={`/repo/${repo.id}`} className={styles['list-item']}>
              <div className={styles['list-item-icon']} style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
                <GitFork size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>{repo.name}</div>
                <div className={styles['list-item-desc']}>{repo.description}</div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3178c6', display: 'inline-block' }} /> 
                    TypeScript
                  </span>
                  <span className={styles['list-item-meta-tag']}><Star size={12} /> {repo.stars_count || 0}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))
      )}
    </div>
  )
}
