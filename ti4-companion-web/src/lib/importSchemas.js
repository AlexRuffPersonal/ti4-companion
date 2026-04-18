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
        description: 'Canonical tile number printed on the tile (e.g. "1", "25A", "82B").',
      },
      {
        name: 'type',
        required: true,
        type: 'text',
        values: ['blue', 'red', 'faction', 'mecatol_rex', 'wormhole_nexus'],
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
          'Planets on this tile. Each object has: name (text), resources (integer), influence (integer), optionally tech_specialty (text: "green", "blue", "red", "yellow"), and optionally type (array of: "cultural", "industrial", "hazardous", "legendary").',
      },
      {
        name: 'wormholes',
        required: false,
        type: 'text array',
        default: '[]',
        description: 'Wormhole types on this tile (e.g. ["alpha"], ["alpha","beta","gamma"]).',
      },
      {
        name: 'anomalies',
        required: false,
        type: 'text array',
        default: '[]',
        description: 'Anomalies present on this tile (e.g. ["gravity_rift"], ["nebula","asteroid_field"]).',
      },
      {
        name: 'starts_off_board',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Set to true for tiles that begin outside the main game board (e.g. Tile 51, 82A, 82B).',
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
        name: 'commodities',
        required: true,
        type: 'integer',
        description: 'Starting commodity capacity.',
      },
      {
        name: 'abilities',
        required: true,
        type: 'JSONB array',
        default: '[]',
        description: 'Faction ability objects; each has name (text) and text (text).',
      },
      {
        name: 'starting_techs',
        required: true,
        type: 'TEXT array',
        default: '{}',
        description: 'Array of technology name strings the faction starts with.',
      },
      {
        name: 'num_of_starting_techs',
        required: false,
        type: 'integer',
        description: 'The number of starting techs to choose from.',
      },
      {
        name: 'starting_units',
        required: true,
        type: 'JSONB',
        description: 'A JSON of the starting units for the faction.',
      },
      {
        name: 'overridden_units',
        required: false,
        type: 'TEXT array',
        default: '{}',
        description: 'A list of units that override the generic units.'
      }
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
        values: ['law', 'directive', 'special'],
        description: 'Whether the agenda is a law (permanent effect), a directive (one-time effect), or special (e.g. Covert Legislation).',
      },
      {
        name: 'outcome',
        required: true,
        type: 'text',
        values: ['for_against', 'elect'],
        description: 'How the vote is decided (e.g. "For/Against", "Elect").',
      },
      {
        name: 'elect_type',
        required: false,
        type: 'text',
        description: 'What is being elected when outcome is an Elect (e.g. "Planet", "Strategy Card", "Player").',
      },
      {
        name: 'effect',
        required: true,
        type: 'text',
        description: 'What happens if the agenda passes.',
      },
      {
        name: 'reject_effect',
        required: false,
        type: 'text',
        description: 'What happens if the agenda is rejected.',
      },
      {
        name: 'expansion',
        required: false,
        type: 'text',
        default: 'base',
        description: 'Expansion this agenda belongs to.',
      },
      {
        name: 'remove_if_expansion_in_play',
        required: false,
        type: 'text',
        description: 'This agenda should be removed if this expansion is in play.'
      }
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
        name: 'technology_type',
        required: true,
        type: 'text',
        values: ['green', 'blue', 'red', 'yellow', 'unit_upgrade', 'special'],
        description: 'Technology type.',
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
        description: 'Unit name. Must be unique.',
      },
      {
        name: 'unit_type',
        required: true,
        type: 'text',
        values: ['flagship','war_sun','dreadnought','carrier','cruiser','destroyer','fighter','pds','infantry','space_dock','mech'],
        description: 'Unit type'
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
        name: 'planetary_shield',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this unit is a ground force (placed on planets).',
      },
      {
        name: 'production',
        required: false,
        type: 'text',
        description: 'What production value this unit has (X in case of calculation).'
      },
      {
        name: 'abilities',
        required: false,
        type: 'TEXT array',
        default : [],
        description: 'An array of any abilities'
      }
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
      {
        name: 'has_attachment',
        required: true,
        type: 'boolean',
        default: 'false',
        description: 'Does this exploration card have a related attachment?',
      },
      {
        name: 'purge',
        required: true,
        type: 'boolean',
        default: 'false',
        description: 'Does this exploration card purge after it\'s drawn?',
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
        name: 'tech_specialty',
        required: false,
        type: 'text',
        values: ['blue','green','red','yellow'],
        description: 'The tech specialty that is added to the planet.',
      },
      {
        name: 'text',
        required: false,
        type: 'text',
        description: 'Additional rules text describing the attachment\'s effect.',
      },
      {
        name: 'trait_modifier',
        required: false,
        type: 'array',
        description: 'Planet traits granted by this attachment, e.g. ["cultural","hazardous"].',
      },
      {
        name: 'ability_modifier',
        required: false,
        type: 'JSONB',
        description: 'Unit ability overrides granted by this attachment, e.g. {"space_cannon":"5(x3)"}.',
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
        name: 'text',
        required: false,
        type: 'text',
        description: 'Rules text describing the note\'s effect.',
      },
      {
        name: 'faction',
        required: false,
        type: 'text',
        description: 'Faction name if this is a faction-specific note; omit for generic notes.',
      },
      {
        name: 'purge_on_use',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this note is purged after use.',
      },
      {
        name: 'into_play_area',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Whether this note is put straight into play.',
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

  'ability-definitions': {
    fields: [
      {
        name: 'ability_key',
        required: true,
        type: 'text',
        description: 'Unique slug used to link sources to this ability (e.g. "ancient_burial_sites"). Lowercase with underscores.',
      },
      {
        name: 'ability_name',
        required: true,
        type: 'text',
        description: 'Human-readable ability name (e.g. "Ancient Burial Sites").',
      },
      {
        name: 'trigger',
        required: true,
        type: 'JSONB object',
        description: 'When the ability fires. Required field: event (string). Optional: owner ("self"|"other"|"any"), conditions (array of condition objects). Use event "PASSIVE" for always-on abilities.',
      },
      {
        name: 'unlock_conditions',
        required: false,
        type: 'JSONB array',
        description: 'Commander unlock criteria only. Array of condition objects, each with check (string) and gte (integer). Supported checks: scored_objectives, tech_count, vp_count.',
      },
      {
        name: 'effects',
        required: false,
        type: 'JSONB array',
        description: 'Composable effect ops array. Mutually exclusive with handler. Each op has an "op" field and type-specific fields. See ability system design spec for full op catalogue.',
      },
      {
        name: 'handler',
        required: false,
        type: 'text',
        description: 'Named escape hatch for complex effects not expressible as DSL ops. Mutually exclusive with effects. Must match a registered handler name in abilityHandlers.ts.',
      },
      {
        name: 'exhausts_source',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'If true, the source card is exhausted after this ability resolves.',
      },
      {
        name: 'purges_source',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'If true, the source card is purged (discarded permanently) after this ability resolves.',
      },
    ],
  },

  'ability-sources': {
    fields: [
      {
        name: 'ability_key',
        required: true,
        type: 'text',
        description: 'The ability_key of the ability_definition this source belongs to.',
      },
      {
        name: 'source_type',
        required: true,
        type: 'text',
        values: ['action_card', 'leader', 'relic', 'faction_ability', 'promissory_note', 'exploration_card', 'technology'],
        description: 'The kind of card or entity granting this ability.',
      },
      {
        name: 'source_name',
        required: false,
        type: 'text',
        description: 'The name of the source card (e.g. "Ancient Burial Sites"). Required for all source_types except faction_ability. Used to look up the source UUID automatically.',
      },
      {
        name: 'faction_name',
        required: false,
        type: 'text',
        description: 'Required when source_type is faction_ability. The canonical faction name (e.g. "The Mentak Coalition").',
      },
    ],
  },
}

export default importSchemas
