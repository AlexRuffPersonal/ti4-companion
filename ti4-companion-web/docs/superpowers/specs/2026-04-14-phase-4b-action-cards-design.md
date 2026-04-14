# Phase 4b — Action Cards Design

**Date:** 2026-04-14
**Status:** Approved

---

## Goal

Add action card draw, hand management, and discard to the in-game UI. Players can draw cards automatically from the deck, view their private hand, and play or discard cards. Card counts are visible to all players; card names and text are private to the owner.

---

## Scope

**In Phase 4b:**
- Deck initialization in `game-start` (all action cards for the game's expansions)
- `game-draw-action-card` Edge Function
- `game-discard-action-card` Edge Function
- Private hand modal (`ActionCardModal`) — owner only
- Hand limit enforcement: draw always succeeds; discard-required flow triggers when count > 7
- Card count visible to all players on the scoreboard
- `action_card_count` denormalized column on `game_players`
- RLS policy on `game_action_card_deck` enforcing hand privacy

**Deferred:**
- Effect resolution for specific cards (future phase)
- Passing cards between players
- Timing enforcement (Action / Agenda / Component windows)

---

## Data Architecture

### Privacy model

Card counts are public; card names and text are private to the owner. This is achieved via:

1. A denormalized `action_card_count INTEGER NOT NULL DEFAULT 0` column on `game_players` — visible to all players via the existing Realtime subscription on `game_players`.
2. RLS on `game_action_card_deck`: SELECT allowed if `state != 'held'` OR `held_by_player_id` matches the requesting player's `game_players.id`. Deck and discard rows are public; held rows are private.

### Data loaded in `useGame`

| Data | Source | Already loaded? |
|---|---|---|
| `player.action_card_count` (all players) | `game_players` | Yes (after migration 009) |
| `myCards` — own held cards | `game_action_card_deck` WHERE `held_by_player_id = currentPlayer.id` | New subscription |

No new Realtime subscriptions are needed beyond the existing `game_players` subscription (for counts) and a new `game_action_card_deck` subscription filtered to the current player's held cards.

---

## Schema — Migration 009

```sql
-- Denormalized card count — visible to all players via game_players subscription
ALTER TABLE public.game_players
  ADD COLUMN action_card_count INTEGER NOT NULL DEFAULT 0;

-- RLS: held cards are private to their owner; deck and discard rows are public
CREATE POLICY "action_card_deck_select" ON public.game_action_card_deck
  FOR SELECT USING (
    state != 'held'
    OR held_by_player_id = (
      SELECT id FROM public.game_players
      WHERE game_id = game_action_card_deck.game_id
        AND user_id = auth.uid()
    )
  );
```

### `game-start` update

Insert all `action_cards` rows matching the game's expansions (repeating each card `quantity` times with a unique `copy_index`) into `game_action_card_deck` with `state = 'deck'` and randomly assigned `deck_position` values. Identical pattern to public objective deck initialization.

---

## Edge Functions

### `game-draw-action-card`

**Caller:** any player (own row only — RLS enforced)

**Input:**

| Field | Type | Description |
|---|---|---|
| `game_id` | UUID | |

**Logic:**
1. Find the `game_action_card_deck` row with the lowest `deck_position` where `state = 'deck'`
2. Error if no such row exists (deck is empty)
3. Set `state = 'held'`, `held_by_player_id = caller's game_players.id`, `deck_position = null`
4. Increment `action_card_count` on the caller's `game_players` row

Does not enforce hand limit — draw always succeeds. The client triggers the discard-required flow if count > 7.

---

### `game-discard-action-card`

**Caller:** any player (own row only — RLS enforced)

**Input:**

| Field | Type | Description |
|---|---|---|
| `game_id` | UUID | |
| `card_id` | UUID | The `game_action_card_deck` row id |

**Logic:**
1. Load the `game_action_card_deck` row — error if not found
2. Verify `state = 'held'` and `held_by_player_id = caller's game_players.id` — error otherwise
3. Set `state = 'discarded'`, `held_by_player_id = null`
4. Decrement `action_card_count` on the caller's `game_players` row

Used for both "play this card" and "discard from hand" — no distinction at this phase.

---

## Components

| Component | File | Responsibility |
|---|---|---|
| `ActionCardModal` | `src/components/game/ActionCardModal.jsx` | Private hand modal; draw button; per-card discard; discard-required state |
| `MyPanelSection` | `src/components/game/MyPanelSection.jsx` | "Action Cards (N)" button that opens `ActionCardModal` |
| `ScoreboardSection` | `src/components/game/ScoreboardSection.jsx` | Card count badge per player row |

### `ActionCardModal`

Owner-only modal. Shows held cards as a vertical list, each with:
- Card name
- Timing tag (Action / Agenda / Component)
- Card text (for reference)
- "Play / Discard" button → calls `game-discard-action-card`

A "Draw" button at the top calls `game-draw-action-card`.

**Discard-required state** (when `myCards.length > 7`):
- Banner explains the player must discard down to 7
- Draw button hidden
- Only per-card discard buttons are active
- No other modal actions available until count ≤ 7

Non-owners never see this modal. The "Action Cards (N)" button in `MyPanelSection` is read-only (shows count, no open action) for other players.

---

## Testing

**Unit — pure logic:**
- `deriveHandState(cards)` — returns `{ cards, overLimit, mustDiscard }`:
  - `overLimit` flag set correctly at 8+
  - Correct at exactly 7 (not over limit)
  - Correct at 0 (empty hand)

**Component rendering — `ActionCardModal`:**
- Cards render with name, timing tag, card text, and discard button
- Draw button present when count ≤ 7; hidden when count > 7
- Discard-required banner shown when count > 7
- Empty state rendered when hand is empty
- Modal does not render (or button is absent) for non-owner

**Component rendering — `ScoreboardSection`:**
- Card count badge renders correct value per player

**Integration — `useGame`:**
- `drawActionCard` wrapper calls Edge Function and handles errors
- `discardActionCard` wrapper calls Edge Function and handles errors
- Realtime update to `game_action_card_deck` propagates to `myCards` state
- Realtime update to `game_players.action_card_count` propagates to scoreboard counts

No Edge Function unit tests (consistent with all prior phases — smoke tested manually post-deploy).
