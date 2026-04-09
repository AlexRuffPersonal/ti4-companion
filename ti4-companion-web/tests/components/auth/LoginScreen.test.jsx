import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginScreen from '../../../src/components/auth/LoginScreen.jsx'

const mockSendMagicLink = vi.fn()

describe('LoginScreen', () => {
  it('renders email input and submit button', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error={null} />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('calls onSendLink with entered email', async () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error={null} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(mockSendMagicLink).toHaveBeenCalledWith('test@example.com'))
  })

  it('disables submit button while loading', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={true} error={null} />)
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  })

  it('displays error message', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error="Invalid email" />)
    expect(screen.getByText('Invalid email')).toBeInTheDocument()
  })
})
