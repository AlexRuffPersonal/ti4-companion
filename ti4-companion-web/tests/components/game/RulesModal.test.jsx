import { render, screen, fireEvent } from '@testing-library/react'
import RulesModal, { tokenizeBody } from '../../../src/components/game/RulesModal'

// Mock the JSON import
vi.mock('../../../src/data/lrr-sections.json', () => ({
  default: [
    { number: '1', title: 'ABILITIES', body: 'Abilities are special effects.' },
    { number: '2', title: 'ACTION CARDS', body: 'Action cards describe ABILITIES.' },
  ]
}))

describe('RulesModal', () => {
  it('does not render when isOpen=false', () => {
    const { container } = render(<RulesModal isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders search input when isOpen=true', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('rules-search')).toBeInTheDocument()
  })

  it('shows all sections with empty query', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('section-1')).toBeInTheDocument()
    expect(screen.getByTestId('section-2')).toBeInTheDocument()
  })

  it('filters sections by query (case-insensitive)', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'action' } })
    expect(screen.queryByTestId('section-1')).toBeNull()
    expect(screen.getByTestId('section-2')).toBeInTheDocument()
  })

  it('shows no-results message when query matches nothing', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'xyznotfound' } })
    expect(screen.getByText(/No results for/)).toBeInTheDocument()
  })

  it('clicking a section expands its body', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('section-1'))
    expect(screen.getByTestId('body-1')).toBeInTheDocument()
  })

  it('clicking same section again collapses it', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('section-1'))
    fireEvent.click(screen.getByTestId('section-1'))
    expect(screen.queryByTestId('body-1')).toBeNull()
  })

  it('only one section expanded at a time', () => {
    render(<RulesModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('section-1'))
    fireEvent.click(screen.getByTestId('section-2'))
    expect(screen.queryByTestId('body-1')).toBeNull()
    expect(screen.getByTestId('body-2')).toBeInTheDocument()
  })
})

describe('tokenizeBody', () => {
  const mockSections = [
    { number: '1', title: 'ABILITIES', body: 'test' },
    { number: '2', title: 'ACTION CARDS', body: 'test' },
  ]

  it('returns single text token when no titles match', () => {
    const result = tokenizeBody('Hello world', mockSections)
    expect(result).toEqual([{ type: 'text', value: 'Hello world' }])
  })

  it('identifies a ref token when section title appears in body', () => {
    const result = tokenizeBody('Use ABILITIES to win', mockSections)
    const refToken = result.find(t => t.type === 'ref')
    expect(refToken).toBeDefined()
    expect(refToken.number).toBe('1')
  })

  it('matching is case-insensitive', () => {
    const result = tokenizeBody('Use abilities now', mockSections)
    const refToken = result.find(t => t.type === 'ref')
    expect(refToken).toBeDefined()
  })
})
