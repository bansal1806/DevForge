import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Star } from 'lucide-react'
import type { Repository } from '../../lib/api'
import { Badge, Card } from '../ui'
import { heatOf, timeAgo } from '../../lib/time'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './RepoCard.module.css'

interface RepoCardProps {
  repo: Repository
  /** Reference time for relative dates, captured once by the page to keep render pure */
  now: number
  /** Prefix the name with the owner (for repositories that aren't yours) */
  showOwner?: boolean
}

/** A repository tile: heat dot (molten when touched in the last 10 minutes), name, visibility, stars. */
export function RepoCard({ repo, now, showOwner }: RepoCardProps) {
  const hot = heatOf(repo.updated_at, now) === 'molten'
  return (
    <motion.div variants={fadeUp} className={styles.cell}>
      <Link to={`/repo/${repo.id}`} className={styles.link}>
        <Card interactive className={styles.card}>
          <div className={styles.top}>
            <span className={`${styles.heat} ${hot ? styles.hot : ''}`} aria-hidden="true" />
            <span className={styles.name}>
              {showOwner && repo.owner?.name && <span className={styles.owner}>{repo.owner.name} / </span>}
              {repo.name}
            </span>
            {repo.is_private
              ? <Badge tone="neutral" icon={<Lock size={11} />}>private</Badge>
              : <Badge tone="steel">public</Badge>}
          </div>
          <p className={styles.desc}>{repo.description || 'No description yet.'}</p>
          <div className={styles.meta}>
            <span aria-label={`${repo.stars_count || 0} stars`}>
              <Star size={13} className={repo.starred_by_me ? styles.starred : undefined} /> {repo.stars_count || 0}
            </span>
            <span title={new Date(repo.updated_at).toLocaleString()}>Updated {timeAgo(repo.updated_at, now)}</span>
          </div>
        </Card>
      </Link>
    </motion.div>
  )
}

/** Responsive, staggered grid for RepoCards. */
export function RepoGrid({ children }: { children: ReactNode }) {
  return (
    <motion.div className={styles.grid} initial="hidden" animate="visible" variants={stagger(0.04)}>
      {children}
    </motion.div>
  )
}
