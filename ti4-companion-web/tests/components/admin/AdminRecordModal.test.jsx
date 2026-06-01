import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock importSchemas with several field types
vi.mock('../../../src/lib/importSchemas.js', () => ({
  default: {
    tiles: {
      pgTable: 'tiles',
      fields: [
        { name: 'tile_number', type: 'text', required: true, description: 'Tile number' },
        { name: 'type', type: 'text', required: true, values: ['blue', 'red', 'faction'], description: 'Tile type' },
        { name: 'expansion', type: 'text', required: false, description: 'Expansion' },
        { name: 'planets', type: 'JSONB array', required: false, description: 'Planets on tile' },
        { name: 'starts_off_board', type: 'boolean', required: false, description: 'Off board tile' },
        { name: 'resources', type: 'integer', required: false, description: 'Resource count' },
      ],
    },
  },
}))

import { edgeFunctionStubs } from '../../helpers/edgeFunctionMocks.js'

vi.mock('../../../src/lib/edgeFunctions.js', () => ({ ...edgeFunctionStubs }))

import { updateRecord as mockUpdateRecord } from '../../../src/lib/edgeFunctions.js'
import AdminRecordModal from '../../../src/components/admin/AdminRecordModal.jsx'

const BASE_RECORD = {
  id: 'rec-1',
  tile_number: '18',
  type: 'blue',
  expansion: 'base',
  planets: [{ name: 'Mecatol Rex', resources: 1, influence: 6 }],
  starts_off_board: false,
  resources: 5,
}

function renderModal(overrides = {}) {
  const props = {
    table: 'tiles',
    record: BASE_RECORD,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  }
  return { ...render(<AdminRecordModal {...props} />), props }
}

describe('AdminRecordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateRecord.mockResolvedValue({})
  })

  it('pre-populates text fields from record values', () => {
    renderModal()
    // tile_number is a text field
    const input = screen.getByDisplayValue('18')
    expect(input).toBeInTheDocument()
  })

  it('pre-populates expansion text field', () => {
    renderModal()
    expect(screen.getByDisplayValue('base')).toBeInTheDocument()
  })

  it('shows record id', () => {
    renderModal()
    expect(screen.getByText(/rec-1/)).toBeInTheDocument()
  })

  it('JSONB field is stringified on open', () => {
    renderModal()
    const textareas = screen.getAllByRole('textbox').filter(el => el.tagName === 'TEXTAREA')
    const planetsTextarea = textareas.find(el => el.value.includes('Mecatol Rex'))
    expect(planetsTextarea).toBeDefined()
    const parsed = JSON.parse(planetsTextarea.value)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].name).toBe('Mecatol Rex')
  })

  it('boolean field renders as a select', () => {
    renderModal()
    // starts_off_board is boolean; look for a select with true/false options
    const selects = screen.getAllByRole('combobox')
    const boolSelect = selects.find(s => {
      const opts = Array.from(s.querySelectorAll('option')).map(o => o.value)
      return opts.includes('true') && opts.includes('false') && !opts.includes('blue')
    })
    expect(boolSelect).toBeDefined()
    expect(boolSelect.value).toBe('false')
  })

  it('values-constrained field renders as select with enumerated options', () => {
    renderModal()
    // type field has values: ['blue', 'red', 'faction']
    const selects = screen.getAllByRole('combobox')
    const typeSelect = selects.find(s => {
      const opts = Array.from(s.querySelectorAll('option')).map(o => o.value)
      return opts.includes('blue') && opts.includes('red') && opts.includes('faction')
    })
    expect(typeSelect).toBeDefined()
    expect(typeSelect.value).toBe('blue')
  })

  it('integer field renders as number input', () => {
    renderModal()
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs[0].value).toBe('5')
  })

  it('Save calls updateRecord with parsed fields', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockUpdateRecord).toHaveBeenCalled())
    const [pgTable, payload] = mockUpdateRecord.mock.calls[0]
    expect(pgTable).toBe('tiles')
    expect(payload.id).toBe('rec-1')
    expect(payload.tile_number).toBe('18')
    expect(typeof payload.starts_off_board).toBe('boolean')
    expect(Array.isArray(payload.planets)).toBe(true)
  })

  it('invalid JSON in JSONB field shows error and does not call updateRecord', async () => {
    renderModal()
    // Find the JSONB textareas (planets field)
    const textareas = screen.getAllByRole('textbox').filter(el => el.tagName === 'TEXTAREA')
    // The planets textarea should contain the JSON
    const planetsTextarea = textareas.find(el => el.value.includes('Mecatol Rex'))
    expect(planetsTextarea).toBeDefined()
    fireEvent.change(planetsTextarea, { target: { value: '{ invalid json' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/invalid json in field/i)).toBeInTheDocument())
    expect(mockUpdateRecord).not.toHaveBeenCalled()
  })

  it('shows success message and calls onSaved after successful save', async () => {
    const onSaved = vi.fn()
    renderModal({ onSaved })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/saved\./i)).toBeInTheDocument())
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows error message and keeps modal open on save error', async () => {
    mockUpdateRecord.mockRejectedValue(new Error('Update failed'))
    const onSaved = vi.fn()
    renderModal({ onSaved })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/update failed/i)).toBeInTheDocument())
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Cancel calls onClose', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Save button shows Saving... while submitting', async () => {
    // Make updateRecord hang
    mockUpdateRecord.mockReturnValue(new Promise(() => {}))
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument()
  })
})
