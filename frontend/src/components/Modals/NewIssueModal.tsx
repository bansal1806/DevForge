import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertCircle } from 'lucide-react'
import { createIssue } from '../../lib/api'
import styles from './NewIssueModal.module.css'

interface NewIssueModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  repoId: string
}

export default function NewIssueModal({ isOpen, onClose, onSuccess, repoId }: NewIssueModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await createIssue(repoId, { title, description })
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create issue')
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
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h2 className={styles['modal-title']}>Create new issue</h2>
                  <p className={styles['modal-subtitle']}>Share a bug report or feature request with the community.</p>
                </div>
              </div>
              <button className={styles['modal-close']} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <form className={styles['modal-form']} onSubmit={handleSubmit}>
              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Title <span style={{ color: 'var(--accent-neon)' }}>*</span></label>
                <input 
                  type="text" 
                  className={styles['form-input']} 
                  placeholder="e.g. Issue with data rendering"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Description</label>
                <textarea 
                  className={styles['form-textarea']} 
                  placeholder="Explain the problem or request..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ minHeight: '150px' }}
                />
              </div>

              {error && <div className={styles['form-error']}>{error}</div>}

              <div className={styles['modal-footer']}>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                <button type="submit" className={styles['submit-btn']} disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Issue'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
