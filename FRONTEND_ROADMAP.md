# TI4 Companion App — Flutter/Dart Frontend Roadmap

**Goal:** Build native iOS and Android apps for the TI4 Companion using Flutter/Dart, sharing the existing Supabase backend with the React web app.

---

## Architecture Decision: Flutter Mobile + React Web

The recommended approach is to maintain **two parallel frontends** against the same Supabase backend:

| Target | Frontend | Rationale |
|--------|----------|-----------|
| Web (desktop/laptop) | React (existing) | Mature, fast, excellent for complex interactive UIs |
| iOS + Android | Flutter (new) | Native performance, haptics, app store distribution |

Both share the same `games` table in Supabase — a player on mobile and a player on desktop join the same room and see identical real-time state. No game logic is duplicated; only the UI layer differs.

> Flutter web is deliberately excluded. Flutter web is slower and less mature than React for complex, data-heavy apps. If web is required in future, it can be added as a third Flutter target later.

---

## Key Technical Mappings

| React (current) | Flutter (target) |
|-----------------|-----------------|
| `useGameState.js` hook | `GameStateNotifier extends StateNotifier<GameState>` (Riverpod) |
| Spread-based immutable updates | `freezed` `copyWith()` pattern |
| `supabase-js` client | `supabase_flutter` package (identical API surface) |
| `localStorage` (last room) | `SharedPreferences` |
| `overlay` state variable | `go_router` named routes + `Navigator.push` for modals |
| `crypto.randomUUID()` | `const Uuid().v4()` (`uuid` package) |
| Browser session ID (host) | `device_info_plus` device UUID |
| Tailwind CSS dark theme | `ThemeData` with custom `ColorScheme` |
| CSS hex grid (absolute positioning) | `CustomPainter` with axial → pixel transform |
| Lucide React icons | `lucide_icons` Flutter package |

---

## Flutter Project Structure

```
ti4_companion/          # New Flutter project (sibling to React app or separate repo)
  lib/
    main.dart           # Entry point — ProviderScope + SupabaseInit
    app.dart            # MaterialApp.router + GoRouter config
    
    core/
      supabase_service.dart    # Client init, CRUD, realtime subscription
      theme.dart               # Dark theme: void background, plasma/gold accents
      constants.dart           # App-wide string/numeric constants
      room_code.dart           # generateRoomCode() helper
      
    models/             # freezed immutable models + JSON serialisation
      game_state.dart
      player.dart
      transaction.dart
      map_tile.dart
      combat_state.dart
      draft_state.dart
      
    data/               # Dart equivalents of src/data/*.js
      game_data.dart    # Factions, agendas, strategy cards, phases, colours
      tiles.dart        # 115 system tiles, getTileById(), getTilesByExpansion()
      map_layouts.dart  # 11 hex layouts, getLayoutById(), axial coordinate helpers
      
    providers/          # Riverpod providers
      game_state_provider.dart  # StateNotifier with all 20+ mutation methods
      auth_provider.dart        # Supabase auth stream
      
    screens/
      login_screen.dart
      setup_screen.dart         # 3-step wizard
      dashboard_screen.dart
      agenda_screen.dart
      map_builder_screen.dart
      trade_log_screen.dart
      rules_screen.dart
      
    widgets/
      player_row.dart           # Expandable, multi-tab
      vp_scoreboard.dart
      phase_control.dart
      strategy_card_picker.dart
      leader_status_widget.dart
      technology_browser.dart
      hex_grid_painter.dart     # CustomPainter — most complex widget
      tile_palette.dart
      syncing_indicator.dart
      room_code_badge.dart
      
  test/
    models/             # JSON round-trip tests for all models
    providers/          # Game state mutation unit tests
    widgets/            # Widget tests for key components
    
  pubspec.yaml
  
  .github/
    workflows/
      flutter_ci.yml    # flutter test + flutter build apk/ios on PR
```

---

## Package Dependencies

```yaml
# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter

  # Backend
  supabase_flutter: ^2.8.0     # Supabase SDK — auth, DB, realtime

  # State management
  flutter_riverpod: ^2.6.1
  riverpod_annotation: ^2.6.1

  # Immutable models
  freezed_annotation: ^2.4.4
  json_annotation: ^4.9.0

  # Navigation
  go_router: ^14.6.3

  # Local storage
  shared_preferences: ^2.3.5

  # Device identity (host browser ID equivalent)
  device_info_plus: ^10.1.4

  # Utilities
  uuid: ^4.5.1              # UUID generation

  # Icons
  lucide_icons: ^0.0.4      # Matches React lucide-react

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.13
  freezed: ^2.5.8
  json_serializable: ^6.8.0
  riverpod_generator: ^2.6.1
  flutter_lints: ^4.0.0
```

