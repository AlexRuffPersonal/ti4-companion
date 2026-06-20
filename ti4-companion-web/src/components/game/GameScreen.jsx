import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useGame } from '../../hooks/useGame.js'
import { useGameEvents } from '../../hooks/useGameEvents.js'
import { useAbilities } from '../../hooks/useAbilities.js'
import {
  resolveAbility, unlockCommander, undoLastAction,
  endTurn, passAction, activateSystem, produceUnits as produceUnitsEF,
  assignHits, rollCombatDice, castVotes, playStrategyCard,
} from '../../lib/edgeFunctions.js'
import { deriveActivePlayer, deriveSpeaker, isSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'
import TechTreeModal from './TechTreeModal.jsx'
import ActionCardModal from './ActionCardModal.jsx'
import AbilityNotificationBar from './AbilityNotificationBar.jsx'
import AbilityTargetModal from './AbilityTargetModal.jsx'
import SecretObjectiveSelectionScreen from './SecretObjectiveSelectionScreen.jsx'
import SecretObjectivesModal from './SecretObjectivesModal.jsx'
import TokenRedistributionModal from './TokenRedistributionModal.jsx'
import AgendaSection from './AgendaSection.jsx'
import EnactedLawsPanel from './EnactedLawsPanel.jsx'
import PromissoryNotesModal from './PromissoryNotesModal.jsx'
import TradeModal from './TradeModal.jsx'
import TradeOfferBanner from './TradeOfferBanner.jsx'
import TransactionLogModal from './TransactionLogModal.jsx'
import { useGalaxy } from '../../hooks/useGalaxy.js'
import GalaxyTab from './GalaxyTab.jsx'
import { useStrategyCards } from '../../hooks/useStrategyCards.js'
import StrategyCardModal from './StrategyCardModal.jsx'
import ProductionModal from './ProductionModal.jsx'
import { produceUnits, passActionWindow, playActionCard } from '../../lib/edgeFunctions.js'
import { useBotPlayer } from '../../hooks/useBotPlayer.js'
import ActionWindowBanner from './ActionWindowBanner.jsx'
import RulesModal from './RulesModal.jsx'
import RiftTransitModal from './RiftTransitModal.jsx'
import { useRiftTransit } from '../../hooks/useRiftTransit.js'
import { useLeaders } from '../../hooks/useLeaders.js'
import CommanderRerollModal from './CommanderRerollModal.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, myCards, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
    drawTheActionCard, discardTheActionCard,
    mySecrets, discardTheSecret, scoreTheSecret, endStatusPhase,
    agendaVotes, enactedLaws, currentAgenda,
    drawTheAgenda, castTheVotes, resolveTheAgenda,
    myNotes, pendingIncomingTrades, createTheTransaction, confirmTheTransaction,
    rejectTheTransaction, rescindTheTransaction, playTheNote,
    isEliminated, myRelicFragments,
  } = useGame(code, userId)

  const galaxyState = useGalaxy(code, userId)
  const { activeTransit, rollAll, rollOne, loading: riftLoading, error: riftError } = useRiftTransit(game?.id)
  const leaders = useLeaders({ currentPlayer, gameId: game?.id })

  const gameId = game?.id
  const edgeFns = useMemo(() => ({
    'game-end-turn': (args) => endTurn(args.game_id),
    'game-player-pass': (args) => passAction(args.game_id),
    'game-activate-system': (args) => activateSystem(args.game_id, args.system_key),
    'game-produce-units': (args) => produceUnitsEF(args.game_id, args.system_key, args.units, args.planet_exhausts),
    'game-assign-hits': (args) => assignHits(args.game_id, args.combat_id, args.casualties),
    'game-roll-combat-dice': (args) => rollCombatDice(args.game_id, args.combat_id),
    'game-cast-votes': (args) => castVotes(args.game_id, { outcome: args.outcome, votes: args.votes }),
    'game-play-strategy-card': (args) => playStrategyCard(args.game_id, null, { strategy_card: args.strategy_card }),
  }), [gameId]) // eslint-disable-line react-hooks/exhaustive-deps -- bound to gameId only

  const { isBotTurn } = useBotPlayer({
    game: game ?? {},
    players,
    currentPlayer,
    isHost,
    edgeFns,
  })

  const canUndo = isHost && game?.phase !== 'lobby'

  const handleUndo = async () => { await undoLastAction(game?.id) }

  // Handle pending_window dispatching for leader windows
  useEffect(() => {
    const window = game?.pending_window
    if (!window) return
    switch (window.type) {
      case 'reactive_agent':
        leaders.handleReactiveAgentWindow(window)
        break
      case 'commander_passive':
      case 'commander_reroll':
        leaders.handleCommanderPassiveWindow(window)
        break
      default:
        break
    }
  }, [game?.pending_window?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    activePay, responses, isMyTurnToRespond,
    playPrimary, useSecondary, passSecondary,
  } = useStrategyCards(game?.id, currentPlayer?.id)

  // Reset dismissed state when a new play becomes active
  useEffect(() => {
    if (activePay) setStrategyModalDismissed(false)
  }, [activePay?.id])  // eslint-disable-line react-hooks/exhaustive-deps -- only reset on new play, not on status updates

  const [allTechnologies, setAllTechnologies] = useState([])
  const [allAbilityDefinitions, setAllAbilityDefinitions] = useState([])
  const [viewingTechPlayerId, setViewingTechPlayerId] = useState(null)
  const [windowLoading, setWindowLoading] = useState(false)
  const [actionCardModalOpen, setActionCardModalOpen] = useState(false)
  const [activatingAbility, setActivatingAbility] = useState(null)
  const [secretsModalOpen, setSecretsModalOpen] = useState(false)
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [tradeModalOpen, setTradeModalOpen] = useState(false)
  const [tradeLogModalOpen, setTradeLogModalOpen] = useState(false)
  const [initialTradeNoteId, setInitialTradeNoteId] = useState(null)
  const [activeTab, setActiveTab] = useState('my-panel') // 'my-panel' | 'scoreboard' | 'galaxy'
  const [productionSystemKey, setProductionSystemKey] = useState(null)
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [unitDefs, setUnitDefs] = useState({})
  const [strategyModalDismissed, setStrategyModalDismissed] = useState(false)

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

  useEffect(() => {
    supabase
      .from('units')
      .select('*')
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(u => { map[u.unit_type] = u })
          setUnitDefs(map)
        }
      })
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

  async function endAgendaPhase() {
    if (!game) return
    await supabase.from('games').update({ agenda_phase_step: 'inactive' }).eq('id', game.id)
  }

  async function handlePassWindow() {
    setWindowLoading(true)
    await passActionWindow(game?.id)
    setWindowLoading(false)
  }

  async function handlePlayWindowCard(cardId) {
    setWindowLoading(true)
    await playActionCard(game?.id, { card_id: cardId })
    setWindowLoading(false)
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
  const isSpeakerFlag = isSpeaker(players, game, userId)

  const viewingPlayer = viewingTechPlayerId
    ? players.find(p => p.id === viewingTechPlayerId) ?? null
    : null
  const viewingPlanets = viewingTechPlayerId
    ? planets.filter(p => p.player_id === viewingTechPlayerId)
    : []

  // Blocking gate: secret objective selection (only block if there are cards to select from)
  if (currentPlayer && !currentPlayer.secrets_selected && mySecrets.length > 0) {
    const pendingPlayers = players.filter(p => !p.secrets_selected && p.id !== currentPlayer.id)
    return (
      <SecretObjectiveSelectionScreen
        secrets={mySecrets}
        pendingPlayers={pendingPlayers}
        onDiscard={discardTheSecret}
      />
    )
  }

  const handleOpenNotes = () => setNotesModalOpen(true)
  const handleOpenTrade = () => {
    setInitialTradeNoteId(null)
    setTradeModalOpen(true)
  }
  const handleGiveNote = (note) => {
    setInitialTradeNoteId(note.id)
    setNotesModalOpen(false)
    setTradeModalOpen(true)
  }
  const handlePlayNote = async (noteId, options = {}) => {
    try {
      await playTheNote(noteId, options)
    } catch (e) {
      console.error('Play note error:', e)
    }
  }
  const handleSubmitTrade = async (payload) => {
    try {
      await createTheTransaction(payload.to_player_id, payload.offer, payload.request)
      setTradeModalOpen(false)
    } catch (e) {
      console.error('Create transaction error:', e)
    }
  }
  const handleAcceptTrade = async (txId) => {
    try {
      await confirmTheTransaction(txId)
    } catch (e) {
      console.error('Confirm transaction error:', e)
    }
  }
  const handleDeclineTrade = async (txId) => {
    try {
      await rejectTheTransaction(txId)
    } catch (e) {
      console.error('Reject transaction error:', e)
    }
  }

  return (
    <div className="min-h-screen bg-void">
      {isEliminated && (
        <div className="bg-danger/20 border border-danger/40 text-danger px-4 py-2 text-sm font-body">
          You have been eliminated. You are spectating the remainder of the game.
        </div>
      )}
      <GameHeader
        game={game}
        speaker={deriveSpeaker(players, game)}
        activePlayer={activePlayer}
        onOpenTradeLog={() => setTradeLogModalOpen(true)}
        onOpenRules={() => setRulesModalOpen(true)}
        isHost={isHost}
        canUndo={canUndo}
        onUndo={handleUndo}
      />
      <AbilityNotificationBar
        triggerable={triggerable.filter(a =>
          !a.ability_sources?.some(s => s.source_type === 'action_card')
        )}
        onPlay={a => handlePlayAbility(a)}
      />
      <TradeOfferBanner
        trades={pendingIncomingTrades}
        players={players}
        currentPlayerId={currentPlayer?.id}
        onAccept={handleAcceptTrade}
        onDecline={handleDeclineTrade}
      />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ScoreboardSection
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
          onViewTech={setViewingTechPlayerId}
        />
        {!isEliminated && (
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
            onOpenSecrets={() => setSecretsModalOpen(true)}
            secretCount={mySecrets.length}
            onOpenNotes={handleOpenNotes}
            noteCount={myNotes?.filter(n => n.state === 'held').length ?? 0}
            onOpenTrade={handleOpenTrade}
            allPlayers={players}
            activePay={activePay}
            onPlayPrimary={() => {
              const primaryAbility = allAbilityDefinitions.find(a =>
                a.ability_sources?.some(s =>
                  s.source_type === 'strategy_card' &&
                  s.source_id === String(currentPlayer?.strategy_card) &&
                  s.role === 'primary'
                )
              )
              if (primaryAbility) handlePlayAbility(primaryAbility, String(currentPlayer?.strategy_card), 'strategy_card')
            }}
            planetStaticMap={galaxyState?.planetStaticMap ?? {}}
            leaders={leaders}
          />
        )}
        <button
          className={`btn-ghost text-xs ${activeTab === 'galaxy' ? 'text-bright' : 'text-muted'}`}
          onClick={() => setActiveTab('galaxy')}
        >
          GALAXY
        </button>
        {!isEliminated && (
          <ObjectivesSection
            objectives={objectives}
            players={players}
            game={game}
            currentPlayerId={currentPlayer?.id}
            onScore={(objId) => scoreAnObjective(objId, currentPlayer?.id)}
          />
        )}
        {!isEliminated && (
          <AgendaSection
            game={game}
            agenda={currentAgenda}
            votes={agendaVotes}
            players={players}
            currentPlayer={currentPlayer}
            isSpeaker={isSpeakerFlag}
            planets={planets.filter(p => p.player_id === currentPlayer?.id)}
            onDrawAgenda={drawTheAgenda}
            onCastVote={castTheVotes}
            onResolve={resolveTheAgenda}
          />
        )}
        <EnactedLawsPanel laws={enactedLaws} />
        {!isEliminated && (
          <HostControlsSection
            isHost={isHost}
            game={game}
            players={players}
            objectives={objectives}
            onScoreObjective={scoreAnObjective}
            onRevealObjective={revealAnObjective}
            onShuffleDeck={shuffleTheDeck}
            onAdvancePhase={advanceThePhase}
            onEndStatusPhase={endStatusPhase}
            onEndAgendaPhase={endAgendaPhase}
            pendingSecretPlayers={players.filter(p => !p.secrets_selected)}
            pendingTokenPlayers={players.filter(p => !p.tokens_redistributed)}
          />
        )}
      </div>

      {!isEliminated && (
        <ActionWindowBanner
          window={game?.pending_action_window ?? null}
          currentPlayerId={currentPlayer?.id}
          myCards={myCards}
          onPlayCard={handlePlayWindowCard}
          onPass={handlePassWindow}
          loading={windowLoading}
        />
      )}

      {actionCardModalOpen && (
        <ActionCardModal
          cards={myCards}
          onDraw={drawTheActionCard}
          onDiscard={discardTheActionCard}
          onClose={() => setActionCardModalOpen(false)}
          triggerableByActionCardId={triggerableByActionCardId}
          onPlay={(card, ability) => handlePlayAbility(ability, card.id, 'action_card')}
          onPlayCard={(cardId, params) => playActionCard(game?.id, { card_id: cardId, ...params })}
          isMyTurn={activePlayer?.id === currentPlayer?.id}
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

      {secretsModalOpen && (
        <SecretObjectivesModal
          secrets={mySecrets}
          game={game}
          onScore={(objId) => { scoreTheSecret(objId); setSecretsModalOpen(false) }}
          onClose={() => setSecretsModalOpen(false)}
        />
      )}

      {notesModalOpen && (
        <PromissoryNotesModal
          notes={myNotes?.filter(n => n.state === 'held') ?? []}
          players={players}
          myPlanets={myPlanets}
          myRelicFragments={myRelicFragments}
          currentPlayerId={currentPlayer?.id}
          onGive={handleGiveNote}
          onPlay={handlePlayNote}
          onClose={() => setNotesModalOpen(false)}
        />
      )}

      {tradeModalOpen && (
        <TradeModal
          currentPlayer={currentPlayer}
          players={players}
          myNotes={myNotes?.filter(n => n.state === 'held') ?? []}
          initialNoteId={initialTradeNoteId}
          onSubmit={handleSubmitTrade}
          onClose={() => setTradeModalOpen(false)}
        />
      )}

      {tradeLogModalOpen && (
        <TransactionLogModal
          transactions={[]}
          players={players}
          onClose={() => setTradeLogModalOpen(false)}
        />
      )}

      {currentPlayer && currentPlayer.tokens_redistributed === false && (
        <TokenRedistributionModal
          player={currentPlayer}
          onSubmit={updateTokens}
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

      {activeTab === 'galaxy' && (
        <GalaxyTab
          {...galaxyState}
          players={players}
          currentPlayer={currentPlayer}
          game={game}
          onOpenProduction={setProductionSystemKey}
        />
      )}

      {activePay && !strategyModalDismissed && (
        <StrategyCardModal
          activePay={activePay}
          responses={responses}
          myPlayerId={currentPlayer?.id}
          players={players}
          abilityDefs={allAbilityDefinitions}
          isMyTurnToRespond={isMyTurnToRespond}
          onUseSecondary={(abilityId, selections) => useSecondary(abilityId, selections)}
          onPassSecondary={passSecondary}
          onClose={() => setStrategyModalDismissed(true)}
        />
      )}

      {isBotTurn && (
        <div className="fixed bottom-4 right-4 bg-panel text-muted text-xs px-3 py-1 rounded-full border border-border">Bot is thinking…</div>
      )}

      <RulesModal isOpen={rulesModalOpen} onClose={() => setRulesModalOpen(false)} />

      {leaders.commanderRerollModalOpen && leaders.commanderRerollWindow && (
        <CommanderRerollModal
          window={leaders.commanderRerollWindow}
          onConfirm={leaders.handleCommanderRerollConfirm}
          onClose={leaders.closeCommanderRerollModal}
        />
      )}

      {activeTransit && (
        <RiftTransitModal
          transit={activeTransit}
          myPlayerId={currentPlayer?.id}
          players={players}
          tileMap={game?.map_tiles}
          onRollAll={rollAll}
          onRollOne={rollOne}
          onClose={() => {}}
          loading={riftLoading}
          error={riftError}
        />
      )}

      {productionSystemKey && (
        <ProductionModal
          gameId={game?.id}
          systemKey={productionSystemKey}
          systemUnits={galaxyState.systemUnits ?? []}
          myPlayerId={currentPlayer?.id}
          myPlanets={myPlanets}
          unitDefs={unitDefs}
          onProduce={async (payload) => {
            await produceUnits(game.id, payload.systemKey, payload.units, payload.planet_exhausts)
            setProductionSystemKey(null)
          }}
          onClose={() => setProductionSystemKey(null)}
        />
      )}
    </div>
  )
}
