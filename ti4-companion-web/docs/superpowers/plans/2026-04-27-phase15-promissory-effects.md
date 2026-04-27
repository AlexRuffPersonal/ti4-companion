# Phase 15: Promissory Note Effects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all 30 promissory notes so that playing one applies its full effect server-side, with enforcement hooks in every affected Edge Function.

**Architecture:** `game-play-promissory-note` is extended to look up an `ability_definition` and call `interpretEffects`/named handler, then transition note state to `in_play` or return to owner. A new `_shared/promissoryEnforcement.ts` helper is imported by all affected Edge Functions to check active in-play notes. Notes that auto-fire on receipt are handled in `game-confirm-transaction`. Combat-integrated note hooks are stubbed in Phase 15 and completed when Phases 11–14 build the relevant functions.

**Tech Stack:** Deno/TypeScript (Edge Functions), Supabase JS v2, React 19, Vitest 4, @testing-library/react

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/032_promissory_effects.sql` |
| Create | `supabase/jsons/ability-definitions-promissory.json` |
| Create | `supabase/functions/_shared/promissoryEnforcement.ts` |
| Modify | `supabase/jsons/promissory-notes.json` |
| Modify | `supabase/functions/_shared/abilityDsl.ts` |
| Modify | `supabase/functions/_shared/abilityHandlers.ts` |
| Modify | `supabase/functions/game-play-promissory-note/index.ts` |
| Modify | `supabase/functions/game-confirm-transaction/index.ts` |
| Modify | `supabase/functions/game-activate-system/index.ts` |
| Modify | `supabase/functions/game-cast-votes/index.ts` |
| Modify | `supabase/functions/game-resolve-ability/index.ts` |
| Modify | `supabase/functions/game-create-transaction/index.ts` |
| Modify | `supabase/functions/game-resolve-agenda/index.ts` |
| Modify | `supabase/functions/game-research-technology/index.ts` |
| Modify | `supabase/functions/game-advance-phase/index.ts` |
| Modify | `src/lib/edgeFunctions.js` |
| Create | `src/hooks/usePromissoryNotes.js` |
| Create | `src/components/game/PlayPromissoryNoteModal.jsx` |
| Create | `src/components/game/InPlayNotesPanel.jsx` |
| Modify | `src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md` |
| Create | `tests/functions/game-play-promissory-note.test.js` |
| Create | `tests/hooks/usePromissoryNotes.test.js` |
| Create | `tests/components/game/PlayPromissoryNoteModal.test.jsx` |
| Create | `tests/components/game/InPlayNotesPanel.test.jsx` |

**Phase 11–14 dependent stubs** (implement hooks now; fill logic when those phases ship):
| Stub in | When to complete |
|---------|-----------------|
| `supabase/functions/game-produce-units/index.ts` | Phase 12 (Stymie) |
| `supabase/functions/game-play-strategy-card/index.ts` | Phase 12 (Trade Agreement) |
| `supabase/functions/game-roll-combat-dice/index.ts` | Phase 13 (War Funding, Cavalry, Strike Wing) |
| `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | Phase 13 (Strike Wing) |
| `supabase/functions/game-roll-ground-combat-dice/index.ts` | Phase 11 (Tekklar) |
| `src/components/game/CombatModal.jsx` | Phase 13/14 |
| `src/components/game/GroundCombatModal.jsx` | Phase 11/14 |

---

## Task 1: main_plan spec files

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/migration-032-promissory-effects.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/shared-promissoryEnforcement.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/fn-game-play-promissory-note.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/fn-game-confirm-transaction-p15.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/hook-usePromissoryNotes.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/component-PlayPromissoryNoteModal.md`
- Create: `ti4-companion-web/docs/superpowers/plans/main_plan/component-InPlayNotesPanel.md`

- [ ] **Step 1: Create spec files**

`migration-032-promissory-effects.md`:
```markdown
# migration-032-promissory-effects
**File:** `supabase/migrations/032_promissory_effects.sql`
**Status:** New
**Prereqs:** —

## Changes
- `game_player_promissory_notes.state` CHECK: remove 'played', add 'in_play'
- `games`: add `political_secret_blocked_player_id UUID REFERENCES game_players(id)`
- `game_system_activations`: add `movement_blocked_player_id`, `faction_abilities_blocked_player_id`, `gravity_rift_immune_player_id`
- `game_combats`: add `reroll_allowed_player_id`, `extra_die_player_id`, `cavalry_active_player_id`, `cavalry_unit_id`, `tekklar_holder_player_id`

## Tests
None. Verify: `npx supabase db push --linked` without error.
```

`shared-promissoryEnforcement.md`:
```markdown
# shared-promissoryEnforcement
**File:** `supabase/functions/_shared/promissoryEnforcement.ts`
**Status:** New
**Prereqs:** migration-032-promissory-effects

## Functionality
Export `getActiveNotes(gameId, db)` → `ActiveNotes`.
Query game_player_promissory_notes where state='in_play', join promissory_notes for name.
Return typed object keyed by note slug (camelCase).

## Tests
None standalone — covered by edge function tests that mock it.
```

`fn-game-play-promissory-note.md`:
```markdown
# fn-game-play-promissory-note
**File:** `supabase/functions/game-play-promissory-note/index.ts`
**Status:** Modify
**Prereqs:** shared-promissoryEnforcement, shared-abilityDsl

## Functionality
CORS AUTH BODY(game_id, note_instance_id, selections?) PLAYER
Fetch note instance (held_by=player.id, state='held') → 404 if missing
Fetch ability_definition via ability_sources (source_type='promissory_note', source_id=note.note_id) → 404 if none
Build ResolveContext from selections
Call interpretEffects or named handler
Transition state: into_play_area → 'in_play'; else → held_by=origin, state='held'; purge_on_use → 'discarded'
OK({ played: true })

## Tests
New file: tests/functions/game-play-promissory-note.test.js
STD_MOCKS REQ(game_id, note_instance_id, selections:{})
T401 T400(game_id) T400(note_instance_id) T404_PLAYER
T404('note not found or not held by caller')
T404('no ability_definition for note')
GIVEN note with into_play_area=false → state='held', held_by=origin_player_id
GIVEN note with into_play_area=true → state='in_play', held_by unchanged
GIVEN note with purge_on_use=true → state='discarded'
```

`fn-game-confirm-transaction-p15.md`:
```markdown
# fn-game-confirm-transaction (Phase 15 additions)
**File:** `supabase/functions/game-confirm-transaction/index.ts`
**Status:** Modify
**Prereqs:** migration-032-promissory-effects

## Changes
In note transfer loop: for Support For The Throne and Alliance (detected by promissory_notes.name):
  state = 'in_play'; if Support For The Throne, also grant recipient 1 VP (fetch+increment, not db.raw)
Replace all 'played' state references with 'in_play'.
Fix db.raw('vp + 1') → fetch current VP, update with vp + 1.
```

`hook-usePromissoryNotes.md`:
```markdown
# hook-usePromissoryNotes
**File:** `src/hooks/usePromissoryNotes.js`
**Status:** New
**Prereqs:** client-edgeFunctions

## Functionality
Fetch game_player_promissory_notes for gameId (join promissory_notes for name/text).
Realtime subscription on game_player_promissory_notes filter game_id=eq.{gameId}.
Expose: heldNotes (state='held', held_by_player_id=myPlayerId), inPlayNotes (state='in_play' all players).
Expose: playNote(noteInstanceId, selections={}) → callFunction('game-play-promissory-note', ...)

## Tests
tests/hooks/usePromissoryNotes.test.js
Mock supabase; test heldNotes filtered correctly; test inPlayNotes includes all players; test playNote calls edgeFn.
```

`component-PlayPromissoryNoteModal.md`:
```markdown
# component-PlayPromissoryNoteModal
**File:** `src/components/game/PlayPromissoryNoteModal.jsx`
**Status:** New
**Prereqs:** hook-usePromissoryNotes

## Props
{ note, players, myPlanets, onPlay, onClose }

## Functionality
MODAL_WRAPPER → PANEL(md)
Show note name + text ({{owner}} replaced with owner faction/color label).
Render selection inputs based on note.name (player picker, planet picker, confirm only).
"Play" btn → onPlay(note.id, selections); show error if server returns 409.
"Cancel" btn → onClose.

## Tests
tests/components/game/PlayPromissoryNoteModal.test.jsx
renders note name and text; renders player picker for Political Secret;
renders planet picker for Military Support; calls onPlay with selections; calls onClose on cancel.
```

`component-InPlayNotesPanel.md`:
```markdown
# component-InPlayNotesPanel
**File:** `src/components/game/InPlayNotesPanel.jsx`
**Status:** New
**Prereqs:** hook-usePromissoryNotes

## Props
{ inPlayNotes, players }

## Functionality
Render list of active in-play notes. For each: holder name, owner name, note name.
Returns null if inPlayNotes is empty.

