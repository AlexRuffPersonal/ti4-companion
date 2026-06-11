import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginScreen({ onSendLink, loading, error, expiredSession, onClearError }) {
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    if (!EMAIL_RE.test(trimmed)) {
      setLocalError('Please enter a valid email address')
      return
    }
    setLocalError(null)
    onSendLink(trimmed)
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-8 bg-void">
      <div className="text-center">
        <div className="font-display text-xs text-plasma tracking-[0.4em] uppercase mb-2">
          Companion App
        </div>
        <h1 className="font-display text-3xl font-black text-bright tracking-wider">
          TWILIGHT<br />IMPERIUM
        </h1>
        <div className="font-display text-xs text-gold tracking-[0.3em] mt-2">4TH EDITION</div>
      </div>

      {expiredSession && (
        <p className="text-warning text-sm font-body text-center max-w-xs">
          Your session has expired. Please sign in again.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="w-full max-w-xs flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          className="input text-center"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={e => { setEmail(e.target.value); setLocalError(null); onClearError?.() }}
          disabled={loading}
        />
        {displayError && <p className="text-danger text-sm font-body text-center">{displayError}</p>}
        <button
          className="btn-primary py-3"
          type="submit"
          disabled={loading || !email.trim()}
        >
          {loading ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>

      <p className="text-dim text-xs font-body text-center max-w-xs">
        We'll send a sign-in link to your email. No password needed.
      </p>
    </div>
  )
}
