import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitPullRequest,
  GitMerge,
  MessageSquare,
  FileCode,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
  AlertTriangle,
  XCircle,
  Calendar,
  FolderGit2,
  Link2,
} from 'lucide-react'
import type { PullRequest, DiffMap, PullRequestDetail, MergePreview } from '../../lib/api'
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
import { Avatar, Button, Card, EmptyState, IconButton, LinkButton, Skeleton, SkeletonText, Tabs, toast } from '../../components/ui'
import { sparkBurst } from '../../lib/sparks'
import { fadeUp, stagger } from '../../lib/motion'
import { timeAgo } from '../../lib/time'
import { Markdown } from '../../components/Markdown/Markdown'
import styles from '../shared/Detail.module.css'
import prStyles from './PRDetail.module.css'

type MergeState = 'merged' | 'closed' | 'conflicts' | 'unknown' | 'ready' | 'waiting'

export default function PRDetail() {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [diff, setDiff] = useState<DiffMap | null>(null)
  const [permissions, setPermissions] = useState<PullRequestDetail['permissions']>({ canMerge: false, canClose: false })
  const [conflicts, setConflicts] = useState<string[]>([])
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const mergeButtonRef = useRef<HTMLButtonElement>(null)
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
  const [now] = useState(() => Date.now())

  useEffect(() => {
    async function fetchPR() {
      if (!prId) return
      setLoading(true)
      try {
        const data = await getPullRequestById(prId)
        setPr(data.pr)
        setDiff(data.diff)
        setPermissions(data.permissions)
        setPreview(data.mergePreview)
        setConflicts(data.mergePreview?.conflicts || [])
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
      const origin = mergeButtonRef.current?.getBoundingClientRect()
      if (origin) {
        const point = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 }
        sparkBurst(point, { count: 70, power: 10, spread: 200 })
        window.setTimeout(() => sparkBurst(point, { count: 40, power: 7, spread: 120 }), 180)
      }
      toast.success('Pull request merged', { description: `${pr?.source?.name || 'source'} → ${pr?.target?.name || 'target'}` })
      const data = await getPullRequestById(prId)
      setPr(data.pr)
      setDiff(data.diff)
      setPermissions(data.permissions)
      setPreview(data.mergePreview)
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
      toast.error(getErrorMessage(err, 'AI review failed. Please try again.'))
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
      toast.success('AI review posted to the conversation')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to post the AI review.'))
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
      toast.success(status === 'closed' ? 'Pull request closed' : 'Pull request reopened')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the pull request.'))
    } finally {
      setUpdatingStatus(false)
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
        <Skeleton width={160} height={14} />
        <div className={styles.header}>
          <Skeleton width="65%" height={34} />
          <Skeleton width={340} height={20} />
        </div>
        <SkeletonText lines={4} />
      </div>
    )
  }

  if (error || !pr) {
    return (
      <div className={styles.page}>
        <EmptyState
          title={error || 'Pull request not found'}
          description="It may have been deleted, or you may not have access to this repository."
          action={<LinkButton to={`/repo/${repoId}`} variant="secondary" size="sm"><ChevronLeft size={14} /> Back to repository</LinkButton>}
        />
      </div>
    )
  }

  const files = diff ? Object.values(diff) : []
  const fileCount = files.length
  const countBy = (status: string) => files.filter((f) => f.status === status).length

  const mergeState: MergeState = pr.status === 'merged' ? 'merged'
    : pr.status === 'closed' ? 'closed'
    : conflicts.length > 0 ? 'conflicts'
    : !preview ? 'unknown'
    : permissions.canMerge ? 'ready'
    : 'waiting'

  const MERGE_COPY: Record<MergeState, { title: string, body: string }> = {
    merged: {
      title: 'Merged — the metal is set',
      body: `Merged into ${pr.target?.name || 'the target branch'} ${timeAgo(pr.merged_at || pr.updated_at, now)}.`,
    },
    closed: { title: 'This pull request is closed', body: 'Closed without merging.' },
    conflicts: {
      title: 'These branches have conflicts',
      body: 'Both branches changed these files since they diverged (or the target has unsaved edits to them). Update the source branch, commit, and try again.',
    },
    unknown: { title: 'Merge status unavailable', body: 'Commit to the source branch to make it mergeable.' },
    ready: {
      title: 'No conflicts — ready to merge',
      body: `Checked with a dry-run three-way merge against the merge base: ${preview?.changes ?? 0} file${preview?.changes === 1 ? '' : 's'} will change on ${pr.target?.name || 'the target branch'}.`,
    },
    waiting: {
      title: 'No conflicts — waiting for a maintainer',
      body: 'Only repository admins can merge. Reviews and comments still help move it along.',
    },
  }

  const MergeIcon = mergeState === 'merged' ? GitMerge
    : mergeState === 'closed' ? XCircle
    : mergeState === 'conflicts' || mergeState === 'unknown' ? AlertTriangle
    : CheckCircle2

  return (
    <motion.div className={styles.page} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <motion.div variants={fadeUp}>
        <Link to={`/repo/${repoId}`} className={styles.back}><ChevronLeft size={16} /> {pr.repo?.name || 'Repository'} · pull requests</Link>
      </motion.div>

      <motion.header variants={fadeUp} className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {pr.title}
            <span className={styles.number}>#{pr.id.slice(0, 8)}</span>
          </h1>
          <div className={styles.titleActions}>
            <IconButton label="Copy link" icon={<Link2 size={16} />} variant="secondary" size="sm" onClick={handleShare} />
          </div>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.state} ${styles[`state_${pr.status}`]}`}>
            {pr.status === 'merged' ? <GitMerge size={15} /> : pr.status === 'closed' ? <XCircle size={15} /> : <GitPullRequest size={15} />}
            {pr.status}
          </span>
          <span>
            {pr.author_id ? <Link to={`/profile/${pr.author_id}`}>{pr.author?.name || 'Deleted user'}</Link> : 'Deleted user'}
            {' '}wants to merge
          </span>
          <span className={styles.branches}>
            <span className={styles.branch}>{pr.source?.name || 'deleted branch'}</span>
            <ArrowRight size={14} aria-label="into" />
            <span className={styles.branch}>{pr.target?.name || 'deleted branch'}</span>
          </span>
        </div>
      </motion.header>

      <motion.div variants={fadeUp}>
        <Tabs
          label="Pull request sections"
          value={activeTab}
          onChange={(id) => setActiveTab(id as 'conversation' | 'files')}
          items={[
            { id: 'conversation', label: 'Conversation', icon: <MessageSquare size={15} /> },
            { id: 'files', label: 'Files changed', icon: <FileCode size={15} />, count: fileCount },
          ]}
        />
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'conversation' ? (
          <motion.div
            key="conversation"
            className={styles.grid}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <div className={styles.main}>
              <div className={styles.opener}>
                <Avatar name={pr.author?.name} src={pr.author?.avatar_url} size={32} />
                <article className={styles.description}>
                  <header className={styles.descriptionHead}>
                    <strong>{pr.author?.name || 'Deleted user'}</strong> opened this pull request {timeAgo(pr.created_at, now)}
                  </header>
                  <div className={`${styles.descriptionBody} markdown-body`}>
                    <Markdown>{pr.description || '_No description provided._'}</Markdown>
                  </div>
                </article>
              </div>

              <CommentSection
                key={discussionKey}
                type="pr"
                id={prId!}
                prAuthorId={pr.author_id}
                allowReviews={pr.status === 'open'}
              />

              <section className={`${prStyles.merge} ${prStyles[`merge_${mergeState}`]}`} aria-labelledby="merge-title">
                <div className={prStyles.mergeIcon}><MergeIcon size={22} /></div>
                <div className={prStyles.mergeBody}>
                  <h2 id="merge-title" className={prStyles.mergeTitle}>{MERGE_COPY[mergeState].title}</h2>
                  <p className={prStyles.mergeText}>{MERGE_COPY[mergeState].body}</p>

                  {conflicts.length > 0 && (
                    <ul className={prStyles.conflicts}>
                      {conflicts.map((path) => <li key={path}>{path}</li>)}
                    </ul>
                  )}
                  {mergeError && conflicts.length === 0 && <p className={prStyles.mergeError} role="alert">{mergeError}</p>}

                  {pr.status === 'closed' && permissions.canClose && (
                    <div className={prStyles.mergeActions}>
                      <Button variant="secondary" size="sm" loading={updatingStatus} onClick={() => handleStatusChange('open')}>
                        Reopen pull request
                      </Button>
                    </div>
                  )}
                  {pr.status === 'open' && (
                    <div className={prStyles.mergeActions}>
                      {permissions.canMerge && (
                        <Button
                          ref={mergeButtonRef}
                          variant="primary"
                          onClick={handleMerge}
                          loading={merging}
                          disabled={conflicts.length > 0 || !preview}
                          iconLeft={<GitMerge size={16} />}
                        >
                          {merging ? 'Merging…' : 'Merge pull request'}
                        </Button>
                      )}
                      <Button variant="secondary" onClick={handleAIReview} loading={reviewing} iconLeft={<Sparkles size={16} />}>
                        {reviewing ? 'Reviewing…' : 'AI review'}
                      </Button>
                      {permissions.canClose && (
                        <Button variant="ghost" loading={updatingStatus} onClick={() => handleStatusChange('closed')}>
                          Close pull request
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <AnimatePresence>
                {aiReview && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                    <Card className={prStyles.ai}>
                      <header className={prStyles.aiHead}>
                        <strong><Sparkles size={16} /> AI review</strong>
                        <Button size="sm" variant="secondary" onClick={handlePostReview} loading={postingReview}>Post as comment</Button>
                        <IconButton size="sm" label="Dismiss AI review" icon={<X size={14} />} onClick={() => setAiReview(null)} />
                      </header>
                      <div className="markdown-body"><Markdown offset={2}>{aiReview}</Markdown></div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <aside className={styles.sidebar} aria-label="Pull request details">
              <div className={styles.side}>
                <h2 className={styles.sideTitle}>Author</h2>
                <div className={styles.sideRow}>
                  <Avatar name={pr.author?.name} src={pr.author?.avatar_url} size={22} />
                  {pr.author_id ? <Link to={`/profile/${pr.author_id}`}>{pr.author?.name || 'Deleted user'}</Link> : 'Deleted user'}
                </div>
              </div>
              <div className={styles.side}>
                <h2 className={styles.sideTitle}>Changes</h2>
                <button className={prStyles.changesLink} onClick={() => setActiveTab('files')}>
                  <FileCode size={14} /> {fileCount} file{fileCount === 1 ? '' : 's'} changed
                </button>
                {fileCount > 0 && (
                  <p className={styles.sideMuted}>
                    {[['added', countBy('added')], ['modified', countBy('modified')], ['deleted', countBy('deleted')]]
                      .filter(([, n]) => n)
                      .map(([label, n]) => `${n} ${label}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className={styles.side}>
                <h2 className={styles.sideTitle}>Details</h2>
                {pr.repo && <div className={styles.sideRow}><FolderGit2 size={14} /> <Link to={`/repo/${pr.repo_id}`}>{pr.repo.name}</Link></div>}
                <div className={styles.sideRow} title={new Date(pr.created_at).toLocaleString()}><Calendar size={14} /> Opened {timeAgo(pr.created_at, now)}</div>
                {pr.merged_at && <div className={styles.sideRow} title={new Date(pr.merged_at).toLocaleString()}><GitMerge size={14} /> Merged {timeAgo(pr.merged_at, now)}</div>}
              </div>
            </aside>
          </motion.div>
        ) : (
          <motion.div
            key="files"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <DiffViewer diff={diff || {}} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
