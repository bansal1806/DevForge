import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Code2, FileCode, Lock, Plus } from 'lucide-react'
import { getGists, getMyGists, getErrorMessage } from '../../lib/api'
import type { Gist } from '../../lib/api'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, SearchField, Segmented, Skeleton } from '../../components/ui'
import { fadeUp, stagger } from '../../lib/motion'
import { fileColor } from '../../lib/fileLang'
import { timeAgo } from '../../lib/time'
import NewGistModal from '../../components/Modals/NewGistModal'
import browse from '../shared/Browse.module.css'
import styles from './Gists.module.css'

/** Lines of the first file shown on each card. */
const PREVIEW_LINES = 6

type Scope = 'public' | 'mine'

export default function Gists() {
  const [gists, setGists] = useState<Gist[]>([])
  // "mine" includes your private gists, which never appear in the public feed
  const [scope, setScope] = useState<Scope>('public')
  const [loadedScope, setLoadedScope] = useState<Scope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(scope === 'mine' ? getMyGists() : getGists())
      .then((data) => {
        if (cancelled) return
        setGists(data)
        setError(null)
        setNow(Date.now())
      })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Failed to load gists.')) })
      .finally(() => { if (!cancelled) setLoadedScope(scope) })
    return () => { cancelled = true }
  }, [scope, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const loading = loadedScope !== scope

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return gists
    return gists.filter((g) =>
      `${g.title || ''} ${g.description || ''} ${g.user?.name || ''} ${(g.files || []).map((f) => f.filename).join(' ')}`.toLowerCase().includes(q))
  }, [gists, search])

  return (
    <div className={browse.page}>
      <PageHeader
        icon={<Code2 size={26} />}
        title="Gists"
        subtitle="Snippets worth keeping — share them or keep them secret."
        actions={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => setCreating(true)}>New gist</Button>}
      />

      <div className={browse.toolbar}>
        <SearchField className={browse.search} label="Filter gists" placeholder="Filter by title, file or author…" value={search} onChange={setSearch} />
        <Segmented
          label="Gist scope"
          value={scope}
          onChange={setScope}
          options={[{ value: 'public', label: 'Public' }, { value: 'mine', label: 'My gists' }]}
        />
      </div>

      {loading ? (
        <div className={browse.skeletonGrid} aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={210} radius="var(--radius-lg)" />)}
        </div>
      ) : error ? (
        <Card padding="none"><EmptyState title="Couldn’t load gists" description={error} action={<Button size="sm" onClick={reload}>Try again</Button>} /></Card>
      ) : gists.length === 0 ? (
        <Card padding="none">
          <EmptyState
            title={scope === 'mine' ? 'You haven’t made any gists' : 'No public gists yet'}
            description="Gists are quick, shareable snippets — one file or a handful."
            action={<Button variant="primary" size="sm" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>New gist</Button>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padding="none"><EmptyState title="No matches" description={`No gists match “${search.trim()}”.`} /></Card>
      ) : (
        <motion.div className={styles.grid} initial="hidden" animate="visible" variants={stagger(0.04)} key={scope}>
          {visible.map((gist) => {
            const first = gist.files?.[0]
            const preview = first?.content.split('\n').slice(0, PREVIEW_LINES).join('\n')
            const fileCount = gist.files?.length || 0
            return (
              <motion.div key={gist.id} variants={fadeUp} className={styles.cell}>
                <Link to={`/gists/${gist.id}`} className={styles.link}>
                  <Card interactive padding="none" className={styles.card}>
                    <div className={styles.head}>
                      <Avatar name={gist.user?.name} src={gist.user?.avatar_url} size={24} />
                      <span className={styles.title}>{gist.title || first?.filename || 'Untitled gist'}</span>
                      {!gist.is_public && <Badge tone="neutral" icon={<Lock size={11} />}>secret</Badge>}
                    </div>
                    {gist.description && <p className={styles.desc}>{gist.description}</p>}
                    {preview !== undefined && (
                      <pre className={styles.preview} aria-label={`Preview of ${first?.filename}`}><code>{preview || ' '}</code></pre>
                    )}
                    <div className={styles.meta}>
                      {first && <span><span className={styles.dot} style={{ background: fileColor(first.filename) }} />{first.filename}</span>}
                      {fileCount > 1 && <span><FileCode size={12} /> +{fileCount - 1} more</span>}
                      <span className={styles.time}>{timeAgo(gist.created_at, now)}</span>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <NewGistModal isOpen={creating} onClose={() => setCreating(false)} onSuccess={reload} />
    </div>
  )
}
