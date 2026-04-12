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
