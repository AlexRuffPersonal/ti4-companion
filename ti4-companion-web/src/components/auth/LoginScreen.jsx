import { useState } from 'react'

export default function LoginScreen({ onSendLink, loading, error }) {
  const [email, setEmail] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (email.trim()) onSendLink(email.trim())
  }

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

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          className="input text-center"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={loading}
        />
        {error && <p className="text-danger text-sm font-body text-center">{error}</p>}
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
