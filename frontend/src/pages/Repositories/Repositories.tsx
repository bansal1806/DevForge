import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { GitFork, Star, Search as SearchIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getRepositories } from '../../lib/api'
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

export default function Repositories() {
  const { repositories, setRepositories, loading, setLoading, setError } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '')
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')

  useEffect(() => {
    setLoading(true)
    getRepositories()
      .then(setRepositories)
      .catch((err) => {
        console.error(err)
        setError('Failed to load repositories')
      })
      .finally(() => setLoading(false))
  }, [setRepositories, setLoading, setError])

  const filteredRepos = useMemo(() => {
    return repositories.filter(repo => {
      const matchesSearch = repo.name.toLowerCase().includes(localSearch.toLowerCase()) || 
                          (repo.description?.toLowerCase().includes(localSearch.toLowerCase()) ?? false)
      const matchesFilter = filter === 'all' || 
                          (filter === 'private' && repo.is_private) || 
                          (filter === 'public' && !repo.is_private)
      return matchesSearch && matchesFilter
    })
  }, [repositories, localSearch, filter])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalSearch(val)
    if (val) {
      setSearchParams({ search: val })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles['page-title']}><GitFork size={24} /> Repositories</h1>
        <p className={styles['page-subtitle']}>All of your repositories across every project.</p>
      </motion.div>

      <div className={styles['filters-bar']}>
        <div className={styles['filter-search']}>
          <SearchIcon size={14} style={{ color: 'var(--text-muted)' }} />
          <input 
            placeholder="Find a repository..." 
            value={localSearch}
            onChange={handleSearchChange}
          />
        </div>
        <button 
          className={`${styles['filter-btn']} ${filter === 'all' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setFilter('all')}
        >All</button>
        <button 
          className={`${styles['filter-btn']} ${filter === 'public' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setFilter('public')}
        >Public</button>
        <button 
          className={`${styles['filter-btn']} ${filter === 'private' ? styles['filter-btn--active'] : ''}`}
          onClick={() => setFilter('private')}
        >Private</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading repositories...</div>
      ) : filteredRepos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No repositories found.</div>
      ) : (
        filteredRepos.map((repo, i) => (
          <motion.div key={repo.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <Link to={`/repo/${repo.id}`} className={styles['list-item']}>
              <div className={styles['list-item-icon']} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <GitFork size={18} />
              </div>
              <div className={styles['list-item-content']}>
                <div className={styles['list-item-title']}>{repo.name}</div>
                <div className={styles['list-item-desc']}>{repo.description || 'No description provided.'}</div>
                <div className={styles['list-item-meta']}>
                  <span className={styles['list-item-meta-tag']}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3178c6', display: 'inline-block' }} />
                    TypeScript
                  </span>
                  <span className={styles['list-item-meta-tag']}><Star size={12} /> 0</span>
                </div>
              </div>
              <div className={styles['list-item-right']}>
                <span className={`${styles['list-item-badge']} ${styles[`list-item-badge--${repo.is_private ? 'private' : 'public'}`]}`}>
                  {repo.is_private ? 'private' : 'public'}
                </span>
              </div>
            </Link>
          </motion.div>
        ))
      )}
    </div>
  )
}
