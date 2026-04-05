# TI4 Companion App — Active Roadmaps

This project has two active development roadmaps. All new feature work should be tracked against one of them.

---

## [GAMEPLAY_ROADMAP.md](./GAMEPLAY_ROADMAP.md)

**Goal:** Enable playing Twilight Imperium 4th Edition in its entirety within the companion app — moving from a scorekeeper tool to a full game state machine.

Covers 12 phases:
- Phase 0: Data Model Extensions (game state schema, new reference data files)
- Phase 1: Planet Control & Exhaustion System
- Phase 2: Objective System (public Stage I/II + secret objectives)
- Phase 3: Action Card System (hand management, reference, timing)
- Phase 4: Unit & Fleet Roster (per-system fleet composition)
- Phase 5: Production System (build calculator, resource spending)
- Phase 6: Combat Tracker (space combat, ground combat, AFB, bombardment)
- Phase 7: Relic System — Prophecy of Kings
- Phase 8: Pre-Game Draft System (Milty, snake, random)
- Phase 9: Enhanced Agenda Phase (Elect types, riders, speaker tiebreak)
- Phase 10: Thunder's Edge Deep Features (full expedition, entropic scars, space stations)
- Phase 11: Promissory Note Tracking (full bidirectional)
- Phase 12: Statistics & Game History

---

## [FRONTEND_ROADMAP.md](./FRONTEND_ROADMAP.md)

**Goal:** Rebuild the frontend in Flutter/Dart to produce native iOS and Android apps, sharing the existing Supabase backend with the React web app.

Covers 9 phases:
- Phase 1: Project Setup & Core Architecture
- Phase 2: Data & Models (port all JS data files to Dart)
- Phase 3: State Management (port `useGameState.js` to Riverpod)
- Phase 4: Authentication & Setup Screens
- Phase 5: Dashboard & Player Rows
- Phase 6: Overlay Screens (Agenda, Trade Log, Rules)
- Phase 7: Map Builder (hex grid via CustomPainter)
- Phase 8: Mobile-Specific UX (haptics, notifications, tablet layout)
- Phase 9: New Gameplay Features (implement GAMEPLAY_ROADMAP phases Flutter-first)

---

## [POTENTIAL_FEATURES.md](./POTENTIAL_FEATURES.md)

The original 80-feature backlog, ranked by preference. These are enhancements and polish items — refer to this list when the roadmap phases above are complete or for quick wins between phases.
