import { useState } from 'react'
import StrategyCardPanel from './StrategyCardPanel.jsx'
import LeaderPanel from './LeaderPanel.jsx'
import ExplorationModal from './ExplorationModal.jsx'
import RelicFragmentPanel from './RelicFragmentPanel.jsx'
import RelicPanel from './RelicPanel.jsx'
import LegendaryCardPanel from './LegendaryCardPanel.jsx'

export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
  onOpenActionCards, onViewTech,
  factionAbilities = [],
  triggerableAbilityIds = new Set(),
  unlockableCommanderAbility = null,
  onPlayAbility,
  onUnlockCommander,
  onOpenSecrets,
  secretCount = 0,
  onOpenNotes, noteCount = 0, onOpenTrade,
  allPlayers = [],
  activePay = null,
  onPlayPrimary = () => {},
  planetStaticMap = {},
  leaders,
  exploration,
  legendaryCards,
}) {
  const tokens = player?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
  const [draftTokens, setDraftTokens] = useState(tokens)
  const [exploringPlanet, setExploringPlanet] = useState(null)
  const isStatusPhase = game?.phase === 'status'

  if (!player) return null

  return (
    <div className="panel flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="label">MY PANEL</p>
        {isActive && (
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={onPass}>PASS</button>
            <button className="btn-primary text-xs" onClick={onEndTurn}>END TURN</button>
          </div>
        )}
      </div>

      {/* Command Tokens — values rendered as read-only inputs so they don't
          collide with commodity/trade-goods text queries in tests */}
      <div className="flex gap-6">
        {[
          { key: 'tactic_total', label: 'TACTIC' },
          { key: 'fleet',        label: 'FLEET' },
          { key: 'strategy',     label: 'STRATEGY' },
        ].map(({ key, label }) => (
          <div key={key} className="text-center">
            <p className="label text-xs">{label}</p>
            {isStatusPhase ? (
              <div className="flex items-center gap-1">
                <button
                  className="counter-btn"
                  onClick={() => setDraftTokens(t => ({ ...t, [key]: Math.max(0, t[key] - 1) }))}
                >−</button>
                <input
                  type="text"
                  readOnly
                  value={draftTokens[key]}
                  aria-label={`${label.toLowerCase()} tokens`}
                  className="font-display text-bright text-lg w-6 text-center bg-transparent border-none outline-none"
                />
                <button
                  className="counter-btn"
                  onClick={() => setDraftTokens(t => ({ ...t, [key]: t[key] + 1 }))}
                >+</button>
              </div>
            ) : (
              <input
                type="text"
                readOnly
                value={tokens[key]}
                aria-label={`${label.toLowerCase()} tokens`}
                className="font-display text-bright text-lg w-8 text-center bg-transparent border-none outline-none"
              />
            )}
          </div>
        ))}

        <div className="border-l border-border pl-6 flex gap-6">
          <div className="text-center">
            <p className="label text-xs">COMMOD.</p>
            <div className="flex items-center gap-1">
              <button className="counter-btn" onClick={() => onUpdateCommodities(Math.max(0, player.commodities - 1))}>−</button>
              <span className="font-display text-bright text-lg">{player.commodities}</span>
              <button className="counter-btn" onClick={() => onUpdateCommodities(player.commodities + 1)}>+</button>
            </div>
          </div>
          <div className="text-center">
            <p className="label text-xs">TRADE</p>
            <div className="flex items-center gap-1">
              <button className="counter-btn" onClick={() => onUpdateTradeGoods(Math.max(0, player.trade_goods - 1))}>−</button>
              <span className="font-display text-bright text-lg">{player.trade_goods}</span>
              <button className="counter-btn" onClick={() => onUpdateTradeGoods(player.trade_goods + 1)}>+</button>
            </div>
          </div>
        </div>
      </div>

      {isStatusPhase && (
        <div className="flex justify-end">
          <button
            className="btn-primary text-xs"
            onClick={() => onUpdateTokens(draftTokens)}
          >
            CONFIRM TOKENS
          </button>
        </div>
      )}

      {/* Strategy Card */}
      <StrategyCardPanel
        player={player}
        game={game}
        allPlayers={allPlayers}
        activePay={activePay}
        isActive={isActive}
        onPickStrategyCard={onPickStrategyCard}
        onPlayPrimary={onPlayPrimary}
      />

      {leaders && (
        <LeaderPanel
          agent={leaders.agent}
          commander={leaders.commander}
          hero={leaders.hero}
          factionMech={leaders.factionMech}
          leaderStatus={leaders.leaderStatus}
          onUnlock={(leader) =>
            leader.leader_type === 'commander'
              ? leaders.unlockCommander(leader.id)
              : leaders.unlockHero(leader.id)
          }
          onUseAbility={(leader) => leaders.resolveLeaderAbility(leader.ability_definition_id, leader.id, {})}
        />
      )}

      {exploration?.unexploredPlanets?.length > 0 && (
        <div>
          <p className="label text-xs mb-2">EXPLORE PLANETS</p>
          <div className="flex flex-col gap-1">
            {exploration.unexploredPlanets.map(planet => (
              <div key={planet.id} className="flex items-center justify-between text-sm">
                <span className="text-text">{planet.planet_name}</span>
                <button
                  className="btn-primary text-xs"
                  onClick={() => setExploringPlanet(planet)}
                >
                  EXPLORE
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <RelicFragmentPanel
        relicFragments={exploration?.relicFragments}
        isActivePlayer={exploration?.isActivePlayer}
        onUseRelicFragment={exploration?.useRelicFragment}
      />

      <RelicPanel
        relics={exploration?.relics}
        isActivePlayer={exploration?.isActivePlayer}
        onUseRelic={exploration?.useRelic}
      />

      {legendaryCards?.myCards?.length > 0 && (
        <LegendaryCardPanel
          myCards={legendaryCards.myCards}
          onExhaustCard={legendaryCards.exhaustCard}
        />
      )}

      {exploringPlanet && exploration && (
        <ExplorationModal
          planet={exploringPlanet}
          traits={planetStaticMap[exploringPlanet.planet_name]?.traits ?? []}
          isFrontier={false}
          onExplorePlanet={exploration.explorePlanet}
          onResolveCard={exploration.resolveExplorationCard}
          onExploreFrontier={exploration.exploreFrontier}
          onClose={() => setExploringPlanet(null)}
        />
      )}

      {/* Planets */}
      {planets.length > 0 && (
        <div>
          <p className="label text-xs mb-2">PLANETS</p>
          <div className="flex flex-col gap-1">
            {planets.map(planet => {
              const staticInfo = planetStaticMap[planet.planet_name]
              return (
                <div key={planet.id} className="flex items-center justify-between text-sm gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={planet.exhausted ? 'text-dim line-through' : 'text-text'}>
                      {planet.planet_name}
                    </span>
                    {staticInfo && (
                      <>
                        <span className="text-muted text-xs shrink-0">
                          {staticInfo.resources}/{staticInfo.influence}
                        </span>
                        {staticInfo.tech_specialty &&
                          <span className={`text-xs px-1 rounded font-mono tech-chip-${staticInfo.tech_specialty}`}>
                            {staticInfo.tech_specialty[0].toUpperCase()}
                          </span>
                        }
                        {staticInfo.traits.map(t => (
                          <span key={t} className="text-dim text-xs font-body uppercase shrink-0">{t}</span>
                        ))}
                      </>
                    )}
                  </div>
                  <button
                    className="label text-xs hover:text-text shrink-0"
                    onClick={() => planet.exhausted ? onReadyPlanet(planet.planet_name) : onExhaustPlanet(planet.planet_name)}
                  >
                    {planet.exhausted ? 'READY' : 'EXHAUST'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Technologies */}
      <div className="flex items-center justify-between">
        <p className="label text-xs">
          TECHNOLOGIES ({player.technologies?.length ?? 0})
        </p>
        <button className="btn-ghost text-xs" onClick={onViewTech}>
          VIEW TREE
        </button>
      </div>

      {/* Action Cards */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenActionCards}>
        ACTION CARDS ({player.action_card_count ?? 0})
      </button>

      {/* Secret Objectives */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenSecrets}>
        SECRETS ({secretCount})
      </button>

      {/* Promissory Notes */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenNotes}>
        PROMISSORY NOTES ({noteCount})
      </button>

      {/* Trade */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenTrade}>
        TRADE
      </button>

      {/* Faction Abilities */}
      {factionAbilities.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="label text-xs">FACTION ABILITIES</p>
          {factionAbilities.map(ability => {
            const isActionTimed = ability.trigger?.event === 'PLAYER_ACTION'
            const isPlayable = triggerableAbilityIds.has(ability.id)
            return isActionTimed ? (
              <button
                key={ability.id}
                className={isPlayable ? 'btn-primary text-xs self-start' : 'btn-ghost text-xs self-start opacity-50'}
                disabled={!isPlayable}
                onClick={() => isPlayable && onPlayAbility?.(ability)}
              >
                {ability.ability_name.toUpperCase()}
              </button>
            ) : (
              <p key={ability.id} className="text-dim text-xs font-body">
                <span className="text-muted">{ability.ability_name}:</span> passive
              </p>
            )
          })}
        </div>
      )}

      {/* Commander unlock */}
      {unlockableCommanderAbility && (
        <div className="panel-inset flex items-center justify-between gap-3">
          <p className="text-gold text-xs font-body">
            Commander unlockable: {unlockableCommanderAbility.ability_name}
          </p>
          <button className="btn-primary text-xs" onClick={() => onUnlockCommander?.(unlockableCommanderAbility)}>
            UNLOCK
          </button>
        </div>
      )}
    </div>
  )
}
