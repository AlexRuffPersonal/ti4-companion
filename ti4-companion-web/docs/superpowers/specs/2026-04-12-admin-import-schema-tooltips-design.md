# Admin Import Schema Tooltips — Design Spec

**Date:** 2026-04-12
**Status:** Approved

---

## Overview

Add an always-visible schema reference panel to each admin import page so that the person entering data can see the expected field names, types, valid values, and descriptions without leaving the page. Add corresponding comments to the SQL migration file to remind developers to keep the UI in sync whenever a table schema changes.

---

## Architecture

### New files

- `src/lib/importSchemas.js` — data file; exports a map keyed by table slug → field descriptors
- `src/components/admin/ImportSchemaPanel.jsx` — presentational component; renders the panel from a schema entry

### Modified files

- `src/components/admin/AdminImportPage.jsx` — imports and renders `ImportSchemaPanel` between the description line and the form
- `supabase/migrations/005_reference.sql` — add a two-line comment above each of the 12 `CREATE TABLE` blocks

---

## Data File — `src/lib/importSchemas.js`

Exports a default object keyed by the URL table slug (matching the keys in `TABLE_LABELS` in `AdminImportPage`). Each value has a `fields` array. Each field descriptor has:

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Column name as it must appear in the JSON |
| `required` | boolean | yes | Whether the field is required by the Edge Function validator |
| `type` | string | yes | Human-readable type (e.g. `"text"`, `"integer"`, `"boolean"`, `"JSONB array"`) |
| `default` | string | no | Database default value, shown when `required` is false |
| `values` | string[] | no | Exhaustive list of valid string values for enum fields |
| `description` | string | yes | Plain-English explanation of what the field represents |

### Schema entries

#### `tiles`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `tile_number` | yes | text | — | — | Canonical tile number printed on the tile (e.g. "1", "25A"). |
| `name` | yes | text | — | — | Display name of the tile (e.g. "Mecatol Rex"). |
| `type` | yes | text | — | `blue`, `red`, `home`, `hyperlane`, `frontier` | Tile classification; determines which deck it belongs to. |
| `expansion` | no | text | `base` | — | Expansion this tile belongs to (e.g. `base`, `pok`, `te`). |
| `planets` | no | JSONB array | `[]` | — | Planets on this tile. Each object has `name` (text), `resources` (integer), `influence` (integer), and optionally `tech_specialty` (text, e.g. `"green"`, `"blue"`, `"red"`, `"yellow"`). |
| `anomaly` | no | text | — | — | Anomaly present on this tile, if any (e.g. `"gravity_rift"`, `"nebula"`). |
| `wormhole` | no | text | — | — | Wormhole type on this tile, if any (e.g. `"alpha"`, `"beta"`, `"delta"`). |

#### `factions`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Canonical faction name (e.g. "The Barony of Letnev"). Must be unique. |
| `expansion` | no | text | `base` | — | Expansion this faction belongs to (e.g. `base`, `pok`, `te`). |
| `starting_techs` | no | TEXT array | `{}` | — | Array of technology name strings the faction starts with. |
| `home_tile_number` | no | text | — | — | `tile_number` of this faction's home system tile. |
| `commodities` | no | integer | `3` | — | Starting commodity capacity. |
| `abilities` | no | JSONB array | `[]` | — | Faction ability objects; each has `name` (text) and `text` (text). |
| `flagship` | no | JSONB | — | — | Flagship unit stats object; has `name` and combat stats. |
| `mech` | no | JSONB | — | — | Mech unit stats object; has `name` and abilities. |
| `promissory_notes` | no | JSONB array | `[]` | — | Faction-specific promissory note objects included with the faction sheet. |

#### `agendas`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Agenda card name. |
| `type` | yes | text | — | `law`, `directive` | Whether the agenda is a law (permanent effect) or a directive (one-time effect). |
| `outcome` | yes | text | — | — | How the vote is decided (e.g. `"For/Against"`, `"Elect Player"`). |
| `elect_type` | no | text | — | — | What is being elected when outcome is an Elect (e.g. `"Planet"`, `"Strategy Card"`). |
| `expansion` | no | text | `base` | — | Expansion this agenda belongs to. |
| `note` | no | text | — | — | Additional notes about the agenda's effect or errata. |

#### `technologies`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Technology name. |
| `colour` | yes | text | — | `green`, `blue`, `red`, `yellow` | Technology colour/category. |
| `prerequisites` | no | JSONB | `{}` | — | Prerequisite counts by colour, e.g. `{"green": 2, "blue": 1}`. |
| `text` | no | text | — | — | Rules text describing the technology's effect. |
| `is_unit_upgrade` | no | boolean | `false` | — | Whether this technology is a unit upgrade. |
| `unit_stats` | no | JSONB | — | — | Stat block for unit upgrade technologies. |
| `faction` | no | text | — | — | Faction name if this is a faction-specific technology; omit for generic techs. |
| `expansion` | no | text | `base` | — | Expansion this technology belongs to. |

