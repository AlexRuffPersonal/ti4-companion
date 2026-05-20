# Phase 44 — Titans of Ul Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Terraform (promissory note) and Ul The Progenitor (hero) attachment mechanics for Titans of Ul, writing planet attachments to `game_player_planets.attachments[]`.

**Architecture:** Terraform is handled entirely inside `game-play-promissory-note` with a name check and inline ATTACH_PLANET logic; no new DSL ops. The Ul hero is registered in `ability_definitions` and implemented as a named handler in `abilityHandlers.ts`. `game-resolve-ability` gains a leader `purges_source` side-effect path for future heroes. The existing `PlayPromissoryNoteModal` planet picker (currently un-wired) is wired through `PromissoryNotesModal` → `GameScreen` → `useGame` → `edgeFunctions`.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 (components), Vitest 4 (tests), Supabase JS v2 (DB client), Tailwind CSS 3 (styling)

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/053_titans_ul_attachments.sql` |
| Modify | `supabase/functions/game-play-promissory-note/index.ts` |
| Modify | `supabase/functions/_shared/abilityHandlers.ts` |
| Modify | `supabase/functions/game-resolve-ability/index.ts` |
| Modify | `ti4-companion-web/tests/functions/game-play-promissory-note.test.js` |
| Modify | `ti4-companion-web/tests/functions/game-resolve-ability.test.js` |
| Create | `ti4-companion-web/tests/components/game/LeaderCard.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/PromissoryNotesModal.test.jsx` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Modify | `ti4-companion-web/src/hooks/useGame.js` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Modify | `ti4-companion-web/src/components/game/PromissoryNotesModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/LeaderCard.jsx` |

---

## Task 1: DB Migration — Register Ul Hero Ability

**Files:**
- Create: `supabase/migrations/053_titans_ul_attachments.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 053_titans_ul_attachments.sql
-- Registers the Ul The Progenitor hero action in the ability system.
-- purges_source = false because the handler sets leaders.hero = 'attached' directly.

INSERT INTO ability_definitions (ability_key, ability_name, trigger, handler, exhausts_source, purges_source)
VALUES (
  'ul_progenitor_hero',
  'Ul The Progenitor',
  '{"timing":"action"}',
  'ul_progenitor_hero',
  false,
  false
);

INSERT INTO ability_sources (ability_id, source_type, source_id)
SELECT d.id, 'leader', l.id
FROM ability_definitions d, leaders l
WHERE d.ability_key = 'ul_progenitor_hero'
  AND l.name = 'Ul The Progenitor';
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: migration 053 applied without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/053_titans_ul_attachments.sql
git commit -m "feat(p44): migration-053 — register Ul The Progenitor hero ability"
```

---

## Task 2: game-play-promissory-note — Terraform Attachment

**Files:**
- Modify: `supabase/functions/game-play-promissory-note/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-play-promissory-note.test.js`

### Step 1: Write failing tests

- [ ] **Step 1a: Extend mockDb in the existing test file to handle new tables**

In `ti4-companion-web/tests/functions/game-play-promissory-note.test.js`, update the `mockDb` function signature and add new table handlers:

```js
// Add new constants near the top of the file
const ATTACHMENT_ID = 'attachment-uuid'
const PLANET_ROW_ID = 'planet-row-uuid'

