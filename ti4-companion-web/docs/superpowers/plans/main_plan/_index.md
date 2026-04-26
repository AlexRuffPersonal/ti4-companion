# Remaining Feature Specs — Index

Status: `done` | `in-progress` | `planned` | `deferred`

See [_standards.md](_standards.md) for shorthand used in all spec files.

---

## All Spec Files

| Spec File | Actual File | Feature Area | Status | Depends On |
|-----------|-------------|-------------|--------|-----------|
| [migration-028-ground-combat](migration-028-ground-combat.md) | `supabase/migrations/028_ground_combat.sql` | Ground Combat | in-progress | — |
| [fn-game-land-troops](fn-game-land-troops.md) | `supabase/functions/game-land-troops/index.ts` | Ground Combat | in-progress | migration-028 |
| [fn-game-roll-ground-combat-dice](fn-game-roll-ground-combat-dice.md) | `supabase/functions/game-roll-ground-combat-dice/index.ts` | Ground Combat | in-progress | migration-028 |
| [fn-game-assign-ground-hits](fn-game-assign-ground-hits.md) | `supabase/functions/game-assign-ground-hits/index.ts` | Ground Combat | in-progress | migration-028, fn-game-land-troops |
| [client-edgeFunctions](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | Ground Combat | in-progress | fn-game-roll-ground-combat-dice, fn-game-assign-ground-hits |
| [hook-useCombat](hook-useCombat.md) | `src/hooks/useCombat.js` | Ground Combat | in-progress | client-edgeFunctions |
| [component-GroundCombatModal](component-GroundCombatModal.md) | `src/components/game/GroundCombatModal.jsx` | Ground Combat | in-progress | hook-useCombat |
| [component-GalaxyTab](component-GalaxyTab.md) | `src/components/game/GalaxyTab.jsx` | Ground Combat | in-progress | component-GroundCombatModal |
| [migration-029-strategy-production](migration-029-strategy-production.md) | `supabase/migrations/029_strategy_production.sql` | Strategy Cards & Production | planned | — |
| [shared-abilityDsl](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | Strategy Cards & Production | planned | migration-029-strategy-production |
| [fn-game-resolve-ability](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | Strategy Cards & Production | planned | shared-abilityDsl |
| [fn-game-play-strategy-card](fn-game-play-strategy-card.md) | `supabase/functions/game-play-strategy-card/index.ts` | Strategy Cards & Production | planned | migration-029-strategy-production, fn-game-resolve-ability |
| [fn-game-use-strategy-secondary](fn-game-use-strategy-secondary.md) | `supabase/functions/game-use-strategy-secondary/index.ts` | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [fn-game-pass-strategy-secondary](fn-game-pass-strategy-secondary.md) | `supabase/functions/game-pass-strategy-secondary/index.ts` | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [fn-game-produce-units](fn-game-produce-units.md) | `supabase/functions/game-produce-units/index.ts` | Strategy Cards & Production | planned | migration-029-strategy-production |
| [fn-game-end-turn](fn-game-end-turn.md) | `supabase/functions/game-end-turn/index.ts` | Strategy Cards & Production | planned | fn-game-play-strategy-card |
| [hook-useStrategyCards](hook-useStrategyCards.md) | `src/hooks/useStrategyCards.js` | Strategy Cards & Production | planned | client-edgeFunctions |
| [component-StrategyCardPanel](component-StrategyCardPanel.md) | `src/components/game/StrategyCardPanel.jsx` | Strategy Cards & Production | planned | hook-useStrategyCards |
| [component-StrategyCardModal](component-StrategyCardModal.md) | `src/components/game/StrategyCardModal.jsx` | Strategy Cards & Production | planned | hook-useStrategyCards |
| [component-ProductionModal](component-ProductionModal.md) | `src/components/game/ProductionModal.jsx` | Strategy Cards & Production | planned | client-edgeFunctions |
| [component-SystemActionModal](component-SystemActionModal.md) | `src/components/game/SystemActionModal.jsx` | Strategy Cards & Production | planned | component-ProductionModal |
| [component-MyPanelSection](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | Strategy Cards & Production | planned | component-StrategyCardPanel |
| [component-GameScreen](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | Strategy Cards & Production | planned | hook-useStrategyCards, component-StrategyCardModal |

---

## Planned Feature Areas (specs to be added)

| Feature Area | Priority | Notes |
|-------------|----------|-------|
| Bombardment | medium | Pre-ground-combat step; ships with `bombardment` stat fire before troops land |
| Planet Exploration | medium | Draw exploration card when capturing unclaimed planet |
| Promissory Note Effects | high | `game-play-promissory-note` currently only transitions state; needs effect application |
| Unit Transport | medium | Fleet carrying capacity; carry infantry/fighters between systems |
| Map Builder | low | Paste map string in lobby; parse into `games.map_tiles` |
| Admin Read Views | low | Browse imported reference records per table |
