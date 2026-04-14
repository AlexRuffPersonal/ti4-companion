# Admin Import Schema Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible schema reference panel to each admin import page so data-entry admins can see field names, types, valid values, and descriptions without leaving the page.

**Architecture:** A pure data file (`importSchemas.js`) holds field descriptors for all 12 import tables keyed by URL slug. A presentational component (`ImportSchemaPanel`) renders one row per field with badges and descriptions. `AdminImportPage` renders the panel between the description paragraph and the form. `005_reference.sql` gets two developer-facing comment lines above each `CREATE TABLE` block reminding engineers to keep the UI in sync.

**Tech Stack:** React 19, Tailwind CSS 3 with project design tokens (`.label`, `.panel-inset`, `font-mono`, `text-bright`, `text-warning`, `text-dim`, `text-xs`)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/importSchemas.js` | Data-only: field descriptors for all 12 import tables |
| Create | `src/components/admin/ImportSchemaPanel.jsx` | Presentational: renders the schema reference panel |
| Modify | `src/components/admin/AdminImportPage.jsx` | Wire: import and render `ImportSchemaPanel` |
| Modify | `supabase/migrations/005_reference.sql` | Dev reminder: two-line comments above each `CREATE TABLE` |

---

## Task 1: Create `src/lib/importSchemas.js`

**Files:**
- Create: `src/lib/importSchemas.js`

No unit tests required — this is a pure data file.

- [ ] **Step 1: Create the file**

`src/lib/importSchemas.js`:

```js
/**
 * Field descriptors for all 12 admin import tables.
 * Keyed by the URL table slug (matches TABLE_LABELS keys in AdminImportPage).
 *
 * Each entry has a `fields` array. Each field descriptor has:
 *   name        {string}   - Column name as it must appear in the JSON
 *   required    {boolean}  - Whether the Edge Function validator requires it
 *   type        {string}   - Human-readable type
 *   default     {string}   - (optional) Database default value
 *   values      {string[]} - (optional) Exhaustive list of valid string values
 *   description {string}   - Plain-English explanation of the field
 *
 * UI SYNC: Keep this file in sync with supabase/migrations/005_reference.sql.
 * When adding or changing columns, update this file and redeploy the relevant
 * admin-import-<table> Edge Function.
 */