// Update the mockDb function signature
function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  noteRow = {
    id: NOTE_INSTANCE_ID,
    state: 'held',
    held_by_player_id: PLAYER_ID,
    note_id: NOTE_ID,
    origin_player_id: ORIGIN_PLAYER_ID,
  },
  noteRowError = null,
  abilitySource = { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test_handler', effects: [] } },
  abilitySourceError = null,
  noteRef = { purge_on_use: false, into_play_area: false, name: 'Test Note' },
  noteRefError = null,
  updateError = null,
  // New for Terraform:
  planetRow = { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'blue' } },
  planetRowError = null,
  attachmentRow = { id: ATTACHMENT_ID },
  attachmentRowError = null,
  planetUpdateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_promissory_notes') {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: noteRow, error: noteRowError }),
          }),
        }),
        update: updateMock,
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: abilitySource, error: abilitySourceError }),
            }),
          }),
        }),
      }
    }
    if (table === 'promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: noteRef, error: noteRefError }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: planetRow, error: planetRowError }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: planetUpdateError }),
        }),
      }
    }
    if (table === 'attachments') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: attachmentRow, error: attachmentRowError }),
          }),
        }),
      }
    }
  })
}
```

- [ ] **Step 1b: Add failing Terraform tests in a new describe block**

```js
describe('game-play-promissory-note — Terraform attachment', () => {
  const TERRAFORM_NOTE_REF = { purge_on_use: false, into_play_area: true, name: 'Terraform' }

  it('400 when planet_name missing for Terraform', async () => {
    mockDb({ noteRef: TERRAFORM_NOTE_REF })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/planet_name/)
  })

  it('409 when planet not controlled', async () => {
    mockDb({ noteRef: TERRAFORM_NOTE_REF, planetRow: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Mecatol Rex',
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not controlled/)
  })

  it('409 when planet is on home system tile', async () => {
    mockDb({
      noteRef: TERRAFORM_NOTE_REF,
      planetRow: { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'faction' } },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Elysium',
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/home planet or Mecatol Rex/)
  })

  it('409 when planet is Mecatol Rex', async () => {
    mockDb({
      noteRef: TERRAFORM_NOTE_REF,
      planetRow: { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'red' } },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Mecatol Rex',
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/home planet or Mecatol Rex/)
  })

  it('409 when Terraform already attached', async () => {
    mockDb({
      noteRef: TERRAFORM_NOTE_REF,
      planetRow: { id: PLANET_ROW_ID, attachments: [ATTACHMENT_ID], tiles: { type: 'blue' } },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Ang',
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Already attached/)
  })

  it('200 happy path: attaches and sets state to in_play', async () => {
    mockDb({ noteRef: TERRAFORM_NOTE_REF })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      planet_name: 'Ang',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.played).toBe(true)
  })
})
```

- [ ] **Step 1c: Run tests to confirm they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: new tests FAIL (400/409/200 returns wrong status or function throws).

### Step 2: Implement

- [ ] **Step 2a: Update the body type and promissory_notes select to include `name`**

In `supabase/functions/game-play-promissory-note/index.ts`, change the body type declaration:

```typescript
// Old:
let body: { game_id?: unknown; note_instance_id?: unknown; selections?: Record<string, unknown> }
// New:
let body: { game_id?: unknown; note_instance_id?: unknown; selections?: Record<string, unknown>; planet_name?: unknown }
```

Change the `promissory_notes` select to include `name`:

```typescript
// Old:
  const { data: noteRefData, error: noteRefError } = await db
    .from('promissory_notes')
    .select('purge_on_use, into_play_area')
    .eq('id', noteRow.note_id)
    .maybeSingle()
// New:
  const { data: noteRefData, error: noteRefError } = await db
    .from('promissory_notes')
    .select('purge_on_use, into_play_area, name')
    .eq('id', noteRow.note_id)
    .maybeSingle()
