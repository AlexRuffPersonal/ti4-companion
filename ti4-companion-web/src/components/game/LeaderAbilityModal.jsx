import { useState } from 'react'
import { LEADER_SELECTION_CONFIG } from '../../lib/leaderConstants.js'

const STRATEGY_CARDS = [
  { num: 1, name: 'Leadership' },
  { num: 2, name: 'Diplomacy' },
  { num: 3, name: 'Politics' },
  { num: 4, name: 'Construction' },
  { num: 5, name: 'Trade' },
  { num: 6, name: 'Warfare' },
  { num: 7, name: 'Technology' },
  { num: 8, name: 'Imperial' },
]

function isConfirmDisabled(selectionConfig, selections) {
  if (!selectionConfig || Object.keys(selectionConfig).length === 0) return false
  if (selectionConfig.needs_target_player && !selections.chosen_player_id) return true
  if (selectionConfig.needs_planet && !selections.planet_name) return true
  if (selectionConfig.needs_system) {
    const count = selectionConfig.count ?? 1
    const keys = selections.system_keys ?? []
    if (keys.length < count) return true
  }
  if (selectionConfig.needs_choice && selections.choice === undefined) return true
  if (selectionConfig.needs_strategy_card && !selections.strategy_card) return true
  return false
}

export default function LeaderAbilityModal({ leader, faction, leaderType, gamePlayers, onConfirm, onClose }) {
  const selectionConfig = LEADER_SELECTION_CONFIG[faction]?.[leaderType] ?? {}
  const [selections, setSelections] = useState({})

  const hasConfig = Object.keys(selectionConfig).length > 0
  const disabled = isConfirmDisabled(selectionConfig, selections)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <p className="label flex-1">{leader.leader_name ?? leader.name}</p>
          <span className="text-xs font-body text-muted uppercase">{leaderType}</span>
          {leader.status && (
            <span className="text-xs font-body text-dim uppercase">{leader.status}</span>
          )}
        </div>

        {(leader.text || leader.leader_text) && (
          <p className="text-muted text-xs font-body leading-relaxed">
            {leader.text ?? leader.leader_text}
          </p>
        )}

        {selectionConfig.needs_target_player && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a player:</p>
            {(gamePlayers ?? [])
              .filter(p => selectionConfig.or_self ? true : p.id !== leader.player_id)
              .map(p => (
                <button
                  key={p.id}
                  className={selections.chosen_player_id === p.id ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                  onClick={() => setSelections({ ...selections, chosen_player_id: p.id })}
                >
                  {p.display_name ?? p.faction ?? p.id}
                </button>
              ))}
          </div>
        )}

        {selectionConfig.needs_planet && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a planet:</p>
            <input
              type="text"
              placeholder="Planet name"
              className="input text-xs"
              value={selections.planet_name ?? ''}
              onChange={e => setSelections({ ...selections, planet_name: e.target.value })}
            />
          </div>
        )}

        {selectionConfig.needs_system && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">
              {selectionConfig.count === 2 ? 'Choose 2 systems:' : 'Choose a system:'}
            </p>
            <input
              type="text"
              placeholder={selectionConfig.count === 2 ? 'e.g. 0,1 2,3' : 'e.g. 0,1'}
              className="input text-xs"
              value={(selections.system_keys ?? []).join(' ')}
              onChange={e => setSelections({
                ...selections,
                system_keys: e.target.value.split(/\s+/).filter(Boolean),
              })}
            />
          </div>
        )}

        {selectionConfig.needs_choice && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose an effect:</p>
            {(selectionConfig.options ?? []).map((opt, i) => (
              <button
                key={i}
                className={selections.choice === i ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setSelections({ ...selections, choice: i })}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {selectionConfig.needs_strategy_card && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a strategy card:</p>
            <select
              className="input text-xs"
              value={selections.strategy_card ?? ''}
              onChange={e => setSelections({ ...selections, strategy_card: Number(e.target.value) })}
            >
              <option value="">-- select --</option>
              {STRATEGY_CARDS.map(c => (
                <option key={c.num} value={c.num}>{c.num}. {c.name}</option>
              ))}
            </select>
          </div>
        )}

        {!hasConfig && (
          <p className="text-muted text-xs font-body">This will use the ability as described.</p>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button
            className="btn-primary text-xs"
            disabled={disabled}
            onClick={() => onConfirm(selections)}
          >
            USE ABILITY
          </button>
        </div>
      </div>
    </div>
  )
}
