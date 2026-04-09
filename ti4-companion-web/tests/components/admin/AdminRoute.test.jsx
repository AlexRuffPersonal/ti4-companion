import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminRoute from '../../../src/components/admin/AdminRoute.jsx'

vi.mock('../../../src/hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../../src/hooks/useAuth.js'

function renderWithRouter(authState, initialPath = '/admin') {
  useAuth.mockReturnValue(authState)
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home page</div>} />
        <Route
          path="/admin"
          element={<AdminRoute><div>Admin content</div></AdminRoute>}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing while loading', () => {
    const { container } = renderWithRouter({ user: null, isAdmin: false, loading: true })
    expect(container.firstChild).toBeNull()
  })

  it('redirects to /login when there is no session', () => {
    renderWithRouter({ user: null, isAdmin: false, loading: false })
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('redirects to / when session exists but user is not admin', () => {
    renderWithRouter({ user: { id: 'user-1' }, isAdmin: false, loading: false })
    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('renders children when session exists and user is admin', () => {
    renderWithRouter({ user: { id: 'user-1' }, isAdmin: true, loading: false })
    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })
})
