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

const defaultProps = { game: BASE_GAME, speaker: BASE_SPEAKER, onOpenTradeLog: vi.fn() }

describe('GameHeader', () => {
  it('renders round, phase, and VP goal', () => {
    render(<GameHeader {...defaultProps} />)
    expect(screen.getByText(/ROUND 1/)).toBeTruthy()
    expect(screen.getByText(/GOAL:.*VP/)).toBeTruthy()
  })

  it('renders TRADE LOG button', () => {
    render(<GameHeader {...defaultProps} />)
    expect(screen.getByText('TRADE LOG')).toBeTruthy()
  })

  it('calls onOpenTradeLog when TRADE LOG button is clicked', () => {
    const onOpenTradeLog = vi.fn()
    render(<GameHeader {...defaultProps} onOpenTradeLog={onOpenTradeLog} />)
    fireEvent.click(screen.getByText('TRADE LOG'))
    expect(onOpenTradeLog).toHaveBeenCalled()
  })

  it('renders RULES button', () => {
    render(<GameHeader {...defaultProps} onOpenRules={vi.fn()} />)
    expect(screen.getByText('RULES')).toBeTruthy()
  })

  it('calls onOpenRules when RULES button is clicked', () => {
    const onOpenRules = vi.fn()
    render(<GameHeader {...defaultProps} onOpenRules={onOpenRules} />)
    fireEvent.click(screen.getByText('RULES'))
    expect(onOpenRules).toHaveBeenCalled()
  })

  it('renders Undo button only when isHost=true', () => {
    render(<GameHeader {...defaultProps} isHost={true} onUndo={vi.fn()} canUndo={false} />)
    expect(screen.getByText('Undo')).toBeTruthy()
  })

  it('does not render Undo button for non-host', () => {
    render(<GameHeader {...defaultProps} isHost={false} onUndo={vi.fn()} canUndo={true} />)
    expect(screen.queryByText('Undo')).toBeNull()
  })

  it('Undo button is disabled when canUndo=false', () => {
    render(<GameHeader {...defaultProps} isHost={true} onUndo={vi.fn()} canUndo={false} />)
    expect(screen.getByText('Undo').disabled).toBe(true)
  })

  it('Undo button is enabled and calls onUndo when canUndo=true', () => {
    const onUndo = vi.fn()
    render(<GameHeader {...defaultProps} isHost={true} onUndo={onUndo} canUndo={true} />)
    const btn = screen.getByText('Undo')
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onUndo).toHaveBeenCalled()
  })
})
