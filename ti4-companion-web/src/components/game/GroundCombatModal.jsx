import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import FleetDisplay from './FleetDisplay.jsx'
import DiceResultsPanel from './DiceResultsPanel.jsx'

const ROLL_PHASES = ['attacker_roll', 'defender_roll']
const ASSIGN_PHASES = ['defender_assign', 'attacker_assign']

export default function GroundCombatModal({
  combat, myPlayerId, players, systemUnits,
  onRollGroundDice, onAssignHits, onFireScd, onClose = () => {},
}) {
  const [unitDefs, setUnitDefs] = useState(new Map())
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

  const planetUnits = systemUnits.filter(u =>
    u.system_key === combat.system_key && u.on_planet === combat.planet_name
  )
  const attackerUnits = planetUnits.filter(u => u.player_id === combat.attacker_player_id)
  const defenderUnits = planetUnits.filter(u => u.player_id === combat.defender_player_id)

  const isAttacker = myPlayerId === combat.attacker_player_id
  const isDefender = myPlayerId === combat.defender_player_id

  const isMyRoll = (combat.phase === 'attacker_roll' && isAttacker) ||
                   (combat.phase === 'defender_roll' && isDefender)

  const isDefenderAssign = combat.phase === 'defender_assign' && isDefender
  const isAttackerAssign = combat.phase === 'attacker_assign' && isAttacker

  async function handleRoll() {
    setRolling(true)
    try { await onRollGroundDice() } finally { setRolling(false) }
  }

  if (combat.status === 'complete') {
    const winner = players.find(p => p.id === combat.winner_player_id)
    return (
      <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
        <div className="panel w-full max-w-md flex flex-col gap-4 text-center">
          <p className="label">GROUND COMBAT COMPLETE</p>
          <p className="font-display text-bright text-lg">{winner?.display_name ?? 'Unknown'} wins</p>
          <p className="text-muted text-sm">{combat.planet_name} — Round {combat.round}</p>
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
          <p className="label">GROUND COMBAT — {combat.planet_name}</p>
          <p className="text-muted text-xs font-display">ROUND {combat.round}</p>
        </div>

        {/* SCD fire phase (Phase 14) */}
        {combat.phase === 'scd_fire' && (
          <div className="flex flex-col gap-2">
            <p className="label">Space Cannon Defense</p>
            {isDefender ? (
              <button className="btn-primary" onClick={onFireScd}>Fire Space Cannon</button>
            ) : (
              <p className="text-muted text-xs">Waiting for defender to fire Space Cannon Defense…</p>
            )}
          </div>
        )}

        {/* SCD assign phase (Phase 14) */}
        {combat.phase === 'scd_assign' && (
          <div className="flex flex-col gap-2">
            <p className="label">Space Cannon Defense — Assign Losses</p>
            <DiceResultsPanel dice={combat.scd_dice} label="Space Cannon Defense" />
            {isAttacker ? (
              <FleetDisplay
                units={attackerUnits}
                unitDefs={unitDefs}
                isInteractive={true}
                hitsToAssign={combat.scd_hits ?? 0}
                onConfirm={onAssignHits}
              />
            ) : (
              <p className="text-muted text-xs">Waiting for attacker to assign losses…</p>
            )}
          </div>
        )}

        {/* Ground forces */}
        {(ROLL_PHASES.includes(combat.phase) || ASSIGN_PHASES.includes(combat.phase)) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">{attackerPlayer?.display_name} (Attacker)</p>
              <FleetDisplay
                units={attackerUnits}
                unitDefs={unitDefs}
                isInteractive={isAttackerAssign}
                hitsToAssign={isAttackerAssign ? (combat.defender_hits ?? 0) : 0}
                onConfirm={onAssignHits}
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">{defenderPlayer?.display_name} (Defender)</p>
              <FleetDisplay
                units={defenderUnits}
                unitDefs={unitDefs}
                isInteractive={isDefenderAssign}
                hitsToAssign={isDefenderAssign ? (combat.attacker_hits ?? 0) : 0}
                onConfirm={onAssignHits}
              />
            </div>
          </div>
        )}

        {/* Dice results */}
        {combat.attacker_dice && (
          <DiceResultsPanel dice={combat.attacker_dice} label="Attacker" />
        )}
        {combat.defender_dice && (
          <DiceResultsPanel dice={combat.defender_dice} label="Defender" />
        )}

        {/* Roll action */}
        {ROLL_PHASES.includes(combat.phase) && (
          <div className="flex flex-col gap-2">
            {isMyRoll ? (
              <button className="btn-primary" disabled={rolling} onClick={handleRoll}>
                {rolling ? 'Rolling…' : 'Roll Dice'}
              </button>
            ) : (
              <p className="text-muted text-xs text-center">Waiting for opponent to roll…</p>
            )}
          </div>
        )}

        {/* Waiting for assign */}
        {ASSIGN_PHASES.includes(combat.phase) && !isDefenderAssign && !isAttackerAssign && (
          <p className="text-muted text-xs text-center">Waiting for opponent to assign hits…</p>
        )}
      </div>
    </div>
  )
}
