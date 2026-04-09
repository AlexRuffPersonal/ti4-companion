import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ user, loading, children }) {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="font-display text-xs text-dim tracking-widest animate-pulse">
          INITIALIZING...
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
