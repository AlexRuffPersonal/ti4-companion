import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../../hooks/useGame.js'
import { supabase } from '../../lib/supabase.js'

const COLOURS = ['red', 'blue', 'yellow', 'green', 'purple', 'black', 'orange', 'pink']

export default function LobbyScreen({ userId }) {
  const { code } = useParams()
  const { game, players, currentPlayer, isHost, loading, error,
          updateSettings, pickFaction, setGameSpeaker, startTheGame } = useGame(code, userId)

  const [factions, setFactions] = useState([])
  const [pickError, setPickError] = useState(null)
  const [startError, setStartError] = useState(null)
  const [starting, setStarting] = useState(false)

  // Optimistic faction/color selection
  const [pendingFaction, setPendingFaction] = useState(null)
  const [pendingColour, setPendingColour] = useState(null)

  useEffect(() => {
    supabase.from('factions').select('name, expansion').order('name')
      .then(({ data }) => setFactions(data ?? []))
  }, [])

  const takenFactions = new Set(players.filter(p => p.user_id !== userId).map(p => p.faction).filter(Boolean))
  const takenColours = new Set(players.filter(p => p.user_id !== userId).map(p => p.colour).filter(Boolean))

  const allReady = players.length > 0 && players.every(p => p.faction && p.colour)
  const canStart = allReady && game?.speaker_player_id

  async function handlePick(faction, colour) {
    if (!faction || !colour) return
    setPendingFaction(faction)
    setPendingColour(colour)
    setPickError(null)
    try {
      await pickFaction(faction, colour)
    } catch (e) {
      setPickError(e.message)
      setPendingFaction(null)
      setPendingColour(null)
    }
  }

  async function handleStart() {
    setStartError(null)
    setStarting(true)
    try {
      await startTheGame()
    } catch (e) {
      setStartError(e.message)
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-dim font-display text-xs tracking-widest">LOADING…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-danger font-body text-sm">{error}</span>
      </div>
    )
  }

  const displayFaction = pendingFaction ?? currentPlayer?.faction ?? ''
  const displayColour = pendingColour ?? currentPlayer?.colour ?? ''

  return (
    <div className="min-h-screen bg-void p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-bright text-xl tracking-widest">LOBBY</h1>
        <span className="font-mono text-gold text-lg tracking-widest">{code}</span>
      </div>

      {/* Shareable link */}
      <div className="panel-inset">
        <p className="label">Share this link to invite players</p>
        <p className="font-mono text-text text-sm break-all">
          {window.location.origin}/join/{code}
        </p>
      </div>

      {/* Player list */}
      <div className="panel flex flex-col gap-2">
        <h2 className="label">Players ({players.length}/8)</h2>
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.colour ?? '#555' }}
            />
            <span className="font-body text-text flex-1">{p.display_name}</span>
            <span className="font-body text-muted text-sm">{p.faction ?? '—'}</span>
          </div>
        ))}
      </div>

      {/* Your pick */}
      <div className="panel flex flex-col gap-4">
        <h2 className="label">Your Selection</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="faction-select" className="label">Faction</label>
          <select
            id="faction-select"
            className="input"
            value={displayFaction}
            onChange={(e) => handlePick(e.target.value, displayColour)}
            aria-label="Faction"
          >
            <option value="">— pick a faction —</option>
            {factions.map(f => (
              <option key={f.name} value={f.name} disabled={takenFactions.has(f.name)}>
                {f.name}{takenFactions.has(f.name) ? ' (taken)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="label">Colour</span>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map(c => (
              <button
                key={c}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  displayColour === c ? 'border-bright scale-110' : 'border-transparent'
                } ${takenColours.has(c) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ backgroundColor: c === 'black' ? '#222' : c }}
                disabled={takenColours.has(c)}
                onClick={() => handlePick(displayFaction, c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {pickError && <p className="text-danger text-sm font-body">{pickError}</p>}
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="panel flex flex-col gap-4">
          <h2 className="label">Game Settings</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="vp-goal" className="label">VP Goal</label>
            <input
              id="vp-goal"
              type="number"
              className="input w-24"
              min={1}
              value={game?.vp_goal ?? 10}
              onChange={(e) => updateSettings({ vp_goal: Number(e.target.value) })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="label">Expansions</span>
            {['pok', 'te'].map(exp => (
              <label key={exp} className="flex items-center gap-2 font-body text-text text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={game?.expansions?.[exp] ?? false}
                  onChange={(e) => updateSettings({ expansions: { ...game.expansions, [exp]: e.target.checked } })}
                />
                {exp === 'pok' ? 'Prophecy of Kings' : 'Codex: Vigil & Thunder\'s Edge'}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="permissions" className="label">Permissions</label>
            <select
              id="permissions"
              className="input"
              value={game?.permissions_mode ?? 'host'}
              onChange={(e) => updateSettings({ permissions_mode: e.target.value })}
            >
              <option value="host">Host only</option>
              <option value="all">All players</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="speaker" className="label">Speaker</label>
            <select
              id="speaker"
              className="input"
              value={game?.speaker_player_id ?? ''}
              onChange={(e) => setGameSpeaker(e.target.value)}
            >
              <option value="">— assign speaker —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>

          {startError && <p className="text-danger text-sm font-body">{startError}</p>}

          <button
            className="btn-primary"
            disabled={!canStart || starting}
            onClick={handleStart}
          >
            {starting ? 'Starting…' : 'Start Game'}
          </button>
        </div>
      )}
    </div>
  )
}