## Tests
tests/components/game/InPlayNotesPanel.test.jsx
renders null when empty; renders holder and owner names; renders note name.
```

- [ ] **Step 2: Add Phase 15 rows to `_index.md`**

Add these rows to the table (Phase 15 section, after Phase 14):

```markdown
| [migration-032-promissory-effects](migration-032-promissory-effects.md) | `supabase/migrations/032_promissory_effects.sql` | 15 | Promissory Note Effects | planned | — |
| [shared-promissoryEnforcement](shared-promissoryEnforcement.md) | `supabase/functions/_shared/promissoryEnforcement.ts` | 15 | Promissory Note Effects | planned | migration-032-promissory-effects |
| [fn-game-play-promissory-note](fn-game-play-promissory-note.md) | `supabase/functions/game-play-promissory-note/index.ts` | 15 | Promissory Note Effects | planned | shared-promissoryEnforcement, shared-abilityDsl |
| [fn-game-confirm-transaction-p15](fn-game-confirm-transaction-p15.md) | `supabase/functions/game-confirm-transaction/index.ts` | 15 | Promissory Note Effects | planned | migration-032-promissory-effects |
| [hook-usePromissoryNotes](hook-usePromissoryNotes.md) | `src/hooks/usePromissoryNotes.js` | 15 | Promissory Note Effects | planned | client-edgeFunctions |
| [component-PlayPromissoryNoteModal](component-PlayPromissoryNoteModal.md) | `src/components/game/PlayPromissoryNoteModal.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
| [component-InPlayNotesPanel](component-InPlayNotesPanel.md) | `src/components/game/InPlayNotesPanel.jsx` | 15 | Promissory Note Effects | planned | hook-usePromissoryNotes |
```

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/
git commit -m "docs: add Phase 15 spec files to main_plan"
```

---

## Task 2: JSON data — fix `into_play_area` + seed ability definitions

**Files:**
- Modify: `supabase/jsons/promissory-notes.json`
- Create: `supabase/jsons/ability-definitions-promissory.json`

- [ ] **Step 1: Update `promissory-notes.json`**

Add `"into_play_area": true` to these 7 entries (find by `"name"` field):
- `Trade Convoys`, `Promise Of Protection`, `Blood Pact`, `Dark Pact`, `Stymie`, `Antivirus`, `Gift Of Prescience`

Re-import via admin UI at `/admin/import/promissory-notes` after this step.

- [ ] **Step 2: Create `ability-definitions-promissory.json`**

This file seeds all 30 promissory note ability definitions. It will be imported via a migration INSERT (Task 3 handles this). Structure:

```json
[
  {
    "ability_key": "trade_agreement",
    "ability_name": "Trade Agreement",
    "trigger": { "timing": "when_owner_replenishes" },
    "effects": [{ "op": "give_commodities_from_player", "target": "origin_player" }],
    "promissory_note_name": "Trade Agreement"
  },
  {
    "ability_key": "cybernetic_enhancements",
    "ability_name": "Cybernetic Enhancements",
    "trigger": { "timing": "start_of_your_turn" },
    "effects": [
      { "op": "remove_strategy_token", "target": "origin_player", "amount": 1 },
      { "op": "gain_command_tokens", "pool": "strategy", "amount": 1 }
    ],
    "promissory_note_name": "Cybernetic Enhancements"
  },
  {
    "ability_key": "military_support",
    "ability_name": "Military Support",
    "trigger": { "timing": "start_of_sol_turn" },
    "effects": [
      { "op": "remove_strategy_token", "target": "origin_player", "amount": 1, "if_able": true },
      { "op": "choose_one", "options": [
        { "op": "place_units", "unit_type": "infantry", "amount": 2 },
        { "op": "noop" }
      ]}
    ],
    "promissory_note_name": "Military Support"
  },
  {
    "ability_key": "fires_of_the_gashlai",
    "ability_name": "Fires Of The Gashlai",
    "trigger": { "timing": "action" },
    "effects": [
      { "op": "remove_fleet_token", "target": "origin_player", "amount": 1 },
      { "op": "gain_technology", "tech_key": "magmus_reactor_2" }
    ],
    "promissory_note_name": "Fires Of The Gashlai"
  },
  {
    "ability_key": "research_agreement",
    "ability_name": "Research Agreement",
    "trigger": { "timing": "after_jol_nar_researches" },
    "effects": [{ "op": "gain_technology", "tech_source": "chosen_technology_id" }],
    "promissory_note_name": "Research Agreement"
  },
  { "ability_key": "ceasefire", "ability_name": "Ceasefire", "trigger": { "timing": "reactive" }, "handler": "ceasefire", "promissory_note_name": "Ceasefire" },
  { "ability_key": "political_secret", "ability_name": "Political Secret", "trigger": { "timing": "reactive" }, "handler": "political_secret", "promissory_note_name": "Political Secret" },
  { "ability_key": "political_favor", "ability_name": "Political Favor", "trigger": { "timing": "reactive" }, "handler": "political_favor", "promissory_note_name": "Political Favor" },
  { "ability_key": "scepter_of_dominion", "ability_name": "Scepter Of Dominion", "trigger": { "timing": "reactive" }, "handler": "scepter_of_dominion", "promissory_note_name": "Scepter Of Dominion" },
  { "ability_key": "strike_wing_ambuscade", "ability_name": "Strike Wing Ambuscade", "trigger": { "timing": "reactive" }, "handler": "strike_wing_ambuscade", "promissory_note_name": "Strike Wing Ambuscade" },
  { "ability_key": "war_funding", "ability_name": "War Funding", "trigger": { "timing": "reactive" }, "handler": "war_funding", "promissory_note_name": "War Funding" },
  { "ability_key": "greyfire_mutagen", "ability_name": "Greyfire Mutagen", "trigger": { "timing": "reactive" }, "handler": "greyfire_mutagen", "promissory_note_name": "Greyfire Mutagen" },
  { "ability_key": "the_cavalry", "ability_name": "The Cavalry", "trigger": { "timing": "reactive" }, "handler": "the_cavalry", "promissory_note_name": "The Cavalry" },
  { "ability_key": "tekklar_legion", "ability_name": "Tekklar Legion", "trigger": { "timing": "reactive" }, "handler": "tekklar_legion", "promissory_note_name": "Tekklar Legion" },
  { "ability_key": "ragh_s_call", "ability_name": "Ragh's Call", "trigger": { "timing": "reactive" }, "handler": "ragh_s_call", "promissory_note_name": "Ragh's Call" },
  { "ability_key": "crucible", "ability_name": "Crucible", "trigger": { "timing": "reactive" }, "handler": "crucible", "promissory_note_name": "Crucible" },
  { "ability_key": "gift_of_prescience", "ability_name": "Gift Of Prescience", "trigger": { "timing": "reactive" }, "handler": "gift_of_prescience", "promissory_note_name": "Gift Of Prescience" },
  { "ability_key": "acquisecence", "ability_name": "Acquisecence", "trigger": { "timing": "reactive" }, "handler": "acquisecence", "promissory_note_name": "Acquisecence" },
  { "ability_key": "creuss_iff", "ability_name": "Creuss Iff", "trigger": { "timing": "reactive" }, "handler": "creuss_iff", "promissory_note_name": "Creuss Iff" },
  { "ability_key": "spy_net", "ability_name": "Spy Net", "trigger": { "timing": "reactive" }, "handler": "spy_net", "promissory_note_name": "Spy Net" },
  { "ability_key": "black_market_forgery", "ability_name": "Black Market Forgery", "trigger": { "timing": "action" }, "handler": "black_market_forgery", "promissory_note_name": "Black Market Forgery" },
  { "ability_key": "terraform", "ability_name": "Terraform", "trigger": { "timing": "action" }, "handler": "terraform", "promissory_note_name": "Terraform" },
  { "ability_key": "trade_convoys", "ability_name": "Trade Convoys", "trigger": { "timing": "action" }, "effects": [], "promissory_note_name": "Trade Convoys" },
  { "ability_key": "promise_of_protection", "ability_name": "Promise Of Protection", "trigger": { "timing": "action" }, "effects": [], "promissory_note_name": "Promise Of Protection" },
  { "ability_key": "blood_pact", "ability_name": "Blood Pact", "trigger": { "timing": "action" }, "effects": [], "promissory_note_name": "Blood Pact" },
  { "ability_key": "dark_pact", "ability_name": "Dark Pact", "trigger": { "timing": "action" }, "effects": [], "promissory_note_name": "Dark Pact" },
  { "ability_key": "stymie", "ability_name": "Stymie", "trigger": { "timing": "action" }, "effects": [], "promissory_note_name": "Stymie" },
  { "ability_key": "antivirus", "ability_name": "Antivirus", "trigger": { "timing": "reactive" }, "effects": [], "promissory_note_name": "Antivirus" },
  { "ability_key": "support_for_throne", "ability_name": "Support For The Throne", "trigger": { "timing": "on_receipt" }, "effects": [], "promissory_note_name": "Support For The Throne" },
  { "ability_key": "alliance", "ability_name": "Alliance", "trigger": { "timing": "on_receipt" }, "effects": [], "promissory_note_name": "Alliance" }
]
```

Note: `effects: []` entries satisfy the DSL constraint (not null); `handler` entries omit `effects`.

- [ ] **Step 3: Commit**

```bash
git add supabase/jsons/
git commit -m "data: update promissory-notes into_play_area flags and add ability definitions seed"
```

---

## Task 3: Migration 032

**Files:**
- Create: `supabase/migrations/032_promissory_effects.sql`

- [ ] **Step 1: Write migration**

```sql
-- ── game_player_promissory_notes: replace 'played' with 'in_play' ─────────────
ALTER TABLE public.game_player_promissory_notes
  DROP CONSTRAINT IF EXISTS game_player_promissory_notes_state_check;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play', 'discarded'));

-- ── games: Political Secret flag ─────────────────────────────────────────────
ALTER TABLE public.games
  ADD COLUMN political_secret_blocked_player_id UUID
    REFERENCES public.game_players(id) ON DELETE SET NULL;

-- ── game_system_activations: activation-scoped promissory flags ───────────────
ALTER TABLE public.game_system_activations
  ADD COLUMN movement_blocked_player_id          UUID REFERENCES public.game_players(id) ON DELETE SET NULL,
  ADD COLUMN faction_abilities_blocked_player_id UUID REFERENCES public.game_players(id) ON DELETE SET NULL,
  ADD COLUMN gravity_rift_immune_player_id       UUID REFERENCES public.game_players(id) ON DELETE SET NULL;

-- ── game_combats: combat-scoped promissory flags ──────────────────────────────
ALTER TABLE public.game_combats
  ADD COLUMN reroll_allowed_player_id UUID REFERENCES public.game_players(id) ON DELETE SET NULL,
  ADD COLUMN extra_die_player_id      UUID REFERENCES public.game_players(id) ON DELETE SET NULL,
  ADD COLUMN cavalry_active_player_id UUID REFERENCES public.game_players(id) ON DELETE SET NULL,
  ADD COLUMN cavalry_unit_id          UUID REFERENCES public.game_player_units(id) ON DELETE SET NULL,
  ADD COLUMN tekklar_holder_player_id UUID REFERENCES public.game_players(id) ON DELETE SET NULL;

-- ── ability_definitions + ability_sources: seed promissory note abilities ─────
-- Seeded via DO block so IDs can be referenced in ability_sources.
DO $$
DECLARE
  note_id UUID;
  def_id  UUID;
