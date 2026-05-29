import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock supabase before importing the SUT.
const supaState = {
  updateResult: { data: null as Array<{ id: string }> | null, error: null as unknown },
  capturedFilters: [] as Array<{ field: string; value: unknown }>,
  capturedSelect: '' as string,
  capturedUpdate: null as unknown,
}

vi.mock('./supabase', () => {
  return {
    supabase: {
      from(_table: string) {
        return {
          update(row: unknown) {
            supaState.capturedUpdate = row
            const chain = {
              eq(field: string, value: unknown) {
                supaState.capturedFilters.push({ field, value })
                return chain
              },
              select(cols: string) {
                supaState.capturedSelect = cols
                return Promise.resolve(supaState.updateResult)
              },
            }
            return chain
          },
        }
      },
    },
  }
})

vi.mock('./sync', () => ({
  triggerRefresh: vi.fn(),
}))

import { migratePetToFruit } from './categoryMigrations'
import { triggerRefresh } from './sync'
import { loadCache, saveCache } from './dataCache'

beforeEach(() => {
  supaState.updateResult = { data: null, error: null }
  supaState.capturedFilters = []
  supaState.capturedSelect = ''
  supaState.capturedUpdate = null
  vi.mocked(triggerRefresh).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('migratePetToFruit', () => {
  it('rewrites "宠物" → "水果" in localStorage cache and updates icon', async () => {
    saveCache('categories', [
      { id: 'c1', name: '宠物', icon: '🐶', type: 'expense' },
      { id: 'c2', name: '三餐', icon: '🍚', type: 'expense' },
    ])
    await migratePetToFruit('user-1')
    const cached = loadCache<Array<{ id: string; name: string; icon: string }>>('categories')
    expect(cached?.find((c) => c.id === 'c1')).toMatchObject({ name: '水果', icon: '🍎' })
    expect(cached?.find((c) => c.id === 'c2')).toMatchObject({ name: '三餐', icon: '🍚' })
  })

  it('issues a Supabase UPDATE filtered by user_id and name', async () => {
    await migratePetToFruit('user-42')
    expect(supaState.capturedUpdate).toEqual({ name: '水果', icon: '🍎' })
    expect(supaState.capturedFilters).toEqual([
      { field: 'user_id', value: 'user-42' },
      { field: 'name', value: '宠物' },
    ])
    expect(supaState.capturedSelect).toBe('id')
  })

  it('triggers refresh only when UPDATE returned > 0 rows', async () => {
    supaState.updateResult = { data: [{ id: 'c1' }], error: null }
    await migratePetToFruit('user-1')
    expect(triggerRefresh).toHaveBeenCalledTimes(1)
  })

  it('does NOT trigger refresh when UPDATE matched 0 rows (idempotent fast path)', async () => {
    supaState.updateResult = { data: [], error: null }
    await migratePetToFruit('user-1')
    expect(triggerRefresh).not.toHaveBeenCalled()
  })

  it('swallows Supabase errors silently', async () => {
    supaState.updateResult = { data: null, error: { message: 'rls denied' } }
    await expect(migratePetToFruit('user-1')).resolves.toBeUndefined()
    expect(triggerRefresh).not.toHaveBeenCalled()
  })

  it('is a no-op on cache when no "宠物" row present', async () => {
    saveCache('categories', [{ id: 'c2', name: '三餐', icon: '🍚', type: 'expense' }])
    const before = loadCache('categories')
    await migratePetToFruit('user-1')
    expect(loadCache('categories')).toEqual(before)
  })

  it('still fires Supabase UPDATE even when localStorage cache is empty', async () => {
    await migratePetToFruit('user-1')
    expect(supaState.capturedFilters).toHaveLength(2)
  })
})
