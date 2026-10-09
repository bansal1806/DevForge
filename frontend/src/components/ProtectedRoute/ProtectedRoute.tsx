import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ScreenFallback } from '../RouteStates/RouteStates'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <ScreenFallback label="Checking your session…" />

  // Remember where they were headed so sign-in can bring them back
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />

  return <Outlet />
}
