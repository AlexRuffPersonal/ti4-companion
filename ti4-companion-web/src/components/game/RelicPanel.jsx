import { useState } from 'react'
import DiscardBrowserModal from './DiscardBrowserModal.jsx'
import GameIcon from '../shared/GameIcon.jsx'

const ACTION_RELICS = new Set([
  'Dominus Orb',
  'Maw Of Worlds',
  'Stellar Converter',
  'The Codex',
  'Enigmatic Device',
])

const PASSIVE_RELICS = new Set([
  'The Obsidian',
  'Shard Of The Throne',
])

const PHASE_B_ONLY = new Set([
  'Dominus Orb',
  'The Crown Of Thalnos',
  'Shard Of The Throne',
])

const PASSIVE_BADGES = {
  'The Obsidian': '+1 secret objective limit',
  'Shard Of The Throne': '1 VP (while held)',
}

export default function RelicPanel({
  relics,
  isActivePlayer,
  phase,
  actionCards = [],
  controlsTombOfEmphidia = false,
  onUseRelic,
}) {
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
  const [discardRelicId, setDiscardRelicId] = useState(null)
  const [prophetsChoiceOpen, setProphetsChoiceOpen] = useState(false)
  const [prophetsRelicId, setProphetsRelicId] = useState(null)
  const [emphidiaPickerOpen, setEmphidiaPickerOpen] = useState(false)
  const [emphidiaRelicId, setEmphidiaRelicId] = useState(null)
  // eslint-disable-next-line no-unused-vars
  const [ignorePrerequsiteActive, setIgnorePrerequsiteActive] = useState(false)

  if (!relics || relics.length === 0) return null

  function handleCodexOpen(relicId) {
    setDiscardRelicId(relicId)
    setDiscardModalOpen(true)
  }

  function handleCodexConfirm(cardIds) {
    setDiscardModalOpen(false)
    onUseRelic(discardRelicId, { cardIds })
    setDiscardRelicId(null)
  }

  function handleCodexClose() {
    setDiscardModalOpen(false)
    setDiscardRelicId(null)
  }

  function handleProphetsOpen(relicId) {
    setProphetsRelicId(relicId)
    setProphetsChoiceOpen(true)
  }

  function handleProphetsChoice(choice) {
    if (choice === 0) setIgnorePrerequsiteActive(true)
    setProphetsChoiceOpen(false)
    onUseRelic(prophetsRelicId, { choice })
    setProphetsRelicId(null)
  }

  function handleEmphidiaExplore(relicId) {
    setEmphidiaRelicId(relicId)
    setEmphidiaPickerOpen(true)
  }

  function handleEmphidiaExploreConfirm(planetName, deckType) {
    setEmphidiaPickerOpen(false)
    onUseRelic(emphidiaRelicId, { useType: 'explore', planetName, deckType })
    setEmphidiaRelicId(null)
  }

  return (
    <div className="panel w-full max-w-sm flex flex-col gap-4">
      <p className="label flex items-center gap-2">
        <GameIcon category="cards" name="relic" size={14} alt="relic" />
        RELICS
      </p>
      <div className="flex flex-col gap-3">
        {relics.map(relic => {
          const name = relic.name ?? relic.relics?.name
          const text = relic.text ?? relic.relics?.text
          const isPurged = relic.state === 'purged'
          const isExhausted = relic.exhausted || isPurged
          const canAct = !isExhausted && !isPurged

          const passiveBadge = PASSIVE_BADGES[name]

          return (
            <div key={relic.id} className="flex flex-col gap-1">
              <span className={`font-body text-sm ${!isExhausted ? 'text-bright font-bold' : 'text-dim'}`}>
                {name}
              </span>
              {text && <p className="text-muted text-xs">{text}</p>}
              {relic.exhaustable && (
                <span className={`text-xs px-2 py-0.5 rounded self-start ${isPurged ? 'text-danger' : isExhausted ? 'text-warning' : 'text-success'}`}>
                  {isPurged ? 'Purged' : isExhausted ? 'Exhausted' : 'Ready'}
                </span>
              )}

              {/* Passive relics */}
              {passiveBadge && (
                <span className="text-xs text-muted italic">{passiveBadge}</span>
              )}

              {/* Maw Of Worlds */}
              {name === 'Maw Of Worlds' && (
                <button
                  className="btn-primary self-start text-xs"
                  disabled={phase !== 'agenda' || isExhausted}
                  onClick={() => onUseRelic(relic.id, {})}
                >
                  Use (Agenda Phase)
                </button>
              )}

              {/* Scepter Of Emelpar */}
              {name === 'Scepter Of Emelpar' && (
                <button
                  className="btn-ghost self-start text-xs"
                  disabled={isExhausted}
                  onClick={() => onUseRelic(relic.id, {})}
                >
                  Exhaust
                </button>
              )}

              {/* The Prophet's Tears */}
              {name === "The Prophet's Tears" && (
                <>
                  {!prophetsChoiceOpen || prophetsRelicId !== relic.id ? (
                    <button
                      className="btn-ghost self-start text-xs"
                      disabled={isExhausted}
                      onClick={() => handleProphetsOpen(relic.id)}
                    >
                      Exhaust
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 border border-border rounded p-2">
                      <p className="text-xs text-muted">Choose effect:</p>
                      <div className="flex gap-2">
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => handleProphetsChoice(0)}
                        >
                          Ignore prerequisite
                        </button>
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => handleProphetsChoice(1)}
                        >
                          Draw action card
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* The Codex */}
              {name === 'The Codex' && (
                <button
                  className="btn-primary self-start text-xs"
                  disabled={!isActivePlayer || isExhausted}
                  onClick={() => handleCodexOpen(relic.id)}
                >
                  Use (Action)
                </button>
              )}

              {/* The Crown Of Emphidia */}
              {name === 'The Crown Of Emphidia' && (
                <div className="flex flex-col gap-1">
                  {emphidiaPickerOpen && emphidiaRelicId === relic.id ? (
                    <EmpHidiaPicker
                      onConfirm={handleEmphidiaExploreConfirm}
                      onCancel={() => { setEmphidiaPickerOpen(false); setEmphidiaRelicId(null) }}
                    />
                  ) : (
                    <button
                      className="btn-ghost self-start text-xs"
                      disabled={phase !== 'action' || isExhausted}
                      onClick={() => handleEmphidiaExplore(relic.id)}
                    >
                      Explore (after Action)
                    </button>
                  )}
                  <button
                    className="btn-ghost self-start text-xs"
                    disabled={phase !== 'status' || isPurged || !controlsTombOfEmphidia}
                    onClick={() => onUseRelic(relic.id, { useType: 'purge_for_vp' })}
                  >
                    Purge for VP (Status Phase)
                  </button>
                </div>
              )}

              {/* Phase B relics: disabled with tooltip */}
              {PHASE_B_ONLY.has(name) && name !== 'Shard Of The Throne' && (
                <button
                  className="btn-ghost self-start text-xs opacity-50 cursor-not-allowed"
                  disabled
                  title="Not yet implemented"
                >
                  Use
                </button>
              )}
              {name === 'Stellar Converter' && (
                <button
                  className="btn-primary self-start text-xs opacity-50 cursor-not-allowed"
                  disabled
                  title="Not yet implemented"
                >
                  Use (Action)
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* The Codex DiscardBrowserModal */}
      <DiscardBrowserModal
        open={discardModalOpen}
        cards={actionCards}
        maxSelect={3}
        onConfirm={handleCodexConfirm}
        onClose={handleCodexClose}
      />
    </div>
  )
}

function EmpHidiaPicker({ onConfirm, onCancel }) {
  const [planetName, setPlanetName] = useState('')
  const [deckType, setDeckType] = useState('cultural')

  return (
    <div className="flex flex-col gap-2 border border-border rounded p-2">
      <p className="text-xs text-muted">Select planet to explore:</p>
      <input
        className="input text-xs"
        placeholder="Planet name"
        value={planetName}
        onChange={e => setPlanetName(e.target.value)}
      />
      <select
        className="input text-xs"
        value={deckType}
        onChange={e => setDeckType(e.target.value)}
      >
        <option value="cultural">Cultural</option>
        <option value="industrial">Industrial</option>
        <option value="hazardous">Hazardous</option>
        <option value="frontier">Frontier</option>
      </select>
      <div className="flex gap-2">
        <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        <button
          className="btn-primary text-xs"
          disabled={!planetName.trim()}
          onClick={() => onConfirm(planetName.trim(), deckType)}
        >
          Explore
        </button>
      </div>
    </div>
  )
}