```

- [ ] **Step 2b: Add the Terraform branch before the `newState` logic**

Insert after the `if (noteRefError)` check and before `let newState: string`:

```typescript
  // Terraform promissory note: validate and attach to planet before state change
  if ((noteRefData as Record<string, unknown> | null)?.name === 'Terraform') {
    if (!body.planet_name || typeof body.planet_name !== 'string') {
      return errorResponse("'planet_name' is required for Terraform", 400)
    }

    const { data: planetRow, error: planetError } = await db
      .from('game_player_planets')
      .select('id, attachments, tiles(type)')
      .eq('game_id', body.game_id)
      .eq('player_id', player.id)
      .eq('planet_name', body.planet_name)
      .maybeSingle()
    if (planetError) return errorResponse('Database error', 500)
    if (!planetRow) return errorResponse('Planet not controlled', 409)

    const pr = planetRow as Record<string, unknown> & { tiles: { type: string } }
    if (pr.tiles?.type === 'faction' || body.planet_name === 'Mecatol Rex') {
      return errorResponse('Cannot attach to home planet or Mecatol Rex', 409)
    }

    const { data: attachRow } = await db
      .from('attachments')
      .select('id')
      .eq('name', 'Terraform')
      .maybeSingle()
    if (!attachRow) return errorResponse('Attachment definition not found', 409)

    const currentAttachments = (pr.attachments as string[]) ?? []
    if (currentAttachments.includes((attachRow as Record<string, string>).id)) {
      return errorResponse('Already attached', 409)
    }

    const { error: attachError } = await db
      .from('game_player_planets')
      .update({ attachments: [...currentAttachments, (attachRow as Record<string, string>).id] })
      .eq('id', (pr.id as string))
    if (attachError) return errorResponse('Database error', 500)

    const { error: noteStateError } = await db
      .from('game_player_promissory_notes')
      .update({ state: 'in_play' })
      .eq('id', body.note_instance_id)
    if (noteStateError) return errorResponse('Database error', 500)

    await logEvent(db, {
      game_id: body.game_id,
      player_id: player.id,
      event_type: EVT_PLAY_PROMISSORY_NOTE,
      payload: { player_id: player.id, note_id: body.note_instance_id, planet_name: body.planet_name },
      round: 0,
      phase: 'action',
    })
    return okResponse({ played: true })
  }
```

- [ ] **Step 2c: Run tests to confirm they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: all tests PASS (including original suite).

- [ ] **Step 2d: Commit**

```bash
git add supabase/functions/game-play-promissory-note/index.ts ti4-companion-web/tests/functions/game-play-promissory-note.test.js
git commit -m "feat(p44): Terraform attachment in game-play-promissory-note"
```

---

## Task 3: abilityHandlers.ts — ul_progenitor_hero Handler

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`
- Modify: `ti4-companion-web/tests/functions/game-resolve-ability.test.js`

- [ ] **Step 1: Write a failing test for the handler via game-resolve-ability**

Add to `game-resolve-ability.test.js` inside the existing `describe` block (after existing tests):

```js
  describe('ul_progenitor_hero handler', () => {
    const UL_ABILITY = {
      id: ABILITY_ID,
      ability_name: 'Ul The Progenitor',
      trigger: { timing: 'action' },
      effects: null,
      handler: 'ul_progenitor_hero',
      exhausts_source: false,
      purges_source: false,
    }
    const PLANET_ROW_ID = 'planet-row-uuid'
    const ATTACHMENT_ID = 'geoform-uuid'

    function mockUlDb({ elysiumRow = { id: PLANET_ROW_ID, attachments: [] }, attachRow = { id: ATTACHMENT_ID }, elysiumMissing = false } = {}) {
      const handlerMock = vi.fn().mockResolvedValue(undefined)
      getHandler.mockReturnValue(handlerMock)
      mockDb({ ability: UL_ABILITY })
      return handlerMock
    }

    it('calls ul_progenitor_hero handler and returns 200', async () => {
      const handlerMock = mockUlDb()
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
      }))
      expect(res.status).toBe(200)
      expect(handlerMock).toHaveBeenCalledOnce()
    })

    it('returns 409 when handler throws 409 error', async () => {
      const err = Object.assign(new Error('Elysium not controlled'), { status: 409 })
      getHandler.mockReturnValue(vi.fn().mockRejectedValue(err))
      mockDb({ ability: UL_ABILITY })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
      }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Elysium not controlled/)
    })
  })
```

- [ ] **Step 2: Run to confirm these tests pass (they should, since getHandler is mocked)**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: new tests PASS (game-resolve-ability already mocks getHandler).

- [ ] **Step 3: Write the actual handler in abilityHandlers.ts**

Replace the entire content of `supabase/functions/_shared/abilityHandlers.ts`:

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

