# Task: fn-game-declare-retreat-p38

## Working Directory
ALL git operations must be done from this worktree:
`C:/Users/alexa/Documents/Coding/TI4-Companion/.claude/worktrees/feature+phases-36-to-43-plus-icons`
Branch: `worktree-feature+phases-36-to-43-plus-icons`

## Spec File
Read the spec before implementing:
`ti4-companion-web/docs/superpowers/plans/main_plan/fn-game-declare-retreat-p38.md`

Also read `ti4-companion-web/docs/superpowers/plans/main_plan/_standards.md` for shorthand tokens used in all specs.

## Actual File to Implement/Modify
`supabase/functions/game-declare-retreat/index.ts`

## Phase / Feature Area
Phase 38 — Dark Energy Tap

## Prerequisites
Before starting, verify these tasks show `done` in `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`:
- fn-game-declare-retreat-p20

## Instructions
1. Read the spec file and `_standards.md` listed above
2. Implement the changes described in the spec
3. Run tests from the worktree: `cd ti4-companion-web && npm test`
4. Commit your changes (ALL git commands must run from the worktree path above)
5. Update `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`: change Status of `fn-game-declare-retreat-p38` from `planned` to `done`
6. Delete this prompt file: `next-session-prompts/fn-game-declare-retreat-p38.md`

## Standards
- Before starting a task, change its status in `_index.md` to `in-progress`
- All Supabase Edge Functions must use: `export async function handler(req: Request): Promise<Response>` + `if (typeof Deno !== 'undefined') Deno.serve(handler)`
- After implementing this Edge Function, deploy it: `supabase functions deploy game-declare-retreat --no-verify-jwt`
- Tests live in `ti4-companion-web/tests/`
- Follow existing code patterns in the codebase
