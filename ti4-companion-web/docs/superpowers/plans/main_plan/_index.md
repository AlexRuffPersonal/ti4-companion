# Remaining Feature Specs — Index

Status: `done` | `in-progress` | `planned` | `deferred`

See [_standards.md](_standards.md) for shorthand used in all spec files.

---

## Agent Workflow Convention

When implementing tasks from this index, agents **must** follow this protocol:

1. **Before starting a task:** Change its Status to `in-progress` in the table below.
2. **After completing a task:** Change its Status to `done` in the table below.
3. Work through tasks one at a time in dependency order — do not start a task whose prereqs are not `done`.

This keeps the index accurate across multi-session implementations so future agents know exactly where to resume.

---

## All Spec Files

| Spec File | Actual File | Phase | Feature Area | Status | Depends On |
|-----------|-------------|-------|-------------|--------|-----------|
| [migration-028-ground-combat](migration-028-ground-combat.md) | `supabase/migrations/028_ground_combat.sql` | 11 | Ground Combat | done | — |
| [fn-game-roll-ground-combat-dice](fn-game-roll-ground-combat-dice.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 11 | Ground Combat | done | migration-028 |
| [fn-game-assign-ground-hits](fn-game-assign-ground-hits.md) | ~~`supabase/functions/game-assign-ground-hits/index.ts`~~ | 11 | Ground Combat | deferred | Superseded by fn-game-assign-hits |
| [migration-029-strategy-production](migration-029-strategy-production.md) | `supabase/migrations/029_strategy_production.sql` | 12 | Strategy Cards & Production | done | — |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 12 | Strategy Cards & Production | done | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 12 | Strategy Cards & Production | done | shared-abilityDsl |
| [fn-game-play-strategy-card](fn-game-play-strategy-card.md) | `supabase/functions/game-play-strategy-card/index.ts` | 12 | Strategy Cards & Production | done | migration-029-strategy-production, fn-game-resolve-ability |
| [fn-game-use-strategy-secondary](fn-game-use-strategy-secondary.md) | `supabase/functions/game-use-strategy-secondary/index.ts` | 12 | Strategy Cards & Production | done | fn-game-play-strategy-card |
| [fn-game-pass-strategy-secondary](fn-game-pass-strategy-secondary.md) | `supabase/functions/game-pass-strategy-secondary/index.ts` | 12 | Strategy Cards & Production | done | fn-game-play-strategy-card |
| [fn-game-produce-units](fn-game-produce-units.md) | `supabase/functions/game-produce-units/index.ts` | 12 | Strategy Cards & Production | done | migration-029-strategy-production |
| [fn-game-end-turn](fn-game-end-turn.md) | `supabase/functions/game-end-turn/index.ts` | 12 | Strategy Cards & Production | done | fn-game-play-strategy-card |
| [hook-useStrategyCards](hook-useStrategyCards.md) | `src/hooks/useStrategyCards.js` | 12 | Strategy Cards & Production | done | client-edgeFunctions |
| [component-StrategyCardPanel](component-StrategyCardPanel.md) | `src/components/game/StrategyCardPanel.jsx` | 12 | Strategy Cards & Production | done | hook-useStrategyCards |
| [component-StrategyCardModal](component-StrategyCardModal.md) | `src/components/game/StrategyCardModal.jsx` | 12 | Strategy Cards & Production | done | hook-useStrategyCards |
| [component-ProductionModal](component-ProductionModal.md) | `src/components/game/ProductionModal.jsx` | 12 | Strategy Cards & Production | done | client-edgeFunctions |
| [component-SystemActionModal](component-SystemActionModal.md) | `src/components/game/SystemActionModal.jsx` | 12 | Strategy Cards & Production | done | component-ProductionModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 12 | Strategy Cards & Production | done | component-StrategyCardPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 12 | Strategy Cards & Production | done | hook-useStrategyCards, component-StrategyCardModal |
| [migration-030-afb](migration-030-afb.md) | `supabase/migrations/030_afb.sql` | 13 | Anti-Fighter Barrage | done | — |
| [fn-game-fire-space-cannon](fn-game-fire-space-cannon.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 13 | Anti-Fighter Barrage | done | migration-030-afb |
| [fn-game-roll-combat-dice](fn-game-roll-combat-dice.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 13 / 20 | Anti-Fighter Barrage / Space Combat Action Cards | done | fn-game-fire-anti-fighter-barrage, migration-036-combat-action-cards |
| [fn-game-fire-anti-fighter-barrage](fn-game-fire-anti-fighter-barrage.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 13 / 14 | AFB / Full Invasion | done | migration-030-afb, migration-031-invasion |
| [fn-game-advance-barrage](fn-game-advance-barrage.md) | `supabase/functions/game-advance-barrage/index.ts` | 13 | Anti-Fighter Barrage | done | migration-030-afb |
| [component-SpaceCombatModal](component-SpaceCombatModal.md) | `src/components/game/SpaceCombatModal.jsx` | 13 / 14 / 20 | AFB / Full Invasion / Space Combat Action Cards | planned | hook-useCombat, component-ActionCardWindowPanel |
| [migration-031-invasion](migration-031-invasion.md) | `supabase/migrations/031_invasion.sql` | 14 | Full Invasion | done | migration-030-afb |
| [fn-game-assign-hits](fn-game-assign-hits.md) | `supabase/functions/game-assign-hits/index.ts` | 14 / 20 | Full Invasion / Space Combat Action Cards | done | migration-031-invasion, migration-036-combat-action-cards |
| [fn-game-fire-bombardment](fn-game-fire-bombardment.md) | `supabase/functions/game-fire-bombardment/index.ts` | 14 | Full Invasion | done | migration-031-invasion |
| [fn-game-advance-bombardment](fn-game-advance-bombardment.md) | `supabase/functions/game-advance-bombardment/index.ts` | 14 | Full Invasion | done | migration-031-invasion |
| [fn-game-commit-ground-forces](fn-game-commit-ground-forces.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 11 / 14 | Ground Combat / Full Invasion | done | migration-028, migration-031-invasion |
| [fn-game-fire-space-cannon-defense](fn-game-fire-space-cannon-defense.md) | `supabase/functions/game-fire-space-cannon-defense/index.ts` | 14 | Full Invasion | planned | fn-game-commit-ground-forces |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 / 20 | Ground Combat / AFB / Full Invasion / Space Combat Action Cards | in-progress | fn-game-commit-ground-forces, fn-game-fire-bombardment, fn-game-advance-bombardment, fn-game-fire-space-cannon-defense, fn-game-play-combat-action-card, fn-game-pass-action-window |
| [hook-useCombat](hook-useCombat.md) | `src/hooks/useCombat.js` | 11 / 13 / 14 / 20 | Ground Combat / AFB / Full Invasion / Space Combat Action Cards | in-progress | client-edgeFunctions, fn-game-play-combat-action-card, fn-game-pass-action-window |
| [component-GroundCombatModal](component-GroundCombatModal.md) | `src/components/game/GroundCombatModal.jsx` | 11 / 14 | Ground Combat / Full Invasion | done | hook-useCombat |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 11 / 14 | Ground Combat / Full Invasion | in-progress | component-GroundCombatModal |
| [migration-032-promissory-effects](migration-032-promissory-effects.md) | `supabase/migrations/032_promissory_effects.sql` | 15 | Promissory Note Effects | done | — |
| [shared-promissoryEnforcement](shared-promissoryEnforcement.md) | `supabase/functions/_shared/promissoryEnforcement.ts` | 15 | Promissory Note Effects | done | migration-032-promissory-effects |
| [fn-game-play-promissory-note](fn-game-play-promissory-note.md) | `supabase/functions/game-play-promissory-note/index.ts` | 15 | Promissory Note Effects | done | shared-promissoryEnforcement, shared-abilityDsl |
| [fn-game-confirm-transaction-p15](fn-game-confirm-transaction-p15.md) | `supabase/functions/game-confirm-transaction/index.ts` | 15 | Promissory Note Effects | done | migration-032-promissory-effects |
| [hook-usePromissoryNotes](hook-usePromissoryNotes.md) | `src/hooks/usePromissoryNotes.js` | 15 | Promissory Note Effects | planned | client-edgeFunctions |
| [component-PlayPromissoryNoteModal](component-PlayPromissoryNoteModal.md) | `src/components/game/PlayPromissoryNoteModal.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
| [component-InPlayNotesPanel](component-InPlayNotesPanel.md) | `src/components/game/InPlayNotesPanel.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
| [migration-033-leaders](migration-033-leaders.md) | `supabase/migrations/033_leaders.sql` | 16 | Leaders & Mechs | done | — |
| [fn-admin-import-leaders](fn-admin-import-leaders.md) | `supabase/functions/admin-import-leaders/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | shared-abilityDsl |
| [fn-game-unlock-hero](fn-game-unlock-hero.md) | `supabase/functions/game-unlock-hero/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | fn-game-play-strategy-card |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 / 16 | Ground Combat / AFB / Full Invasion / Leaders | in-progress | fn-game-commit-ground-forces, fn-game-unlock-hero |
| [hook-useLeaders](hook-useLeaders.md) | `src/hooks/useLeaders.js` | 16 | Leaders & Mechs | planned | client-edgeFunctions |
| [component-LeaderCard](component-LeaderCard.md) | `src/components/game/LeaderCard.jsx` | 16 | Leaders & Mechs | planned | hook-useLeaders |
| [component-LeaderPanel](component-LeaderPanel.md) | `src/components/game/LeaderPanel.jsx` | 16 | Leaders & Mechs | planned | component-LeaderCard |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | component-StrategyCardPanel, component-LeaderPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | planned | hook-useStrategyCards, hook-useLeaders, component-LeaderPanel |

| [migration-034-exploration](migration-034-exploration.md) | `supabase/migrations/034_exploration.sql` | 17 | Exploration / Relics | done | — |
| [shared-explorationEffects](shared-explorationEffects.md) | `supabase/functions/_shared/explorationEffects.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [shared-relicEffects](shared-relicEffects.md) | `supabase/functions/_shared/relicEffects.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 17 | Exploration / Relics | done | migration-034-exploration |
| [fn-game-explore-planet](fn-game-explore-planet.md) | `supabase/functions/game-explore-planet/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects |
| [fn-game-resolve-exploration-card](fn-game-resolve-exploration-card.md) | `supabase/functions/game-resolve-exploration-card/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-explore-frontier](fn-game-explore-frontier.md) | `supabase/functions/game-explore-frontier/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-use-relic-fragment](fn-game-use-relic-fragment.md) | `supabase/functions/game-use-relic-fragment/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-abilityDsl |
| [fn-game-use-relic](fn-game-use-relic.md) | `supabase/functions/game-use-relic/index.ts` | 17 | Exploration / Relics | planned | migration-034-exploration, shared-relicEffects, shared-abilityDsl |
| [fn-game-shuffle-exploration-deck](fn-game-shuffle-exploration-deck.md) | `supabase/functions/game-shuffle-exploration-deck/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 17 | Exploration / Relics | planned | fn-game-explore-planet, fn-game-resolve-exploration-card, fn-game-explore-frontier, fn-game-use-relic-fragment, fn-game-use-relic |
| [hook-useExploration](hook-useExploration.md) | `src/hooks/useExploration.js` | 17 | Exploration / Relics | planned | client-edgeFunctions |
| [component-ExplorationModal](component-ExplorationModal.md) | `src/components/game/ExplorationModal.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-RelicFragmentPanel](component-RelicFragmentPanel.md) | `src/components/game/RelicFragmentPanel.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-RelicPanel](component-RelicPanel.md) | `src/components/game/RelicPanel.jsx` | 17 | Exploration / Relics | planned | hook-useExploration |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 17 | Exploration / Relics | planned | hook-useExploration, component-ExplorationModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 17 | Exploration / Relics | planned | hook-useExploration, component-RelicFragmentPanel, component-RelicPanel |

| [fn-game-move-ships](fn-game-move-ships.md) | `supabase/functions/game-move-ships/index.ts` | 18 | Unit Transport | done | — |
| [hook-useGalaxy](hook-useGalaxy.md) | `src/hooks/useGalaxy.js` | 18 | Unit Transport | planned | fn-game-move-ships, client-edgeFunctions |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 18 | Unit Transport | done | fn-game-move-ships |
| [hook-useMovement](hook-useMovement.md) | `src/hooks/useMovement.js` | 18 | Unit Transport | planned | client-edgeFunctions |
| [component-MoveShipsModal](component-MoveShipsModal.md) | `src/components/game/MoveShipsModal.jsx` | 18 | Unit Transport | planned | hook-useMovement |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 18 | Unit Transport | planned | hook-useMovement, component-MoveShipsModal |

| [migration-035-ability-dsl-completions](migration-035-ability-dsl-completions.md) | `supabase/migrations/035_ability_dsl_completions.sql` | 19 | Ability DSL Completions | done | — |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 19 | Ability DSL Completions | done | migration-035-ability-dsl-completions |
| [fn-game-roll-combat-dice](fn-game-roll-combat-dice.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 19 | Ability DSL Completions | done | — |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 19 | Ability DSL Completions | done | shared-abilityDsl |
| [fn-game-cast-votes](fn-game-cast-votes.md) | `supabase/functions/game-cast-votes/index.ts` | 19 | Ability DSL Completions | done | migration-035-ability-dsl-completions |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 19 | Ability DSL Completions | done | migration-035-ability-dsl-completions |

| [migration-036-combat-action-cards](migration-036-combat-action-cards.md) | `supabase/migrations/036_combat_action_cards.sql` | 20 | Space Combat Action Cards | done | — |
| [fn-game-activate-system-p20](fn-game-activate-system-p20.md) | `supabase/functions/game-activate-system/index.ts` | 20 | Space Combat Action Cards | done | migration-036-combat-action-cards |
| [fn-game-declare-retreat-p20](fn-game-declare-retreat-p20.md) | `supabase/functions/game-declare-retreat/index.ts` | 20 | Space Combat Action Cards | done | migration-036-combat-action-cards |
| [fn-game-play-combat-action-card](fn-game-play-combat-action-card.md) | `supabase/functions/game-play-combat-action-card/index.ts` | 20 | Space Combat Action Cards | done | migration-036-combat-action-cards |
| [fn-game-pass-action-window](fn-game-pass-action-window.md) | `supabase/functions/game-pass-action-window/index.ts` | 20 | Space Combat Action Cards | done | migration-036-combat-action-cards |
| [component-ActionCardWindowPanel](component-ActionCardWindowPanel.md) | `src/components/game/ActionCardWindowPanel.jsx` | 20 | Space Combat Action Cards | done | fn-game-play-combat-action-card, fn-game-pass-action-window |

| [migration-037-legendary-planets](migration-037-legendary-planets.md) | `supabase/migrations/037_legendary_planets.sql` | 21 | Legendary Planets & Wormhole Nexus | done | — |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [fn-game-commit-ground-forces](fn-game-commit-ground-forces.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 21 | Legendary Planets & Wormhole Nexus | planned | migration-037-legendary-planets |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [fn-game-use-relic](fn-game-use-relic.md) | `supabase/functions/game-use-relic/index.ts` | 21 | Legendary Planets & Wormhole Nexus | planned | migration-037-legendary-planets |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 21 | Legendary Planets & Wormhole Nexus | planned | migration-037-legendary-planets |
| [hook-useLegendaryCards](hook-useLegendaryCards.md) | `src/hooks/useLegendaryCards.js` | 21 | Legendary Planets & Wormhole Nexus | planned | migration-037-legendary-planets, client-edgeFunctions |
| [component-LegendaryCardPanel](component-LegendaryCardPanel.md) | `src/components/game/LegendaryCardPanel.jsx` | 21 | Legendary Planets & Wormhole Nexus | planned | hook-useLegendaryCards |
| [component-EndTurnDialog](component-EndTurnDialog.md) | `src/components/game/EndTurnDialog.jsx` | 21 | Legendary Planets & Wormhole Nexus | planned | hook-useLegendaryCards, component-LegendaryCardPanel |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 21 | Legendary Planets & Wormhole Nexus | planned | migration-037-legendary-planets |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 21 | Legendary Planets & Wormhole Nexus | planned | hook-useLegendaryCards, component-LegendaryCardPanel |

| [migration-038-gravity-rift](migration-038-gravity-rift.md) | `supabase/migrations/038_gravity_rift.sql` | 25 | Gravity Rift | done | — |
| [fn-game-move-ships-p25](fn-game-move-ships-p25.md) | `supabase/functions/game-move-ships/index.ts` | 25 | Gravity Rift | done | migration-038-gravity-rift, fn-game-move-ships |
| [fn-game-roll-rift-dice](fn-game-roll-rift-dice.md) | `supabase/functions/game-roll-rift-dice/index.ts` | 25 | Gravity Rift | done | migration-038-gravity-rift |
| [client-edgeFunctions-p25](client-edgeFunctions-p25.md) | `src/lib/edgeFunctions.js` | 25 | Gravity Rift | done | fn-game-roll-rift-dice |
| [hook-useRiftTransit](hook-useRiftTransit.md) | `src/hooks/useRiftTransit.js` | 25 | Gravity Rift | planned | client-edgeFunctions-p25 |
| [component-RiftTransitModal](component-RiftTransitModal.md) | `src/components/game/RiftTransitModal.jsx` | 25 | Gravity Rift | planned | hook-useRiftTransit |
| [component-GameScreen-p25](component-GameScreen-p25.md) | `src/components/game/GameScreen.jsx` | 25 | Gravity Rift | planned | hook-useRiftTransit, component-RiftTransitModal |

| [lib-mapParser](lib-mapParser.md) | `src/lib/mapParser.js` | 22 | Map Builder | done | — |
| [component-MapPreviewSection](component-MapPreviewSection.md) | `src/components/game/MapPreviewSection.jsx` | 22 | Map Builder | done | lib-mapParser |
| [component-LobbyScreen-p22](component-LobbyScreen-p22.md) | `src/components/game/LobbyScreen.jsx` | 22 | Map Builder | planned | lib-mapParser, component-MapPreviewSection, fn-game-update-settings-p22 |
| [fn-game-update-settings-p22](fn-game-update-settings-p22.md) | `supabase/functions/game-update-settings/index.ts` | 22 | Map Builder | done | — |
| [fn-game-start-p22](fn-game-start-p22.md) | `supabase/functions/game-start/index.ts` | 22 | Map Builder | done | fn-game-update-settings-p22 |

| [fn-admin-update-record](fn-admin-update-record.md) | `supabase/functions/admin-update-record/index.ts` | 23 | Admin: Read Views + Editing | done | — |
| [lib-importSchemas-p23](lib-importSchemas-p23.md) | `src/lib/importSchemas.js` | 23 | Admin: Read Views + Editing | done | — |
| [client-edgeFunctions-p23](client-edgeFunctions-p23.md) | `src/lib/edgeFunctions.js` | 23 | Admin: Read Views + Editing | done | fn-admin-update-record |
| [component-AdminDashboard-p23](component-AdminDashboard-p23.md) | `src/components/admin/AdminDashboard.jsx` | 23 | Admin: Read Views + Editing | planned | lib-importSchemas-p23 |
| [component-AdminBrowsePage](component-AdminBrowsePage.md) | `src/components/admin/AdminBrowsePage.jsx` | 23 | Admin: Read Views + Editing | planned | lib-importSchemas-p23, client-edgeFunctions-p23 |
| [component-AdminRecordModal](component-AdminRecordModal.md) | `src/components/admin/AdminRecordModal.jsx` | 23 | Admin: Read Views + Editing | planned | client-edgeFunctions-p23, lib-importSchemas-p23 |

| [script-parse-lrr](script-parse-lrr.md) | `ti4-companion-web/scripts/parse-lrr.js` | 24 | Rule Lookup | done | — |
| [component-RulesModal](component-RulesModal.md) | `src/components/game/RulesModal.jsx` | 24 | Rule Lookup | done | script-parse-lrr |
| [component-GameHeader-p24](component-GameHeader-p24.md) | `src/components/game/GameHeader.jsx` | 24 | Rule Lookup | planned | component-RulesModal |
| [component-GameScreen-p24](component-GameScreen-p24.md) | `src/components/game/GameScreen.jsx` | 24 | Rule Lookup | planned | component-RulesModal, component-GameHeader-p24 |

| [migration-039-elimination](migration-039-elimination.md) | `supabase/migrations/039_elimination.sql` | 26 | Player Elimination | done | — |
| [migration-040-draw-action-card-fn](migration-040-draw-action-card-fn.md) | `supabase/migrations/040_draw_action_card_fn.sql` | 27 | Tech Debt | done | — |
| [fn-game-draw-action-card-p27](fn-game-draw-action-card-p27.md) | `supabase/functions/game-draw-action-card/index.ts` | 27 | Tech Debt | done | migration-040-draw-action-card-fn |
| [fn-game-start-p27](fn-game-start-p27.md) | `supabase/functions/game-start/index.ts` | 27 | Tech Debt | done | — |
| [shared-eliminationHandler](shared-eliminationHandler.md) | `supabase/functions/_shared/eliminationHandler.ts` | 26 | Player Elimination | done | migration-039-elimination |
| [fn-game-assign-hits-p26](fn-game-assign-hits-p26.md) | `supabase/functions/game-assign-hits/index.ts` | 26 | Player Elimination | done | shared-eliminationHandler |
| [fn-game-land-troops-p26](fn-game-land-troops-p26.md) | `supabase/functions/game-land-troops/index.ts` | 26 | Player Elimination | done | shared-eliminationHandler |
| [hook-useGame-p26](hook-useGame-p26.md) | `src/hooks/useGame.js` | 26 | Player Elimination | done | migration-039-elimination |
| [component-GameScreen-p26](component-GameScreen-p26.md) | `src/components/game/GameScreen.jsx` | 26 | Player Elimination | planned | hook-useGame-p26 |

| [component-TechCard-p28](component-TechCard-p28.md) | `src/components/game/TechCard.jsx` | 28 | Card Text Visualization | done | — |
| [component-ObjectivesSection-p28](component-ObjectivesSection-p28.md) | `src/components/game/ObjectivesSection.jsx` | 28 | Card Text Visualization | done | — |
| [component-VotingPanel-p28](component-VotingPanel-p28.md) | `src/components/game/VotingPanel.jsx` | 28 | Card Text Visualization | done | — |
| [component-AgendaResolutionModal-p28](component-AgendaResolutionModal-p28.md) | `src/components/game/AgendaResolutionModal.jsx` | 28 | Card Text Visualization | done | — |

| [migration-041-action-card-effects](migration-041-action-card-effects.md) | `supabase/migrations/041_action_card_effects.sql` | 29a | Action Card Effect Enforcement | done | — |
| [shared-abilityDsl-p29a](shared-abilityDsl-p29a.md) | `supabase/functions/_shared/abilityDsl.ts` | 29a | Action Card Effect Enforcement | done | migration-041-action-card-effects |
| [fn-game-play-action-card-p29a](fn-game-play-action-card-p29a.md) | `supabase/functions/game-play-action-card/index.ts` | 29a | Action Card Effect Enforcement | done | shared-abilityDsl-p29a |
| [lib-importSchemas-p29a](lib-importSchemas-p29a.md) | `src/lib/importSchemas.js` | 29a | Action Card Effect Enforcement | done | migration-041-action-card-effects |
| [client-edgeFunctions-p29a](client-edgeFunctions-p29a.md) | `src/lib/edgeFunctions.js` | 29a | Action Card Effect Enforcement | done | fn-game-play-action-card-p29a, fn-game-pass-action-window-p29b |
| [component-ActionCardModal-p29a](component-ActionCardModal-p29a.md) | `src/components/game/ActionCardModal.jsx` | 29a | Action Card Effect Enforcement | done | client-edgeFunctions-p29a |

| [migration-042-action-window](migration-042-action-window.md) | `supabase/migrations/042_action_window.sql` | 29b | Action Card Effect Enforcement | done | — |
| [shared-abilityDsl-p29b](shared-abilityDsl-p29b.md) | `supabase/functions/_shared/abilityDsl.ts` | 29b | Action Card Effect Enforcement | done | migration-042-action-window |
| [fn-game-play-action-card-p29b](fn-game-play-action-card-p29b.md) | `supabase/functions/game-play-action-card/index.ts` | 29b | Action Card Effect Enforcement | done | fn-game-play-action-card-p29a, shared-abilityDsl-p29b |
| [fn-game-pass-action-window-p29b](fn-game-pass-action-window-p29b.md) | `supabase/functions/game-pass-action-window/index.ts` | 29b | Action Card Effect Enforcement | done | migration-042-action-window |
| [fn-game-draw-agenda-p29b](fn-game-draw-agenda-p29b.md) | `supabase/functions/game-draw-agenda/index.ts` | 29b | Action Card Effect Enforcement | done | migration-042-action-window |
| [fn-game-cast-votes-p29b](fn-game-cast-votes-p29b.md) | `supabase/functions/game-cast-votes/index.ts` | 29b | Action Card Effect Enforcement | done | migration-042-action-window |
| [fn-game-research-technology-p29b](fn-game-research-technology-p29b.md) | `supabase/functions/game-research-technology/index.ts` | 29b | Action Card Effect Enforcement | done | migration-042-action-window |
| [component-ActionWindowBanner](component-ActionWindowBanner.md) | `src/components/game/ActionWindowBanner.jsx` | 29b | Action Card Effect Enforcement | done | client-edgeFunctions-p29a |
| [component-GameScreen-p29b](component-GameScreen-p29b.md) | `src/components/game/GameScreen.jsx` | 29b | Action Card Effect Enforcement | done | component-ActionWindowBanner, client-edgeFunctions-p29a |

| [migration-043-tech-effects](migration-043-tech-effects.md) | `supabase/migrations/043_tech_effects.sql` | 30 | Technology Effect Enforcement | done | — |
| [shared-techEffects](shared-techEffects.md) | `supabase/functions/_shared/techEffects.ts` | 30 | Technology Effect Enforcement | done | migration-043-tech-effects |
| [fn-game-exhaust-technology](fn-game-exhaust-technology.md) | `supabase/functions/game-exhaust-technology/index.ts` | 30 | Technology Effect Enforcement | done | migration-043-tech-effects, shared-techEffects |
| [fn-game-ready-technology](fn-game-ready-technology.md) | `supabase/functions/game-ready-technology/index.ts` | 30 | Technology Effect Enforcement | done | migration-043-tech-effects |
| [fn-game-use-technology-action](fn-game-use-technology-action.md) | `supabase/functions/game-use-technology-action/index.ts` | 30 | Technology Effect Enforcement | done | migration-043-tech-effects, shared-techEffects |
| [fn-game-advance-phase-p30](fn-game-advance-phase-p30.md) | `supabase/functions/game-advance-phase/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-advance-phase (p21), migration-043-tech-effects, shared-techEffects |
| [fn-game-produce-units-p30](fn-game-produce-units-p30.md) | `supabase/functions/game-produce-units/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-produce-units (p12), migration-043-tech-effects, shared-techEffects |
| [fn-game-roll-combat-dice-p30](fn-game-roll-combat-dice-p30.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 30 | Technology Effect Enforcement | planned | fn-game-roll-combat-dice (p13/p20), migration-043-tech-effects, shared-techEffects |
| [fn-game-roll-ground-combat-dice-p30](fn-game-roll-ground-combat-dice-p30.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-roll-ground-combat-dice (p11), migration-043-tech-effects, shared-techEffects |
| [fn-game-fire-space-cannon-p30](fn-game-fire-space-cannon-p30.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-fire-space-cannon (p13), migration-043-tech-effects, shared-techEffects |
| [fn-game-fire-anti-fighter-barrage-p30](fn-game-fire-anti-fighter-barrage-p30.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 30 | Technology Effect Enforcement | planned | fn-game-fire-anti-fighter-barrage (p13/p14), migration-043-tech-effects, shared-techEffects |
| [fn-game-activate-system-p30](fn-game-activate-system-p30.md) | `supabase/functions/game-activate-system/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-activate-system-p20, migration-043-tech-effects, shared-techEffects |
| [fn-game-play-action-card-p30](fn-game-play-action-card-p30.md) | `supabase/functions/game-play-action-card/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-play-action-card-p29a, migration-043-tech-effects, shared-techEffects |
| [fn-game-cast-votes-p30](fn-game-cast-votes-p30.md) | `supabase/functions/game-cast-votes/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-cast-votes (p19), migration-043-tech-effects, shared-techEffects |
| [fn-game-end-turn-p30](fn-game-end-turn-p30.md) | `supabase/functions/game-end-turn/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-end-turn (p12), migration-043-tech-effects, shared-techEffects |
| [fn-game-research-technology-p30](fn-game-research-technology-p30.md) | `supabase/functions/game-research-technology/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-research-technology-p29b, migration-043-tech-effects, shared-techEffects |
| [fn-game-explore-planet-p30](fn-game-explore-planet-p30.md) | `supabase/functions/game-explore-planet/index.ts` | 30 | Technology Effect Enforcement | planned | fn-game-explore-planet (p17), migration-043-tech-effects, shared-techEffects |
| [fn-game-resolve-ability-p30](fn-game-resolve-ability-p30.md) | `supabase/functions/game-resolve-ability/index.ts` | 30 | Technology Effect Enforcement | planned | fn-game-resolve-ability (p21), migration-043-tech-effects, shared-techEffects |
| [lib-techConstants](lib-techConstants.md) | `src/lib/techConstants.js` | 30 | Technology Effect Enforcement | done | — |
| [client-edgeFunctions-p30](client-edgeFunctions-p30.md) | `src/lib/edgeFunctions.js` | 30 | Technology Effect Enforcement | planned | fn-game-exhaust-technology, fn-game-ready-technology, fn-game-use-technology-action |
| [hook-useTechnologies](hook-useTechnologies.md) | `src/hooks/useTechnologies.js` | 30 | Technology Effect Enforcement | planned | client-edgeFunctions-p30 |
| [component-TechCard-p30](component-TechCard-p30.md) | `src/components/game/TechCard.jsx` | 30 | Technology Effect Enforcement | planned | component-TechCard-p28, hook-useTechnologies, lib-techConstants |
| [component-MyPanelSection-p30](component-MyPanelSection-p30.md) | `src/components/game/MyPanelSection.jsx` | 30 | Technology Effect Enforcement | planned | component-MyPanelSection (p21), hook-useTechnologies, component-TechCard-p30 |

| [hook-useGalaxy-p31](hook-useGalaxy-p31.md) | `src/hooks/useGalaxy.js` | 31 | System Tile & Planet Detail View | planned | — |
| [component-SystemInfoModal](component-SystemInfoModal.md) | `src/components/game/SystemInfoModal.jsx` | 31 | System Tile & Planet Detail View | planned | hook-useGalaxy-p31 |
| [component-SystemActionModal-p31](component-SystemActionModal-p31.md) | `src/components/game/SystemActionModal.jsx` | 31 | System Tile & Planet Detail View | planned | — |
| [component-MyPanelSection-p31](component-MyPanelSection-p31.md) | `src/components/game/MyPanelSection.jsx` | 31 | System Tile & Planet Detail View | planned | hook-useGalaxy-p31 |
| [component-GalaxyTab-p31](component-GalaxyTab-p31.md) | `src/components/game/GalaxyTab.jsx` | 31 | System Tile & Planet Detail View | planned | hook-useGalaxy-p31, component-SystemInfoModal, component-SystemActionModal-p31 |
| [component-GameScreen-p31](component-GameScreen-p31.md) | `src/components/game/GameScreen.jsx` | 31 | System Tile & Planet Detail View | planned | hook-useGalaxy-p31, component-MyPanelSection-p31 |

| [migration-044-bot-players](migration-044-bot-players.md) | `supabase/migrations/044_bot_players.sql` | 32 | Game Event Log | done | — |
| [migration-045-event-log](migration-045-event-log.md) | `supabase/migrations/045_event_log.sql` | 32 | Game Event Log | done | — |
| [shared-gameEvents](shared-gameEvents.md) | `supabase/functions/_shared/gameEvents.ts` | 32 | Game Event Log | done | migration-045-event-log |
| [fn-event-logging-all](fn-event-logging-all.md) | `supabase/functions/*/index.ts` (all existing) | 32 | Game Event Log | planned | shared-gameEvents |

| [shared-auth-p33](shared-auth-p33.md) | `supabase/functions/_shared/auth.ts` | 33 | Bot Players + Undo | done | migration-044-bot-players |
| [fn-game-add-bot](fn-game-add-bot.md) | `supabase/functions/game-add-bot/index.ts` | 33 | Bot Players + Undo | planned | migration-044-bot-players, shared-auth-p33, shared-gameEvents |
| [fn-game-remove-bot](fn-game-remove-bot.md) | `supabase/functions/game-remove-bot/index.ts` | 33 | Bot Players + Undo | planned | migration-044-bot-players, shared-auth-p33, shared-gameEvents |
| [shared-undoHandlers](shared-undoHandlers.md) | `supabase/functions/_shared/undoHandlers.ts` | 33 | Bot Players + Undo | done | shared-gameEvents |
| [fn-game-undo](fn-game-undo.md) | `supabase/functions/game-undo/index.ts` | 33 | Bot Players + Undo | planned | shared-gameEvents, shared-undoHandlers |
| [client-edgeFunctions-p33](client-edgeFunctions-p33.md) | `src/lib/edgeFunctions.js` | 33 | Bot Players + Undo | planned | fn-game-add-bot, fn-game-remove-bot, fn-game-undo |
| [lib-botStrategies-scripted](lib-botStrategies-scripted.md) | `src/lib/botStrategies/scripted.js` | 33 | Bot Players + Undo | done | — |
| [lib-botStrategies-random](lib-botStrategies-random.md) | `src/lib/botStrategies/random.js` | 33 | Bot Players + Undo | done | — |
| [hook-useBotPlayer](hook-useBotPlayer.md) | `src/hooks/useBotPlayer.js` | 33 | Bot Players + Undo | planned | client-edgeFunctions-p33, lib-botStrategies-scripted, lib-botStrategies-random |
| [component-LobbyScreen-p33](component-LobbyScreen-p33.md) | `src/components/game/LobbyScreen.jsx` | 33 | Bot Players + Undo | planned | client-edgeFunctions-p33 |
| [component-GameHeader-p33](component-GameHeader-p33.md) | `src/components/game/GameHeader.jsx` | 33 | Bot Players + Undo | planned | client-edgeFunctions-p33 |
| [component-GameScreen-p33](component-GameScreen-p33.md) | `src/components/game/GameScreen.jsx` | 33 | Bot Players + Undo | planned | hook-useBotPlayer, component-GameHeader-p33, client-edgeFunctions-p33 |

---

## Planned Feature Areas (specs to be added)

Phases 24+ are listed in suggested implementation order. Phases 17–23 have spec files in the main table above.

| Phase | Feature Area | Priority | Notes |
|-------|-------------|----------|-------|
| 30 | Technology Effect Enforcement | Medium | Spec files added to main table above. |
| 31 | System Tile & Planet Detail View | Low | Spec files added to main table above. |
| 32 | Game Event Log | High | Spec files added to main table above. |
| 33 | Bot Players + Undo | High | Spec files added to main table above. |