const handlers: Record<string, HandlerFn> = {
  ul_progenitor_hero: async (context, db) => {
    const { gameId, activatingPlayerId } = context

    const { data: elysiumRow, error: elysiumError } = await db
      .from('game_player_planets')
      .select('id, attachments')
      .eq('game_id', gameId)
      .eq('player_id', activatingPlayerId)
      .eq('planet_name', 'Elysium')
      .maybeSingle()
    if (elysiumError) throw Object.assign(new Error('Database error'), { status: 500 })
    if (!elysiumRow) throw Object.assign(new Error('Elysium not controlled'), { status: 409 })

    const { data: attachRow } = await db
      .from('attachments')
      .select('id')
      .eq('name', 'Geoform')
      .maybeSingle()
    if (!attachRow) throw Object.assign(new Error('Geoform attachment not found'), { status: 409 })

    const er = elysiumRow as Record<string, unknown>
    const currentAttachments = (er.attachments as string[]) ?? []
    if (currentAttachments.includes((attachRow as Record<string, string>).id)) {
      throw Object.assign(new Error('Already attached'), { status: 409 })
    }

    const { error: attachError } = await db
      .from('game_player_planets')
      .update({ attachments: [...currentAttachments, (attachRow as Record<string, string>).id] })
      .eq('id', er.id as string)
    if (attachError) throw Object.assign(new Error('Database error'), { status: 500 })

    const { error: readyError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', gameId)
      .eq('player_id', activatingPlayerId)
      .eq('planet_name', 'Elysium')
    if (readyError) throw Object.assign(new Error('Database error'), { status: 500 })

    const { data: playerRow, error: playerError } = await db
      .from('game_players')
      .select('leaders')
      .eq('id', activatingPlayerId)
      .maybeSingle()
    if (playerError || !playerRow) throw Object.assign(new Error('Player not found'), { status: 500 })

    const leaders = ((playerRow as Record<string, unknown>).leaders as Record<string, string>) ?? {}
    const { error: leadersError } = await db
      .from('game_players')
      .update({ leaders: { ...leaders, hero: 'attached' } })
      .eq('id', activatingPlayerId)
    if (leadersError) throw Object.assign(new Error('Database error'), { status: 500 })
  },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
```

- [ ] **Step 4: Run all function tests to confirm nothing broke**

```bash
cd ti4-companion-web && npx vitest run tests/functions/
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts ti4-companion-web/tests/functions/game-resolve-ability.test.js
git commit -m "feat(p44): ul_progenitor_hero handler in abilityHandlers"
```

---

## Task 4: game-resolve-ability — Leader Purge Side-Effect

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-resolve-ability.test.js`

- [ ] **Step 1: Write a failing test for the leader purge side-effect**

Add to the existing `describe` block in `game-resolve-ability.test.js`:

```js
  describe('purges_source side-effect for leader', () => {
    const PURGE_LEADER_ABILITY = {
      id: ABILITY_ID,
      ability_name: 'Some Hero',
      trigger: { timing: 'action' },
      effects: [{ op: 'gain_trade_goods', amount: 1 }],
      handler: null,
      exhausts_source: false,
      purges_source: true,
    }
    const LEADER_SOURCE_ID = 'leader-source-uuid'

    it('sets leaders.hero = purged when purges_source=true and source_type=leader', async () => {
      // game_players mock needs to return leaders on the second call (select leaders)
      let callCount = 0
      db.from.mockImplementation((table) => {
        if (table === 'game_players') {
          callCount++
          if (callCount === 1) {
            // First call: player lookup by user_id
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            }
          }
          // Subsequent calls: leaders fetch + update
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { leaders: { hero: 'unlocked' } }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        if (table === 'ability_definitions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: PURGE_LEADER_ABILITY, error: null }),
              }),
            }),
          }
        }
        if (table === 'ability_sources') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_SOURCE_ID }, error: null }),
                }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
        source_id: LEADER_SOURCE_ID,
      }))
      expect(res.status).toBe(200)

      // Verify game_players.update was called with hero: 'purged'
      const updateCalls = db.from.mock.results
        .filter(r => r.value?.update)
        .map(r => r.value.update.mock?.calls?.[0]?.[0])
        .filter(Boolean)
      const purgeCall = updateCalls.find(arg => arg?.leaders?.hero === 'purged')
      expect(purgeCall).toBeDefined()
    })
  })
```

- [ ] **Step 2: Run to confirm the test fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: new test FAILS (no leader purge path exists yet).

- [ ] **Step 3: Add the leader case to game-resolve-ability/index.ts**

In `supabase/functions/game-resolve-ability/index.ts`, find the `purges_source` block (around line 92) and add the leader case:

```typescript
  if (ab.purges_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'purged' }).eq('id', body.source_id)
    } else if (body.source_type === 'action_card') {
      await db.from('game_action_card_deck').update({ state: 'discarded', held_by_player_id: null }).eq('id', body.source_id)
      const p = player as Record<string, number>
      await db.from('game_players').update({ action_card_count: Math.max(0, p.action_card_count - 1) }).eq('id', p.id)
    } else if (body.source_type === 'leader') {
      const { data: playerLeaders } = await db
        .from('game_players')
        .select('leaders')
        .eq('id', (player as Record<string, string>).id)
        .maybeSingle()
      const leaders = ((playerLeaders as Record<string, unknown> | null)?.leaders as Record<string, string>) ?? {}
      await db.from('game_players')
        .update({ leaders: { ...leaders, hero: 'purged' } })
        .eq('id', (player as Record<string, string>).id)
    }
  }
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts ti4-companion-web/tests/functions/game-resolve-ability.test.js
git commit -m "feat(p44): add leader purge side-effect to game-resolve-ability"
```

---

## Task 5: Client Wiring — edgeFunctions, useGame, GameScreen

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Modify: `ti4-companion-web/src/hooks/useGame.js`
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`

These are straightforward one-liners — no dedicated test file (covered by integration through PromissoryNotesModal tests in Task 6).

- [ ] **Step 1: Update edgeFunctions.js to accept optional planetName**

In `ti4-companion-web/src/lib/edgeFunctions.js`, find the `playPromissoryNote` export (line 132) and replace:

```js
// Old:
export const playPromissoryNote = (gameId, noteInstanceId) =>
  callFunction('game-play-promissory-note', { game_id: gameId, note_instance_id: noteInstanceId })

// New:
export const playPromissoryNote = (gameId, noteInstanceId, planetName) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(planetName ? { planet_name: planetName } : {}),
  })
