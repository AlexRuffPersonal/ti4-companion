# component-TechCard-p28
**File:** `src/components/game/TechCard.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
import { useState } from 'react'

// Inside TechCard component body:
const [isExpanded, setIsExpanded] = useState(false)
const hasText = Boolean(tech.text)

// In JSX, replace the name line with a row containing name + chevron toggle:
<div className="flex items-center justify-between gap-1">
  <p className={`font-body text-xs font-bold leading-tight ${nameColour}`}>
    {tech.name}
  </p>
  {hasText && (
    <button
      data-testid="tech-text-toggle"
      className="text-dim text-xs shrink-0"
      onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev) }}
    >
      {isExpanded ? '▾' : '▸'}
    </button>
  )}
</div>

// Below the name row, conditionally render tech text:
{isExpanded && hasText && (
  <p data-testid="tech-text" className="text-dim text-xs mt-1 leading-snug">
    {tech.text}
  </p>
)}
```

## Tests

```pseudocode
it('renders chevron toggle when tech.text is non-empty')
it('does not render chevron toggle when tech.text is null/empty')
it('tech text hidden by default')
it('click chevron reveals tech text')
it('click chevron again hides tech text')
it('clicking chevron does not call onSelect')
```
