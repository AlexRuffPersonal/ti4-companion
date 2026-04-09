import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'

// Placeholder screens — replaced in later phases
function SetupPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">SETUP — Phase 2</span></div>
}
function DashboardPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">DASHBOARD — Phase 2</span></div>
}
function AdminPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">ADMIN — Phase 1</span></div>
}

export default function App() {
  const { user, loading, sendMagicLink, signOut } = useAuth()
  const [linkSentTo, setLinkSentTo] = useState(null)
  const [authError, setAuthError]   = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  async function handleSendLink(email) {
    setAuthError(null)
    setAuthLoading(true)
    try {
      await sendMagicLink(email)
      setLinkSentTo(email)
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/setup" replace /> :
          linkSentTo ? <VerifyScreen email={linkSentTo} /> :
          <LoginScreen onSendLink={handleSendLink} loading={authLoading} error={authError} />
        }
      />
      <Route
        path="/setup"
        element={<ProtectedRoute user={user} loading={loading}><SetupPlaceholder /></ProtectedRoute>}
      />
      <Route
        path="/dashboard"
        element={<ProtectedRoute user={user} loading={loading}><DashboardPlaceholder /></ProtectedRoute>}
      />
      <Route
        path="/admin/*"
        element={<ProtectedRoute user={user} loading={loading}><AdminPlaceholder /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to={user ? '/setup' : '/login'} replace />} />
    </Routes>
  )
}
