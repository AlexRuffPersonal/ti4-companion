import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameHeader from '../../../src/components/game/GameHeader.jsx'

const GAME = { round: 2, phase: 'action', vp_goal: 10 }
const SPEAKER = { display_name: 'Alice' }

describe('GameHeader', () => {
  it('renders round number', () => {
    render(<GameHeader game={GAME} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByText(/round 2/i)).toBeInTheDocument()
  })

  it('renders speaker name', () => {
    render(<GameHeader game={GAME} speaker={SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('renders speaker icon when speaker is set', () => {
    render(<GameHeader game={GAME} speaker={SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'speaker' })).toBeInTheDocument()
  })

  it('does not render speaker icon when no speaker', () => {
    render(<GameHeader game={GAME} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.queryByRole('img', { name: 'speaker' })).toBeNull()
  })
})