const importSchemas = {
  tiles: {
    fields: [
      {
        name: 'tile_number',
        required: true,
        type: 'text',
        description: 'Canonical tile number printed on the tile (e.g. "1", "25A").',
      },
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Display name of the tile (e.g. "Mecatol Rex").',
      },
      {
        name: 'type',
        required: true,
        type: 'text',
        values: ['blue', 'red', 'home', 'hyperlane', 'frontier'],
        description: 'Tile classification; determines which deck it belongs to.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this tile belongs to (e.g. "base", "pok", "te").',
      },
      {
        name: 'planets',
        required: false,
        type: 'JSONB array',
        default: '[]',
        description:
          'Planets on this tile. Each object has name (text), resources (integer), influence (integer), and optionally tech_specialty (text, e.g. "green", "blue", "red", "yellow").',
      },
      {
        name: 'anomaly',
        required: false,
        type: 'text',
        description: 'Anomaly present on this tile, if any (e.g. "gravity_rift", "nebula").',
      },
      {
        name: 'wormhole',
        required: false,
        type: 'text',
        description: 'Wormhole type on this tile, if any (e.g. "alpha", "beta", "delta").',
      },
    ],
  },

  factions: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Canonical faction name (e.g. "The Barony of Letnev"). Must be unique.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this faction belongs to (e.g. "base", "pok", "te").',
      },
      {
        name: 'starting_techs',
        required: false,
        type: 'TEXT array',
        default: '{}',
        description: 'Array of technology name strings the faction starts with.',
      },
      {
        name: 'home_tile_number',
        required: false,
        type: 'text',
        description: 'tile_number of this faction\'s home system tile.',
      },
      {
        name: 'commodities',
        required: false,
        type: 'integer',
        default: '3',
        description: 'Starting commodity capacity.',
      },
      {
        name: 'abilities',
        required: false,
        type: 'JSONB array',
        default: '[]',
        description: 'Faction ability objects; each has name (text) and text (text).',
      },
      {
        name: 'flagship',
        required: false,
        type: 'JSONB',
        description: 'Flagship unit stats object; has name and combat stats.',
      },
      {
        name: 'mech',
        required: false,
        type: 'JSONB',
        description: 'Mech unit stats object; has name and abilities.',
      },
      {
        name: 'promissory_notes',
        required: false,
        type: 'JSONB array',
        default: '[]',
        description: 'Faction-specific promissory note objects included with the faction sheet.',
      },
    ],
  },

  agendas: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Agenda card name.',
      },
      {
        name: 'type',
        required: true,
        type: 'text',
        values: ['law', 'directive'],
        description: 'Whether the agenda is a law (permanent effect) or a directive (one-time effect).',
      },
      {
        name: 'outcome',
        required: true,
        type: 'text',
        description: 'How the vote is decided (e.g. "For/Against", "Elect Player").',
      },
      {
        name: 'elect_type',
        required: false,
        type: 'text',
        description: 'What is being elected when outcome is an Elect (e.g. "Planet", "Strategy Card").',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this agenda belongs to.',
      },
      {
        name: 'note',
        required: false,
        type: 'text',
        description: 'Additional notes about the agenda\'s effect or errata.',
      },
    ],
  },

  technologies: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Technology name.',
      },
      {
        name: 'colour',
        required: true,
        type: 'text',
        values: ['green', 'blue', 'red', 'yellow'],
        description: 'Technology colour/category.',
      },
      {
        name: 'prerequisites',
        required: false,
        type: 'JSONB',
        default: '{}',
        description: 'Prerequisite counts by colour, e.g. {"green": 2, "blue": 1}.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the technology\'s effect.',
      },
      {
        name: 'is_unit_upgrade',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this technology is a unit upgrade.',
      },
      {
        name: 'unit_stats',
        required: false,
        type: 'JSONB',
        description: 'Stat block for unit upgrade technologies.',
      },
      {
        name: 'faction',
        required: false,
        type: 'text',
        description: 'Faction name if this is a faction-specific technology; omit for generic techs.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this technology belongs to.',
      },
    ],
  },

  units: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Unit type name (e.g. "Carrier", "Dreadnought"). Must be unique.',
      },
      {
        name: 'cost',
        required: false,
        type: 'numeric',
        description: 'Resource cost to produce.',
      },
      {
        name: 'combat',
        required: false,
        type: 'text',
        description: 'Combat dice notation (e.g. "9(x2)").',
      },
      {
        name: 'move',
        required: false,
        type: 'integer',
        description: 'Movement value.',
      },
      {
        name: 'capacity',
        required: false,
        type: 'integer',
        description: 'Transport capacity (number of fighters/ground forces).',
      },
      {
        name: 'sustain_damage',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this unit can sustain damage.',
      },
      {
        name: 'bombardment',
        required: false,
        type: 'text',
        description: 'Bombardment dice notation.',
      },
      {
        name: 'afb',
        required: false,
        type: 'text',
        description: 'Anti-Fighter Barrage dice notation.',
      },
      {
        name: 'space_cannon',
        required: false,
        type: 'text',
        description: 'Space Cannon dice notation.',
      },
      {
        name: 'planetary',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this unit is a ground force (placed on planets).',
      },
    ],
  },

  'public-objectives': {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Objective card name.',
      },
      {
        name: 'stage',
        required: true,
        type: 'integer',
        description: 'Stage 1 or 2.',
      },
      {
        name: 'condition',
        required: true,
        type: 'text',
        description: 'The scoring condition text as printed on the card.',
      },
      {
        name: 'points',
        required: false,
        type: 'integer',
        default: '1',
        description: 'Victory points awarded for scoring.',
      },
      {
        name: 'category',
        required: false,
        type: 'text',
        description: 'Thematic category (e.g. "military", "expansion").',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this objective belongs to.',
      },
    ],
  },

  'secret-objectives': {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Secret objective card name.',
      },
      {
        name: 'condition',
        required: true,
        type: 'text',
        description: 'The scoring condition text as printed on the card.',
      },
      {
        name: 'points',
        required: false,
        type: 'integer',
        default: '1',
        description: 'Victory points awarded for scoring.',
      },
      {
        name: 'timing',
        required: false,
        type: 'text',
        description: 'When the objective can be scored (e.g. "Action Phase", "Status Phase").',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this objective belongs to.',
      },
    ],
  },

  'action-cards': {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Action card name.',
      },
      {
        name: 'timing',
        required: false,
        type: 'text',
        description: 'When the card can be played (e.g. "Action", "Combat Round").',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the card\'s effect.',
      },
      {
        name: 'type',
        required: false,
        type: 'text',
        description: 'Card type or category.',
      },
      {
        name: 'quantity',
        required: false,
        type: 'integer',
        default: '1',
        description: 'Number of copies of this card in the deck.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this card belongs to.',
      },
    ],
  },

  relics: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Relic name.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the relic\'s effect.',
      },
      {
        name: 'exhaustable',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this relic must be exhausted to use.',
      },
      {
        name: 'transferable',
        required: false,
        type: 'boolean',
        default: 'true',
        description: 'Whether this relic can be transferred between players.',
      },
      {
        name: 'vp_bearing',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether holding this relic grants victory points.',
      },
      {
        name: 'purge_on_use',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this relic is purged after use.',
      },
    ],
  },

  'exploration-cards': {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Exploration card name.',
      },
      {
        name: 'deck_type',
        required: true,
        type: 'text',
        values: ['cultural', 'industrial', 'hazardous', 'frontier'],
        description: 'Which exploration deck this card belongs to.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the card\'s effect.',
      },
      {
        name: 'quantity',
        required: false,
        type: 'integer',
        default: '1',
        description: 'Number of copies of this card in the deck.',
      },
      {
        name: 'relic_fragment_type',
        required: false,
        type: 'text',
        description: 'Relic fragment type if this is a relic fragment card (e.g. "cultural", "industrial", "hazardous").',
      },
    ],
  },

  attachments: {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Attachment token name.',
      },
      {
        name: 'planet_trait',
        required: false,
        type: 'text',
        description: 'Planet trait this attachment applies to (e.g. "cultural", "industrial", "hazardous").',
      },
      {
        name: 'resource_modifier',
        required: false,
        type: 'integer',
        default: '0',
        description: 'Modifier added to the planet\'s resource value.',
      },
      {
        name: 'influence_modifier',
        required: false,
        type: 'integer',
        default: '0',
        description: 'Modifier added to the planet\'s influence value.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Additional rules text describing the attachment\'s effect.',
      },
    ],
  },

  'promissory-notes': {
    fields: [
      {
        name: 'name',
        required: true,
        type: 'text',
        description: 'Promissory note name.',
      },
      {
        name: 'faction',
        required: false,
        type: 'text',
        description: 'Faction name if this is a faction-specific note; omit for generic notes.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the note\'s effect.',
      },
      {
        name: 'returns_to_owner',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this note returns to the original owner after use.',
      },
      {
        name: 'purge_on_use',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this note is purged after use.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this note belongs to.',
      },
    ],
  },
}

