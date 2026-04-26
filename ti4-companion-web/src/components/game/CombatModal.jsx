import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import FleetDisplay from './FleetDisplay.jsx'
import DiceResultsPanel from './DiceResultsPanel.jsx'
import RetreatDestinationPicker from './RetreatDestinationPicker.jsx'

const ROLL_PHASES = ['barrage', 'attacker_roll', 'defender_roll']
const ASSIGN_PHASES = ['defender_assign', 'attacker_assign']

export default function CombatModal({
  combat, myPlayerId, players, systemUnits,
  mapTiles, tileData, allPlanets,
  onRollDice, onAssignHits, onDeclareRetreat, onClose = () => {},
}) {
  const [unitDefs, setUnitDefs] = useState(new Map())
  const [showRetreat, setShowRetreat] = useState(false)
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    supabase
      .from('units')
      .select('name, sustain_damage')
      .then(({ data }) => {
        if (data) setUnitDefs(new Map(data.map(u => [u.name, u])))
      })
  }, [])

  if (!combat) return null

  const attackerPlayer = players.find(p => p.id === combat.attacker_player_id)
  const defenderPlayer = players.find(p => p.id === combat.defender_player_id)

  const spaceUnits = systemUnits.filter(u => u.system_key === combat.system_key && u.on_planet == null)
  const attackerUnits = spaceUnits.filter(u => u.player_id === combat.attacker_player_id)
  const defenderUnits = spaceUnits.filter(u => u.player_id === combat.defender_player_id)

  const isAttacker = myPlayerId === combat.attacker_player_id
  const isDefender = myPlayerId === combat.defender_player_id
  const isParticipant = isAttacker || isDefender

  const isMyRoll = (combat.phase === 'attacker_roll' && isAttacker) ||
                   (combat.phase === 'defender_roll' && isDefender) ||
                   (combat.phase === 'barrage' && isParticipant)

  const isDefenderAssign = combat.phase === 'defender_assign' && isDefender
  const isAttackerAssign = combat.phase === 'attacker_assign' && isAttacker

  async function handleRoll() {
    setRolling(true)
    try { await onRollDice() } finally { setRolling(false) }
  }

  async function handleAssign(casualties) {
    await onAssignHits(casualties)
  }

  async function handleSelectRetreat(dest) {
    setShowRetreat(false)
    await onDeclareRetreat(dest)
  }

  // Result screen
  if (combat.status === 'complete') {
    const winner = players.find(p => p.id === combat.winner_player_id)
    return (
      <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
        <div className="panel w-full max-w-md flex flex-col gap-4 text-center">
          <p className="label">COMBAT COMPLETE</p>
          <p className="font-display text-bright text-lg">{winner?.display_name ?? 'Unknown'} wins</p>
          <p className="text-muted text-sm">System {combat.system_key} — Round {combat.round}</p>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="label">SPACE COMBAT — {combat.system_key}</p>
          <p className="text-muted text-xs font-display">ROUND {combat.round}</p>
        </div>

        {/* Fleets */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">{attackerPlayer?.display_name} (Attacker)</p>
            <FleetDisplay
              units={attackerUnits}
              unitDefs={unitDefs}
              isInteractive={isAttackerAssign}
              hitsToAssign={isAttackerAssign ? (combat.defender_hits ?? 0) : 0}
              onConfirm={handleAssign}
            />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">{defenderPlayer?.display_name} (Defender)</p>
            <FleetDisplay
              units={defenderUnits}
              unitDefs={unitDefs}
              isInteractive={isDefenderAssign}
              hitsToAssign={isDefenderAssign ? (combat.attacker_hits ?? 0) : 0}
              onConfirm={handleAssign}
            />
          </div>
        </div>

        {/* Dice results */}
        {combat.attacker_dice && (
          <DiceResultsPanel dice={combat.attacker_dice} label="Attacker" />
        )}
        {combat.defender_dice && (
          <DiceResultsPanel dice={combat.defender_dice} label="Defender" />
        )}

        {/* Action panel */}
        {ROLL_PHASES.includes(combat.phase) && (
          <div className="flex flex-col gap-2">
            {isMyRoll && (
              <button className="btn-primary" disabled={rolling} onClick={handleRoll}>
                {rolling ? 'Rolling…' : 'Roll Dice'}
              </button>
            )}
            {isParticipant && !showRetreat && (
              <button className="btn-ghost text-xs" onClick={() => setShowRetreat(true)}>
                Declare Retreat
              </button>
            )}
            {showRetreat && (
              <RetreatDestinationPicker
                combatSystemKey={combat.system_key}
                mapTiles={mapTiles}
                tileData={tileData}
                systemUnits={systemUnits}
                allPlanets={allPlanets}
                retreatingPlayerId={myPlayerId}
                onSelect={handleSelectRetreat}
                onCancel={() => setShowRetreat(false)}
              />
            )}
            {combat.retreat_declared_by && (
              <p className="text-warning text-xs text-center">
                Retreat declared — will execute at end of round
              </p>
            )}
          </div>
        )}

        {ASSIGN_PHASES.includes(combat.phase) && !isDefenderAssign && !isAttackerAssign && (
          <p className="text-muted text-xs text-center">Waiting for opponent to assign hits…</p>
        )}
      </div>
    </div>
  )
}