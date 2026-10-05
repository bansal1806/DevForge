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
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
  AlertTriangle,
  XCircle
} from 'lucide-react'
import type { PullRequest, DiffMap, PullRequestDetail } from '../../lib/api'
import {
  getPullRequestById,
  mergePullRequest,
  reviewPullRequest,
  postPRComment,
  updatePullRequest,
  getErrorMessage,
  getMergeConflicts,
} from '../../lib/api'
import DiffViewer from '../../components/DiffViewer/DiffViewer'
import CommentSection from '../../components/Social/CommentSection'
import styles from './PRDetail.module.css'
import issueStyles from '../Issues/IssueDetail.module.css'
import ReactMarkdown from 'react-markdown'

export default function PRDetail() {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [diff, setDiff] = useState<DiffMap | null>(null)
  const [permissions, setPermissions] = useState<PullRequestDetail['permissions']>({ canMerge: false, canClose: false })
  const [conflicts, setConflicts] = useState<string[]>([])
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [discussionKey, setDiscussionKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [aiReview, setAiReview] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [postingReview, setPostingReview] = useState(false)

  useEffect(() => {
    async function fetchPR() {
      if (!prId) return
      setLoading(true)
      try {
        const data = await getPullRequestById(prId)
        setPr(data.pr)
        setDiff(data.diff)
        setPermissions(data.permissions)
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load pull request details.'))
      } finally {
        setLoading(false)
      }
    }
    fetchPR()
  }, [prId])

  const handleMerge = async () => {
    if (!prId || merging) return
    setMerging(true)
    setMergeError(null)
    setConflicts([])
    try {
      await mergePullRequest(prId)
      const data = await getPullRequestById(prId)
      setPr(data.pr)
      setDiff(data.diff)
      setPermissions(data.permissions)
    } catch (err) {
      setConflicts(getMergeConflicts(err))
      setMergeError(getErrorMessage(err, 'Merge failed. Please try again.'))
    } finally {
      setMerging(false)
    }
  }

  const handleAIReview = async () => {
    if (!prId || reviewing) return
    setReviewing(true)
    try {
      const { review } = await reviewPullRequest(prId)
      setAiReview(review)
    } catch (err) {
      setAiReview(getErrorMessage(err, 'AI review failed. Please try again.'))
    } finally {
      setReviewing(false)
    }
  }

  const handlePostReview = async () => {
    if (!prId || !aiReview || postingReview) return
    setPostingReview(true)
    try {
      await postPRComment(prId, `## 🤖 AI Review\n\n${aiReview}`)
      setAiReview(null)
      setDiscussionKey((k) => k + 1) // refresh the thread in place
    } catch (err) {
      setMergeError(getErrorMessage(err, 'Failed to post the AI review.'))
    } finally {
      setPostingReview(false)
    }
  }

  const handleStatusChange = async (status: 'open' | 'closed') => {
    if (!prId || !pr || updatingStatus) return
    setUpdatingStatus(true)
    try {
      const updated = await updatePullRequest(prId, { status })
      setPr({ ...pr, status: updated.status })
      setConflicts([])
      setMergeError(null)
    } catch (err) {
      setMergeError(getErrorMessage(err, 'Failed to update the pull request.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

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
            {pr.status === 'merged' ? <GitMerge size={16} /> : <GitPullRequest size={16} />}
            {pr.status}
          </div>
          <div className={styles['branch-container']}>
            <span className={styles['branch-name']}>{pr.source?.name || 'deleted branch'}</span>
            <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
            <span className={styles['branch-name']}>{pr.target?.name || 'deleted branch'}</span>
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
                    <User size={14} /> {pr.author?.name || 'Deleted user'} opened this pull request
                  </div>
                </div>
                <div className={issueStyles['description-body']}>
                  <ReactMarkdown>{pr.description || '_No description provided._'}</ReactMarkdown>
                </div>
              </div>

              {/* Activity Section */}
              <div style={{ marginTop: '32px' }}>
                <CommentSection
                  key={discussionKey}
                  type="pr"
                  id={prId!}
                  prAuthorId={pr.author_id}
                  allowReviews={pr.status === 'open'}
                />
              </div>

              {/* Merge Section */}
              <div className={styles['merge-box']}>
                <div className={`${styles['merge-icon']} ${pr.status === 'open' && conflicts.length === 0 ? styles['merge-icon--open'] : styles['merge-icon--merged']}`}>
                  {pr.status === 'merged' ? <GitMerge size={24} />
                    : pr.status === 'closed' ? <XCircle size={24} />
                    : conflicts.length > 0 ? <AlertTriangle size={24} />
                    : <CheckCircle2 size={24} />}
                </div>
                <div className={styles['merge-content']}>
                  <h3 className={styles['merge-title']}>
                    {pr.status === 'merged' ? 'This pull request was merged'
                      : pr.status === 'closed' ? 'This pull request is closed'
                      : conflicts.length > 0 ? 'This branch has conflicts that must be resolved'
                      : permissions.canMerge ? 'Ready to merge'
                      : 'Waiting for a repository admin to merge'}
                  </h3>
                  <p className={styles['merge-desc']}>
                    {pr.status === 'merged'
                      ? `Merged on ${new Date(pr.merged_at || pr.updated_at).toLocaleDateString()}.`
                      : pr.status === 'closed'
                        ? 'Closed without merging.'
                        : conflicts.length > 0
                          ? 'Both branches changed these files since they diverged (or the target has unsaved edits to them). Update the source branch, commit, and try again.'
                          : 'DevForge checks for conflicts when you merge: files changed on both branches since they diverged will be reported.'}
                  </p>
                  {conflicts.length > 0 && (
                    <ul className={styles['merge-desc']} style={{ margin: '0 0 12px', paddingLeft: '20px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {conflicts.map((path) => <li key={path}>{path}</li>)}
                    </ul>
                  )}
                  {mergeError && conflicts.length === 0 && (
                    <p className={styles['merge-desc']} style={{ color: '#ef4444' }}>{mergeError}</p>
                  )}
                  {pr.status === 'closed' && permissions.canClose && (
                    <button className="btn-ghost" onClick={() => handleStatusChange('open')} disabled={updatingStatus}>
                      Reopen pull request
                    </button>
                  )}
                  {pr.status === 'open' && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {permissions.canMerge && (
                        <button className={styles['btn-merge']} onClick={handleMerge} disabled={merging}>
                          {merging ? <Loader2 size={18} className="animate-spin" /> : <GitMerge size={18} />}
                          {merging ? 'Merging…' : 'Merge pull request'}
                        </button>
                      )}
                      <button
                        className={styles['btn-merge']}
                        style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
                        onClick={handleAIReview}
                        disabled={reviewing}
                      >
                        {reviewing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        {reviewing ? 'Reviewing…' : 'AI Review'}
                      </button>
                      {permissions.canClose && (
                        <button className="btn-ghost" onClick={() => handleStatusChange('closed')} disabled={updatingStatus}>
                          Close pull request
                        </button>
                      )}
                    </div>
                  )}

                  <AnimatePresence>
                    {aiReview && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        style={{
                          marginTop: '16px',
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid rgba(139, 92, 246, 0.35)',
                          background: 'rgba(139, 92, 246, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={16} /> AI Review
                          </strong>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button className="btn-ghost" onClick={handlePostReview} disabled={postingReview}>
                              {postingReview ? 'Posting…' : 'Post as comment'}
                            </button>
                            <button className="btn-ghost" onClick={() => setAiReview(null)} aria-label="Dismiss AI review">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        <div className={issueStyles['description-body']}>
                          <ReactMarkdown>{aiReview}</ReactMarkdown>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
            <DiffViewer diff={diff || {}} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