export default importSchemas
```

- [ ] **Step 2: Verify the file has all 12 slugs**

Run from `ti4-companion-web/`:
```bash
node -e "import('./src/lib/importSchemas.js').then(m => console.log(Object.keys(m.default)))"
```
Expected output:
```
[
  'tiles',
  'factions',
  'agendas',
  'technologies',
  'units',
  'public-objectives',
  'secret-objectives',
  'action-cards',
  'relics',
  'exploration-cards',
  'attachments',
  'promissory-notes'
]
```

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/src/lib/importSchemas.js
git commit -m "feat: add importSchemas.js with field descriptors for all 12 import tables"
```

---

## Task 2: Create `src/components/admin/ImportSchemaPanel.jsx`

**Files:**
- Create: `src/components/admin/ImportSchemaPanel.jsx`

No unit tests required — this is a pure presentational component with no logic.

- [ ] **Step 1: Create the component**

`src/components/admin/ImportSchemaPanel.jsx`:

```jsx
/**
 * ImportSchemaPanel
 *
 * Always-visible schema reference panel rendered on admin import pages.
 * Receives the schema entry for the current table from importSchemas.js,
 * or null/undefined if no schema exists for the table.
 */
export default function ImportSchemaPanel({ schema }) {
  if (!schema) return null

  return (
    <div className="mb-6">
      <p className="label mb-2">SCHEMA REFERENCE</p>
      <div className="panel-inset flex flex-col gap-3">
        {schema.fields.map(field => (
          <div key={field.name}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-bright text-sm">{field.name}</span>
              {field.required
                ? <span className="label text-warning text-xs">required</span>
                : <span className="label text-dim text-xs">optional</span>
              }
              <span className="text-dim text-xs">{field.type}</span>
              {field.default !== undefined && (
                <span className="text-dim text-xs">default: &quot;{field.default}&quot;</span>
              )}
              {field.values && (
                <span className="text-dim text-xs">{field.values.join(' | ')}</span>
              )}
            </div>
            <p className="text-dim text-xs mt-0.5">{field.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/src/components/admin/ImportSchemaPanel.jsx
git commit -m "feat: add ImportSchemaPanel presentational component"
```