BEGIN
  -- trade_agreement
  INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
    VALUES ('trade_agreement', 'Trade Agreement', '{"timing":"when_owner_replenishes"}'::jsonb,
      '[{"op":"give_commodities_from_player","target":"origin_player"}]'::jsonb)
    RETURNING id INTO def_id;
  SELECT id INTO note_id FROM promissory_notes WHERE name = 'Trade Agreement';
  INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);

  -- cybernetic_enhancements
  INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
    VALUES ('cybernetic_enhancements', 'Cybernetic Enhancements', '{"timing":"start_of_your_turn"}'::jsonb,
      '[{"op":"remove_strategy_token","target":"origin_player","amount":1},{"op":"gain_command_tokens","pool":"strategy","amount":1}]'::jsonb)
    RETURNING id INTO def_id;
  SELECT id INTO note_id FROM promissory_notes WHERE name = 'Cybernetic Enhancements';
  INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);

  -- military_support
  INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
    VALUES ('military_support', 'Military Support', '{"timing":"start_of_sol_turn"}'::jsonb,
      '[{"op":"remove_strategy_token","target":"origin_player","amount":1,"if_able":true},{"op":"choose_one","options":[{"op":"place_units","unit_type":"infantry","amount":2},{"op":"noop"}]}]'::jsonb)
    RETURNING id INTO def_id;
  SELECT id INTO note_id FROM promissory_notes WHERE name = 'Military Support';
  INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);

  -- fires_of_the_gashlai
  INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
    VALUES ('fires_of_the_gashlai', 'Fires Of The Gashlai', '{"timing":"action"}'::jsonb,
      '[{"op":"remove_fleet_token","target":"origin_player","amount":1},{"op":"gain_technology","tech_key":"magmus_reactor_2"}]'::jsonb)
    RETURNING id INTO def_id;
  SELECT id INTO note_id FROM promissory_notes WHERE name = 'Fires Of The Gashlai';
  INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);

  -- research_agreement
  INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
    VALUES ('research_agreement', 'Research Agreement', '{"timing":"after_jol_nar_researches"}'::jsonb,
      '[{"op":"gain_technology","tech_source":"chosen_technology_id"}]'::jsonb)
    RETURNING id INTO def_id;
  SELECT id INTO note_id FROM promissory_notes WHERE name = 'Research Agreement';
  INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);

  -- handler-based notes (no effects column, use handler)
  FOREACH ability_key, ability_name_val, handler_name, timing_val IN
    SELECT * FROM (VALUES
      ('ceasefire',           'Ceasefire',           'ceasefire',           'reactive'),
      ('political_secret',    'Political Secret',    'political_secret',    'reactive'),
      ('political_favor',     'Political Favor',     'political_favor',     'reactive'),
      ('scepter_of_dominion', 'Scepter Of Dominion', 'scepter_of_dominion', 'reactive'),
      ('strike_wing_ambuscade','Strike Wing Ambuscade','strike_wing_ambuscade','reactive'),
      ('war_funding',         'War Funding',         'war_funding',         'reactive'),
      ('greyfire_mutagen',    'Greyfire Mutagen',    'greyfire_mutagen',    'reactive'),
      ('the_cavalry',         'The Cavalry',         'the_cavalry',         'reactive'),
      ('tekklar_legion',      'Tekklar Legion',      'tekklar_legion',      'reactive'),
      ('ragh_s_call',         'Ragh''s Call',        'ragh_s_call',         'reactive'),
      ('crucible',            'Crucible',             'crucible',            'reactive'),
      ('gift_of_prescience',  'Gift Of Prescience',  'gift_of_prescience',  'reactive'),
      ('acquisecence',        'Acquisecence',         'acquisecence',        'reactive'),
      ('creuss_iff',          'Creuss Iff',           'creuss_iff',          'reactive'),
      ('spy_net',             'Spy Net',              'spy_net',             'reactive'),
      ('black_market_forgery','Black Market Forgery','black_market_forgery','action'),
      ('terraform',           'Terraform',            'terraform',           'action')
    ) AS t(k, n, h, ti)
  LOOP
    INSERT INTO ability_definitions (ability_key, ability_name, trigger, handler)
      VALUES (k, n, jsonb_build_object('timing', ti), h)
      RETURNING id INTO def_id;
    SELECT id INTO note_id FROM promissory_notes WHERE name = n;
    IF note_id IS NOT NULL THEN
      INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);
    END IF;
  END LOOP;

  -- empty-effects notes (in_play area, no immediate effect)
  FOREACH ability_key, ability_name_val, timing_val IN
    SELECT * FROM (VALUES
      ('trade_convoys',       'Trade Convoys',        'action'),
      ('promise_of_protection','Promise Of Protection','action'),
      ('blood_pact',          'Blood Pact',           'action'),
      ('dark_pact',           'Dark Pact',            'action'),
      ('stymie',              'Stymie',               'action'),
      ('antivirus',           'Antivirus',            'reactive'),
      ('support_for_throne',  'Support For The Throne','on_receipt'),
      ('alliance',            'Alliance',             'on_receipt')
    ) AS t(k, n, ti)
  LOOP
    INSERT INTO ability_definitions (ability_key, ability_name, trigger, effects)
      VALUES (k, n, jsonb_build_object('timing', ti), '[]'::jsonb)
      RETURNING id INTO def_id;
    SELECT id INTO note_id FROM promissory_notes WHERE name = n;
    IF note_id IS NOT NULL THEN
      INSERT INTO ability_sources (ability_id, source_type, source_id) VALUES (def_id, 'promissory_note', note_id);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: no errors. Verify with:
```bash
npx supabase db query --linked "SELECT count(*) FROM ability_definitions WHERE ability_key LIKE '%agreement%' OR ability_key LIKE '%ceasefire%';"
```
Expected: `count: 2`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_promissory_effects.sql
git commit -m "feat: add migration 032 — promissory note effects DB schema"
```

---

## Task 4: `_shared/promissoryEnforcement.ts`

**Files:**
- Create: `supabase/functions/_shared/promissoryEnforcement.ts`

- [ ] **Step 1: Write the helper**

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface NoteEntry {
  instanceId: string
  holderPlayerId: string
  ownerPlayerId: string
}

export interface ActiveNotes {
  supportForThrone:    NoteEntry[]
  alliance:            NoteEntry[]
  tradeConvoys:        NoteEntry[]
  promiseOfProtection: NoteEntry[]
  bloodPact:           NoteEntry[]
  darkPact:            NoteEntry[]
  stymie:              NoteEntry[]
  antivirus:           NoteEntry[]
  giftOfPrescience:    NoteEntry[]
}

const NAME_TO_KEY: Record<string, keyof ActiveNotes> = {
  'Support For The Throne': 'supportForThrone',
  'Alliance':               'alliance',
  'Trade Convoys':          'tradeConvoys',
  'Promise Of Protection':  'promiseOfProtection',
  'Blood Pact':             'bloodPact',
  'Dark Pact':              'darkPact',
  'Stymie':                 'stymie',
  'Antivirus':              'antivirus',
  'Gift Of Prescience':     'giftOfPrescience',
}

export async function getActiveNotes(gameId: string, db: SupabaseClient): Promise<ActiveNotes> {
  const result: ActiveNotes = {
    supportForThrone: [], alliance: [], tradeConvoys: [],
    promiseOfProtection: [], bloodPact: [], darkPact: [],
    stymie: [], antivirus: [], giftOfPrescience: [],
  }

  const { data, error } = await db
    .from('game_player_promissory_notes')
    .select('id, held_by_player_id, origin_player_id, promissory_notes(name)')
    .eq('game_id', gameId)
    .eq('state', 'in_play')

  if (error || !data) return result

  for (const row of data as Array<{
    id: string
    held_by_player_id: string
    origin_player_id: string
    promissory_notes: { name: string }
  }>) {
    const key = NAME_TO_KEY[row.promissory_notes?.name]
    if (key) {
      result[key].push({
        instanceId: row.id,
        holderPlayerId: row.held_by_player_id,
        ownerPlayerId: row.origin_player_id,
      })
    }
  }

  return result
}

export async function returnNote(instanceId: string, ownerPlayerId: string, db: SupabaseClient): Promise<void> {
  await db
    .from('game_player_promissory_notes')
    .update({ state: 'held', held_by_player_id: ownerPlayerId })
    .eq('id', instanceId)
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/promissoryEnforcement.ts
git commit -m "feat: add promissoryEnforcement shared helper"
```

---

## Task 5: DSL ops — implement existing stubs

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

- [ ] **Step 1: Implement `gain_command_tokens`**

In `interpretOp`, replace the `case 'gain_command_tokens':` stub with:

```typescript
case 'gain_command_tokens': {
  const pool = op.pool as string
  const amount = op.amount as number
  const { data: p, error } = await db
    .from('game_players')
    .select('command_tokens')
    .eq('id', context.activatingPlayerId)
    .maybeSingle()
  if (error || !p) throw new Error('gain_command_tokens: player fetch failed')
  const tokens = (p as Record<string, unknown>).command_tokens as Record<string, number>
  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { ...tokens, [pool]: (tokens[pool] ?? 0) + amount } })
    .eq('id', context.activatingPlayerId)
  if (updateError) throw new Error(`gain_command_tokens failed: ${updateError.message}`)
  break
}
```

- [ ] **Step 2: Implement `place_units`**

```typescript
case 'place_units': {
  const unitType = op.unit_type as string
  const amount = op.amount as number
  const planetName = context.targetPlanetName
  if (!planetName) throw new Error('place_units: no planet selected')
  const { data: existing, error: fetchError } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('unit_type', unitType)
    .eq('on_planet', planetName)
    .maybeSingle()
  if (fetchError) throw new Error(`place_units: fetch failed: ${fetchError.message}`)
  if (existing) {
    const { error } = await db
      .from('game_player_units')
      .update({ count: (existing as Record<string, number>).count + amount })
      .eq('id', (existing as Record<string, string>).id)
    if (error) throw new Error(`place_units: update failed: ${error.message}`)
  } else {
    const { error } = await db
      .from('game_player_units')
      .insert({ game_id: context.gameId, player_id: context.activatingPlayerId, unit_type: unitType, count: amount, on_planet: planetName })
    if (error) throw new Error(`place_units: insert failed: ${error.message}`)
  }
  break
}
```

- [ ] **Step 3: Implement `gain_technology`**

```typescript
case 'gain_technology': {
  const techKey = op.tech_key as string | undefined
  const techSource = op.tech_source as string | undefined
  let techId: string | undefined
  if (techSource === 'chosen_technology_id') {
    techId = context.chosenTechnologyId
  } else if (techKey) {
    const { data: tech } = await db
      .from('technologies')
      .select('id')
      .eq('tech_key', techKey)
      .maybeSingle()
    techId = (tech as Record<string, string> | null)?.id
  }
  if (!techId) break
  const { data: p, error } = await db
    .from('game_players')
    .select('technologies')
    .eq('id', context.activatingPlayerId)
    .maybeSingle()
  if (error || !p) throw new Error('gain_technology: player fetch failed')
  const techs = ((p as Record<string, unknown>).technologies as string[]) ?? []
  if (techs.includes(techId)) break
  const { error: updateError } = await db
    .from('game_players')
    .update({ technologies: [...techs, techId] })
    .eq('id', context.activatingPlayerId)
  if (updateError) throw new Error(`gain_technology failed: ${updateError.message}`)
  break
}
```

- [ ] **Step 4: Update `ResolveContext` in `abilityDsl.ts` to add `chosenTechnologyId`**

```typescript
export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  originPlayerId?: string        // add this — needed by origin_player DSL targets
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  chosenTechnologyId?: string    // add this
}
```

