import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, GitPullRequest } from 'lucide-react'
import { createPullRequest } from '../../lib/api'
import type { Branch } from '../../lib/api'
import styles from './NewIssueModal.module.css' // Reuse modal styles

interface NewPRModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  repoId: string
  branches: Branch[]
}

export default function NewPRModal({ isOpen, onClose, onSuccess, repoId, branches }: NewPRModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-select default/target if branches are available
  if (targetId === '' && branches.length > 0) {
    const defaultBr = branches.find(b => b.is_default) || branches[0]
    setTargetId(defaultBr.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceId || !targetId) {
      setError('Please select both source and target branches.')
      return
    }
    if (sourceId === targetId) {
      setError('Source and target branches must be different.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await createPullRequest({
        repoId,
        sourceBranchId: sourceId,
        targetBranchId: targetId,
        title,
        description
      })
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
      setSourceId('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create pull request')
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
                <div className={styles['modal-icon']} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  <GitPullRequest size={20} />
                </div>
                <div>
                  <h2 className={styles['modal-title']}>Open pull request</h2>
                  <p className={styles['modal-subtitle']}>Propose changes from one branch to another.</p>
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
                  placeholder="e.g. Add landing page animations"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className={styles['form-group']} style={{ marginBottom: 0 }}>
                  <label className={styles['form-label']}>Source <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(compare)</span></label>
                  <select 
                    className={styles['form-input']} 
                    value={sourceId} 
                    onChange={(e) => setSourceId(e.target.value)}
                    required
                    style={{ appearance: 'auto' }}
                  >
                    <option value="" disabled>Select branch</option>
                    {branches.map(br => (
                      <option key={br.id} value={br.id}>{br.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles['form-group']} style={{ marginBottom: 0 }}>
                  <label className={styles['form-label']}>Target <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(base)</span></label>
                  <select 
                    className={styles['form-input']} 
                    value={targetId} 
                    onChange={(e) => setTargetId(e.target.value)}
                    required
                    style={{ appearance: 'auto' }}
                  >
                    <option value="" disabled>Select branch</option>
                    {branches.map(br => (
                      <option key={br.id} value={br.id}>{br.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Description</label>
                <textarea 
                  className={styles['form-textarea']} 
                  placeholder="Describe your changes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ minHeight: '100px' }}
                />
              </div>

              {error && <div className={styles['form-error']}>{error}</div>}

              <div className={styles['modal-footer']}>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                <button type="submit" className={styles['submit-btn']} style={{ background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)' }} disabled={loading}>
                  {loading ? 'Opening...' : 'Create Pull Request'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
