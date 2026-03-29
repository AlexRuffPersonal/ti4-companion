import { useState } from 'react'
import { Users, ChevronDown, ChevronUp, Star, Zap, AlertTriangle } from 'lucide-react'
import { FACTIONS, PLAYER_COLOURS, GALACTIC_EVENTS } from '../data/gameData'
import { defaultPlayer } from '../hooks/useGameState'
import { AGENDAS } from '../data/gameData'

const EXPANSION_LABELS = { base: 'Base Game', pok: 'Prophecy of Kings', te: "Thunder's Edge" }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildAgendaDeck() {
  return shuffle(AGENDAS.map((_, i) => i))
}

export default function SetupScreen({ onCreateGame, loading, error }) {
  const [step, setStep] = useState(1) // 1=config, 2=players, 3=review
  const [expansions, setExpansions] = useState({ base: true, pok: true, te: true })
  const [playerCount, setPlayerCount] = useState(4)
  const [vpGoal, setVpGoal] = useState(10)
  const [galacticEvent, setGalacticEvent] = useState(null)
  const [players, setPlayers] = useState(() =>
    Array.from({ length: 4 }, (_, i) => defaultPlayer({
      colour: PLAYER_COLOURS[i].id,
      name: `Player ${i + 1}`,
    }))
  )
  const [speakerIndex, setSpeakerIndex] = useState(0)
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState(null) // 'create' | 'join'

  const availableFactions = [
    ...FACTIONS.base,
    ...(expansions.pok ? FACTIONS.pok : []),
    ...(expansions.te ? FACTIONS.te : []),
  ]

  const usedFactions = players.map(p => p.faction).filter(Boolean)
  const usedColours = players.map(p => p.colour)

  function setPlayerCount_(n) {
    setPlayerCount(n)
    setPlayers(prev => {
      const next = [...prev]
      while (next.length < n) next.push(defaultPlayer({ colour: PLAYER_COLOURS[next.length]?.id || 'yellow', name: `Player ${next.length + 1}` }))
      return next.slice(0, n)
    })
    setSpeakerIndex(s => Math.min(s, n - 1))
  }

  function updatePlayer(i, field, value) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  async function handleCreate() {
    const initialState = {
      expansions,
      vpGoal,
      galacticEvent,
      speakerId: players[speakerIndex].id,
      agendaPhaseUnlocked: false,
      custodiansClaimed: false,
      players: players.map((p, i) => ({
        ...p,
        commodities: 3,
        commandTokens: { tactic: 3, fleet: 3, strategy: 2 },
      })),
      agendaDeck: buildAgendaDeck(),
      laws: [],
    }
    await onCreateGame(initialState)
  }

  // ── Join screen ──────────────────────────────────────────────────────────────
  if (mode === 'join') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-6 animate-slide-up">
        <div className="text-center">
          <div className="font-display text-2xl text-gold font-bold tracking-widest">JOIN GAME</div>
          <p className="text-dim font-body text-sm mt-1">Enter the 6-character room code</p>
        </div>
        <input
          className="input text-center text-2xl font-display tracking-[0.3em] uppercase max-w-xs"
          placeholder="ABC123"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
          maxLength={6}
        />
        {error && <p className="text-danger text-sm font-body">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => setMode(null)}>Back</button>
          <button
            className="btn-primary"
            disabled={joinCode.length !== 6 || loading}
            onClick={() => onCreateGame(null, joinCode)}
          >
            {loading ? 'Joining…' : 'Join Game'}
          </button>
        </div>
      </div>
    )
  }

  // ── Landing ──────────────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-8 animate-slide-up">
        <div className="starfield" />
        <div className="relative z-10 text-center">
          <div className="font-display text-xs text-plasma tracking-[0.4em] uppercase mb-2">Companion App</div>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-bright tracking-wider leading-tight">
            TWILIGHT<br />IMPERIUM
          </h1>
          <div className="font-display text-xs text-gold tracking-[0.3em] mt-2">4TH EDITION</div>
        </div>
        <div className="relative z-10 flex flex-col gap-3 w-full max-w-xs">
          <button className="btn-primary py-4 text-base tracking-widest font-display" onClick={() => setMode('create')}>
            CREATE GAME
          </button>
          <button className="btn-ghost py-4 text-base tracking-widest font-display" onClick={() => setMode('join')}>
            JOIN GAME
          </button>
        </div>
        <div className="relative z-10 text-dim text-xs font-body text-center">
          Real-time sync · Up to 8 players · All expansions
        </div>
      </div>
    )
  }

  // ── Create: Step 1 — Config ───────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen px-4 py-8 flex flex-col gap-6 max-w-lg mx-auto animate-slide-up">
        <StepHeader step={1} total={3} title="Game Configuration" />

        {/* Expansions */}
        <section className="panel p-4 flex flex-col gap-3">
          <div className="label">Expansions</div>
          {Object.entries(EXPANSION_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  expansions[key] ? 'bg-gold border-gold' : 'border-muted bg-hull'
                }`}
                onClick={() => key !== 'base' && setExpansions(e => ({ ...e, [key]: !e[key] }))}
              >
                {expansions[key] && <span className="text-void text-xs font-bold">✓</span>}
              </div>
              <span className={`font-body text-sm ${key === 'base' ? 'text-dim cursor-not-allowed' : 'text-text'}`}>
                {label}
                {key === 'base' && <span className="text-dim text-xs ml-2">(required)</span>}
              </span>
            </label>
          ))}
        </section>

        {/* Player count */}
        <section className="panel p-4 flex flex-col gap-3">
          <div className="label">Players</div>
          <div className="flex gap-2 flex-wrap">
            {[3,4,5,6,7,8].map(n => (
              <button
                key={n}
                className={`w-10 h-10 rounded border font-display text-sm transition-all ${
                  playerCount === n ? 'bg-gold border-gold text-void font-bold' : 'border-muted text-dim hover:border-dim'
                }`}
                onClick={() => setPlayerCount_(n)}
              >{n}</button>
            ))}
          </div>
          {playerCount <= 4 && (
            <p className="text-dim text-xs font-body flex items-center gap-1">
              <Zap size={10} className="text-gold" />
              3–4 players: each player picks 2 strategy cards
            </p>
          )}
        </section>

        {/* VP Goal */}
        <section className="panel p-4 flex flex-col gap-3">
          <div className="label">Victory Point Goal</div>
          <div className="flex gap-3">
            {[10, 14].map(n => (
              <button
                key={n}
                className={`flex-1 py-3 rounded border font-display text-lg transition-all ${
                  vpGoal === n ? 'bg-gold border-gold text-void font-bold glow-gold' : 'border-muted text-dim hover:border-dim'
                }`}
                onClick={() => setVpGoal(n)}
              >{n} VP</button>
            ))}
          </div>
        </section>

        {/* Galactic Event (TE only) */}
        {expansions.te && (
          <section className="panel p-4 flex flex-col gap-3">
            <div className="label flex items-center gap-2">
              Galactic Event
              <span className="text-plasma text-xs">Optional · Thunder's Edge</span>
            </div>
            <select
              className="input"
              value={galacticEvent || ''}
              onChange={e => setGalacticEvent(e.target.value || null)}
            >
              <option value="">None — standard game</option>
              {GALACTIC_EVENTS.map(ev => (
                <option key={ev.name} value={ev.name}>
                  {ev.name} (complexity {ev.complexity}/3)
                </option>
              ))}
            </select>
          </section>
        )}

        <button className="btn-primary py-3 mt-2" onClick={() => setStep(2)}>
          Next: Players →
        </button>
        <button className="btn-ghost py-2 text-center" onClick={() => setMode(null)}>← Back</button>
      </div>
    )
  }

  // ── Create: Step 2 — Players ─────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen px-4 py-8 flex flex-col gap-4 max-w-lg mx-auto animate-slide-up">
        <StepHeader step={2} total={3} title="Player Setup" />

        {players.map((player, i) => (
          <div key={player.id} className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs text-dim tracking-widest">PLAYER {i + 1}</span>
              <button
                className={`text-xs font-body px-2 py-0.5 rounded border transition-colors ${
                  speakerIndex === i
                    ? 'border-gold text-gold bg-gold/10'
                    : 'border-muted text-dim hover:border-dim'
                }`}
                onClick={() => setSpeakerIndex(i)}
              >
                {speakerIndex === i ? '★ Speaker' : 'Set Speaker'}
              </button>
            </div>

            {/* Name */}
            <input
              className="input"
              placeholder="Player name"
              value={player.name}
              onChange={e => updatePlayer(i, 'name', e.target.value)}
            />

            {/* Faction */}
            <select
              className="input"
              value={player.faction}
              onChange={e => updatePlayer(i, 'faction', e.target.value)}
            >
              <option value="">— Select faction —</option>
              {availableFactions.map(f => (
                <option key={f} value={f} disabled={usedFactions.includes(f) && player.faction !== f}>
                  {f}{usedFactions.includes(f) && player.faction !== f ? ' (taken)' : ''}
                </option>
              ))}
            </select>

            {/* Colour */}
            <div className="flex gap-2 flex-wrap">
              {PLAYER_COLOURS.map(c => (
                <button
                  key={c.id}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    player.colour === c.id ? 'scale-110 border-white' : 'border-transparent opacity-60 hover:opacity-90'
                  } ${usedColours.includes(c.id) && player.colour !== c.id ? 'opacity-20 cursor-not-allowed' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => {
                    if (usedColours.includes(c.id) && player.colour !== c.id) return
                    updatePlayer(i, 'colour', c.id)
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-3 mt-2">
          <button className="btn-ghost flex-1 py-3" onClick={() => setStep(1)}>← Back</button>
          <button className="btn-primary flex-1 py-3" onClick={() => setStep(3)}>Review →</button>
        </div>
      </div>
    )
  }

  // ── Create: Step 3 — Review ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 py-8 flex flex-col gap-4 max-w-lg mx-auto animate-slide-up">
      <StepHeader step={3} total={3} title="Ready to Launch" />

      <div className="panel p-4 flex flex-col gap-2">
        <Row label="Expansions" value={Object.entries(expansions).filter(([,v])=>v).map(([k])=>EXPANSION_LABELS[k]).join(', ')} />
        <Row label="Players" value={playerCount} />
        <Row label="VP Goal" value={`${vpGoal} VP`} />
        {galacticEvent && <Row label="Galactic Event" value={galacticEvent} />}
        <Row label="Speaker" value={players[speakerIndex]?.name || '—'} />
      </div>

      <div className="panel p-4 flex flex-col gap-2">
        {players.map((p, i) => {
          const colour = PLAYER_COLOURS.find(c => c.id === p.colour)
          return (
            <div key={p.id} className="flex items-center gap-3 py-1">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colour?.hex }} />
              <span className="font-body text-sm text-text flex-1">{p.name || `Player ${i+1}`}</span>
              <span className="font-body text-xs text-dim">{p.faction || 'No faction'}</span>
              {i === speakerIndex && <Star size={10} className="text-gold" />}
            </div>
          )
        })}
      </div>

      {players.some(p => !p.faction) && (
        <div className="flex items-start gap-2 text-warning text-xs font-body panel-inset p-3">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          Some players haven't selected a faction. You can assign them later.
        </div>
      )}

      {error && <p className="text-danger text-sm font-body">{error}</p>}

      <div className="flex gap-3 mt-2">
        <button className="btn-ghost flex-1 py-3" onClick={() => setStep(2)}>← Back</button>
        <button className="btn-primary flex-1 py-3" disabled={loading} onClick={handleCreate}>
          {loading ? 'Creating…' : '🚀 Launch Game'}
        </button>
      </div>
    </div>
  )
}

function StepHeader({ step, total, title }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-gold' : 'bg-muted'}`} />
        ))}
      </div>
      <div>
        <div className="label">Step {step} of {total}</div>
        <div className="font-display text-lg text-bright font-bold tracking-wide">{title}</div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="label">{label}</span>
      <span className="font-body text-sm text-text">{value}</span>
    </div>
  )
}
