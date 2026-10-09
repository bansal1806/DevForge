import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, CheckCircle2, XCircle } from 'lucide-react'
import { Markdown } from '../Markdown/Markdown'
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
import { Avatar, Button, Kbd, SkeletonText } from '../ui'
import { timeAgo } from '../../lib/time'
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

const REVIEW_OPTIONS: { value: ReviewStatus | 'comment', label: string }[] = [
  { value: 'comment', label: 'Comment' },
  { value: 'approved', label: 'Approve' },
  { value: 'changes_requested', label: 'Request changes' },
]

function ReviewIcon({ status }: { status?: ReviewStatus }) {
  if (status === 'approved') return <CheckCircle2 size={14} className={styles.approved} />
  if (status === 'changes_requested') return <XCircle size={14} className={styles.changes} />
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
  const [now, setNow] = useState(() => Date.now())

  const canReview = type === 'pr' && allowReviews && !!user && user.id !== prAuthorId
  const canPost = !isPosting && (!!newComment.trim() || reviewStatus !== 'comment')

  const fetchActivity = useCallback(async () => {
    try {
      setItems(type === 'issue' ? await getIssueComments(id) : await getPRActivity(id))
      setNow(Date.now())
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
    if (!canPost) return
    const isReview = reviewStatus !== 'comment'
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
    <div className={styles.container}>
      {loading ? (
        <SkeletonText lines={3} />
      ) : items.length === 0 ? (
        <p className={styles.empty}>No comments yet — start the conversation.</p>
      ) : (
        <ol className={styles.timeline}>
          {items.map((item, i) => (
            <motion.li
              key={`${item.type}-${item.id}`}
              className={styles.entry}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04 }}
            >
              <Avatar name={item.author?.name} src={item.author?.avatar_url} size={32} className={styles.avatar} />
              {item.type === 'review' && !item.content ? (
                <div className={styles.event}>
                  <ReviewIcon status={item.status} />
                  <strong>{item.author?.name || 'Deleted user'}</strong>
                  {item.status && REVIEW_LABELS[item.status]}
                  <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>{timeAgo(item.created_at, now)}</time>
                </div>
              ) : (
                <article className={`${styles.card} ${item.type === 'review' && item.status ? styles[`review_${item.status}`] : ''}`}>
                  <header className={styles.cardHeader}>
                    {item.type === 'review' && <ReviewIcon status={item.status} />}
                    <strong>{item.author?.name || 'Deleted user'}</strong>
                    <span className={styles.muted}>{item.type === 'review' && item.status ? REVIEW_LABELS[item.status] : 'commented'}</span>
                    <time className={styles.muted} dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>
                      {timeAgo(item.created_at, now)}
                    </time>
                  </header>
                  <div className={`${styles.body} markdown-body`}>
                    <Markdown offset={2}>{item.content || ''}</Markdown>
                  </div>
                </article>
              )}
            </motion.li>
          ))}
        </ol>
      )}

      {!user ? (
        <p className={styles.signIn}><Link to="/auth">Sign in</Link> to join the discussion.</p>
      ) : (
        <div className={styles.composer}>
          <Avatar
            name={(user.user_metadata?.full_name as string | undefined) || user.email}
            src={user.user_metadata?.avatar_url as string | undefined}
            size={32}
            className={styles.avatar}
          />
          <div className={styles.box}>
            <div className={styles.boxTabs} role="tablist" aria-label="Comment editor">
              {(['write', 'preview'] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`${styles.boxTab} ${activeTab === tab ? styles.boxTabActive : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'write' ? 'Write' : 'Preview'}
                </button>
              ))}
            </div>

            {activeTab === 'write' ? (
              <textarea
                className={styles.textarea}
                placeholder={type === 'pr' ? 'Leave a comment or review…' : 'Add to the discussion…'}
                aria-label="Comment"
                value={newComment}
                maxLength={10000}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    handlePost()
                  }
                }}
              />
            ) : (
              <div className={`${styles.preview} markdown-body`}>
                {newComment.trim() ? <Markdown offset={2}>{newComment}</Markdown> : <span className={styles.muted}>Nothing to preview</span>}
              </div>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}

            <footer className={styles.boxFooter}>
              <span className={styles.hint}>Markdown supported · <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> to post</span>
              {canReview && (
                <div className={styles.reviewPicker} role="radiogroup" aria-label="Review type">
                  {REVIEW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      role="radio"
                      aria-checked={reviewStatus === opt.value}
                      className={`${styles.reviewOption} ${reviewStatus === opt.value ? styles.reviewOptionActive : ''}`}
                      onClick={() => setReviewStatus(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <Button
                variant={reviewStatus === 'changes_requested' ? 'danger' : 'primary'}
                size="sm"
                onClick={handlePost}
                disabled={!canPost}
                loading={isPosting}
              >
                {reviewStatus === 'comment' ? 'Comment' : 'Submit review'}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
