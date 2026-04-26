import { useState } from 'react'

const NEUTRAL = 'neutral'
const SUSTAIN = 'sustain'
const DESTROY = 'destroy'

function nextState(current, canSustain) {
  if (current === NEUTRAL) return canSustain ? SUSTAIN : DESTROY
  if (current === SUSTAIN) return DESTROY
  return NEUTRAL
}

export default function FleetDisplay({ units, unitDefs, isInteractive, hitsToAssign, onConfirm }) {
  const [chipStates, setChipStates] = useState({})

  function handleChipClick(unit) {
    if (!isInteractive) return
    const def = unitDefs?.get(unit.unit_type)
    const canSustain = def?.sustain_damage && !unit.damaged
    setChipStates(prev => {
      const current = prev[unit.id] ?? NEUTRAL
      return { ...prev, [unit.id]: nextState(current, canSustain) }
    })
  }

  const assigned = Object.values(chipStates).filter(s => s !== NEUTRAL).length
  const canConfirm = assigned === hitsToAssign && hitsToAssign > 0

  function handleConfirm() {
    const casualties = []
    for (const unit of units) {
      const state = chipStates[unit.id] ?? NEUTRAL
      if (state === DESTROY) casualties.push({ unit_type: unit.unit_type, player_unit_id: unit.id, action: 'destroy' })
      if (state === SUSTAIN) casualties.push({ unit_type: unit.unit_type, player_unit_id: unit.id, action: 'sustain' })
    }
    onConfirm(casualties)
    setChipStates({})
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {units.map(unit => {
          const state = chipStates[unit.id] ?? NEUTRAL
          const borderClass =
            state === DESTROY ? 'border-danger' :
            state === SUSTAIN ? 'border-warning' :
            unit.damaged ? 'border-warning' :
            'border-border'
          return (
            <button
              key={unit.id}
              data-testid={`chip-${unit.id}`}
              onClick={() => handleChipClick(unit)}
              className={`panel-inset px-2 py-1 border-2 rounded text-xs font-body flex items-center gap-1 ${borderClass} ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="font-display text-text capitalize">{unit.unit_type}</span>
              <span className="text-muted">×{unit.count}</span>
              {unit.damaged && <span>⚡</span>}
              {state === DESTROY && <span className="text-danger">✕</span>}
            </button>
          )
        })}
      </div>
      {isInteractive && (
        <button
          className="btn-primary text-xs mt-1"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          Confirm ({assigned}/{hitsToAssign})
        </button>
      )}
    </div>
  )
}