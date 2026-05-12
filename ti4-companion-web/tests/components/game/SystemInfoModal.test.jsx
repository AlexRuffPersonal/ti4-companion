import { render, screen, fireEvent } from '@testing-library/react'
import SystemInfoModal from '../../../src/components/game/SystemInfoModal'

const planet = { name: 'Welfor', resources: 2, influence: 0, tech_specialty: 'blue', type: ['cultural'] }

describe('SystemInfoModal', () => {
  it('renders planet name', () => {
    render(<SystemInfoModal tileInfo={{ planets: [planet], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('Welfor')).toBeInTheDocument()
  })

  it('renders resources/influence', () => {
    render(<SystemInfoModal tileInfo={{ planets: [planet], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('2/0')).toBeInTheDocument()
  })

  it('renders tech chip letter for tech_specialty', () => {
    render(<SystemInfoModal tileInfo={{ planets: [planet], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders trait label in uppercase', () => {
    render(<SystemInfoModal tileInfo={{ planets: [planet], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('cultural')).toBeInTheDocument()
  })

  it('renders WORMHOLES label and value', () => {
    render(<SystemInfoModal tileInfo={{ planets: [], wormholes: ['alpha'], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('WORMHOLES')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('renders ANOMALIES label and value', () => {
    render(<SystemInfoModal tileInfo={{ planets: [], wormholes: [], anomalies: ['gravity_rift'] }} systemKey="3,1" onClose={vi.fn()} />)
    expect(screen.getByText('ANOMALIES')).toBeInTheDocument()
    expect(screen.getByText('gravity_rift')).toBeInTheDocument()
  })

  it('does not render WORMHOLES or ANOMALIES sections when empty', () => {
    render(<SystemInfoModal tileInfo={{ planets: [], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={vi.fn()} />)
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

  it('clicking CLOSE calls onClose', () => {
    const onClose = vi.fn()
    render(<SystemInfoModal tileInfo={{ planets: [], wormholes: [], anomalies: [] }} systemKey="3,1" onClose={onClose} />)
    fireEvent.click(screen.getByText('CLOSE'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
