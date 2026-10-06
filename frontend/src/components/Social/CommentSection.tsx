import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, CheckCircle2, XCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import {
  getIssueComments,
  postIssueComment,
  getPRActivity,
  postPRComment,
  postPRReview,
  getErrorMessage,
} from '../../lib/api'
import type { DiscussionItem, ReviewStatus } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import styles from './CommentSection.module.css'

interface CommentSectionProps {
  type: 'issue' | 'pr'
  id: string
  /** PR author — they can comment on, but not approve, their own PR */
  prAuthorId?: string | null
  /** Reviews are only accepted while a PR is open */
  allowReviews?: boolean
}

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  approved: 'approved these changes',
  changes_requested: 'requested changes',
  commented: 'reviewed',
}

function ReviewIcon({ status }: { status?: ReviewStatus }) {
  if (status === 'approved') return <CheckCircle2 size={14} style={{ color: 'var(--accent-emerald)' }} />
  if (status === 'changes_requested') return <XCircle size={14} style={{ color: '#f87171' }} />
  return <MessageSquare size={14} />
}

export default function CommentSection({ type, id, prAuthorId, allowReviews = false }: CommentSectionProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<DiscussionItem[]>([])
  const [newComment, setNewComment] = useState('')
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | 'comment'>('comment')
  const [loading, setLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')

  const canReview = type === 'pr' && allowReviews && !!user && user.id !== prAuthorId

  const fetchActivity = useCallback(async () => {
    try {
      setItems(type === 'issue' ? await getIssueComments(id) : await getPRActivity(id))
    } catch (err) {
      console.error('Error fetching activity:', err)
    } finally {
      setLoading(false)
    }
  }, [id, type])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  const handlePost = async () => {
    const isReview = reviewStatus !== 'comment'
    if (!newComment.trim() && !isReview) return
    setIsPosting(true)
    setError(null)
    try {
      if (type === 'issue') {
        await postIssueComment(id, newComment)
      } else if (isReview) {
        await postPRReview(id, reviewStatus, newComment)
      } else {
        await postPRComment(id, newComment)
      }
      setNewComment('')
      setReviewStatus('comment')
      setActiveTab('write')
      await fetchActivity()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to post. Please try again.'))
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className={styles['comments-container']}>
      <div className={styles['comment-thread']}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading discussion...</div>
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No comments yet.</div>
        ) : (
          items.map((item, i) => (
            <motion.div
              key={`${item.type}-${item.id}`}
              className={styles['comment-card']}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.05 }}
            >
              <div className={styles['comment-header']}>
                <div className={styles['comment-author']}>
                  {item.type === 'review' ? <ReviewIcon status={item.status} /> : <MessageSquare size={14} />}
                  {item.author?.name || 'Deleted user'}
                  {item.type === 'review' && item.status && (
                    <span style={{ fontWeight: 400, opacity: 0.7 }}>{REVIEW_LABELS[item.status]}</span>
                  )}
                </div>
                <div className={styles['comment-meta']}>
                  {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {item.content && (
                <div className={styles['comment-body']}>
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {!user ? (
        <div className={styles['new-comment-box']} style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <Link to="/auth">Sign in</Link> to join the discussion.
        </div>
      ) : (
        <div className={styles['new-comment-box']}>
          <div className={styles['editor-tabs']}>
            <button
              className={`${styles['editor-tab']} ${activeTab === 'write' ? styles['editor-tab--active'] : ''}`}
              onClick={() => setActiveTab('write')}
            >
              Write
            </button>
            <button
              className={`${styles['editor-tab']} ${activeTab === 'preview' ? styles['editor-tab--active'] : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              Preview
            </button>
          </div>

          {activeTab === 'write' ? (
            <textarea
              className={styles['comment-textarea']}
              placeholder="Level up the discussion..."
              value={newComment}
              maxLength={10000}
              onChange={(e) => setNewComment(e.target.value)}
            />
          ) : (
            <div className={styles['comment-body']} style={{ minHeight: '120px' }}>
              {newComment.trim() ? <ReactMarkdown>{newComment}</ReactMarkdown> : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview</span>}
            </div>
          )}

          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', padding: '0 12px' }}>{error}</div>}

          <div className={styles['comment-footer']} style={{ gap: '12px' }}>
            {canReview && (
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as ReviewStatus | 'comment')}
                aria-label="Review type"
                style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '6px 10px' }}
              >
                <option value="comment">Comment</option>
                <option value="approved">Approve</option>
                <option value="changes_requested">Request changes</option>
              </select>
            )}
            <button
              className={styles['btn-post']}
              disabled={isPosting || (!newComment.trim() && reviewStatus === 'comment')}
              onClick={handlePost}
            >
              {isPosting ? 'Posting...' : reviewStatus === 'comment' ? 'Comment' : 'Submit review'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
