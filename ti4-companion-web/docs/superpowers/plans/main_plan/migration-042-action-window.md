# migration-042-action-window
**File:** `supabase/migrations/042_action_window.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE public.games
  ADD COLUMN pending_action_window JSONB;
```

Column is null when no window is open.

Shape when set:
```json
{
  "type": "when_agenda_revealed",
  "eligible_player_ids": ["uuid", "..."],
  "passed_player_ids": [],
  "context": {}
}
```

Valid `type` values: `when_agenda_revealed`, `after_speaker_votes`, `when_voting_begins`, `after_technology_researched`.

RLS: no change — covered by existing `games` policies.

## Tests

None. Verify: `supabase db push` without error.
