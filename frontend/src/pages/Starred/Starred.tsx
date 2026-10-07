import { useEffect, useMemo, useState } from 'react'
import { Compass, Star } from 'lucide-react'
import { getStarredRepos, getErrorMessage } from '../../lib/api'
import type { Repository } from '../../lib/api'
import { Card, EmptyState, LinkButton, PageHeader, SearchField, Skeleton } from '../../components/ui'
import { RepoCard, RepoGrid } from '../../components/RepoCard/RepoCard'
import styles from '../shared/Browse.module.css'

export default function Starred() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    getStarredRepos()
      .then((data) => {
        setRepos(data)
        setNow(Date.now())
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not load your starred repositories.')))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? repos.filter((r) => `${r.name} ${r.owner?.name || ''} ${r.description || ''}`.toLowerCase().includes(q))
      : repos
  }, [repos, search])

  return (
    <div className={styles.page}>
      <PageHeader icon={<Star size={26} />} title="Starred" subtitle="Repositories you’ve starred, one click away." />

      {repos.length > 3 && (
        <div className={styles.toolbar}>
          <SearchField className={styles.search} label="Filter starred repositories" placeholder="Filter starred…" value={search} onChange={setSearch} />
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={128} radius="var(--radius-lg)" />)}
        </div>
      ) : error ? (
        <Card padding="none"><EmptyState title="Couldn’t load starred repositories" description={error} /></Card>
      ) : repos.length === 0 ? (
        <Card padding="none">
          <EmptyState
            title="No stars yet"
            description="Find something you like on Explore and hit the star — it’ll live here."
            action={<LinkButton to="/explore" variant="primary" size="sm"><Compass size={14} /> Explore repositories</LinkButton>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="none"><EmptyState title="No matches" description={`None of your stars match “${search.trim()}”.`} /></Card>
      ) : (
        <RepoGrid>
          {visible.map((repo) => <RepoCard key={repo.id} repo={{ ...repo, starred_by_me: true }} now={now} showOwner />)}
        </RepoGrid>
      )}
    </div>
  )
}
