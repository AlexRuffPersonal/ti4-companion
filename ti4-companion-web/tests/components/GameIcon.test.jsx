import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameIcon, { SvgImageIcon } from '../../src/components/shared/GameIcon.jsx'

describe('GameIcon', () => {
  it('renders img with correct src when category="tech" name="biotic"', () => {
    render(<GameIcon category="tech" name="biotic" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/biotic.svg')
  })

  it('uses name as alt when alt not provided', () => {
    render(<GameIcon category="tech" name="biotic" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('alt')).toBe('biotic')
  })

  it('uses provided alt when given', () => {
    render(<GameIcon category="tech" name="biotic" alt="Biotic Tech" />)
    const img = screen.getByAltText('Biotic Tech')
    expect(img).toBeTruthy()
  })

  it('applies className to img', () => {
    render(<GameIcon category="tech" name="biotic" className="my-class" />)
    const img = screen.getByRole('img')
    expect(img.className).toContain('my-class')
  })

  it('respects size prop (width and height attrs)', () => {
    render(<GameIcon category="tech" name="biotic" size={32} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('width')).toBe('32')
    expect(img.getAttribute('height')).toBe('32')
  })
})

describe('SvgImageIcon', () => {
  it('renders SVG image element with correct href', () => {
    const { container } = render(
      <svg>
        <SvgImageIcon category="units" name="carrier" x={0} y={0} size={12} />
      </svg>
    )
    const image = container.querySelector('image')
    expect(image).toBeTruthy()
    expect(image.getAttribute('href')).toBe('/icons/units/carrier.svg')
  })

  it('passes x, y, width, height to image element', () => {
    const { container } = render(
      <svg>
        <SvgImageIcon category="units" name="carrier" x={5} y={10} size={20} />
      </svg>
    )
    const image = container.querySelector('image')
    expect(image.getAttribute('x')).toBe('5')
    expect(image.getAttribute('y')).toBe('10')
    expect(image.getAttribute('width')).toBe('20')
    expect(image.getAttribute('height')).toBe('20')
  })
})