- [ ] **Step 5: Add `noop` case**

```typescript
case 'noop':
  break
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts
git commit -m "feat: implement gain_command_tokens, place_units, gain_technology DSL ops"
```

---

## Task 6: DSL ops — new ops

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

- [ ] **Step 1: Add `remove_strategy_token`**

```typescript
case 'remove_strategy_token': {
  const targetId = op.target === 'origin_player'
    ? (context.originPlayerId ?? context.activatingPlayerId)
    : context.activatingPlayerId
  const ifAble = op.if_able as boolean | undefined
  const amount = op.amount as number ?? 1
  const { data: p, error } = await db
    .from('game_players')
    .select('command_tokens')
    .eq('id', targetId)
    .maybeSingle()
  if (error || !p) throw new Error('remove_strategy_token: fetch failed')
  const tokens = (p as Record<string, unknown>).command_tokens as Record<string, number>
  const current = tokens.strategy ?? 0
  if (current < amount) {
    if (ifAble) break
    throw new Error('remove_strategy_token: insufficient strategy tokens')
  }
  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { ...tokens, strategy: current - amount } })
    .eq('id', targetId)
  if (updateError) throw new Error(`remove_strategy_token failed: ${updateError.message}`)
  break
}
```

- [ ] **Step 2: Add `remove_fleet_token`**

```typescript
case 'remove_fleet_token': {
  const targetId = op.target === 'origin_player'
    ? (context.originPlayerId ?? context.activatingPlayerId)
    : context.activatingPlayerId
  const amount = op.amount as number ?? 1
  const { data: p, error } = await db
    .from('game_players')
    .select('command_tokens')
    .eq('id', targetId)
    .maybeSingle()
  if (error || !p) throw new Error('remove_fleet_token: fetch failed')
  const tokens = (p as Record<string, unknown>).command_tokens as Record<string, number>
  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { ...tokens, fleet: Math.max(0, (tokens.fleet ?? 0) - amount) } })
    .eq('id', targetId)
  if (updateError) throw new Error(`remove_fleet_token failed: ${updateError.message}`)
  break
}
```

- [ ] **Step 3: Add `give_commodities_from_player`**

```typescript
case 'give_commodities_from_player': {
  const fromId = context.originPlayerId
  if (!fromId) throw new Error('give_commodities_from_player: no origin player')
  const { data: fromPlayer, error: fromError } = await db
    .from('game_players')
    .select('id, commodities')
    .eq('id', fromId)
    .maybeSingle()
  if (fromError || !fromPlayer) throw new Error('give_commodities_from_player: origin player fetch failed')
  const amount = (fromPlayer as Record<string, number>).commodities ?? 0
  if (amount === 0) break
  await db.from('game_players').update({ commodities: 0 }).eq('id', fromId)
  const current = (player.commodities as number) ?? 0
  const { error } = await db
    .from('game_players')
    .update({ commodities: current + amount })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`give_commodities_from_player failed: ${error.message}`)
  break
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts
git commit -m "feat: add remove_strategy_token, remove_fleet_token, give_commodities_from_player DSL ops"
```

---

## Task 7: Named handlers — Group A (self-contained)

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

- [ ] **Step 1: Add `ceasefire` handler**

```typescript
ceasefire: async (context, db) => {
  // Finds the most recent activation by origin_player in context.gameId and blocks movement
  const { data: activation, error } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('player_id', context.originPlayerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !activation) throw new Error('ceasefire: no active activation found for owner')
  const { error: updateError } = await db
    .from('game_system_activations')
    .update({ movement_blocked_player_id: context.originPlayerId })
    .eq('id', (activation as Record<string, string>).id)
  if (updateError) throw new Error(`ceasefire: update failed: ${updateError.message}`)
},
```

- [ ] **Step 2: Add `political_favor` handler**

```typescript
political_favor: async (context, db) => {
  // Discard current drawn agenda, draw next
  const { data: current, error: fetchError } = await db
    .from('game_agenda_deck')
    .select('id, deck_position')
    .eq('game_id', context.gameId)
    .eq('state', 'voting')
    .maybeSingle()
  if (fetchError || !current) throw new Error('political_favor: no agenda currently voting')
  await db.from('game_agenda_deck').update({ state: 'discarded', deck_position: null }).eq('id', (current as Record<string, string>).id)
  const { data: next, error: nextError } = await db
    .from('game_agenda_deck')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (nextError || !next) throw new Error('political_favor: agenda deck is empty')
  const { error: drawError } = await db
    .from('game_agenda_deck')
    .update({ state: 'voting', deck_position: null })
    .eq('id', (next as Record<string, string>).id)
  if (drawError) throw new Error(`political_favor: draw failed: ${drawError.message}`)
},
```

- [ ] **Step 3: Add `ragh_s_call` handler**

```typescript
ragh_s_call: async (context, db) => {
  const sourcePlanet = context.targetPlanetName
  const destPlanet = context.chosenDestinationPlanet
  if (!sourcePlanet || !destPlanet) throw new Error('ragh_s_call: planets not specified')
  // Move all Saar ground forces off source planet
  const { data: units, error } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', context.gameId)
    .eq('player_id', context.originPlayerId)
    .eq('on_planet', sourcePlanet)
    .not('unit_type', 'in', '("pds","space_dock")')
  if (error) throw new Error(`ragh_s_call: unit fetch failed: ${error.message}`)
  for (const unit of (units ?? []) as Array<Record<string, unknown>>) {
    await db.from('game_player_units')
      .update({ on_planet: destPlanet })
      .eq('id', unit.id as string)
  }
},
```

- [ ] **Step 4: Add `creuss_iff` handler**

```typescript
creuss_iff: async (context, db) => {
  const systemKey = context.chosenSystemKey
  if (!systemKey) throw new Error('creuss_iff: no system chosen')
  // Remove existing Creuss wormhole token if present, place in new system
  await db.from('game_system_state')
    .delete()
    .eq('game_id', context.gameId)
    .eq('placed_by_player_id', context.originPlayerId)
    .eq('token_type', 'creuss_wormhole')
  const { error } = await db.from('game_system_state').insert({
    game_id: context.gameId,
    system_key: systemKey,
    token_type: 'creuss_wormhole',
    placed_by_player_id: context.originPlayerId,
  })
  if (error) throw new Error(`creuss_iff: insert failed: ${error.message}`)
},
```

- [ ] **Step 5: Add `terraform` handler**

```typescript
terraform: async (context, db) => {
  const planetName = context.targetPlanetName
  if (!planetName) throw new Error('terraform: no planet chosen')
  const { data: planet, error } = await db
    .from('game_player_planets')
    .select('id, resources, influence')
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('planet_name', planetName)
    .maybeSingle()
  if (error || !planet) throw new Error('terraform: planet not found or not owned')
  const p = planet as Record<string, unknown>
  const { error: updateError } = await db
    .from('game_player_planets')
    .update({
      resources: (p.resources as number) + 1,
      influence: (p.influence as number) + 1,
      planet_trait: 'all',          // sentinel value: UI shows all 3 traits
    })
    .eq('id', p.id as string)
  if (updateError) throw new Error(`terraform: update failed: ${updateError.message}`)
},
```

- [ ] **Step 6: Add `acquisecence` handler**

```typescript
acquisecence: async (context, db) => {
  // Exchange strategy cards between holder and Winnu player (origin_player)
  const { data: holder, error: h1 } = await db
    .from('game_players').select('id, strategy_card').eq('id', context.activatingPlayerId).maybeSingle()
  const { data: winnu, error: h2 } = await db
    .from('game_players').select('id, strategy_card').eq('id', context.originPlayerId).maybeSingle()
  if (h1 || h2 || !holder || !winnu) throw new Error('acquisecence: player fetch failed')
  const h = holder as Record<string, unknown>
  const w = winnu as Record<string, unknown>
  await db.from('game_players').update({ strategy_card: w.strategy_card }).eq('id', h.id as string)
  await db.from('game_players').update({ strategy_card: h.strategy_card }).eq('id', w.id as string)
},
```

- [ ] **Step 7: Add `scepter_of_dominion` handler**

```typescript
scepter_of_dominion: async (context, db) => {
  const systemKey = context.chosenSystemKey
  if (!systemKey) throw new Error('scepter_of_dominion: no system chosen')
  // Find players with tokens on Mahact's command sheet (tokens_captured_from on Mahact player)
  const { data: mahact, error } = await db
    .from('game_players').select('tokens_captured_from').eq('id', context.originPlayerId).maybeSingle()
  if (error || !mahact) throw new Error('scepter_of_dominion: Mahact player not found')
  const captured = (mahact as Record<string, unknown>).tokens_captured_from as Record<string, number> ?? {}
  for (const [affectedPlayerId, count] of Object.entries(captured)) {
    if ((count as number) < 1) continue
    // Place 1 token from that player's reinforcements in the chosen system
    const { data: ap } = await db.from('game_players').select('command_tokens').eq('id', affectedPlayerId).maybeSingle()
    if (!ap) continue
    const tokens = (ap as Record<string, unknown>).command_tokens as Record<string, number>
    // Decrement from total (reinforcements = tactic_total + fleet - activations; skip detailed calc, use tactic as proxy)
    await db.from('game_system_state').insert({
      game_id: context.gameId,
      system_key: systemKey,
      token_type: 'command_token',
      placed_by_player_id: affectedPlayerId,
    }).onConflict().ignore()
  }
},
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts
git commit -m "feat: add Group A named handlers (ceasefire, political_favor, ragh_s_call, creuss_iff, terraform, acquisecence, scepter_of_dominion)"
```

---

## Task 8: Named handlers — spy_net + black_market_forgery

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

- [ ] **Step 1: Add `spy_net` handler**

```typescript
spy_net: async (context, db) => {
  const cardId = context.chosenCardId
  if (!cardId) throw new Error('spy_net: no card chosen')
  // Validate card is held by Yssaril (origin player)
  const { data: card, error } = await db
    .from('game_action_card_deck')
    .select('id, held_by_player_id, action_card_count')
    .eq('id', cardId)
    .eq('state', 'held')
    .maybeSingle()
  if (error || !card) throw new Error('spy_net: card not found in Yssaril hand')
  const c = card as Record<string, unknown>
  if (c.held_by_player_id !== context.originPlayerId) throw new Error('spy_net: card not held by Yssaril')
  // Transfer card
  await db.from('game_action_card_deck')
    .update({ held_by_player_id: context.activatingPlayerId })
    .eq('id', cardId)
  // Update action_card_count for both players
  const { data: yssaril } = await db.from('game_players').select('action_card_count').eq('id', context.originPlayerId).maybeSingle()
  const { data: holder } = await db.from('game_players').select('action_card_count').eq('id', context.activatingPlayerId).maybeSingle()
  await db.from('game_players').update({ action_card_count: Math.max(0, ((yssaril as Record<string, number>)?.action_card_count ?? 1) - 1) }).eq('id', context.originPlayerId)
  await db.from('game_players').update({ action_card_count: ((holder as Record<string, number>)?.action_card_count ?? 0) + 1 }).eq('id', context.activatingPlayerId)
},
```

