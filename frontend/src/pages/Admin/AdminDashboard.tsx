import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Shield, Users, GitBranch, Terminal, Database, History, Zap, Container, RefreshCw,
  CheckCircle2, XCircle, CirclePlus, CircleMinus, Pencil,
} from 'lucide-react'
import { getSystemHealth, getAdminMetrics, getAdminLogs, getErrorMessage } from '../../lib/api'
import type { SystemHealth, AdminMetrics, AuditLog } from '../../lib/api'
import { Button, Card, EmptyState, PageHeader, Skeleton, toast } from '../../components/ui'
import { fadeUp, stagger } from '../../lib/motion'
import { timeAgo } from '../../lib/time'
import styles from './AdminDashboard.module.css'

/** How often the health pills re-check themselves. */
const HEALTH_REFRESH_MS = 30_000
const DAYS = 7
const LANGUAGE_LABEL: Record<string, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', cpp: 'C++' }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** What Recharts passes to custom tooltip content (kept minimal across versions). */
interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

interface DayRow { name: string, succeeded: number, failed: number }

function DayTooltip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload as DayRow | undefined
  if (!active || !row) return null
  return (
    <div className={styles.tooltip}>
      <strong>{row.name}</strong>
      <span><CheckCircle2 size={12} className={styles.ok} /> {row.succeeded} succeeded</span>
      <span><XCircle size={12} className={styles.err} /> {row.failed} failed or timed out</span>
    </div>
  )
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, metricsRes, logsRes] = await Promise.all([getSystemHealth(), getAdminMetrics(), getAdminLogs()])
        setHealth(healthRes)
        setMetrics(metricsRes)
        setLogs(logsRes)
        setNow(Date.now())
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) setForbidden(true)
        else setError(getErrorMessage(err, 'Failed to load admin data.'))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(() => { getSystemHealth().then(setHealth).catch(() => undefined) }, HEALTH_REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const recheck = async () => {
    setChecking(true)
    try {
      setHealth(await getSystemHealth())
      toast.success('Health re-checked')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Health check failed.'))
    } finally {
      setChecking(false)
    }
  }

  // Last 7 calendar days, oldest first, including days with no runs
  const days = useMemo<DayRow[]>(() => {
    const buckets = new Map<string, DayRow>()
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000)
      const name = `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
      buckets.set(d.toDateString(), { name, succeeded: 0, failed: 0 })
    }
    for (const ex of metrics?.executions || []) {
      const row = buckets.get(new Date(ex.created_at).toDateString())
      if (!row) continue
      if (ex.status === 'success') row.succeeded++
      else row.failed++
    }
    return [...buckets.values()]
  }, [metrics, now])

  const languages = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const ex of metrics?.executions || []) counts[ex.language] = (counts[ex.language] || 0) + 1
    return Object.entries(counts).map(([lang, runs]) => ({ name: LANGUAGE_LABEL[lang] || lang, runs })).sort((a, b) => b.runs - a.runs)
  }, [metrics])

  if (forbidden) {
    return (
      <div className={styles.page}>
        <EmptyState
          art={<Shield size={44} />}
          title="Administrator access required"
          description="This dashboard is only available to platform administrators."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton width={260} height={36} />
        <div className={styles.health}>{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius="var(--radius-lg)" />)}</div>
        <div className={styles.stats}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={112} radius="var(--radius-lg)" />)}</div>
        <Skeleton height={300} radius="var(--radius-lg)" />
      </div>
    )
  }

  if (error) {
    return <div className={styles.page}><EmptyState title="Couldn’t load the admin dashboard" description={error} /></div>
  }

  const runs = metrics?.executions.length || 0
  const succeeded = metrics?.executions.filter((e) => e.status === 'success').length || 0
  const storage = metrics?.storage

  return (
    <motion.div className={styles.page} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <PageHeader
        icon={<Shield size={26} />}
        title="Admin"
        subtitle="Platform health, usage and the audit trail."
        actions={<Button variant="secondary" iconLeft={<RefreshCw size={15} />} loading={checking} onClick={recheck}>Re-check health</Button>}
      />

      <motion.section variants={fadeUp} className={styles.health} aria-label="Service health">
        <HealthPill label="API server" status={health?.api} icon={<Zap size={16} />} />
        <HealthPill label="Supabase" status={health?.supabase} icon={<Database size={16} />} />
        <HealthPill label="Docker sandbox" status={health?.docker} icon={<Container size={16} />} hint="Code runs need Docker" />
      </motion.section>
      {health?.timestamp && <p className={styles.checked}>Last checked {timeAgo(health.timestamp)}</p>}

      <motion.section variants={fadeUp} className={styles.stats} aria-label="Usage">
        <StatCard label="Users" value={(metrics?.users || 0).toLocaleString()} icon={<Users size={18} />} sub="registered accounts" />
        <StatCard label="Repositories" value={(metrics?.repos || 0).toLocaleString()} icon={<GitBranch size={18} />} sub="across all users" />
        <StatCard
          label="Code runs"
          value={runs.toLocaleString()}
          icon={<Terminal size={18} />}
          sub={runs ? `${Math.round((succeeded / runs) * 100)}% succeeded` : 'sandboxed executions'}
        />
        <StatCard
          label="Snapshot storage"
          value={formatBytes(storage?.stored_bytes || 0)}
          icon={<Database size={18} />}
          sub={storage && storage.stored_bytes > 0
            ? `${(storage.logical_bytes / storage.stored_bytes).toFixed(1)}× deduplicated · ${formatBytes(storage.logical_bytes)} logical`
            : 'content-addressed blobs'}
        />
      </motion.section>

      <motion.div variants={fadeUp} className={styles.charts}>
        <Card>
          <h2 className={styles.chartTitle}>Runs per day</h2>
          <p className={styles.chartSub}>Last {DAYS} days</p>
          <div className={styles.legend}>
            <span><i className={styles.swatchOk} /> Succeeded</span>
            <span><i className={styles.swatchErr} /> Failed or timed out</span>
          </div>
          <div className={styles.chartBox}>
            <ResponsiveContainer>
              <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip content={<DayTooltip />} cursor={{ fill: 'var(--color-hover)' }} />
                <Bar dataKey="succeeded" stackId="runs" fill="var(--chart-series)" stroke="var(--color-surface)" strokeWidth={2} maxBarSize={36} isAnimationActive={false} />
                <Bar dataKey="failed" stackId="runs" fill="var(--chart-error)" stroke="var(--color-surface)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className={styles.chartTitle}>Runs by language</h2>
          <p className={styles.chartSub}>Recent executions</p>
          {languages.length === 0 ? (
            <p className={styles.empty}>No runs recorded yet.</p>
          ) : (
            <div className={styles.chartBox} style={{ height: Math.max(140, languages.length * 44) }}>
              <ResponsiveContainer>
                <BarChart data={languages} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={10}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} tickLine={false} axisLine={false} />
                  <Bar dataKey="runs" fill="var(--color-ember)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                    <LabelList dataKey="runs" position="right" style={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <details className={styles.tableToggle}>
          <summary>View runs per day as a table</summary>
          <table className={styles.table}>
            <thead><tr><th>Day</th><th className={styles.num}>Succeeded</th><th className={styles.num}>Failed</th></tr></thead>
            <tbody>
              {days.map((d) => <tr key={d.name}><td>{d.name}</td><td className={styles.num}>{d.succeeded}</td><td className={styles.num}>{d.failed}</td></tr>)}
            </tbody>
          </table>
        </details>
      </motion.div>

      <motion.section variants={fadeUp} aria-labelledby="audit-title">
        <Card padding="none">
          <h2 id="audit-title" className={styles.auditTitle}><History size={17} /> Audit trail</h2>
          {logs.length === 0 ? (
            <EmptyState title="No audit events yet" description="Repository creation, deletion and permission changes are recorded here." />
          ) : (
            <ol className={styles.audit}>
              {logs.map((log) => (
                <li key={log.id} className={styles.auditRow}>
                  <span className={styles.auditIcon}><ActionIcon action={log.action} /></span>
                  <span className={styles.auditText}>
                    <strong>{log.user?.name || log.user?.email || 'System'}</strong> {log.action.replace(/_/g, ' ')}
                    {log.repository?.name && <> · <code>{log.repository.name}</code></>}
                  </span>
                  <time className={styles.auditTime} dateTime={log.created_at} title={new Date(log.created_at).toLocaleString()}>
                    {timeAgo(log.created_at, now)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </motion.section>
    </motion.div>
  )
}

function HealthPill({ label, status, icon, hint }: { label: string, status?: SystemHealth['api'], icon: ReactNode, hint?: string }) {
  const state = status || 'offline'
  return (
    <Card className={styles.pill}>
      <span className={styles.pillIcon}>{icon}</span>
      <span className={styles.pillText}>
        <strong>{label}</strong>
        {state !== 'online' && hint ? <span>{hint}</span> : null}
      </span>
      <span className={`${styles.pillState} ${styles[`state_${state}`]}`}>
        <i aria-hidden="true" /> {state}
      </span>
    </Card>
  )
}

function StatCard({ label, value, sub, icon }: { label: string, value: string, sub: string, icon: ReactNode }) {
  return (
    <Card className={styles.stat}>
      <span className={styles.statLabel}>{icon} {label}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statSub}>{sub}</span>
    </Card>
  )
}

function ActionIcon({ action }: { action: string }) {
  if (action.includes('created') || action.includes('added')) return <CirclePlus size={15} />
  if (action.includes('deleted') || action.includes('removed')) return <CircleMinus size={15} />
  return <Pencil size={14} />
}
