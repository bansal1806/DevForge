import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Code2, Globe, Lock, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getGists } from '../../lib/api'
import styles from '../shared/SharedPages.module.css'
import NewGistModal from '../../components/Modals/NewGistModal'

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

export default function Gists() {
  const { gists, setGists, loading, setLoading, setError } = useStore()
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    getGists()
      .then(setGists)
      .catch((err) => {
        console.error(err)
        setError('Failed to load gists')
      })
      .finally(() => setLoading(false))
  }, [setGists, setLoading, setError])

  return (
    <div className={styles['page-shell']}>
      <motion.div 
        className={styles['page-header']} 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <div className={styles['page-header-main']}>
          <div>
            <h1 className={styles['page-title']}><Code2 size={24} /> Gists</h1>
            <p className={styles['page-subtitle']}>Share code snippets and useful patterns.</p>
          </div>
          <motion.button 
            className={styles['action-btn']}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} /> New Gist
          </motion.button>
        </div>
      </motion.div>

      <NewGistModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => getGists().then(setGists)} 
      />

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading gists...</div>
      ) : gists.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No gists found.</div>
      ) : (
        <div className={styles['page-content-list']}>
          {gists.map((gist, i) => (
            <motion.div key={gist.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
              <Link to={`/gists/${gist.id}`} className={styles['list-item']}>
                <div className={`${styles['list-item-icon']} ${styles['list-item-icon--blue']}`}>
                  <Code2 size={18} />
                </div>
                <div className={styles['list-item-content']}>
                  <div className={styles['list-item-title']}>
                    {gist.is_public ? <Globe size={14} /> : <Lock size={14} />}
                    {gist.title}
                  </div>
                  <div className={styles['list-item-desc']}>{gist.description || 'No description provided.'}</div>
                  <div className={styles['list-item-meta']}>
                    <span className={styles['list-item-meta-tag']}>Project Snippet</span>
                  </div>
                </div>
                <div className={styles['list-item-right']}>
                  <span className={`${styles['list-item-badge']} ${styles[`list-item-badge--${gist.is_public ? 'public' : 'private'}`]}`}>
                    {gist.is_public ? 'public' : 'private'}
                  </span>
                  <span className={styles['list-item-time']}>{new Date(gist.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
