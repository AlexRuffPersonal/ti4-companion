import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  unlockCommander as unlockCommanderFn,
  resolveAbility as resolveAbilityFn,
} from '../lib/edgeFunctions.js'

export function useLeaders({ currentPlayer, gameId }) {
  const [agent, setAgent] = useState(null)
  const [commander, setCommander] = useState(null)
  const [hero, setHero] = useState(null)
  const [factionMech, setFactionMech] = useState(null)

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

  return {
    agent,
    commander,
    hero,
    factionMech,
    leaderStatus,
    unlockCommander: (abilityDefinitionId) => unlockCommanderFn(gameId, abilityDefinitionId),
    unlockHero: (leaderId) => resolveAbilityFn(gameId, null, 'leader', leaderId, { unlock: true }),
    resolveLeaderAbility: (abilityDefinitionId, leaderId, selections) =>
      resolveAbilityFn(gameId, abilityDefinitionId, 'leader', leaderId, selections),
  }
}
