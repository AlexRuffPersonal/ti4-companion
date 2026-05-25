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
| [component-SpaceCombatModal](component-SpaceCombatModal.md) | `src/components/game/SpaceCombatModal.jsx` | 13 / 14 / 20 | AFB / Full Invasion / Space Combat Action Cards | done | hook-useCombat, component-ActionCardWindowPanel |
| [migration-031-invasion](migration-031-invasion.md) | `supabase/migrations/031_invasion.sql` | 14 | Full Invasion | done | migration-030-afb |
| [fn-game-assign-hits](fn-game-assign-hits.md) | `supabase/functions/game-assign-hits/index.ts` | 14 / 20 | Full Invasion / Space Combat Action Cards | done | migration-031-invasion, migration-036-combat-action-cards |
| [fn-game-fire-bombardment](fn-game-fire-bombardment.md) | `supabase/functions/game-fire-bombardment/index.ts` | 14 | Full Invasion | done | migration-031-invasion |
| [fn-game-advance-bombardment](fn-game-advance-bombardment.md) | `supabase/functions/game-advance-bombardment/index.ts` | 14 | Full Invasion | done | migration-031-invasion |
| [fn-game-commit-ground-forces](fn-game-commit-ground-forces.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 11 / 14 | Ground Combat / Full Invasion | done | migration-028, migration-031-invasion |
| [fn-game-fire-space-cannon-defense](fn-game-fire-space-cannon-defense.md) | `supabase/functions/game-fire-space-cannon-defense/index.ts` | 14 | Full Invasion | done | fn-game-commit-ground-forces |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 / 20 | Ground Combat / AFB / Full Invasion / Space Combat Action Cards | done | fn-game-commit-ground-forces, fn-game-fire-bombardment, fn-game-advance-bombardment, fn-game-fire-space-cannon-defense, fn-game-play-combat-action-card, fn-game-pass-action-window |
| [hook-useCombat](hook-useCombat.md) | `src/hooks/useCombat.js` | 11 / 13 / 14 / 20 | Ground Combat / AFB / Full Invasion / Space Combat Action Cards | done | client-edgeFunctions, fn-game-play-combat-action-card, fn-game-pass-action-window |
| [component-GroundCombatModal](component-GroundCombatModal.md) | `src/components/game/GroundCombatModal.jsx` | 11 / 14 | Ground Combat / Full Invasion | done | hook-useCombat |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 11 / 14 | Ground Combat / Full Invasion | done | component-GroundCombatModal |
| [migration-032-promissory-effects](migration-032-promissory-effects.md) | `supabase/migrations/032_promissory_effects.sql` | 15 | Promissory Note Effects | done | — |
| [shared-promissoryEnforcement](shared-promissoryEnforcement.md) | `supabase/functions/_shared/promissoryEnforcement.ts` | 15 | Promissory Note Effects | done | migration-032-promissory-effects |
| [fn-game-play-promissory-note](fn-game-play-promissory-note.md) | `supabase/functions/game-play-promissory-note/index.ts` | 15 | Promissory Note Effects | done | shared-promissoryEnforcement, shared-abilityDsl |
| [fn-game-confirm-transaction-p15](fn-game-confirm-transaction-p15.md) | `supabase/functions/game-confirm-transaction/index.ts` | 15 | Promissory Note Effects | done | migration-032-promissory-effects |
| [hook-usePromissoryNotes](hook-usePromissoryNotes.md) | `src/hooks/usePromissoryNotes.js` | 15 | Promissory Note Effects | done | client-edgeFunctions |
| [component-PlayPromissoryNoteModal](component-PlayPromissoryNoteModal.md) | `src/components/game/PlayPromissoryNoteModal.jsx` | 15 | Promissory Note Effects | done | hook-usePromissoryNotes |
| [component-InPlayNotesPanel](component-InPlayNotesPanel.md) | `src/components/game/InPlayNotesPanel.jsx` | 15 | Promissory Note Effects | done | hook-usePromissoryNotes |
| [migration-033-leaders](migration-033-leaders.md) | `supabase/migrations/033_leaders.sql` | 16 | Leaders & Mechs | done | — |
| [fn-admin-import-leaders](fn-admin-import-leaders.md) | `supabase/functions/admin-import-leaders/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | shared-abilityDsl |
| [fn-game-unlock-hero](fn-game-unlock-hero.md) | `supabase/functions/game-unlock-hero/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | fn-game-play-strategy-card |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 11 / 13 / 14 / 16 | Ground Combat / AFB / Full Invasion / Leaders | done | fn-game-commit-ground-forces, fn-game-unlock-hero |
| [hook-useLeaders](hook-useLeaders.md) | `src/hooks/useLeaders.js` | 16 | Leaders & Mechs | done | client-edgeFunctions |
| [component-LeaderCard](component-LeaderCard.md) | `src/components/game/LeaderCard.jsx` | 16 | Leaders & Mechs | done | hook-useLeaders |
| [component-LeaderPanel](component-LeaderPanel.md) | `src/components/game/LeaderPanel.jsx` | 16 | Leaders & Mechs | done | component-LeaderCard |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | component-StrategyCardPanel, component-LeaderPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 12 / 16 | Strategy Cards / Leaders & Mechs | done | hook-useStrategyCards, hook-useLeaders, component-LeaderPanel |

| [migration-034-exploration](migration-034-exploration.md) | `supabase/migrations/034_exploration.sql` | 17 | Exploration / Relics | done | — |
| [shared-explorationEffects](shared-explorationEffects.md) | `supabase/functions/_shared/explorationEffects.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-abilityDsl |
| [shared-relicEffects](shared-relicEffects.md) | `supabase/functions/_shared/relicEffects.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-abilityDsl |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 17 | Exploration / Relics | done | migration-034-exploration |
| [fn-game-explore-planet](fn-game-explore-planet.md) | `supabase/functions/game-explore-planet/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-explorationEffects |
| [fn-game-resolve-exploration-card](fn-game-resolve-exploration-card.md) | `supabase/functions/game-resolve-exploration-card/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-explore-frontier](fn-game-explore-frontier.md) | `supabase/functions/game-explore-frontier/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-explorationEffects, shared-abilityDsl |
| [fn-game-use-relic-fragment](fn-game-use-relic-fragment.md) | `supabase/functions/game-use-relic-fragment/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-abilityDsl |
| [fn-game-use-relic](fn-game-use-relic.md) | `supabase/functions/game-use-relic/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration, shared-relicEffects, shared-abilityDsl |
| [fn-game-shuffle-exploration-deck](fn-game-shuffle-exploration-deck.md) | `supabase/functions/game-shuffle-exploration-deck/index.ts` | 17 | Exploration / Relics | done | migration-034-exploration |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 17 | Exploration / Relics | done | fn-game-explore-planet, fn-game-resolve-exploration-card, fn-game-explore-frontier, fn-game-use-relic-fragment, fn-game-use-relic |
| [hook-useExploration](hook-useExploration.md) | `src/hooks/useExploration.js` | 17 | Exploration / Relics | done | client-edgeFunctions |
| [component-ExplorationModal](component-ExplorationModal.md) | `src/components/game/ExplorationModal.jsx` | 17 | Exploration / Relics | done | hook-useExploration |
| [component-RelicFragmentPanel](component-RelicFragmentPanel.md) | `src/components/game/RelicFragmentPanel.jsx` | 17 | Exploration / Relics | done | hook-useExploration |
| [component-RelicPanel](component-RelicPanel.md) | `src/components/game/RelicPanel.jsx` | 17 | Exploration / Relics | done | hook-useExploration |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 17 | Exploration / Relics | done | hook-useExploration, component-ExplorationModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 17 | Exploration / Relics | done | hook-useExploration, component-RelicFragmentPanel, component-RelicPanel |

| [fn-game-move-ships](fn-game-move-ships.md) | `supabase/functions/game-move-ships/index.ts` | 18 | Unit Transport | done | — |
| [hook-useGalaxy](hook-useGalaxy.md) | `src/hooks/useGalaxy.js` | 18 | Unit Transport | done | fn-game-move-ships, client-edgeFunctions |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 18 | Unit Transport | done | fn-game-move-ships |
| [hook-useMovement](hook-useMovement.md) | `src/hooks/useMovement.js` | 18 | Unit Transport | done | client-edgeFunctions |
| [component-MoveShipsModal](component-MoveShipsModal.md) | `src/components/game/MoveShipsModal.jsx` | 18 | Unit Transport | done | hook-useMovement |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 18 | Unit Transport | done | hook-useMovement, component-MoveShipsModal |

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
| [fn-game-commit-ground-forces](fn-game-commit-ground-forces.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [fn-game-advance-phase](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [fn-game-use-relic](fn-game-use-relic.md) | `supabase/functions/game-use-relic/index.ts` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [hook-useLegendaryCards](hook-useLegendaryCards.md) | `src/hooks/useLegendaryCards.js` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets, client-edgeFunctions |
| [component-LegendaryCardPanel](component-LegendaryCardPanel.md) | `src/components/game/LegendaryCardPanel.jsx` | 21 | Legendary Planets & Wormhole Nexus | done | hook-useLegendaryCards |
| [component-EndTurnDialog](component-EndTurnDialog.md) | `src/components/game/EndTurnDialog.jsx` | 21 | Legendary Planets & Wormhole Nexus | done | hook-useLegendaryCards, component-LegendaryCardPanel |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | 21 | Legendary Planets & Wormhole Nexus | done | migration-037-legendary-planets |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 21 | Legendary Planets & Wormhole Nexus | done | hook-useLegendaryCards, component-LegendaryCardPanel |

| [migration-038-gravity-rift](migration-038-gravity-rift.md) | `supabase/migrations/038_gravity_rift.sql` | 25 | Gravity Rift | done | — |
| [fn-game-move-ships-p25](fn-game-move-ships-p25.md) | `supabase/functions/game-move-ships/index.ts` | 25 | Gravity Rift | done | migration-038-gravity-rift, fn-game-move-ships |
| [fn-game-roll-rift-dice](fn-game-roll-rift-dice.md) | `supabase/functions/game-roll-rift-dice/index.ts` | 25 | Gravity Rift | done | migration-038-gravity-rift |
| [client-edgeFunctions-p25](client-edgeFunctions-p25.md) | `src/lib/edgeFunctions.js` | 25 | Gravity Rift | done | fn-game-roll-rift-dice |
| [hook-useRiftTransit](hook-useRiftTransit.md) | `src/hooks/useRiftTransit.js` | 25 | Gravity Rift | done | client-edgeFunctions-p25 |
| [component-RiftTransitModal](component-RiftTransitModal.md) | `src/components/game/RiftTransitModal.jsx` | 25 | Gravity Rift | done | hook-useRiftTransit |
| [component-GameScreen-p25](component-GameScreen-p25.md) | `src/components/game/GameScreen.jsx` | 25 | Gravity Rift | done | hook-useRiftTransit, component-RiftTransitModal |

| [lib-mapParser](lib-mapParser.md) | `src/lib/mapParser.js` | 22 | Map Builder | done | — |
| [component-MapPreviewSection](component-MapPreviewSection.md) | `src/components/game/MapPreviewSection.jsx` | 22 | Map Builder | done | lib-mapParser |
| [component-LobbyScreen-p22](component-LobbyScreen-p22.md) | `src/components/game/LobbyScreen.jsx` | 22 | Map Builder | done | lib-mapParser, component-MapPreviewSection, fn-game-update-settings-p22 |
| [fn-game-update-settings-p22](fn-game-update-settings-p22.md) | `supabase/functions/game-update-settings/index.ts` | 22 | Map Builder | done | — |
| [fn-game-start-p22](fn-game-start-p22.md) | `supabase/functions/game-start/index.ts` | 22 | Map Builder | done | fn-game-update-settings-p22 |

| [fn-admin-update-record](fn-admin-update-record.md) | `supabase/functions/admin-update-record/index.ts` | 23 | Admin: Read Views + Editing | done | — |
| [lib-importSchemas-p23](lib-importSchemas-p23.md) | `src/lib/importSchemas.js` | 23 | Admin: Read Views + Editing | done | — |
| [client-edgeFunctions-p23](client-edgeFunctions-p23.md) | `src/lib/edgeFunctions.js` | 23 | Admin: Read Views + Editing | done | fn-admin-update-record |
| [component-AdminDashboard-p23](component-AdminDashboard-p23.md) | `src/components/admin/AdminDashboard.jsx` | 23 | Admin: Read Views + Editing | done | lib-importSchemas-p23 |
| [component-AdminBrowsePage](component-AdminBrowsePage.md) | `src/components/admin/AdminBrowsePage.jsx` | 23 | Admin: Read Views + Editing | done | lib-importSchemas-p23, client-edgeFunctions-p23 |
| [component-AdminRecordModal](component-AdminRecordModal.md) | `src/components/admin/AdminRecordModal.jsx` | 23 | Admin: Read Views + Editing | done | client-edgeFunctions-p23, lib-importSchemas-p23 |

| [script-parse-lrr](script-parse-lrr.md) | `ti4-companion-web/scripts/parse-lrr.js` | 24 | Rule Lookup | done | — |
| [component-RulesModal](component-RulesModal.md) | `src/components/game/RulesModal.jsx` | 24 | Rule Lookup | done | script-parse-lrr |
| [component-GameHeader-p24](component-GameHeader-p24.md) | `src/components/game/GameHeader.jsx` | 24 | Rule Lookup | done | component-RulesModal |
| [component-GameScreen-p24](component-GameScreen-p24.md) | `src/components/game/GameScreen.jsx` | 24 | Rule Lookup | done | component-RulesModal, component-GameHeader-p24 |

| [migration-039-elimination](migration-039-elimination.md) | `supabase/migrations/039_elimination.sql` | 26 | Player Elimination | done | — |
| [migration-040-draw-action-card-fn](migration-040-draw-action-card-fn.md) | `supabase/migrations/040_draw_action_card_fn.sql` | 27 | Tech Debt | done | — |
| [fn-game-draw-action-card-p27](fn-game-draw-action-card-p27.md) | `supabase/functions/game-draw-action-card/index.ts` | 27 | Tech Debt | done | migration-040-draw-action-card-fn |
| [fn-game-start-p27](fn-game-start-p27.md) | `supabase/functions/game-start/index.ts` | 27 | Tech Debt | done | — |
| [shared-eliminationHandler](shared-eliminationHandler.md) | `supabase/functions/_shared/eliminationHandler.ts` | 26 | Player Elimination | done | migration-039-elimination |
| [fn-game-assign-hits-p26](fn-game-assign-hits-p26.md) | `supabase/functions/game-assign-hits/index.ts` | 26 | Player Elimination | done | shared-eliminationHandler |
| [fn-game-land-troops-p26](fn-game-land-troops-p26.md) | `supabase/functions/game-land-troops/index.ts` | 26 | Player Elimination | done | shared-eliminationHandler |
| [hook-useGame-p26](hook-useGame-p26.md) | `src/hooks/useGame.js` | 26 | Player Elimination | done | migration-039-elimination |
| [component-GameScreen-p26](component-GameScreen-p26.md) | `src/components/game/GameScreen.jsx` | 26 | Player Elimination | done | hook-useGame-p26 |

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
| [fn-game-roll-combat-dice-p30](fn-game-roll-combat-dice-p30.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-roll-combat-dice (p13/p20), migration-043-tech-effects, shared-techEffects |
| [fn-game-roll-ground-combat-dice-p30](fn-game-roll-ground-combat-dice-p30.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-roll-ground-combat-dice (p11), migration-043-tech-effects, shared-techEffects |
| [fn-game-fire-space-cannon-p30](fn-game-fire-space-cannon-p30.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-fire-space-cannon (p13), migration-043-tech-effects, shared-techEffects |
| [fn-game-fire-anti-fighter-barrage-p30](fn-game-fire-anti-fighter-barrage-p30.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-fire-anti-fighter-barrage (p13/p14), migration-043-tech-effects, shared-techEffects |
| [fn-game-activate-system-p30](fn-game-activate-system-p30.md) | `supabase/functions/game-activate-system/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-activate-system-p20, migration-043-tech-effects, shared-techEffects |
| [fn-game-play-action-card-p30](fn-game-play-action-card-p30.md) | `supabase/functions/game-play-action-card/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-play-action-card-p29a, migration-043-tech-effects, shared-techEffects |
| [fn-game-cast-votes-p30](fn-game-cast-votes-p30.md) | `supabase/functions/game-cast-votes/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-cast-votes (p19), migration-043-tech-effects, shared-techEffects |
| [fn-game-end-turn-p30](fn-game-end-turn-p30.md) | `supabase/functions/game-end-turn/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-end-turn (p12), migration-043-tech-effects, shared-techEffects |
| [fn-game-research-technology-p30](fn-game-research-technology-p30.md) | `supabase/functions/game-research-technology/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-research-technology-p29b, migration-043-tech-effects, shared-techEffects |
| [fn-game-explore-planet-p30](fn-game-explore-planet-p30.md) | `supabase/functions/game-explore-planet/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-explore-planet (p17), migration-043-tech-effects, shared-techEffects |
| [fn-game-resolve-ability-p30](fn-game-resolve-ability-p30.md) | `supabase/functions/game-resolve-ability/index.ts` | 30 | Technology Effect Enforcement | done | fn-game-resolve-ability (p21), migration-043-tech-effects, shared-techEffects |
| [lib-techConstants](lib-techConstants.md) | `src/lib/techConstants.js` | 30 | Technology Effect Enforcement | done | — |
| [client-edgeFunctions-p30](client-edgeFunctions-p30.md) | `src/lib/edgeFunctions.js` | 30 | Technology Effect Enforcement | done | fn-game-exhaust-technology, fn-game-ready-technology, fn-game-use-technology-action |
| [hook-useTechnologies](hook-useTechnologies.md) | `src/hooks/useTechnologies.js` | 30 | Technology Effect Enforcement | done | client-edgeFunctions-p30 |
| [component-TechCard-p30](component-TechCard-p30.md) | `src/components/game/TechCard.jsx` | 30 | Technology Effect Enforcement | done | component-TechCard-p28, hook-useTechnologies, lib-techConstants |
| [component-MyPanelSection-p30](component-MyPanelSection-p30.md) | `src/components/game/MyPanelSection.jsx` | 30 | Technology Effect Enforcement | done | component-MyPanelSection (p21), hook-useTechnologies, component-TechCard-p30 |

| [hook-useGalaxy-p31](hook-useGalaxy-p31.md) | `src/hooks/useGalaxy.js` | 31 | System Tile & Planet Detail View | done | — |
| [component-SystemInfoModal](component-SystemInfoModal.md) | `src/components/game/SystemInfoModal.jsx` | 31 | System Tile & Planet Detail View | done | hook-useGalaxy-p31 |
| [component-SystemActionModal-p31](component-SystemActionModal-p31.md) | `src/components/game/SystemActionModal.jsx` | 31 | System Tile & Planet Detail View | done | — |
| [component-MyPanelSection-p31](component-MyPanelSection-p31.md) | `src/components/game/MyPanelSection.jsx` | 31 | System Tile & Planet Detail View | done | hook-useGalaxy-p31 |
| [component-GalaxyTab-p31](component-GalaxyTab-p31.md) | `src/components/game/GalaxyTab.jsx` | 31 | System Tile & Planet Detail View | done | hook-useGalaxy-p31, component-SystemInfoModal, component-SystemActionModal-p31 |
| [component-GameScreen-p31](component-GameScreen-p31.md) | `src/components/game/GameScreen.jsx` | 31 | System Tile & Planet Detail View | done | hook-useGalaxy-p31, component-MyPanelSection-p31 |

| [migration-044-bot-players](migration-044-bot-players.md) | `supabase/migrations/044_bot_players.sql` | 32 | Game Event Log | done | — |
| [migration-045-event-log](migration-045-event-log.md) | `supabase/migrations/045_event_log.sql` | 32 | Game Event Log | done | — |
| [shared-gameEvents](shared-gameEvents.md) | `supabase/functions/_shared/gameEvents.ts` | 32 | Game Event Log | done | migration-045-event-log |
| [fn-event-logging-all](fn-event-logging-all.md) | `supabase/functions/*/index.ts` (all existing) | 32 | Game Event Log | done | shared-gameEvents |

| [shared-auth-p33](shared-auth-p33.md) | `supabase/functions/_shared/auth.ts` | 33 | Bot Players + Undo | done | migration-044-bot-players |
| [fn-game-add-bot](fn-game-add-bot.md) | `supabase/functions/game-add-bot/index.ts` | 33 | Bot Players + Undo | done | migration-044-bot-players, shared-auth-p33, shared-gameEvents |
| [fn-game-remove-bot](fn-game-remove-bot.md) | `supabase/functions/game-remove-bot/index.ts` | 33 | Bot Players + Undo | done | migration-044-bot-players, shared-auth-p33, shared-gameEvents |
| [shared-undoHandlers](shared-undoHandlers.md) | `supabase/functions/_shared/undoHandlers.ts` | 33 | Bot Players + Undo | done | shared-gameEvents |
| [fn-game-undo](fn-game-undo.md) | `supabase/functions/game-undo/index.ts` | 33 | Bot Players + Undo | done | shared-gameEvents, shared-undoHandlers |
| [client-edgeFunctions-p33](client-edgeFunctions-p33.md) | `src/lib/edgeFunctions.js` | 33 | Bot Players + Undo | done | fn-game-add-bot, fn-game-remove-bot, fn-game-undo |
| [lib-botStrategies-scripted](lib-botStrategies-scripted.md) | `src/lib/botStrategies/scripted.js` | 33 | Bot Players + Undo | done | — |
| [lib-botStrategies-random](lib-botStrategies-random.md) | `src/lib/botStrategies/random.js` | 33 | Bot Players + Undo | done | — |
| [hook-useBotPlayer](hook-useBotPlayer.md) | `src/hooks/useBotPlayer.js` | 33 | Bot Players + Undo | done | client-edgeFunctions-p33, lib-botStrategies-scripted, lib-botStrategies-random |
| [component-LobbyScreen-p33](component-LobbyScreen-p33.md) | `src/components/game/LobbyScreen.jsx` | 33 | Bot Players + Undo | done | client-edgeFunctions-p33 |
| [component-GameHeader-p33](component-GameHeader-p33.md) | `src/components/game/GameHeader.jsx` | 33 | Bot Players + Undo | done | client-edgeFunctions-p33 |
| [component-GameScreen-p33](component-GameScreen-p33.md) | `src/components/game/GameScreen.jsx` | 33 | Bot Players + Undo | done | hook-useBotPlayer, component-GameHeader-p33, client-edgeFunctions-p33 |

| [component-HexTile-p34](component-HexTile-p34.md) | `src/components/game/HexTile.jsx` | 34 | Units on Map | done | — |
| [component-UnitTooltip](component-UnitTooltip.md) | `src/components/game/UnitTooltip.jsx` | 34 | Units on Map | done | — |
| [component-HexMap-p34](component-HexMap-p34.md) | `src/components/game/HexMap.jsx` | 34 | Units on Map | done | component-HexTile-p34, component-UnitTooltip |

| [component-SystemInfoModal-p35](component-SystemInfoModal-p35.md) | `src/components/game/SystemInfoModal.jsx` | 35 | Mech Plastic Unit | done | — |
| [component-GalaxyTab-p35](component-GalaxyTab-p35.md) | `src/components/game/GalaxyTab.jsx` | 35 | Mech Plastic Unit | done | component-HexMap-p34, component-SystemInfoModal-p35 |

| [migration-046-objective-conditions](migration-046-objective-conditions.md) | `supabase/migrations/046_objective_conditions.sql` | 36 | Objective Condition Enforcement | done | — |
| [shared-objectiveConditions](shared-objectiveConditions.md) | `supabase/functions/_shared/objectiveConditions.ts` | 36 | Objective Condition Enforcement | done | migration-046-objective-conditions |
| [lib-objectiveEvaluator](lib-objectiveEvaluator.md) | `src/lib/objectiveEvaluator.js` | 36 | Objective Condition Enforcement | done | migration-046-objective-conditions |
| [fn-game-score-objective-p36](fn-game-score-objective-p36.md) | `supabase/functions/game-score-objective/index.ts` | 36 | Objective Condition Enforcement | done | shared-objectiveConditions |
| [fn-game-score-secret-objective-p36](fn-game-score-secret-objective-p36.md) | `supabase/functions/game-score-secret-objective/index.ts` | 36 | Objective Condition Enforcement | done | shared-objectiveConditions |
| [fn-game-assign-hits-p36](fn-game-assign-hits-p36.md) | `supabase/functions/game-assign-hits/index.ts` | 36 | Objective Condition Enforcement | done | migration-046-objective-conditions |
| [hook-useGame-p36](hook-useGame-p36.md) | `src/hooks/useGame.js` | 36 | Objective Condition Enforcement | done | migration-046-objective-conditions |
| [component-ObjectivesSection-p36](component-ObjectivesSection-p36.md) | `src/components/game/ObjectivesSection.jsx` | 36 | Objective Condition Enforcement | done | lib-objectiveEvaluator, hook-useGame-p36 |
| [component-MyPanelSection-p36](component-MyPanelSection-p36.md) | `src/components/game/MyPanelSection.jsx` | 36 | Objective Condition Enforcement | done | lib-objectiveEvaluator, hook-useGame-p36 |

| [migration-047-strategy-card-effects](migration-047-strategy-card-effects.md) | `supabase/migrations/047_strategy_card_effects.sql` | 37 | Strategy Card Text & Ability Enforcement | done | migration-029-strategy-production |
| [lib-strategyCardConstants](lib-strategyCardConstants.md) | `src/lib/strategyCardConstants.js` | 37 | Strategy Card Text & Ability Enforcement | done | — |
| [shared-abilityDsl-p37](shared-abilityDsl-p37.md) | `supabase/functions/_shared/abilityDsl.ts` | 37 | Strategy Card Text & Ability Enforcement | done | migration-047-strategy-card-effects, shared-objectiveConditions |
| [fn-game-play-strategy-card-p37](fn-game-play-strategy-card-p37.md) | `supabase/functions/game-play-strategy-card/index.ts` | 37 | Strategy Card Text & Ability Enforcement | planned | migration-047-strategy-card-effects, shared-abilityDsl-p37 |
| [fn-game-use-strategy-secondary-p37](fn-game-use-strategy-secondary-p37.md) | `supabase/functions/game-use-strategy-secondary/index.ts` | 37 | Strategy Card Text & Ability Enforcement | planned | migration-047-strategy-card-effects, shared-abilityDsl-p37 |
| [fn-game-produce-units-p37](fn-game-produce-units-p37.md) | `supabase/functions/game-produce-units/index.ts` | 37 | Strategy Card Text & Ability Enforcement | planned | fn-game-use-strategy-secondary-p37 |
| [hook-useStrategyCards-p37](hook-useStrategyCards-p37.md) | `src/hooks/useStrategyCards.js` | 37 | Strategy Card Text & Ability Enforcement | planned | fn-game-play-strategy-card-p37, fn-game-use-strategy-secondary-p37 |
| [component-StrategyCardPanel-p37](component-StrategyCardPanel-p37.md) | `src/components/game/StrategyCardPanel.jsx` | 37 | Strategy Card Text & Ability Enforcement | planned | lib-strategyCardConstants, hook-useStrategyCards-p37 |
| [component-StrategyCardModal-p37](component-StrategyCardModal-p37.md) | `src/components/game/StrategyCardModal.jsx` | 37 | Strategy Card Text & Ability Enforcement | planned | lib-strategyCardConstants, hook-useStrategyCards-p37, component-StrategyCardPanel-p37 |

| [fn-game-declare-retreat-p38](fn-game-declare-retreat-p38.md) | `supabase/functions/game-declare-retreat/index.ts` | 38 | Dark Energy Tap | planned | fn-game-declare-retreat-p20 |
| [component-SystemActionModal-p38](component-SystemActionModal-p38.md) | `src/components/game/SystemActionModal.jsx` | 38 | Dark Energy Tap | planned | component-SystemActionModal (p31) |
| [component-GalaxyTab-p38](component-GalaxyTab-p38.md) | `src/components/game/GalaxyTab.jsx` | 38 | Dark Energy Tap | planned | component-SystemActionModal-p38, component-GalaxyTab-p35 |

| [migration-048-promissory-dsl](migration-048-promissory-dsl.md) | `supabase/migrations/048_promissory_dsl.sql` | 39a | Promissory Note DSL Effects | planned | migration-032-promissory-effects |
| [shared-abilityDsl-p39a](shared-abilityDsl-p39a.md) | `supabase/functions/_shared/abilityDsl.ts` | 39a | Promissory Note DSL Effects | planned | migration-048-promissory-dsl |
| [shared-promissoryHandlers-p39a](shared-promissoryHandlers-p39a.md) | `supabase/functions/_shared/promissoryHandlers.ts` | 39a | Promissory Note DSL Effects | done | shared-abilityDsl-p39a |
| [shared-promissoryEnforcement-p39a](shared-promissoryEnforcement-p39a.md) | `supabase/functions/_shared/promissoryEnforcement.ts` | 39a | Promissory Note DSL Effects | planned | shared-promissoryHandlers-p39a |
| [fn-game-play-promissory-note-p39a](fn-game-play-promissory-note-p39a.md) | `supabase/functions/game-play-promissory-note/index.ts` | 39a | Promissory Note DSL Effects | planned | shared-abilityDsl-p39a, shared-promissoryHandlers-p39a |

| [fn-game-confirm-transaction-p39b](fn-game-confirm-transaction-p39b.md) | `supabase/functions/game-confirm-transaction/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-activate-system-p39b](fn-game-activate-system-p39b.md) | `supabase/functions/game-activate-system/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-advance-phase-p39b](fn-game-advance-phase-p39b.md) | `supabase/functions/game-advance-phase/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-create-transaction-p39b](fn-game-create-transaction-p39b.md) | `supabase/functions/game-create-transaction/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-cast-votes-p39b](fn-game-cast-votes-p39b.md) | `supabase/functions/game-cast-votes/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-produce-units-p39b](fn-game-produce-units-p39b.md) | `supabase/functions/game-produce-units/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-roll-combat-dice-p39b](fn-game-roll-combat-dice-p39b.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a |
| [fn-game-roll-ground-combat-dice-p39b](fn-game-roll-ground-combat-dice-p39b.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a |
| [fn-game-fire-anti-fighter-barrage-p39b](fn-game-fire-anti-fighter-barrage-p39b.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-fire-space-cannon-p39b](fn-game-fire-space-cannon-p39b.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-research-technology-p39b](fn-game-research-technology-p39b.md) | `supabase/functions/game-research-technology/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-commit-ground-forces-p39b](fn-game-commit-ground-forces-p39b.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-resolve-ability-p39b](fn-game-resolve-ability-p39b.md) | `supabase/functions/game-resolve-ability/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |
| [fn-game-end-turn-p39b](fn-game-end-turn-p39b.md) | `supabase/functions/game-end-turn/index.ts` | 39b | Promissory Note DSL Effects | planned | fn-game-play-promissory-note-p39a, shared-promissoryEnforcement-p39a |

| [shared-promissoryHandlers-p39c](shared-promissoryHandlers-p39c.md) | `supabase/functions/_shared/promissoryHandlers.ts` | 39c | Promissory Note DSL Effects | planned | shared-promissoryHandlers-p39a, fn-game-confirm-transaction-p39b, fn-game-activate-system-p39b, fn-game-advance-phase-p39b, fn-game-end-turn-p39b |

| [migration-050-mech-abilities](migration-050-mech-abilities.md) | `supabase/migrations/050_mech_abilities.sql` | 39 | Mech Unit Card Abilities | planned | — |
| [fn-admin-import-units-mech](fn-admin-import-units-mech.md) | `supabase/functions/admin-import-units/index.ts` | 39 | Mech Unit Card Abilities | planned | migration-050-mech-abilities |
| [lib-importSchemas-mech](lib-importSchemas-mech.md) | `src/lib/importSchemas.js` | 39 | Mech Unit Card Abilities | planned | migration-050-mech-abilities |
| [fn-game-resolve-ability-mech](fn-game-resolve-ability-mech.md) | `supabase/functions/game-resolve-ability/index.ts` | 39 | Mech Unit Card Abilities | planned | migration-050-mech-abilities |
| [fn-game-deploy-mech](fn-game-deploy-mech.md) | `supabase/functions/game-deploy-mech/index.ts` | 39 | Mech Unit Card Abilities | planned | migration-050-mech-abilities |
| [client-edgeFunctions-mech](client-edgeFunctions-mech.md) | `src/lib/edgeFunctions.js` | 39 | Mech Unit Card Abilities | planned | fn-game-deploy-mech, fn-game-resolve-ability-mech |
| [hook-useLeaders-mech](hook-useLeaders-mech.md) | `src/hooks/useLeaders.js` | 39 | Mech Unit Card Abilities | planned | client-edgeFunctions-mech |
| [component-LeaderCard-mech](component-LeaderCard-mech.md) | `src/components/game/LeaderCard.jsx` | 39 | Mech Unit Card Abilities | planned | hook-useLeaders-mech |
| [component-LeaderPanel-mech](component-LeaderPanel-mech.md) | `src/components/game/LeaderPanel.jsx` | 39 | Mech Unit Card Abilities | planned | component-LeaderCard-mech |
| [component-MyPanelSection-mech](component-MyPanelSection-mech.md) | `src/components/game/MyPanelSection.jsx` | 39 | Mech Unit Card Abilities | planned | component-LeaderPanel-mech |

| [migration-048-draft-state](migration-048-draft-state.md) | `supabase/migrations/048_draft_state.sql` | 39 | In-App Map Draft | planned | — |
| [shared-draftHelpers](shared-draftHelpers.md) | `supabase/functions/_shared/draftHelpers.ts` | 39 | In-App Map Draft | planned | migration-048-draft-state |
| [fn-game-start-draft](fn-game-start-draft.md) | `supabase/functions/game-start-draft/index.ts` | 39 | In-App Map Draft | planned | migration-048-draft-state, shared-draftHelpers |
| [fn-game-draft-pick-slice](fn-game-draft-pick-slice.md) | `supabase/functions/game-draft-pick-slice/index.ts` | 39 | In-App Map Draft | planned | fn-game-start-draft, shared-draftHelpers |
| [fn-game-draft-place-tile](fn-game-draft-place-tile.md) | `supabase/functions/game-draft-place-tile/index.ts` | 39 | In-App Map Draft | planned | fn-game-start-draft, shared-draftHelpers |
| [client-edgeFunctions-p39](client-edgeFunctions-p39.md) | `src/lib/edgeFunctions.js` | 39 | In-App Map Draft | planned | fn-game-start-draft, fn-game-draft-pick-slice, fn-game-draft-place-tile |
| [hook-useDraft](hook-useDraft.md) | `src/hooks/useDraft.js` | 39 | In-App Map Draft | planned | client-edgeFunctions-p39 |
| [component-DraftTileHand](component-DraftTileHand.md) | `src/components/game/DraftTileHand.jsx` | 39 | In-App Map Draft | planned | hook-useDraft |
| [component-DraftSlicePickView](component-DraftSlicePickView.md) | `src/components/game/DraftSlicePickView.jsx` | 39 | In-App Map Draft | planned | component-DraftTileHand |
| [component-DraftPlacementView](component-DraftPlacementView.md) | `src/components/game/DraftPlacementView.jsx` | 39 | In-App Map Draft | planned | component-DraftTileHand |
| [component-DraftPanel](component-DraftPanel.md) | `src/components/game/DraftPanel.jsx` | 39 | In-App Map Draft | planned | component-DraftSlicePickView, component-DraftPlacementView |
| [component-LobbyScreen-p39](component-LobbyScreen-p39.md) | `src/components/game/LobbyScreen.jsx` | 39 | In-App Map Draft | planned | component-DraftPanel, hook-useDraft, client-edgeFunctions-p39 |

| [migration-049-law-enforcement](migration-049-law-enforcement.md) | `supabase/migrations/049_law_enforcement.sql` | 40 | Persistent Agenda Law Enforcement | planned | — |
| [fn-game-resolve-agenda-p40](fn-game-resolve-agenda-p40.md) | `supabase/functions/game-resolve-agenda/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | migration-049-law-enforcement |
| [shared-lawEffects](shared-lawEffects.md) | `supabase/functions/_shared/lawEffects.ts` | 40 | Persistent Agenda Law Enforcement | planned | migration-049-law-enforcement |
| [shared-abilityDsl-p40](shared-abilityDsl-p40.md) | `supabase/functions/_shared/abilityDsl.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects |
| [fn-game-produce-units-p40](fn-game-produce-units-p40.md) | `supabase/functions/game-produce-units/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects |
| [fn-game-move-ships-p40](fn-game-move-ships-p40.md) | `supabase/functions/game-move-ships/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects |
| [fn-game-land-troops-p40](fn-game-land-troops-p40.md) | `supabase/functions/game-land-troops/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects |
| [fn-game-assign-hits-p40](fn-game-assign-hits-p40.md) | `supabase/functions/game-assign-hits/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects |
| [fn-game-advance-phase-p40](fn-game-advance-phase-p40.md) | `supabase/functions/game-advance-phase/index.ts` | 40 | Persistent Agenda Law Enforcement | planned | shared-lawEffects, migration-049-law-enforcement |

| [migration-051-exploration-fixes](migration-051-exploration-fixes.md) | `supabase/migrations/051_exploration_fixes.sql` | 41 | Exploration Full Validation | planned | — |
| [shared-abilityDsl-p39](shared-abilityDsl-p39.md) | `supabase/functions/_shared/abilityDsl.ts` | 41 | Exploration Full Validation | planned | migration-051-exploration-fixes, shared-abilityDsl |
| [shared-explorationEffects-p39](shared-explorationEffects-p39.md) | `supabase/functions/_shared/explorationEffects.ts` | 41 | Exploration Full Validation | planned | shared-explorationEffects, shared-abilityDsl-p39 |
| [fn-game-explore-planet-p39](fn-game-explore-planet-p39.md) | `supabase/functions/game-explore-planet/index.ts` | 41 | Exploration Full Validation | planned | fn-game-explore-planet, migration-051-exploration-fixes |
| [fn-game-explore-frontier-p39](fn-game-explore-frontier-p39.md) | `supabase/functions/game-explore-frontier/index.ts` | 41 | Exploration Full Validation | planned | fn-game-explore-frontier, migration-051-exploration-fixes, shared-explorationEffects-p39 |
| [fn-game-resolve-exploration-card-p39](fn-game-resolve-exploration-card-p39.md) | `supabase/functions/game-resolve-exploration-card/index.ts` | 41 | Exploration Full Validation | planned | fn-game-resolve-exploration-card, migration-051-exploration-fixes, shared-explorationEffects-p39, shared-abilityDsl-p39 |
| [fn-game-use-enigmatic-device](fn-game-use-enigmatic-device.md) | `supabase/functions/game-use-enigmatic-device/index.ts` | 41 | Exploration Full Validation | planned | migration-051-exploration-fixes, shared-abilityDsl |
| [fn-game-land-troops-p39](fn-game-land-troops-p39.md) | `supabase/functions/game-land-troops/index.ts` | 41 | Exploration Full Validation | planned | fn-game-land-troops-p26, migration-051-exploration-fixes |
| [client-edgeFunctions-exploration-fixes](client-edgeFunctions-exploration-fixes.md) | `src/lib/edgeFunctions.js` | 41 | Exploration Full Validation | planned | fn-game-use-enigmatic-device |
| [shared-relicEffects-p42](shared-relicEffects-p42.md) | `supabase/functions/_shared/relicEffects.ts` | 42 | Relic Card Effects A | planned | shared-relicEffects, shared-abilityDsl |
| [shared-abilityDsl-p42](shared-abilityDsl-p42.md) | `supabase/functions/_shared/abilityDsl.ts` | 42 | Relic Card Effects A | planned | shared-abilityDsl, shared-relicEffects-p42 |
| [fn-game-use-relic-p42](fn-game-use-relic-p42.md) | `supabase/functions/game-use-relic/index.ts` | 42 | Relic Card Effects A | planned | fn-game-use-relic, shared-relicEffects-p42, shared-abilityDsl-p42 |
| [fn-game-use-relic-fragment-p42](fn-game-use-relic-fragment-p42.md) | `supabase/functions/game-use-relic-fragment/index.ts` | 42 | Relic Card Effects A | planned | fn-game-use-relic-fragment, shared-relicEffects-p42, shared-abilityDsl-p42 |
| [fn-game-resolve-exploration-card-p42](fn-game-resolve-exploration-card-p42.md) | `supabase/functions/game-resolve-exploration-card/index.ts` | 42 | Relic Card Effects A | planned | fn-game-resolve-exploration-card, shared-relicEffects-p42, shared-abilityDsl-p42 |
| [client-edgeFunctions-p42](client-edgeFunctions-p42.md) | `src/lib/edgeFunctions.js` | 42 | Relic Card Effects A | planned | fn-game-use-relic-p42 |
| [component-DiscardBrowserModal](component-DiscardBrowserModal.md) | `src/components/game/DiscardBrowserModal.jsx` | 42 | Relic Card Effects A | planned | client-edgeFunctions-p42 |
| [component-RelicPanel-p42](component-RelicPanel-p42.md) | `src/components/game/RelicPanel.jsx` | 42 | Relic Card Effects A | planned | component-RelicPanel, component-DiscardBrowserModal, client-edgeFunctions-p42 |

| [migration-052-leader-abilities](migration-052-leader-abilities.md) | `supabase/migrations/052_leader_abilities.sql` | 43a | Leader Card Abilities — Agents | planned | — |
| [lib-leaderConstants](lib-leaderConstants.md) | `src/lib/leaderConstants.js` | 43a | Leader Card Abilities — Agents | planned | — |
| [component-LeaderAbilityModal](component-LeaderAbilityModal.md) | `src/components/game/LeaderAbilityModal.jsx` | 43a | Leader Card Abilities — Agents | planned | lib-leaderConstants |
| [shared-leaderEffects](shared-leaderEffects.md) | `supabase/functions/_shared/leaderEffects.ts` | 43a | Leader Card Abilities — Agents | planned | migration-052-leader-abilities |
| [shared-abilityDsl-p43a](shared-abilityDsl-p43a.md) | `supabase/functions/_shared/abilityDsl.ts` | 43a | Leader Card Abilities — Agents | planned | migration-052-leader-abilities |
| [shared-abilityHandlers-p43a](shared-abilityHandlers-p43a.md) | `supabase/functions/_shared/abilityHandlers.ts` | 43a | Leader Card Abilities — Agents | planned | shared-leaderEffects, shared-abilityDsl-p43a |
| [fn-game-resolve-ability-p43a](fn-game-resolve-ability-p43a.md) | `supabase/functions/game-resolve-ability/index.ts` | 43a | Leader Card Abilities — Agents | planned | shared-leaderEffects, shared-abilityDsl-p43a, shared-abilityHandlers-p43a |
| [fn-game-advance-phase-p43a](fn-game-advance-phase-p43a.md) | `supabase/functions/game-advance-phase/index.ts` | 43a | Leader Card Abilities — Agents | planned | migration-052-leader-abilities, shared-leaderEffects |
| [fn-game-activate-system-p43a](fn-game-activate-system-p43a.md) | `supabase/functions/game-activate-system/index.ts` | 43a | Leader Card Abilities — Agents | planned | shared-leaderEffects |
| [fn-game-produce-units-p43a](fn-game-produce-units-p43a.md) | `supabase/functions/game-produce-units/index.ts` | 43a | Leader Card Abilities — Agents | planned | shared-leaderEffects |
| [fn-game-assign-hits-p43a](fn-game-assign-hits-p43a.md) | `supabase/functions/game-assign-hits/index.ts` | 43a | Leader Card Abilities — Agents | planned | shared-leaderEffects |
| [hook-useLeaders-p43a](hook-useLeaders-p43a.md) | `src/hooks/useLeaders.js` | 43a | Leader Card Abilities — Agents | planned | component-LeaderAbilityModal, lib-leaderConstants |
| [component-LeaderPanel-p43a](component-LeaderPanel-p43a.md) | `src/components/game/LeaderPanel.jsx` | 43a | Leader Card Abilities — Agents | planned | hook-useLeaders-p43a, component-LeaderAbilityModal |
| [component-GameScreen-p43a](component-GameScreen-p43a.md) | `src/components/game/GameScreen.jsx` | 43a | Leader Card Abilities — Agents | planned | hook-useLeaders-p43a |

| [shared-leaderEffects-p43b](shared-leaderEffects-p43b.md) | `supabase/functions/_shared/leaderEffects.ts` | 43b | Leader Card Abilities — Heroes | planned | shared-leaderEffects |
| [shared-abilityHandlers-p43b](shared-abilityHandlers-p43b.md) | `supabase/functions/_shared/abilityHandlers.ts` | 43b | Leader Card Abilities — Heroes | planned | shared-leaderEffects-p43b |
| [fn-game-resolve-ability-p43b](fn-game-resolve-ability-p43b.md) | `supabase/functions/game-resolve-ability/index.ts` | 43b | Leader Card Abilities — Heroes | planned | fn-game-resolve-ability-p43a, shared-leaderEffects-p43b, shared-abilityHandlers-p43b |
| [fn-game-advance-phase-p43b](fn-game-advance-phase-p43b.md) | `supabase/functions/game-advance-phase/index.ts` | 43b | Leader Card Abilities — Heroes | planned | fn-game-advance-phase-p43a, migration-052-leader-abilities |
| [component-LeaderAbilityModal-p43b](component-LeaderAbilityModal-p43b.md) | `src/components/game/LeaderAbilityModal.jsx` | 43b | Leader Card Abilities — Heroes | planned | component-LeaderAbilityModal, lib-leaderConstants |

| [shared-commanderUnlock](shared-commanderUnlock.md) | `supabase/functions/_shared/commanderUnlock.ts` | 43c | Leader Card Abilities — Commander Passives | planned | migration-052-leader-abilities |
| [fn-game-unlock-commander](fn-game-unlock-commander.md) | `supabase/functions/game-unlock-commander/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-commanderUnlock, migration-052-leader-abilities |
| [shared-leaderEffects-p43c](shared-leaderEffects-p43c.md) | `supabase/functions/_shared/leaderEffects.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects |
| [shared-abilityHandlers-p43c](shared-abilityHandlers-p43c.md) | `supabase/functions/_shared/abilityHandlers.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c |
| [fn-game-produce-units-p43c](fn-game-produce-units-p43c.md) | `supabase/functions/game-produce-units/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-research-technology-p43c](fn-game-research-technology-p43c.md) | `supabase/functions/game-research-technology/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-assign-hits-p43c](fn-game-assign-hits-p43c.md) | `supabase/functions/game-assign-hits/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-commit-ground-forces-p43c](fn-game-commit-ground-forces-p43c.md) | `supabase/functions/game-commit-ground-forces/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-roll-combat-dice-p43c](fn-game-roll-combat-dice-p43c.md) | `supabase/functions/game-roll-combat-dice/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-roll-ground-combat-dice-p43c](fn-game-roll-ground-combat-dice-p43c.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c, fn-game-roll-combat-dice-p43c |
| [fn-game-fire-bombardment-p43c](fn-game-fire-bombardment-p43c.md) | `supabase/functions/game-fire-bombardment/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-fire-space-cannon-p43c](fn-game-fire-space-cannon-p43c.md) | `supabase/functions/game-fire-space-cannon/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-fire-anti-fighter-barrage-p43c](fn-game-fire-anti-fighter-barrage-p43c.md) | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-activate-system-p43c](fn-game-activate-system-p43c.md) | `supabase/functions/game-activate-system/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c, fn-game-activate-system-p43a |
| [fn-game-move-ships-p43c](fn-game-move-ships-p43c.md) | `supabase/functions/game-move-ships/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-play-strategy-card-p43c](fn-game-play-strategy-card-p43c.md) | `supabase/functions/game-play-strategy-card/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-cast-votes-p43c](fn-game-cast-votes-p43c.md) | `supabase/functions/game-cast-votes/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, shared-abilityHandlers-p43c |
| [fn-game-resolve-commander-reroll](fn-game-resolve-commander-reroll.md) | `supabase/functions/game-resolve-commander-reroll/index.ts` | 43c | Leader Card Abilities — Commander Passives | planned | shared-leaderEffects-p43c, migration-052-leader-abilities |
| [client-edgeFunctions-p43c](client-edgeFunctions-p43c.md) | `src/lib/edgeFunctions.js` | 43c | Leader Card Abilities — Commander Passives | planned | fn-game-unlock-commander, fn-game-resolve-commander-reroll |
| [hook-useLeaders-p43c](hook-useLeaders-p43c.md) | `src/hooks/useLeaders.js` | 43c | Leader Card Abilities — Commander Passives | planned | client-edgeFunctions-p43c, hook-useLeaders-p43a |
| [component-CommanderRerollModal](component-CommanderRerollModal.md) | `src/components/game/CommanderRerollModal.jsx` | 43c | Leader Card Abilities — Commander Passives | planned | hook-useLeaders-p43c |
| [component-GameScreen-p43c](component-GameScreen-p43c.md) | `src/components/game/GameScreen.jsx` | 43c | Leader Card Abilities — Commander Passives | planned | hook-useLeaders-p43c, component-CommanderRerollModal |

| [migration-053-titans-ul-attachments](migration-053-titans-ul-attachments.md) | `supabase/migrations/053_titans_ul_attachments.sql` | 44 | TE — Titans of Ul Attachments | done | — |
| [fn-game-play-promissory-note-p44](fn-game-play-promissory-note-p44.md) | `supabase/functions/game-play-promissory-note/index.ts` | 44 | TE — Titans of Ul Attachments | done | migration-053-titans-ul-attachments |
| [shared-abilityHandlers-p44](shared-abilityHandlers-p44.md) | `supabase/functions/_shared/abilityHandlers.ts` | 44 | TE — Titans of Ul Attachments | done | migration-053-titans-ul-attachments |
| [fn-game-resolve-ability-p44](fn-game-resolve-ability-p44.md) | `supabase/functions/game-resolve-ability/index.ts` | 44 | TE — Titans of Ul Attachments | done | shared-abilityHandlers-p44 |
| [client-edgeFunctions-p44](client-edgeFunctions-p44.md) | `src/lib/edgeFunctions.js` | 44 | TE — Titans of Ul Attachments | done | fn-game-play-promissory-note-p44 |
| [component-PromissoryNotesModal-p44](component-PromissoryNotesModal-p44.md) | `src/components/game/PromissoryNotesModal.jsx` | 44 | TE — Titans of Ul Attachments | done | client-edgeFunctions-p44 |
| [component-LeaderCard-p44](component-LeaderCard-p44.md) | `src/components/game/LeaderCard.jsx` | 44 | TE — Titans of Ul Attachments | done | — |

| [component-GameIcon](component-GameIcon.md) | `src/components/shared/GameIcon.jsx` | UI | SVG Icon Integration | planned | — |
| [component-TechCard-icon-integration](component-TechCard-icon-integration.md) | `src/components/game/TechCard.jsx` | UI | SVG Icon Integration | planned | component-GameIcon |
| [component-MyPanelSection-icon-integration](component-MyPanelSection-icon-integration.md) | `src/components/game/MyPanelSection.jsx` | UI | SVG Icon Integration | planned | component-GameIcon |
| [component-LeaderCard-icon-integration](component-LeaderCard-icon-integration.md) | `src/components/game/LeaderCard.jsx` | UI | SVG Icon Integration | planned | component-GameIcon |
| [component-HexTile-icon-integration](component-HexTile-icon-integration.md) | `src/components/game/HexTile.jsx` | UI | SVG Icon Integration | planned | component-GameIcon |

---

## Planned Feature Areas (specs to be added)

Phases 24+ are listed in suggested implementation order. Phases 17–23 have spec files in the main table above.

| Phase | Feature Area | Priority | Notes |
|-------|-------------|----------|-------|
| 30 | Technology Effect Enforcement | Medium | Spec files added to main table above. |
| 31 | System Tile & Planet Detail View | Low | Spec files added to main table above. |
| 32 | Game Event Log | High | Spec files added to main table above. |
| 33 | Bot Players + Undo | High | Spec files added to main table above. |