- [ ] **Step 2: Add `black_market_forgery` handler**

```typescript
black_market_forgery: async (context, db) => {
  const fragmentType = context.chosenFragmentType
  if (!fragmentType) throw new Error('black_market_forgery: no fragment type chosen')
  // Verify player has 2+ fragments of that type (stored in game_players.relic_fragments as JSONB {cultural:N,hazardous:N,industrial:N,frontier:N})
  const { data: p, error } = await db.from('game_players').select('relic_fragments').eq('id', context.activatingPlayerId).maybeSingle()
  if (error || !p) throw new Error('black_market_forgery: player fetch failed')
  const frags = ((p as Record<string, unknown>).relic_fragments ?? {}) as Record<string, number>
  if ((frags[fragmentType] ?? 0) < 2) throw new Error('black_market_forgery: insufficient fragments')
  await db.from('game_players').update({ relic_fragments: { ...frags, [fragmentType]: frags[fragmentType] - 2 } }).eq('id', context.activatingPlayerId)
  // Draw top relic
  const { data: relic, error: relicError } = await db
    .from('game_relic_deck')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (relicError || !relic) throw new Error('black_market_forgery: relic deck empty')
  await db.from('game_relic_deck')
    .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
    .eq('id', (relic as Record<string, string>).id)
},
```

- [ ] **Step 3: Update `ResolveContext` to add helper fields**

Add to the `ResolveContext` interface in `abilityDsl.ts`:
```typescript
chosenCardId?: string
chosenFragmentType?: string
chosenSystemKey?: string
chosenDestinationPlanet?: string
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts supabase/functions/_shared/abilityDsl.ts
git commit -m "feat: add spy_net, black_market_forgery handlers and extend ResolveContext"
```

---

## Task 9: Named handlers — Group B + C stubs

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

- [ ] **Step 1: Add `political_secret` handler**

```typescript
political_secret: async (context, db) => {
  const targetId = context.targetPlayerId ?? context.originPlayerId
  if (!targetId) throw new Error('political_secret: no target player')
  const { error } = await db
    .from('games')
    .update({ political_secret_blocked_player_id: targetId })
    .eq('id', context.gameId)
  if (error) throw new Error(`political_secret: update failed: ${error.message}`)
},
```

- [ ] **Step 2: Add `greyfire_mutagen` handler**

```typescript
greyfire_mutagen: async (context, db) => {
  const { data: activation, error } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', context.gameId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !activation) throw new Error('greyfire_mutagen: no activation found')
  const { error: updateError } = await db
    .from('game_system_activations')
    .update({ faction_abilities_blocked_player_id: context.originPlayerId })
    .eq('id', (activation as Record<string, string>).id)
  if (updateError) throw new Error(`greyfire_mutagen: update failed: ${updateError.message}`)
},
```

- [ ] **Step 3: Add combat-integrated handler stubs (Group C)**

These set flags on the combat row. The combat roll functions will read them in Phases 11–13.

```typescript
war_funding: async (context, db) => {
  // Deduct 2 TG from origin player (Letnev); set reroll flag on active combat
  const { data: letnev, error } = await db.from('game_players').select('trade_goods').eq('id', context.originPlayerId).maybeSingle()
  if (error || !letnev) throw new Error('war_funding: Letnev player not found')
  const tg = ((letnev as Record<string, number>).trade_goods ?? 0)
  if (tg < 2) throw new Error('war_funding: Letnev has fewer than 2 trade goods')
  await db.from('game_players').update({ trade_goods: tg - 2 }).eq('id', context.originPlayerId)
  const { data: combat } = await db.from('game_combats').select('id').eq('game_id', context.gameId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (combat) await db.from('game_combats').update({ reroll_allowed_player_id: context.activatingPlayerId }).eq('id', (combat as Record<string, string>).id)
},

strike_wing_ambuscade: async (context, db) => {
  const { data: combat } = await db.from('game_combats').select('id').eq('game_id', context.gameId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (combat) await db.from('game_combats').update({ extra_die_player_id: context.activatingPlayerId }).eq('id', (combat as Record<string, string>).id)
},

the_cavalry: async (context, db) => {
  const unitId = context.chosenUnitId
  if (!unitId) throw new Error('the_cavalry: no unit chosen')
  const { data: combat } = await db.from('game_combats').select('id').eq('game_id', context.gameId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (combat) await db.from('game_combats').update({ cavalry_active_player_id: context.activatingPlayerId, cavalry_unit_id: unitId }).eq('id', (combat as Record<string, string>).id)
},

tekklar_legion: async (context, db) => {
  const { data: combat } = await db.from('game_combats').select('id').eq('game_id', context.gameId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (combat) await db.from('game_combats').update({ tekklar_holder_player_id: context.activatingPlayerId }).eq('id', (combat as Record<string, string>).id)
},

crucible: async (context, db) => {
  const { data: activation } = await db.from('game_system_activations').select('id').eq('game_id', context.gameId).eq('player_id', context.activatingPlayerId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (activation) await db.from('game_system_activations').update({ gravity_rift_immune_player_id: context.activatingPlayerId }).eq('id', (activation as Record<string, string>).id)
},

gift_of_prescience: async (context, db) => {
  // Puts note in_play (handled by game-play-promissory-note state machine).
  // Strategy phase ordering reads getActiveNotes. No DB action needed here.
},
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts
git commit -m "feat: add political_secret, greyfire_mutagen, and combat-integrated handler stubs"
```

---

## Task 10: `game-play-promissory-note` overhaul

**Files:**
- Modify: `supabase/functions/game-play-promissory-note/index.ts`
- Create: `tests/functions/game-play-promissory-note.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/functions/game-play-promissory-note.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(m) { super(m); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({ interpretEffects: vi.fn() }))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({ getHandler: vi.fn() }))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'

const USER_ID = 'user-1', GAME_ID = 'game-1', PLAYER_ID = 'player-1'
const NOTE_INSTANCE_ID = 'instance-1', NOTE_REF_ID = 'note-ref-1', ORIGIN_PLAYER_ID = 'player-2'
const ABILITY_DEF_ID = 'def-1'

function makeRequest(body) {
  return new Request('http://localhost/game-play-promissory-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ playerError = null, noteError = null, noteData = null,
  noteRefData = null, abilityData = null, updateError = null } = {}) {
  const player = { id: PLAYER_ID }
  const note = noteData ?? { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID,
    note_id: NOTE_REF_ID, origin_player_id: ORIGIN_PLAYER_ID }
  const noteRef = noteRefData ?? { id: NOTE_REF_ID, into_play_area: false, purge_on_use: false }
  const ability = abilityData ?? { id: ABILITY_DEF_ID, effects: [], handler: null }

  db.from.mockImplementation((table) => {
    if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: playerError ? null : player, error: playerError }) }) }) }) }
    if (table === 'game_player_promissory_notes') {
      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: noteError ? null : note, error: noteError }) }) }) }) }),
        update: updateMock,
      }
    }
    if (table === 'promissory_notes') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: noteRef, error: null }) }) }) }
    if (table === 'ability_sources') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ability_id: ABILITY_DEF_ID }, error: null }) }) }) }) }) }
    if (table === 'ability_definitions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }) }) }) }
  })
}

let handler
beforeEach(async () => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  interpretEffects.mockResolvedValue(undefined)
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  if (!handler) {
    global.Deno = { serve: fn => { handler = fn } }
    await import('../../../supabase/functions/game-play-promissory-note/index.ts')
  }
})

describe('game-play-promissory-note', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id missing', async () => {
    const res = await handler(makeRequest({ note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when note_instance_id missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when note not found or not held by caller', async () => {
    mockDb({ noteError: { message: 'not found' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 200 and calls interpretEffects for DSL note', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledOnce()
  })

  it('transitions state to held and returns to origin for non-into_play note', async () => {
    await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    const updateCall = db.from.mock.results.find(r => r.value?.update)
    expect(updateCall).toBeDefined()
  })

  it('transitions state to in_play for into_play_area note', async () => {
    mockDb({ noteRefData: { id: NOTE_REF_ID, into_play_area: true, purge_on_use: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
  })

  it('transitions state to discarded for purge_on_use note', async () => {
    mockDb({ noteRefData: { id: NOTE_REF_ID, into_play_area: false, purge_on_use: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: FAIL (handler not updated yet)

- [ ] **Step 3: Rewrite `game-play-promissory-note/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }
  let body: { game_id?: unknown; note_instance_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.note_instance_id || typeof body.note_instance_id !== 'string') return errorResponse("'note_instance_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players').select('id').eq('game_id', body.game_id).eq('user_id', userId).maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found', 404)

  const { data: noteRow, error: noteError } = await db
    .from('game_player_promissory_notes')
    .select('id, state, held_by_player_id, origin_player_id, note_id')
    .eq('id', body.note_instance_id)
    .eq('held_by_player_id', (player as Record<string, string>).id)
    .eq('state', 'held')
    .maybeSingle()
  if (noteError) return errorResponse('Database error', 500)
  if (!noteRow) return errorResponse('Note not found or not held by you', 404)

  const nr = noteRow as Record<string, string>

  const { data: noteRef, error: noteRefError } = await db
    .from('promissory_notes').select('into_play_area, purge_on_use').eq('id', nr.note_id).maybeSingle()
  if (noteRefError) return errorResponse('Database error', 500)

  // Look up ability definition via ability_sources
  const { data: source, error: sourceError } = await db
    .from('ability_sources').select('ability_id')
    .eq('source_type', 'promissory_note').eq('source_id', nr.note_id).maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!source) return errorResponse('No ability definition for this note', 404)

  const { data: ability, error: abilityError } = await db
    .from('ability_definitions').select('*')
    .eq('id', (source as Record<string, string>).ability_id).maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability definition not found', 404)

  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: nr.id,
    originPlayerId: nr.origin_player_id,
    targetPlayerId: selections.chosen_player as string | undefined,
    targetPlanetName: selections.chosen_planet as string | undefined,
    chosenAmount: selections.chosen_amount as number | undefined,
    chosenOption: selections.chosen_option as number | undefined,
    chosenTechnologyId: selections.chosen_technology_id as string | undefined,
    chosenCardId: selections.chosen_card_id as string | undefined,
    chosenFragmentType: selections.chosen_fragment_type as string | undefined,
    chosenSystemKey: selections.chosen_system as string | undefined,
    chosenDestinationPlanet: selections.destination_planet as string | undefined,
    chosenUnitId: selections.chosen_unit_id as string | undefined,
  }

  const ab = ability as Record<string, unknown>
  try {
    if (ab.handler) {
      const handlerFn = getHandler(ab.handler as string)
      await handlerFn(context, db)
    } else {
      await interpretEffects(ab.effects as unknown[], context, db)
    }
  } catch (e: unknown) {
    return errorResponse(`Resolution failed: ${(e as Error).message}`, 500)
  }

  // Transition state
  const ref = (noteRef ?? {}) as Record<string, boolean>
  let newState = 'held'
  let newHolder = nr.origin_player_id
  if (ref.purge_on_use) {
    newState = 'discarded'
    newHolder = nr.held_by_player_id
  } else if (ref.into_play_area) {
    newState = 'in_play'
    newHolder = nr.held_by_player_id
  }

  const { error: updateError } = await db
    .from('game_player_promissory_notes')
    .update({ state: newState, held_by_player_id: newHolder })
    .eq('id', body.note_instance_id)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ played: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

