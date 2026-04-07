import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, PieChart, Pie
} from 'recharts'
import { 
  Shield, 
  Activity, 
  Users, 
  GitBranch, 
  Terminal, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Cpu,
  Database,
  History,
  Zap,
  LayoutDashboard
} from 'lucide-react'
import { getSystemHealth, getAdminMetrics, getAdminLogs } from '../../lib/api'
import type { SystemHealth, ExecutionStat, AuditLog } from '../../lib/api'
import styles from './AdminDashboard.module.css'

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [metrics, setMetrics] = useState<{ executions: ExecutionStat[], users: number, repos: number } | null>(null)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [healthRes, metricsRes, logsRes] = await Promise.all([
          getSystemHealth(),
          getAdminMetrics(),
          getAdminLogs()
        ])
        setHealth(healthRes)
        setMetrics(metricsRes)
        setLogs(logsRes)
      } catch (err) {
        console.error('Failed to fetch admin data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    
    // Auto-refresh health every 30s
    const interval = setInterval(async () => {
      const h = await getSystemHealth()
      setHealth(h)
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Process data for charts
  const getDailyExecutions = () => {
    if (!metrics?.executions) return []
    const days: any = {}
    metrics.executions.forEach(ex => {
      const day = new Date(ex.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!days[day]) days[day] = { name: day, success: 0, error: 0 }
      if (ex.status === 'success') days[day].success++
      else days[day].error++
    })
    return Object.values(days).slice(-7)
  }

  const getLanguageStats = () => {
    if (!metrics?.executions) return []
    const langs: any = {}
    metrics.executions.forEach(ex => {
      if (!langs[ex.language]) langs[ex.language] = { name: ex.language, value: 0 }
      langs[ex.language].value++
    })
    return Object.values(langs)
  }

  const chartColors = ['#22d3ee', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  if (loading && !health) {
    return (
      <div className={styles['admin-dashboard']}>
        <div style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Activity className="animate-pulse" size={48} color="var(--accent-neon)" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles['admin-dashboard']}>
      <motion.div 
        className={styles['admin-header']}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
           <LayoutDashboard size={24} color="var(--accent-neon)" />
           <span style={{ color: 'var(--accent-neon)', fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>DevOps Center</span>
        </div>
        <h1 className={styles['admin-title']}>System Command</h1>
        <p className={styles['admin-subtitle']}>Global observability and infrastructure health monitoring.</p>
      </motion.div>

      {/* Health Checks */}
      <div className={styles['health-row']}>
        <HealthPill label="API Server" status={health?.api || 'offline'} icon={<Zap size={16} />} />
        <HealthPill label="Supabase DB" status={health?.supabase || 'offline'} icon={<Database size={16} />} />
        <HealthPill label="Docker Engine" status={health?.docker || 'offline'} icon={<Shield size={16} />} />
      </div>

      {/* Stats Cards */}
      <div className={styles['stats-grid']}>
        <StatCard label="Total Users" value={metrics?.users || 0} icon={<Users size={20} />} trend="+12% vs last month" />
        <StatCard label="Repositories" value={metrics?.repos || 0} icon={<GitBranch size={20} />} trend="+5% vs last month" />
        <StatCard label="Code Runs" value={metrics?.executions.length || 0} icon={<Terminal size={20} />} trend="Real-time tracking" />
      </div>

      {/* Charts & Logs */}
      <div className={styles['charts-grid']}>
        <div className={styles['chart-card']}>
          <div className={styles['chart-title']}>
            <Activity size={18} color="var(--accent-neon)" /> Execution Trends (7D)
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={getDailyExecutions() as any[]}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="success" stroke="#10b981" fillOpacity={1} fill="url(#colorSuccess)" strokeWidth={2} />
                <Area type="monotone" dataKey="error" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles['chart-card']}>
          <div className={styles['chart-title']}>
             <Cpu size={18} color="var(--accent-purple)" /> Language Share
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={getLanguageStats() as any[]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {getLanguageStats().map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: -20, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {getLanguageStats().map((item: any, i: number) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: chartColors[i % chartColors.length] }} />
                  {item.name}
                </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global Audit Logs */}
      <div className={`${styles['chart-card']} ${styles['audit-card']}`}>
        <div className={styles['chart-title']}>
          <History size={18} color="var(--accent-amber)" /> Global Audit Feed
        </div>
        <div className={styles['audit-feed']}>
          {logs.map((log) => (
            <div key={log.id} className={styles['audit-item']}>
              <div className={styles['audit-icon']}>
                <ActionIcon action={log.action} />
              </div>
              <div className={styles['audit-content']}>
                <div className={styles['audit-action']}>
                   {log.user?.name || 'System'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>performed</span> {log.action.replace('_', ' ')}
                </div>
                <div className={styles['audit-meta']}>
                  {log.repository?.name ? `on repository: ${log.repository.name}` : 'Global change'}
                </div>
              </div>
              <div className={styles['audit-time']}>
                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          {logs.length === 0 && <div className={styles['terminal-empty']}>No activity logs yet.</div>}
        </div>
      </div>
    </div>
  )
}

function HealthPill({ label, status, icon }: { label: string, status: string, icon: any }) {
  const isOnline = status === 'online'
  return (
    <div className={styles['health-pill']}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: isOnline ? 'var(--accent-neon)' : 'var(--text-muted)' }}>{icon}</span>
        {label}
      </div>
      <div className={`${styles['health-status-dot']} ${isOnline ? styles['status-online'] : styles['status-offline']}`} />
    </div>
  )
}

function StatCard({ label, value, trend, icon }: { label: string, value: number | string, trend: string, icon: any }) {
  return (
    <motion.div className={styles['stat-card']} whileHover={{ y: -5 }}>
      <div className={styles['stat-label']}>{label}</div>
      <div className={styles['stat-value']}>{value}</div>
      <div className={styles['stat-trend']}>
        {icon} <span className={styles['trend-none']}>{trend}</span>
      </div>
    </motion.div>
  )
}

function ActionIcon({ action }: { action: string }) {
  if (action.includes('created')) return <CheckCircle2 size={16} />
  if (action.includes('deleted')) return <AlertCircle size={16} />
  return <Clock size={16} />
}
