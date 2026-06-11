import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AdminRoute from './components/admin/AdminRoute.jsx'
import AdminDashboard from './components/admin/AdminDashboard.jsx'
import AdminImportPage from './components/admin/AdminImportPage.jsx'
import AdminBrowsePage from './components/admin/AdminBrowsePage.jsx'
import SetupScreen from './components/game/SetupScreen.jsx'
import LobbyScreen from './components/game/LobbyScreen.jsx'
import GameScreen from './components/game/GameScreen.jsx'
import { joinGame } from './lib/edgeFunctions.js'

// Handles /join/:code — auto-joins then redirects to lobby or setup on failure
function JoinRedirect({ user }) {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    joinGame(code)
      .then(() => navigate(`/lobby/${code.toUpperCase()}`, { replace: true }))
      .catch(e => navigate('/setup', { replace: true, state: { error: e.message } }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user]) // navigate is stable; intentionally excluded

  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <span className="text-dim font-display text-xs tracking-widest">JOINING…</span>
    </div>
  )
}

export default function App() {
  const { user, loading, sendMagicLink, signOut } = useAuth()
  const location = useLocation()
  const [linkSentTo, setLinkSentTo] = useState(null)
  const [authError, setAuthError] = useState(null)
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
          linkSentTo
            ? <VerifyScreen email={linkSentTo} />
            : user
              ? <Navigate to="/setup" replace />
              : <LoginScreen
                  onSendLink={handleSendLink}
                  loading={authLoading}
                  error={authError}
                  expiredSession={location.state?.expired ?? false}
                  onClearError={() => setAuthError(null)}
                />
        }
      />

      <Route
        path="/setup"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <SetupScreen />
          </ProtectedRoute>
        }
      />

      <Route
        path="/join/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <JoinRedirect user={user} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/lobby/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <LobbyScreen userId={user?.id} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/game/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <GameScreen userId={user?.id} />
          </ProtectedRoute>
        }
      />

      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/import/:table" element={<AdminRoute><AdminImportPage /></AdminRoute>} />
      <Route path="/admin/browse/:table" element={<AdminRoute><AdminBrowsePage /></AdminRoute>} />

      {/*
        Guard on `loading` — do NOT redirect while auth is still resolving.
        The magic link lands here as /#access_token=... and the Supabase SDK
        needs one render cycle to parse the hash and fire onAuthStateChange.
        Redirecting immediately (loading=true, user=null) strips the hash and
        breaks implicit-flow magic link auth entirely.
      */}
      <Route
        path="*"
        element={
          loading
            ? null
            : <Navigate to={user ? '/setup' : '/login'} replace />
        }
      />
    </Routes>
  )
}
