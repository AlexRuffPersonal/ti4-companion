import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../../hooks/useGame.js'
import { supabase } from '../../lib/supabase.js'
import { updateGameSettings, addBot, removeBot, startDraft, draftPickSlice, draftPlaceTile } from '../../lib/edgeFunctions.js'
import MapPreviewSection from '../game/MapPreviewSection.jsx'
import DraftPanel from '../game/DraftPanel.jsx'

const COLOURS = ['red', 'blue', 'yellow', 'green', 'purple', 'black', 'orange', 'pink']

export const PRESET_MAPS = [
  { label: 'Balanced 6P', playerCount: 6, mapString: '18 36 30 34 35 33 17 21 28 29 26 40 39 24 22 38 25 23 27 32 37 20 19 31 41', pok: false },
  { label: 'PoK 6P Ring', playerCount: 6, mapString: '18 76 75 71 73 72 74 36 30 34 35 33 17 21 28 29 26 40 39 24 22 38 25 23 27 32 37 20 19 31 41', pok: true },
  { label: 'Balanced 4P', playerCount: 4, mapString: '18 36 30 34 35 33 17 21 28 29 26 40', pok: false },
  { label: 'Balanced 5P', playerCount: 5, mapString: '18 36 30 34 35 33 17 21 28 29 26 40 39 24 22', pok: false },
  { label: 'Balanced 7P', playerCount: 7, mapString: '18 36 30 34 35 33 17 21 28 29 26 40 39 24 22 38 25 23 27 32 37 20 19 31 41 42 43', pok: false },
  { label: 'Balanced 8P', playerCount: 8, mapString: '18 36 30 34 35 33 17 21 28 29 26 40 39 24 22 38 25 23 27 32 37 20 19 31 41 42 43 44 45', pok: false },
  { label: 'Balanced 3P', playerCount: 3, mapString: '18 36 30 34 35 33 17', pok: false },
]

