import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useGame } from '../../hooks/useGame.js'
import { useGameEvents } from '../../hooks/useGameEvents.js'
import { useAbilities } from '../../hooks/useAbilities.js'
import { resolveAbility, unlockCommander } from '../../lib/edgeFunctions.js'
import { deriveActivePlayer, deriveSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'
import TechTreeModal from './TechTreeModal.jsx'
import ActionCardModal from './ActionCardModal.jsx'
import AbilityNotificationBar from './AbilityNotificationBar.jsx'
import AbilityTargetModal from './AbilityTargetModal.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, myCards, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
    drawTheActionCard, discardTheActionCard,
  } = useGame(code, userId)

  const [allTechnologies, setAllTechnologies] = useState([])
  const [allAbilityDefinitions, setAllAbilityDefinitions] = useState([])
  const [viewingTechPlayerId, setViewingTechPlayerId] = useState(null)
  const [actionCardModalOpen, setActionCardModalOpen] = useState(false)
  const [activatingAbility, setActivatingAbility] = useState(null)

  useEffect(() => {
    supabase
      .from('technologies')
      .select('*')
      .then(({ data }) => { if (data) setAllTechnologies(data) })
  }, [])

  useEffect(() => {
    supabase
      .from('ability_definitions')
      .select('*, ability_sources(*)')
      .then(({ data }) => { if (data) setAllAbilityDefinitions(data) })
  }, [])

  const { currentEvent } = useGameEvents(game, players, currentPlayer)

  // Build playerSources for useAbilities
  const myPlanets = planets.filter(p => p.player_id === currentPlayer?.id)
  const heldCardIds = myCards.map(c => c.action_card_id)

  // Compute scored objectives count for unlock condition evaluation
  const scoredObjectivesCount = useMemo(() => {
    if (!objectives || !currentPlayer) return 0
    return objectives.filter(o => o.scored_by?.includes(currentPlayer.id)).length
  }, [objectives, currentPlayer])

  // Identify locked commander ability IDs for unlock detection
  const lockedCommanderAbilityIds = useMemo(() => {
    if (!currentPlayer?.leaders || currentPlayer.leaders.commander !== 'locked') return []
    return allAbilityDefinitions
      .filter(a =>
        a.unlock_conditions?.length > 0 &&
        a.ability_sources?.some(s => s.source_type === 'leader')
      )
      .map(a => a.id)
  }, [allAbilityDefinitions, currentPlayer?.leaders?.commander])

  const playerSources = currentPlayer ? {
    playerId: currentPlayer.id,
    factionName: currentPlayer.faction,
    actionCardIds: heldCardIds,
    leaderIds: [],
    relicIds: [],
    promissoryNoteIds: [],
    technologyIds: currentPlayer.technologies ?? [],
    explorationCardIds: [],
    scoredObjectivesCount,
    vp: currentPlayer.vp,
    lockedCommanderAbilityIds,
  } : null

  const { triggerable, unlockable } = useAbilities(currentEvent, playerSources, allAbilityDefinitions)

  const triggerableAbilityIds = useMemo(
    () => new Set(triggerable.map(a => a.id)),
    [triggerable]
  )

  // Map from action_card_id → ability_definition for ActionCardModal PLAY buttons
  const triggerableByActionCardId = useMemo(() => {
    const map = new Map()
    for (const ability of triggerable) {
      const sources = ability.ability_sources?.filter(s => s.source_type === 'action_card') ?? []
      for (const source of sources) {
        if (source.source_id) map.set(source.source_id, ability)
      }
    }
    return map
  }, [triggerable])

  // Faction abilities for MyPanelSection
  const factionAbilities = useMemo(() => {
    if (!currentPlayer?.faction) return []
    return allAbilityDefinitions.filter(a =>
      a.ability_sources?.some(s =>
        s.source_type === 'faction_ability' && s.faction_name === currentPlayer.faction
      )
    )
  }, [allAbilityDefinitions, currentPlayer?.faction])

  const unlockableCommanderAbility = unlockable[0] ?? null

  async function handlePlayAbility(ability, sourceId = null, sourceType = 'faction_ability') {
    const needsSelection = (ability.effects ?? []).some(op =>
      op.target === 'chosen_player' ||
      op.target === 'chosen_planet' ||
      op.amount === 'chosen_amount' ||
      op.op === 'choose_one'
    )
    if (needsSelection) {
      setActivatingAbility({ ability, sourceId, sourceType })
    } else {
      await resolveAbility(game.id, ability.id, sourceType, sourceId, {})
    }
  }

  async function handleConfirmAbility({ ability_definition_id, source_type, source_id, selections }) {
    await resolveAbility(game.id, ability_definition_id, source_type, source_id, selections)
    setActivatingAbility(null)
  }

  async function handleUnlockCommander(ability) {
    await unlockCommander(game.id, ability.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-dim font-display text-xs tracking-widest">LOADING…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-danger font-body text-sm">{error}</span>
      </div>
    )
  }

  const speaker = deriveSpeaker(players, game)
  const activePlayer = deriveActivePlayer(players, game)

  const viewingPlayer = viewingTechPlayerId
    ? players.find(p => p.id === viewingTechPlayerId) ?? null
    : null
  const viewingPlanets = viewingTechPlayerId
    ? planets.filter(p => p.player_id === viewingTechPlayerId)
    : []

  return (
    <div className="min-h-screen bg-void">
      <GameHeader game={game} speaker={speaker} />
      <AbilityNotificationBar
        triggerable={triggerable.filter(a =>
          !a.ability_sources?.some(s => s.source_type === 'action_card')
        )}
        onPlay={a => handlePlayAbility(a)}
      />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ScoreboardSection
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
          onViewTech={setViewingTechPlayerId}
        />
        <MyPanelSection
          player={currentPlayer}
          planets={myPlanets}
          isActive={activePlayer?.id === currentPlayer?.id}
          game={game}
          onPass={passTheAction}
          onEndTurn={endTheTurn}
          onUpdateTokens={updateTokens}
          onExhaustPlanet={exhaustPlanet}
          onReadyPlanet={readyPlanet}
          onPickStrategyCard={pickStrategyCard}
          onUpdateCommodities={updateCommodities}
          onUpdateTradeGoods={updateTradeGoods}
          onCycleLeader={cycleLeader}
          onOpenActionCards={() => setActionCardModalOpen(true)}
          onViewTech={() => setViewingTechPlayerId(currentPlayer?.id ?? null)}
          factionAbilities={factionAbilities}
          triggerableAbilityIds={triggerableAbilityIds}
          unlockableCommanderAbility={unlockableCommanderAbility}
          onPlayAbility={a => handlePlayAbility(a)}
          onUnlockCommander={handleUnlockCommander}
        />
        <ObjectivesSection objectives={objectives} players={players} />
        <HostControlsSection
          isHost={isHost}
          game={game}
          players={players}
          objectives={objectives}
          onScoreObjective={scoreAnObjective}
          onRevealObjective={revealAnObjective}
          onShuffleDeck={shuffleTheDeck}
          onAdvancePhase={advanceThePhase}
        />
      </div>

      {actionCardModalOpen && (
        <ActionCardModal
          cards={myCards}
          onDraw={drawTheActionCard}
          onDiscard={discardTheActionCard}
          onClose={() => setActionCardModalOpen(false)}
          triggerableByActionCardId={triggerableByActionCardId}
          onPlay={(card, ability) => handlePlayAbility(ability, card.id, 'action_card')}
        />
      )}

      {activatingAbility && (
        <AbilityTargetModal
          ability={activatingAbility.ability}
          sourceId={activatingAbility.sourceId}
          sourceType={activatingAbility.sourceType}
          players={players}
          planets={myPlanets}
          onConfirm={handleConfirmAbility}
          onClose={() => setActivatingAbility(null)}
        />
      )}

      {viewingPlayer && (
        <TechTreeModal
          player={viewingPlayer}
          planets={viewingPlanets}
          allTechnologies={allTechnologies}
          gameId={game?.id}
          gameExpansions={game?.expansions}
          isOwnTree={viewingPlayer.id === currentPlayer?.id}
          onClose={() => setViewingTechPlayerId(null)}
        />
      )}
    </div>
  )
}
