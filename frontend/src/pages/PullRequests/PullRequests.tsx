import { useEffect, useState } from 'react'
import { GitPullRequest, GitMerge, XCircle } from 'lucide-react'
import { getPullRequests, getErrorMessage } from '../../lib/api'
import type { PullRequest } from '../../lib/api'
import { WorkList } from '../../components/WorkList/WorkList'
import type { WorkItem } from '../../components/WorkList/WorkList'
import { Badge } from '../../components/ui'
import { timeAgo } from '../../lib/time'

const ICONS = {
  open: <GitPullRequest size={17} color="var(--color-success)" aria-label="Open" />,
  merged: <GitMerge size={17} color="var(--color-violet)" aria-label="Merged" />,
  closed: <XCircle size={17} color="var(--color-steel)" aria-label="Closed" />,
}

export default function PullRequests() {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    getPullRequests()
      .then((data) => {
        setPullRequests(data)
        setNow(Date.now())
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load pull requests.')))
      .finally(() => setLoading(false))
  }, [])

  const items: WorkItem[] = pullRequests.map((pr) => ({
    id: pr.id,
    title: pr.title,
    status: pr.status,
    href: `/repo/${pr.repo_id}/pull-requests/${pr.id}`,
    icon: ICONS[pr.status],
    meta: (
      <>
        #{pr.id.slice(0, 8)} {pr.status === 'merged' && pr.merged_at ? `merged ${timeAgo(pr.merged_at, now)}` : `opened ${timeAgo(pr.created_at, now)}`}
        {' '}by {pr.author?.name || 'a deleted user'} · <code>{pr.source?.name || 'deleted'} → {pr.target?.name || 'deleted'}</code>
      </>
    ),
    searchText: `${pr.repo?.name || ''} ${pr.author?.name || ''} ${pr.source?.name || ''}`,
    aside: pr.repo && <Badge tone="neutral">{pr.repo.name}</Badge>,
  }))

  return (
    <WorkList
      title="Pull requests"
      subtitle="Review and merge changes across every repository you can see."
      icon={<GitPullRequest size={26} />}
      filters={[{ status: 'open', label: 'Open' }, { status: 'merged', label: 'Merged' }, { status: 'closed', label: 'Closed' }]}
      items={items}
      loading={loading}
      error={error}
      emptyTitle="No pull requests yet"
      emptyDescription="Create a branch in a repository, commit a change, and open a pull request."
    />
  )
}
