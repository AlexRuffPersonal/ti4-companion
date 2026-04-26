import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SpaceCannonModal from '../../../src/components/game/SpaceCannonModal.jsx'

const MY_ID = 'p1'
const OTHER_ID = 'p2'

const BASE_COMBAT = {
  id: 'c1',
  phase: 'space_cannon',
  space_cannon_pending: [
    { player_id: MY_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: false },
  ],
}

const BASE_PROPS = {
  combat: BASE_COMBAT,
  myPlayerId: MY_ID,
  onFire: vi.fn(),
  onPass: vi.fn(),
}

describe('SpaceCannonModal', () => {
  it('shows Fire and Pass buttons when player has unresolved entry', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /fire/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument()
  })

  it('shows unit info and dice count', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByText(/pds/i)).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('calls onFire when Fire is clicked', () => {
    const onFire = vi.fn()
    render(<SpaceCannonModal {...BASE_PROPS} onFire={onFire} />)
    fireEvent.click(screen.getByRole('button', { name: /fire/i }))
    expect(onFire).toHaveBeenCalled()
  })

  it('calls onPass when Pass is clicked', () => {
    const onPass = vi.fn()
    render(<SpaceCannonModal {...BASE_PROPS} onPass={onPass} />)
    fireEvent.click(screen.getByRole('button', { name: /pass/i }))
    expect(onPass).toHaveBeenCalled()
  })

  it('shows waiting state when player has no unresolved entry', () => {
    render(<SpaceCannonModal {...BASE_PROPS} myPlayerId={OTHER_ID} />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fire/i })).not.toBeInTheDocument()
  })

  it('shows waiting state when player entry is already resolved', () => {
    const resolvedCombat = {
      ...BASE_COMBAT,
      space_cannon_pending: [
        { player_id: MY_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: true },
      ],
    }
    render(<SpaceCannonModal {...BASE_PROPS} combat={resolvedCombat} />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })

  it('renders heading', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByText(/space cannon/i)).toBeInTheDocument()
  })
})