#### `units`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Unit type name (e.g. `"Carrier"`, `"Dreadnought"`). Must be unique. |
| `cost` | no | numeric | — | — | Resource cost to produce. |
| `combat` | no | text | — | — | Combat dice notation (e.g. `"9(x2)"`). |
| `move` | no | integer | — | — | Movement value. |
| `capacity` | no | integer | — | — | Transport capacity (number of fighters/ground forces). |
| `sustain_damage` | no | boolean | `false` | — | Whether this unit can sustain damage. |
| `bombardment` | no | text | — | — | Bombardment dice notation. |
| `afb` | no | text | — | — | Anti-Fighter Barrage dice notation. |
| `space_cannon` | no | text | — | — | Space Cannon dice notation. |
| `planetary` | no | boolean | `false` | — | Whether this unit is a ground force (placed on planets). |

#### `public-objectives`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Objective card name. |
| `stage` | yes | integer | — | — | Stage 1 or 2. |
| `condition` | yes | text | — | — | The scoring condition text as printed on the card. |
| `points` | no | integer | `1` | — | Victory points awarded for scoring. |
| `category` | no | text | — | — | Thematic category (e.g. `"military"`, `"expansion"`). |
| `expansion` | no | text | `base` | — | Expansion this objective belongs to. |

#### `secret-objectives`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Secret objective card name. |
| `condition` | yes | text | — | — | The scoring condition text as printed on the card. |
| `points` | no | integer | `1` | — | Victory points awarded for scoring. |
| `timing` | no | text | — | — | When the objective can be scored (e.g. `"Action Phase"`, `"Status Phase"`). |
| `expansion` | no | text | `base` | — | Expansion this objective belongs to. |

#### `action-cards`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Action card name. |
| `timing` | no | text | — | — | When the card can be played (e.g. `"Action"`, `"Combat Round"`). |
| `text` | no | text | — | — | Rules text describing the card's effect. |
| `type` | no | text | — | — | Card type or category. |
| `quantity` | no | integer | `1` | — | Number of copies of this card in the deck. |
| `expansion` | no | text | `base` | — | Expansion this card belongs to. |

#### `relics`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Relic name. |
| `text` | no | text | — | — | Rules text describing the relic's effect. |
| `exhaustable` | no | boolean | `false` | — | Whether this relic must be exhausted to use. |
| `transferable` | no | boolean | `true` | — | Whether this relic can be transferred between players. |
| `vp_bearing` | no | boolean | `false` | — | Whether holding this relic grants victory points. |
| `purge_on_use` | no | boolean | `false` | — | Whether this relic is purged after use. |

#### `exploration-cards`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Exploration card name. |
| `deck_type` | yes | text | — | `cultural`, `industrial`, `hazardous`, `frontier` | Which exploration deck this card belongs to. |
| `text` | no | text | — | — | Rules text describing the card's effect. |
| `quantity` | no | integer | `1` | — | Number of copies of this card in the deck. |
| `relic_fragment_type` | no | text | — | — | Relic fragment type if this is a relic fragment card (e.g. `"cultural"`, `"industrial"`, `"hazardous"`). |

#### `attachments`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Attachment token name. |
| `planet_trait` | no | text | — | — | Planet trait this attachment applies to (e.g. `"cultural"`, `"industrial"`, `"hazardous"`). |
| `resource_modifier` | no | integer | `0` | — | Modifier added to the planet's resource value. |
| `influence_modifier` | no | integer | `0` | — | Modifier added to the planet's influence value. |
| `text` | no | text | — | — | Additional rules text describing the attachment's effect. |

#### `promissory-notes`

| Field | Required | Type | Default | Valid values | Description |
|---|---|---|---|---|---|
| `name` | yes | text | — | — | Promissory note name. |
| `faction` | no | text | — | — | Faction name if this is a faction-specific note; omit for generic notes. |
| `text` | no | text | — | — | Rules text describing the note's effect. |
| `returns_to_owner` | no | boolean | `false` | — | Whether this note returns to the original owner after use. |
| `purge_on_use` | no | boolean | `false` | — | Whether this note is purged after use. |
| `expansion` | no | text | `base` | — | Expansion this note belongs to. |

---

## UI Component — `ImportSchemaPanel`

**Location:** `src/components/admin/ImportSchemaPanel.jsx`

**Props:** receives the schema entry for the current table (the value from `importSchemas.js`, or `null`/`undefined`).

**Renders:**
- Nothing if no schema entry exists for the table (graceful fallback).
- A `SCHEMA REFERENCE` label (`.label` class) above a `panel-inset` block.
- One row per field:
  - Field name in `font-mono text-bright`
  - `required` badge (e.g. `text-warning`) or `optional` badge (`text-dim`)
  - Type in `text-dim`
  - Default value if present (e.g. `default: "base"`)
  - Valid values if present (inline pipe-separated, e.g. `blue | red | home | ...`)
  - Description in `text-dim text-xs`

**Placement in `AdminImportPage`:** between the `<p>` description line and the `<form>` element, always visible.

---

## SQL Comments — `supabase/migrations/005_reference.sql`

Each of the 12 `CREATE TABLE` blocks gets two comment lines inserted immediately above it:

```sql
-- <Short description of what the table stores.>
-- UI SYNC: If you change columns or valid values, update src/lib/importSchemas.js ('<slug>' entry) and redeploy <function-name>.
CREATE TABLE public.<table_name> (
```

The Edge Function name is included explicitly so the developer knows exactly what to redeploy.

---

## Testing

No new unit tests are required — `importSchemas.js` is a pure data file and `ImportSchemaPanel` is a simple presentational component with no logic. Manual verification: visit each of the 12 import pages in the dev server and confirm the panel renders correctly with accurate field info.
