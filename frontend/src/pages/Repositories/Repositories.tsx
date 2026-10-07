import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GitFork, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { getRepositories, getErrorMessage } from '../../lib/api'
import { Button, Card, EmptyState, PageHeader, SearchField, Segmented, Skeleton } from '../../components/ui'
import { RepoCard, RepoGrid } from '../../components/RepoCard/RepoCard'
import NewRepositoryModal from '../../components/Modals/NewRepositoryModal'
import styles from '../shared/Browse.module.css'

type Visibility = 'all' | 'public' | 'private'
type Sort = 'updated' | 'name' | 'stars'

export default function Repositories() {
  const { repositories, setRepositories } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<Sort>('updated')
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    getRepositories()
      .then((data) => {
        setRepositories(data)
        setNow(Date.now())
        setError(null)
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load repositories.')))
      .finally(() => setLoading(false))
  }, [setRepositories])

  useEffect(load, [load])

  const setSearch = (value: string) => setSearchParams(value ? { search: value } : {}, { replace: true })

  const counts = useMemo(() => ({
    all: repositories.length,
    public: repositories.filter((r) => !r.is_private).length,
    private: repositories.filter((r) => r.is_private).length,
  }), [repositories])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return repositories
      .filter((r) => visibility === 'all' || (visibility === 'private') === r.is_private)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'stars' ? (b.stars_count || 0) - (a.stars_count || 0)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [repositories, visibility, search, sort])

  return (
    <div className={styles.page}>
      <PageHeader
        icon={<GitFork size={26} />}
        title="Repositories"
        subtitle="Everything you own or collaborate on."
        actions={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => setCreating(true)}>New repository</Button>}
      />

      <div className={styles.toolbar}>
        <SearchField className={styles.search} label="Find a repository" placeholder="Find a repository…" value={search} onChange={setSearch} />
        <Segmented
          label="Visibility"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'all', label: 'All', count: loading ? '–' : counts.all },
            { value: 'public', label: 'Public', count: loading ? '–' : counts.public },
            { value: 'private', label: 'Private', count: loading ? '–' : counts.private },
          ]}
        />
        <Segmented
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[{ value: 'updated', label: 'Recent' }, { value: 'name', label: 'Name' }, { value: 'stars', label: 'Stars' }]}
        />
      </div>

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={128} radius="var(--radius-lg)" />)}
        </div>
      ) : error ? (
        <Card padding="none"><EmptyState title="Couldn’t load repositories" description={error} action={<Button size="sm" onClick={load}>Try again</Button>} /></Card>
      ) : repositories.length === 0 ? (
        <Card padding="none">
          <EmptyState
            title="No repositories yet"
            description="Forge your first one — add files, run them, and open pull requests."
            action={<Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>New repository</Button>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="none">
          <EmptyState
            title="No matches"
            description={search ? `No ${visibility === 'all' ? '' : `${visibility} `}repositories match “${search.trim()}”.` : `You have no ${visibility} repositories.`}
            action={<Button size="sm" variant="secondary" onClick={() => { setSearch(''); setVisibility('all') }}>Clear filters</Button>}
          />
        </Card>
      ) : (
        <RepoGrid key={`${visibility}-${sort}`}>
          {visible.map((repo) => <RepoCard key={repo.id} repo={repo} now={now} />)}
        </RepoGrid>
      )}

      <NewRepositoryModal isOpen={creating} onClose={() => setCreating(false)} onSuccess={load} />
    </div>
  )
}
