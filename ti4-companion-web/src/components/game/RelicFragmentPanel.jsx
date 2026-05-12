import { useState } from 'react'

const FRAGMENT_TYPES = ['cultural', 'hazardous', 'industrial', 'unknown']

function isValidSelection(selectedIds, relicFragments) {
  if (selectedIds.size !== 3) return false
  const selected = relicFragments.filter(f => selectedIds.has(f.id))
  const typedSelected = selected.filter(f => f.relic_fragment_type !== 'unknown')
  if (typedSelected.length === 0) return false
  const types = new Set(typedSelected.map(f => f.relic_fragment_type))
  if (types.size > 1) return false
  return true
}

export default function RelicFragmentPanel({ relicFragments, isActivePlayer, onUseRelicFragment }) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showSelector, setShowSelector] = useState(false)

  if (!relicFragments || relicFragments.length === 0) return null

  const grouped = {}
  for (const type of FRAGMENT_TYPES) {
    grouped[type] = relicFragments.filter(f => f.relic_fragment_type === type)
  }

  function toggleId(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const canSpend = isActivePlayer && relicFragments.length >= 3
  const valid = isValidSelection(selectedIds, relicFragments)

  function handleConfirm() {
    onUseRelicFragment([...selectedIds])
    setShowSelector(false)
    setSelectedIds(new Set())
  }

  return (
    <div className="panel w-full max-w-sm flex flex-col gap-4">
      <p className="label">RELIC FRAGMENTS</p>
      <div className="flex flex-col gap-1">
        {FRAGMENT_TYPES.map(type => {
          const count = grouped[type].length
          if (count === 0) return null
          return (
            <div key={type} className="flex items-center justify-between text-sm font-body">
              <span className="capitalize text-text">{type}</span>
              <span className="text-xs px-2 py-0.5 rounded panel-inset text-bright">{count}</span>
            </div>
          )
        })}
      </div>
      <button
        className="btn-primary"
        disabled={!canSpend}
        onClick={() => setShowSelector(true)}
      >
        Spend Fragments
      </button>

      {showSelector && (
        <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
          <div className="panel w-full max-w-sm flex flex-col gap-4">
            <p className="label">Select 3 fragments to spend</p>
            <div className="flex flex-col gap-2">
              {relicFragments.map(f => (
                <label key={f.id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f.id)}
                    onChange={() => toggleId(f.id)}
                    className="accent-gold"
                  />
                  <span className="capitalize text-text">{f.relic_fragment_type}</span>
                  {f.name && <span className="text-muted text-xs">({f.name})</span>}
                </label>
              ))}
            </div>
            {!valid && selectedIds.size > 0 && (
              <p className="text-muted text-xs">
                Select exactly 3 fragments — all must share a type (unknowns are wild, but at least 1 typed required)
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={() => { setShowSelector(false); setSelectedIds(new Set()) }}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!valid} onClick={handleConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
