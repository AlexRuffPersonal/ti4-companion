import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SystemActionModal from '../../../src/components/game/SystemActionModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', colour: '#22c55e' },
  { id: 'p2', display_name: 'Bob', colour: '#ef4444' },
]

const TILE_INFO = {
  planets: [{ name: 'Wellon' }, { name: 'Vefut II' }],
}

const BASE_PROPS = {
  systemKey: '1,-1',
  tileInfo: TILE_INFO,
  activations: [],
  planetOwnership: new Map([['Wellon', { player_id: 'p2', exhausted: false }]]),
  players: PLAYERS,
  currentPlayer: { id: 'p1' },
  isActivePlayer: false,
  hasAvailableTacticTokens: true,
  myActivations: new Set(),
  onActivate: vi.fn(),
  onLandTroops: vi.fn(),
  onClose: vi.fn(),
  custodiansClaimed: false,
}

describe('SystemActionModal', () => {
  it('shows ACTIVATE SYSTEM button when active player with tokens and system not yet activated', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} />)
    expect(screen.getByRole('button', { name: /activate system/i })).toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM button when not active player', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={false} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM button when no tactic tokens', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} hasAvailableTacticTokens={false} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM when system already activated by me', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} myActivations={new Set(['1,-1'])} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('shows LAND ON buttons for each planet when system activated by me', () => {
    render(<SystemActionModal {...BASE_PROPS} myActivations={new Set(['1,-1'])} />)
    expect(screen.getByRole('button', { name: /land on wellon/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /land on vefut ii/i })).toBeInTheDocument()
  })

  it('calls onActivate with systemKey when ACTIVATE SYSTEM clicked', () => {
    const onActivate = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: /activate system/i }))
    expect(onActivate).toHaveBeenCalledWith('1,-1')
  })

  it('calls onLandTroops with correct args when LAND ON clicked', () => {
    const onLandTroops = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} myActivations={new Set(['1,-1'])} onLandTroops={onLandTroops} />)
    fireEvent.click(screen.getByRole('button', { name: /land on wellon/i }))
    expect(onLandTroops).toHaveBeenCalledWith('1,-1', 'Wellon', 1)
  })

  it('shows Custodians notification when custodiansClaimed=true', () => {
    render(<SystemActionModal {...BASE_PROPS} custodiansClaimed={true} />)
    expect(screen.getByText(/custodians/i)).toBeInTheDocument()
    expect(screen.getByText(/\+1 VP/i)).toBeInTheDocument()
  })

  it('shows planet ownership info', () => {
    render(<SystemActionModal {...BASE_PROPS} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('calls onClose when CLOSE button clicked', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders PRODUCE UNITS button when system activated by caller and has space dock', () => {
    const myPlanets = [
      { planet_name: 'Wellon', space_dock_unit_id: 'spacedock-1' }
    ]
    const onOpenProduction = vi.fn()
    render(
      <SystemActionModal
        {...BASE_PROPS}
        isActivePlayer={true}
        myActivations={new Set(['1,-1'])}
        myPlanets={myPlanets}
        onOpenProduction={onOpenProduction}
      />
    )
    expect(screen.getByRole('button', { name: /produce units/i })).toBeInTheDocument()
  })

  it('does not render PRODUCE UNITS when system not activated', () => {
    const myPlanets = [
      { planet_name: 'Wellon', space_dock_unit_id: 'spacedock-1' }
    ]
    const onOpenProduction = vi.fn()
    render(
      <SystemActionModal
        {...BASE_PROPS}
        isActivePlayer={true}
        myActivations={new Set()}
        myPlanets={myPlanets}
        onOpenProduction={onOpenProduction}
      />
    )
    expect(screen.queryByRole('button', { name: /produce units/i })).not.toBeInTheDocument()
  })

  it('does not render PRODUCE UNITS when caller has no space dock in system', () => {
    const myPlanets = [
      { planet_name: 'Wellon', space_dock_unit_id: null }
    ]
    const onOpenProduction = vi.fn()
    render(
      <SystemActionModal
        {...BASE_PROPS}
        isActivePlayer={true}
        myActivations={new Set(['1,-1'])}
        myPlanets={myPlanets}
        onOpenProduction={onOpenProduction}
      />
    )
    expect(screen.queryByRole('button', { name: /produce units/i })).not.toBeInTheDocument()
  })

  it('calls onOpenProduction with systemKey when PRODUCE UNITS clicked', () => {
    const myPlanets = [
      { planet_name: 'Wellon', space_dock_unit_id: 'spacedock-1' }
    ]
    const onOpenProduction = vi.fn()
    render(
      <SystemActionModal
        {...BASE_PROPS}
        isActivePlayer={true}
        myActivations={new Set(['1,-1'])}
        myPlanets={myPlanets}
        onOpenProduction={onOpenProduction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /produce units/i }))
    expect(onOpenProduction).toHaveBeenCalledWith('1,-1')
  })

  it('renders INFO button when onInfo prop is provided', () => {
    render(<SystemActionModal {...BASE_PROPS} onInfo={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^info$/i })).toBeInTheDocument()
  })

  it('calls onInfo when INFO button is clicked', () => {
    const onInfo = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} onInfo={onInfo} />)
    fireEvent.click(screen.getByRole('button', { name: /^info$/i }))
    expect(onInfo).toHaveBeenCalled()
  })
})

