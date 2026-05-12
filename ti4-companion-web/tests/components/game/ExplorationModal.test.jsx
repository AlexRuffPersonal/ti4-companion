import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ExplorationModal from '../../../src/components/game/ExplorationModal'

const planet = { planet_name: 'Welfor' }

describe('ExplorationModal', () => {
  it('shows deck picker for multi-trait planet', () => {
    render(
      <ExplorationModal
        planet={planet}
        systemKey="3,1"
        traits={['cultural', 'industrial']}
        isFrontier={false}
        onExplorePlanet={vi.fn()}
        onResolveCard={vi.fn()}
        onExploreFrontier={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('cultural')).toBeInTheDocument()
    expect(screen.getByText('industrial')).toBeInTheDocument()
  })

  it('calls onExplorePlanet with selected deck_type', async () => {
    const onExplorePlanet = vi.fn().mockResolvedValue({ card_id: 'c1', card_name: 'Relic Fragment', card_text: 'Gain fragment', has_choice: false, is_conditional: false })
    const onResolveCard = vi.fn()
    render(
      <ExplorationModal
        planet={planet}
        systemKey="3,1"
        traits={['cultural', 'industrial']}
        isFrontier={false}
        onExplorePlanet={onExplorePlanet}
        onResolveCard={onResolveCard}
        onExploreFrontier={vi.fn()}
        onClose={vi.fn()}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('cultural'))
    })
    expect(onExplorePlanet).toHaveBeenCalledWith('Welfor', 'cultural')
  })

  it('auto-resolves non-interactive cards', async () => {
    const card = { card_id: 'c1', card_name: 'Relic Fragment', card_text: 'Gain fragment', has_choice: false, is_conditional: false }
    const onExplorePlanet = vi.fn().mockResolvedValue(card)
    const onResolveCard = vi.fn()
    await act(async () => {
      render(
        <ExplorationModal
          planet={planet}
          systemKey="3,1"
          traits={['cultural']}
          isFrontier={false}
          onExplorePlanet={onExplorePlanet}
          onResolveCard={onResolveCard}
          onExploreFrontier={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    await waitFor(() => expect(onResolveCard).toHaveBeenCalledWith('c1', {}))
  })

  it('shows choice buttons for choice cards', async () => {
    const card = { card_id: 'c2', card_name: 'Enigma', card_text: 'Pick one', has_choice: true, is_conditional: false, choice_a: 'Gain 2 resources', choice_b: 'Gain 2 influence' }
    const onExplorePlanet = vi.fn().mockResolvedValue(card)
    await act(async () => {
      render(
        <ExplorationModal
          planet={planet}
          systemKey="3,1"
          traits={['cultural']}
          isFrontier={false}
          onExplorePlanet={onExplorePlanet}
          onResolveCard={vi.fn()}
          onExploreFrontier={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Gain 2 resources')).toBeInTheDocument()
      expect(screen.getByText('Gain 2 influence')).toBeInTheDocument()
    })
  })

  it('shows mech confirmation when hasMechOnPlanet=true', async () => {
    const card = { card_id: 'c3', card_name: 'Mech Test', card_text: 'Conditional', has_choice: false, is_conditional: true }
    const onExplorePlanet = vi.fn().mockResolvedValue(card)
    await act(async () => {
      render(
        <ExplorationModal
          planet={planet}
          systemKey="3,1"
          traits={['hazardous']}
          isFrontier={false}
          hasMechOnPlanet={true}
          onExplorePlanet={onExplorePlanet}
          onResolveCard={vi.fn()}
          onExploreFrontier={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/mech on this planet/i)).toBeInTheDocument()
      expect(screen.getByText('Gain Effect')).toBeInTheDocument()
    })
  })

  it('shows infantry removal prompt when hasMechOnPlanet=false and conditional', async () => {
    const card = { card_id: 'c4', card_name: 'Infantry Test', card_text: 'Conditional', has_choice: false, is_conditional: true }
    const onExplorePlanet = vi.fn().mockResolvedValue(card)
    await act(async () => {
      render(
        <ExplorationModal
          planet={planet}
          systemKey="3,1"
          traits={['hazardous']}
          isFrontier={false}
          hasMechOnPlanet={false}
          onExplorePlanet={onExplorePlanet}
          onResolveCard={vi.fn()}
          onExploreFrontier={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/Remove 1 infantry/i)).toBeInTheDocument()
    })
  })

  it('calls onClose after done', async () => {
    const card = { card_id: 'c1', card_name: 'Relic Fragment', card_text: 'Gain fragment', has_choice: false, is_conditional: false }
    const onExplorePlanet = vi.fn().mockResolvedValue(card)
    const onClose = vi.fn()
    await act(async () => {
      render(
        <ExplorationModal
          planet={planet}
          systemKey="3,1"
          traits={['cultural']}
          isFrontier={false}
          onExplorePlanet={onExplorePlanet}
          onResolveCard={vi.fn()}
          onExploreFrontier={vi.fn()}
          onClose={onClose}
        />
      )
    })
    await waitFor(() => expect(screen.getByText('Close')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows frontier explore button for isFrontier=true', () => {
    render(
      <ExplorationModal
        planet={null}
        systemKey="3,1"
        traits={[]}
        isFrontier={true}
        onExplorePlanet={vi.fn()}
        onResolveCard={vi.fn()}
        onExploreFrontier={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Explore Frontier Token')).toBeInTheDocument()
  })
})