export default function LobbyScreen({ userId }) {
  const { code } = useParams()
  const { game, players, currentPlayer, isHost, loading, error,
          updateSettings, pickFaction, setGameSpeaker, startTheGame } = useGame(code, userId)

  const [factions, setFactions] = useState([])
  const [pickError, setPickError] = useState(null)
  const [startError, setStartError] = useState(null)
  const [starting, setStarting] = useState(false)

  // Local faction/colour — held separately so each field is visible before both are chosen
  const [localFaction, setLocalFaction] = useState(null)
  const [localColour, setLocalColour] = useState(null)
  // Optimistic faction/color selection
  const [pendingFaction, setPendingFaction] = useState(null)
  const [pendingColour, setPendingColour] = useState(null)

  // Bot add form state (host only)
  const [showAddBot, setShowAddBot] = useState(false)
  const [botName, setBotName] = useState('')
  const [botFaction, setBotFaction] = useState('')
  const [botColour, setBotColour] = useState('')
  const [botStrategy, setBotStrategy] = useState('scripted')
  const [botError, setBotError] = useState(null)
  const [addingBot, setAddingBot] = useState(false)

  // Optimistic speaker selection
  const [pendingSpeaker, setPendingSpeaker] = useState(null)
  const [speakerError, setSpeakerError] = useState(null)

  // VP goal — local state so Realtime ticks don't reset mid-edit
  const [vpGoal, setVpGoal] = useState(10)
  const vpGoalDirty = useRef(false)
  useEffect(() => {
    if (game?.vp_goal != null && !vpGoalDirty.current) setVpGoal(game.vp_goal)
  }, [game?.vp_goal])

  // Map builder state (host only)
  const [tileByNumber, setTileByNumber] = useState({})
  const [tileDataById, setTileDataById] = useState({})
  const [mapPlayerCount, setMapPlayerCount] = useState(
    players.length > 0 ? Math.max(3, Math.min(8, players.length)) : 6
  )
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [mapString, setMapString] = useState('')
  const [parseError, setParseError] = useState(null)
  const [mapSaving, setMapSaving] = useState(false)
  const [mapSaveSuccess, setMapSaveSuccess] = useState(false)

  // Draft setup state (host only)
  const [mapSetupMethod, setMapSetupMethod] = useState('string') // 'string' | 'draft'
  const [draftMode, setDraftMode] = useState('official') // 'official' | 'milty'
  const [startDraftError, setStartDraftError] = useState(null)

  useEffect(() => {
    supabase.from('factions').select('name, expansion').order('name')
      .then(({ data }) => setFactions(data ?? []))
  }, [])

  useEffect(() => {
    supabase.from('tiles').select('id, tile_number, wormhole, planets, anomaly, type, name')
      .then(({ data }) => {
        const map = {}
        const byId = {}
        for (const t of data ?? []) {
          map[t.tile_number] = t
          byId[t.id] = t
        }
        setTileByNumber(map)
        setTileDataById(byId)
      })
  }, [])

  const takenFactions = new Set(players.filter(p => p.user_id !== userId).map(p => p.faction).filter(Boolean))
  const takenColours = new Set(players.filter(p => p.user_id !== userId).map(p => p.colour).filter(Boolean))

  const botPlayers = players.filter(p => p.is_bot)
  const allTakenFactions = new Set(players.map(p => p.faction).filter(Boolean))
  const allTakenColours = new Set(players.map(p => p.colour).filter(Boolean))

  async function handleAddBot() {
    setBotError(null)
    setAddingBot(true)
    try {
      await addBot(game.id, botName, botFaction, botColour, botStrategy)
      setShowAddBot(false)
      setBotName('')
      setBotFaction('')
      setBotColour('')
      setBotStrategy('scripted')
    } catch (e) {
      setBotError(e.message)
    } finally {
      setAddingBot(false)
    }
  }

  async function handleRemoveBot(botPlayerId) {
    await removeBot(game.id, botPlayerId)
  }

  const allReady = players.length > 0 && players.every(p => p.faction && p.colour)
  const canStart = allReady && game?.speaker_player_id

  async function handlePick(faction, colour) {
    if (!faction || !colour) return
    setLocalFaction(null)
    setLocalColour(null)
    setPendingFaction(faction)
    setPendingColour(colour)
    setPickError(null)
    try {
      await pickFaction(faction, colour)
      setPendingFaction(null)
      setPendingColour(null)
    } catch (e) {
      setPickError(e.message)
      setPendingFaction(null)
      setPendingColour(null)
    }
  }

  function handleFactionChange(faction) {
    setLocalFaction(faction || null)
    const colour = localColour ?? pendingColour ?? currentPlayer?.colour ?? ''
    if (faction && colour) handlePick(faction, colour)
  }

  function handleColourChange(colour) {
    setLocalColour(colour || null)
    const faction = localFaction ?? pendingFaction ?? currentPlayer?.faction ?? ''
    if (faction && colour) handlePick(faction, colour)
  }

  async function handleSetSpeaker(playerId) {
    if (!playerId) return
    setPendingSpeaker(playerId)
    setSpeakerError(null)
    try {
      await setGameSpeaker(playerId)
      setPendingSpeaker(null)
    } catch (e) {
      setSpeakerError(e.message)
      setPendingSpeaker(null)
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

  async function handleStartDraft() {
    setStartDraftError(null)
    try {
      await startDraft(game.id, draftMode)
    } catch (e) {
      setStartDraftError(e.message)
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

  const displayFaction = localFaction ?? pendingFaction ?? currentPlayer?.faction ?? ''
  const displayColour = localColour ?? pendingColour ?? currentPlayer?.colour ?? ''

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
        {players.filter(p => !p.is_bot).map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.colour ?? '#555' }}
            />
            <span className="font-body text-text flex-1">{p.display_name}</span>
            <span className="font-body text-muted text-sm">{p.faction ?? '—'}</span>
          </div>
        ))}
        {botPlayers.map(p => (
          <div key={p.id} className="flex items-center gap-3" data-testid="bot-slot">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.colour ?? '#555' }}
            />
            <span className="font-body text-text flex-1">
              <span className="text-muted text-xs mr-1">BOT</span>{p.display_name}
            </span>
            <span className="font-body text-muted text-sm">{p.faction ?? '—'}</span>
            <span className="font-body text-xs text-dim border border-dim rounded px-1">
              {p.bot_strategy === 'random' ? 'Random' : 'Scripted'}
            </span>
            {isHost && (
              <button
                type="button"
                className="btn-ghost text-xs text-danger"
                onClick={() => handleRemoveBot(p.id)}
                aria-label={`Remove ${p.display_name}`}
              >
                Remove
              </button>
            )}
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
            onChange={(e) => handleFactionChange(e.target.value)}
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
                onClick={() => handleColourChange(c)}
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
              value={vpGoal}
              onChange={(e) => {
                vpGoalDirty.current = true
                setVpGoal(Number(e.target.value))
              }}
              onBlur={() => {
                if (vpGoalDirty.current && vpGoal >= 1) {
                  vpGoalDirty.current = false
                  updateSettings({ vp_goal: vpGoal })
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="label">Expansions</span>
            {['pok', 'te'].map(exp => (
              <label key={exp} className="flex items-center gap-2 font-body text-text text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={game?.expansions?.[exp] ?? false}
                  onChange={(e) => updateSettings({ expansions: { ...(game?.expansions ?? {}), [exp]: e.target.checked } })}
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
              value={pendingSpeaker ?? game?.speaker_player_id ?? ''}
              onChange={(e) => handleSetSpeaker(e.target.value)}
            >
              <option value="">— assign speaker —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
            {speakerError && <p className="text-danger text-sm font-body">{speakerError}</p>}
          </div>

          {/* Add Bot */}
          <div className="flex flex-col gap-3">
            <h3 className="label">Bots</h3>
            {!showAddBot && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setBotName(`Bot ${botPlayers.length + 1}`)
                  setBotFaction('')
                  setBotColour('')
                  setBotStrategy('scripted')
                  setBotError(null)
                  setShowAddBot(true)
                }}
              >
                Add Bot
              </button>
            )}
            {showAddBot && (
              <div className="flex flex-col gap-2 panel-inset">
                <div className="flex flex-col gap-1">
                  <label htmlFor="bot-name" className="label">Display Name</label>
                  <input
                    id="bot-name"
                    type="text"
                    className="input"
                    value={botName}
                    onChange={e => setBotName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="bot-faction" className="label">Faction</label>
                  <select
                    id="bot-faction"
                    className="input"
                    value={botFaction}
                    onChange={e => setBotFaction(e.target.value)}
                    aria-label="Bot faction"
                  >
                    <option value="">— pick a faction —</option>
                    {factions.map(f => (
                      <option key={f.name} value={f.name} disabled={allTakenFactions.has(f.name)}>
                        {f.name}{allTakenFactions.has(f.name) ? ' (taken)' : ''}
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
                          botColour === c ? 'border-bright scale-110' : 'border-transparent'
                        } ${allTakenColours.has(c) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                        style={{ backgroundColor: c === 'black' ? '#222' : c }}
                        disabled={allTakenColours.has(c)}
                        onClick={() => setBotColour(c)}
                        aria-label={`Bot colour ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="label">Strategy</span>
                  <div className="flex gap-2">
                    {['scripted', 'random'].map(s => (
                      <button
                        key={s}
                        type="button"
                        className={`btn-ghost text-sm ${botStrategy === s ? 'text-bright' : 'text-muted'}`}
                        onClick={() => setBotStrategy(s)}
                        aria-pressed={botStrategy === s}
                      >
                        {s === 'scripted' ? 'Scripted' : 'Random'}
                      </button>
                    ))}
                  </div>
                </div>
                {botError && <p className="text-danger text-sm font-body">{botError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={!botName || !botFaction || !botColour || addingBot}
                    onClick={handleAddBot}
                  >
                    {addingBot ? 'Adding…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-sm"
                    onClick={() => setShowAddBot(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Map Configuration */}
          <div className="flex flex-col gap-3">
            <h3 className="label">Map Configuration</h3>

            {/* Setup method toggle (only when no draft active) */}
            {game?.draft_state === null || game?.draft_state === undefined ? (
              <>
                <div className="flex gap-2">
                  {['string', 'draft'].map(method => (
                    <button
                      key={method}
                      type="button"
                      className={`btn-ghost text-sm ${mapSetupMethod === method ? 'text-bright' : 'text-muted'}`}
                      onClick={() => setMapSetupMethod(method)}
                      aria-pressed={mapSetupMethod === method}
                    >
                      {method === 'string' ? 'Paste Map String' : 'In-App Draft'}
                    </button>
                  ))}
                </div>

                {mapSetupMethod === 'draft' ? (
                  <div className="flex flex-col gap-2">
                    <span className="label">Draft Mode</span>
                    <div className="flex gap-2">
                      {['official', 'milty'].map(mode => (
                        <label key={mode} className="flex items-center gap-2 font-body text-text text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="draftMode"
                            value={mode}
                            checked={draftMode === mode}
                            onChange={() => setDraftMode(mode)}
                          />
                          {mode === 'official' ? 'Official' : 'Milty'}
                        </label>
                      ))}
                    </div>
                    {startDraftError && <p className="text-danger text-sm font-body">{startDraftError}</p>}
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleStartDraft}
                    >
                      Start Draft
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Paste map string builder */}
                    <div className="flex flex-col gap-1">
                      <label className="label">Player Count</label>
              <select
                aria-label="Player count"
                className="input"
                value={mapPlayerCount}
                onChange={e => {
                  setMapPlayerCount(Number(e.target.value))
                  setMapString('')
                  setSelectedPreset(null)
                }}
              >
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={n}>{n} Players</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="label">Preset Map</label>
              <select
                aria-label="Preset map"
                className="input"
                value={selectedPreset ?? ''}
                onChange={e => {
                  const preset = PRESET_MAPS.find(p => p.label === e.target.value)
                  if (!preset) return
                  setSelectedPreset(preset.label)
                  setMapString(preset.mapString)
                  setParseError(null)
                }}
              >
                <option value="">Select preset...</option>
                {PRESET_MAPS.filter(p => p.playerCount === mapPlayerCount).map(p => (
                  <option
                    key={p.label}
                    value={p.label}
                    disabled={p.pok && !game?.expansions?.pok}
                    title={p.pok && !game?.expansions?.pok ? 'Enable PoK expansion first' : undefined}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="label">Milty String</label>
              <textarea
                className="input font-mono text-xs"
                rows={3}
                value={mapString}
                onChange={e => {
                  setMapString(e.target.value)
                  setSelectedPreset(null)
                  const tokens = e.target.value.trim().split(/\s+/).filter(Boolean)
                  const invalid = tokens.filter(t => isNaN(Number(t)))
                  setParseError(invalid.length > 0 ? `Invalid tile numbers: ${invalid.join(', ')}` : null)
                }}
                placeholder="Paste Milty string..."
              />
              {parseError && <p className="text-danger text-xs mt-1">{parseError}</p>}
            </div>

            {game?.map_layout?.includes('pok') && !game?.expansions?.pok && (
              <p className="text-warning text-xs">Saved map contains PoK tiles — enable PoK or re-save</p>
            )}

            <button
              className="btn-primary"
              disabled={!!parseError || !mapString.trim() || mapSaving || Object.keys(tileByNumber).length === 0}
              onClick={async () => {
                setMapSaving(true)
                setMapSaveSuccess(false)
                setParseError(null)
                const tokens = mapString.trim().split(/\s+/).filter(Boolean).map(Number)
                const mecatolEntry = { '0,0': { tile_id: tileByNumber[18]?.id ?? null, tile_number: 18 } }
                const resolvedTiles = {}
                tokens.forEach((num, idx) => {
                  const tile = tileByNumber[num]
                  if (tile) resolvedTiles[`tile_${idx}`] = { tile_id: tile.id, tile_number: num }
                })
                const map_tiles = { ...mecatolEntry, ...resolvedTiles }
                try {
                  await updateGameSettings(game.id, {
                    map_tiles,
                    map_layout: selectedPreset ?? `custom-${mapPlayerCount}`,
                  })
                  setMapSaveSuccess(true)
                } catch (e) {
                  setParseError(e.message)
                } finally {
                  setMapSaving(false)
                }
              }}
            >
              {mapSaving ? 'Saving…' : 'Save Map'}
            </button>
            {mapSaveSuccess && <p className="text-success text-xs">Map saved.</p>}
                  </>
                )}
              </>
            ) : null}
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

      {/* Map Preview (all players) */}
      <MapPreviewSection mapTiles={game?.map_tiles} tileByNumber={tileByNumber} />

      {/* Draft Panel (all players, when draft_state is active) */}
      {game?.draft_state ? (
        <DraftPanel
          draftState={game.draft_state}
          tileByNumber={tileByNumber}
          tileDataById={tileDataById}
          currentPlayer={currentPlayer}
          players={players}
          game={game}
          onPickSlice={(sliceId) => draftPickSlice(game.id, sliceId)}
          onPlaceTile={(tileNumber, position, rotation) => draftPlaceTile(game.id, tileNumber, position, rotation)}
        />
      ) : null}
    </div>
  )
}
