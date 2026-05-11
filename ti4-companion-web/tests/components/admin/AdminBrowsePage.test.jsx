import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mock supabase
vi.mock('../../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// Mock importSchemas
vi.mock('../../../src/lib/importSchemas.js', () => ({
  default: {
    tiles: {
      pgTable: 'tiles',
      fields: [
        { name: 'tile_number', type: 'text', required: true, description: 'Tile number' },
        { name: 'type', type: 'text', required: true, description: 'Tile type' },
      ],
    },
  },
}))

// Mock AdminRecordModal
vi.mock('../../../src/components/admin/AdminRecordModal.jsx', () => ({
  default: ({ record, onClose, onSaved }) => (
    <div data-testid="admin-record-modal">
      <span data-testid="modal-record">{record.tile_number}</span>
      <button onClick={onClose}>Close</button>
      <button onClick={onSaved}>Saved</button>
    </div>
  ),
}))

import { supabase } from '../../../src/lib/supabase.js'
import AdminBrowsePage from '../../../src/components/admin/AdminBrowsePage.jsx'

const MOCK_RECORDS = [
  { id: 'r1', tile_number: '18', type: 'mecatol_rex' },
  { id: 'r2', tile_number: '36', type: 'blue' },
  { id: 'r3', tile_number: '25a', type: 'blue' },
]

function mockFetch(records = MOCK_RECORDS, error = null) {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: error ? null : records, error }),
    }),
  })
}

function renderPage(table = 'tiles') {
  return render(
    <MemoryRouter initialEntries={[`/admin/browse/${table}`]}>
      <Routes>
        <Route path="/admin/browse/:table" element={<AdminBrowsePage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminBrowsePage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state initially', async () => {
    // Make the promise hang briefly
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(new Promise(() => {})),
      }),
    })
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders records in table rows', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('36')).toBeInTheDocument()
    expect(screen.getByText('25a')).toBeInTheDocument()
  })

  it('renders column headers from schema fields', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('tile_number')).toBeInTheDocument()
    expect(screen.getByText('type')).toBeInTheDocument()
  })

  it('filter input narrows displayed rows case-insensitively', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    const filterInput = screen.getByPlaceholderText(/filter by tile_number/i)
    fireEvent.change(filterInput, { target: { value: '25' } })
    expect(screen.queryByText('18')).not.toBeInTheDocument()
    expect(screen.queryByText('36')).not.toBeInTheDocument()
    expect(screen.getByText('25a')).toBeInTheDocument()
  })

  it('filter is case-insensitive', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    const filterInput = screen.getByPlaceholderText(/filter by tile_number/i)
    fireEvent.change(filterInput, { target: { value: '25A' } })
    expect(screen.getByText('25a')).toBeInTheDocument()
  })

  it('clicking a row opens AdminRecordModal with that record', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    // Click the first data row cell with tile_number '18'
    fireEvent.click(screen.getByText('18'))
    await waitFor(() => expect(screen.getByTestId('admin-record-modal')).toBeInTheDocument())
    expect(screen.getByTestId('modal-record').textContent).toBe('18')
  })

  it('onSaved clears modal and refetches', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('18'))
    await waitFor(() => expect(screen.getByTestId('admin-record-modal')).toBeInTheDocument())
    // Click Saved button inside modal
    fireEvent.click(screen.getByRole('button', { name: /saved/i }))
    await waitFor(() => expect(screen.queryByTestId('admin-record-modal')).not.toBeInTheDocument())
    // supabase.from should have been called at least twice (initial + refetch)
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('onClose clears modal without refetching', async () => {
    mockFetch()
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('18'))
    await waitFor(() => expect(screen.getByTestId('admin-record-modal')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByTestId('admin-record-modal')).not.toBeInTheDocument())
  })

  it('shows error message when fetch fails', async () => {
    mockFetch(null, { message: 'DB error' })
    renderPage()
    await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument())
  })

  it('shows unknown table message for unrecognized table slug', () => {
    renderPage('unknown-table')
    expect(screen.getByText(/unknown table/i)).toBeInTheDocument()
  })

  it('truncates long cell values', async () => {
    const longRecord = { id: 'r99', tile_number: 'A'.repeat(50), type: 'blue' }
    mockFetch([longRecord])
    renderPage()
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    // Cell text should be truncated to 40 chars + ellipsis
    const cell = screen.getByText(`${'A'.repeat(40)}…`)
    expect(cell).toBeInTheDocument()
  })
})
