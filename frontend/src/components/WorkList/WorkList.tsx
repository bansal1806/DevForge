import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, EmptyState, PageHeader, SearchField, Segmented, Skeleton } from '../ui'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './WorkList.module.css'

export interface WorkItem {
  id: string
  title: string
  status: string
  href: string
  icon: ReactNode
  /** Secondary line under the title */
  meta: ReactNode
  /** Extra text the search should match (repo name, author, …) */
  searchText: string
  aside?: ReactNode
}

interface WorkListProps {
  title: string
  subtitle: string
  icon: ReactNode
  /** Filter tabs in display order; the first is selected initially */
  filters: { status: string, label: string }[]
  items: WorkItem[]
  loading: boolean
  error?: string | null
  emptyTitle: string
  emptyDescription: string
}

/** A filterable, searchable list of issues or pull requests across repositories. */
export function WorkList({ title, subtitle, icon, filters, items, loading, error, emptyTitle, emptyDescription }: WorkListProps) {
  const [status, setStatus] = useState(filters[0].status)
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of items) map[item.status] = (map[item.status] || 0) + 1
    return map
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => item.status === status && (!q || `${item.title} ${item.searchText}`.toLowerCase().includes(q)))
  }, [items, status, query])

  const activeLabel = filters.find((f) => f.status === status)?.label.toLowerCase() || status

  return (
    <div className={styles.page}>
      <PageHeader icon={icon} title={title} subtitle={subtitle} />

      <div className={styles.toolbar}>
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={filters.map((f) => ({ value: f.status, label: f.label, count: loading ? '–' : counts[f.status] || 0 }))}
        />
        <SearchField
          className={styles.search}
          label={`Search ${title.toLowerCase()}`}
          placeholder="Filter by title, repository or author…"
          value={query}
          onChange={setQuery}
        />
      </div>

      <Card padding="none">
        {loading ? (
          <ul className={styles.rows} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.skeletonRow}>
                <Skeleton width={18} height={18} radius="50%" />
                <div className={styles.skeletonText}><Skeleton width="55%" height={14} /><Skeleton width="30%" height={11} /></div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <EmptyState title="Couldn’t load this list" description={error} />
        ) : visible.length === 0 ? (
          query ? (
            <EmptyState title="No matches" description={`Nothing ${activeLabel} matches “${query.trim()}”.`} />
          ) : items.length === 0 ? (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          ) : (
            <EmptyState title={`Nothing ${activeLabel}`} description={`You have no ${activeLabel} ${title.toLowerCase()} right now.`} />
          )
        ) : (
          <motion.ul className={styles.rows} initial="hidden" animate="visible" variants={stagger(0.03)} key={`${status}-${query}`}>
            {visible.map((item) => (
              <motion.li key={item.id} variants={fadeUp}>
                <Link to={item.href} className={styles.row}>
                  <span className={styles.icon}>{item.icon}</span>
                  <span className={styles.main}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.meta}>{item.meta}</span>
                  </span>
                  {item.aside && <span className={styles.aside}>{item.aside}</span>}
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Card>
    </div>
  )
}
