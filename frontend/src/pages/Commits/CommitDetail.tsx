import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, GitCommitHorizontal, GitMerge, GitBranch, Clock, Copy } from 'lucide-react'
import { getCommitDetail, getErrorMessage, type CommitDetail as CommitDetailData } from '../../lib/api'
import DiffViewer from '../../components/DiffViewer/DiffViewer'
import { Avatar, EmptyState, IconButton, LinkButton, Skeleton, SkeletonText, toast } from '../../components/ui'
import { fadeUp, stagger } from '../../lib/motion'
import { timeAgo } from '../../lib/time'
import styles from '../shared/Detail.module.css'

export default function CommitDetail() {
  const { repoId, commitId } = useParams<{ repoId: string; commitId: string }>()
  const [data, setData] = useState<CommitDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!repoId || !commitId) return
    let cancelled = false
    getCommitDetail(repoId, commitId)
      .then((result) => { if (!cancelled) { setData(result); setError(null) } })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Could not load this commit.')) })
    return () => { cancelled = true }
  }, [repoId, commitId])

  if (error) {
    return (
      <div className={styles.page}>
        <EmptyState
          title={error}
          description="The commit may belong to a branch you can't see, or the link is mistyped."
          action={<LinkButton to={`/repo/${repoId}`} variant="secondary" size="sm"><ChevronLeft size={14} /> Back to repository</LinkButton>}
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton width={140} height={14} />
        <div className={styles.header}>
          <Skeleton width="55%" height={34} />
          <Skeleton width={300} height={20} />
        </div>
        <SkeletonText lines={5} />
      </div>
    )
  }

  const { commit, diff } = data
  const isMerge = !!commit.merge_parent_id

  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(commit.id)
      toast.success('Commit id copied')
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.')
    }
  }

  return (
    <motion.div className={styles.page} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <motion.div variants={fadeUp}>
        <Link to={`/repo/${repoId}`} className={styles.back}><ChevronLeft size={16} /> Back to repository</Link>
      </motion.div>

      <motion.header variants={fadeUp} className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{commit.message}</h1>
          <div className={styles.titleActions}>
            <IconButton label="Copy commit id" icon={<Copy size={15} />} variant="secondary" size="sm" onClick={copySha} />
          </div>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.state} ${isMerge ? styles.state_merged : styles.state_open}`}>
            {isMerge ? <GitMerge size={15} /> : <GitCommitHorizontal size={15} />} {isMerge ? 'merge' : 'commit'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Avatar name={commit.author?.name} src={commit.author?.avatar_url} size={20} />
            {commit.author_id ? <Link to={`/profile/${commit.author_id}`}>{commit.author?.name || 'Deleted user'}</Link> : 'Deleted user'}
          </span>
          <span title={new Date(commit.created_at).toLocaleString()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> {timeAgo(commit.created_at, now)}
          </span>
          {commit.branch && (
            <span className={styles.branch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GitBranch size={12} /> {commit.branch.name}
            </span>
          )}
          <code className={styles.branch}>
            {commit.id.slice(0, 7)}
            {commit.parent_id && <> ← {commit.parent_id.slice(0, 7)}</>}
            {commit.merge_parent_id && <> + {commit.merge_parent_id.slice(0, 7)}</>}
          </code>
        </div>
      </motion.header>

      <motion.p variants={fadeUp} className={styles.sideMuted}>
        {commit.parent_id
          ? `Changes compared with the previous commit on this branch${isMerge ? ' (the merge brought these in)' : ''}.`
          : 'Initial commit — every file is new.'}
      </motion.p>

      <motion.div variants={fadeUp}>
        <DiffViewer diff={diff} />
      </motion.div>
    </motion.div>
  )
}
