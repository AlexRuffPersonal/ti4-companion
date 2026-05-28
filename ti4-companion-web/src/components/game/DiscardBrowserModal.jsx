import { useState } from 'react'

export default function DiscardBrowserModal({ open, cards = [], maxSelect = 3, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState([])

  if (!open) return null

  function toggleCard(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= maxSelect) return prev
      return [...prev, id]
    })
  }

  function handleConfirm() {
    onConfirm(selectedIds)
    setSelectedIds([])
  }

  function handleClose() {
    setSelectedIds([])
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">Choose up to {maxSelect} Action Cards</p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {cards.map(card => {
            const isSelected = selectedIds.includes(card.id)
            const isDisabled = !isSelected && selectedIds.length >= maxSelect

            return (
              <label
                key={card.id}
                className={`flex items-start gap-3 p-2 rounded cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-hull'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => !isDisabled && toggleCard(card.id)}
                  className="mt-1 flex-shrink-0"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-body text-sm text-bright font-bold">{card.name}</span>
                  {card.text && <p className="text-muted text-xs">{card.text}</p>}
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={selectedIds.length === 0}
            onClick={handleConfirm}
          >
            Take Selected ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  )
}
