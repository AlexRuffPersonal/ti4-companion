import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  unlockCommander as unlockCommanderFn,
  resolveAbility as resolveAbilityFn,
  deployMech as deployMechFn,
  resolveMechAbility as resolveMechAbilityFn,
  resolveCommanderReroll as resolveCommanderRerollFn,
} from '../lib/edgeFunctions.js'

export function useLeaders({ currentPlayer, gameId }) {
  const [agent, setAgent] = useState(null)
  const [commander, setCommander] = useState(null)
  const [hero, setHero] = useState(null)
  const [factionMech, setFactionMech] = useState(null)
  const [leaderModalOpen, setLeaderModalOpen] = useState(false)
  const [activeLeader, setActiveLeader] = useState(null)
  const [commanderRerollModalOpen, setCommanderRerollModalOpen] = useState(false)
  const [commanderRerollWindow, setCommanderRerollWindow] = useState(null)

  const faction = currentPlayer?.faction

  useEffect(() => {
    if (!faction) return
    let mounted = true

    async function load() {
      const { data: leaders } = await supabase
        .from('leaders')
        .select('*')
        .eq('faction', faction)
      if (!mounted) return
      setAgent((leaders ?? []).find(l => l.leader_type === 'agent') ?? null)
      setCommander((leaders ?? []).find(l => l.leader_type === 'commander') ?? null)
      setHero((leaders ?? []).find(l => l.leader_type === 'hero') ?? null)

      const { data: mechs } = await supabase
        .from('units')
        .select('*')
        .eq('unit_type', 'mech')
        .eq('faction', faction)
      if (!mounted) return
      setFactionMech((mechs ?? [])[0] ?? null)
    }

    load()
    return () => { mounted = false }
  }, [faction])

  const leaderStatus = currentPlayer?.leaders ?? { agent: 'unlocked', commander: 'locked', hero: 'locked' }

  function handleUseAbility(leader) {
    setActiveLeader(leader)
    setLeaderModalOpen(true)
  }

  function handleConfirm(selections) {
    setLeaderModalOpen(false)
    if (activeLeader) {
      resolveAbilityFn(gameId, activeLeader.abilityDefinitionId, 'leader', activeLeader.id, selections)
    }
  }

  function handleReactiveAgentWindow(window) {
    const eligible = (window.eligible ?? []).find(e => e.player_id === currentPlayer?.id)
    if (eligible) {
      setActiveLeader({ ...agent, leaderType: 'agent', isReactive: true, windowContext: window.context })
      setLeaderModalOpen(true)
    }
  }

  function handleCommanderPassiveWindow(window) {
    if (window.type === 'commander_reroll') {
      setCommanderRerollWindow(window)
      setCommanderRerollModalOpen(true)
    }
  }

  function handleCommanderRerollConfirm(rerollIndices) {
    resolveCommanderRerollFn(gameId, commanderRerollWindow?.combat_id, rerollIndices)
    setCommanderRerollModalOpen(false)
    setCommanderRerollWindow(null)
  }

  return {
    agent,
    commander,
    hero,
    factionMech,
    leaderStatus,
    leaderModalOpen,
    activeLeader,
    commanderRerollModalOpen,
    commanderRerollWindow,
    handleUseAbility,
    handleConfirm,
    handleReactiveAgentWindow,
    handleCommanderPassiveWindow,
    handleCommanderRerollConfirm,
    unlockCommander: (leaderId) => unlockCommanderFn(gameId, leaderId),
    unlockHero: (leaderId) => resolveAbilityFn(gameId, null, 'leader', leaderId, { unlock: true }),
    resolveLeaderAbility: (abilityDefinitionId, leaderId, selections) =>
      resolveAbilityFn(gameId, abilityDefinitionId, 'leader', leaderId, selections),
    deployMech: (unitId, systemKey, targetPlanetName, replacingInfantry) =>
      deployMechFn(gameId, unitId, systemKey, targetPlanetName, replacingInfantry),
    resolveMechAbility: (unitId, selections) =>
      resolveMechAbilityFn(gameId, unitId, selections),
  }
}
