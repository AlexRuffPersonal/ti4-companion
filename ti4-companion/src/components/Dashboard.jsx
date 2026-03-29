import { useState } from 'react'
import { ChevronRight, Wifi, WifiOff, Menu, X, Shield, Zap } from 'lucide-react'
import { PHASE_LABELS, PHASE_DESCRIPTIONS, STRATEGY_CARDS, PLAYER_COLOURS } from '../data/gameData'
import { getInitiativeOrder } from '../hooks/useGameState'
import PlayerRow from './PlayerRow'

const NAV_TABS = ['dashboard', 'agenda', 'rules', 'trade']
const NAV_LABELS = { dashboard: 'Board', agenda: 'Agenda', rules: 'Rules', trade: 'Trade' }

export default function Dashboard({
  gameState,
  myPlayerId,
  isHost,
  canEdit,
  syncing,
  roomCode,
  onAdvancePhase,
  onClaimCustodians,
  onAdjustVP,
  onAdjustCounter,
  onAdjustCommandToken,
  onAssignStrategyCard,
  onTogglePassed,
  onToggleTechnology,
  onSetLeaderStatus,
  onSetPermission,
  onOpenAgenda,
  onOpenRules,
  onOpenTrade,
  onLeave,
}) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [showRoomCode, setShowRoomCode] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  const { players, round, phase, vpGoal, custodiansClaimed, laws, galacticEvent, theFractureInPlay } = gameState
  const speaker = players.find(p => p.id === gameState.speakerId)
  const initiativeOrder = getInitiativeOrder(players)

  function getColour(colourId) {
    return PLAYER_COLOURS.find(c => c.id === colourId)?.hex || '#6b7280'
  }

  return (
    <div className="min-h-screen flex flex-col bg-void">
      <div className="starfield" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-hull/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="font-display text-xs text-gold tracking-widest">TI4</div>
          <div className="w-px h-4 bg-border" />
          <div className="font-display text-xs text-dim tracking-wider">
            ROUND <span className="text-bright">{round}</span>
          </div>
          <PhaseChip phase={phase} />
        </div>
        <div className="flex items-center gap-2">
          {syncing
            ? <Wifi size={12} className="text-plasma animate-pulse" />
            : <Wifi size={12} className="text-success opacity-60" />
          }
          <button
            className="font-mono text-xs text-dim hover:text-text transition-colors border border-border rounded px-2 py-0.5"
            onClick={() => setShowRoomCode(v => !v)}
          >
            {showRoomCode ? roomCode : '••••••'}
          </button>
          <button className="text-dim hover:text-text transition-colors" onClick={onLeave}>
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="relative z-10 flex-1 overflow-y-auto pb-20">

        {/* VP Scoreboard */}
        <section className="px-4 pt-4 pb-2">
          <div className="panel p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="label">Victory Points</span>
              <span className="label">{vpGoal} VP to win</span>
            </div>
            {[...players].sort((a, b) => b.vp - a.vp).map(player => (
              <VPRow key={player.id} player={player} vpGoal={vpGoal} colour={getColour(player.colour)} />
            ))}
          </div>
        </section>

        {/* Phase control */}
        <section className="px-4 py-2">
          <div className="panel p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-xs text-plasma tracking-wider">{PHASE_LABELS[phase]}</div>
                <p className="text-dim text-xs font-body mt-0.5 leading-snug">{PHASE_DESCRIPTIONS[phase]}</p>
              </div>
              {(isHost) && (
                <button className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap" onClick={onAdvancePhase}>
                  Next Phase →
                </button>
              )}
            </div>

            {/* Custodians */}
            {!custodiansClaimed && (
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-dim text-xs font-body">Custodians Token on Mecatol Rex</span>
                <button
                  className="text-xs border border-gold/50 text-gold px-2 py-0.5 rounded hover:bg-gold/10 transition-colors"
                  onClick={() => onClaimCustodians(myPlayerId)}
                >
                  Claim (+1 VP)
                </button>
              </div>
            )}

            {/* The Fracture indicator */}
            {theFractureInPlay && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <div className="w-2 h-2 rounded-full bg-plasma animate-pulse-slow" />
                <span className="text-plasma text-xs font-body">The Fracture is in play</span>
              </div>
            )}

            {/* Galactic Event */}
            {galacticEvent && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Zap size={10} className="text-gold" />
                <span className="text-gold text-xs font-body">{galacticEvent}</span>
              </div>
            )}
          </div>
        </section>

        {/* Initiative order */}
        {initiativeOrder.length > 0 && (
          <section className="px-4 py-2">
            <div className="panel p-3">
              <div className="label mb-2">Initiative Order</div>
              <div className="flex gap-2 flex-wrap">
                {initiativeOrder.map((p, i) => {
                  const card = STRATEGY_CARDS.find(s => s.id === p.strategyCard)
                  return (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getColour(p.colour) }} />
                      <span className="font-body text-xs text-dim">{i + 1}.</span>
                      <span className="font-body text-xs text-text">{p.name}</span>
                      {card && <span className="font-mono text-xs text-dim">({card.short})</span>}
                      {p.passed && <span className="text-dim text-xs">· passed</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Laws in play */}
        {laws.length > 0 && (
          <section className="px-4 py-2">
            <div className="panel p-3">
              <div className="label mb-2">Laws in Play ({laws.length})</div>
              <div className="flex flex-col gap-1">
                {laws.map((law, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    <span className="font-body text-xs text-text">{typeof law === 'string' ? law : law.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Speaker */}
        {speaker && (
          <section className="px-4 py-2">
            <div className="panel-inset px-3 py-2 flex items-center gap-2">
              <span className="text-gold text-xs">★</span>
              <span className="label">Speaker:</span>
              <span className="font-body text-sm text-text">{speaker.name}</span>
            </div>
          </section>
        )}

        {/* Host permissions panel */}
        {isHost && (
          <section className="px-4 py-2">
            <button
              className="w-full panel-inset px-3 py-2 flex items-center justify-between"
              onClick={() => setShowPermissions(v => !v)}
            >
              <div className="flex items-center gap-2">
                <Shield size={12} className="text-plasma" />
                <span className="label">Edit Permissions</span>
              </div>
              <ChevronRight size={12} className={`text-dim transition-transform ${showPermissions ? 'rotate-90' : ''}`} />
            </button>
            {showPermissions && (
              <div className="panel mt-1 p-3 flex flex-col gap-2 animate-slide-up">
                {players.map(p => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getColour(p.colour) }} />
                      <span className="font-body text-sm text-text">{p.name}</span>
                      {p.id === gameState.hostId && <span className="text-gold text-xs">(host)</span>}
                    </div>
                    {p.id !== gameState.hostId && (
                      <div className="flex gap-1">
                        {['own', 'all'].map(level => (
                          <button
                            key={level}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                              (gameState.permissions?.[p.id] || 'own') === level
                                ? 'border-plasma text-plasma bg-plasma/10'
                                : 'border-muted text-dim hover:border-dim'
                            }`}
                            onClick={() => onSetPermission(p.id, level)}
                          >
                            {level === 'own' ? 'Own only' : 'Edit all'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Player rows */}
        <section className="px-4 py-2 flex flex-col gap-2">
          <div className="label">Players</div>
          {players.map(player => (
            <PlayerRow
              key={player.id}
              player={player}
              isMe={player.id === myPlayerId}
              isHost={isHost}
              canEdit={canEdit(player.id)}
              isExpanded={expandedPlayer === player.id}
              onToggleExpand={() => setExpandedPlayer(expandedPlayer === player.id ? null : player.id)}
              strategyCards={STRATEGY_CARDS}
              playerCount={players.length}
              gameState={gameState}
              onAdjustVP={delta => onAdjustVP(player.id, delta)}
              onAdjustCounter={(field, delta) => onAdjustCounter(player.id, field, delta)}
              onAdjustCommandToken={(pool, delta) => onAdjustCommandToken(player.id, pool, delta)}
              onAssignStrategyCard={(cardId, slot) => onAssignStrategyCard(player.id, cardId, slot)}
              onTogglePassed={() => onTogglePassed(player.id)}
              onToggleTechnology={tech => onToggleTechnology(player.id, tech)}
              onSetLeaderStatus={(leader, status) => onSetLeaderStatus(player.id, leader, status)}
            />
          ))}
        </section>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-hull/95 backdrop-blur-sm border-t border-border">
        <div className="flex">
          {NAV_TABS.map(tab => (
            <button
              key={tab}
              className={`flex-1 py-3 font-display text-xs tracking-widest transition-colors ${
                activeTab === tab ? 'text-gold border-t-2 border-gold -mt-px' : 'text-dim hover:text-text'
              }`}
              onClick={() => {
                setActiveTab(tab)
                if (tab === 'agenda') onOpenAgenda()
                if (tab === 'rules') onOpenRules()
                if (tab === 'trade') onOpenTrade()
              }}
            >
              {NAV_LABELS[tab]}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function PhaseChip({ phase }) {
  const colours = {
    strategy: 'text-gold border-gold/40 bg-gold/10',
    action:   'text-danger border-danger/40 bg-danger/10',
    status:   'text-success border-success/40 bg-success/10',
    agenda:   'text-plasma border-plasma/40 bg-plasma/10',
  }
  const labels = { strategy: 'STRATEGY', action: 'ACTION', status: 'STATUS', agenda: 'AGENDA' }
  return (
    <span className={`font-display text-xs px-2 py-0.5 rounded border ${colours[phase]}`}>
      {labels[phase]}
    </span>
  )
}

function VPRow({ player, vpGoal, colour }) {
  const pct = Math.min(100, (player.vp / vpGoal) * 100)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
          <span className="font-body text-sm text-text">{player.name}</span>
          {player.faction && <span className="text-dim text-xs hidden sm:inline">{player.faction}</span>}
        </div>
        <span className="font-display text-sm font-bold" style={{ color: colour }}>{player.vp} VP</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full vp-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: colour }}
        />
      </div>
    </div>
  )
}
