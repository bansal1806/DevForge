import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, GitCommitHorizontal, GitMerge, GitBranch, User, Clock } from 'lucide-react'
import { getCommitDetail, getErrorMessage, type CommitDetail as CommitDetailData } from '../../lib/api'
import DiffViewer from '../../components/DiffViewer/DiffViewer'
import styles from '../PullRequests/PRDetail.module.css'
import issueStyles from '../Issues/IssueDetail.module.css'

export default function CommitDetail() {
  const { repoId, commitId } = useParams<{ repoId: string; commitId: string }>()
  const [data, setData] = useState<CommitDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <div className={styles['pr-container']}>
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <h2 style={{ color: 'white', marginBottom: '16px' }}>{error}</h2>
          <Link to={`/repo/${repoId}`} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ChevronLeft size={16} /> Back to Repository
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles['pr-container']}>
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: '20px' }}></div>
          Loading commit...
        </div>
      </div>
    )
  }

  const { commit, diff } = data
  const isMerge = !!commit.merge_parent_id

  return (
    <motion.div
      className={styles['pr-container']}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ marginBottom: '24px' }}>
        <Link to={`/repo/${repoId}`} className={issueStyles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Back to repository
        </Link>
      </div>

      <header className={styles['pr-header']}>
        <h1 className={issueStyles['issue-title']} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isMerge ? <GitMerge size={24} /> : <GitCommitHorizontal size={24} />}
          {commit.message}
        </h1>

        <div className={styles['pr-meta']} style={{ flexWrap: 'wrap', gap: '16px' }}>
          <span className={issueStyles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={14} /> {commit.author?.name || 'Deleted user'}
          </span>
          <span className={issueStyles['meta-text']} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} /> {new Date(commit.created_at).toLocaleString()}
          </span>
          {commit.branch && (
            <span className={styles['branch-name']} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={12} /> {commit.branch.name}
            </span>
          )}
          <span className={issueStyles['meta-text']} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {commit.id.slice(0, 7)}
            {commit.parent_id && <> · parent {commit.parent_id.slice(0, 7)}</>}
            {commit.merge_parent_id && <> + {commit.merge_parent_id.slice(0, 7)}</>}
          </span>
        </div>
      </header>

      <p className={issueStyles['meta-text']} style={{ margin: '0 0 16px' }}>
        {commit.parent_id
          ? `Changes compared with the previous commit on this branch${isMerge ? ' (the merge brought these in)' : ''}.`
          : 'Initial commit — every file is new.'}
      </p>

      <DiffViewer diff={diff} />
    </motion.div>
  )
}
