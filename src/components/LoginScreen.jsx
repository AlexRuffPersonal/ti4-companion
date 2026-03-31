import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function LoginScreen({ onLogin }) {
  const [tab, setTab]           = useState('signin') // 'signin' | 'signup'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [message, setMessage]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (tab === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        onLogin(data.user)
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setMessage('Check your email for a confirmation link to complete sign up.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-void px-4">
      <div className="starfield" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-display text-3xl text-gold tracking-widest mb-1">TI4</div>
          <div className="font-display text-xs text-dim tracking-[0.3em]">COMPANION</div>
        </div>

        {/* Card */}
        <div className="bg-panel border border-border rounded-lg p-6">
          {/* Tabs */}
          <div className="flex mb-6 border border-border rounded overflow-hidden">
            <button
              className={`flex-1 py-2 font-display text-xs tracking-wider transition-colors ${
                tab === 'signin'
                  ? 'bg-gold text-void'
                  : 'text-dim hover:text-text'
              }`}
              onClick={() => { setTab('signin'); setError(null); setMessage(null) }}
            >
              SIGN IN
            </button>
            <button
              className={`flex-1 py-2 font-display text-xs tracking-wider transition-colors ${
                tab === 'signup'
                  ? 'bg-gold text-void'
                  : 'text-dim hover:text-text'
              }`}
              onClick={() => { setTab('signup'); setError(null); setMessage(null) }}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display text-xs text-dim tracking-wider">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="commander@galaxy.net"
                className="bg-hull border border-border rounded px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-display text-xs text-dim tracking-wider">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                className="bg-hull border border-border rounded px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}

            {message && (
              <p className="text-xs text-success">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 py-2 bg-gold text-void font-display text-xs tracking-wider rounded hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? (tab === 'signin' ? 'SIGNING IN...' : 'SIGNING UP...')
                : (tab === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT')
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
