import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, GitFork, Star, TrendingUp, Clock, Search } from 'lucide-react'
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

type SortMode = 'trending' | 'stars' | 'newest'

export default function Explore() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortMode>('trending')
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [searchInput, setSearchInput] = useState(query)

  useEffect(() => {
    setSearchInput(query)
    setLoading(true)
    getExploreRepos(query || undefined)
      .then(setRepos)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [query])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams(searchInput.trim() ? { q: searchInput.trim() } : {})
  }

  const sortedRepos = [...repos].sort((a, b) => {
    if (sort === 'stars') return (b.stars_count || 0) - (a.stars_count || 0)
    if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  return (
    <div className={styles['page-shell']}>
      <motion.div
        className={styles['page-header']}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><BookOpen size={24} /> Explore</h1>
        <p className={styles['page-subtitle']}>Discover public repositories and projects.</p>
      </motion.div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search public repositories..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary, white)',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <button type="submit" className="btn-ghost">Search</button>
      </form>

      <div className={styles['filters-bar']}>
        <button
          className={`${styles['filter-btn']} ${sort === 'trending' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setSort('trending')}
        >
          <TrendingUp size={14} /> Recently Active
        </button>
        <button
          className={`${styles['filter-btn']} ${sort === 'stars' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setSort('stars')}
        >
          <Star size={14} /> Most Stars
        </button>
        <button
          className={`${styles['filter-btn']} ${sort === 'newest' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setSort('newest')}
        >
          <Clock size={14} /> Recently Created
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading repositories...</div>
      ) : sortedRepos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {query ? `No repositories found for "${query}".` : 'No repositories to explore yet.'}
        </div>
      ) : (
        sortedRepos.map((repo, i) => (
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
