import { describe, expect, it, vi } from 'vitest'
import {
  enqueue,
  list,
  remove,
  bumpRetry,
  count,
  clear,
  subscribe,
  applyOutboxTo,
  type OutboxEntry,
} from './outbox'

describe('outbox queue', () => {
  it('enqueue assigns id/createdAt/retries=0 and appends FIFO', () => {
    const e1 = enqueue({ op: 'insert', table: 'transactions', row: { id: 'r1', amount: 10 } })
    const e2 = enqueue({ op: 'insert', table: 'transactions', row: { id: 'r2', amount: 20 } })
    expect(e1.id).toBeTypeOf('string')
    expect(e1.createdAt).toMatch(/^\d{4}-/)
    expect(e1.retries).toBe(0)
    const all = list()
    expect(all.map((e) => e.id)).toEqual([e1.id, e2.id])
  })

  it('count reflects current queue size', () => {
    expect(count()).toBe(0)
    enqueue({ op: 'insert', table: 'categories', row: { id: 'c1' } })
    enqueue({ op: 'insert', table: 'categories', row: { id: 'c2' } })
    expect(count()).toBe(2)
  })

  it('remove drops only the targeted entry', () => {
    const a = enqueue({ op: 'insert', table: 'transactions', row: { id: 'a' } })
    const b = enqueue({ op: 'insert', table: 'transactions', row: { id: 'b' } })
    remove(a.id)
    const remaining = list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  it('bumpRetry increments retries field idempotently per call', () => {
    const e = enqueue({ op: 'update', table: 'budgets', rowId: 'b1', row: { amount: 5 } })
    bumpRetry(e.id)
    bumpRetry(e.id)
    expect(list()[0].retries).toBe(2)
  })

  it('bumpRetry on unknown id is a no-op', () => {
    expect(() => bumpRetry('does-not-exist')).not.toThrow()
    expect(count()).toBe(0)
  })

  it('clear empties the queue', () => {
    enqueue({ op: 'insert', table: 'transactions', row: { id: 'x' } })
    enqueue({ op: 'insert', table: 'transactions', row: { id: 'y' } })
    clear()
    expect(list()).toEqual([])
  })

  it('subscribe fires on every mutation and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribe(cb)
    const e = enqueue({ op: 'insert', table: 'transactions', row: { id: 'z' } })
    bumpRetry(e.id)
    remove(e.id)
    expect(cb).toHaveBeenCalledTimes(3)
    unsub()
    enqueue({ op: 'insert', table: 'transactions', row: { id: 'after' } })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('list returns empty array when storage is corrupt', () => {
    localStorage.setItem('ledger:outbox', 'broken{')
    expect(list()).toEqual([])
  })

  describe('applyOutboxTo (offline overlay)', () => {
    interface Row { id: string; amount?: number; note?: string }
    const baseRows: Row[] = [
      { id: 'srv1', amount: 100, note: 'server' },
      { id: 'srv2', amount: 200, note: 'server' },
    ]

    it('returns input unchanged when no pending writes', () => {
      expect(applyOutboxTo<Row>('transactions', baseRows)).toEqual(baseRows)
    })

    it('insert appends the pending row', () => {
      enqueue({ op: 'insert', table: 'transactions', row: { id: 'localNew', amount: 50, note: 'pending' } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out).toHaveLength(3)
      expect(out.find((r) => r.id === 'localNew')).toEqual({ id: 'localNew', amount: 50, note: 'pending' })
    })

    it('update merges into existing row', () => {
      enqueue({ op: 'update', table: 'transactions', rowId: 'srv1', row: { amount: 999 } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      const srv1 = out.find((r) => r.id === 'srv1')
      expect(srv1).toEqual({ id: 'srv1', amount: 999, note: 'server' })
    })

    it('update against missing row is dropped silently', () => {
      enqueue({ op: 'update', table: 'transactions', rowId: 'ghost', row: { amount: 0 } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out).toEqual(baseRows)
    })

    it('upsert inserts when missing and merges when present', () => {
      enqueue({ op: 'upsert', table: 'transactions', row: { id: 'srv1', note: 'overlay' } })
      enqueue({ op: 'upsert', table: 'transactions', row: { id: 'fresh', amount: 1 } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out.find((r) => r.id === 'srv1')).toEqual({ id: 'srv1', amount: 100, note: 'overlay' })
      expect(out.find((r) => r.id === 'fresh')).toEqual({ id: 'fresh', amount: 1 })
    })

    it('delete removes the row from overlay', () => {
      enqueue({ op: 'delete', table: 'transactions', rowId: 'srv2' })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out.find((r) => r.id === 'srv2')).toBeUndefined()
      expect(out).toHaveLength(1)
    })

    it('only applies entries for the matching table', () => {
      enqueue({ op: 'insert', table: 'categories', row: { id: 'catX' } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out).toEqual(baseRows)
    })

    it('applies multiple entries in FIFO order (later update overrides earlier)', () => {
      enqueue({ op: 'update', table: 'transactions', rowId: 'srv1', row: { amount: 1 } })
      enqueue({ op: 'update', table: 'transactions', rowId: 'srv1', row: { amount: 2 } })
      const out = applyOutboxTo<Row>('transactions', baseRows)
      expect(out.find((r) => r.id === 'srv1')?.amount).toBe(2)
    })
  })

  it('list returns entries in insertion order even after mixed operations', () => {
    const a = enqueue({ op: 'insert', table: 'transactions', row: { id: 'a' } })
    const b = enqueue({ op: 'insert', table: 'transactions', row: { id: 'b' } })
    const c = enqueue({ op: 'insert', table: 'transactions', row: { id: 'c' } })
    remove(b.id)
    expect(list().map((e: OutboxEntry) => e.id)).toEqual([a.id, c.id])
  })
})