describe('SystemActionModal — Dark Energy Tap (Phase 38)', () => {
  const DET_BASE = {
    ...BASE_PROPS,
    isActivePlayer: true,
    myActivations: new Set(['1,-1']),
    onClose: vi.fn(),
    onExploreFrontier: vi.fn(),
  }

  it('renders DONE button when system activated by caller and is active player', () => {
    render(<SystemActionModal {...DET_BASE} />)
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument()
  })

  it('does not render DONE when system not activated by caller', () => {
    render(<SystemActionModal {...DET_BASE} myActivations={new Set()} />)
    expect(screen.queryByRole('button', { name: /^done$/i })).not.toBeInTheDocument()
  })

  it('closes immediately on DONE when DET conditions not met (hasFrontierToken false)', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...DET_BASE} onClose={onClose} hasFrontierToken={false} hasDarkEnergyTap={true} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText(/explore frontier token/i)).not.toBeInTheDocument()
  })

  it('closes immediately on DONE when DET conditions not met (hasDarkEnergyTap false)', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...DET_BASE} onClose={onClose} hasFrontierToken={true} hasDarkEnergyTap={false} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText(/explore frontier token/i)).not.toBeInTheDocument()
  })

  it('shows inline frontier confirmation on DONE when hasFrontierToken=true and hasDarkEnergyTap=true', () => {
    render(<SystemActionModal {...DET_BASE} hasFrontierToken={true} hasDarkEnergyTap={true} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(screen.getByText(/explore frontier token/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument()
  })

  it('calls onExploreFrontier with systemKey and closes on EXPLORE', () => {
    const onClose = vi.fn()
    const onExploreFrontier = vi.fn()
    render(
      <SystemActionModal
        {...DET_BASE}
        onClose={onClose}
        onExploreFrontier={onExploreFrontier}
        hasFrontierToken={true}
        hasDarkEnergyTap={true}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^explore$/i }))
    expect(onExploreFrontier).toHaveBeenCalledWith('1,-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose without calling onExploreFrontier on SKIP', () => {
    const onClose = vi.fn()
    const onExploreFrontier = vi.fn()
    render(
      <SystemActionModal
        {...DET_BASE}
        onClose={onClose}
        onExploreFrontier={onExploreFrontier}
        hasFrontierToken={true}
        hasDarkEnergyTap={true}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onExploreFrontier).not.toHaveBeenCalled()
  })
})