import { useState } from 'react'

export default function CommanderRerollModal({ window: win, onConfirm, onClose }) {
  const [selected, setSelected] = useState([])

  function toggle(i) {
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 px-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">Jol-Nar Commander — Ta Zern</p>
        <p className="text-muted font-body text-sm">
          After you roll dice for a unit ability, you may reroll any of those dice.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(win?.dice ?? []).map((die, i) => (
            <button
              key={i}
              className={`panel-inset flex flex-col items-center gap-1 py-2 px-3 border-2 rounded transition-colors ${
                selected.includes(i) ? 'border-plasma' : 'border-border'
              }`}
              onClick={() => toggle(i)}
            >
              <span className="font-display text-lg text-bright">{die.roll}</span>
              <span className={`font-body text-xs ${die.hit ? 'text-success' : 'text-danger'}`}>
                {die.hit ? '✓' : '✗'}
              </span>
              {die.rerolled && (
                <span className="font-body text-xs text-muted">(rerolled)</span>
              )}
            </button>
          ))}
        </div>

        <p className="text-muted font-body text-xs">
          {selected.length} {selected.length === 1 ? 'die' : 'dice'} selected for reroll
        </p>

        <div className="flex gap-3">
          <button
            className="btn-primary flex-1"
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            REROLL
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={onClose}
          >
            KEEP ALL
          </button>
        </div>
      </div>
    </div>
  )
}
