import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GameHeader from '../../src/components/game/GameHeader.jsx'

const BASE_GAME = {
  round: 1,
  phase: 'SETUP',
  vp_goal: 10,
}

const BASE_SPEAKER = {
  display_name: 'Player 1',
}

describe('GameHeader', () => {
  it('renders round, phase, and VP goal', () => {
    render(<GameHeader game={BASE_GAME} speaker={BASE_SPEAKER} onOpenTradeLog={vi.fn()} />)
    expect(screen.getByText(/ROUND 1/)).toBeTruthy()
    expect(screen.getByText(/GOAL:.*VP/)).toBeTruthy()
  })

  it('renders TRADE LOG button', () => {
    render(<GameHeader game={BASE_GAME} speaker={BASE_SPEAKER} onOpenTradeLog={vi.fn()} />)
    expect(screen.getByText('TRADE LOG')).toBeTruthy()
  })

  it('calls onOpenTradeLog when TRADE LOG button is clicked', () => {
    const onOpenTradeLog = vi.fn()
    render(<GameHeader game={BASE_GAME} speaker={BASE_SPEAKER} onOpenTradeLog={onOpenTradeLog} />)
    fireEvent.click(screen.getByText('TRADE LOG'))
    expect(onOpenTradeLog).toHaveBeenCalled()
  })

  it('renders RULES button', () => {
    render(<GameHeader game={BASE_GAME} speaker={BASE_SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByText('RULES')).toBeTruthy()
  })

  it('calls onOpenRules when RULES button is clicked', () => {
    const onOpenRules = vi.fn()
    render(<GameHeader game={BASE_GAME} speaker={BASE_SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={onOpenRules} />)
    fireEvent.click(screen.getByText('RULES'))
    expect(onOpenRules).toHaveBeenCalled()
  })
})
