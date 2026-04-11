import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, joinGame } from '../../lib/edgeFunctions.js'

export default function SetupScreen() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setError(null)
    setLoading(true)
    try {
      const { code } = await createGame()
      navigate(`/lobby/${code}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setError(null)
    setLoading(true)
    try {
      await joinGame(code)
      navigate(`/lobby/${code}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-8 px-4">
      <h1 className="font-display text-bright text-2xl tracking-widest">TI4 COMPANION</h1>

      <div className="panel flex flex-col gap-4 w-full max-w-sm">
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create Game'}
        </button>
      </div>

      <div className="panel flex flex-col gap-4 w-full max-w-sm">
        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <input
            className="input uppercase"
            placeholder="Room code (e.g. ABC123)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button
            type="submit"
            className="btn-ghost"
            disabled={loading || !joinCode.trim()}
          >
            Join Game
          </button>
        </form>
      </div>

      {error && <p className="text-danger text-sm font-body">{error}</p>}
    </div>
  )
}
