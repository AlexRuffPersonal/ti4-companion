import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExhaustPlanetPicker from '../../src/components/game/ExhaustPlanetPicker.jsx'

const EXHAUST_OPTIONS = [
  { id: 'p1', planet_name: 'Lazar',   tech_specialty: 'blue',  coversColour: 'blue'  },
  { id: 'p2', planet_name: 'Vefut II', tech_specialty: 'red',  coversColour: 'red'   },
]

describe('ExhaustPlanetPicker', () => {
  it('renders a button for each exhaust option', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/Lazar/)).toBeTruthy()
    expect(screen.getByText(/Vefut II/)).toBeTruthy()
  })

  it('shows planet name and tech specialty colour', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/blue/i)).toBeTruthy()
  })

  it('marks selected planets visually', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={['p1']} onToggle={vi.fn()} />)
    expect(screen.getByTestId('planet-option-p1').className).toMatch(/ring/)
  })

  it('calls onToggle with planet id when clicked', () => {
    const onToggle = vi.fn()
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('planet-option-p1'))
    expect(onToggle).toHaveBeenCalledWith('p1')
  })
})
