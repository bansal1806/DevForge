import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bug, Compass, GitCommitHorizontal, GitFork, GitPullRequest, Lock, Search, Star } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCommandPalette } from '../../contexts/CommandPalette'
import { useStore } from '../../store/useStore'
import { getActivity, getIssues, getPullRequests, getRepositories } from '../../lib/api'
import type { ActivityItem, Issue, PullRequest } from '../../lib/api'
import { Badge, Button, Card, EmptyState, Kbd, LinkButton, Skeleton } from '../../components/ui'
import { heatOf, timeAgo } from '../../lib/time'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './Dashboard.module.css'

function greeting(hour: number) {
  if (hour < 5) return 'Burning the midnight oil'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const ACTIVITY_ICON = { commit: GitCommitHorizontal, pr: GitPullRequest, issue: Bug }
const ACTIVITY_VERB = { commit: 'Committed to', pr: 'Opened a pull request in', issue: 'Opened an issue in' }

export default function Dashboard() {
  const { user } = useAuth()
  const { setOpen: openPalette } = useCommandPalette()
  const { repositories, setRepositories } = useStore()
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    Promise.allSettled([getRepositories(), getActivity(), getPullRequests(), getIssues()]).then(([r, a, p, i]) => {
      if (cancelled) return
      if (r.status === 'fulfilled') setRepositories(r.value)
      if (a.status === 'fulfilled') setActivity(a.value)
      if (p.status === 'fulfilled') setPrs(p.value)
      if (i.status === 'fulfilled') setIssues(i.value)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [user?.id, setRepositories])

  const name = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const openPrs = prs.filter((p) => p.status === 'open')
  const openIssues = issues.filter((i) => i.status === 'open')
  const stars = repositories.reduce((n, r) => n + (r.stars_count || 0), 0)
  const recentRepos = [...repositories]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6)

  const stats = [
    { label: 'Repositories', value: repositories.length, icon: GitFork, to: '/repositories' },
    { label: 'Stars received', value: stars, icon: Star, to: '/repositories' },
    { label: 'Your open pull requests', value: openPrs.length, icon: GitPullRequest, to: '/pull-requests' },
    { label: 'Your open issues', value: openIssues.length, icon: Bug, to: '/issues' },
  ]

  return (
    <div className={styles.page}>
      <motion.header className={styles.header} initial="hidden" animate="visible" variants={stagger(0.06)}>
        <motion.div variants={fadeUp}>
          <h1 className={styles.title}>
            {greeting(new Date(now).getHours())}, <span className="text-gradient">{name}</span>
          </h1>
          <p className={styles.subtitle}>Here’s what’s happening across your projects.</p>
        </motion.div>
        <motion.div variants={fadeUp} className={styles.headerActions}>
          <Button iconLeft={<Search size={15} />} onClick={() => openPalette(true)}>
            Jump to… <span className={styles.keys}><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
          </Button>
          <LinkButton to="/explore" variant="ghost"><Compass size={15} /> Explore</LinkButton>
        </motion.div>
      </motion.header>

      <motion.section className={styles.stats} aria-label="Overview" initial="hidden" animate="visible" variants={stagger(0.05, 0.05)}>
        {stats.map((s) => (
          <motion.div key={s.label} variants={fadeUp}>
            <Link to={s.to} className={styles.statLink}>
              <Card interactive className={styles.stat}>
                <span className={styles.statIcon}><s.icon size={18} /></span>
                {loading ? <Skeleton width={48} height={30} /> : <span className={styles.statValue}>{s.value.toLocaleString()}</span>}
                <span className={styles.statLabel}>{s.label}</span>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.section>

      <div className={styles.grid}>
        <section aria-labelledby="repos-heading">
          <div className={styles.sectionHead}>
            <h2 id="repos-heading">Recently active repositories</h2>
            <Link to="/repositories" className={styles.more}>View all <ArrowRight size={14} /></Link>
          </div>

          {loading ? (
            <div className={styles.repoGrid}>
              {[0, 1, 2, 3].map((n) => (
                <Card key={n}><Skeleton width="55%" height={18} /><div style={{ height: 10 }} /><Skeleton width="85%" /><div style={{ height: 14 }} /><Skeleton width="35%" height={12} /></Card>
              ))}
            </div>
          ) : recentRepos.length === 0 ? (
            <Card padding="none">
              <EmptyState
                title="No repositories yet"
                description="Create one to start committing, branching and opening pull requests."
                action={<LinkButton to="/repositories" variant="primary">Go to repositories</LinkButton>}
              />
            </Card>
          ) : (
            <motion.div className={styles.repoGrid} initial="hidden" animate="visible" variants={stagger(0.05)}>
              {recentRepos.map((repo) => {
                const hot = heatOf(repo.updated_at, now) === 'molten'
                return (
                  <motion.div key={repo.id} variants={fadeUp}>
                    <Link to={`/repo/${repo.id}`} className={styles.repoLink}>
                      <Card interactive className={styles.repo}>
                        <div className={styles.repoTop}>
                          <span className={`${styles.heatDot} ${hot ? styles.heatHot : ''}`} aria-hidden="true" />
                          <span className={styles.repoName}>{repo.name}</span>
                          {repo.is_private
                            ? <Badge tone="neutral" icon={<Lock size={11} />}>private</Badge>
                            : <Badge tone="steel">public</Badge>}
                        </div>
                        <p className={styles.repoDesc}>{repo.description || 'No description yet.'}</p>
                        <div className={styles.repoMeta}>
                          <span><Star size={13} /> {repo.stars_count || 0}</span>
                          <span>Updated {timeAgo(repo.updated_at, now)}</span>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </section>

        <aside className={styles.side}>
          <section aria-labelledby="prs-heading">
            <div className={styles.sectionHead}>
              <h2 id="prs-heading">Open pull requests</h2>
              <Link to="/pull-requests" className={styles.more}>All <ArrowRight size={14} /></Link>
            </div>
            <Card padding="sm">
              {loading ? (
                <div className={styles.list}><Skeleton height={36} /><Skeleton height={36} /></div>
              ) : openPrs.length === 0 ? (
                <p className={styles.quiet}>Nothing waiting on review.</p>
              ) : (
                <ul className={styles.list}>
                  {openPrs.slice(0, 5).map((pr) => (
                    <li key={pr.id}>
                      <Link to={`/repo/${pr.repo_id}/pull-requests/${pr.id}`} className={styles.listItem}>
                        <GitPullRequest size={16} className={styles.prIcon} />
                        <span className={styles.listMain}>
                          <span className={styles.listTitle}>{pr.title}</span>
                          <span className={styles.listMeta}>{pr.repo?.name} · {pr.source?.name} → {pr.target?.name}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="activity-heading">
            <div className={styles.sectionHead}>
              <h2 id="activity-heading">Your activity</h2>
            </div>
            <Card padding="sm">
              {loading ? (
                <div className={styles.list}><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></div>
              ) : activity.length === 0 ? (
                <p className={styles.quiet}>No activity yet — commit something!</p>
              ) : (
                <ol className={styles.timeline}>
                  {activity.slice(0, 8).map((item) => {
                    const Icon = ACTIVITY_ICON[item.type] || GitCommitHorizontal
                    const hot = heatOf(item.created_at, now) === 'molten'
                    return (
                      <li key={`${item.type}-${item.id}`} className={styles.timelineItem}>
                        <span className={`${styles.timelineIcon} ${hot ? styles.timelineHot : ''}`}><Icon size={14} /></span>
                        <span className={styles.listMain}>
                          <span className={styles.listTitle}>{item.message || item.title || 'Untitled'}</span>
                          <span className={styles.listMeta}>
                            {ACTIVITY_VERB[item.type]}{' '}
                            {item.repo_id ? <Link to={`/repo/${item.repo_id}`}>{item.repo?.name || 'a repository'}</Link> : item.repo?.name}
                            {' · '}{timeAgo(item.created_at, now)}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  )
}
