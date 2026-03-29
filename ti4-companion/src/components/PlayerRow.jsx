import { useState } from 'react'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { PLAYER_COLOURS, STRATEGY_CARDS, TECHNOLOGIES } from '../data/gameData'

const LEADER_STATUSES = ['locked', 'unlocked', 'exhausted', 'purged']
const LEADER_COLOURS = {
  locked:    'text-dim border-muted',
  unlocked:  'text-success border-success/50',
  exhausted: 'text-warning border-warning/50',
  purged:    'text-danger border-danger/50 line-through',
}

export default function PlayerRow({
  player,
  isMe,
  isHost,
  canEdit,
  isExpanded,
  onToggleExpand,
  strategyCards,
  playerCount,
  gameState,
  onAdjustVP,
  onAdjustCounter,
  onAdjustCommandToken,
  onAssignStrategyCard,
  onTogglePassed,
  onToggleTechnology,
  onSetLeaderStatus,
}) {
  const [techTab, setTechTab] = useState('green')
  const colour = PLAYER_COLOURS.find(c => c.id === player.colour)
  const hex = colour?.hex || '#6b7280'
  const usedCardIds = gameState.players
    .filter(p => p.id !== player.id)
    .flatMap(p => [p.strategyCard, p.strategyCard2].filter(Boolean))

  return (
    <div
      className={`panel overflow-hidden transition-all duration-200 ${isMe ? 'border-l-2' : ''}`}
      style={isMe ? { borderLeftColor: hex } : {}}
    >
      {/* Row header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-3 py-3 text-left"
        onClick={onToggleExpand}
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-body font-semibold text-sm text-text truncate">{player.name}</span>
            {isMe && <span className="text-xs text-dim">(you)</span>}
            {player.passed && <span className="text-xs text-dim italic">passed</span>}
          </div>
          {player.faction && (
            <div className="font-body text-xs text-dim truncate">{player.faction}</div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-display text-base font-bold" style={{ color: hex }}>{player.vp} VP</span>
          {player.breakthrough && (
            <span className="text-plasma text-xs font-display" title="Breakthrough gained">BT</span>
          )}
          {isExpanded ? <ChevronUp size={14} className="text-dim" /> : <ChevronDown size={14} className="text-dim" />}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-3 pb-3 flex flex-col gap-4 animate-slide-up">

          {/* VP adjustment */}
          {canEdit && (
            <div className="flex items-center justify-between pt-3">
              <span className="label">Victory Points</span>
              <div className="flex items-center gap-2">
                <button className="counter-btn" onClick={() => onAdjustVP(-1)}><Minus size={12} /></button>
                <span className="font-display text-xl font-bold w-8 text-center" style={{ color: hex }}>{player.vp}</span>
                <button className="counter-btn" onClick={() => onAdjustVP(1)}><Plus size={12} /></button>
              </div>
            </div>
          )}

          {/* Strategy card assignment */}
          {canEdit && (
            <div className="flex flex-col gap-2">
              <span className="label">Strategy Card{playerCount <= 4 ? 's' : ''}</span>
              <div className="flex gap-2 flex-wrap">
                {STRATEGY_CARDS.map(card => {
                  const isSelected = player.strategyCard === card.id || player.strategyCard2 === card.id
                  const isTaken = usedCardIds.includes(card.id)
                  return (
                    <button
                      key={card.id}
                      disabled={isTaken && !isSelected}
                      className={`text-xs px-2 py-1 rounded border font-body transition-all ${
                        isSelected
                          ? 'border-gold text-gold bg-gold/10'
                          : isTaken
                          ? 'border-muted text-muted cursor-not-allowed opacity-40'
                          : 'border-muted text-dim hover:border-dim hover:text-text'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          // Deselect
                          if (player.strategyCard === card.id) onAssignStrategyCard(null, 1)
                          else onAssignStrategyCard(null, 2)
                        } else if (!player.strategyCard) {
                          onAssignStrategyCard(card.id, 1)
                        } else if (playerCount <= 4 && !player.strategyCard2) {
                          onAssignStrategyCard(card.id, 2)
                        } else {
                          onAssignStrategyCard(card.id, 1)
                        }
                      }}
                    >
                      {card.id}. {card.short}
                    </button>
                  )
                })}
              </div>
              {canEdit && (
                <button
                  className={`self-start text-xs px-3 py-1 rounded border transition-all ${
                    player.passed ? 'border-dim text-dim bg-muted/30' : 'border-muted text-dim hover:border-dim'
                  }`}
                  onClick={onTogglePassed}
                >
                  {player.passed ? '✓ Passed' : 'Mark Passed'}
                </button>
              )}
            </div>
          )}

          {/* Resources row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { field: 'commodities', label: 'Commodities' },
              { field: 'tradeGoods',  label: 'Trade Goods' },
              { field: 'secretObjectivesHeld', label: 'Secrets' },
            ].map(({ field, label }) => (
              <ResourceCounter
                key={field}
                label={label}
                value={player[field] || 0}
                canEdit={canEdit}
                onDelta={d => onAdjustCounter(field, d)}
              />
            ))}
          </div>

          {/* Command tokens */}
          <div className="flex flex-col gap-2">
            <span className="label">Command Tokens</span>
            <div className="grid grid-cols-3 gap-2">
              {['tactic', 'fleet', 'strategy'].map(pool => (
                <ResourceCounter
                  key={pool}
                  label={pool.charAt(0).toUpperCase() + pool.slice(1)}
                  value={player.commandTokens?.[pool] || 0}
                  canEdit={canEdit}
                  onDelta={d => onAdjustCommandToken(pool, d)}
                />
              ))}
            </div>
          </div>

          {/* Leaders */}
          <div className="flex flex-col gap-2">
            <span className="label">Leaders</span>
            <div className="grid grid-cols-3 gap-2">
              {['agent', 'commander', 'hero'].map(leader => {
                const status = player.leaders?.[leader] || 'locked'
                const nextStatus = LEADER_STATUSES[(LEADER_STATUSES.indexOf(status) + 1) % LEADER_STATUSES.length]
                return (
                  <button
                    key={leader}
                    disabled={!canEdit}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-xs font-body transition-colors ${LEADER_COLOURS[status]}`}
                    onClick={() => canEdit && onSetLeaderStatus(leader, nextStatus)}
                    title={canEdit ? `Click to set: ${nextStatus}` : status}
                  >
                    <span className="capitalize font-semibold">{leader}</span>
                    <span className="text-xs capitalize opacity-80">{status}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Breakthrough (TE) */}
          {gameState.expansions?.te && (
            <div className="flex items-center justify-between">
              <span className="label">Breakthrough</span>
              <div className={`text-xs font-body px-2 py-0.5 rounded border ${
                player.breakthrough ? 'text-plasma border-plasma/50 bg-plasma/10' : 'text-dim border-muted'
              }`}>
                {player.breakthrough ? '✓ Gained' : 'Not yet'}
              </div>
            </div>
          )}

          {/* Technologies */}
          {canEdit && (
            <div className="flex flex-col gap-2">
              <span className="label">Technologies</span>
              <div className="flex gap-1 border-b border-border pb-2">
                {['green', 'blue', 'red', 'yellow'].map(colour => (
                  <button
                    key={colour}
                    className={`flex-1 py-1 text-xs font-body rounded capitalize transition-colors ${
                      techTab === colour ? 'font-bold' : 'opacity-50 hover:opacity-75'
                    }`}
                    style={{ color: techTab === colour ? techColour(colour) : undefined }}
                    onClick={() => setTechTab(colour)}
                  >
                    {colour}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {(TECHNOLOGIES[techTab] || []).map(tech => {
                  const owned = player.technologies?.includes(tech)
                  return (
                    <button
                      key={tech}
                      className={`text-left text-xs font-body px-2 py-1.5 rounded border transition-colors ${
                        owned
                          ? 'border-opacity-50 bg-opacity-10'
                          : 'border-muted text-dim hover:border-dim hover:text-text'
                      }`}
                      style={owned ? {
                        borderColor: techColour(techTab) + '80',
                        backgroundColor: techColour(techTab) + '15',
                        color: techColour(techTab),
                      } : {}}
                      onClick={() => onToggleTechnology(tech)}
                    >
                      {owned ? '✓ ' : ''}{tech}
                    </button>
                  )
                })}
              </div>
              <div className="text-dim text-xs">
                Owned: {player.technologies?.length || 0} technologies
              </div>
            </div>
          )}

          {/* Promissory notes */}
          <PromissoryNotes player={player} canEdit={canEdit} />

        </div>
      )}
    </div>
  )
}

function ResourceCounter({ label, value, canEdit, onDelta }) {
  return (
    <div className="panel-inset p-2 flex flex-col items-center gap-1">
      <span className="label text-center leading-tight">{label}</span>
      <div className="flex items-center gap-1">
        {canEdit && (
          <button className="counter-btn w-5 h-5" onClick={() => onDelta(-1)}>
            <Minus size={10} />
          </button>
        )}
        <span className="font-display text-base font-bold text-gold w-6 text-center">{value}</span>
        {canEdit && (
          <button className="counter-btn w-5 h-5" onClick={() => onDelta(1)}>
            <Plus size={10} />
          </button>
        )}
      </div>
    </div>
  )
}

function PromissoryNotes({ player, canEdit }) {
  const [note, setNote] = useState('')
  const notes = player.promissoryNotes || []

  return (
    <div className="flex flex-col gap-2">
      <span className="label">Promissory Notes</span>
      {notes.length === 0 && <span className="text-dim text-xs">None held</span>}
      {notes.map((n, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
          <span className="font-body text-xs text-text flex-1">{n}</span>
        </div>
      ))}
    </div>
  )
}

function techColour(colour) {
  const map = { green: '#10b981', blue: '#3b82f6', red: '#ef4444', yellow: '#f59e0b' }
  return map[colour] || '#6b7280'
}
