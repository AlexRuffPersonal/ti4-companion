import { render, screen, fireEvent } from '@testing-library/react'
import SystemInfoModal from '../../../src/components/game/SystemInfoModal'

const planet = { name: 'Welfor', resources: 2, influence: 0, tech_specialty: 'blue', type: ['cultural'] }

function renderModal(tileInfoOverrides = {}, onClose = vi.fn()) {
  const tileInfo = { planets: [planet], wormholes: [], anomalies: [], ...tileInfoOverrides }
  return render(<SystemInfoModal tileInfo={tileInfo} systemKey="3,1" onClose={onClose} />)
}

describe('SystemInfoModal', () => {
  it('renders planet name', () => {
    renderModal()
    expect(screen.getByText('Welfor')).toBeInTheDocument()
  })

  it('renders resources/influence', () => {
    renderModal()
    expect(screen.getByText('2/0')).toBeInTheDocument()
  })

  it('renders tech chip letter for tech_specialty', () => {
    renderModal()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders trait label in uppercase', () => {
    renderModal()
    expect(screen.getByText('cultural')).toBeInTheDocument()
  })

  it('renders WORMHOLES label and value', () => {
    renderModal({ planets: [], wormholes: ['alpha'] })
    expect(screen.getByText('WORMHOLES')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('renders ANOMALIES label and value', () => {
    renderModal({ planets: [], anomalies: ['gravity_rift'] })
    expect(screen.getByText('ANOMALIES')).toBeInTheDocument()
    expect(screen.getByText('gravity rift')).toBeInTheDocument()
  })

  it('does not render WORMHOLES or ANOMALIES sections when empty', () => {
    renderModal({ planets: [] })
    expect(screen.queryByText('WORMHOLES')).toBeNull()
    expect(screen.queryByText('ANOMALIES')).toBeNull()
  })

  it('does not render tech chip when no tech_specialty', () => {
    const p = { name: 'Mecatol Rex', resources: 1, influence: 6, type: [] }
    render(<SystemInfoModal tileInfo={{ planets: [p], wormholes: [], anomalies: [] }} systemKey="0,0" onClose={vi.fn()} />)
    expect(screen.queryByText('B')).toBeNull()
    expect(screen.queryByText('G')).toBeNull()
    expect(screen.queryByText('R')).toBeNull()
    expect(screen.queryByText('Y')).toBeNull()
  })

  it('does not render trait labels when type is empty', () => {
    const p = { name: 'Mecatol Rex', resources: 1, influence: 6, type: [] }
    const { container } = render(<SystemInfoModal tileInfo={{ planets: [p], wormholes: [], anomalies: [] }} systemKey="0,0" onClose={vi.fn()} />)
    expect(container.querySelectorAll('.text-dim.text-xs').length).toBe(0)
  })

  it('renders planet trait icon for each trait', () => {
    renderModal()
    // planet fixture has type: ['cultural']
    expect(screen.getByRole('img', { name: 'cultural' })).toBeInTheDocument()
  })

  it('renders wormhole icon for each wormhole', () => {
    renderModal({ planets: [], wormholes: ['alpha'] })
    expect(screen.getByRole('img', { name: 'alpha' })).toBeInTheDocument()
  })

  it('renders anomaly icon for each anomaly', () => {
    renderModal({ planets: [], anomalies: ['gravity_rift'] })
    expect(screen.getByRole('img', { name: 'gravity_rift' })).toBeInTheDocument()
  })

  it('renders trait label when type is a string (not array)', () => {
    const p = { name: 'Jord', resources: 4, influence: 2, type: 'home' }
    render(<SystemInfoModal tileInfo={{ planets: [p], wormholes: [], anomalies: [] }} systemKey="0,0" onClose={vi.fn()} />)
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('clicking CLOSE calls onClose', () => {
    const onClose = vi.fn()
    renderModal({}, onClose)
    fireEvent.click(screen.getByText('CLOSE'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