```

- [ ] **Step 2: Update useGame.js to thread planetName through**

In `ti4-companion-web/src/hooks/useGame.js`, find `playTheNote` (around line 407) and replace:

```js
// Old:
  function playTheNote(noteInstanceId) {
    return game ? playPromissoryNote(game.id, noteInstanceId) : Promise.reject(new Error('Game not loaded'))
  }

// New:
  function playTheNote(noteInstanceId, planetName) {
    return game ? playPromissoryNote(game.id, noteInstanceId, planetName) : Promise.reject(new Error('Game not loaded'))
  }
```

- [ ] **Step 3: Update GameScreen.jsx — handlePlayNote and PromissoryNotesModal**

In `ti4-companion-web/src/components/game/GameScreen.jsx`, find `handlePlayNote` (around line 300):

```js
// Old:
  const handlePlayNote = async (noteId) => {
    try {
      await playTheNote(noteId)
    } catch (e) {
      console.error('Play note error:', e)
    }
  }

// New:
  const handlePlayNote = async (noteId, planetName) => {
    try {
      await playTheNote(noteId, planetName)
    } catch (e) {
      console.error('Play note error:', e)
    }
  }
```

Find the `PromissoryNotesModal` render (around line 502) and add the `myPlanets` prop:

```jsx
// Old:
      {notesModalOpen && (
        <PromissoryNotesModal
          notes={myNotes?.filter(n => n.state === 'held') ?? []}
          players={players}
          currentPlayerId={currentPlayer?.id}
          onGive={handleGiveNote}
          onPlay={handlePlayNote}
          onClose={() => setNotesModalOpen(false)}
        />
      )}

// New:
      {notesModalOpen && (
        <PromissoryNotesModal
          notes={myNotes?.filter(n => n.state === 'held') ?? []}
          players={players}
          myPlanets={myPlanets}
          currentPlayerId={currentPlayer?.id}
          onGive={handleGiveNote}
          onPlay={handlePlayNote}
          onClose={() => setNotesModalOpen(false)}
        />
      )}
