import { describe, it, expect } from 'vitest'
import importSchemas from '../../src/lib/importSchemas.js'

// ── Structural integrity ─────────────────────────────────────────────────────

const EXPECTED_TABLES = [
  'tiles', 'factions', 'agendas', 'technologies', 'units',
  'public-objectives', 'secret-objectives', 'action-cards',
  'relics', 'exploration-cards', 'attachments', 'promissory-notes',
  'ability-definitions', 'ability-sources',
]

describe('importSchemas structure', () => {
  it('exports all 14 table slugs', () => {
    expect(Object.keys(importSchemas)).toEqual(EXPECTED_TABLES)
  })

  it.each(EXPECTED_TABLES)('%s has a non-empty fields array', (slug) => {
    expect(Array.isArray(importSchemas[slug].fields)).toBe(true)
    expect(importSchemas[slug].fields.length).toBeGreaterThan(0)
  })

  it.each(EXPECTED_TABLES)('%s: every field has name, required, type, and description', (slug) => {
    for (const field of importSchemas[slug].fields) {
      expect(typeof field.name, `${slug}.${field.name} missing name`).toBe('string')
      expect(typeof field.required, `${slug}.${field.name} missing required`).toBe('boolean')
      expect(typeof field.type, `${slug}.${field.name} missing type`).toBe('string')
      expect(typeof field.description, `${slug}.${field.name} missing description`).toBe('string')
    }
  })
})

// ── Technologies ─────────────────────────────────────────────────────────────

describe('importSchemas technologies', () => {
  const schema = importSchemas.technologies
  const fieldNames = schema.fields.map(f => f.name)

  it('uses technology_type (not type or colour) as the type field name', () => {
    expect(fieldNames).toContain('technology_type')
    expect(fieldNames).not.toContain('colour')
    expect(fieldNames).not.toContain('type')
  })

  it('technology_type is required', () => {
    const f = schema.fields.find(f => f.name === 'technology_type')
    expect(f.required).toBe(true)
  })

  it('technology_type values include unit_upgrade', () => {
    const f = schema.fields.find(f => f.name === 'technology_type')
    expect(f.values).toContain('unit_upgrade')
  })

  it('technology_type values include the four colours', () => {
    const f = schema.fields.find(f => f.name === 'technology_type')
    expect(f.values).toEqual(expect.arrayContaining(['green', 'blue', 'red', 'yellow']))
  })

  it('does not include removed fields is_unit_upgrade or unit_stats', () => {
    expect(fieldNames).not.toContain('is_unit_upgrade')
    expect(fieldNames).not.toContain('unit_stats')
  })
})

// ── Agendas ──────────────────────────────────────────────────────────────────

describe('importSchemas agendas', () => {
  const schema = importSchemas.agendas
  const fieldNames = schema.fields.map(f => f.name)

  it('type values include special', () => {
    const f = schema.fields.find(f => f.name === 'type')
    expect(f.values).toContain('special')
    expect(f.values).toContain('law')
    expect(f.values).toContain('directive')
  })

  it('outcome has explicit values enum', () => {
    const f = schema.fields.find(f => f.name === 'outcome')
    expect(Array.isArray(f.values)).toBe(true)
    expect(f.values).toContain('for_against')
    expect(f.values).toContain('elect')
  })

  it('effect is a required field', () => {
    const f = schema.fields.find(f => f.name === 'effect')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
  })

  it('does not include removed note field', () => {
    expect(fieldNames).not.toContain('note')
  })
})

// ── Units ────────────────────────────────────────────────────────────────────

describe('importSchemas units', () => {
  const schema = importSchemas.units
  const fieldNames = schema.fields.map(f => f.name)

  it('has unit_type as a required field', () => {
    const f = schema.fields.find(f => f.name === 'unit_type')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
  })

  it('unit_type has valid values including all unit classes', () => {
    const f = schema.fields.find(f => f.name === 'unit_type')
    expect(f.values).toEqual(expect.arrayContaining([
      'flagship', 'war_sun', 'dreadnought', 'carrier', 'cruiser',
      'destroyer', 'fighter', 'pds', 'infantry', 'space_dock', 'mech',
    ]))
  })

  it('uses planetary_shield (not planetary)', () => {
    expect(fieldNames).toContain('planetary_shield')
    expect(fieldNames).not.toContain('planetary')
  })
})

// ── Factions ─────────────────────────────────────────────────────────────────

describe('importSchemas factions', () => {
  const schema = importSchemas.factions
  const fieldNames = schema.fields.map(f => f.name)

  it('commodities is required with no default', () => {
    const f = schema.fields.find(f => f.name === 'commodities')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
    expect(f.default).toBeUndefined()
  })

  it('starting_units is a required field', () => {
    const f = schema.fields.find(f => f.name === 'starting_units')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
  })

  it('does not include removed fields flagship, mech, promissory_notes', () => {
    expect(fieldNames).not.toContain('flagship')
    expect(fieldNames).not.toContain('mech')
    expect(fieldNames).not.toContain('promissory_notes')
  })
})

// ── Exploration cards ────────────────────────────────────────────────────────

describe('importSchemas exploration-cards', () => {
  const schema = importSchemas['exploration-cards']

  it('has_attachment is a required field', () => {
    const f = schema.fields.find(f => f.name === 'has_attachment')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
  })

  it('purge is a required field', () => {
    const f = schema.fields.find(f => f.name === 'purge')
    expect(f).toBeDefined()
    expect(f.required).toBe(true)
  })
})

// ── Attachments ──────────────────────────────────────────────────────────────

describe('importSchemas attachments', () => {
  const schema = importSchemas.attachments
  const fieldNames = schema.fields.map(f => f.name)

  it('has tech_specialty field with colour values', () => {
    const f = schema.fields.find(f => f.name === 'tech_specialty')
    expect(f).toBeDefined()
    expect(f.values).toEqual(expect.arrayContaining(['blue', 'green', 'red', 'yellow']))
  })

  it('does not include removed planet_trait field', () => {
    expect(fieldNames).not.toContain('planet_trait')
  })
})

// ── Promissory notes ─────────────────────────────────────────────────────────

describe('importSchemas promissory-notes', () => {
  const schema = importSchemas['promissory-notes']
  const fieldNames = schema.fields.map(f => f.name)

  it('does not include removed returns_to_owner field', () => {
    expect(fieldNames).not.toContain('returns_to_owner')
  })

  it('has into_play_area field', () => {
    expect(fieldNames).toContain('into_play_area')
  })
})

// ── Public and secret objectives ─────────────────────────────────────────────

describe('importSchemas objectives', () => {
  it('public-objectives does not have points field', () => {
    const fieldNames = importSchemas['public-objectives'].fields.map(f => f.name)
    expect(fieldNames).not.toContain('points')
    expect(fieldNames).not.toContain('category')
  })

  it('secret-objectives does not have points field', () => {
    const fieldNames = importSchemas['secret-objectives'].fields.map(f => f.name)
    expect(fieldNames).not.toContain('points')
  })
})
