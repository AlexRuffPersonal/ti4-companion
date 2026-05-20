# Task: fn-game-fire-space-cannon-p43c

## Working Directory
ALL git operations must be done from this worktree:
`C:/Users/alexa/Documents/Coding/TI4-Companion/.claude/worktrees/feature+phases-36-to-43-plus-icons`
Branch: `worktree-feature+phases-36-to-43-plus-icons`

## Spec File
Read the spec before implementing:
`ti4-companion-web/docs/superpowers/plans/main_plan/fn-game-fire-space-cannon-p43c.md`

Also read `ti4-companion-web/docs/superpowers/plans/main_plan/_standards.md` for shorthand tokens used in all specs.

## Actual File to Implement/Modify
`supabase/functions/game-fire-space-cannon/index.ts`

## Phase / Feature Area
Phase 43c — Leader Card Abilities — Commander Passives

## Prerequisites
Before starting, verify these tasks show `done` in `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`:
- shared-leaderEffects-p43c
- shared-abilityHandlers-p43c

## Instructions
1. Read the spec file and `_standards.md` listed above
2. Implement the changes described in the spec
3. Run tests from the worktree: `cd ti4-companion-web && npm test`
4. Commit your changes (ALL git commands must run from the worktree path above)
5. Update `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`: change Status of `fn-game-fire-space-cannon-p43c` from `planned` to `done`
6. Delete this prompt file: `next-session-prompts/fn-game-fire-space-cannon-p43c.md`

## Standards
- Before starting a task, change its status in `_index.md` to `in-progress`
- All Supabase Edge Functions must use: `export async function handler(req: Request): Promise<Response>` + `if (typeof Deno !== 'undefined') Deno.serve(handler)`
- After implementing this Edge Function, deploy it: `supabase functions deploy game-fire-space-cannon --no-verify-jwt`
- Tests live in `ti4-companion-web/tests/`
- Follow existing code patterns in the codebase