```

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/src/lib/edgeFunctions.js ti4-companion-web/src/hooks/useGame.js ti4-companion-web/src/components/game/GameScreen.jsx
git commit -m "feat(p44): thread planetName from edgeFunctions through useGame to GameScreen"
```

---

## Task 6: PromissoryNotesModal — Wire Terraform Sub-Modal

**Files:**
- Modify: `ti4-companion-web/src/components/game/PromissoryNotesModal.jsx`
- Create: `ti4-companion-web/tests/components/game/PromissoryNotesModal.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `ti4-companion-web/tests/components/game/PromissoryNotesModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PromissoryNotesModal from '../../../src/components/game/PromissoryNotesModal.jsx'

const PLAYERS = [{ id: 'p1', display_name: 'Alice' }]
const MY_PLANETS = [{ planet_name: 'Ang' }, { planet_name: 'Elysium' }]

const REGULAR_NOTE = {
  id: 'note-1',
  state: 'held',
  origin_player_id: 'p1',
  promissory_notes: { name: 'Political Secret', text: 'Some text', purge_on_use: true, into_play_area: false },
}
const TERRAFORM_NOTE = {
  id: 'note-terraform',
  state: 'held',
  origin_player_id: 'p1',
  promissory_notes: { name: 'Terraform', text: 'ACTION: Attach...', purge_on_use: false, into_play_area: true },
}

