# shared-abilityDsl-p42
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** shared-abilityDsl, shared-relicEffects-p42

## Functionality
```pseudocode
// 1. Add gainedRelicName?: string to ResolveContext interface.

// 2. gain_relic op: after assigning relic to player, fetch relic name via JOIN
//    and set context.gainedRelicName = relicName.

// 3. take_from_discard op (updated):
//    card_ids = selections.card_ids as string[] ?? [selections.card_id]
//    for each id in card_ids (up to op.count):
//      validate state='discard' for this game
//      update state='held', held_by_player_id=activatingPlayerId, deck_position=null
//    update action_card_count += card_ids.length

// 4. explore_planet op (stub → real):
//    planetName = selections.planet_name; deckType = selections.deck_type
//    validate player controls planet (game_player_planets)
//    draw top card from game_exploration_decks WHERE deck_type=deckType AND state='deck'
//    mark card state='resolved', resolved_by_player_id=activatingPlayerId
//    apply EXPLORATION_EFFECTS[card.name] via interpretEffects
//    set context.drawnExplorationCard = card (for response)
```

## Tests
```pseudocode
// take_from_discard:
it('takes multiple cards by card_ids array, increments count by array length')
it('falls back to single card_id when card_ids absent')
it('409 if any card_id not in discard for this game')

// explore_planet:
it('409 if planet_name missing from selections')
it('409 if player does not control planet')
it('409 if exploration deck empty')
it('draws top card, marks resolved, applies effects')
```
