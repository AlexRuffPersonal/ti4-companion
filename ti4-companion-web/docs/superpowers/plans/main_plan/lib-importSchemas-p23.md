# lib-importSchemas-p23

**File:** `src/lib/importSchemas.js`
**Status:** Modify
**Prereqs:** —

## Functionality

```js
// Add pgTable string to every entry in importSchemas.
// Maps URL slug → postgres table name (snake_case).

importSchemas = {
  tiles:               { pgTable: 'tiles',               fields: [...] },
  factions:            { pgTable: 'factions',            fields: [...] },
  agendas:             { pgTable: 'agendas',             fields: [...] },
  technologies:        { pgTable: 'technologies',        fields: [...] },
  units:               { pgTable: 'units',               fields: [...] },
  'public-objectives': { pgTable: 'public_objectives',   fields: [...] },
  'secret-objectives': { pgTable: 'secret_objectives',   fields: [...] },
  'action-cards':      { pgTable: 'action_cards',        fields: [...] },
  relics:              { pgTable: 'relics',              fields: [...] },
  'exploration-cards': { pgTable: 'exploration_cards',   fields: [...] },
  attachments:         { pgTable: 'attachments',         fields: [...] },
  'promissory-notes':  { pgTable: 'promissory_notes',    fields: [...] },
  'ability-definitions': { pgTable: 'ability_definitions', fields: [...] },
  'ability-sources':   { pgTable: 'ability_sources',     fields: [...] },
}
```

## Tests

```js
// each entry in importSchemas has a pgTable string
// pgTable values are snake_case (no hyphens)
// slugs with hyphens map to underscore equivalents (e.g. 'action-cards' → 'action_cards')
```
