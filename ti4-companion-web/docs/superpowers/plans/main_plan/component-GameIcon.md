# component-GameIcon
**File:** `src/components/shared/GameIcon.jsx`
**Status:** New
**Prereqs:** —

## Functionality
```
export default GameIcon({ category, name, size=16, className, alt })
  return <img src={`/icons/${category}/${name}.svg`} width={size} height={size}
              alt={alt ?? name} className={className} />

export SvgImageIcon({ category, name, x, y, size, ...props })
  return <image href={`/icons/${category}/${name}.svg`} x={x} y={y}
                width={size} height={size} {...props} />
```

## Tests
```
GameIcon renders img with src="/icons/tech/biotic.svg" when category="tech" name="biotic"
GameIcon uses name as alt when alt not provided
GameIcon uses provided alt when given
GameIcon applies className to img
GameIcon respects size prop (width and height attrs)
SvgImageIcon renders SVG image element with correct href
SvgImageIcon passes x, y, width, height to image element
```
