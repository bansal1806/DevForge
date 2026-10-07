import cx from 'classnames'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Commit } from '../../lib/api'
import { heatOf, timeAgo } from '../../lib/time'
import { Avatar, Badge } from '../ui'
import { spring } from '../../lib/motion'
import styles from './CommitGraph.module.css'

const ROW = 64 // px; every row has the same height so rail segments join up
const LANE = 20 // x of the branch rail
const MERGE_LANE = 44 // x of the incoming merged branch
const MID = ROW / 2

interface CommitGraphProps {
  commits: Commit[]
  repoId: string
}

/**
 * Commit history as a rail: nodes for commits, a second rail curving in for
 * merges. The rail draws itself as rows scroll into view; recent commits
 * glow molten and cool to steel with age.
 */
export function CommitGraph({ commits, repoId }: CommitGraphProps) {
  // Captured once per mount so render stays pure
  const [now] = useState(() => Date.now())

  return (
    <ol className={styles.graph} aria-label="Commit history">
      {commits.map((commit, i) => {
        const isFirst = i === 0
        const isLast = i === commits.length - 1
        const isMerge = !!commit.merge_parent_id
        const heat = heatOf(commit.created_at, now)
        const delay = Math.min(i, 12) * 0.05

        const draw = {
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true },
          transition: { duration: 0.35, delay, ease: 'easeOut' as const },
        }

        return (
          <li key={commit.id} className={styles.row} style={{ height: ROW }}>
            <div className={styles.rail} aria-hidden="true">
              <svg viewBox={`0 0 56 ${ROW}`} height={ROW}>
                {/* Rail above the node (towards newer commits) */}
                {!isFirst && <motion.path className={styles.line} d={`M ${LANE} 0 V ${MID - 8}`} {...draw} />}
                {/* Rail below the node (towards the parent) */}
                {(!isLast || commit.parent_id) && (
                  <motion.path className={styles.line} d={`M ${LANE} ${MID + 8} V ${ROW}`} {...draw} />
                )}
                {/* A merge brings in a second parent from the side */}
                {isMerge && (
                  <motion.path
                    className={styles.mergeLine}
                    d={`M ${MERGE_LANE} 0 C ${MERGE_LANE} ${MID * 0.7}, ${LANE + 6} ${MID * 0.55}, ${LANE + 6} ${MID - 4}`}
                    {...draw}
                  />
                )}
                {/* Tip of the merged-in branch */}
                {isMerge && (
                  <motion.circle
                    className={styles.mergeTip}
                    cx={MERGE_LANE}
                    cy={3}
                    r={3.5}
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                )}

                {heat === 'molten' && !isMerge && <circle className={styles.glow} cx={LANE} cy={MID} r={9} />}
                <motion.circle
                  className={cx(styles.node, isMerge ? styles.mergeNode : styles[heat])}
                  cx={LANE}
                  cy={MID}
                  r={isMerge ? 7 : 6}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: delay + 0.1 }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              </svg>
            </div>

            <Link to={`/repo/${repoId}/commits/${commit.id}`} className={styles.link}>
              <Avatar name={commit.author?.name || 'Deleted user'} src={commit.author?.avatar_url} size={28} />
              <div className={styles.main}>
                <div className={styles.message} title={commit.message}>{commit.message}</div>
                <div className={styles.meta}>
                  <span>{commit.author?.name || 'Deleted user'}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={commit.created_at} title={new Date(commit.created_at).toLocaleString()}>
                    {timeAgo(commit.created_at, now)}
                  </time>
                  {isMerge && <Badge tone="info">merge</Badge>}
                  {heat === 'molten' && !isMerge && <Badge tone="ember">fresh</Badge>}
                </div>
              </div>
              <span className={styles.sha}>{commit.id.slice(0, 7)}</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
