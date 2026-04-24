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