---

## Phase 1 — Project Setup & Core Architecture

**Goal:** Runnable Flutter app with theme, navigation skeleton, and Supabase connected.

- [ ] Create Flutter project: `flutter create --org com.ti4companion ti4_companion`
- [ ] Add all dependencies to `pubspec.yaml`
- [ ] Configure `supabase_flutter` init in `main.dart` (reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `--dart-define` or `.env`)
- [ ] Port app dark theme to `ThemeData`: void background (`#0a0a1a`), plasma accent (`#6366f1`), gold accent (`#f59e0b`)
- [ ] Configure `go_router` routes: `/login`, `/setup`, `/game/:code`, `/game/:code/agenda`, `/game/:code/map`, `/game/:code/rules`, `/game/:code/trade`
- [ ] `SyncingIndicator` widget (pulsing dot shown when Supabase write is in-flight)
- [ ] GitHub Actions workflow: `flutter analyze`, `flutter test`, `flutter build apk` on every PR
- [ ] Confirm app launches on iOS Simulator and Android Emulator

---

## Phase 2 — Data & Models

**Goal:** All static game data and immutable state models available in Dart.

### Data files

- [ ] Port `gameData.js` → `lib/data/game_data.dart`
  - `FACTIONS` map (base/pok/te lists), `ALL_FACTIONS`
  - `PLAYER_COLOURS` list (id, label, hex)
  - `STRATEGY_CARDS` list (id, name, primary text, secondary text)
  - `PHASES` list + `PHASE_LABELS` + `PHASE_DESCRIPTIONS` maps
  - `GALACTIC_EVENTS` list
  - `AGENDAS` list (50 entries with type, outcome, notes)
  - `TECHNOLOGIES` map by colour
  - `RULES` list
  - `FACTION_STARTING_TECHS` map
- [ ] Port `tiles.js` → `lib/data/tiles.dart`
  - All 115 system tiles as `const List<Tile>`
  - `getTileById(int id)`, `getTilesByExpansion(Expansions e)` helpers
  - `getTileResources(Tile t)`, `getTileInfluence(Tile t)` helpers
  - `ANOMALY_LABELS`, `WORMHOLE_LABELS` maps
- [ ] Port `mapLayouts.js` → `lib/data/map_layouts.dart`
  - All 11 layouts as `const List<MapLayout>`
  - `getLayoutById(String id)`, `getLayoutsForPlayerCount(int n)` helpers
  - Axial → pixel coordinate transform: `hexToPixel(int q, int r, double size)`

### Freezed models

- [ ] `GameState` model with `copyWith()`, `toJson()`, `fromJson()`
- [ ] `Player` model with `copyWith()`, `toJson()`, `fromJson()`
- [ ] `Transaction` model
- [ ] `MapTile` model
- [ ] Unit tests: JSON round-trip for all models using sample data

---

## Phase 3 — State Management

**Goal:** Full port of `useGameState.js` to a Riverpod `StateNotifier`.

- [ ] `GameStateNotifier extends StateNotifier<GameState?>` in `lib/providers/game_state_provider.dart`
- [ ] Port `createGame(initialState)` — generates room code, inserts to Supabase, subscribes to realtime
- [ ] Port `joinGame(code)` — looks up by code (case-insensitive), subscribes
- [ ] Port `leaveGame()` — unsubscribes, clears state
- [ ] Port `updateGame(updater)` — applies updater locally, patches Supabase
- [ ] Port `updatePlayer(playerId, updater)` — scoped player update
- [ ] Port all convenience mutations:
  - [ ] `adjustPlayerVP`, `adjustCounter`, `adjustCommandToken`
  - [ ] `toggleTechnology`, `setLeaderStatus`
  - [ ] `assignStrategyCard`, `togglePassed`
  - [ ] `advancePhase`, `claimCustodians`
  - [ ] `drawAgenda`, `castVote`, `resolveAgenda`, `repealLaw`
  - [ ] `setPlayerPermission`, `canEdit`
  - [ ] `logTransaction`
  - [ ] `claimExpeditionSlice`, `triggerFracture`
- [ ] Supabase realtime: subscribe to `UPDATE` on `games` WHERE `code = roomCode`, auto-update notifier
- [ ] `AuthNotifier` in `lib/providers/auth_provider.dart`: wraps `supabase.auth` stream
- [ ] `SharedPreferences` for `ti4:lastRoom` persistence (auto-rejoin on cold start)
- [ ] Integration test: create game → update VP → verify Supabase value matches

---

## Phase 4 — Authentication & Setup Screens

**Goal:** Users can sign in and create or join a game.

### `LoginScreen`

