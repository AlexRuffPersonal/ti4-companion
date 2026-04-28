# hook-useLegendaryCards

**File:** `src/hooks/useLegendaryCards.js`
**Status:** New
**Prereqs:** migration-037-legendary-planets, client-edgeFunctions

## Functionality

```pseudocode
export function useLegendaryCards(gameId, myPlayerId) {
  const [allCards, setAllCards] = useState([])

  // Initial fetch
  useEffect → select game_player_legendary_cards WHERE game_id=gameId

  // Realtime subscription
  channel = supabase.channel('legendary_cards')
    .on('postgres_changes', { table:'game_player_legendary_cards', filter:`game_id=eq.${gameId}` },
      payload → merge INSERT/UPDATE/DELETE into allCards)
    .subscribe()

  myCards = allCards.filter(c => c.player_id === myPlayerId)

  exhaustCard = (planetName) =>
    exhaustLegendaryCard(gameId, myPlayerId, planetName)

  return { allCards, myCards, exhaustCard }
}
```

## Tests

```pseudocode
STD_MOCKS

it('fetches and returns myCards filtered by playerId')
it('updates allCards on INSERT Realtime event')
it('updates status on UPDATE Realtime event')
it('removes card on DELETE Realtime event')
it('exhaustCard calls exhaustLegendaryCard with correct args')
```
