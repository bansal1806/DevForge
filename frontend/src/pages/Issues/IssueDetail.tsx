import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CircleDot, CheckCircle2, ChevronLeft, Link2, Calendar, Clock, FolderGit2 } from 'lucide-react'
import { Markdown } from '../../components/Markdown/Markdown'
import { getIssueById, updateIssue, getErrorMessage, type Issue } from '../../lib/api'
import CommentSection from '../../components/Social/CommentSection'
import { Avatar, Button, EmptyState, IconButton, LinkButton, Skeleton, SkeletonText, toast } from '../../components/ui'
import { fadeUp, stagger } from '../../lib/motion'
import { timeAgo } from '../../lib/time'
import styles from '../shared/Detail.module.css'

export default function IssueDetail() {
  const { repoId, issueId } = useParams<{ repoId: string; issueId: string }>()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    async function fetchIssue() {
      if (!issueId) return
      setLoading(true)
      try {
        setIssue(await getIssueById(issueId))
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load issue details.'))
      } finally {
        setLoading(false)
      }
    }
    fetchIssue()
  }, [issueId])

  const handleToggleStatus = async () => {
    if (!issue || updating) return
    setUpdating(true)
    const next = issue.status === 'open' ? 'closed' : 'open'
    try {
      const updated = await updateIssue(issue.id, { status: next })
      setIssue({ ...issue, ...updated })
      toast.success(next === 'closed' ? 'Issue closed' : 'Issue reopened')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the issue.'))
    } finally {
      setUpdating(false)
    }
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.')
    }
  }

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton width={120} height={14} />
        <div className={styles.header}>
          <Skeleton width="60%" height={34} />
          <Skeleton width={260} height={20} />
        </div>
        <SkeletonText lines={4} />
      </div>
    )
  }

  if (error || !issue) {
    return (
      <div className={styles.page}>
        <EmptyState
          title={error || 'Issue not found'}
          description="It may have been deleted, or you may not have access to this repository."
          action={<LinkButton to={`/repo/${repoId}`} variant="secondary" size="sm"><ChevronLeft size={14} /> Back to repository</LinkButton>}
        />
      </div>
    )
  }

  const open = issue.status === 'open'
  const canEdit = !!issue.permissions?.canEdit

  return (
    <motion.div className={styles.page} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <motion.div variants={fadeUp}>
        <Link to={`/repo/${repoId}`} className={styles.back}><ChevronLeft size={16} /> {issue.repo?.name || 'Repository'} · issues</Link>
      </motion.div>

      <motion.header variants={fadeUp} className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {issue.title}
            <span className={styles.number}>#{issue.id.slice(0, 8)}</span>
          </h1>
          <div className={styles.titleActions}>
            <IconButton label="Copy link" icon={<Link2 size={16} />} variant="secondary" size="sm" onClick={handleShare} />
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                loading={updating}
                onClick={handleToggleStatus}
                iconLeft={open ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
              >
                {open ? 'Close issue' : 'Reopen issue'}
              </Button>
            )}
          </div>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.state} ${styles[`state_${issue.status}`]}`}>
            {open ? <CircleDot size={15} /> : <CheckCircle2 size={15} />} {issue.status}
          </span>
          <span>
            {issue.author_id ? <Link to={`/profile/${issue.author_id}`}>{issue.author?.name || 'Deleted user'}</Link> : 'Deleted user'}
            {' '}opened this issue {timeAgo(issue.created_at, now)}
          </span>
        </div>
      </motion.header>

      <motion.div variants={fadeUp} className={styles.grid}>
        <div className={styles.main}>
          <div className={styles.opener}>
            <Avatar name={issue.author?.name} src={issue.author?.avatar_url} size={32} />
            <article className={styles.description}>
              <header className={styles.descriptionHead}>
                <strong>{issue.author?.name || 'Deleted user'}</strong> opened {timeAgo(issue.created_at, now)}
              </header>
              <div className={`${styles.descriptionBody} markdown-body`}>
                <Markdown>{issue.description || '_No description provided._'}</Markdown>
              </div>
            </article>
          </div>

          <section aria-labelledby="discussion-title">
            <h2 id="discussion-title" className={styles.sectionTitle}>Discussion</h2>
            <CommentSection type="issue" id={issueId!} />
          </section>
        </div>

        <aside className={styles.sidebar} aria-label="Issue details">
          <div className={styles.side}>
            <h2 className={styles.sideTitle}>Author</h2>
            <div className={styles.sideRow}>
              <Avatar name={issue.author?.name} src={issue.author?.avatar_url} size={22} />
              {issue.author_id ? <Link to={`/profile/${issue.author_id}`}>{issue.author?.name || 'Deleted user'}</Link> : 'Deleted user'}
            </div>
          </div>
          <div className={styles.side}>
            <h2 className={styles.sideTitle}>Details</h2>
            {issue.repo && (
              <div className={styles.sideRow}><FolderGit2 size={14} /> <Link to={`/repo/${issue.repo_id}`}>{issue.repo.name}</Link></div>
            )}
            <div className={styles.sideRow} title={new Date(issue.created_at).toLocaleString()}><Calendar size={14} /> Opened {timeAgo(issue.created_at, now)}</div>
            <div className={styles.sideRow} title={new Date(issue.updated_at).toLocaleString()}><Clock size={14} /> Updated {timeAgo(issue.updated_at, now)}</div>
          </div>
        </aside>
      </motion.div>
    </motion.div>
  )
}