describe('PromissoryNotesModal', () => {
  it('calls onPlay directly for non-Terraform notes', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[REGULAR_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    expect(onPlay).toHaveBeenCalledWith('note-1')
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('shows PLAY button for Terraform notes (into_play_area=true)', () => {
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('PLAY')).toBeInTheDocument()
  })

  it('opens PlayPromissoryNoteModal when Terraform PLAY is clicked', () => {
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    // PlayPromissoryNoteModal renders the note name as a label
    expect(screen.getByText('Terraform')).toBeInTheDocument()
    // Planet picker should appear
    expect(screen.getByText('Ang')).toBeInTheDocument()
  })

  it('calls onPlay(noteId, planetName) after planet selection and PLAY in sub-modal', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    // Select planet in sub-modal
    fireEvent.click(screen.getByText('Ang'))
    // Click PLAY in sub-modal
    const playButtons = screen.getAllByText('PLAY')
    fireEvent.click(playButtons[playButtons.length - 1])
    expect(onPlay).toHaveBeenCalledWith('note-terraform', 'Ang')
  })

  it('closes sub-modal on CANCEL without calling onPlay', () => {
    const onPlay = vi.fn()
    render(
      <PromissoryNotesModal
        notes={[TERRAFORM_NOTE]}
        players={PLAYERS}
        myPlanets={MY_PLANETS}
        currentPlayerId="p1"
        onGive={vi.fn()}
        onPlay={onPlay}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('PLAY'))
    fireEvent.click(screen.getByText('CANCEL'))
    expect(onPlay).not.toHaveBeenCalled()
    // Sub-modal gone — planet list no longer rendered
    expect(screen.queryByText('Ang')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/PromissoryNotesModal.test.jsx
```

Expected: FAIL — Terraform PLAY button hidden (current `canPlay = !into_play_area`), no sub-modal, onPlay called with wrong signature.

- [ ] **Step 3: Implement the changes in PromissoryNotesModal.jsx**

Replace the full contents of `ti4-companion-web/src/components/game/PromissoryNotesModal.jsx`:

```jsx
import { useState } from 'react'
import PlayPromissoryNoteModal from './PlayPromissoryNoteModal.jsx'

function resolveText(text, originPlayerId, players) {
  const originPlayer = players?.find(p => p.id === originPlayerId)
  return text?.replace('{{owner}}', originPlayer?.display_name || 'Unknown') || ''
}

export default function PromissoryNotesModal({ notes, players, myPlanets, currentPlayerId, onGive, onPlay, onClose }) {
  const [pendingNote, setPendingNote] = useState(null)

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">MY PROMISSORY NOTES</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {notes.length === 0 ? (
          <p className="text-dim text-sm font-body">No promissory notes held.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map(n => {
              const ref = n.promissory_notes
              const text = resolveText(ref?.text, n.origin_player_id, players)
              const needsSubModal = ref?.name === 'Terraform'
              return (
                <div key={n.id} className="panel-inset flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-bright text-sm font-body">{ref?.name}</span>
                    <span className="text-dim text-xs font-body">{text}</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => onGive(n)}>
                      GIVE
                    </button>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => needsSubModal ? setPendingNote(n) : onPlay(n.id)}
                    >
                      PLAY
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pendingNote && (
        <PlayPromissoryNoteModal
          note={pendingNote.promissory_notes}
          players={players}
          myPlanets={myPlanets}
          onPlay={(noteId, selections) => {
            onPlay(noteId, selections?.chosenDestinationPlanet)
            setPendingNote(null)
          }}
          onClose={() => setPendingNote(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/PromissoryNotesModal.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/components/game/PromissoryNotesModal.jsx ti4-companion-web/tests/components/game/PromissoryNotesModal.test.jsx
git commit -m "feat(p44): wire Terraform sub-modal in PromissoryNotesModal"
```

---

## Task 7: LeaderCard — 'attached' Status

**Files:**
- Modify: `ti4-companion-web/src/components/game/LeaderCard.jsx`
- Create: `ti4-companion-web/tests/components/game/LeaderCard.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `ti4-companion-web/tests/components/game/LeaderCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const UL_HERO = {
  name: 'Ul The Progenitor',
  leader_type: 'hero',
  text: 'ACTION: Ready Elysium and attach this card to it.',
}

describe('LeaderCard — attached status', () => {
  it('renders ATTACHED badge in gold tone', () => {
    render(<LeaderCard leader={UL_HERO} status="attached" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByText('ATTACHED')).toBeInTheDocument()
    const badge = screen.getByText('ATTACHED')
    expect(badge.className).toMatch(/gold/)
  })

  it('does not reduce opacity when status is attached', () => {
    const { container } = render(
      <LeaderCard leader={UL_HERO} status="attached" onUseAbility={vi.fn()} onUnlock={vi.fn()} />
    )
    const card = container.firstChild
    expect(card.className).not.toMatch(/opacity-40/)
  })

  it('shows no action button when status is attached', () => {
    render(<LeaderCard leader={UL_HERO} status="attached" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('purged status still shows opacity-40', () => {
    const { container } = render(
      <LeaderCard leader={UL_HERO} status="purged" onUseAbility={vi.fn()} onUnlock={vi.fn()} />
    )
    const card = container.firstChild
    expect(card.className).toMatch(/opacity-40/)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: FAIL — 'attached' badge renders with default muted styling, no gold class.

- [ ] **Step 3: Implement the attached status in LeaderCard.jsx**

In `ti4-companion-web/src/components/game/LeaderCard.jsx`:

Change `isPurged` to also cover opacity logic:

```jsx
// Old:
  const isPurged = status === 'purged';
// New:
  const isPurged = status === 'purged';
  const isAttached = status === 'attached';
```

Update the `statusChip` to add gold styling for 'attached':

```jsx
// Old:
  const statusChip = status && (
    <span
      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
        status === 'unlocked'
          ? 'bg-success/20 text-success'
          : status === 'exhausted'
          ? 'bg-warning/20 text-warning'
          : status === 'purged'
          ? 'bg-danger/20 text-danger'
          : 'bg-muted/20 text-muted'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );

// New:
  const statusChip = status && (
    <span
      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
        status === 'unlocked'
          ? 'bg-success/20 text-success'
          : status === 'exhausted'
          ? 'bg-warning/20 text-warning'
          : status === 'purged'
          ? 'bg-danger/20 text-danger'
          : status === 'attached'
          ? 'bg-gold/20 text-gold'
          : 'bg-muted/20 text-muted'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
```

Update the outer div to treat 'attached' the same as 'purged' for opacity, and the hero button guard:

```jsx
// Old (line 75):
  return (
    <div className={`panel-inset flex flex-col gap-2 p-3 ${isPurged ? 'opacity-40' : ''}`}>

// New:
  return (
    <div className={`panel-inset flex flex-col gap-2 p-3 ${isPurged || isAttached ? 'opacity-40' : ''}`}>
```

Wait — the test says "does NOT reduce opacity when attached". Let me re-read the design doc: "Display it as a badge distinct from 'purged' — e.g., 'Attached to Elysium' in a muted/gold tone to indicate it's consumed but still in play." The design implies the card might still be visible but marked differently. The test explicitly checks `opacity-40` is NOT present.

So do NOT add `isAttached` to the opacity condition. Keep opacity only for `isPurged`:

```jsx
// Outer div stays as:
  return (
    <div className={`panel-inset flex flex-col gap-2 p-3 ${isPurged ? 'opacity-40' : ''}`}>
```

And update the hero action button to have no action when 'attached':

The current hero branch ends at `status === 'unlocked'`. For 'attached', no `actionButton` is set (it stays `null`), which is already correct since the if/else chain doesn't match 'attached'. No code change needed for the button.

The only change needed is in `statusChip` (add gold case).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/components/game/LeaderCard.jsx ti4-companion-web/tests/components/game/LeaderCard.test.jsx
git commit -m "feat(p44): add attached status to LeaderCard"
```

---

## Task 8: Deploy and Smoke Test

- [ ] **Step 1: Deploy modified edge functions**

```bash
supabase functions deploy game-play-promissory-note --no-verify-jwt
supabase functions deploy game-resolve-ability --no-verify-jwt
```

Expected: both deploy without error.

- [ ] **Step 2: Smoke test Terraform**

In a test game where you hold the Terraform promissory note:
1. Open Promissory Notes modal — confirm PLAY button is visible for Terraform
2. Click PLAY — confirm planet picker sub-modal opens
3. Select a non-home, non-Mecatol Rex planet — click PLAY
4. Confirm note transitions to `in_play` state (no longer in hand)
5. Open system info for that planet — confirm +1/+1 resource/influence modifier appears

- [ ] **Step 3: Smoke test Ul The Progenitor hero**

In a test game as Titans of Ul with Elysium controlled and hero unlocked:
1. Find the Ul The Progenitor leader card — confirm USE ABILITY button visible
2. Resolve via the ability system (`game-resolve-ability` with `ul_progenitor_hero` handler)
3. Confirm Elysium gains +3/+3 and Space Cannon 5(x3) in system view
4. Confirm Elysium is readied (not exhausted)
5. Confirm LeaderCard shows ATTACHED badge in gold

- [ ] **Step 4: Update _index.md to mark Phase 44 done**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, find the Phase 44 rows and change status from `planned` → `done`.

- [ ] **Step 5: Final commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "feat(p44): mark Phase 44 Titans of Ul Attachments as done"
```

---

## Self-Review Checklist

- [x] **Migration 053** — registers `ul_progenitor_hero` in `ability_definitions` + `ability_sources`
- [x] **Terraform validation** — 400 missing planet, 409 not controlled, 409 home/Mecatol, 409 already attached, 200 happy path
- [x] **Terraform state** — note transitions to `in_play`; attachment UUID written to `game_player_planets.attachments[]`
- [x] **Ul handler** — checks Elysium controlled, attaches Geoform, readies Elysium, sets `leaders.hero = 'attached'`
- [x] **Leader purge** — `game-resolve-ability` now handles `purges_source=true` for `source_type=leader`
- [x] **Frontend wiring** — `edgeFunctions` → `useGame` → `GameScreen` → `PromissoryNotesModal` → `PlayPromissoryNoteModal` chain complete
- [x] **Terraform PLAY button** — fixed `canPlay` logic: all notes now show PLAY button (was incorrectly hiding `into_play_area` notes)
- [x] **LeaderCard** — 'attached' renders gold badge, no opacity dimming, no action button
- [x] **Type consistency** — `planet_name` body field used throughout; `attachments` array spread consistently as `[...current, id]`
- [x] **No exploration card generalization** — `attach_to_planet` in explorationEffects.ts deliberately left alone (Phase 41 scope)
