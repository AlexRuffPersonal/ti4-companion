import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminImportPage from '../../../src/components/admin/AdminImportPage.jsx'

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  importTable: vi.fn(),
  callFunction: vi.fn(),
}))

import { importTable } from '../../../src/lib/edgeFunctions.js'

function renderPage(table = 'tiles') {
  return render(
    <MemoryRouter initialEntries={[`/admin/import/${table}`]}>
      <Routes>
        <Route path="/admin/import/:table" element={<AdminImportPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminImportPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an error for invalid JSON without calling importTable', async () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/invalid json/i)).toBeInTheDocument()
    )
    expect(importTable).not.toHaveBeenCalled()
  })

  it('shows an error when JSON is not an array without calling importTable', async () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{"name":"test"}' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/expected a json array/i)).toBeInTheDocument()
    )
    expect(importTable).not.toHaveBeenCalled()
  })

  it('shows success banner and clears textarea on successful import', async () => {
    importTable.mockResolvedValue({ imported: 5 })
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"test"}]' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/5 records imported/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('textbox').value).toBe('')
  })

  it('shows error banner when importTable rejects', async () => {
    importTable.mockRejectedValue(new Error('Record 1: missing tile_number'))
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"test"}]' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/record 1: missing tile_number/i)).toBeInTheDocument()
    )
  })

  it('passes the table key and parsed records to importTable', async () => {
    importTable.mockResolvedValue({ imported: 1 })
    renderPage('factions')
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '[{"name":"Letnev"}]' },
    })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() => expect(importTable).toHaveBeenCalledWith('factions', [{ name: 'Letnev' }]))
  })
})
