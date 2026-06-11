import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginScreen from '../../../src/components/auth/LoginScreen.jsx'

const mockSendMagicLink = vi.fn()

const defaultProps = { onSendLink: mockSendMagicLink, loading: false, error: null }

describe('LoginScreen', () => {
  beforeEach(() => { mockSendMagicLink.mockReset() })

  it('renders email input and submit button', () => {
    render(<LoginScreen {...defaultProps} />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('calls onSendLink with entered email', async () => {
    render(<LoginScreen {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(mockSendMagicLink).toHaveBeenCalledWith('test@example.com'))
  })

  it('disables submit button while loading', () => {
    render(<LoginScreen {...defaultProps} loading={true} />)
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  })

  it('displays error message', () => {
    render(<LoginScreen {...defaultProps} error="Invalid email" />)
    expect(screen.getByText('Invalid email')).toBeInTheDocument()
  })

  it('shows validation error for email without @ (BUG-001)', async () => {
    render(<LoginScreen {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'notanemail' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
    expect(mockSendMagicLink).not.toHaveBeenCalled()
  })

  it('calls onClearError when email field changes while parent error is shown (BUG-002)', () => {
    const onClearError = vi.fn()
    render(<LoginScreen {...defaultProps} error="Previous error" onClearError={onClearError} />)
    expect(screen.getByText('Previous error')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'new@example.com' } })
    expect(onClearError).toHaveBeenCalledTimes(1)
  })
})
