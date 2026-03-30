import { useState } from 'react'
import { X, Scale, BookOpen, AlertTriangle } from 'lucide-react'
import { AGENDAS } from '../data/gameData'

export default function AgendaPhase({
  gameState,
  myPlayerId,
  isHost,
  canEdit,
  onClose,
  onDrawAgenda,
  onCastVote,
  onResolveAgenda,
  onRepealLaw,
}) {
  const [showLaws, setShowLaws] = useState(false)
  const { players, agendaDeck, currentAgendas, agendaVotes, laws, custodiansClaimed } = gameState

  if (!custodiansClaimed) {
    return (
      <Modal onClose={onClose} title="Agenda Phase">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Scale size={32} className="text-dim" />
          <p className="text-dim font-body text-sm">
            The Agenda Phase is locked until the Custodians Token is removed from Mecatol Rex.
          </p>
        </div>
      </Modal>
    )
  }

  const agendaCount = (currentAgendas || []).length

  return (
    <Modal onClose={onClose} title="Agenda Phase">
      <div className="flex flex-col gap-4">

        <div className="panel-inset px-3 py-2 flex items-center justify-between">
          <span className="label">Deck remaining</span>
          <span className="font-display text-sm text-gold">{agendaDeck?.length || 0} cards</span>
        </div>

        {agendaCount < 2 && isHost && (
          <button className="btn-primary py-3" onClick={onDrawAgenda}>
            Reveal Next Agenda ({agendaCount}/2 this round)
          </button>
        )}

        {/* BUG #7 FIX: pass the stable deck index (agendaDeckIndex) as the
            vote key rather than the position index in currentAgendas. This
            means vote keys never shift when other agendas are resolved. */}
        {(currentAgendas || []).map((agendaDeckIndex) => {
          const agenda = AGENDAS[agendaDeckIndex]
          if (!agenda) return null
          return (
            <AgendaCard
              key={agendaDeckIndex}
              agendaDeckIndex={agendaDeckIndex}
              agenda={agenda}
              players={players}
              agendaVotes={agendaVotes}
              myPlayerId={myPlayerId}
              isHost={isHost}
              canEdit={canEdit}
              onCastVote={(playerId, choice, votes) =>
                onCastVote(playerId, agendaDeckIndex, choice, votes)
              }
              onResolve={(outcome) =>
                onResolveAgenda(agendaDeckIndex, outcome, agenda.type === 'law')
              }
            />
          )
        })}

        <button
          className="w-full panel-inset px-3 py-2 flex items-center justify-between"
          onClick={() => setShowLaws(v => !v)}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={12} className="text-gold" />
            <span className="label">Laws in Play ({laws?.length || 0})</span>
          </div>
          <span className="text-dim text-xs">{showLaws ? '▲' : '▼'}</span>
        </button>

        {showLaws && (
          <div className="panel p-3 flex flex-col gap-2 animate-slide-up">
            {(!laws || laws.length === 0) && (
              <span className="text-dim text-xs">No laws currently in play.</span>
            )}
            {/* BUG #6 FIX: laws are stored as deck indices — look up name from AGENDAS */}
            {(laws || []).map((lawEntry, i) => {
              const name = typeof lawEntry === 'number'
                ? AGENDAS[lawEntry]?.name || `Law #${lawEntry}`
                : (typeof lawEntry === 'string' ? lawEntry : lawEntry?.name || '—')
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    <span className="font-body text-sm text-text">{name}</span>
                  </div>
                  {isHost && (
                    <button
                      className="text-danger text-xs hover:underline"
                      onClick={() => onRepealLaw(lawEntry)}
                    >
                      Repeal
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-start gap-2 panel-inset p-3">
          <AlertTriangle size={12} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-dim text-xs font-body">
            ⚠️ No official LRR for Thunder's Edge yet (Mar 2026). Complex agenda interactions may have unresolved edge cases.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function AgendaCard({
  agendaDeckIndex,
  agenda,
  players,
  agendaVotes,
  myPlayerId,
  isHost,
  canEdit,
  onCastVote,
  onResolve,
}) {
  const [myVotes, setMyVotes]   = useState(0)
  const [myChoice, setMyChoice] = useState(null)

  const isLaw   = agenda.type === 'law'
  const choices = agenda.outcome.includes('/')
    ? agenda.outcome.split(' / ')
    : [agenda.outcome]

  // BUG #7 FIX: vote keys are now `${agendaDeckIndex}-${playerId}` — stable
  // regardless of resolve order. Tally all votes for this agenda deck index.
  const tally = {}
  Object.entries(agendaVotes || {}).forEach(([key, v]) => {
    if (!key.startsWith(`${agendaDeckIndex}-`)) return
    tally[v.choice] = (tally[v.choice] || 0) + (v.votes || 0)
  })

  const myVoteKey     = `${agendaDeckIndex}-${myPlayerId}`
  const myCurrentVote = agendaVotes?.[myVoteKey]

  // Build a map of playerId → vote for per-player display
  const playerVoteMap = {}
  Object.entries(agendaVotes || {}).forEach(([key, v]) => {
    if (!key.startsWith(`${agendaDeckIndex}-`)) return
    // BUG #7 FIX: vote object now stores playerId explicitly
    const pid = v.playerId || key.replace(`${agendaDeckIndex}-`, '')
    playerVoteMap[pid] = v
  })

  return (
    <div className={`panel p-4 flex flex-col gap-3 ${isLaw ? 'border-gold/30' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-display px-1.5 py-0.5 rounded ${
              isLaw ? 'bg-gold/20 text-gold' : 'bg-plasma/20 text-plasma'
            }`}>
              {isLaw ? 'LAW' : 'DIRECTIVE'}
            </span>
            {isLaw && <span className="text-gold text-xs">Permanent if enacted</span>}
          </div>
          <h3 className="font-display text-sm font-bold text-bright mt-1">{agenda.name}</h3>
          <p className="text-dim text-xs font-body mt-0.5">{agenda.outcome}</p>
          {agenda.note && <p className="text-text text-xs font-body mt-1 italic">{agenda.note}</p>}
        </div>
      </div>

      {/* Vote totals */}
      <div className="flex flex-col gap-1">
        <span className="label">Vote Totals</span>
        <div className="flex gap-2 flex-wrap">
          {choices.map(choice => (
            <div key={choice} className="flex items-center gap-2 panel-inset px-2 py-1 rounded">
              <span className="font-body text-xs text-dim">{choice}:</span>
              <span className="font-display text-sm font-bold text-gold">{tally[choice] || 0}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 panel-inset px-2 py-1 rounded">
            <span className="font-body text-xs text-dim">Abstain:</span>
            <span className="font-display text-sm font-bold text-dim">
              {players.filter(p => playerVoteMap[p.id]?.choice === 'abstain').length}
            </span>
          </div>
        </div>
      </div>

      {/* BUG #7 FIX: per-player vote display now correctly uses playerVoteMap */}
      <div className="flex flex-col gap-1">
        <span className="label">Players</span>
        {players.map(p => {
          const pVote = playerVoteMap[p.id]
          return (
            <div key={p.id} className="flex items-center justify-between text-xs font-body">
              <span className={`text-text ${p.id === myPlayerId ? 'font-semibold' : ''}`}>
                {p.name}
              </span>
              {pVote
                ? <span className="text-gold">
                    {pVote.choice}
                    {pVote.votes > 0 ? ` (${pVote.votes})` : ''}
                  </span>
                : <span className="text-dim italic">not yet voted</span>
              }
            </div>
          )
        })}
      </div>

      {/* My vote input — only show if I haven't voted yet */}
      {canEdit(myPlayerId) && !myCurrentVote && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <span className="label">Cast Your Vote</span>
          <div className="flex gap-2 flex-wrap">
            {choices.map(choice => (
              <button
                key={choice}
                className={`text-xs px-3 py-1.5 rounded border font-body transition-colors ${
                  myChoice === choice
                    ? 'border-gold text-gold bg-gold/10'
                    : 'border-muted text-dim hover:border-dim'
                }`}
                onClick={() => setMyChoice(choice)}
              >
                {choice}
              </button>
            ))}
            <button
              className={`text-xs px-3 py-1.5 rounded border font-body transition-colors ${
                myChoice === 'abstain'
                  ? 'border-dim text-dim bg-muted/20'
                  : 'border-muted text-dim hover:border-dim'
              }`}
              onClick={() => setMyChoice('abstain')}
            >
              Abstain
            </button>
          </div>
          {myChoice && myChoice !== 'abstain' && (
            <div className="flex items-center gap-2">
              <span className="text-dim text-xs">Votes (influence):</span>
              <input
                type="number"
                min={0}
                max={99}
                className="input w-20 text-center"
                value={myVotes}
                onChange={e => setMyVotes(parseInt(e.target.value) || 0)}
              />
            </div>
          )}
          {myChoice && (
            <button
              className="btn-primary py-2 text-xs"
              onClick={() =>
                onCastVote(myPlayerId, myChoice, myChoice === 'abstain' ? 0 : myVotes)
              }
            >
              Confirm Vote
            </button>
          )}
        </div>
      )}

      {/* Resolve (host only) */}
      {isHost && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <span className="label">Resolve Agenda</span>
          <div className="flex gap-2 flex-wrap">
            {choices.map(choice => (
              <button
                key={choice}
                className="btn-primary text-xs py-1.5 px-3"
                onClick={() => onResolve(choice)}
              >
                Resolve: {choice}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void animate-slide-up">
      <div className="starfield" />
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-hull/80">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-plasma" />
          <span className="font-display text-sm text-bright tracking-wider">{title.toUpperCase()}</span>
        </div>
        <button className="text-dim hover:text-text transition-colors" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 pb-8">
        {children}
      </div>
    </div>
  )
}
