# hook-useExploration
**File:** `src/hooks/useExploration.js`
**Status:** New
**Prereqs:** client-edgeFunctions, migration-034-exploration

## Functionality
```pseudocode
useExploration({ currentPlayer, gameId, allPlanets, activePlayerId })
  if !currentPlayer → return all-null state

  // Subscribe to planet exploration state for all players (to show badges on galaxy map)
  useEffect([gameId]):
    fetch game_player_planets where game_id=gameId
    setAllPlanetState(rows)  // { player_id, planet_name, explored, attachments }

    channel = supabase.channel('exploration-planets')
      .on('postgres_changes', table:'game_player_planets', filter:`game_id=eq.${gameId}`)
      callback: re-fetch and update allPlanetState
    .subscribe()
    cleanup: removeChannel

  // Relic fragments in current player's hand
  useEffect([currentPlayer.id]):
    fetch game_exploration_decks where resolved_by_player_id=currentPlayer.id + state='held'
    setRelicFragments(rows)

    channel: subscribe to game_exploration_decks filtered by resolved_by_player_id

  // Relics in current player's hand
  useEffect([currentPlayer.id]):
    fetch game_relic_deck JOIN relics where held_by_player_id=currentPlayer.id
    setRelics(rows with relic metadata)

    channel: subscribe to game_relic_deck filtered by held_by_player_id

  // Derive unexplored planets for current player
  unexploredPlanets = allPlanetState
    .filter(p => p.player_id === currentPlayer.id && !p.explored && canExplore(p.planet_name))

  isActivePlayer = activePlayerId === currentPlayer.id

  return {
    unexploredPlanets,
    relicFragments,
    relics,
    allPlanetState,  // for GalaxyTab badge rendering
    isActivePlayer,
    explorePlanet: (planetName, deckType) => explorePlanet(gameId, currentPlayer.id, planetName, deckType),
    resolveExplorationCard: (cardId, opts) => resolveExplorationCard(gameId, currentPlayer.id, cardId, opts),
    exploreFrontier: (systemKey) => exploreFrontier(gameId, currentPlayer.id, systemKey),
    useRelicFragment: (fragmentIds) => useRelicFragment(gameId, currentPlayer.id, fragmentIds),
    useRelic: (relicId, choice) => useRelic(gameId, currentPlayer.id, relicId, choice),
  }

// canExplore(planetName): returns false for Mecatol Rex, home system planets (no traits)
```

## Tests
```pseudocode
mock supabase.from (game_player_planets, game_exploration_decks, game_relic_deck)
mock edgeFunctions

it('returns empty unexploredPlanets when all planets explored')
it('filters out Mecatol Rex from unexploredPlanets')
it('returns relic fragments for current player')
it('returns relics with metadata for current player')
it('exposes explorePlanet dispatcher')
it('isActivePlayer true when activePlayerId matches currentPlayer.id')
```
