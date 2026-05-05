import { useState } from 'react'

const WINDOW_TITLES = {
  window_pre_space_cannon:    "Before Space Cannon — play a card or pass",
  window_space_cannon_assign: "Space Cannon Hits — play a card or pass",
  window_pre_barrage:         "Before Anti-Fighter Barrage — play a card or pass",
  window_start_round:         "Start of Round — play a card or pass",
  window_announce_retreat:    "Retreat Step — play a card or pass",
  window_pre_assign_defender: "Before Defender Assigns — play a card or pass",
  window_post_sustain:        "Sustain Used — play a card or pass",
  window_post_destroy:        "Ship Destroyed — play a card or pass",
  window_pre_assign_attacker: "Before Attacker Assigns — play a card or pass",
  window_post_combat:         "Combat Over — play a card or pass",
}

const TARGETED_CARDS = ['Direct Hit', 'Skilled Retreat', 'Experimental Battlestation', 'In The Silence Of Space']

export default function ActionCardWindowPanel({ combat, myPlayerId, windowCards, onPlayCard, onPass }) {
  const [selectedCard, setSelectedCard] = useState(null)
  const [pickedTarget, setPickedTarget] = useState(null)

  const isWindowPhase = combat?.phase?.startsWith('window_')
  if (!isWindowPhase) return null

  const side = myPlayerId === combat.attacker_player_id ? 'attacker' : 'defender'
  const windowPasses = combat.window_passes ?? {}
  const localPassed = windowPasses[side] ?? false
  const opponentSide = side === 'attacker' ? 'defender' : 'attacker'
  const opponentPassed = windowPasses[opponentSide] ?? false

  function handleChipClick(card) {
    if (TARGETED_CARDS.includes(card.name)) {
      setSelectedCard(card)
      setPickedTarget(null)
    } else {
      onPlayCard(card.id, undefined)
    }
  }

  function handleTargetConfirm(target) {
    onPlayCard(selectedCard.id, target)
    setSelectedCard(null)
    setPickedTarget(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="label">{WINDOW_TITLES[combat.phase] ?? "Action Window — play a card or pass"}</p>

      <div className="flex flex-wrap gap-2">
        {windowCards.map(card => (
          <button
            key={card.id}
            data-testid={`window-card-${card.id}`}
            className="btn-ghost text-sm"
            onClick={() => handleChipClick(card)}
          >
            {card.name}
          </button>
        ))}
      </div>

      {/* Target picker for Direct Hit */}
      {selectedCard?.name === 'Direct Hit' && (
        <div className="panel-inset flex flex-col gap-2">
          <p className="text-muted text-xs">Choose a sustained unit:</p>
          {(combat.sustained_this_phase ?? []).map(unit => (
            <button
              key={unit.unit_id}
              data-testid={`target-unit-${unit.unit_id}`}
              className="btn-ghost text-sm text-left"
              onClick={() => handleTargetConfirm({ unit_id: unit.unit_id })}
            >
              {unit.unit_type}
            </button>
          ))}
        </div>
      )}

      {/* Target picker for Skilled Retreat */}
      {selectedCard?.name === 'Skilled Retreat' && (
        <div className="panel-inset flex flex-col gap-2">
          <p className="text-muted text-xs">Choose retreat destination:</p>
          {(combat.valid_retreat_systems ?? []).map(sk => (
            <button
              key={sk}
              data-testid={`retreat-system-${sk}`}
              className="btn-ghost text-sm"
              onClick={() => handleTargetConfirm({ destination_system_key: sk })}
            >
              {sk}
            </button>
          ))}
        </div>
      )}

      {/* Target picker for Experimental Battlestation */}
      {selectedCard?.name === 'Experimental Battlestation' && (
        <div className="panel-inset flex flex-col gap-2">
          <p className="text-muted text-xs">Choose a space dock:</p>
          {(combat.eligible_space_docks ?? []).map(dock => (
            <button
              key={dock.unit_id}
              data-testid={`dock-${dock.unit_id}`}
              className="btn-ghost text-sm"
              onClick={() => handleTargetConfirm({ space_dock_unit_id: dock.unit_id })}
            >
              {dock.system_key}
            </button>
          ))}
        </div>
      )}

      {/* Target picker for In The Silence Of Space */}
      {selectedCard?.name === 'In The Silence Of Space' && (
        <div className="panel-inset flex flex-col gap-2">
          <p className="text-muted text-xs">Choose a system:</p>
          {(combat.systems_with_player_ships ?? []).map(sk => (
            <button
              key={sk}
              data-testid={`silence-system-${sk}`}
              className="btn-ghost text-sm"
              onClick={() => handleTargetConfirm({ system_key: sk })}
            >
              {sk}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          data-testid="window-pass"
          className="btn-ghost text-sm"
          disabled={localPassed}
          onClick={onPass}
        >
          Pass
        </button>
        {localPassed && !opponentPassed && (
          <p className="text-muted text-xs">Waiting for opponent…</p>
        )}
      </div>
    </div>
  )
}
