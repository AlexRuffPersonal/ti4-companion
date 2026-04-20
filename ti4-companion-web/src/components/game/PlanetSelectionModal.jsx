import { useState, useMemo } from 'react'

export default function PlanetSelectionModal({
  planets = [],
  currentPlayerId,
  scope = 'own',
  filter = 'all',
  selectionMode = 'single',
  valueMode = 'none',
  label = 'Select a planet',
  onConfirm,
  onClose,
}) {
  const [selected, setSelected] = useState([])

  const visible = useMemo(() => {
    let list = planets
    if (scope === 'own') list = list.filter(p => p.player_id === currentPlayerId)
    if (filter === 'non-exhausted') list = list.filter(p => !p.exhausted)
    if (filter === 'exhausted') list = list.filter(p => p.exhausted)
    if (['cultural', 'industrial', 'hazardous'].includes(filter)) list = list.filter(p => p.trait === filter)
    return list
  }, [planets, scope, filter, currentPlayerId])

  const valueTotal = useMemo(() => {
    if (valueMode === 'none') return null
    const key = valueMode === 'influence' ? 'influence' : 'resources'
    return selected.reduce((sum, id) => {
      const p = planets.find(pl => pl.id === id)
      return sum + (p?.[key] ?? 0)
    }, 0)
  }, [selected, planets, valueMode])

  function toggle(id) {
    if (selectionMode === 'single') {
      setSelected(prev => prev[0] === id ? [] : [id])
    } else {
      setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-full max-w-sm mx-4 flex flex-col gap-4">
        <p className="label">{label}</p>

        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {visible.map(planet => {
            const isSelected = selected.includes(planet.id)
            const val = valueMode === 'influence' ? planet.influence
              : valueMode === 'resources' ? planet.resources : null
            return (
              <button
                key={planet.id}
                onClick={() => toggle(planet.id)}
                className={`flex items-center justify-between text-xs px-3 py-2 rounded border transition-all ${
                  isSelected
                    ? 'border-gold bg-hull ring-1 ring-gold text-text'
                    : 'border-border bg-void text-dim hover:text-text'
                }`}
              >
                <span>{planet.planet_name}</span>
                {val !== null && <span className="text-muted">{val}</span>}
              </button>
            )
          })}
          {visible.length === 0 && (
            <p className="text-dim text-xs text-center py-2">No planets available</p>
          )}
        </div>

        {valueTotal !== null && (
          <p className="text-xs text-muted text-right">
            Total: <span className="text-text font-display">{valueTotal}</span>
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button className="btn-primary text-xs" onClick={() => onConfirm(selected)}>CONFIRM</button>
        </div>
      </div>
    </div>
  )
}
