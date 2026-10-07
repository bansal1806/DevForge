import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DotProps } from 'recharts'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ExecutionStat } from '../../lib/api'
import { Card, EmptyState } from '../../components/ui'
import styles from './InsightsPanel.module.css'

const LANGUAGE_LABEL: Record<string, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', cpp: 'C++' }
const label = (lang: string) => LANGUAGE_LABEL[lang] || lang

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** What Recharts passes to custom tooltip content (kept minimal across versions). */
interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
}

const formatMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`)

interface RunPoint {
  index: number
  duration: number
  status: ExecutionStat['status']
  language: string
  at: string
}

/** Only failed runs get a marker — the line carries the trend, markers flag problems. */
function ErrorDot(props: DotProps & { payload?: RunPoint }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || payload.status === 'success') return null
  return <circle cx={cx} cy={cy} r={5} fill="var(--chart-error)" stroke="var(--color-surface)" strokeWidth={2} />
}

function DurationTooltip({ active, payload }: TipProps) {
  const point = payload?.[0]?.payload as RunPoint | undefined
  if (!active || !point) return null
  const ok = point.status === 'success'
  return (
    <div className={styles.tooltip}>
      <strong>{formatMs(point.duration)}</strong>
      <span>{label(point.language)} · {new Date(point.at).toLocaleString()}</span>
      <span className={ok ? styles.statusOk : styles.statusErr}>
        {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {ok ? 'Succeeded' : point.status === 'timeout' ? 'Timed out' : 'Failed'}
      </span>
    </div>
  )
}

function LanguageTooltip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload as { name: string, runs: number } | undefined
  if (!active || !row) return null
  return (
    <div className={styles.tooltip}>
      <strong>{row.runs} run{row.runs === 1 ? '' : 's'}</strong>
      <span>{row.name}</span>
    </div>
  )
}

/** Execution insights: KPI tiles, duration trend with failures flagged, runs by language, table view. */
export function InsightsPanel({ metrics }: { metrics: ExecutionStat[] }) {
  const data = useMemo(() => {
    const runs: RunPoint[] = metrics
      .slice(-40)
      .map((m, i) => ({ index: i + 1, duration: m.duration, status: m.status, language: m.language, at: m.created_at }))
    const succeeded = metrics.filter((m) => m.status === 'success').length
    const byLanguage = Object.entries(
      metrics.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.language]: (acc[m.language] || 0) + 1 }), {})
    )
      .map(([lang, runs]) => ({ name: label(lang), runs }))
      .sort((a, b) => b.runs - a.runs)
    return {
      runs,
      total: metrics.length,
      successRate: metrics.length ? Math.round((succeeded / metrics.length) * 100) : 0,
      failed: metrics.length - succeeded,
      medianMs: median(metrics.map((m) => m.duration)),
      byLanguage,
    }
  }, [metrics])

  if (metrics.length === 0) {
    return (
      <Card padding="none">
        <EmptyState title="No runs yet" description="Open a file and press Run — execution stats for this repository will show up here." />
      </Card>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.kpis}>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Runs</span>
          <span className={styles.kpiValue}>{data.total.toLocaleString()}</span>
          <span className={styles.kpiSub}>last {Math.min(data.total, 200)} recorded</span>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Success rate</span>
          <span className={styles.kpiValue}>{data.successRate}%</span>
          <div className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.successRate} aria-label="Success rate">
            <div className={styles.meterFill} style={{ width: `${data.successRate}%` }} />
          </div>
          <span className={styles.kpiSub}>{data.failed} failed or timed out</span>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Median duration</span>
          <span className={styles.kpiValue}>{formatMs(data.medianMs)}</span>
          <span className={styles.kpiSub}>wall time per run</span>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Top language</span>
          <span className={styles.kpiValue}>{data.byLanguage[0]?.name || '—'}</span>
          <span className={styles.kpiSub}>{data.byLanguage[0]?.runs || 0} runs</span>
        </Card>
      </div>

      <div className={styles.charts}>
        <Card>
          <h3 className={styles.chartTitle}>Run duration</h3>
          <p className={styles.chartSub}>Last {data.runs.length} runs, oldest to newest</p>
          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.swatchLine} /> Duration</span>
            <span className={styles.legendItem}><span className={styles.swatchDot} /> Failed run</span>
          </div>
          <div className={styles.chartBox}>
            <ResponsiveContainer>
              <LineChart data={data.runs} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="index" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
                <YAxis tickFormatter={formatMs} width={52} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip content={<DurationTooltip />} cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="duration"
                  stroke="var(--chart-series)"
                  strokeWidth={2}
                  dot={<ErrorDot />}
                  activeDot={{ r: 5, fill: 'var(--chart-series)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className={styles.chartTitle}>Runs by language</h3>
          <p className={styles.chartSub}>All recorded runs</p>
          <div className={styles.chartBox} style={{ height: Math.max(140, data.byLanguage.length * 44) }}>
            <ResponsiveContainer>
              <BarChart data={data.byLanguage} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={10}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} tickLine={false} axisLine={false} />
                <Tooltip content={<LanguageTooltip />} cursor={{ fill: 'var(--color-hover)' }} />
                <Bar dataKey="runs" fill="var(--color-ember)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="runs" position="right" style={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <details className={styles.tableToggle}>
        <summary>View runs as a table</summary>
        <table className={styles.table}>
          <thead>
            <tr><th>#</th><th>When</th><th>Language</th><th>Outcome</th><th className={styles.num}>Duration</th></tr>
          </thead>
          <tbody>
            {[...data.runs].reverse().map((run) => (
              <tr key={run.index}>
                <td>{run.index}</td>
                <td>{new Date(run.at).toLocaleString()}</td>
                <td>{label(run.language)}</td>
                <td>{run.status === 'success' ? 'Succeeded' : run.status === 'timeout' ? 'Timed out' : 'Failed'}</td>
                <td className={styles.num}>{formatMs(run.duration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