Note: line `activatingPlayerId: nr.id` should be `activatingPlayerId: nr.held_by_player_id` — fix this typo during implementation.

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-play-promissory-note/ tests/functions/game-play-promissory-note.test.js
git commit -m "feat: overhaul game-play-promissory-note to execute ability effects"
```

---

## Task 11: `game-confirm-transaction` — auto-fire + fix `in_play`

**Files:**
- Modify: `supabase/functions/game-confirm-transaction/index.ts`

- [ ] **Step 1: Replace note-transfer block**

Find the note transfer loop (lines 130–181 in the current file) and replace it:

```typescript
if ((items.offer.note_ids?.length ?? 0) > 0 || (items.request.note_ids?.length ?? 0) > 0) {
  const allNoteIds = [...(items.offer.note_ids ?? []), ...(items.request.note_ids ?? [])]
  for (const noteInstanceId of allNoteIds) {
    const { data: noteRow } = await db
      .from('game_player_promissory_notes')
      .select('id, note_id, held_by_player_id, origin_player_id')
      .eq('id', noteInstanceId)
      .maybeSingle()
    if (!noteRow) continue
    const nr = noteRow as Record<string, string>

    const isOffer = items.offer.note_ids?.includes(noteInstanceId)
    const newHolder = isOffer ? toPlayer.id : tx.from_player_id

    const { data: noteRef } = await db
      .from('promissory_notes')
      .select('name, into_play_area')
      .eq('id', nr.note_id)
      .maybeSingle()
    const ref = (noteRef ?? {}) as Record<string, unknown>

    const autoFireNames = ['Support For The Throne', 'Alliance']
    const isAutoFire = autoFireNames.includes(ref.name as string)

    if (isAutoFire) {
      // Auto-fire: place in play area immediately
      await db.from('game_player_promissory_notes')
        .update({ held_by_player_id: newHolder, state: 'in_play' })
        .eq('id', noteInstanceId)

      if (ref.name === 'Support For The Throne') {
        // Grant 1 VP to the recipient
        const { data: recipientData } = await db.from('game_players').select('vp').eq('id', newHolder).maybeSingle()
        const recipientVp = ((recipientData as Record<string, number> | null)?.vp ?? 0)
        await db.from('game_players').update({ vp: recipientVp + 1 }).eq('id', newHolder)
      }
    } else {
      await db.from('game_player_promissory_notes')
        .update({ held_by_player_id: newHolder })
        .eq('id', noteInstanceId)
    }
  }
}
```

- [ ] **Step 2: Run existing confirm-transaction tests**

```bash
npx vitest run tests/functions/game-confirm-transaction.test.js
```

Expected: all existing tests still PASS

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-confirm-transaction/
git commit -m "feat: auto-fire Support For The Throne and Alliance on transaction confirm"
```

---

## Task 12: `game-activate-system` — return conditions + Ceasefire + Greyfire

**Files:**
- Modify: `supabase/functions/game-activate-system/index.ts`

- [ ] **Step 1: Add import and return-condition logic**

Add at the top of `game-activate-system/index.ts`:
```typescript
import { getActiveNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

After the `game_system_activations` insert succeeds, add:

```typescript
// Promissory note enforcement: check in-play notes triggered by this activation
const activeNotes = await getActiveNotes(body.game_id, db)

// Support For The Throne: if activating player attacks the origin player's systems
// (defender's units are in the activated system)
for (const entry of activeNotes.supportForThrone) {
  if (entry.holderPlayerId !== player.id) continue
  const defenderUnitsInSystem = (allSpaceUnits ?? []).some(
    (u: UnitRow) => u.system_key === body.system_key && u.player_id === entry.ownerPlayerId
  )
  if (defenderUnitsInSystem) {
    // Holder loses 1 VP and note returns to owner
    const { data: holderData } = await db.from('game_players').select('vp').eq('id', entry.holderPlayerId).maybeSingle()
    const currentVp = ((holderData as Record<string, number> | null)?.vp ?? 0)
    await db.from('game_players').update({ vp: Math.max(0, currentVp - 1) }).eq('id', entry.holderPlayerId)
    await returnNote(entry.instanceId, entry.ownerPlayerId, db)
  }
}

// Alliance, Trade Convoys, Promise Of Protection, Blood Pact, Dark Pact, Stymie, Antivirus:
// return if activating player activates system containing the owner's units
const returnOnAttack: (keyof typeof activeNotes)[] = ['alliance', 'tradeConvoys', 'promiseOfProtection', 'bloodPact', 'darkPact', 'stymie', 'antivirus']
for (const key of returnOnAttack) {
  for (const entry of (activeNotes[key] ?? [])) {
    if (entry.holderPlayerId !== player.id) continue
    const ownerUnitsInSystem = (allSpaceUnits ?? []).some(
      (u: UnitRow) => u.system_key === body.system_key && u.player_id === entry.ownerPlayerId
    )
    if (ownerUnitsInSystem) await returnNote(entry.instanceId, entry.ownerPlayerId, db)
  }
}
```

- [ ] **Step 2: Run existing activate-system tests**

```bash
npx vitest run tests/functions/game-activate-system.test.js tests/functions/game-activate-system.phase10.test.js
```

Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-activate-system/
git commit -m "feat: add promissory note return conditions to game-activate-system"
```

---

## Task 13: `game-cast-votes` + `game-resolve-agenda`

**Files:**
- Modify: `supabase/functions/game-cast-votes/index.ts`
- Modify: `supabase/functions/game-resolve-agenda/index.ts`

- [ ] **Step 1: Add Political Secret block to `game-cast-votes`**

Add import at top:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

After loading the caller player, before the vote logic:
```typescript
// Political Secret check
const { data: gameForSecret } = await db.from('games').select('political_secret_blocked_player_id').eq('id', body.game_id).maybeSingle()
const blocked = (gameForSecret as Record<string, string> | null)?.political_secret_blocked_player_id
if (blocked && blocked === (player as Record<string, string>).id) {
  return errorResponse('Political Secret: you cannot vote on this agenda', 409)
}
```

- [ ] **Step 2: Add Blood Pact vote bonus to `game-cast-votes`**

After the vote is recorded and before advancing to next player, add:
```typescript
const activeNotes = await getActiveNotes(body.game_id, db)
for (const entry of activeNotes.bloodPact) {
  if (entry.holderPlayerId !== (player as Record<string, string>).id) continue
  // Check if Empyrean is voting the same choice — look up Empyrean's vote row
  const { data: empyreanVote } = await db
    .from('game_agenda_votes')
    .select('choice')
    .eq('game_id', body.game_id)
    .eq('game_player_id', entry.ownerPlayerId)
    .eq('agenda_id', body.agenda_id ?? '')
    .maybeSingle()
  if ((empyreanVote as Record<string, string> | null)?.choice === body.choice) {
    // Add 4 bonus votes — update the just-inserted vote row
    await db.from('game_agenda_votes')
      .update({ vote_count: (body.vote_count as number) + 4 })
      .eq('game_id', body.game_id)
      .eq('game_player_id', (player as Record<string, string>).id)
      .eq('agenda_id', body.agenda_id ?? '')
  }
}
```

- [ ] **Step 3: Clear Political Secret in `game-resolve-agenda`**

Find `game-resolve-agenda/index.ts`. After the agenda is resolved and before returning OK, add:
```typescript
await db.from('games').update({ political_secret_blocked_player_id: null }).eq('id', body.game_id)
```

- [ ] **Step 4: Run existing vote tests**

```bash
npx vitest run tests/functions/game-cast-votes.test.js
```

Expected: all existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-cast-votes/ supabase/functions/game-resolve-agenda/
git commit -m "feat: add Political Secret block and Blood Pact bonus to voting"
```

---

## Task 14: `game-resolve-ability` + `game-create-transaction` hooks

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Modify: `supabase/functions/game-create-transaction/index.ts`

- [ ] **Step 1: Add Antivirus + Promise Of Protection + Alliance checks to `game-resolve-ability`**

Add import:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

After loading the ability definition and before executing, add:

```typescript
const activeNotes = await getActiveNotes(body.game_id, db)
const ab = ability as Record<string, unknown>

// Antivirus: block Nekro's Technological Singularity against a protected player
if (ab.ability_key === 'technological_singularity') {
  const targetId = (selections.chosen_player as string)
  const protected = activeNotes.antivirus.find(e => e.holderPlayerId === targetId && e.ownerPlayerId === (player as Record<string, string>).id)
  if (protected) return errorResponse('Antivirus: Technological Singularity is blocked for this player', 409)
}

// Promise Of Protection: block Pillage against a protected player
if (ab.ability_key === 'pillage') {
  const targetId = (selections.chosen_player as string)
  const protected = activeNotes.promiseOfProtection.find(e => e.holderPlayerId === targetId)
  if (protected) return errorResponse('Promise Of Protection: Pillage is blocked for this player', 409)
}

// Political Secret: block faction ability use
const gameForSecret = await db.from('games').select('political_secret_blocked_player_id').eq('id', body.game_id).maybeSingle()
const secretBlocked = (gameForSecret.data as Record<string, string> | null)?.political_secret_blocked_player_id
if (secretBlocked && secretBlocked === (player as Record<string, string>).id && ab.source_type === 'faction_ability') {
  return errorResponse('Political Secret: you cannot use faction abilities this agenda', 409)
}

