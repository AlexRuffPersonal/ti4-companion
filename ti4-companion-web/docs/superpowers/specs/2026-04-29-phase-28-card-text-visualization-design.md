# Phase 28 — Card Text Visualization

**Date:** 2026-04-29
**Phase:** 28
**Feature Area:** Card Text Visualization
**Scope:** Pure front-end pass — surface existing DB text fields in four components. No new DB columns, no Edge Functions, no new hooks.

---

## Overview

Four components currently show only names and metadata. This phase adds the text content that already exists in the reference tables so players can read card effects without leaving the app.

| Component | DB field | Display style |
|---|---|---|
| `TechCard` | `technologies.text` | Collapsed by default; expand toggle per card |
| `ObjectivesSection` | `public_objectives.condition` | Always inline below name |
| `VotingPanel` | `agendas.note` | Always inline below agenda name |
| `AgendaResolutionModal` | `agendas.note` | Always shown for all agendas |

---

## Component Designs

### TechCard (`src/components/game/TechCard.jsx`)

- Add `useState(false)` → `isExpanded`.
- Render a small chevron button (`▸` / `▾`) to the right of the tech name, only when `tech.text` is non-empty.
- The toggle button calls `e.stopPropagation()` before flipping `isExpanded`, so it does not also fire `onSelect`.
- When `isExpanded`, render `tech.text` in a `text-dim text-xs` paragraph below the name.
- No prop changes; `TechTreeSection` and `TechTreeModal` are untouched.

### ObjectivesSection (`src/components/game/ObjectivesSection.jsx`)

- Below the name/stage/VP line for each revealed objective, add a `text-dim text-xs` paragraph rendering `ref?.condition`.
- Guard: only render if `ref?.condition` is non-empty.
- No other changes.

### VotingPanel (`src/components/game/VotingPanel.jsx`)

- Add a `text-dim text-xs` paragraph rendering `agenda?.note` directly below the `agenda?.name` display.
- Guard: only render if `agenda?.note` is non-empty.
- Applies to all agenda types.

### AgendaResolutionModal (`src/components/game/AgendaResolutionModal.jsx`)

- The existing `agenda?.note` display is currently inside the `isNonTractable` block.
- Move the note text itself outside that condition so it renders for all agendas.
- The "HOST APPLIES MANUALLY" warning label remains gated on `isNonTractable`.

---

## Tests

Each component already has tests. New test cases:

**TechCard:**
- Tech with non-empty `text`: chevron button rendered; text hidden by default; click chevron → text visible; click again → hidden.
- Tech with empty/null `text`: chevron not rendered.
- Clicking chevron does not call `onSelect`.

**ObjectivesSection:**
- Revealed objective with `condition`: condition text rendered below name.
- Revealed objective with null `condition`: no extra element rendered.

**VotingPanel:**
- Agenda with `note`: note rendered below agenda name.
- Agenda with null `note`: no extra element.

**AgendaResolutionModal:**
- Non-tractable law with `note`: note rendered AND "HOST APPLIES MANUALLY" label rendered.
- Tractable agenda with `note`: note rendered, no "HOST APPLIES MANUALLY" label.
- Agenda with null `note`: no note paragraph.
