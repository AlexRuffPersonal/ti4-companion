import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  createGame,
  joinGame,
  updateGameSettings,
  pickFactionColor,
  setSpeaker,
  startGame,
} from '../../src/lib/edgeFunctions.js'

describe('game edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createGame calls game-create with empty body', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { code: 'ABC123', game_id: 'g1' }, error: null })
    const result = await createGame()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-create', { body: {} })
    expect(result).toEqual({ code: 'ABC123', game_id: 'g1' })
  })

  it('joinGame calls game-join with code', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { game_id: 'g1', code: 'ABC123' }, error: null })
    await joinGame('ABC123')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-join', { body: { code: 'ABC123' } })
  })

  it('updateGameSettings spreads game_id and settings', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await updateGameSettings('g1', { vp_goal: 14 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-update-settings', {
      body: { game_id: 'g1', vp_goal: 14 },
    })
  })

  it('pickFactionColor calls game-pick-faction-color', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await pickFactionColor('g1', 'Arborec', 'green')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-pick-faction-color', {
      body: { game_id: 'g1', faction: 'Arborec', colour: 'green' },
    })
  })

  it('setSpeaker calls game-set-speaker', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await setSpeaker('g1', 'player-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-set-speaker', {
      body: { game_id: 'g1', player_id: 'player-uuid' },
    })
  })

  it('startGame calls game-start', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { started: true }, error: null })
    await startGame('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-start', { body: { game_id: 'g1' } })
  })

  it('throws with generic message for non-HTTP errors', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Network error' } })
    await expect(createGame()).rejects.toThrow('Network error')
  })

  it('throws with domain message from FunctionsHttpError response body', async () => {
    const mockResponse = { text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Game not found' })) }
    const httpError = new FunctionsHttpError({ status: 404 })
    httpError.context = mockResponse
    supabase.functions.invoke.mockResolvedValue({ data: null, error: httpError })
    await expect(createGame()).rejects.toThrow('Game not found')
  })

  it('falls back to SDK message when FunctionsHttpError body cannot be parsed', async () => {
    const mockResponse = { text: vi.fn().mockRejectedValue(new Error('unreadable')) }
    const httpError = new FunctionsHttpError({ status: 500 })
    httpError.context = mockResponse
    httpError.message = 'Edge Function returned a non-2xx status code'
    supabase.functions.invoke.mockResolvedValue({ data: null, error: httpError })
    await expect(createGame()).rejects.toThrow('Edge Function returned a non-2xx status code')
  })
})