- [ ] Email + password fields with validation
- [ ] Sign In button → `supabase.auth.signInWithPassword()`
- [ ] Sign Up button → `supabase.auth.signUp()`
- [ ] Error display (invalid credentials, network failure)
- [ ] Loading state during auth

### `SetupScreen`

- [ ] Step 1: Expansion toggles (Base/PoK/TE), player count stepper (3–8), VP goal (10/14), Galactic Event picker
- [ ] Step 2: Per-player rows — name field, faction dropdown (filtered by enabled expansions), colour picker
- [ ] Step 3: Review summary — player count, factions, VP goal, expansions
- [ ] "Create Game" → calls `createGame(initialState)` → navigates to `/game/:code`
- [ ] "Join Game" tab → 6-char code entry (uppercase, auto-format) → calls `joinGame(code)`
- [ ] Room code display + copy-to-clipboard button after game created

---

## Phase 5 — Dashboard & Player Rows

**Goal:** Full main dashboard parity with the React web app.

### `DashboardScreen`

- [ ] VP Scoreboard: ranked player list, progress bars toward VP goal, player colour indicator
- [ ] Phase Control: current phase label + description, "Next Phase" button (host-only)
- [ ] Custodians Token: host selects claiming player → +1 VP, unlocks agenda
- [ ] Initiative Order: sorted by strategy card number, passed indicator
- [ ] Laws in Play: collapsible list of enacted agenda laws
- [ ] Speaker indicator (highlighted player)
- [ ] Room code badge + syncing indicator in app bar
- [ ] Navigation bar: Dashboard | Agenda | Trade | Map | Rules
- [ ] Leave Game + Logout in overflow menu

### `PlayerRow` widget (expandable)

- [ ] Collapsed: player name, colour swatch, faction, VP display with +/- buttons
- [ ] Expanded tabs:
  - **Resources:** commodities, trade goods, command tokens (tactic/fleet/strategy +/-)
  - **Strategy:** strategy card picker (1 or 2 slots), passed toggle
  - **Leaders:** Agent/Commander/Hero status cycling (locked → unlocked → exhausted → purged)
  - **Technology:** 4-colour tab browser, searchable, toggle owned/unowned
  - **Permissions (host only):** edit level selector per slot
- [ ] Permission gate: own row always editable; other rows require host or 'all' permission

---

## Phase 6 — Overlay Screens

**Goal:** Agenda voting, trade log, and rules reference at full parity with React.

### `AgendaScreen`

- [ ] Deck remaining counter
- [ ] "Draw Agenda" button (host) — up to 2 current agendas
- [ ] Per-agenda card: name, Law/Directive badge, outcome options, vote tallies, abstain count
- [ ] Per-player vote status row (voted / abstaining / pending)
- [ ] My vote input (if not yet voted): choice picker + influence spinner
- [ ] "Resolve" button (host): picks winning outcome, enacts law or discards directive
- [ ] Laws in Play collapsible section with repeal button (host only)
- [ ] Agenda Phase locked UI until Custodians claimed

### `TradeLogScreen`

- [ ] Log transaction: from player, to player, item description
- [ ] This Round transactions (filtered by current round)
- [ ] Full history (reverse chronological)
- [ ] Support for the Throne tracker (highlights transactions containing "support for the throne")

### `RulesScreen`

- [ ] Tabbed: Rules | Agendas
- [ ] Search bar (filters both tabs live)
- [ ] 16 rule topics with expandable detail
- [ ] 62 agenda entries with name, outcome, notes
- [ ] TE edge case warning banner (when TE enabled)

---

## Phase 7 — Map Builder

**Goal:** Full hex map editor on mobile with touch-first interaction.

This is the most technically complex phase. The React version uses CSS absolute positioning; Flutter requires a `CustomPainter`.

### `HexGridPainter` (CustomPainter)

- [ ] Axial → pixel transform: `hexToPixel(q, r, hexSize)` for pointy-top hexagons
- [ ] Draw empty hex grid from layout positions (grey outlines)
- [ ] Draw placed tiles: render tile data (system number, planets, anomaly label, wormhole label)
- [ ] Colour-code tile backs: blue = blue-back system, red = red-back, orange = home, grey = empty
- [ ] Highlight selected hex (tap)
- [ ] Pan and pinch-to-zoom gesture support (`InteractiveViewer` wrapper)

### `MapBuilderScreen`

- [ ] Layout preset switcher (dropdown/bottom sheet)
- [ ] Tap empty hex → open `TilePalette` bottom sheet → select tile → place
- [ ] Tap placed tile → show tile info (planets, resources, influence) + "Remove" option
- [ ] `TilePalette`: scrollable grid of all tiles, filterable by expansion + type
- [ ] Auto-place: Mecatol Rex at center, faction home tiles at player seats
- [ ] Map stats bar: total resources, total influence, tile count
- [ ] Host-only edit gate; guests see read-only map with pan/zoom
- [ ] "Clear Map" button (host, with confirmation)

