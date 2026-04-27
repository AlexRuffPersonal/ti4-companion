# hook-useLeaders
**File:** `src/hooks/useLeaders.js`
**Status:** New
**Prereqs:** client-edgeFunctions, migration-033-leaders

## Functionality
```pseudocode
useLeaders({ currentPlayer, gameId })
  if !currentPlayer.faction → return all-null state

  useEffect([faction]):
    fetch leaders where faction=currentPlayer.faction
    setAgent(first where leader_type='agent')
    setCommander(first where leader_type='commander')
    setHero(first where leader_type='hero')

    fetch units where unit_type='mech' AND faction=currentPlayer.faction
    setFactionMech(first result)

  leaderStatus = currentPlayer.leaders ?? { agent:'unlocked', commander:'locked', hero:'locked' }

  return {
    agent, commander, hero, factionMech, leaderStatus,
    unlockCommander(abilityDefinitionId),   // calls unlockCommander(gameId, …)
    unlockHero(leaderId),                   // calls unlockHero(gameId, …)
    resolveLeaderAbility(abilityDefinitionId, leaderId, selections),
  }
```

## Tests
```pseudocode
mock supabase.from (leaders + units tables)
mock edgeFunctions (unlockCommander, unlockHero, resolveLeaderAbility)

it('returns null leaders when currentPlayer is null')
it('fetches agent, commander, hero, and mech for faction')
it('exposes leaderStatus from currentPlayer.leaders')
```
