import { render, screen, fireEvent } from '@testing-library/react'
import RelicPanel from '../../../src/components/game/RelicPanel'

const DEFAULT_PROPS = {
  isActivePlayer: true,
  phase: 'action',
  actionCards: [],
  controlsTombOfEmphidia: false,
  onUseRelic: vi.fn(),
}

function makeRelic(overrides) {
  return {
    id: 1,
    exhaustable: false,
    exhausted: false,
    state: 'ready',
    ...overrides,
  }
}

describe('RelicPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null when no relics', () => {
    const { container } = render(
      <RelicPanel {...DEFAULT_PROPS} relics={[]} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders each relic name and text', () => {
    const relics = [
      makeRelic({ id: 1, name: 'Shard of the Throne', text: 'Gain 1 VP' }),
      makeRelic({ id: 2, name: 'Crown of Emphidia', text: 'Hold the Crown' }),
    ]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} />)
    expect(screen.getByText('Shard of the Throne')).toBeInTheDocument()
    expect(screen.getByText('Gain 1 VP')).toBeInTheDocument()
    expect(screen.getByText('Crown of Emphidia')).toBeInTheDocument()
    expect(screen.getByText('Hold the Crown')).toBeInTheDocument()
  })

  it('shows exhausted badge for exhaustable relics', () => {
    const relics = [makeRelic({ name: 'Scepter Of Emelpar', text: 'desc', exhaustable: true, exhausted: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} />)
    expect(screen.getByText('Exhausted')).toBeInTheDocument()
  })

  // --- Passive badges ---

  it('renders passive badge for The Obsidian', () => {
    const relics = [makeRelic({ name: 'The Obsidian', text: 'desc' })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} />)
    expect(screen.getByText('+1 secret objective limit')).toBeInTheDocument()
  })

  it('renders passive badge for Shard Of The Throne', () => {
    const relics = [makeRelic({ name: 'Shard Of The Throne', text: 'desc' })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} />)
    expect(screen.getByText('1 VP (while held)')).toBeInTheDocument()
  })

  // --- Maw Of Worlds ---

  it('Maw Of Worlds button disabled outside agenda phase', () => {
    const relics = [makeRelic({ name: 'Maw Of Worlds', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} phase="action" relics={relics} />)
    expect(screen.getByText('Use (Agenda Phase)')).toBeDisabled()
  })

  it('Maw Of Worlds button enabled in agenda phase', () => {
    const relics = [makeRelic({ name: 'Maw Of Worlds', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} phase="agenda" relics={relics} />)
    expect(screen.getByText('Use (Agenda Phase)')).not.toBeDisabled()
  })

  // --- Scepter Of Emelpar ---

  it('Scepter exhausts on click', () => {
    const onUseRelic = vi.fn()
    const relics = [makeRelic({ id: 10, name: 'Scepter Of Emelpar', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} onUseRelic={onUseRelic} />)
    fireEvent.click(screen.getByText('Exhaust'))
    expect(onUseRelic).toHaveBeenCalledWith(10, {})
  })

  // --- The Prophet's Tears ---

  it("Prophet's Tears opens choice UI on click", () => {
    const relics = [makeRelic({ name: "The Prophet's Tears", text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} />)
    fireEvent.click(screen.getByText('Exhaust'))
    expect(screen.getByText('Ignore prerequisite')).toBeInTheDocument()
    expect(screen.getByText('Draw action card')).toBeInTheDocument()
  })

  it("Prophet's Tears calls onUseRelic with choice=0 for ignore prereq", () => {
    const onUseRelic = vi.fn()
    const relics = [makeRelic({ id: 7, name: "The Prophet's Tears", text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} onUseRelic={onUseRelic} />)
    fireEvent.click(screen.getByText('Exhaust'))
    fireEvent.click(screen.getByText('Ignore prerequisite'))
    expect(onUseRelic).toHaveBeenCalledWith(7, { choice: 0 })
  })

  it("Prophet's Tears calls onUseRelic with choice=1 for draw card", () => {
    const onUseRelic = vi.fn()
    const relics = [makeRelic({ id: 7, name: "The Prophet's Tears", text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} onUseRelic={onUseRelic} />)
    fireEvent.click(screen.getByText('Exhaust'))
    fireEvent.click(screen.getByText('Draw action card'))
    expect(onUseRelic).toHaveBeenCalledWith(7, { choice: 1 })
  })

  // --- The Codex ---

  it('Codex opens DiscardBrowserModal on click', () => {
    const relics = [makeRelic({ name: 'The Codex', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} actionCards={[{ id: 'a1', name: 'Infiltrate', text: 'Act' }]} />)
    fireEvent.click(screen.getByText('Use (Action)'))
    expect(screen.getByText(/Choose up to/)).toBeInTheDocument()
    expect(screen.getByText('Infiltrate')).toBeInTheDocument()
  })

  it('Codex onConfirm calls onUseRelic with cardIds', () => {
    const onUseRelic = vi.fn()
    const relics = [makeRelic({ id: 5, name: 'The Codex', text: 'desc', exhaustable: true })]
    const actionCards = [
      { id: 'a1', name: 'Infiltrate', text: 'Act' },
      { id: 'a2', name: 'Lucky Shot', text: 'Roll' },
    ]
    render(<RelicPanel {...DEFAULT_PROPS} relics={relics} actionCards={actionCards} onUseRelic={onUseRelic} />)
    fireEvent.click(screen.getByText('Use (Action)'))
    // Select first card
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(screen.getByText(/Take Selected/))
    expect(onUseRelic).toHaveBeenCalledWith(5, { cardIds: ['a1'] })
  })

  // --- The Crown Of Emphidia ---

  it('Crown of Emphidia explore button disabled outside action phase', () => {
    const relics = [makeRelic({ name: 'The Crown Of Emphidia', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} phase="status" relics={relics} />)
    expect(screen.getByText('Explore (after Action)')).toBeDisabled()
  })

  it('Crown of Emphidia purge_for_vp disabled outside status phase', () => {
    const relics = [makeRelic({ name: 'The Crown Of Emphidia', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} phase="action" relics={relics} controlsTombOfEmphidia={true} />)
    expect(screen.getByText('Purge for VP (Status Phase)')).toBeDisabled()
  })

  it('Crown of Emphidia purge_for_vp disabled when Tomb not controlled', () => {
    const relics = [makeRelic({ name: 'The Crown Of Emphidia', text: 'desc', exhaustable: true })]
    render(<RelicPanel {...DEFAULT_PROPS} phase="status" relics={relics} controlsTombOfEmphidia={false} />)
    expect(screen.getByText('Purge for VP (Status Phase)')).toBeDisabled()
  })
})
