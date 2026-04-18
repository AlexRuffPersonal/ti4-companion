import { useState } from 'react'

function hasTarget(effects, target) {
  return (effects ?? []).some(op =>
    op.target === target ||
    (op.op === 'choose_one' && op.options?.some(o => o.target === target))
  )
}

function hasChosenAmount(effects) {
  return (effects ?? []).some(op =>
    op.amount === 'chosen_amount' ||
    (op.op === 'choose_one' && op.options?.some(o => o.amount === 'chosen_amount'))
  )
}

function getChooseOneOp(effects) {
  return (effects ?? []).find(op => op.op === 'choose_one') ?? null
}

export default function AbilityTargetModal({ ability, sourceId, sourceType, players, planets, onConfirm, onClose }) {
  const [chosenPlayer, setChosenPlayer] = useState(null)
  const [chosenPlanet, setChosenPlanet] = useState(null)
  const [chosenAmount, setChosenAmount] = useState(0)
  const [chosenOption, setChosenOption] = useState(null)

  const effects = ability.effects ?? []
  const needsPlayer = hasTarget(effects, 'chosen_player')
  const needsPlanet = hasTarget(effects, 'chosen_planet')
  const needsAmount = hasChosenAmount(effects)
  const chooseOneOp = getChooseOneOp(effects)

  function handleConfirm() {
    onConfirm({
      ability_definition_id: ability.id,
      source_type: sourceType,
      source_id: sourceId,
      selections: {
        chosen_player: chosenPlayer ?? undefined,
        chosen_planet: chosenPlanet ?? undefined,
        chosen_amount: needsAmount ? chosenAmount : undefined,
        chosen_option: chosenOption ?? undefined,
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">{ability.ability_name.toUpperCase()}</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
        </div>

        {chooseOneOp && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose one:</p>
            {chooseOneOp.options.map((opt, i) => (
              <button
                key={i}
                className={chosenOption === i ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenOption(i)}
              >
                {opt.op.replace(/_/g, ' ').toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {needsPlayer && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a player:</p>
            {players.map(p => (
              <button
                key={p.id}
                className={chosenPlayer === p.id ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlayer(p.id)}
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}

        {needsPlanet && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a planet:</p>
            {planets.map(p => (
              <button
                key={p.planet_name}
                className={chosenPlanet === p.planet_name ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlanet(p.planet_name)}
              >
                {p.planet_name}
              </button>
            ))}
          </div>
        )}

        {needsAmount && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose amount:</p>
            <input
              type="number"
              min="0"
              value={chosenAmount}
              onChange={e => setChosenAmount(parseInt(e.target.value) || 0)}
              className="input text-xs w-24"
            />
          </div>
        )}

        <button className="btn-primary text-xs" onClick={handleConfirm}>
          CONFIRM
        </button>
      </div>
    </div>
  )
}
