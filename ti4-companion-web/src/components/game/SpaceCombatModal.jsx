import { useState } from 'react'
import DiceResultsPanel from './DiceResultsPanel.jsx'
import FleetDisplay from './FleetDisplay.jsx'
import ActionCardWindowPanel from './ActionCardWindowPanel.jsx'

export default function SpaceCombatModal({
  combat,
  myPlayerId,
  systemUnits,
  unitDefs,
  hasAfbUnits,
  windowCards,
  isWindowPhase,
  onFireBarrage,
  onAdvanceBarrage,
  onAssignHits,
  playActionCard,
  passActionWindow,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isAttacker = myPlayerId === combat.attacker_player_id
  const isDefender = myPlayerId === combat.defender_player_id

  const attackerUnits = (systemUnits[combat.attacker_player_id] ?? []).filter(u => u.on_planet === null)
  const defenderUnits = (systemUnits[combat.defender_player_id] ?? []).filter(u => u.on_planet === null)

  async function handleFireBarrage() {
    setLoading(true)
    setError(null)
    try {
      await onFireBarrage()
    } catch (e) {
      setError(e.message ?? 'Error firing barrage')
    } finally {
      setLoading(false)
    }
  }

  function renderBarragePhase() {
    const diceReady = combat.barrage_attacker_dice !== null

    if (!diceReady) {
      if (hasAfbUnits) {
        return (
          <>
            <p className="label">Anti-Fighter Barrage</p>
            {isAttacker ? (
              <>
                <button
                  className="btn-primary text-sm"
                  disabled={loading}
                  onClick={handleFireBarrage}
                >
                  {loading ? 'Firing…' : 'Fire Anti-Fighter Barrage'}
                </button>
                {error && <p className="text-danger text-xs">{error}</p>}
              </>
            ) : (
              <p className="text-muted text-xs">Waiting for attacker to fire barrage…</p>
            )}
          </>
        )
      } else {
        return (
          <>
            <p className="text-muted text-xs">No units capable of Anti-Fighter Barrage</p>
            {isAttacker ? (
              <button className="btn-primary text-sm" onClick={onAdvanceBarrage}>
                Continue to Combat
              </button>
            ) : (
              <p className="text-muted text-xs">Waiting for attacker…</p>
            )}
          </>
        )
      }
    }

    return (
      <>
        <p className="label">Anti-Fighter Barrage Results</p>
        <DiceResultsPanel dice={combat.barrage_attacker_dice} label="Attacker" />
        <DiceResultsPanel dice={combat.barrage_defender_dice} label="Defender" />
        {isAttacker ? (
          <button className="btn-primary text-sm" onClick={onAdvanceBarrage}>
            Continue to Combat
          </button>
        ) : (
          <p className="text-muted text-xs">Waiting for attacker…</p>
        )}
      </>
    )
  }

  function renderAfbAttackerAssign() {
    return (
      <>
        <p className="label">Anti-Fighter Barrage — Assign Losses</p>
        <DiceResultsPanel dice={combat.barrage_attacker_dice} label="Attacker" />
        <DiceResultsPanel dice={combat.barrage_defender_dice} label="Defender" />
        {isAttacker ? (
          <>
            <p className="label">Assign {combat.barrage_defender_hits} hit(s) to your fighters</p>
            {isWindowPhase && (
              <ActionCardWindowPanel
                combat={combat}
                myPlayerId={myPlayerId}
                windowCards={windowCards}
                onPlayCard={playActionCard}
                onPass={passActionWindow}
              />
            )}
            <FleetDisplay
              units={attackerUnits}
              unitDefs={unitDefs}
              isInteractive={true}
              hitsToAssign={combat.barrage_defender_hits}
              onConfirm={onAssignHits}
            />
          </>
        ) : (
          <p className="text-muted text-xs">Waiting for attacker to assign losses…</p>
        )}
      </>
    )
  }

  function renderAfbDefenderAssign() {
    return (
      <>
        <p className="label">Anti-Fighter Barrage — Assign Losses</p>
        <DiceResultsPanel dice={combat.barrage_attacker_dice} label="Attacker" />
        <DiceResultsPanel dice={combat.barrage_defender_dice} label="Defender" />
        {isDefender ? (
          <>
            <p className="label">Assign {combat.barrage_attacker_hits} hit(s) to your fighters</p>
            {isWindowPhase && (
              <ActionCardWindowPanel
                combat={combat}
                myPlayerId={myPlayerId}
                windowCards={windowCards}
                onPlayCard={playActionCard}
                onPass={passActionWindow}
              />
            )}
            <FleetDisplay
              units={defenderUnits}
              unitDefs={unitDefs}
              isInteractive={true}
              hitsToAssign={combat.barrage_attacker_hits}
              onConfirm={onAssignHits}
            />
          </>
        ) : (
          <p className="text-muted text-xs">Waiting for defender to assign losses…</p>
        )}
      </>
    )
  }

  function renderContent() {
    if (combat.phase === 'afb_attacker_assign') return renderAfbAttackerAssign()
    if (combat.phase === 'afb_defender_assign') return renderAfbDefenderAssign()
    return renderBarragePhase()
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4">
        {renderContent()}
      </div>
    </div>
  )
}
