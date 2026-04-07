import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, CheckCircle2, XCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { 
  getIssueComments, 
  postIssueComment, 
  getPRActivity, 
  postPRComment 
} from '../../lib/api'
import styles from './CommentSection.module.css'

interface CommentSectionProps {
  type: 'issue' | 'pr'
  id: string
}

export default function CommentSection({ type, id }: CommentSectionProps) {
  const [items, setItems] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')

  const fetchActivity = async () => {
    try {
      if (type === 'issue') {
        const comments = await getIssueComments(id)
        setItems(comments)
      } else {
        const activity = await getPRActivity(id)
        setItems(activity)
      }
    } catch (err) {
      console.error('Error fetching activity:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchActivity()
  }, [id, type])

  const handlePost = async () => {
    if (!newComment.trim()) return
    setIsPosting(true)
    try {
      if (type === 'issue') {
        await postIssueComment(id, newComment)
      } else {
        await postPRComment(id, newComment)
      }
      setNewComment('')
      setActiveTab('write')
      await fetchActivity()
    } catch (err) {
      console.error('Error posting comment:', err)
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
              key={item.id} 
              className={styles['comment-card']}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className={styles['comment-header']}>
                <div className={styles['comment-author']}>
                   {item.type === 'review' ? (
                     item.status === 'APPROVED' ? <CheckCircle2 size={14} style={{ color: 'var(--accent-emerald)' }} /> : <XCircle size={14} style={{ color: '#f87171' }} />
                   ) : <MessageSquare size={14} />}
                   {item.author?.name || item.reviewer?.name || 'Developer'}
                   {item.type === 'review' && <span style={{ fontWeight: 400, opacity: 0.7 }}>{item.status === 'APPROVED' ? 'approved these changes' : 'requested changes'}</span>}
                </div>
                <div className={styles['comment-meta']}>
                   {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className={styles['comment-body']}>
                <ReactMarkdown>{item.content}</ReactMarkdown>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* New Comment Form */}
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
            onChange={(e) => setNewComment(e.target.value)}
          />
        ) : (
          <div className={styles['comment-body']} style={{ minHeight: '120px' }}>
             {newComment.trim() ? <ReactMarkdown>{newComment}</ReactMarkdown> : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview</span>}
          </div>
        )}

        <div className={styles['comment-footer']}>
          <button 
            className={styles['btn-post']} 
            disabled={isPosting || !newComment.trim()}
            onClick={handlePost}
          >
            {isPosting ? 'Posting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}