// Alliance: allow use of origin player's commander ability
if (body.source_type === 'leader' || body.source_type === 'faction_ability') {
  // No block — already allowed by ability_sources lookup; no extra check needed
}
```

- [ ] **Step 2: Add Trade Convoys check to `game-create-transaction`**

Add import at top:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

Find the neighbor validation in `game-create-transaction`. After checking that both parties are valid, add:
```typescript
// Trade Convoys: allow non-neighbor trades if note is active
const activeNotes = await getActiveNotes(body.game_id, db)
const hasTradeConvoys = activeNotes.tradeConvoys.some(
  e => e.holderPlayerId === (player as Record<string, string>).id
)
if (!isNeighbor && !hasTradeConvoys) {
  return errorResponse('You can only trade with neighbors', 409)
}
```

- [ ] **Step 3: Run existing tests**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-resolve-ability/ supabase/functions/game-create-transaction/
git commit -m "feat: add Antivirus, Promise Of Protection, Alliance, Trade Convoys enforcement"
```

---

## Task 15: `game-research-technology` + `game-advance-phase` hooks

**Files:**
- Modify: `supabase/functions/game-research-technology/index.ts`
- Modify: `supabase/functions/game-advance-phase/index.ts`

- [ ] **Step 1: Add Research Agreement trigger to `game-research-technology`**

At the end of the function, before `return okResponse(...)`, add:

```typescript
// Research Agreement: if Jol-Nar just researched a non-faction tech, check for note holders
const { data: jol_nar } = await db.from('game_players').select('id, faction').eq('id', (player as Record<string, string>).id).maybeSingle()
const isJolNar = ((jol_nar as Record<string, string> | null)?.faction ?? '').includes('Jol-Nar')
if (isJolNar) {
  const { data: noteHolders } = await db
    .from('game_player_promissory_notes')
    .select('id, held_by_player_id, origin_player_id')
    .eq('game_id', body.game_id)
    .eq('state', 'held')
  const pn = await db.from('promissory_notes').select('id, name').eq('name', 'Research Agreement').maybeSingle()
  const raRefId = (pn.data as Record<string, string> | null)?.id
  if (raRefId) {
    for (const row of (noteHolders ?? []) as Array<Record<string, string>>) {
      if (row.origin_player_id !== (player as Record<string, string>).id) continue
      // Trigger: give holder the researched technology
      const { data: holderPlayer } = await db.from('game_players').select('technologies').eq('id', row.held_by_player_id).maybeSingle()
      const techs = (((holderPlayer as Record<string, unknown>)?.technologies ?? []) as string[])
      if (!techs.includes(techId)) {
        await db.from('game_players').update({ technologies: [...techs, techId] }).eq('id', row.held_by_player_id)
      }
      // Return note to Jol-Nar
      await db.from('game_player_promissory_notes')
        .update({ state: 'held', held_by_player_id: row.origin_player_id })
        .eq('id', row.id)
    }
  }
}
```

Note: `techId` is the variable holding the researched technology's ID — check where it's assigned in the existing function and use the same name.

- [ ] **Step 2: Add Gift Of Prescience return to `game-advance-phase`**

Find the status-phase transition block (where `agenda_phase_step` becomes active). Add after confirming the transition:

```typescript
import { getActiveNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
// ...
// In the status → agenda transition block:
const activeNotes = await getActiveNotes(body.game_id, db)
for (const entry of activeNotes.giftOfPrescience) {
  await returnNote(entry.instanceId, entry.ownerPlayerId, db)
}
```

- [ ] **Step 3: Run existing tests**

```bash
npx vitest run tests/functions/game-advance-phase.test.js
```

Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/game-research-technology/ supabase/functions/game-advance-phase/
git commit -m "feat: add Research Agreement trigger and Gift Of Prescience return hook"
```

---

## Task 16: Phase 11–14 integration stubs

**Files:**
- Modify: `supabase/functions/game-produce-units/index.ts` (Phase 12 — stub)
- Modify: `supabase/functions/game-roll-combat-dice/index.ts` (Phase 13 — stub)
- Modify: `supabase/functions/game-fire-anti-fighter-barrage/index.ts` (Phase 13 — stub)
- Modify: `supabase/functions/game-roll-ground-combat-dice/index.ts` (Phase 11 — stub)

- [ ] **Step 1: Add Stymie comment stub to `game-produce-units`**

At the point where production is validated (after player + planet checks), add:

```typescript
// TODO Phase 15: Stymie enforcement
// const activeNotes = await getActiveNotes(game_id, db)
// if (activeNotes.stymie.some(e => /* Arborec producing adj to holder units */)) return errorResponse('Stymie: production blocked', 409)
// Uncomment and implement when this function is built in Phase 12.
```

- [ ] **Step 2: Add combat note comment stubs to `game-roll-combat-dice`**

Near the dice rolling logic, add:

```typescript
// TODO Phase 15: combat promissory note enforcement
// Read combat row flags: extra_die_player_id, cavalry_active_player_id, cavalry_unit_id,
// reroll_allowed_player_id, tekklar_holder_player_id
// Apply them to dice pool before rolling.
// Implement when this function is built in Phase 13.
```

- [ ] **Step 3: Add AFB note stub to `game-fire-anti-fighter-barrage`**

```typescript
// TODO Phase 15: Strike Wing Ambuscade
// If combat.extra_die_player_id === attacker player id, add 1 die to AFB roll.
// Implement when this function is built in Phase 13.
```

- [ ] **Step 4: Add Tekklar stub to `game-roll-ground-combat-dice`**

```typescript
// TODO Phase 15: Tekklar Legion
// If combat.tekklar_holder_player_id is set: apply +1 to holder's rolls, -1 to N'orr's.
// Implement when this function is built in Phase 11.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-produce-units/ supabase/functions/game-roll-combat-dice/ supabase/functions/game-fire-anti-fighter-barrage/ supabase/functions/game-roll-ground-combat-dice/
git commit -m "chore: add Phase 15 promissory note stubs for Phase 11-13 functions"
```

---

## Task 17: UI — `edgeFunctions.js` + `usePromissoryNotes`

**Files:**
- Modify: `src/lib/edgeFunctions.js`
- Create: `src/hooks/usePromissoryNotes.js`
- Create: `tests/hooks/usePromissoryNotes.test.js`

- [ ] **Step 1: Add `playPromissoryNote` to `edgeFunctions.js`**

```javascript
export const playPromissoryNote = (gameId, noteInstanceId, selections = {}) =>
  callFunction('game-play-promissory-note', { game_id: gameId, note_instance_id: noteInstanceId, selections })
```

- [ ] **Step 2: Write failing hook test**

```javascript
// tests/hooks/usePromissoryNotes.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../../src/lib/edgeFunctions.js', () => ({ playPromissoryNote: vi.fn() }))

import { supabase } from '../../src/lib/supabase.js'
import { playPromissoryNote } from '../../src/lib/edgeFunctions.js'
import usePromissoryNotes from '../../src/hooks/usePromissoryNotes.js'

const GAME_ID = 'game-1', MY_PLAYER_ID = 'player-1'

const NOTES = [
  { id: 'inst-1', state: 'held', held_by_player_id: MY_PLAYER_ID, origin_player_id: 'player-2', promissory_notes: { name: 'Ceasefire', text: 'After...' } },
  { id: 'inst-2', state: 'in_play', held_by_player_id: 'player-3', origin_player_id: MY_PLAYER_ID, promissory_notes: { name: 'Trade Convoys', text: 'ACTION...' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: NOTES, error: null }),
    }),
  })
})

describe('usePromissoryNotes', () => {
  it('returns heldNotes filtered to current player', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.heldNotes).toHaveLength(1))
    expect(result.current.heldNotes[0].id).toBe('inst-1')
  })

  it('returns all in_play notes as inPlayNotes', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.inPlayNotes).toHaveLength(1))
    expect(result.current.inPlayNotes[0].id).toBe('inst-2')
  })

  it('playNote calls playPromissoryNote with correct args', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => result.current.heldNotes)
    result.current.playNote('inst-1', { chosen_planet: 'Mecatol Rex' })
    expect(playPromissoryNote).toHaveBeenCalledWith(GAME_ID, 'inst-1', { chosen_planet: 'Mecatol Rex' })
  })
})
```

- [ ] **Step 3: Run test, verify fail**

```bash
npx vitest run tests/hooks/usePromissoryNotes.test.js
```

Expected: FAIL

- [ ] **Step 4: Write `usePromissoryNotes.js`**

```javascript
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { playPromissoryNote } from '../lib/edgeFunctions.js'