---

## Task 3: Wire `ImportSchemaPanel` into `AdminImportPage`

**Files:**
- Modify: `src/components/admin/AdminImportPage.jsx`

- [ ] **Step 1: Add imports**

In `src/components/admin/AdminImportPage.jsx`, add two imports after the existing `importTable` import:

```jsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { importTable } from '../../lib/edgeFunctions.js'
import importSchemas from '../../lib/importSchemas.js'
import ImportSchemaPanel from './ImportSchemaPanel.jsx'
```

- [ ] **Step 2: Render the panel**

In the JSX return, insert `<ImportSchemaPanel>` between the `<p>` description and the `<form>`. The full updated return block:

```jsx
  return (
    <div className="min-h-screen bg-void p-8 max-w-2xl">
      <Link to="/admin" className="label text-muted hover:text-text mb-6 inline-block">
        ← Back to Reference Data
      </Link>
      <h1 className="font-display text-bright text-xl tracking-widest mb-2">
        IMPORT {label.toUpperCase()}
      </h1>
      <p className="text-dim text-sm mb-6">
        Replaces all existing {label} records.
      </p>

      <ImportSchemaPanel schema={importSchemas[table]} />

      {status && (
        <div
          className={`panel-inset mb-6 text-sm ${
            status.type === 'success' ? 'text-success' : 'text-danger'
          }`}
        >
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          className="input font-mono text-xs h-48 resize-y"
          placeholder={`[{"name": "...", ...}, ...]`}
          value={json}
          onChange={e => setJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Importing...' : `Import ${label}`}
          </button>
        </div>
      </form>
    </div>
  )
```

- [ ] **Step 3: Start the dev server and verify**

Run from `ti4-companion-web/`:
```bash
npm run dev
```

