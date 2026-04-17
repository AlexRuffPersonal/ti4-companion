import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  researchTechnology: vi.fn().mockResolvedValue({}),
}))

import TechTreeModal from '../../../src/components/game/TechTreeModal.jsx'

// technology_type replaces colour + is_unit_upgrade
const ALL_TECHS = [
  { id: 't1', name: 'Neural Motivator', technology_type: 'green',        prerequisites: {}, faction: null,      expansion: 'base' },
  { id: 't2', name: 'Chaos Mapping',    technology_type: 'green',        prerequisites: {}, faction: 'Arborec', expansion: 'base' },
  { id: 't3', name: 'Carrier II',       technology_type: 'unit_upgrade', prerequisites: { blue: 1 }, faction: null, expansion: 'base' },
]

const PLAYER = { id: 'p1', technologies: [], faction: 'Arborec' }
const GAME_EXPANSIONS = { base: true }

describe('TechTreeModal', () => {
  it('renders faction section label', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('FACTION')).toBeTruthy()
  })

  it('renders unit upgrades section label', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('UNIT UPGRADES')).toBeTruthy()
  })

  it('renders colour section labels', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('BIOTIC')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByTestId('tech-modal-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not show RESEARCH button when isOwnTree is false', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={false}
        onClose={vi.fn()}
      />
    )
    // Select a tech
    fireEvent.click(screen.getAllByTestId('tech-card')[0])
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })
})
