import { render, screen, fireEvent } from '@testing-library/react'
import RelicPanel from '../../../src/components/game/RelicPanel'

describe('RelicPanel', () => {
  it('renders null when no relics', () => {
    const { container } = render(
      <RelicPanel relics={[]} isActivePlayer={true} onUseRelic={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders each relic name and text', () => {
    const relics = [
      { id: 1, name: 'Shard of the Throne', text: 'Gain 1 VP', exhaustable: false },
      { id: 2, name: 'Crown of Emphidia', text: 'Hold the Crown', exhaustable: false },
    ]
    render(<RelicPanel relics={relics} isActivePlayer={true} onUseRelic={vi.fn()} />)
    expect(screen.getByText('Shard of the Throne')).toBeInTheDocument()
    expect(screen.getByText('Gain 1 VP')).toBeInTheDocument()
    expect(screen.getByText('Crown of Emphidia')).toBeInTheDocument()
    expect(screen.getByText('Hold the Crown')).toBeInTheDocument()
  })

  it('shows exhausted badge for exhaustable relics', () => {
    const relics = [
      { id: 1, name: 'Shard of the Throne', text: 'desc', exhaustable: true, exhausted: true },
    ]
    render(<RelicPanel relics={relics} isActivePlayer={true} onUseRelic={vi.fn()} />)
    expect(screen.getByText('Exhausted')).toBeInTheDocument()
  })

  it('disables ACTION relic button when not active player', () => {
    const relics = [
      { id: 1, name: 'Dominus Orb', text: 'desc', exhaustable: false, exhausted: false },
    ]
    render(<RelicPanel relics={relics} isActivePlayer={false} onUseRelic={vi.fn()} />)
    expect(screen.getByText('Use (Action)')).toBeDisabled()
  })

  it('disables ACTION relic button when exhausted', () => {
    const relics = [
      { id: 1, name: 'Dominus Orb', text: 'desc', exhaustable: true, exhausted: true },
    ]
    render(<RelicPanel relics={relics} isActivePlayer={true} onUseRelic={vi.fn()} />)
    expect(screen.getByText('Use (Action)')).toBeDisabled()
  })

  it('calls onUseRelic with relic id on click', () => {
    const onUseRelic = vi.fn()
    const relics = [
      { id: 42, name: 'Dominus Orb', text: 'desc', exhaustable: false, exhausted: false },
    ]
    render(<RelicPanel relics={relics} isActivePlayer={true} onUseRelic={onUseRelic} />)
    fireEvent.click(screen.getByText('Use (Action)'))
    expect(onUseRelic).toHaveBeenCalledWith(42)
  })
})
