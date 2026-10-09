import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Compass, Star, TrendingUp } from 'lucide-react'
import { getExploreRepos, getErrorMessage } from '../../lib/api'
import type { Repository } from '../../lib/api'
import { Button, Card, EmptyState, PageHeader, SearchField, Segmented, Skeleton } from '../../components/ui'
import { RepoCard, RepoGrid } from '../../components/RepoCard/RepoCard'
import styles from '../shared/Browse.module.css'

type SortMode = 'active' | 'stars' | 'newest'

/** Wait this long after typing stops before searching the server. */
const SEARCH_DEBOUNCE_MS = 300

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [input, setInput] = useState(query)
  const [repos, setRepos] = useState<Repository[]>([])
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('active')
  const [now, setNow] = useState(() => Date.now())

  // Keep the input in sync when the URL query changes (back/forward, palette links)
  const [syncedQuery, setSyncedQuery] = useState(query)
  if (query !== syncedQuery) {
    setSyncedQuery(query)
    setInput(query)
  }

  // Debounce typing into the URL; the URL drives the fetch
  useEffect(() => {
    if (input.trim() === query) return
    const t = window.setTimeout(() => setSearchParams(input.trim() ? { q: input.trim() } : {}, { replace: true }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [input, query, setSearchParams])

  useEffect(() => {
    let cancelled = false
    getExploreRepos(query || undefined)
      .then((result) => {
        if (cancelled) return
        setRepos(result)
        setError(null)
        setNow(Date.now())
      })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Could not load public repositories.')) })
      .finally(() => { if (!cancelled) setLoadedQuery(query) })
    return () => { cancelled = true }
  }, [query])

  const loading = loadedQuery !== query

  const sorted = useMemo(() => [...repos].sort((a, b) => {
    if (sort === 'stars') return (b.stars_count || 0) - (a.stars_count || 0)
    if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  }), [repos, sort])

  return (
    <div className={styles.page}>
      <PageHeader icon={<Compass size={26} />} title="Explore" subtitle="Public repositories from across the forge." />

      <div className={styles.toolbar}>
        <SearchField className={styles.search} label="Search public repositories" placeholder="Search public repositories…" value={input} onChange={setInput} />
        <Segmented
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'active', label: 'Recently active', icon: <TrendingUp size={14} /> },
            { value: 'stars', label: 'Most stars', icon: <Star size={14} /> },
            { value: 'newest', label: 'Newest', icon: <Clock size={14} /> },
          ]}
        />
      </div>

      {!loading && !error && query && (
        <p className={styles.resultNote} role="status">
          <strong>{repos.length}</strong> result{repos.length === 1 ? '' : 's'} for “{query}”
        </p>
      )}

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={128} radius="var(--radius-lg)" />)}
        </div>
      ) : error ? (
        <Card padding="none"><EmptyState title="Couldn’t load repositories" description={error} /></Card>
      ) : sorted.length === 0 ? (
        <Card padding="none">
          <EmptyState
            title={query ? 'Nothing found' : 'Nothing to explore yet'}
            description={query ? `No public repositories match “${query}”.` : 'When people publish public repositories they’ll show up here.'}
            action={query ? <Button size="sm" variant="secondary" onClick={() => setInput('')}>Clear search</Button> : undefined}
          />
        </Card>
      ) : (
        <RepoGrid key={`${query}-${sort}`}>
          {sorted.map((repo) => <RepoCard key={repo.id} repo={repo} now={now} showOwner />)}
        </RepoGrid>
      )}
    </div>
  )
}
