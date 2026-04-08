import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { apiClient } from '../../lib/api'
import styles from './Auth.module.css'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup'
      
      const { data: result } = await apiClient.post(endpoint, { 
        email, 
        password 
      })

      if (isLogin) {
        // Essential: Sync the Supabase client with the proxied session
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })

        if (sessionError) throw sessionError
        navigate('/dashboard')
      } else {
        // Registration successful
        alert('Registration successful! Please check your email if confirmation is required.')
        setIsLogin(true)
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'An error occurred during authentication'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles['auth-container']}>
      <motion.div
        className={styles['auth-card']}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className={styles['auth-header']}>
          <div className={styles['auth-logo']}>
            <GitBranch size={24} />
          </div>
          <h1 className={styles['auth-title']}>
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className={styles['auth-subtitle']}>
            {isLogin
              ? 'Enter your details to access your workspace'
              : 'Sign up to start forging your code'}
          </p>
        </div>

        {error && (
          <motion.div 
            className={styles['auth-error']}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        <form className={styles['auth-form']} onSubmit={handleSubmit}>
          <div className={styles['form-group']}>
            <label htmlFor="email">Email</label>
            <div className={styles['form-input-wrapper']}>
              <Mail size={16} className={styles['form-icon']} />
              <input
                id="email"
                type="email"
                className={styles['form-input']}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles['form-group']}>
            <label htmlFor="password">Password</label>
            <div className={styles['form-input-wrapper']}>
              <Lock size={16} className={styles['form-icon']} />
              <input
                id="password"
                type="password"
                className={styles['form-input']}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className={styles['auth-submit']}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className={styles['auth-toggle']}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            type="button"
            className={styles['auth-toggle-btn']}
            onClick={() => {
              setIsLogin(!isLogin)
              setError(null)
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
