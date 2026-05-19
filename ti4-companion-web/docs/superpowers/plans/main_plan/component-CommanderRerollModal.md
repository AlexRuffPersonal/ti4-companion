# component-CommanderRerollModal
**File:** `src/components/game/CommanderRerollModal.jsx`
**Status:** New
**Prereqs:** hook-useLeaders-p43c

## Functionality
```pseudocode
CommanderRerollModal({ window, onConfirm, onClose })
  // window = { dice: DieResult[], combat_id, faction }
  [selected, setSelected] = useState([])  // indices of dice to reroll

  render MODAL_WRAPPER:
    PANEL(md):
      LABEL('Jol-Nar Commander — Ta Zern')
      MUTED('After you roll dice for a unit ability, you may reroll any of those dice.')

      dice grid:
        window.dice.map((die, i) =>
          <button
            className={selected.includes(i) ? 'border-plasma' : 'border-border'}
            onClick={() => toggle i in selected}
          >
            {die.roll} {die.hit ? '✓' : '✗'} {die.rerolled ? '(rerolled)' : ''}
          </button>
        )

      MUTED(`${selected.length} dice selected for reroll`)

      button row:
        btn-primary 'REROLL' disabled if selected.length=0 → onConfirm(selected)
        btn-ghost 'KEEP ALL' → onClose()
```

## Tests
No automated tests — pure display component. Verified manually.
