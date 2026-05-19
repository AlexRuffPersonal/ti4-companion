# component-LeaderAbilityModal
**File:** `src/components/game/LeaderAbilityModal.jsx`
**Status:** New
**Prereqs:** lib-leaderConstants

## Functionality
```pseudocode
LeaderAbilityModal({ leader, faction, leaderType, gamePlayers, onConfirm, onClose })
  selectionConfig = LEADER_SELECTION_CONFIG[faction]?.[leaderType] ?? {}
  [selections, setSelections] = useState({})

  render MODAL_WRAPPER:
    PANEL(md):
      header row: leader.name + type badge + status chip
      MUTED(leader.text)  // full card text

      if selectionConfig.needs_target_player:
        LABEL('Choose a player')
        <select> over gamePlayers (excluding self unless selectionConfig.or_self)
          onChange → setSelections({...selections, chosen_player_id: value})

      if selectionConfig.needs_planet:
        LABEL('Choose a planet')
        planet list filtered by selectionConfig.planet_filter
          onChange → setSelections({...selections, planet_name: value})

      if selectionConfig.needs_system:
        LABEL('Choose a system')  (if count=2: 'Choose 2 systems')
        system list filtered by selectionConfig.system_filter, excluding selectionConfig.exclude
          onChange → setSelections({...selections, system_keys: value})

      if selectionConfig.needs_choice:
        LABEL('Choose an effect')
        selectionConfig.options.map(opt => radio/button)
          onChange → setSelections({...selections, choice: index})

      if selectionConfig.needs_strategy_card:
        LABEL('Choose a strategy card')
        <select> over strategy cards
          onChange → setSelections({...selections, strategy_card: value})

      if no config keys: MUTED('This will use the ability as described.')

      button row:
        btn-primary 'USE ABILITY' disabled if required selections missing → onConfirm(selections)
        btn-ghost 'CANCEL' → onClose()
```

## Tests
No automated tests — pure display component. Verified manually against each faction's selection flow.
