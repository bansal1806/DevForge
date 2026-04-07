import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  GitPullRequest, 
  GitMerge, 
  MessageSquare, 
  FileCode, 
  ChevronLeft,
  ArrowRight,
  Clock,
  User,
  CheckCircle2
} from 'lucide-react'
import type { PullRequest } from '../../lib/api'
import { getPullRequestById } from '../../lib/api'
import DiffViewer from '../../components/DiffViewer/DiffViewer'
import CommentSection from '../../components/Social/CommentSection'
import styles from './PRDetail.module.css'
import issueStyles from '../Issues/IssueDetail.module.css'
import ReactMarkdown from 'react-markdown'

export default function PRDetail() {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [diff, setDiff] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPR() {
      if (!prId) return
      setLoading(true)
      try {
        const data = await getPullRequestById(prId)
        setPr(data.pr)
        setDiff(data.diff)
      } catch (err) {
        console.error('Error fetching PR:', err)
        setError('Could not load pull request details.')
      } finally {
        setLoading(false)
      }
    }
    fetchPR()
  }, [prId])

  if (loading) {
    return (
      <div className={styles['pr-container']}>
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: '20px' }}></div>
          Calculating diffs...
        </div>
      </div>
    )
  }

  if (error || !pr) {
    return (
      <div className={styles['pr-container']}>
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <h2 style={{ color: 'white', marginBottom: '16px' }}>{error || 'Pull Request not found'}</h2>
          <Link to={`/repo/${repoId}`} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ChevronLeft size={16} /> Back to Repository
          </Link>
        </div>
      </div>
    )
  }

  const fileCount = diff ? Object.keys(diff).length : 0

  return (
    <motion.div 
      className={styles['pr-container']}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ marginBottom: '24px' }}>
        <Link to={`/repo/${repoId}`} className={issueStyles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Back to pull requests
        </Link>
      </div>

      <header className={styles['pr-header']}>
        <h1 className={issueStyles['issue-title']}>
          {pr.title} <span className={styles['pr-id']}>#{pr.id.slice(0, 8)}</span>
        </h1>
        
        <div className={styles['pr-meta']}>
          <div className={`${issueStyles['status-badge']} ${pr.status === 'open' ? issueStyles['status-badge--open'] : issueStyles['status-badge--closed']}`}>
            <GitPullRequest size={16} />
            {pr.status}
          </div>
          <div className={styles['branch-container']}>
            <span className={styles['branch-name']}>{(pr as any).source?.name}</span>
            <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
            <span className={styles['branch-name']}>{(pr as any).target?.name}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles['pr-tabs']}>
        <button 
          className={`${styles['tab-btn']} ${activeTab === 'conversation' ? styles['tab-btn--active'] : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          <MessageSquare size={16} /> Conversation
        </button>
        <button 
          className={`${styles['tab-btn']} ${activeTab === 'files' ? styles['tab-btn--active'] : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <FileCode size={16} /> Files changed <span className={styles['badge-count']}>{fileCount}</span>
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'conversation' ? (
          <motion.div 
            key="conversation"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className={issueStyles['issue-content-grid']}
          >
            <div className={issueStyles['issue-main']}>
              <div className={issueStyles['description-box']}>
                <div className={issueStyles['description-header']}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                    <User size={14} /> {pr.author?.name || 'Developer'} commented
                  </div>
                </div>
                <div className={issueStyles['description-body']}>
                  <ReactMarkdown>{pr.description || '_No description provided._'}</ReactMarkdown>
                </div>
              </div>

              {/* Activity Section */}
              <div style={{ marginTop: '32px' }}>
                <CommentSection type="pr" id={prId!} />
              </div>

              {/* Merge Section */}
              <div className={styles['merge-box']}>
                <div className={`${styles['merge-icon']} ${pr.status === 'open' ? styles['merge-icon--open'] : styles['merge-icon--merged']}`}>
                  {pr.status === 'open' ? <CheckCircle2 size={24} /> : <GitMerge size={24} />}
                </div>
                <div className={styles['merge-content']}>
                  <h3 className={styles['merge-title']}>
                    {pr.status === 'open' ? 'This branch has no conflicts' : 'This pull request was merged'}
                  </h3>
                  <p className={styles['merge-desc']}>
                    {pr.status === 'open' 
                      ? 'No conflicts with the base branch. You can safely merge these changes.' 
                      : `Successfully merged by ${pr.author?.name || 'Developer'} on ${new Date(pr.merged_at || '').toLocaleDateString()}.`}
                  </p>
                  {pr.status === 'open' && (
                    <button className={styles['btn-merge']}>
                      <GitMerge size={18} /> Merge pull request
                    </button>
                  )}
                </div>
              </div>
            </div>

            <aside className={issueStyles['issue-sidebar']}>
              <div className={issueStyles['sidebar-section']}>
                <h4 className={issueStyles['sidebar-title']}>Reviewers</h4>
                <div className={issueStyles['sidebar-content']} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No reviewers assigned
                </div>
              </div>
              
              <div className={issueStyles['sidebar-section']}>
                <h4 className={issueStyles['sidebar-title']}>Details</h4>
                <div className={issueStyles['sidebar-content']} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Opened {new Date(pr.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </aside>
          </motion.div>
        ) : (
          <motion.div 
            key="files"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
          >
            <DiffViewer diff={diff} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
