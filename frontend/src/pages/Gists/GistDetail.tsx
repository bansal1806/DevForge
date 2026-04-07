import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Code2, 
  Globe, 
  Lock, 
  ChevronLeft,
  Calendar,
  FileCode,
  Copy,
  Download,
  ExternalLink
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { getGistById, type Gist } from '../../lib/api'
import styles from './GistDetail.module.css'
import issueStyles from '../Issues/IssueDetail.module.css'

export default function GistDetail() {
  const { id } = useParams<{ id: string }>()
  const [gist, setGist] = useState<Gist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchGist() {
      if (!id) return
      setLoading(true)
      try {
        const data = await getGistById(id)
        setGist(data)
      } catch (err) {
        console.error('Error fetching gist:', err)
        setError('Could not load gist details.')
      } finally {
        setLoading(false)
      }
    }
    fetchGist()
  }, [id])

  if (loading) {
    return (
      <div className={styles['gist-content']}>
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: '20px' }}></div>
          Loading gist...
        </div>
      </div>
    )
  }

  if (error || !gist) {
    return (
      <div className={styles['gist-content']}>
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <h2 style={{ color: 'white', marginBottom: '16px' }}>{error || 'Gist not found'}</h2>
          <Link to="/gists" className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ChevronLeft size={16} /> Back to Gists
          </Link>
        </div>
      </div>
    )
  }

  const handleCopyRaw = (content: string) => {
    navigator.clipboard.writeText(content)
    // Add toast here later
  }

  return (
    <motion.div 
      className={styles['gist-content']}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ marginBottom: '24px' }}>
        <Link to="/gists" className={issueStyles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          <ChevronLeft size={16} /> All gists
        </Link>
      </div>

      <header className={styles['gist-header']}>
        <div className={styles['gist-title-row']}>
          <div className={styles['title-group']}>
            <div className={styles['gist-icon']}>
              <Code2 size={24} />
            </div>
            <div>
              <h1 className={styles['gist-title']}>{gist.title}</h1>
              <div className={styles['stat-item']} style={{ marginTop: '4px' }}>
                <Link to={`/profile/${gist.user_id}`} className={issueStyles['author-link']}>
                   {gist.user?.name || 'Developer'}
                </Link> / <span className={styles['gist-id']}>{gist.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Download size={16} /> Download</button>
             <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Copy size={16} /> Copy URL</button>
          </div>
        </div>

        <div className={styles['sidebar-stats']}>
          <div className={styles['stat-item']}>
             {gist.is_public ? <Globe size={14} /> : <Lock size={14} />}
             {gist.is_public ? 'Public' : 'Secret'}
          </div>
          <div className={styles['stat-item']}>
             <Calendar size={14} />
             Created {new Date(gist.created_at).toLocaleDateString()}
          </div>
          <div className={styles['stat-item']}>
             <FileCode size={14} />
             {gist.files?.length || 0} files
          </div>
        </div>
        
        {gist.description && (
          <p style={{ marginTop: '20px', color: 'var(--text-dim)', fontSize: '1rem', lineHeight: '1.6' }}>
            {gist.description}
          </p>
        )}
      </header>

      <div className={styles['gist-files-list']}>
        {gist.files?.map((file) => (
          <div key={file.id} className={styles['file-block']}>
            <div className={styles['file-header']}>
              <div className={styles['file-name']}>
                <FileCode size={16} style={{ color: 'var(--text-muted)' }} />
                {file.filename}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span className={issueStyles['meta-text']} style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{file.language}</span>
                <button className="btn-ghost" style={{ padding: '4px' }} title="Copy Raw" onClick={() => handleCopyRaw(file.content)}><Copy size={14} /></button>
                <button className="btn-ghost" style={{ padding: '4px' }} title="View Raw"><ExternalLink size={14} /></button>
              </div>
            </div>
            <div className={styles['editor-container']}>
              <Editor
                height="100%"
                language={file.language}
                theme="vs-dark"
                value={file.content}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono',
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  padding: { top: 16 }
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
