import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Eye, EyeOff, GitMerge, Hammer, Play, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { apiClient, getErrorMessage } from '../../lib/api'
import { AnvilArt, Button, Input, Tabs, ThemeToggle, toast } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { signInToDemo } from '../../lib/demoLogin'
import { sparkBurst } from '../../lib/sparks'
import { fadeUp, stagger } from '../../lib/motion'
import styles from './Auth.module.css'

type Mode = 'signin' | 'signup'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8 // mirrors the API's signup rule

const POINTS = [
  { icon: GitMerge, text: 'Real three-way merges with conflict detection' },
  { icon: Play, text: 'Run Python, JS, TS and C++ in a sandbox' },
  { icon: ShieldCheck, text: 'Row-level security on every table' },
]

export default function Auth() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anvil = useRef<HTMLDivElement>(null)

  // A few ambient sparks off the anvil while the page is open
  useEffect(() => {
    const strike = () => sparkBurst(anvil.current, { count: 14, power: 5, spread: 120 })
    const first = window.setTimeout(strike, 600)
    const timer = window.setInterval(strike, 4200)
    return () => { window.clearTimeout(first); window.clearInterval(timer) }
  }, [])

  if (!authLoading && user) return <Navigate to="/dashboard" replace />

  const isSignup = mode === 'signup'
  const emailError = touched && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : null
  const passwordError = touched && isSignup && password.length < MIN_PASSWORD
    ? `Use at least ${MIN_PASSWORD} characters`
    : touched && !password ? 'Enter your password' : null

  const switchMode = (next: string) => {
    setMode(next as Mode)
    setError(null)
    setTouched(false)
  }

  const handleDemoLogin = async () => {
    setDemoLoading(true)
    setError(null)
    try {
      await signInToDemo()
      navigate('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err, 'Demo access failed'))
    } finally {
      setDemoLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!EMAIL_RE.test(email.trim()) || !password || (isSignup && password.length < MIN_PASSWORD)) return

    setLoading(true)
    setError(null)
    try {
      if (!isSignup) {
        const { data: result } = await apiClient.post('/api/auth/login', { email: email.trim(), password })
        // Sync the browser Supabase client with the session issued by the API
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })
        if (sessionError) throw sessionError
        navigate('/dashboard')
      } else {
        await apiClient.post('/api/auth/signup', { email: email.trim(), password, name: name.trim() || undefined })
        toast.success('Account created', { description: 'Check your email if confirmation is required, then sign in.' })
        setMode('signin')
        setPassword('')
        setTouched(false)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <Link to="/" className={styles.brand} aria-label="DevForge home">
          <span className={styles.brandMark}><Hammer size={16} /></span>
          DevForge
        </Link>

        <motion.div className={styles.brandBody} initial="hidden" animate="visible" variants={stagger(0.08, 0.1)}>
          <motion.h2 variants={fadeUp} className={styles.brandTitle}>
            Where code gets <span className="text-gradient">forged.</span>
          </motion.h2>
          <motion.ul variants={fadeUp} className={styles.points}>
            {POINTS.map((p) => (
              <li key={p.text}><span className={styles.pointIcon}><p.icon size={16} /></span>{p.text}</li>
            ))}
          </motion.ul>
        </motion.div>

        <div className={styles.anvil} ref={anvil} aria-hidden="true">
          <AnvilArt size={180} />
        </div>
        <div className={styles.brandGlow} aria-hidden="true" />
      </aside>

      <main className={styles.formSide}>
        <div className={styles.topBar}>
          <Link to="/" className={styles.mobileBrand} aria-label="DevForge home">
            <span className={styles.brandMark}><Hammer size={14} /></span>DevForge
          </Link>
          <ThemeToggle showLabels={false} />
        </div>

        <motion.div className={styles.formCard} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className={styles.subtitle}>
            {isSignup ? 'Start forging repositories in seconds.' : 'Sign in to pick up where you left off.'}
          </p>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={demoLoading}
            onClick={handleDemoLogin}
            iconLeft={<Sparkles size={18} />}
          >
            Explore with the demo account
          </Button>

          <div className={styles.divider}><span>or continue with email</span></div>

          <Tabs
            label="Authentication mode"
            value={mode}
            onChange={switchMode}
            items={[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Create account' }]}
          />

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {isSignup && (
              <Input
                label="Name"
                optional
                autoComplete="name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
              />
            )}
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              error={emailError}
            />
            <div className={styles.passwordWrap}>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
                error={passwordError}
                hint={isSignup ? `At least ${MIN_PASSWORD} characters.` : undefined}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <motion.div className={styles.error} role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                <AlertCircle size={16} /> {error}
              </motion.div>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading} iconRight={<ArrowRight size={16} />}>
              {isSignup ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className={styles.legal}>
            The demo account is shared — anything you create there is visible to other visitors.
          </p>
        </motion.div>
      </main>
    </div>
  )
}
