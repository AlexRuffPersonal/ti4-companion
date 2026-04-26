# Potential To-Do List

Features and improvements that were deliberately deferred. Review this list when planning future phases.

---

## Action Cards (Phase 4b)

- **Harden concurrent draw race** — `game-draw-action-card` reads the top deck card then updates it in two separate queries (no transaction). Under concurrent draws two players could draw the same card. Fix: wrap in a Postgres function/transaction or use `FOR UPDATE SKIP LOCKED`.

---

## game-start (Phase 4a)

- **N+1 query in player initialisation loop** — `game-start` issues 2–3 DB round-trips per player when initialising starting techs and home planets (faction lookup + tile lookup + planet insert). With 8 players this is up to 24 sequential calls. Fix: batch faction names with `.in()`, bulk-fetch tiles, and do a single insert for all players' planets.

---

## Promissory Notes (Phase 8) — HIGH PRIORITY

- **Automated note effect resolution** — `game-play-promissory-note` currently only transitions state (held → played/discarded) without applying the note's game effect. A future phase should encode each note's effect (gain resources, cancel votes, adjust VP, etc.) and apply it mechanically, similar to how `game-resolve-ability` handles faction abilities. Each note type needs a structured effect definition and an execution branch in the Edge Function.

---

## Agenda Phase (Phase 7) — resolved in Phase 9

- **Custodians gate** — implemented in Phase 9 via `game-land-troops`: landing troops on Mecatol Rex (system_key "0,0") sets `custodians_claimed=true`, `agenda_unlocked=true`, and awards 1 VP. `game-advance-phase` is patched to automatically advance to the agenda phase after the status phase when `agenda_unlocked=true`. The manual "Begin Agenda Phase" button is removed from `HostControlsSection`.

---

## Space Combat (Phase 10)

- **Trade not firing Space Cannon** — diplomatic deal / promissory note to pre-agree not to fire Space Cannon
- **Per-unit hit tracking in dice rolls** — store which unit generated each hit; prerequisite for Direct Hit action card
- **Direct Hit action card** — cancel Sustain Damage during hit assignment; requires per-unit hit tracking
- **Maneuvering Jets action card** — cancel one incoming hit during assignment
- **Dark Energy Tap technology** — +1 movement extending valid retreat range to 2 hops instead of 1
- **Skilled Retreat action card** — retreat to an enemy-free adjacent system; combat ends in a draw; CC placed from reinforcements (same CC rule as normal retreat, different destination validation and outcome)

---

## Map Configuration (Phase 9+)

- **Map builder in lobby** — Phase 9 hardcodes a standard 37-tile map. A future phase should let the host configure the map during lobby setup. Two options: (1) a drag-and-drop hex tile placement UI, or (2) paste a standard Milty/TI4 map string (space-separated tile numbers in spiral order) that gets parsed into `games.map_tiles` JSONB keyed by axial `"q,r"` coordinates. Option 2 is simpler and interops with existing TI4 map tools.

---

## Admin UI

- **Read views for reference tables** — browse imported records per table (tiles, factions, agendas, etc.) with search/filter
- **Individual record editing** — edit a single record without re-importing the whole table
- **Selective re-import** — import only new/changed records (upsert) rather than full table replacement

---

## Ground Combat (Phase 11)

- **Bombardment** — ships with a `bombardment` stat can fire on defending ground forces before the active player lands troops; not yet implemented; requires `bombardment` stat in the `units` reference table and a new step in `game-land-troops` (or a dedicated `game-bombard` Edge Function) that fires dice and destroys defending infantry/mechs before spawning ground combat
- **Planetary Shield** — faction ability that blocks incoming bombardment; depends on bombardment being implemented; `game-land-troops` / `game-bombard` must check whether the target planet contains a unit whose faction sheet lists Planetary Shield
- **Wormhole-connected bombardment** — allows ships in adjacent wormhole systems to bombard a planet; most complex bombardment variant; requires adjacency checks using wormhole connections on top of basic bombardment

---

## Ability DSL (Phase 5b)

The following ops are defined in `supabase/functions/_shared/abilityDsl.ts` but are no-ops pending their dependent game systems:

- **`modify_roll` / `add_die`** — modify or add dice to combat rolls; requires hooking into `game-roll-combat-dice` / `game-roll-ground-combat-dice` at roll time
- **`cancel_hit`** — cancel one or more incoming hits during hit assignment; requires hooking into `game-assign-hits` / `game-assign-ground-hits`
- **`cast_votes` / `prevent_vote`** — cast or block votes during agenda phase; requires integration with `game-cast-votes`
- **`place_units` / `destroy_units`** — place or destroy units on the map outside of normal production; requires unit placement/removal logic independent of the production flow
- **`explore_planet`** — trigger a planet exploration draw; requires the exploration deck system
- **`convert_commodities`** — convert a player's own commodities to trade goods via an ability; bookkeeping only but needs an Edge Function call
- **`gain_command_tokens`** — grant command tokens to a player; requires `game-update-command-tokens` call
- **`ignore_prerequisite`** — waive one technology prerequisite for the current research action; requires intercepting `game-research-technology` prerequisite check
- **`take_from_discard`** — retrieve a card from a discard pile; requires discard pile queries for action/agenda/other decks
- **`gain_technology`** — grant a technology card directly; similar to `game-research-technology` but without the prerequisite/cost check

---

## Rule Lookup

- **In-app rules reference** — searchable lookup of the TI4 Living Rules Reference (LRR) glossary; players can type a keyword (e.g. "bombardment", "sustain damage") and see the relevant rules text inline without leaving the app; could use the `ti4-lrr.md` document as the data source with client-side fuzzy search