Visit each of the 12 import pages and verify the schema panel appears correctly:
- `http://localhost:5173/admin/import/tiles`
- `http://localhost:5173/admin/import/factions`
- `http://localhost:5173/admin/import/agendas`
- `http://localhost:5173/admin/import/technologies`
- `http://localhost:5173/admin/import/units`
- `http://localhost:5173/admin/import/public-objectives`
- `http://localhost:5173/admin/import/secret-objectives`
- `http://localhost:5173/admin/import/action-cards`
- `http://localhost:5173/admin/import/relics`
- `http://localhost:5173/admin/import/exploration-cards`
- `http://localhost:5173/admin/import/attachments`
- `http://localhost:5173/admin/import/promissory-notes`

Check on each page:
- "SCHEMA REFERENCE" label appears above a panel-inset block
- Each field shows: name (mono bright) + required/optional badge + type + default (if any) + valid values (if any) + description
- Panel appears between the "Replaces all existing…" line and the textarea form
- No panel appears if you navigate to an unknown table slug (graceful null return)

- [ ] **Step 4: Run tests to confirm no regressions**

```bash
npm test
```
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/admin/AdminImportPage.jsx
git commit -m "feat: render ImportSchemaPanel in AdminImportPage between description and form"
```

---

## Task 4: Add developer sync comments to `supabase/migrations/005_reference.sql`

**Files:**
- Modify: `supabase/migrations/005_reference.sql`

The spec requires two comment lines inserted immediately above each `CREATE TABLE` block — below the existing section-header comment. The format is:

```sql
-- ── <Section> ────...
-- <Short description of what the table stores.>
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('<slug>' entry) and redeploy <function-name>.
CREATE TABLE public.<table_name> (
```

- [ ] **Step 1: Add comments for all 12 tables**

Replace the content of `supabase/migrations/005_reference.sql` from line 1 through line 138 (the 12 CREATE TABLE blocks and their existing section-header comments) with the following. The `ALTER TABLE` foreign key block at the end (lines 140–184) is unchanged.

**Tiles** — replace:
```sql
-- ── Tiles ────────────────────────────────────────────────────────────────────
CREATE TABLE public.tiles (
```
with:
```sql
-- ── Tiles ────────────────────────────────────────────────────────────────────
-- Map system tiles: hex tiles used on the game board, including home systems, blue/red tiles, and hyperlanes.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('tiles' entry) and redeploy admin-import-tiles.
CREATE TABLE public.tiles (
```

**Factions** — replace:
```sql
-- ── Factions ─────────────────────────────────────────────────────────────────
CREATE TABLE public.factions (
```
with:
```sql
-- ── Factions ─────────────────────────────────────────────────────────────────
-- Playable factions with their starting state, abilities, flagship, mech, and faction-specific promissory notes.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('factions' entry) and redeploy admin-import-factions.
CREATE TABLE public.factions (
```

**Agendas** — replace:
```sql
-- ── Agendas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.agendas (
```
with:
```sql
-- ── Agendas ──────────────────────────────────────────────────────────────────
-- Agenda cards drawn during the Agenda Phase; may be laws (permanent) or directives (one-time).
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('agendas' entry) and redeploy admin-import-agendas.
CREATE TABLE public.agendas (
```

**Technologies** — replace:
```sql
-- ── Technologies ─────────────────────────────────────────────────────────────
CREATE TABLE public.technologies (
```
with:
```sql
-- ── Technologies ─────────────────────────────────────────────────────────────
-- Technology cards players can research; includes unit upgrades and faction-specific technologies.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('technologies' entry) and redeploy admin-import-technologies.
CREATE TABLE public.technologies (
```

**Units** — replace:
```sql
-- ── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE public.units (
```
with:
```sql
-- ── Units ────────────────────────────────────────────────────────────────────
-- Generic unit type definitions with combat stats shared across all factions.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('units' entry) and redeploy admin-import-units.
CREATE TABLE public.units (
```

**Public Objectives** — replace:
```sql
-- ── Public Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.public_objectives (
```
with:
```sql
-- ── Public Objectives ────────────────────────────────────────────────────────
-- Stage 1 and Stage 2 public objectives that all players may score.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('public-objectives' entry) and redeploy admin-import-public-objectives.
CREATE TABLE public.public_objectives (
```

**Secret Objectives** — replace:
```sql
-- ── Secret Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.secret_objectives (
```
with:
```sql
-- ── Secret Objectives ────────────────────────────────────────────────────────
-- Secret objectives dealt privately to each player.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('secret-objectives' entry) and redeploy admin-import-secret-objectives.
CREATE TABLE public.secret_objectives (
```

**Action Cards** — replace:
```sql
-- ── Action Cards ─────────────────────────────────────────────────────────────
CREATE TABLE public.action_cards (
```
with:
```sql
-- ── Action Cards ─────────────────────────────────────────────────────────────
-- Action cards drawn and played during the Action Phase.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('action-cards' entry) and redeploy admin-import-action-cards.
CREATE TABLE public.action_cards (
```

**Relics** — replace:
```sql
-- ── Relics ───────────────────────────────────────────────────────────────────
CREATE TABLE public.relics (
```
with:
```sql
-- ── Relics ───────────────────────────────────────────────────────────────────
-- Relic cards obtained through exploration or Shard of the Throne scoring.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('relics' entry) and redeploy admin-import-relics.
CREATE TABLE public.relics (
```

**Exploration Cards** — replace:
```sql
-- ── Exploration Cards ────────────────────────────────────────────────────────
CREATE TABLE public.exploration_cards (
```
with:
```sql
-- ── Exploration Cards ────────────────────────────────────────────────────────
-- Exploration cards drawn when a player explores a planet or frontier token.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('exploration-cards' entry) and redeploy admin-import-exploration-cards.
CREATE TABLE public.exploration_cards (
```

**Attachments** — replace:
```sql
-- ── Attachments ──────────────────────────────────────────────────────────────
CREATE TABLE public.attachments (
```
with:
```sql
-- ── Attachments ──────────────────────────────────────────────────────────────
-- Attachment tokens placed on planets to modify their resource/influence values.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('attachments' entry) and redeploy admin-import-attachments.
CREATE TABLE public.attachments (
```

**Promissory Notes** — replace:
```sql
-- ── Promissory Notes ─────────────────────────────────────────────────────────
CREATE TABLE public.promissory_notes (
```
with:
```sql
-- ── Promissory Notes ─────────────────────────────────────────────────────────
-- Generic (non-faction) promissory notes; faction-specific notes are stored on the factions table.
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('promissory-notes' entry) and redeploy admin-import-promissory-notes.
CREATE TABLE public.promissory_notes (
```

- [ ] **Step 2: Verify comment count**

```bash
grep -c "UI SYNC" supabase/migrations/005_reference.sql
```
Expected output: `12`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_reference.sql
git commit -m "docs: add UI SYNC comments above each CREATE TABLE in 005_reference.sql"
```

---

## Self-Review

**Spec coverage:**
- [x] `src/lib/importSchemas.js` — created with all 12 table slugs and field descriptors matching the spec exactly
- [x] `src/components/admin/ImportSchemaPanel.jsx` — presentational component; renders nothing for null schema, `.label` header, `panel-inset` block, one row per field with name/badge/type/default/values/description
- [x] `AdminImportPage.jsx` — `ImportSchemaPanel` rendered between `<p>` description and `<form>`
- [x] `005_reference.sql` — two-line comment block (description + UI SYNC with slug and function name) above each of the 12 `CREATE TABLE` blocks
- [x] No new unit tests — pure data file and pure presentational component; manual verification via dev server covers all 12 pages

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N" references found.

**Type consistency:** `schema.fields` array accessed in `ImportSchemaPanel` matches the `fields` array structure defined in `importSchemas.js`. `field.default`, `field.values`, `field.required`, `field.name`, `field.type`, `field.description` — all property names are consistent between the data file and the component.