export default function usePromissoryNotes(gameId, myPlayerId) {
  const [notes, setNotes] = useState([])

  useEffect(() => {
    if (!gameId) return
    supabase
      .from('game_player_promissory_notes')
      .select('id, state, held_by_player_id, origin_player_id, promissory_notes(name, text, into_play_area)')
      .eq('game_id', gameId)
      .then(({ data }) => setNotes(data ?? []))

    const channel = supabase.channel(`promissory-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_promissory_notes', filter: `game_id=eq.${gameId}` },
        () => {
          supabase
            .from('game_player_promissory_notes')
            .select('id, state, held_by_player_id, origin_player_id, promissory_notes(name, text, into_play_area)')
            .eq('game_id', gameId)
            .then(({ data }) => setNotes(data ?? []))
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [gameId])

  const heldNotes = notes.filter(n => n.state === 'held' && n.held_by_player_id === myPlayerId)
  const inPlayNotes = notes.filter(n => n.state === 'in_play')

  const playNote = useCallback((noteInstanceId, selections = {}) => {
    return playPromissoryNote(gameId, noteInstanceId, selections)
  }, [gameId])

  return { heldNotes, inPlayNotes, playNote }
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
npx vitest run tests/hooks/usePromissoryNotes.test.js
```

Expected: all 3 PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/edgeFunctions.js src/hooks/usePromissoryNotes.js tests/hooks/usePromissoryNotes.test.js
git commit -m "feat: add usePromissoryNotes hook and playPromissoryNote edge function wrapper"
```

---

## Task 18: `PlayPromissoryNoteModal`

**Files:**
- Create: `src/components/game/PlayPromissoryNoteModal.jsx`
- Create: `tests/components/game/PlayPromissoryNoteModal.test.jsx`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/components/game/PlayPromissoryNoteModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlayPromissoryNoteModal from '../../../src/components/game/PlayPromissoryNoteModal.jsx'

const PLAYERS = [
  { id: 'p1', faction: 'The Xxcha Kingdom', color: 'blue' },
  { id: 'p2', faction: 'The Mentak Coalition', color: 'red' },
]
const MY_PLANETS = [{ planet_name: 'Mecatol Rex' }, { planet_name: 'Wellon' }]

function makeNote(overrides = {}) {
  return { id: 'inst-1', origin_player_id: 'p2', promissory_notes: { name: 'Ceasefire', text: 'After...' }, ...overrides }
}

describe('PlayPromissoryNoteModal', () => {
  it('renders note name and text', () => {
    render(<PlayPromissoryNoteModal note={makeNote()} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Ceasefire')).toBeInTheDocument()
    expect(screen.getByText('After...')).toBeInTheDocument()
  })

  it('renders player picker for Political Secret', () => {
    render(<PlayPromissoryNoteModal note={makeNote({ promissory_notes: { name: 'Political Secret', text: 'When...' } })} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/choose player/i)).toBeInTheDocument()
  })

  it('renders planet picker for Military Support', () => {
    render(<PlayPromissoryNoteModal note={makeNote({ promissory_notes: { name: 'Military Support', text: 'At the start...' } })} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/choose planet/i)).toBeInTheDocument()
  })

  it('calls onPlay with note id and empty selections for simple note', () => {
    const onPlay = vi.fn()
    render(<PlayPromissoryNoteModal note={makeNote()} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={onPlay} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(onPlay).toHaveBeenCalledWith('inst-1', {})
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<PlayPromissoryNoteModal note={makeNote()} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows error message when error prop is set', () => {
    render(<PlayPromissoryNoteModal note={makeNote()} players={PLAYERS} myPlanets={MY_PLANETS} onPlay={vi.fn()} onClose={vi.fn()} error="Invalid timing" />)
    expect(screen.getByText('Invalid timing')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
npx vitest run tests/components/game/PlayPromissoryNoteModal.test.jsx
```

- [ ] **Step 3: Implement `PlayPromissoryNoteModal.jsx`**

```jsx
import { useState } from 'react'

// Notes that require a player selection
const NEEDS_PLAYER = ['Political Secret', 'Scepter Of Dominion', 'Ragh\'s Call']
// Notes that require a planet selection
const NEEDS_PLANET = ['Military Support', 'Terraform', 'Creuss Iff']

export default function PlayPromissoryNoteModal({ note, players, myPlanets, onPlay, onClose, error }) {
  const [chosenPlayer, setChosenPlayer] = useState('')
  const [chosenPlanet, setChosenPlanet] = useState('')

  if (!note) return null

  const noteName = note.promissory_notes?.name ?? ''
  const noteText = note.promissory_notes?.text ?? ''

  const needsPlayer = NEEDS_PLAYER.includes(noteName)
  const needsPlanet = NEEDS_PLANET.includes(noteName)

  function handlePlay() {
    const selections = {}
    if (needsPlayer && chosenPlayer) selections.chosen_player = chosenPlayer
    if (needsPlanet && chosenPlanet) selections.chosen_planet = chosenPlanet
    onPlay(note.id, selections)
  }

  const canPlay = (!needsPlayer || chosenPlayer) && (!needsPlanet || chosenPlanet)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <h2 className="font-display text-bright text-lg">{noteName}</h2>
        <p className="text-sm text-text">{noteText}</p>

        {needsPlayer && (
          <div className="flex flex-col gap-1">
            <p className="label">Choose Player</p>
            <select className="input" value={chosenPlayer} onChange={e => setChosenPlayer(e.target.value)}>
              <option value="">— select —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.faction ?? p.color}</option>
              ))}
            </select>
          </div>
        )}

        {needsPlanet && (
          <div className="flex flex-col gap-1">
            <p className="label">Choose Planet</p>
            <select className="input" value={chosenPlanet} onChange={e => setChosenPlanet(e.target.value)}>
              <option value="">— select —</option>
              {myPlanets.map(p => (
                <option key={p.planet_name} value={p.planet_name}>{p.planet_name}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handlePlay} disabled={!canPlay}>Play</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/components/game/PlayPromissoryNoteModal.test.jsx
```

Expected: all 6 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/game/PlayPromissoryNoteModal.jsx tests/components/game/PlayPromissoryNoteModal.test.jsx
git commit -m "feat: add PlayPromissoryNoteModal component"
```

---

## Task 19: `InPlayNotesPanel` + `MyPanelSection` integration

**Files:**
- Create: `src/components/game/InPlayNotesPanel.jsx`
- Create: `tests/components/game/InPlayNotesPanel.test.jsx`
- Modify: `src/components/game/MyPanelSection.jsx`

- [ ] **Step 1: Write failing InPlayNotesPanel tests**

```javascript
// tests/components/game/InPlayNotesPanel.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InPlayNotesPanel from '../../../src/components/game/InPlayNotesPanel.jsx'

const PLAYERS = [
  { id: 'p1', faction: 'The Hacan', color: 'gold' },
  { id: 'p2', faction: 'The Mentak', color: 'red' },
]

const IN_PLAY = [
  { id: 'inst-1', held_by_player_id: 'p1', origin_player_id: 'p2', promissory_notes: { name: 'Trade Convoys', text: 'ACTION...' } },
]

describe('InPlayNotesPanel', () => {
  it('returns null when no notes are in play', () => {
    const { container } = render(<InPlayNotesPanel inPlayNotes={[]} players={PLAYERS} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders note name', () => {
    render(<InPlayNotesPanel inPlayNotes={IN_PLAY} players={PLAYERS} />)
    expect(screen.getByText('Trade Convoys')).toBeInTheDocument()
  })

  it('renders holder name', () => {
    render(<InPlayNotesPanel inPlayNotes={IN_PLAY} players={PLAYERS} />)
    expect(screen.getByText(/the hacan/i)).toBeInTheDocument()
  })

  it('renders owner name', () => {
    render(<InPlayNotesPanel inPlayNotes={IN_PLAY} players={PLAYERS} />)
    expect(screen.getByText(/the mentak/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
npx vitest run tests/components/game/InPlayNotesPanel.test.jsx
```

- [ ] **Step 3: Implement `InPlayNotesPanel.jsx`**

```jsx
export default function InPlayNotesPanel({ inPlayNotes, players }) {
  if (!inPlayNotes?.length) return null

  function playerName(id) {
    return players.find(p => p.id === id)?.faction ?? id
  }

  return (
    <div className="panel-inset flex flex-col gap-2">
      <p className="label">In Play</p>
      {inPlayNotes.map(note => (
        <div key={note.id} className="flex flex-col gap-0.5">
          <p className="text-sm text-bright">{note.promissory_notes?.name}</p>
          <p className="text-xs text-muted">
            Held by {playerName(note.held_by_player_id)} · From {playerName(note.origin_player_id)}
          </p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/components/game/InPlayNotesPanel.test.jsx
```

Expected: all 4 PASS

- [ ] **Step 5: Wire into `MyPanelSection.jsx`**

In `MyPanelSection.jsx`, import the hook and modal:

```jsx
import usePromissoryNotes from '../../hooks/usePromissoryNotes.js'
import PlayPromissoryNoteModal from './PlayPromissoryNoteModal.jsx'
import InPlayNotesPanel from './InPlayNotesPanel.jsx'
```

Inside the component, add:

```jsx
const { heldNotes, inPlayNotes, playNote } = usePromissoryNotes(gameId, myPlayerId)
const [activeNote, setActiveNote] = useState(null)
const [playError, setPlayError] = useState(null)

async function handlePlay(noteInstanceId, selections) {
  setPlayError(null)
  try {
    await playNote(noteInstanceId, selections)
    setActiveNote(null)
  } catch (e) {
    setPlayError(e?.message ?? 'Failed to play note')
  }
}
```

In the render, add below the existing promissory note hand display:

```jsx
{heldNotes.map(note => {
  const isOwn = note.origin_player_id === myPlayerId
  return (
    <div key={note.id} className="flex items-center justify-between gap-2">
      <span className="text-sm text-text">{note.promissory_notes?.name}</span>
      <button
        className={isOwn ? 'btn-ghost opacity-40 cursor-not-allowed' : 'btn-ghost text-xs'}
        disabled={isOwn}
        onClick={() => { setActiveNote(note); setPlayError(null) }}
      >
        Play
      </button>
    </div>
  )
})}

<InPlayNotesPanel inPlayNotes={inPlayNotes} players={players} />

{activeNote && (
  <PlayPromissoryNoteModal
    note={activeNote}
    players={players}
    myPlanets={myPlanets}
    onPlay={handlePlay}
    onClose={() => setActiveNote(null)}
    error={playError}
  />
)}
```

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests still PASS, new tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/game/InPlayNotesPanel.jsx tests/components/game/InPlayNotesPanel.test.jsx src/components/game/MyPanelSection.jsx
git commit -m "feat: add InPlayNotesPanel and wire promissory note play into MyPanelSection"
```

---

## Task 20: Deploy + `_index.md` update

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Deploy all modified Edge Functions**

```bash
npx supabase functions deploy game-play-promissory-note --no-verify-jwt
npx supabase functions deploy game-confirm-transaction --no-verify-jwt
npx supabase functions deploy game-activate-system --no-verify-jwt
npx supabase functions deploy game-cast-votes --no-verify-jwt
npx supabase functions deploy game-resolve-ability --no-verify-jwt
npx supabase functions deploy game-create-transaction --no-verify-jwt
npx supabase functions deploy game-resolve-agenda --no-verify-jwt
npx supabase functions deploy game-research-technology --no-verify-jwt
npx supabase functions deploy game-advance-phase --no-verify-jwt
```

- [ ] **Step 2: Verify via DB query**

```bash
npx supabase db query --linked "SELECT count(*) FROM ability_definitions WHERE ability_key IN ('ceasefire','trade_agreement','cybernetic_enhancements');"
```

Expected: `count: 3`

- [ ] **Step 3: Update `_index.md` — mark Phase 15 items `done`**

Update the status column for all Phase 15 rows added in Task 1 from `planned` → `done`.

Also update the Phase 11/13/14 `client-edgeFunctions` row to note `playPromissoryNote` was added.

- [ ] **Step 4: Final commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 15 spec files as done in main_plan index"
```

---

## Phase 11–14 Completion Checklist

When the following phases ship, return to this plan and complete the stubbed hooks:

- [ ] **Phase 11 complete**: Fill Tekklar Legion logic in `game-roll-ground-combat-dice`
- [ ] **Phase 12 complete**: Fill Stymie in `game-produce-units`; fill Trade Agreement trigger in `game-play-strategy-card`; fill Dark Pact check in `game-confirm-transaction` (commodity max check)
- [ ] **Phase 13 complete**: Fill War Funding, Strike Wing Ambuscade, The Cavalry in `game-roll-combat-dice` and `game-fire-anti-fighter-barrage`; add War Funding/Cavalry/Strike Wing buttons to `CombatModal`; add Tekklar button to `GroundCombatModal`
- [ ] **Phase 14 complete**: Add movement hook for Ceasefire and Crucible in the movement function
