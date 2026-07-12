import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Star, GitFork } from 'lucide-react'
import { getStarredRepos } from '../../lib/api'
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
  const [starredRepos, setStarredRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStarredRepos()
      .then(setStarredRepos)
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
        <h1 className={styles['page-title']}><Star size={24} /> Starred</h1>
        <p className={styles['page-subtitle']}>Repositories you've starred for quick access.</p>
      </motion.div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading starred repositories...</div>
      ) : starredRepos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          You haven't starred any repositories yet. Find something you like on the Explore page and hit the star.
        </div>
      ) : (
        starredRepos.map((repo, i) => (
          <motion.div key={repo.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <Link to={`/repo/${repo.id}`} className={styles['list-item']}>
              <div className={styles['list-item-icon']} style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
                <GitFork size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>
                  {repo.owner?.name ? `${repo.owner.name}/` : ''}{repo.name}
                </div>
                <div className={styles['list-item-desc']}>{repo.description || 'No description provided.'}</div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}><Star size={12} /> {repo.stars_count || 0}</span>
                  <span className={styles['list-item-meta-tag']}>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))
      )}
    </div>
  )
}
