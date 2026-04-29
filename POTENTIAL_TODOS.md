# Potential To-Do List

Features and improvements that were deliberately deferred. Review this list when planning future phases.

---

## Space Combat

- **Trade not firing Space Cannon** — diplomatic deal / promissory note to pre-agree not to fire Space Cannon; no mechanical enforcement, but could be surfaced as a UI acknowledgement step
- **Dark Energy Tap technology** — ships can retreat into adjacent systems without owning units/planets there; also explores a frontier token after a tactical action in a system containing one. Requires the movement system (Phase 18). Covered in Phase 30 spec as a note on `game-move-ships`.

---

## Map Configuration

- **In-app map draft** — The TI4 rules include a structured tile-drafting process where players take turns picking system tiles and placing them on the map during setup. A future phase could implement this as an interactive lobby mode: tiles are presented face-down in balanced sets, players draft picks in turn order, and the result populates `games.map_tiles`. This is a significant UI undertaking and requires the map builder (Phase 22) as a prerequisite.

---

## Admin UI

- **Selective re-import** — import only new/changed records (upsert) rather than full table replacement

---

## Titans of Ul / Codex III (TE expansion — deferred)

- **TE legendary planets** — Ang and Elysium were omitted from Phase 21 (PoK-only scope). A future phase should add their legendary planet ability cards, grant/exhaust/purge mechanics, and any DSL ops needed for their effects.
