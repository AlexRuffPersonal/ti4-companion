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

## Cards: Visualized But Not Implemented (effects not enforced)

These card types are displayed in the UI (players can see card text) but the app does not programmatically enforce or apply their game effects.

- **Agenda Cards (50 cards)** — agenda text is displayed during the agenda phase and votes are cast, but the `resolve_agenda` edge function only handles a small set of known agenda effects via the ability DSL. Many agendas (especially laws that persist round-over-round, e.g. "Holy Planet of Ixth", "Regulated Conscription") have no mechanical enforcement.
- **General Promissory Notes (5 types)** — Trade Convoys, Ceasefire, Warrants, Political Favor, Spark a Rebellion are shown in hand but their effects are not enforced. `game-play-promissory-note` routes to the ability DSL but these general notes have no DSL ops defined.
- **Faction Promissory Notes (~23 cards)** — faction-specific notes (e.g. "The Gift of Prescience", "Research Agreement", "Acquiescence") are shown but have no DSL effect implementations.

---

## Cards: Neither Implemented Nor Visualized

These card types have no implementation and do not appear anywhere in the UI.

- **Mech Unit Cards (25, PoK — one per faction)** — each faction's mech has a unique unit card with a unique ability. No mech card display, no mech-specific ability enforcement, and no mech deployment UI beyond generic ground force placement. Phase 16 (Leaders & Mechs) added the mech unit type to the DB but did not implement faction mech card text or abilities.
- **Exploration Cards (~36 unique types across 4 decks)** — the exploration flow (Phase 17) draws a card and shows `card_name` + `card_text`, but the individual card resolution effects (e.g. "Freelancers" — place 1 fighter; "Mercenary Outfit" — gain 3 trade goods; "Tomb of Emphidia" — gain Crown of Emphidia relic) are handled generically by `shared-explorationEffects`. Any card whose effect requires an interactive choice or is a unique named card (e.g. "Paradise World", "Dyson Sphere", "Gamma Wormhole") may not be fully handled. Full validation needed per card.
- **Relic Cards (16, PoK)** — RelicPanel shows relic name, text, and exhausted state, but `game-use-relic` routes to `shared-relicEffects` which may not implement all 16 relics' unique effects. Cards with complex effects (e.g. "The Prophet's Tears" — look at top 3 cards; "The Crown of Emphidia" — conditional at status phase; "Stellar Converter" — destroy a planet) require bespoke DSL ops.
- **Leader Cards (~75, PoK — 3 per faction)** — LeaderPanel and LeaderCard display leader name and status (unlocked/exhausted/purged) but leader abilities are not enforced. Agent, Commander, and Hero abilities (which span action windows, passive effects, and once-per-game hero abilities) have no DSL implementations. This is a very large feature scope.

---

## Icons / Sprites

- **Integrate generated SVG icons** — `ti4-companion-web/public/icons/` contains SVG icons organized by category:
  - `units/` — carrier, cruiser, destroyer, dreadnought, fighter, flagship, infantry, mech, pds, space-dock, war-sun
  - `tech/` — biotic, cybernetic, propulsion, warfare *(new)*
  - `tokens/` — fleet, strategy, tactic *(new)*
  - `planet/` — influence, resource *(new)*
  - `status/` — exhausted, ready, damaged, purged *(damaged & purged new)*
  - `leaders/` — agent, commander, hero
  - `phases/` — action-phase, agenda-phase, status-phase, strategy-phase
  - `economy/` — commodity, trade-good, victory-point
  - `dice/` — d10

  None are referenced in the app yet. Priority integration points: unit icons on hex tiles and unit lists (Phase 34/35 map overlays), tech-type colour chips on TechCard, token icons on the command-token display, planet resource/influence icons on PlanetCard, and leader-type icons on LeaderCard.

---