---

## Phase 8 — Mobile-Specific UX

**Goal:** Leverage native mobile capabilities for a better-than-web experience.

- [ ] Haptic feedback: light tap on +/- buttons, medium impact on phase advance, heavy on VP change
- [ ] Pull-to-refresh on `DashboardScreen` (forces Supabase refetch)
- [ ] Swipe-to-dismiss on all bottom sheets and modal overlays
- [ ] Tablet / landscape layout: side-by-side scoreboard + player list on wide screens
- [ ] iOS: `CupertinoActionSheet` for destructive confirmations (Leave Game, Remove Planet, etc.)
- [ ] iOS App Store build config: `Runner.xcodeproj`, bundle ID, signing, App Store Connect
- [ ] Android Play Store build config: signing keystore, `build.gradle`, Play Console
- [ ] App icon: faction-inspired design for both platforms
- [ ] Splash screen: starfield background + game title
- [ ] Optional push notifications via Firebase Cloud Messaging (FCM):
  - [ ] "It's your turn" notification (when it's your initiative turn in Action Phase)
  - [ ] "Phase advanced" notification (host advances phase)
  - [ ] Players opt in per game

---

## Phase 9 — Gameplay Feature Parity with GAMEPLAY_ROADMAP.md

**Goal:** Implement all 12 phases of `GAMEPLAY_ROADMAP.md` in Flutter, Flutter-first where possible.

All new gameplay features (planets, objectives, action cards, fleet tracker, combat, production, relics, draft, enhanced agenda, TE deep, promissory notes, stats) should be built in Flutter as the primary implementation. The React web app can follow as a secondary port.

- [ ] Phase 0 data files ported alongside Phase 2 of this roadmap (Dart data files)
- [ ] Phase 1 (Planets): `PlanetTracker` widget in player row tabs
- [ ] Phase 2 (Objectives): `ObjectiveBoardScreen` as new nav destination
- [ ] Phase 3 (Action Cards): `ActionCardHand` widget in player row tabs
- [ ] Phase 4 (Units/Fleet): `FleetRoster` widget in player row tabs
- [ ] Phase 5 (Production): `ProductionCalculator` bottom sheet
- [ ] Phase 6 (Combat): `CombatTrackerScreen` full-screen overlay
- [ ] Phase 7 (Relics): `RelicTracker` widget in player row tabs
- [ ] Phase 8 (Draft): `DraftScreen` replacing setup step 2
- [ ] Phase 9 (Enhanced Agenda): extend `AgendaScreen` with Elect pickers + rider tracking
- [ ] Phase 10 (TE Deep): `ExpeditionTracker` widget + TE-specific nav items
- [ ] Phase 11 (Promissory Notes): extend player row with interactive note trading
- [ ] Phase 12 (Stats): `StatsScreen` accessible from main menu

---

## Migration Complexity Reference

| Feature | Effort | Key Challenge |
|---------|--------|---------------|
| Auth screens | Low | Direct API parity |
| Setup wizard | Medium | Stepper form pattern |
| Dashboard layout | High | Many custom nested widgets |
| Player row (all tabs) | High | Highest widget count in app |
| Agenda phase | Medium | Logic clean, UI rebuild |
| Rules lookup | Low | Searchable `ListView` |
| Trade log | Low | Simple form + list |
| Map builder | Very High | `CustomPainter` hex grid, touch gestures |
| State management | Medium | Direct port of hook logic |
| Real-time sync | Low | Identical `supabase_flutter` API |

---

## Shared Backend — No Changes Required

The Supabase database schema is **unchanged** for the Flutter app:

```sql
-- Same table, same columns, same RLS policies
-- Both React and Flutter read/write games.state as the same JSONB blob
SELECT * FROM games WHERE code = $1;
UPDATE games SET state = $2, updated_at = now() WHERE code = $1;
```

The Flutter app uses the same `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment values, provided via `--dart-define` at build time or a `.env` equivalent.

---

## Current Status

| Phase | Status |
|-------|--------|
| 1 — Project Setup | ❌ Not started |
| 2 — Data & Models | ❌ Not started |
| 3 — State Management | ❌ Not started |
| 4 — Auth & Setup | ❌ Not started |
| 5 — Dashboard & Player Rows | ❌ Not started |
| 6 — Overlay Screens | ❌ Not started |
| 7 — Map Builder | ❌ Not started |
| 8 — Mobile UX | ❌ Not started |
| 9 — Gameplay Features | ❌ Not started |
