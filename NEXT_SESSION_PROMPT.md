I'd like to plan the next item from `POTENTIAL_TODOS.md`: the **LRR rules compliance test suite**.

The full description is in `POTENTIAL_TODOS.md` under "Rules Coverage Tests". The idea is to work through the TI4 Living Rules Reference section by section, identify the edge function(s) or hook(s) responsible for each rule, and write Vitest tests that assert rule-correct behaviour — with each test citing the LRR clause number in a comment so future rule changes are easy to locate.

Please read:
- `POTENTIAL_TODOS.md` (project root) for the full description
- `ti4-companion-web/docs/ti4-lrr.md` table of contents (page 3, roughly the first 100 lines) to understand what sections exist
- `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md` for the list of edge functions that have been built
- `CLAUDE.md` for project conventions

Then help me brainstorm and plan this feature. Start by identifying which LRR sections have corresponding edge functions already built, before asking clarifying questions.
