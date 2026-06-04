import { render, screen, fireEvent } from '@testing-library/react'
import RelicFragmentPanel from '../../../src/components/game/RelicFragmentPanel'

const makeFragments = (...specs) =>
  specs.map(([type, id]) => ({ id, relic_fragment_type: type }))

describe('RelicFragmentPanel', () => {
  it('renders null when no fragments', () => {
    const { container } = render(
      <RelicFragmentPanel relicFragments={[]} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('groups fragments by type with correct counts', () => {
    const fragments = makeFragments(
      ['cultural', 1], ['cultural', 2], ['hazardous', 3]
    )
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    // cultural count = 2
    expect(screen.getByText('cultural')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // hazardous count = 1
    expect(screen.getByText('hazardous')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('disables spend button when not active player', () => {
    const fragments = makeFragments(['cultural', 1], ['cultural', 2], ['cultural', 3])
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={false} onUseRelicFragment={vi.fn()} />
    )
    expect(screen.getByText('Spend Fragments')).toBeDisabled()
  })

  it('disables spend button when fewer than 3 fragments', () => {
    const fragments = makeFragments(['cultural', 1], ['cultural', 2])
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    expect(screen.getByText('Spend Fragments')).toBeDisabled()
  })

  it('shows selector on spend click', () => {
    const fragments = makeFragments(['cultural', 1], ['cultural', 2], ['cultural', 3])
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Spend Fragments'))
    expect(screen.getByText('Select 3 fragments to spend')).toBeInTheDocument()
  })

  it('validates: 2 typed + 1 unknown passes — Confirm enabled', () => {
    const fragments = [
      { id: 1, relic_fragment_type: 'cultural' },
      { id: 2, relic_fragment_type: 'cultural' },
      { id: 3, relic_fragment_type: 'unknown' },
    ]
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Spend Fragments'))
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach(cb => fireEvent.click(cb))
    expect(screen.getByText('Confirm')).not.toBeDisabled()
  })

  it('validates: all unknown fails — Confirm disabled', () => {
    const fragments = [
      { id: 1, relic_fragment_type: 'unknown' },
      { id: 2, relic_fragment_type: 'unknown' },
      { id: 3, relic_fragment_type: 'unknown' },
    ]
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Spend Fragments'))
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach(cb => fireEvent.click(cb))
    expect(screen.getByText('Confirm')).toBeDisabled()
  })

  it('calls onUseRelicFragment with selected IDs on confirm', () => {
    const onUseRelicFragment = vi.fn()
    const fragments = [
      { id: 1, relic_fragment_type: 'cultural' },
      { id: 2, relic_fragment_type: 'cultural' },
      { id: 3, relic_fragment_type: 'cultural' },
    ]
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={onUseRelicFragment} />
    )
    fireEvent.click(screen.getByText('Spend Fragments'))
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach(cb => fireEvent.click(cb))
    fireEvent.click(screen.getByText('Confirm'))
    expect(onUseRelicFragment).toHaveBeenCalledOnce()
    const arg = onUseRelicFragment.mock.calls[0][0]
    expect(arg).toHaveLength(3)
    expect(arg).toEqual(expect.arrayContaining([1, 2, 3]))
  })

  it('renders a fragment type icon for each group', () => {
    const fragments = makeFragments(['cultural', 1], ['hazardous', 2])
    render(
      <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
    )
    expect(screen.getByRole('img', { name: 'cultural' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'hazardous' })).toBeInTheDocument()
  })
})
