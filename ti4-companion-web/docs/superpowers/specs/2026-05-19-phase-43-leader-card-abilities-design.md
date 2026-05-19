# Phase 43 â€” Leader Card Ability Enforcement

**Date:** 2026-05-19
**Scope:** Full enforcement of all 72 leader abilities across 24 factions (agents, commanders, heroes).
**Rules basis:** LRR Â§50â€“51 (Leader Sheet, Leaders). Agent exhaust/ready cycle Â§51.3â€“51.4. Commander unlock Â§51.5â€“51.8. Hero unlock and purge Â§51.9â€“51.12.

---

## 1. Architecture Overview

The design centres on a single new shared module â€” `shared-leaderEffects.ts` â€” holding all 72 leader ability definitions as static TypeScript records, mirroring the `relicEffects.ts` / `techEffects.ts` pattern. Three registries live in this file:

```
AGENT_ABILITIES:        Record<faction, Op[] | HandlerRef>
HERO_ABILITIES:         Record<faction, Op[] | HandlerRef>
COMMANDER_PASSIVES:     Record<faction, CommanderPassive>
AGENT_REACTIVE_TRIGGERS: Record<faction, CommanderTrigger[]>
```

**Agents and heroes** are activated explicitly via the "USE ABILITY" button. The call goes to `game-resolve-ability` with `source_type='leader'`. A new `leader` branch (parallel to the Phase 21 `legendary_card` branch) looks up the ability from the registry, executes it via DSL `interpretEffects` or a named `abilityHandlers.ts` entry, then writes the side-effect: `game_players.leaders.agent = 'exhausted'` for agents, `game_players.leaders.hero = 'purged'` for heroes.

