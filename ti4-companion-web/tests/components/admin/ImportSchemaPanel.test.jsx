import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ImportSchemaPanel from '../../../src/components/admin/ImportSchemaPanel.jsx'
import importSchemas from '../../../src/lib/importSchemas.js'

describe('ImportSchemaPanel — units schema', () => {
  it('renders ability_text field name', () => {
    render(<ImportSchemaPanel schema={importSchemas.units} />)
    expect(screen.getByText('ability_text')).toBeInTheDocument()
  })

  it('renders effects field name', () => {
    render(<ImportSchemaPanel schema={importSchemas.units} />)
    expect(screen.getByText('effects')).toBeInTheDocument()
  })

  it('renders deploy_trigger field name', () => {
    render(<ImportSchemaPanel schema={importSchemas.units} />)
    expect(screen.getByText('deploy_trigger')).toBeInTheDocument()
  })

  it('renders deploy_trigger enum values', () => {
    render(<ImportSchemaPanel schema={importSchemas.units} />)
    expect(screen.getByText(/ground_combat_start/)).toBeInTheDocument()
  })
})
