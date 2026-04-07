import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Code2, Plus, Trash2, Globe, Lock } from 'lucide-react'
import { createGist } from '../../lib/api'
import styles from './NewIssueModal.module.css' // Reuse modal styles
import gistStyles from './NewGistModal.module.css'

interface NewGistModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function NewGistModal({ isOpen, onClose, onSuccess }: NewGistModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [files, setFiles] = useState([{ filename: '', content: '', language: 'typescript' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFile = () => {
    setFiles([...files, { filename: '', content: '', language: 'typescript' }])
  }

  const removeFile = (index: number) => {
    if (files.length === 1) return
    setFiles(files.filter((_, i) => i !== index))
  }

  const updateFile = (index: number, updates: any) => {
    const newFiles = [...files]
    newFiles[index] = { ...newFiles[index], ...updates }
    setFiles(newFiles)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.some(f => !f.filename || !f.content)) {
      setError('Please provide a filename and content for all files.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await createGist({
        title,
        description,
        is_public: isPublic,
        files
      })
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
      setFiles([{ filename: '', content: '', language: 'typescript' }])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create gist')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles['modal-overlay']}>
          <motion.div 
            className={`${styles['modal-content']} ${gistStyles['gist-modal']}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          >
            <div className={styles['modal-header']}>
              <div className={styles['modal-title-group']}>
                <div className={styles['modal-icon']} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                  <Code2 size={20} />
                </div>
                <div>
                  <h2 className={styles['modal-title']}>Create new gist</h2>
                  <p className={styles['modal-subtitle']}>Instantly share code snippets and notes.</p>
                </div>
              </div>
              <button className={styles['modal-close']} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <form className={styles['modal-form']} onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className={styles['form-group']} style={{ marginBottom: 0 }}>
                  <label className={styles['form-label']}>Gist title <span style={{ color: 'var(--accent-neon)' }}>*</span></label>
                  <input 
                    type="text" 
                    className={styles['form-input']} 
                    placeholder="e.g. Auth middleware"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className={styles['form-group']} style={{ marginBottom: 0 }}>
                  <label className={styles['form-label']}>Visibility</label>
                  <div className={gistStyles['visibility-toggle']}>
                    <button 
                      type="button" 
                      className={`${gistStyles['toggle-btn']} ${isPublic ? gistStyles['toggle-btn--active'] : ''}`}
                      onClick={() => setIsPublic(true)}
                    >
                      <Globe size={14} /> Public
                    </button>
                    <button 
                      type="button" 
                      className={`${gistStyles['toggle-btn']} ${!isPublic ? gistStyles['toggle-btn--active'] : ''}`}
                      onClick={() => setIsPublic(false)}
                    >
                      <Lock size={14} /> Private
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles['form-group']}>
                <label className={styles['form-label']}>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input 
                  type="text" 
                  className={styles['form-input']} 
                  placeholder="Tell us what this gist is for..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className={gistStyles['files-section']}>
                <div className={gistStyles['files-header']}>
                  <label className={styles['form-label']} style={{ margin: 0 }}>Files</label>
                  <button type="button" className={gistStyles['add-file-btn']} onClick={addFile}>
                    <Plus size={14} /> Add file
                  </button>
                </div>

                <div className={gistStyles['files-list']}>
                  {files.map((file, index) => (
                    <div key={index} className={gistStyles['file-item']}>
                      <div className={gistStyles['file-item-header']}>
                        <input 
                          className={gistStyles['filename-input']} 
                          placeholder="filename.ext" 
                          value={file.filename}
                          onChange={(e) => updateFile(index, { filename: e.target.value })}
                        />
                        <select 
                          className={gistStyles['lang-select']}
                          value={file.language}
                          onChange={(e) => updateFile(index, { language: e.target.value })}
                        >
                          <option value="typescript">TypeScript</option>
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="go">Go</option>
                          <option value="rust">Rust</option>
                        </select>
                        <button type="button" className={gistStyles['remove-btn']} onClick={() => removeFile(index)} disabled={files.length === 1}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea 
                        className={gistStyles['content-textarea']} 
                        placeholder="Snippet content..." 
                        value={file.content}
                        onChange={(e) => updateFile(index, { content: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className={styles['form-error']}>{error}</div>}

              <div className={styles['modal-footer']}>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                <button type="submit" className={styles['submit-btn']} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Gist'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