For **reactive agents** (triggered by another player's action), the triggering function checks `AGENT_REACTIVE_TRIGGERS` at the end of its execution and returns a `pending_window` of type `reactive_agent` listing eligible agent owners. Those players respond via `game-resolve-ability` or `game-pass-action-window`, matching the Phase 29 action window pattern.

**Commanders** are handled across two sub-systems:
- *Unlock*: a new `fn-game-unlock-commander` function validates the faction-specific condition server-side when a player clicks "CHECK UNLOCK".
- *Passives*: a new `applyCommanderPassives(trigger, context, db)` function is called in affected Edge Functions alongside existing `applyTechEffects(...)` calls. It returns inline effects (applied immediately) and pending windows (appended to the response for optional player choices).

A new **`LeaderAbilityModal`** component handles target selection for agents and heroes that require player input before resolution.

The phase is split into three sub-phases, each independently shippable:
- **40a**: Infrastructure + all 24 faction agents
- **40b**: All 24 faction heroes
- **40c**: Commander unlock (fn-game-unlock-commander) + all 24 commander passives hooked into affected Edge Functions

---

## 2. `shared-leaderEffects.ts`

### Types

```typescript
export type CommanderTrigger =
  | 'PRODUCTION'
  | 'TECH_RESEARCHED'
  | 'SUSTAIN_DAMAGE'
  | 'GROUND_COMBAT_START'
  | 'COMBAT_ROLL'
  | 'UNIT_ABILITY_ROLL'
  | 'BOMBARDMENT'
  | 'SYSTEM_ACTIVATED'
  | 'SHIPS_MOVED'
  | 'PLANET_CONTROL_GAINED'
  | 'STRATEGY_TOKEN_SPENT'
  | 'CAST_VOTES'

export interface CommanderPassive {
  trigger: CommanderTrigger
  mode: 'inline' | 'window'
  condition?: string           // human-readable guard clause
  effect: Op[] | string        // Op[] = DSL; string = named handler key
  targetPlayer?: 'self' | 'activating' | 'any'
}
```

### Registries (representative samples)

**AGENT_ABILITIES** â€” keyed by faction name, value is `Op[]` or handler key string:
```typescript
'The Titans Of Ul':      [{ op: 'cancel_hit', target: 'either' }]
'The Emirates Of Hacan': [{ op: 'choice', options: [
  [{ op: 'gain_commodities', amount: 2, target: 'self' }],
  [{ op: 'replenish_commodities', target: 'chosen_player' }]
]}]
'The Yssaril Tribes':    'ssruu_copies_agents'   // display-only handler
```

**HERO_ABILITIES** â€” keyed by faction name:
```typescript
'The Federation Of Sol':  [{ op: 'reclaim_command_tokens' }]
'The Arborec':            [{ op: 'produce_in_systems_with_ground_forces' }]
'The Emirates Of Hacan':  [{ op: 'produce_units_free' }]
'The Ghosts Of Creuss':   'creuss_riftwalker'
'The Mahact Gene-Sorcerers': 'mahact_hero'
'The Winnu':              'winnu_mathis'
```

**COMMANDER_PASSIVES** â€” keyed by faction name:
```typescript
'The L1Z1X Mindnet':    [{ trigger:'BOMBARDMENT',        mode:'inline', effect:'l1z1x_skip_planetary_shield' }]
'The Titans Of Ul':     [{ trigger:'PRODUCTION',         mode:'window', targetPlayer:'self', effect:[{ op:'gain_trade_goods', amount:1 }] }]
'The Arborec':          [{ trigger:'SYSTEM_ACTIVATED',   mode:'window', targetPlayer:'any',  condition:'system contains Arborec production unit', effect:[{ op:'produce_units', count:1, in_system:'active' }] }]
'The Xxcha Kingdom':    [{ trigger:'CAST_VOTES',         mode:'inline', targetPlayer:'self', effect:'xxcha_extra_vote_per_planet' }]
'The Ghosts Of Creuss': [{ trigger:'SHIPS_MOVED',        mode:'window', targetPlayer:'self', condition:'ship moved through wormhole and has unused capacity', effect:[{ op:'place_units', unit_type:'fighter', count:1, target:'active_system' }] }]
```

**AGENT_REACTIVE_TRIGGERS** â€” maps faction to the trigger types that can prompt their agent as a reactive window:
```typescript
'The Ghosts Of Creuss':   ['SYSTEM_ACTIVATED']
'The Arborec':            ['SYSTEM_ACTIVATED']
'The Empyrean':           ['SHIPS_MOVED']
'The Barony Of Letnev':   ['GROUND_COMBAT_START']
'The Federation Of Sol':  ['GROUND_COMBAT_START']
'The Yssaril Tribes':     ['SYSTEM_ACTIVATED']
// ... all reactive agents listed
```

### New DSL ops (Phase 43a/40b additions to `abilityDsl.ts`)

| Op | Description |
|---|---|
| `reclaim_command_tokens` | Remove all activating player's tactic tokens from board, return to reinforcements |
| `produce_in_systems_with_ground_forces` | Produce any number of units in any system containing the player's ground forces |
| `produce_units_free` | Run a production action with all unit costs set to 0 |
| `explore_planet_free` | Explore a chosen planet the player controls without spending resources |
| `replace_ship` | Replace a non-fighter ship with one from reinforcements costing up to 2 more |
| `increase_move` | Set 1 ship's move value to the highest move value on the board this turn |
| `produce_at_any_space_dock` | Fighters/infantry placed at any unblockaded space dock instead of production system |
| `give_promissory_to_opponent` | Winner of combat forces opponent to give 1 promissory note from hand |

### Named handlers (in `abilityHandlers.ts`)

**Agent handlers:**
- `ssruu_copies_agents` â€” Yssaril agent copies all other agents' text. Display-only: show card text of all other agents in the modal; no server enforcement. Exhausts the Yssaril agent normally.

**Hero handlers:**
- `creuss_riftwalker` â€” Swap positions of 2 systems (each contains a wormhole or player's units; neither can be Creuss home or Wormhole Nexus). Requires selecting 2 system keys; updates `game_tiles` positions.
- `mahact_hero` â€” Move all units from a chosen system's space area to an adjacent system containing another player's ships. Initiates space combat in destination; neither player can retreat or use movement abilities during this combat.
- `winnu_mathis` â€” Player selects a strategy card; server applies its primary ability for the Winnu player; chosen other players may perform its secondary.
- `letnev_darktalon` â€” Set `games.game_round_flags.letnev_no_fleet_limit = true`; cleared at end of game round in `game-advance-phase`.
- `nomad_ahk_syl` â€” Set `games.game_round_flags.nomad_flagship_ignores_tokens = true`; cleared at end of game round.
- `vuil_raith_hero` â€” For each other player, roll 1d10 per non-fighter ship in or adjacent to a dimensional tear system; capture unit on 1â€“3. Multi-player dice roll, returns all results in response.
- `xxcha_xxekir` â€” Optionally discard 1 law from play; look at top 5 agenda cards; choose 2 to resolve as if 1 vote cast for a chosen outcome; discard rest. No other players may resolve abilities during this action.
- `yssaril_kyver` â€” Each other player reveals 1 action card; for each, Yssaril player may take that card or force that player to discard 3 random cards from hand. Multi-player interaction.

**Commander handlers:**
- `l1z1x_skip_planetary_shield` â€” In `game-fire-bombardment`, if the active player is L1Z1X with unlocked commander, skip the Planetary Shield check entirely.
- `xxcha_extra_vote_per_planet` â€” In `game-cast-votes`, count the number of planets the Xxcha player is exhausting and add that count to their vote total.
- `winnu_combat_bonus` â€” In `game-roll-combat-dice` and `game-roll-ground-combat-dice`, if system is Mecatol Rex, Winnu home system, or contains a legendary planet, add +2 to each result.
- `hacan_trade_good_votes` â€” In `game-cast-votes`, allow Hacan player to spend trade goods; each adds 2 to vote total.
- `yin_omar_passive` â€” In `game-research-technology`, treat one prerequisite colour as satisfied if Yin commander is unlocked. Also in `game-produce-units`, allow 1 additional infantry that does not count against Production limit.

---

## 3. Agent & Hero Activation (`game-resolve-ability` changes)

### New leader branch in step 6 (source side-effects)

```pseudocode
if source_type === 'leader' AND source_id:
  fetch leaders WHERE id = source_id â†’ { faction, leader_type }
  fetch game_players (include leaders JSONB)

  if leader_type === 'agent':
    ERR 409 'Agent is already exhausted' if leaders.agent === 'exhausted'
    ops = AGENT_ABILITIES[faction] ?? ability.effects
    execute ops via interpretEffects / getHandler
    UPDATE game_players SET leaders = jsonb_set(leaders, '{agent}', '"exhausted"')

  if leader_type === 'hero':
    ERR 409 'Hero not unlocked' if leaders.hero !== 'unlocked'
    ops = HERO_ABILITIES[faction] ?? ability.effects
    execute ops via interpretEffects / getHandler
    if faction !== 'The Titans Of Ul':  // Titans hero attaches instead of purging
      UPDATE game_players SET leaders = jsonb_set(leaders, '{hero}', '"purged"')
```

### Reactive agent windows

At the end of any triggering function (e.g. `game-activate-system`), after completing the main action:

```pseudocode
reactiveAgents = []
for each other game_player (exclude activating player):
  if player.leaders.agent === 'unlocked':
    fetch leaders WHERE faction = player.faction AND leader_type = 'agent'
    if AGENT_REACTIVE_TRIGGERS[player.faction] includes this trigger type:
      reactiveAgents.push({ player_id, faction, agent_id, ability_definition_id })

if reactiveAgents.length > 0:
  include in response: pending_window: {
    type: 'reactive_agent',
    eligible: reactiveAgents,
    context: { trigger, ...action-specific context }
  }
```

### Status phase agent readying (`game-advance-phase`)

In the "Ready Cards" step:
```pseudocode
UPDATE game_players
  SET leaders = jsonb_set(leaders, '{agent}', '"unlocked"')
  WHERE game_id = gameId AND leaders->>'agent' = 'exhausted'
```

---

## 4. Commander Unlock (`fn-game-unlock-commander`)

```pseudocode
CORS; AUTH; BODY(game_id, leader_id)
fetch leaders WHERE id = leader_id â†’ { faction, leader_type }
ERR 400 if leader_type !== 'commander'
fetch game_players for caller â†’ player
ERR 409 'Commander already unlocked' if player.leaders.commander === 'unlocked'

met = await checkCommanderUnlock(faction, gameId, player, db)
ERR 409 'Unlock condition not met' if !met

UPDATE game_players SET leaders = jsonb_set(leaders, '{commander}', '"unlocked"')
OK({ unlocked: true })
```

`checkCommanderUnlock` lives in `shared-commanderUnlock.ts`. Each faction's condition:

| Faction | Condition |
|---|---|
| Mahact | COUNT DISTINCT factions of captured tokens in fleet pool â‰¥ 2 |
| Argent Flight | COUNT units capable of AFB/Space Cannon/Bombardment â‰¥ 6 |
| Nekro | COUNT player.technologies â‰¥ 3 |
| Titans | COUNT structures on player's planets â‰¥ 5 |
| Vuil'raith | COUNT DISTINCT systems with gravity rift tile WHERE player has units â‰¥ 3 |
| Muaat | EXISTS war_sun in game_player_units for player |
| L1Z1X | COUNT dreadnoughts â‰¥ 4 |
| Naaz-Rokha | COUNT DISTINCT system_key WHERE player has mech â‰¥ 3 |
| Sol | SUM resource of controlled planets â‰¥ 12 |
| Saar | COUNT space_dock structures â‰¥ 3 |
| Letnev | MAX(COUNT non-fighter ships per system) â‰¥ 5 |
| Jol-Nar | COUNT player.technologies â‰¥ 8 |
| Yin | player.commander_flags.used_indoctrination = true |
| Hacan | player.trade_goods â‰¥ 10 |
| Winnu | controls Mecatol Rex OR player.commander_flags.entered_mecatol_combat = true |
| Nomad | COUNT scored secret objectives â‰¥ 1 |
| Yssaril | player.action_card_count â‰¥ 7 |
| Arborec | COUNT infantry + mech on controlled planets â‰¥ 12 |
| Naalu | COUNT fighters on board â‰¥ 12 |
| Xxcha | SUM influence of controlled planets â‰¥ 12 |
| Mentak | COUNT cruisers â‰¥ 4 |
| Empyrean | all other active players share at least 1 system border with this player |
| Sardakk | COUNT DISTINCT non-home controlled planets â‰¥ 5 |
| Creuss | COUNT DISTINCT systems with alpha/beta wormhole WHERE player has units â‰¥ 3 |

Two conditions rely on `commander_flags` JSONB (Yin, Winnu). These flags are set by existing functions:
- `used_indoctrination`: set in `game-resolve-ability` when the Yin Indoctrination faction ability is resolved
- `entered_mecatol_combat`: set in `game-activate-system` when the Winnu player activates the Mecatol Rex system

### Migration (Phase 43a)

```sql
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS commander_flags JSONB NOT NULL DEFAULT '{}';
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_round_flags JSONB NOT NULL DEFAULT '{}';
```

`game_round_flags` is cleared to `{}` at the end of each game round in `game-advance-phase`. Used by Letnev hero (no fleet limit) and Nomad hero (flagship ignores own tokens).

---

## 5. Commander Passive Hooks

Each affected Edge Function calls `applyCommanderPassives(trigger, context, db)` after its main action, alongside the existing `applyTechEffects(...)` call. The function returns `{ inlineEffects, pendingWindows }`.

| Function | Trigger | Commanders handled |
|---|---|---|
| `game-produce-units` | `PRODUCTION` | Titans (gain TG), Vuil'raith (fighter/infantry production limit bypass), Saar Rowl (place anywhere), Naalu M'aban (extra fighter), Nomad Navarch (free flagship), Yin Omar (extra infantry free) |
| `game-research-technology` | `TECH_RESEARCHED` | Nekro (draw action card), Yin Omar (prerequisite bypass) |
| `game-assign-hits` | `SUSTAIN_DAMAGE` | Letnev (gain TG) |
| `game-assign-hits` | `PLANET_CONTROL_GAINED` | Naaz-Rokha Dart (explore planet) |
| `game-commit-ground-forces` | `GROUND_COMBAT_START` | Sol Claire (place infantry), Sardakk G'hom (commit from adjacent) |
| `game-roll-combat-dice` + `game-roll-ground-combat-dice` | `COMBAT_ROLL` | Winnu Rickar (+2 in Mecatol/home/legendary), Jol-Nar Ta Zern (reroll window) |
| `game-fire-space-cannon` + `game-fire-bombardment` + `game-fire-anti-fighter-barrage` | `UNIT_ABILITY_ROLL` | Argent Flight Trrakan (+1 die), Jol-Nar Ta Zern (reroll) |
| `game-fire-bombardment` | `BOMBARDMENT` | L1Z1X 2RAM (skip planetary shield â€” inline pre-check) |
| `game-activate-system` | `SYSTEM_ACTIVATED` | Arborec Dirzuga (produce window), Yssaril So Ata (peek window), Empyrean Xuange (return token window), Mahact Il Na Viroset (allow own-token activation) |
| `game-move-ships` | `SHIPS_MOVED` | Creuss Sai Seravus (fighter placement after wormhole transit) |
| `game-play-strategy-card` | `STRATEGY_TOKEN_SPENT` | Muaat Magmus (gain TG) |
| `game-cast-votes` | `CAST_VOTES` | Xxcha Elder Qanoj (extra votes per exhausted planet), Hacan Gila (TG â†’ votes) |

**Special cases:**

- **Mahact Il Na Viroset**: Changes the activation validation rule. In `game-activate-system`, before the "already has token" ERR 409 check, query whether the activating player is Mahact with unlocked commander. If so, skip the error and instead schedule return of both tokens to reinforcements at end of activation.
- **Sardakk G'hom Sek'kus**: Extends the set of planets from which ground forces can be committed. The eligibility query in `game-commit-ground-forces` is widened when the Sardakk commander is unlocked.
- **Jol-Nar Ta Zern**: Requires a new `pending_window` type `commander_reroll` containing current dice results. Player selects dice to reroll via a new `game-resolve-commander-reroll` function.

---

## 6. UI

### `LeaderAbilityModal`

```pseudocode
LeaderAbilityModal({ leader, faction, leaderType, gamePlayers, onConfirm, onClose })
  selectionConfig = LEADER_SELECTION_CONFIG[faction]?.[leaderType] ?? {}

  render:
    leader name + type badge + full ability text
    if selectionConfig.needs_target_player â†’ <PlayerPicker players={gamePlayers} />
    if selectionConfig.needs_planet       â†’ <PlanetPicker filter={selectionConfig.planet_filter} />
    if selectionConfig.needs_system       â†’ <SystemPicker filter={selectionConfig.system_filter} count={selectionConfig.count} />
    if selectionConfig.needs_choice       â†’ <ChoicePicker options={selectionConfig.options} />
    if no selections needed               â†’ confirmation prompt only
    [CONFIRM] btn-primary â†’ onConfirm(selections)
    [CANCEL]  btn-ghost   â†’ onClose()
```

`LEADER_SELECTION_CONFIG` lives in `src/lib/leaderConstants.js`. Factions with no selections needed get an empty config or are omitted.

### Reactive / commander passive windows

Both `pending_window.type === 'reactive_agent'` and `pending_window.type === 'commander_passive'` reuse the existing `ActionWindowBanner` component. The banner shows the leader name and a short description of the trigger. Clicking "Use" opens `LeaderAbilityModal`; clicking "Pass" calls `game-pass-action-window`.

`pending_window.type === 'commander_reroll'` opens a new `CommanderRerollModal` showing current dice with checkboxes; the player selects dice to reroll and confirms, sending the selection to `game-resolve-commander-reroll`.

### `hook-useLeaders.js` additions

- `leaderModalOpen`, `activeleader` state
- `handleUseAbility(leader)` â†’ opens `LeaderAbilityModal`
- `handleConfirm(selections)` â†’ calls `resolveLeaderAbility(abilityDefinitionId, leader.id, selections)`
- `handleCommanderWindow(window)` â†’ dispatches `reactive_agent` / `commander_passive` to banner, `commander_reroll` to reroll modal
- `unlockCommander(leaderId)` â†’ calls new `fn-game-unlock-commander`

---

## 7. Spec File Decomposition

### Phase 43a â€” Infrastructure + Agents (14 spec files)

| Spec file | Actual file |
|---|---|
| `migration-052-leader-abilities` | `supabase/migrations/052_leader_abilities.sql` |
| `shared-leaderEffects` | `supabase/functions/_shared/leaderEffects.ts` |
| `shared-abilityDsl-p43a` | `supabase/functions/_shared/abilityDsl.ts` |
| `shared-abilityHandlers-p43a` | `supabase/functions/_shared/abilityHandlers.ts` |
| `fn-game-resolve-ability-p43a` | `supabase/functions/game-resolve-ability/index.ts` |
| `fn-game-advance-phase-p43a` | `supabase/functions/game-advance-phase/index.ts` |
| `fn-game-activate-system-p43a` | `supabase/functions/game-activate-system/index.ts` |
| `fn-game-produce-units-p43a` | `supabase/functions/game-produce-units/index.ts` |
| `fn-game-assign-hits-p43a` | `supabase/functions/game-assign-hits/index.ts` |
| `lib-leaderConstants` | `src/lib/leaderConstants.js` |
| `component-LeaderAbilityModal` | `src/components/game/LeaderAbilityModal.jsx` |
| `hook-useLeaders-p43a` | `src/hooks/useLeaders.js` |
| `component-LeaderPanel-p43a` | `src/components/game/LeaderPanel.jsx` |
| `component-GameScreen-p43a` | `src/components/game/GameScreen.jsx` |

### Phase 43b â€” Heroes (5 spec files)

| Spec file | Actual file |
|---|---|
| `shared-leaderEffects-p43b` | `supabase/functions/_shared/leaderEffects.ts` |
| `shared-abilityHandlers-p43b` | `supabase/functions/_shared/abilityHandlers.ts` |
| `fn-game-resolve-ability-p43b` | `supabase/functions/game-resolve-ability/index.ts` |
| `fn-game-advance-phase-p43b` | `supabase/functions/game-advance-phase/index.ts` |
| `component-LeaderAbilityModal-p43b` | `src/components/game/LeaderAbilityModal.jsx` |

### Phase 43c â€” Commander Unlock + Passives (22 spec files)

| Spec file | Actual file |
|---|---|
| `shared-commanderUnlock` | `supabase/functions/_shared/commanderUnlock.ts` |
| `fn-game-unlock-commander` | `supabase/functions/game-unlock-commander/index.ts` |
| `shared-leaderEffects-p43c` | `supabase/functions/_shared/leaderEffects.ts` |
| `shared-abilityHandlers-p43c` | `supabase/functions/_shared/abilityHandlers.ts` |
| `fn-game-produce-units-p43c` | `supabase/functions/game-produce-units/index.ts` |
| `fn-game-research-technology-p43c` | `supabase/functions/game-research-technology/index.ts` |
| `fn-game-assign-hits-p43c` | `supabase/functions/game-assign-hits/index.ts` |
| `fn-game-commit-ground-forces-p43c` | `supabase/functions/game-commit-ground-forces/index.ts` |
| `fn-game-roll-combat-dice-p43c` | `supabase/functions/game-roll-combat-dice/index.ts` |
| `fn-game-roll-ground-combat-dice-p43c` | `supabase/functions/game-roll-ground-combat-dice/index.ts` |
| `fn-game-fire-bombardment-p43c` | `supabase/functions/game-fire-bombardment/index.ts` |
| `fn-game-fire-space-cannon-p43c` | `supabase/functions/game-fire-space-cannon/index.ts` |
| `fn-game-fire-anti-fighter-barrage-p43c` | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` |
| `fn-game-activate-system-p43c` | `supabase/functions/game-activate-system/index.ts` |
| `fn-game-move-ships-p43c` | `supabase/functions/game-move-ships/index.ts` |
| `fn-game-play-strategy-card-p43c` | `supabase/functions/game-play-strategy-card/index.ts` |
| `fn-game-cast-votes-p43c` | `supabase/functions/game-cast-votes/index.ts` |
| `fn-game-resolve-commander-reroll` | `supabase/functions/game-resolve-commander-reroll/index.ts` |
| `client-edgeFunctions-p43c` | `src/lib/edgeFunctions.js` | Add `unlockCommander`, `resolveCommanderReroll` wrappers |
| `hook-useLeaders-p43c` | `src/hooks/useLeaders.js` | Add `unlockCommander` call, commander passive window handling |
| `component-CommanderRerollModal` | `src/components/game/CommanderRerollModal.jsx` | Jol-Nar dice selection UI |
| `component-GameScreen-p43c` | `src/components/game/GameScreen.jsx` | Handle `commander_passive` and `commander_reroll` windows |
