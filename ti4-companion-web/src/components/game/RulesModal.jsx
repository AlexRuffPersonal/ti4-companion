import { useState, useEffect } from 'react'
import sections from '../../data/lrr-sections.json'

// Export tokenizeBody for testing
export function tokenizeBody(text, allSections) {
  // Build sorted list of titles (longest first to prevent partial matches)
  const titles = allSections
    .map(s => ({ number: s.number, title: s.title, body: s.body }))
    .sort((a, b) => b.title.length - a.title.length)

  const tokens = []
  let remaining = text

  while (remaining.length > 0) {
    let matched = false
    for (const s of titles) {
      const idx = remaining.toLowerCase().indexOf(s.title.toLowerCase())
      if (idx === 0) {
        tokens.push({ type: 'ref', number: s.number, title: s.title, body: s.body, value: remaining.slice(0, s.title.length) })
        remaining = remaining.slice(s.title.length)
        matched = true
        break
      } else if (idx > 0) {
        tokens.push({ type: 'text', value: remaining.slice(0, idx) })
        remaining = remaining.slice(idx)
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push({ type: 'text', value: remaining })
      remaining = ''
    }
  }
  return tokens
}

export default function RulesModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [expandedSection, setExpandedSection] = useState(null)
  const [popupStack, setPopupStack] = useState([])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setPopupStack([])
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (popupStack.length > 0) {
          setPopupStack(prev => prev.slice(0, -1))
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, popupStack.length, onClose])

  if (!isOpen) return null

  const filtered = query
    ? sections.filter(s => (s.title + ' ' + s.body).toLowerCase().includes(query.toLowerCase()))
    : sections

  function toggleExpanded(num) {
    setExpandedSection(prev => prev === num ? null : num)
  }

  function pushPopup(token) {
    const section = sections.find(s => s.number === token.number)
    if (section) setPopupStack(prev => [...prev, section])
  }

  function removeFromStack(i) {
    setPopupStack(prev => prev.filter((_, idx) => idx !== i))
  }

  function renderBody(bodyText) {
    return tokenizeBody(bodyText, sections).map((t, i) =>
      t.type === 'text'
        ? <span key={i}>{t.value}</span>
        : <span key={i} className="text-gold underline cursor-pointer" onClick={() => pushPopup(t)}>{t.value}</span>
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-40 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">RULES REFERENCE</p>
          <button className="btn-ghost text-xs" onClick={onClose}>×</button>
        </div>
        <input
          className="input"
          placeholder="Search rules…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          data-testid="rules-search"
        />
        <div className="panel-inset max-h-[60vh] overflow-y-auto flex flex-col gap-1">
          {query && filtered.length === 0 && (
            <p className="text-muted text-xs">No results for &apos;{query}&apos;</p>
          )}
          {filtered.map(s => (
            <div key={s.number}>
              <button
                className="btn-ghost w-full text-left text-sm"
                data-testid={`section-${s.number}`}
                onClick={() => toggleExpanded(s.number)}
              >
                {s.number} — {s.title}
              </button>
              {expandedSection === s.number && (
                <div className="font-mono text-xs text-text p-2" data-testid={`body-${s.number}`}>
                  {renderBody(s.body)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {popupStack.length > 0 && (
        <>
          <div className="fixed inset-0 z-[49]" onClick={() => setPopupStack([])} />
          {popupStack.map((entry, i) => (
            <div
              key={i}
              className="panel fixed max-w-[480px] shadow-lg"
              style={{ top: `${8 + i * 16}px`, left: `${8 + i * 16}px`, zIndex: 50 + i }}
            >
              <div className="flex items-center justify-between p-2">
                <p className="label text-xs">{entry.number} — {entry.title}</p>
                <button className="btn-ghost text-xs" onClick={() => removeFromStack(i)}>×</button>
              </div>
              <div className="font-mono text-xs text-text p-2 max-h-[50vh] overflow-y-auto">
                {renderBody(entry.body)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
