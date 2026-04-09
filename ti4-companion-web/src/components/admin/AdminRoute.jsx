import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'

export default function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
