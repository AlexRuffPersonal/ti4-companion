# Potential To-Do List

Features and improvements that were deliberately deferred. Review this list when planning future phases.

---

## Action Cards (Phase 4b)

- **Harden concurrent draw race** — `game-draw-action-card` reads the top deck card then updates it in two separate queries (no transaction). Under concurrent draws two players could draw the same card. Fix: wrap in a Postgres function/transaction or use `FOR UPDATE SKIP LOCKED`.

---

## game-start (Phase 4a)

- **N+1 query in player initialisation loop** — `game-start` issues 2–3 DB round-trips per player when initialising starting techs and home planets (faction lookup + tile lookup + planet insert). With 8 players this is up to 24 sequential calls. Fix: batch faction names with `.in()`, bulk-fetch tiles, and do a single insert for all players' planets.

---

## Admin UI

- **Read views for reference tables** — browse imported records per table (tiles, factions, agendas, etc.) with search/filter
- **Individual record editing** — edit a single record without re-importing the whole table
- **Selective re-import** — import only new/changed records (upsert) rather than full table replacement
