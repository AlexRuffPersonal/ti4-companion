import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useGameState } from './hooks/useGameState'
import LoginScreen from './components/LoginScreen'
import SetupScreen from './components/SetupScreen'
import Dashboard from './components/Dashboard'
import AgendaPhase from './components/AgendaPhase'
import RulesLookup from './components/RulesLookup'
import TradeLog from './components/TradeLog'

export default function App() {
  const [user, setUser]             = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const {
    gameState, roomCode, myPlayerId, loading, error, syncing, isHost,
    createGame, joinGame, leaveGame, setError,
    updateGame, updatePlayer,
    adjustPlayerVP, adjustCounter, adjustCommandToken,
    toggleTechnology, setLeaderStatus,
    assignStrategyCard, togglePassed,
    advancePhase, claimCustodians,
    drawAgenda, castVote, resolveAgenda, repealLaw,
    setPlayerPermission, canEdit,
    logTransaction,
    claimExpeditionSlice, triggerFracture,
  } = useGameState(user?.id)

  const [overlay, setOverlay] = useState(null) // 'agenda' | 'rules' | 'trade'

  async function handleLogout() {
    if (gameState) leaveGame()
    await supabase.auth.signOut()
  }

  // ── Handle create or join from SetupScreen ──
  async function handleSetupAction(initialState, joinCode) {
    try {
      if (joinCode) {
        await joinGame(joinCode)
      } else {
        await createGame(initialState)
      }
    } catch (e) {
      // error is already set in the hook
    }
  }

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="starfield" />
        <div className="relative z-10 font-display text-xs text-dim tracking-widest animate-pulse">
          INITIALIZING...
        </div>
      </div>
    )
  }

  // ── Not logged in ──
  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  // ── No game yet — show setup ──
  if (!gameState) {
    return (
      <SetupScreen
        onCreateGame={handleSetupAction}
        loading={loading}
        error={error}
      />
    )
  }

  // ── Overlays ──
  if (overlay === 'agenda') {
    return (
      <AgendaPhase
        gameState={gameState}
        myPlayerId={myPlayerId}
        isHost={isHost}
        canEdit={canEdit}
        onClose={() => setOverlay(null)}
        onDrawAgenda={drawAgenda}
        onCastVote={(playerId, agendaIndex, choice, votes) => castVote(playerId, agendaIndex, choice, votes)}
        onResolveAgenda={resolveAgenda}
        onRepealLaw={repealLaw}
      />
    )
  }

  if (overlay === 'rules') {
    return <RulesLookup onClose={() => setOverlay(null)} />
  }

  if (overlay === 'trade') {
    return (
      <TradeLog
        gameState={gameState}
        myPlayerId={myPlayerId}
        canEdit={canEdit}
        onClose={() => setOverlay(null)}
        onLogTransaction={logTransaction}
      />
    )
  }

  // ── Main dashboard ──
  return (
    <Dashboard
      gameState={gameState}
      myPlayerId={myPlayerId}
      isHost={isHost}
      canEdit={canEdit}
      syncing={syncing}
      roomCode={roomCode}
      userEmail={user.email}

      onAdvancePhase={advancePhase}
      onClaimCustodians={claimCustodians}

      onAdjustVP={adjustPlayerVP}
      onAdjustCounter={adjustCounter}
      onAdjustCommandToken={adjustCommandToken}
      onAssignStrategyCard={assignStrategyCard}
      onTogglePassed={togglePassed}
      onToggleTechnology={toggleTechnology}
      onSetLeaderStatus={setLeaderStatus}
      onSetPermission={setPlayerPermission}

      onOpenAgenda={() => setOverlay('agenda')}
      onOpenRules={() => setOverlay('rules')}
      onOpenTrade={() => setOverlay('trade')}

      onLeave={() => {
        if (confirm('Leave this game? You can rejoin with the room code.')) {
          leaveGame()
        }
      }}
      onLogout={handleLogout}
    />
  )
}
