import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, GitFork, Globe, Lock } from 'lucide-react'
import apiClient from '../../lib/apiClient'
import styles from './NewRepositoryModal.module.css'

interface NewRepositoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function NewRepositoryModal({ isOpen, onClose, onSuccess }: NewRepositoryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await apiClient.post('/api/repos', {
        name,
        description,
        isPrivate
      })
      onSuccess()
      onClose()
      setName('')
      setDescription('')
      setIsPrivate(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles['modal-overlay']}>
          <motion.div 
            className={styles['modal-content']}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          >
            <div className={styles['modal-header']}>
              <div className={styles['modal-title-group']}>
                <div className={styles['modal-icon']}>
                  <GitFork size={20} />
                </div>
                <div>
                  <h2 className={styles['modal-title']}>Create new repository</h2>
                  <p className={styles['modal-subtitle']}>A repository contains all project files and revision history.</p>
                </div>
              </div>
              <button className={styles['modal-close']} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <form className={styles['modal-form']} onSubmit={handleSubmit}>
              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Repository name <span style={{ color: 'var(--accent-neon)' }}>*</span></label>
                <input 
                  type="text" 
                  className={styles['form-input']} 
                  placeholder="e.g. my-awesome-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <textarea 
                  className={styles['form-textarea']} 
                  placeholder="Tell us about your project..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className={styles['visibility-selector']}>
                <div 
                  className={`${styles['visibility-option']} ${!isPrivate ? styles['visibility-option--active'] : ''}`}
                  onClick={() => setIsPrivate(false)}
                >
                  <Globe size={18} />
                  <div className={styles['visibility-option-content']}>
                    <div className={styles['visibility-option-title']}>Public</div>
                    <div className={styles['visibility-option-desc']}>Anyone on the internet can see this repository.</div>
                  </div>
                </div>

                <div 
                  className={`${styles['visibility-option']} ${isPrivate ? styles['visibility-option--active'] : ''}`}
                  onClick={() => setIsPrivate(true)}
                >
                  <Lock size={18} />
                  <div className={styles['visibility-option-content']}>
                    <div className={styles['visibility-option-title']}>Private</div>
                    <div className={styles['visibility-option-desc']}>You choose who can see and commit to this repository.</div>
                  </div>
                </div>
              </div>

              {error && <div className={styles['form-error']}>{error}</div>}

              <div className={styles['modal-footer']}>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                <button type="submit" className={styles['submit-btn']} disabled={loading}>
                  {loading ? 'Creating...' : 'Create repository'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
