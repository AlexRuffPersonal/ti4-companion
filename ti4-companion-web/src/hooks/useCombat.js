import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  fireSpaceCannon as fireSpaceCannonFn,
  rollCombatDice as rollCombatDiceFn,
  rollGroundCombatDice as rollGroundCombatDiceFn,
  assignHits as assignHitsFn,
  declareRetreat as declareRetreatFn,
  fireAntiFighterBarrage as fireAntiFighterBarrageFn,
  advanceBarrage as advanceBarrageFn,
  fireBombardment as fireBombardmentFn,
  advanceBombardment as advanceBombardmentFn,
  commitGroundForces as commitGroundForcesFn,
  fireSpaceCannonDefense as fireSpaceCannonDefenseFn,
  playCombatActionCard as playCombatActionCardFn,
  passActionWindow as passActionWindowFn,
} from '../lib/edgeFunctions.js'

export function useCombat(gameId, combatId) {
  const [combat, setCombat] = useState(null)

  useEffect(() => {
    if (!gameId || !combatId) {
      setCombat(null)
      return
    }
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_combats')
        .select('*')
        .eq('id', combatId)
        .maybeSingle()
      if (mounted && data) setCombat(data)

      channel = supabase
        .channel(`combat:${combatId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_combats', filter: `id=eq.${combatId}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'UPDATE') setCombat(payload.new)
            if (payload.eventType === 'DELETE') setCombat(null)
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameId, combatId])

  return {
    combat,
    fireSpaceCannon: (pass) => fireSpaceCannonFn(gameId, combatId, pass),
    rollDice: () => rollCombatDiceFn(gameId, combatId),
    rollGroundDice: () => rollGroundCombatDiceFn(gameId, combatId),
    assignHits: (casualties) => assignHitsFn(gameId, combatId, casualties),
    declareRetreat: (destination) => declareRetreatFn(gameId, combatId, destination),
    // Phase 13: Anti-Fighter Barrage
    fireAntiFighterBarrage: () => fireAntiFighterBarrageFn(gameId, combat?.id),
    advanceBarrage: () => advanceBarrageFn(gameId, combat?.id),
    // Phase 14: Full Invasion
    fireBombardment: (systemKey, planetName) => fireBombardmentFn(gameId, systemKey, planetName),
    advanceBombardment: (systemKey) => advanceBombardmentFn(gameId, systemKey),
    commitGroundForces: (systemKey, planetName, troopCount) => commitGroundForcesFn(gameId, systemKey, planetName, troopCount),
    fireSpaceCannonDefense: () => fireSpaceCannonDefenseFn(gameId, combat?.id),
    // Phase 20: Action Windows
    playActionCard: (cardId, targets) => playCombatActionCardFn(gameId, combat?.id, cardId, targets),
    passActionWindow: () => passActionWindowFn(gameId, combat?.id),
    isWindowPhase: combat?.phase?.startsWith('window_') ?? false,
    windowPasses: combat?.window_passes ?? { attacker: false, defender: false },
  }
}