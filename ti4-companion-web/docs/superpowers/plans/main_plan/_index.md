# Remaining Feature Specs — Index

Status: `done` | `in-progress` | `planned` | `deferred`

See [_standards.md](_standards.md) for shorthand used in all spec files.

---

## All Spec Files

| Spec File | Actual File | Phase | Feature Area | Status | Depends On |
|-----------|-------------|-------|-------------|--------|-----------|
| [migration-028-ground-combat](migration-028-ground-combat.md) | `supabase/migrations/028_ground_combat.sql` | 11 | Ground Combat | in-progress | — |
| [fn-game-roll-ground-combat-dice](fn-game-roll-ground-combat-dice.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 11 | Ground Combat | in-progress | migration-028 |
| [fn-game-assign-ground-hits](fn-game-assign-ground-hits.md) | ~~`supabase/functions/game-assign-ground-hits/index.ts`~~ | 11 | Ground Combat | deferred | Superseded by fn-game-assign-hits |
| [migration-029-strategy-production](migration-029-strategy-production.md) | `supabase/migrations/029_strategy_production.sql` | 12 | Strategy Cards & Production | planned | — |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 12 | Strategy Cards & Production | planned | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 12 | Strategy Cards & Production | planned | shared-abilityDsl |
| [fn-game-play-strategy-card](fn-game-play-strategy-card.md) | `supabase/functions/game-play-strategy-card/index.ts` | 12 | Strategy Cards & Production | planned | migration-029-strategy-production, fn-game-resolve-ability |
| [fn-game-use-strategy-secondary](fn-game-use-strategy-secondary.md) | `supabase/functions/game-use-strategy-secondary/index.ts` | 12 | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [fn-game-pass-strategy-secondary](fn-game-pass-strategy-secondary.md) | `supabase/functions/game-pass-strategy-secondary/index.ts` | 12 | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [fn-game-produce-units](fn-game-produce-units.md) | `supabase/functions/game-produce-units/index.ts` | 12 | Strategy Cards & Production | planned | migration-029-strategy-production |
| [fn-game-end-turn](fn-game-end-turn.md) | `supabase/functions/game-end-turn/index.ts` | 12 | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [hook-useStrategyCards](hook-useStrategyCards.md) | `src/hooks/useStrategyCards.js` | 12 | Strategy Cards & Production | planned | client-edgeFunctions |
| [component-StrategyCardPanel](component-StrategyCardPanel.md) | `src/components/game/StrategyCardPanel.jsx` | 12 | Strategy Cards & Production | planned | hook-useStrategyCards |
| [component-StrategyCardModal](component-StrategyCardModal.md) | `src/components/game/StrategyCardModal.jsx` | 12 | Strategy Cards & Production | planned | hook-useStrategyCards |
| [component-ProductionModal](component-ProductionModal.md) | `src/components/game/ProductionModal.jsx` | 12 | Strategy Cards & Production | planned | client-edgeFunctions |
| [component-SystemActionModal](component-SystemActionModal.md) | `src/components/game/SystemActionModal.jsx` | 12 | Strategy Cards & Production | planned | component-ProductionModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 12 | Strategy Cards & Production | planned | component-StrategyCardPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 12 | Strategy Cards & Production | planned | hook-useStrategyCards, component-StrategyCardModal |
| [migration-030-afb](migration-030-afb.md) | `supabase/migrations/030_afb.sql` | 13 | Anti-Fighter Barrage | planned | — |
| [fn-game-fire-space-cannon](fn-game-fire-space-cannon.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 13 | Anti-Fighter Barrage | planned | migration-030-afb |
| [fn-game-roll-combat-dice](fn-game-roll-combat-dice.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 13 | Anti-Fighter Barrage | planned | fn-game-fire-anti-fighter-barrage |
| [fn-game-fire-anti-fighter-barrage](fn-game-fire-anti-fighter-barrage.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 13 / 14 | AFB / Full Invasion | planned | migration-030-afb, migration-031-invasion |
| [fn-game-advance-barrage](fn-game-advance-barrage.md) | `supabase/functions/game-advance-barrage/index.ts` | 13 | Anti-Fighter Barrage | planned | migration-030-afb |
| [component-SpaceCombatModal](component-SpaceCombatModal.md) | `src/components/game/SpaceCombatModal.jsx` | 13 / 14 | AFB / Full Invasion | planned | hook-useCombat |
| [migration-031-invasion](migration-031-invasion.md) | `supabase/migrations/031_invasion.sql` | 14 | Full Invasion | planned | migration-030-afb |
| [fn-game-assign-hits](fn-game-assign-hits.md) | `supabase/functions/game-assign-hits/index.ts` | 14 | Full Invasion | planned | migration-031-invasion |
| [fn-game-fire-bombardment](fn-game-fire-bombardment.md) | `supabase/functions/game-fire-bombardment/index.ts` | 14 | Full Invasion | planned | migration-031-invasion |
| [fn-game-advance-bombardment](fn-game-advance-bombardment.md) | `supabase/functions/game-advance-bombardment/index.ts` | 14 | Full Invasion | planned | migration-031-invasion |
| [fn-game-commit-ground-forces](fn-game-commit-ground-forces.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 11 / 14 | Ground Combat / Full Invasion | planned | migration-028, migration-031-invasion |
| [fn-game-fire-space-cannon-defense](fn-game-fire-space-cannon-defense.md) | `supabase/functions/game-fire-space-cannon-defense/index.ts` | 14 | Full Invasion | planned | fn-game-commit-ground-forces |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 | Ground Combat / AFB / Full Invasion | in-progress | fn-game-commit-ground-forces, fn-game-fire-bombardment, fn-game-advance-bombardment, fn-game-fire-space-cannon-defense |
| [hook-useCombat](hook-useCombat.md) | `src/hooks/useCombat.js` | 11 / 13 / 14 | Ground Combat / AFB / Full Invasion | in-progress | client-edgeFunctions |
| [component-GroundCombatModal](component-GroundCombatModal.md) | `src/components/game/GroundCombatModal.jsx` | 11 / 14 | Ground Combat / Full Invasion | in-progress | hook-useCombat |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 11 / 14 | Ground Combat / Full Invasion | in-progress | component-GroundCombatModal |
| [migration-032-promissory-effects](migration-032-promissory-effects.md) | `supabase/migrations/032_promissory_effects.sql` | 15 | Promissory Note Effects | planned | — |
| [shared-promissoryEnforcement](shared-promissoryEnforcement.md) | `supabase/functions/_shared/promissoryEnforcement.ts` | 15 | Promissory Note Effects | planned | migration-032-promissory-effects |
| [fn-game-play-promissory-note](fn-game-play-promissory-note.md) | `supabase/functions/game-play-promissory-note/index.ts` | 15 | Promissory Note Effects | planned | shared-promissoryEnforcement, shared-abilityDsl |
| [fn-game-confirm-transaction-p15](fn-game-confirm-transaction-p15.md) | `supabase/functions/game-confirm-transaction/index.ts` | 15 | Promissory Note Effects | planned | migration-032-promissory-effects |
| [hook-usePromissoryNotes](hook-usePromissoryNotes.md) | `src/hooks/usePromissoryNotes.js` | 15 | Promissory Note Effects | planned | client-edgeFunctions |
| [component-PlayPromissoryNoteModal](component-PlayPromissoryNoteModal.md) | `src/components/game/PlayPromissoryNoteModal.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
| [component-InPlayNotesPanel](component-InPlayNotesPanel.md) | `src/components/game/InPlayNotesPanel.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
| [migration-033-leaders](migration-033-leaders.md) | `supabase/migrations/033_leaders.sql` | 16 | Leaders & Mechs | planned | — |
| [fn-admin-import-leaders](fn-admin-import-leaders.md) | `supabase/functions/admin-import-leaders/index.ts` | 16 | Leaders & Mechs | planned | migration-033-leaders |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | shared-abilityDsl |
| [fn-game-unlock-hero](fn-game-unlock-hero.md) | `supabase/functions/game-unlock-hero/index.ts` | 16 | Leaders & Mechs | planned | migration-033-leaders |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | fn-game-play-strategy-card |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 / 16 | Ground Combat / AFB / Full Invasion / Leaders | in-progress | fn-game-commit-ground-forces, fn-game-unlock-hero |
| [hook-useLeaders](hook-useLeaders.md) | `src/hooks/useLeaders.js` | 16 | Leaders & Mechs | planned | client-edgeFunctions |
| [component-LeaderCard](component-LeaderCard.md) | `src/components/game/LeaderCard.jsx` | 16 | Leaders & Mechs | planned | hook-useLeaders |
| [component-LeaderPanel](component-LeaderPanel.md) | `src/components/game/LeaderPanel.jsx` | 16 | Leaders & Mechs | planned | component-LeaderCard |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | component-StrategyCardPanel, component-LeaderPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | hook-useStrategyCards, hook-useLeaders, component-LeaderPanel |

| [migration-034-exploration](migration-034-exploration.md) | `supabase/migrations/034_exploration.sql` | 17 | Exploration / Relics | planned | — |
| [shared-explorationEffects](shared-explorationEffects.md) | `supabase/functions/_shared/explorationEffects.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [shared-relicEffects](shared-relicEffects.md) | `supabase/functions/_shared/relicEffects.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 17 | Exploration / Relics | planned | migration-034-exploration |
| [fn-game-explore-planet](fn-game-explore-planet.md) | `supabase/functions/game-explore-planet/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects |
| [fn-game-resolve-exploration-card](fn-game-resolve-exploration-card.md) | `supabase/functions/game-resolve-exploration-card/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-explore-frontier](fn-game-explore-frontier.md) | `supabase/functions/game-explore-frontier/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-use-relic-fragment](fn-game-use-relic-fragment.md) | `supabase/functions/game-use-relic-fragment/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [fn-game-use-relic](fn-game-use-relic.md) | `supabase/functions/game-use-relic/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-relicEffects, shared-abilityDsl |
| [fn-game-shuffle-exploration-deck](fn-game-shuffle-exploration-deck.md) | `supabase/functions/game-shuffle-exploration-deck/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 17 | Exploration / Relics | planned | fn-game-explore-planet, fn-game-resolve-exploration-card, fn-game-explore-frontier, fn-game-use-relic-fragment, fn-game-use-relic |
| [hook-useExploration](hook-useExploration.md) | `src/hooks/useExploration.js` | 17 | Exploration / Relics | planned | client-edgeFunctions |
| [component-ExplorationModal](component-ExplorationModal.md) | `src/components/game/ExplorationModal.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-RelicFragmentPanel](component-RelicFragmentPanel.md) | `src/components/game/RelicFragmentPanel.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-RelicPanel](component-RelicPanel.md) | `src/components/game/RelicPanel.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 17 | Exploration / Relics | planned | hook-useExploration, component-ExplorationModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 17 | Exploration / Relics | planned | hook-useExploration, component-RelicFragmentPanel, component-RelicPanel |

| [fn-game-move-ships](fn-game-move-ships.md) | `supabase/functions/game-move-ships/index.ts` | 18 | Unit Transport | planned | — |
| [hook-useGalaxy](hook-useGalaxy.md) | `src/hooks/useGalaxy.js` | 18 | Unit Transport | planned | fn-game-move-ships, client-edgeFunctions |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 18 | Unit Transport | planned | fn-game-move-ships |
| [hook-useMovement](hook-useMovement.md) | `src/hooks/useMovement.js` | 18 | Unit Transport | planned | client-edgeFunctions |
| [component-MoveShipsModal](component-MoveShipsModal.md) | `src/components/game/MoveShipsModal.jsx` | 18 | Unit Transport | planned | hook-useMovement |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 18 | Unit Transport | planned | hook-useMovement, component-MoveShipsModal |

---

## Planned Feature Areas (specs to be added)

Phases 17+ are listed in suggested implementation order.

| Phase | Feature Area | Priority | Notes |
|-------|-------------|----------|-------|
| 17 | Planet Exploration, Attachments & Relics | medium | Capture unclaimed planet → draw exploration card; apply attachments to `game_system_state`; apply relic effects; Frontier Tokens (PoK: draw when entering empty space) |
| 18 | Unit Transport | medium | Fleet carrying capacity; carry infantry/fighters between systems |
| 19 | Ability DSL Completions | medium | Wire up 10 no-op ops in `abilityDsl.ts`: `modify_roll`, `add_die`, `cancel_hit`, `cast_votes`, `prevent_vote`, `place_units`, `destroy_units`, `convert_commodities`, `gain_command_tokens`, `ignore_prerequisite`, `take_from_discard`, `gain_technology` |
| 20 | Space Combat Action Cards | medium | Per-unit hit tracking (prereq for Direct Hit) → Direct Hit, Maneuvering Jets, Skilled Retreat, Dark Energy Tap |
| 21 | Legendary Planets & Wormhole Nexus | low | PoK: legendary planets with persistent abilities; rotating Wormhole Nexus tile |
| 22 | Map Builder | low | Paste map string in lobby; parse into `games.map_tiles` |
| 23 | Admin: Read Views + Editing | low | Browse imported records per table; individual record editing; selective re-import (upsert) |
| 24 | Rule Lookup | low | In-app LRR search via `ti4-lrr.md`; client-side fuzzy search by keyword |
| 25 | Gravity Rift | low | Anomaly: units moving through roll 1 die; destroyed on a 1 |
| 26 | Player Elimination | low | Mid-game elimination: remove player, redistribute components, handle VP/objectives |
| 27 | Tech Debt | low | Concurrent draw race in `game-draw-action-card`; N+1 queries in `game-start` player initialisation |
