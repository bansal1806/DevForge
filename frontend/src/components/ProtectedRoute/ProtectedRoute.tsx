import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  // Render the child routes if authenticated
  return <Outlet />
}
