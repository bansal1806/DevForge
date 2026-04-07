import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  CircleDot, 
  CheckCircle2, 
  Clock, 
  User, 
  MessageSquare, 
  ChevronLeft,
  Share2,
  MoreVertical,
  Calendar
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { getIssueById, type Issue } from '../../lib/api'
import CommentSection from '../../components/Social/CommentSection'
import styles from './IssueDetail.module.css'

export default function IssueDetail() {
  const { repoId, issueId } = useParams<{ repoId: string; issueId: string }>()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchIssue() {
      if (!issueId) return
      setLoading(true)
      try {
        const data = await getIssueById(issueId)
        setIssue(data)
      } catch (err) {
        console.error('Error fetching issue:', err)
        setError('Could not load issue details.')
      } finally {
        setLoading(false)
      }
    }
    fetchIssue()
  }, [issueId])

  if (loading) {
    return (
      <div className={styles['issue-container']}>
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: '20px' }}></div>
          Checking issue status...
        </div>
      </div>
    )
  }

  if (error || !issue) {
    return (
      <div className={styles['issue-container']}>
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <h2 style={{ color: 'white', marginBottom: '16px' }}>{error || 'Issue not found'}</h2>
          <Link to={`/repo/${repoId}`} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ChevronLeft size={16} /> Back to Repository
          </Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div 
      className={styles['issue-container']}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Breadcrumbs / Back Link */}
      <div style={{ marginBottom: '24px' }}>
        <Link to={`/repo/${repoId}`} className={styles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Back to issues
        </Link>
      </div>

      {/* Header */}
      <header className={styles['issue-header']}>
        <div className={styles['issue-top-row']}>
          <h1 className={styles['issue-title']}>
            {issue.title} <span className={styles['issue-number']}>#{issue.id.slice(0, 8)}</span>
          </h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-ghost" style={{ padding: '8px' }}><Share2 size={18} /></button>
            <button className="btn-ghost" style={{ padding: '8px' }}><MoreVertical size={18} /></button>
          </div>
        </div>

        <div className={styles['issue-meta']}>
          <div className={`${styles['status-badge']} ${issue.status === 'open' ? styles['status-badge--open'] : styles['status-badge--closed']}`}>
            {issue.status === 'open' ? <CircleDot size={16} /> : <CheckCircle2 size={16} />}
            {issue.status}
          </div>
          <div className={styles['meta-text']}>
            <Link to={`/profile/${issue.author_id}`} className={styles['author-link']}>{issue.author?.name || 'Developer'}</Link> opened this issue {new Date(issue.created_at).toLocaleDateString()}
          </div>
          <div className={styles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            • <MessageSquare size={14} /> 0 comments
          </div>
        </div>
      </header>

      {/* Content Grid */}
      <div className={styles['issue-content-grid']}>
        <div className={styles['issue-main']}>
          <div className={styles['description-box']}>
            <div className={styles['description-header']}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                <User size={14} /> {issue.author?.name || 'Developer'} commented
              </div>
              <div className={styles['meta-text']}>
                {new Date(issue.created_at).toLocaleTimeString() }
              </div>
            </div>
            <div className={styles['description-body']}>
              <ReactMarkdown>{issue.description || '_No description provided._'}</ReactMarkdown>
            </div>
          </div>

          {/* Comments Section */}
          <div style={{ marginTop: '48px' }}>
            <h3 className={styles['section-title']}>Discussion</h3>
            <CommentSection type="issue" id={issueId!} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className={styles['issue-sidebar']}>
          <div className={styles['sidebar-section']}>
            <h4 className={styles['sidebar-title']}>Assignees</h4>
            <div className={styles['sidebar-content']} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No one assigned
            </div>
          </div>

          <div className={styles['sidebar-section']}>
            <h4 className={styles['sidebar-title']}>Labels</h4>
            <div className={styles['sidebar-content']} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '0.75rem', fontWeight: 600 }}>bug</span>
            </div>
          </div>

          <div className={styles['sidebar-section']}>
            <h4 className={styles['sidebar-title']}>Details</h4>
            <div className={styles['sidebar-content']} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Created {new Date(issue.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Last updated {new Date(issue.updated_at).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <div className={styles['action-card']}>
            <button className={styles['btn-status-toggle']}>
               {issue.status === 'open' ? <CheckCircle2 size={18} /> : <CircleDot size={18} />}
               {issue.status === 'open' ? 'Close Issue' : 'Reopen Issue'}
            </button>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}
