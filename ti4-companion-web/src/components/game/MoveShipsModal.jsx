import { useState } from 'react'
import { useMovement } from '../../hooks/useMovement.js'

export default function MoveShipsModal({ gameId, game, activeSystemKey, tileData, mapTiles, systemUnits, myPlayerId, myTokenSystems, unitDefs, onClose }) {
  const movement = useMovement(gameId, game, tileData, mapTiles, systemUnits, myPlayerId, myTokenSystems)
  const [step, setStep] = useState('select')  // 'select' | 'route' | 'excess'
  const [activeShipIndex, setActiveShipIndex] = useState(0)
  const [error, setError] = useState(null)

  // Step 1: Select ships
  const eligibleUnits = (systemUnits ?? []).filter(u =>
    u.player_id === myPlayerId &&
    u.on_planet === null &&
    (unitDefs?.[u.unit_type]?.move ?? 0) > 0
  )

  function toggleShip(unit) {
    const exists = movement.selectedShips.find(s => s.unit_id === unit.id)
    if (exists) {
      movement.setSelectedShips(prev => prev.filter(s => s.unit_id !== unit.id))
    } else {
      movement.setSelectedShips(prev => [...prev, {
        unit_id: unit.id,
        unit_type: unit.unit_type,
        origin_system_key: unit.system_key,
        path: [unit.system_key],
        cargo: [],
        moveValue: unitDefs?.[unit.unit_type]?.move ?? 1,
        capacity: unitDefs?.[unit.unit_type]?.capacity ?? 0,
      }])
    }
  }

  const activeShip = movement.selectedShips[activeShipIndex]

  function addHop(systemKey) {
    movement.setSelectedShips(prev => prev.map((s, i) =>
      i === activeShipIndex ? { ...s, path: [...s.path, systemKey] } : s
    ))
  }

  function undoHop() {
    movement.setSelectedShips(prev => prev.map((s, i) =>
      i === activeShipIndex && s.path.length > 1 ? { ...s, path: s.path.slice(0, -1) } : s
    ))
  }

  function advanceShip() {
    if (activeShipIndex < movement.selectedShips.length - 1) {
      setActiveShipIndex(i => i + 1)
    } else {
      setStep('excess')
    }
  }

  async function handleConfirm() {
    setError(null)
    try {
      await movement.confirmMove(activeSystemKey)
      onClose()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="panel w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'select' && (
          <>
            <p className="label mb-4">Step 1 — Select Ships to Move</p>
            {eligibleUnits.length === 0 && <p className="text-dim text-sm">No ships with movement available.</p>}
            {eligibleUnits.map(unit => {
              const isSelected = !!movement.selectedShips.find(s => s.unit_id === unit.id)
              return (
                <button
                  key={unit.id}
                  className={isSelected ? 'btn-primary mr-2 mb-2' : 'btn-ghost mr-2 mb-2'}
                  onClick={() => toggleShip(unit)}
                >
                  {unit.unit_type} ({unit.system_key})
                </button>
              )
            })}
            <div className="flex gap-3 mt-4">
              <button className="btn-primary" disabled={movement.selectedShips.length === 0} onClick={() => setStep('route')}>
                Next: Draw Routes
              </button>
              <button className="btn-ghost" onClick={onClose}>Skip Movement</button>
            </div>
          </>
        )}

        {step === 'route' && activeShip && (
          <>
            <p className="label mb-4">Step 2 — {activeShip.unit_type} from {activeShip.origin_system_key}</p>
            <p className="text-dim text-xs mb-3">Path: {activeShip.path.join(' → ')}</p>
            <div className="mb-3">
              <p className="label text-xs">Reachable systems:</p>
              {movement.reachableSystems(activeShip, activeShip.path).map(sk => (
                <button key={sk} className="btn-ghost mr-2 mb-2 text-xs" onClick={() => addHop(sk)}>{sk}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button className="btn-ghost" disabled={activeShip.path.length <= 1} onClick={undoHop}>Undo last hop</button>
              <button className="btn-primary" onClick={advanceShip}>Done with this ship</button>
              <button className="btn-ghost" onClick={() => setStep('select')}>Back</button>
            </div>
          </>
        )}

        {step === 'excess' && (
          <>
            <p className="label mb-4">Step 3 — Resolve Excess Capacity</p>
            {Object.keys(movement.excessBySystem()).length === 0
              ? <p className="text-dim text-sm mb-4">No excess units — ready to confirm.</p>
              : Object.entries(movement.excessBySystem()).map(([sk, entries]) => (
                  <div key={sk} className="mb-3">
                    <p className="label text-xs">{sk}</p>
                    {entries.map(e => (
                      <div key={e.unit_type} className="text-sm text-dim">
                        {e.unit_type}: excess {e.excess}
                      </div>
                    ))}
                  </div>
                ))
            }
            {error && <p className="text-danger text-sm mb-3">{error}</p>}
            <div className="flex gap-3">
              <button className="btn-primary" disabled={!movement.isReadyToConfirm()} onClick={handleConfirm}>
                Confirm Movement
              </button>
              <button className="btn-ghost" onClick={() => setStep('route')}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
