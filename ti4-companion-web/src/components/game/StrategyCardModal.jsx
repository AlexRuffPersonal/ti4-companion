import { useState } from 'react'
import { getCard } from '../../lib/strategyCardConstants.js'

// --- StrategyCardPrimaryForm ---
// Exported for use in StrategyCardPanel when isActive and player is about to play primary.
export function StrategyCardPrimaryForm({
  cardNumber,
  myPlayer,
  allPlayers,
  game,
  onSubmit,
  onCancel,
  agendaPeekCards,
}) {
  const card = getCard(cardNumber)
  const [selections, setSelections] = useState({})

  if (!card) return null

  function setField(key, value) {
    setSelections(prev => ({ ...prev, [key]: value }))
  }

  function renderField(field) {
    switch (field.type) {
      case 'planet_multiselect': {
        const planets = myPlayer?.planets ?? []
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {planets.map(p => (
              <label key={p.name} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!(selections[field.key] ?? []).includes(p.name)}
                  onChange={e => {
                    const prev = selections[field.key] ?? []
                    setField(
                      field.key,
                      e.target.checked ? [...prev, p.name] : prev.filter(n => n !== p.name)
                    )
                  }}
                />
                {p.name}
              </label>
            ))}
          </div>
        )
      }
      case 'pool_select': {
        const pools = ['tactic_total', 'fleet', 'strategy']
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {pools.map(pool => (
              <label key={pool} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="radio"
                  name={field.key}
                  value={pool}
                  checked={(selections[field.key] ?? field.default) === pool}
                  onChange={() => setField(field.key, pool)}
                />
                {pool.replace('_total', '')}
              </label>
            ))}
          </div>
        )
      }
      case 'player_select': {
        const eligiblePlayers = allPlayers.filter(p => p.id !== game?.speaker_player_id)
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {eligiblePlayers.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="radio"
                  name={field.key}
                  value={p.id}
                  checked={selections[field.key] === p.id}
                  onChange={() => setField(field.key, p.id)}
                />
                {p.display_name}
              </label>
            ))}
          </div>
        )
      }
      case 'system_select': {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <input
              type="text"
              className="input text-sm"
              placeholder="e.g. 1,-2"
              value={selections[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          </div>
        )
      }
      case 'planet_select': {
        const planets = myPlayer?.planets ?? []
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <select
              className="input text-sm"
              value={selections[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            >
              <option value="">Select planet…</option>
              {planets.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        )
      }
      case 'unit_type_radio': {
        const unitTypes = ['pds', 'space_dock']
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {unitTypes.map(u => (
              <label key={u} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="radio"
                  name={field.key}
                  value={u}
                  checked={selections[field.key] === u}
                  onChange={() => setField(field.key, u)}
                />
                {u === 'pds' ? 'PDS' : 'Space Dock'}
              </label>
            ))}
          </div>
        )
      }
      case 'tech_select': {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <input
              type="text"
              className="input text-sm"
              placeholder="Technology ID…"
              value={selections[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          </div>
        )
      }
      case 'objective_select': {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <input
              type="text"
              className="input text-sm"
              placeholder="Objective ID…"
              value={selections[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          </div>
        )
      }
      case 'player_multiselect': {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {allPlayers.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!(selections[field.key] ?? []).includes(p.id)}
                  onChange={e => {
                    const prev = selections[field.key] ?? []
                    setField(
                      field.key,
                      e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                    )
                  }}
                />
                {p.display_name}
              </label>
            ))}
          </div>
        )
      }
      case 'redistribution_sliders': {
        const tacticVal = selections['redistribution_tactic'] ?? 0
        const fleetVal = selections['redistribution_fleet'] ?? 0
        const strategyVal = selections['redistribution_strategy'] ?? 0
        const total = Number(tacticVal) + Number(fleetVal) + Number(strategyVal)
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            {['tactic', 'fleet', 'strategy'].map(pool => (
              <label key={pool} className="flex items-center gap-2 text-sm text-text">
                <span className="w-16 capitalize">{pool}:</span>
                <input
                  type="number"
                  min={0}
                  className="input w-16 text-sm"
                  value={selections[`redistribution_${pool}`] ?? 0}
                  onChange={e => setField(`redistribution_${pool}`, Number(e.target.value))}
                />
              </label>
            ))}
            <p className="text-muted text-xs">Total: {total}</p>
          </div>
        )
      }
      case 'planet_multiselect_pair': {
        // Construction: up to 2 planet+structure pairs
        const planets = myPlayer?.planets ?? []
        const unitTypes = ['pds', 'space_dock']
        const structures = selections[field.key] ?? [{}]
        return (
          <div key={field.key} className="flex flex-col gap-2">
            <p className="label text-xs">{field.label}</p>
            {structures.map((struct, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <select
                  className="input text-sm flex-1"
                  value={struct.planet_id ?? ''}
                  onChange={e => {
                    const updated = [...structures]
                    updated[idx] = { ...struct, planet_id: e.target.value }
                    setField(field.key, updated)
                  }}
                >
                  <option value="">Planet…</option>
                  {planets.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                {unitTypes.map(u => (
                  <label key={u} className="flex items-center gap-1 text-xs text-text cursor-pointer">
                    <input
                      type="radio"
                      name={`${field.key}_${idx}_unit`}
                      value={u}
                      checked={struct.unit_type === u}
                      onChange={() => {
                        const updated = [...structures]
                        updated[idx] = { ...struct, unit_type: u }
                        setField(field.key, updated)
                      }}
                    />
                    {u === 'pds' ? 'PDS' : 'SD'}
                  </label>
                ))}
              </div>
            ))}
            {structures.length < 2 && (
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setField(field.key, [...structures, {}])}
              >
                + Add 2nd structure
              </button>
            )}
          </div>
        )
      }
      case 'agenda_reorder': {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <p className="text-muted text-xs">Agenda order set server-side after play.</p>
          </div>
        )
      }
      default: {
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <p className="label text-xs">{field.label}</p>
            <input
              type="text"
              className="input text-sm"
              value={selections[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          </div>
        )
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="label">{card.name}</p>
      <p className="text-muted text-xs">Initiative {card.initiative}</p>
      <p className="text-muted text-xs">{card.primaryText}</p>

      {card.primaryFields.map(field => renderField(field))}

      {/* Politics — agendaPeekCards confirmation */}
      {cardNumber === 3 && agendaPeekCards && (
        <p className="text-bright text-xs">
          Top agenda cards: {agendaPeekCards.map(c => c.name).join(', ')}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn-primary text-xs flex-1" onClick={() => onSubmit(selections)}>
          PLAY PRIMARY
        </button>
        <button className="btn-ghost text-xs flex-1" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  )
}

// --- StrategyCardSecondaryForm ---
function StrategyCardSecondaryForm({
  activePay,
  abilityDefs,
  onUseSecondary,
  onPassSecondary,
  warfareHomeSystemKey,
}) {
  const card = getCard(activePay.card_number)
  const [secondarySelections, setSecondarySelections] = useState({})

  const secondaryAbility = abilityDefs.find(a =>
    a.ability_sources?.some(s =>
      s.source_type === 'strategy_card' &&
      String(s.source_id) === String(activePay.card_number) &&
      s.role === 'secondary'
    )
  )

  return (
    <div className="flex flex-col gap-3">
      {card && (
        <p className="text-sm text-bright">{card.secondaryText}</p>
      )}
      {secondaryAbility && (
        <p className="text-sm text-bright">{secondaryAbility.description}</p>
      )}

      {/* Warfare: show production trigger after use */}
      {activePay.card_number === 6 && warfareHomeSystemKey && (
        <p className="text-muted text-xs">
          Home system available for production: {warfareHomeSystemKey}
        </p>
      )}

      <div className="flex gap-2">
        <button
          className="btn-primary text-xs flex-1"
          disabled={!secondaryAbility}
          onClick={() => onUseSecondary(secondaryAbility?.id, secondarySelections)}
        >
          USE SECONDARY
        </button>
        <button
          className="btn-ghost text-xs flex-1"
          onClick={onPassSecondary}
        >
          PASS
        </button>
      </div>
    </div>
  )
}

// --- StrategyCardModal ---
export default function StrategyCardModal({
  activePay,
  responses,
  myPlayerId,
  players,
  abilityDefs,
  isMyTurnToRespond,
  onUseSecondary,
  onPassSecondary,
  onClose = () => {},
  warfareHomeSystemKey,
}) {
  if (!activePay) return null

  const card = getCard(activePay.card_number)
  const cardHolder = players.find(p => p.id === activePay.played_by_player_id)
  const isCardHolder = myPlayerId === activePay.played_by_player_id

  const sortedResponses = [...responses].sort((a, b) => a.initiative_order - b.initiative_order)
  const nextPendingResponse = sortedResponses.find(r => r.status === 'pending')
  const nextPlayer = players.find(p => p.id === nextPendingResponse?.player_id)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        {/* Card face header — always visible */}
        <p className="label">{card?.name ?? `Strategy Card ${activePay.card_number}`} (Initiative {card?.initiative ?? activePay.card_number})</p>
        {card && <p className="text-muted text-xs">{card.primaryText}</p>}
        {card && <p className="text-muted text-xs">Secondary: {card.secondaryText}</p>}

        <p className="text-muted text-sm">{cardHolder?.display_name ?? 'Unknown'} played the primary ability</p>

        {isCardHolder ? (
          <>
            {sortedResponses.map(response => {
              const respPlayer = players.find(p => p.id === response.player_id)
              return (
                <p key={response.player_id} className="text-sm text-text">
                  {respPlayer?.display_name ?? 'Unknown'}: {response.status}
                </p>
              )
            })}
            <button className="btn-ghost text-xs mt-2" onClick={onClose}>
              CLOSE
            </button>
          </>
        ) : isMyTurnToRespond ? (
          <StrategyCardSecondaryForm
            activePay={activePay}
            abilityDefs={abilityDefs}
            onUseSecondary={onUseSecondary}
            onPassSecondary={onPassSecondary}
            warfareHomeSystemKey={warfareHomeSystemKey}
          />
        ) : (
          <p className="text-muted text-sm text-center">
            Waiting for {nextPlayer?.display_name ?? 'a player'}…
          </p>
        )}
      </div>
    </div>
  )
}
