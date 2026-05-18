# fn-game-resolve-agenda-p40
**File:** `supabase/functions/game-resolve-agenda/index.ts`
**Status:** Modify
**Prereqs:** migration-049-law-enforcement

## Functionality
- When inserting into game_laws, also set elected_planet_name:
  - If agenda.elect_type === 'planet': elected_planet_name = electedTarget (the planet name)
  - If agenda.elect_type === 'player': elected_planet_name = null
- For award_vp on planet-elect laws (elect_type === 'planet'):
  - Find the player who controls the elected planet via game_player_planets WHERE planet_name = electedTarget
  - Award VP to that player (not to electedTarget directly, which would fail as a player-ID lookup)

## Tests
- Planet-elect law enacted: elected_planet_name = elected planet name in game_laws row
- Player-elect law enacted: elected_planet_name = null
- award_vp for planet-elect law: VP awarded to the player controlling the elected planet
