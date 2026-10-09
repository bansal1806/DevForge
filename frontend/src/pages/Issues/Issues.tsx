import { useEffect, useState } from 'react'
import { Bug, CircleDot, CheckCircle2 } from 'lucide-react'
import { getIssues, getErrorMessage } from '../../lib/api'
import type { Issue } from '../../lib/api'
import { WorkList } from '../../components/WorkList/WorkList'
import type { WorkItem } from '../../components/WorkList/WorkList'
import { Badge } from '../../components/ui'
import { timeAgo } from '../../lib/time'

export default function Issues() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    getIssues()
      .then((data) => {
        setIssues(data)
        setNow(Date.now())
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load issues.')))
      .finally(() => setLoading(false))
  }, [])

  const items: WorkItem[] = issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    status: issue.status,
    href: `/repo/${issue.repo_id}/issues/${issue.id}`,
    icon: issue.status === 'open'
      ? <CircleDot size={17} color="var(--color-success)" aria-label="Open" />
      : <CheckCircle2 size={17} color="var(--color-violet)" aria-label="Closed" />,
    meta: <>#{issue.id.slice(0, 8)} opened {timeAgo(issue.created_at, now)} by {issue.author?.name || 'a deleted user'}</>,
    searchText: `${issue.repo?.name || ''} ${issue.author?.name || ''}`,
    aside: issue.repo && <Badge tone="neutral">{issue.repo.name}</Badge>,
  }))

  return (
    <WorkList
      title="Issues"
      subtitle="Bugs, ideas and to-dos across every repository you can see."
      icon={<Bug size={26} />}
      filters={[{ status: 'open', label: 'Open' }, { status: 'closed', label: 'Closed' }]}
      items={items}
      loading={loading}
      error={error}
      emptyTitle="No issues yet"
      emptyDescription="Open a repository and file an issue from its Issues tab."
    />
  )
}
