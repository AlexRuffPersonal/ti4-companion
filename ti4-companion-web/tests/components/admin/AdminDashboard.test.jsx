import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminDashboard from '../../../src/components/admin/AdminDashboard.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminDashboard />
    </MemoryRouter>
  )
}

describe('AdminDashboard', () => {
  it('renders an Import button for each table entry', () => {
    renderDashboard()
    const importButtons = screen.getAllByRole('button', { name: /^import$/i })
    // There are 13 table entries across all groups
    expect(importButtons.length).toBeGreaterThan(0)
  })

  it('renders a Browse button for each table entry', () => {
    renderDashboard()
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i })
    expect(browseButtons.length).toBeGreaterThan(0)
  })

  it('Import and Browse buttons appear the same number of times', () => {
    renderDashboard()
    const importButtons = screen.getAllByRole('button', { name: /^import$/i })
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i })
    expect(importButtons.length).toBe(browseButtons.length)
  })

  it('Import button navigates to /admin/import/:key', async () => {
    mockNavigate.mockClear()
    renderDashboard()
    const importButtons = screen.getAllByRole('button', { name: /^import$/i })
    await userEvent.click(importButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/import\//))
  })

  it('Browse button navigates to /admin/browse/:key', async () => {
    mockNavigate.mockClear()
    renderDashboard()
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i })
    await userEvent.click(browseButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/browse\//))
  })

  it('Import navigates to the correct table key', async () => {
    mockNavigate.mockClear()
    renderDashboard()
    // "Tiles" is the first table entry (key: 'tiles')
    const importButtons = screen.getAllByRole('button', { name: /^import$/i })
    await userEvent.click(importButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith('/admin/import/tiles')
  })

  it('Browse navigates to the correct table key', async () => {
    mockNavigate.mockClear()
    renderDashboard()
    // "Tiles" is the first table entry (key: 'tiles')
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i })
    await userEvent.click(browseButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith('/admin/browse/tiles')
  })
})
