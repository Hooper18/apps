import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

const authState = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    lang: 'zh',
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k),
  }),
}))

interface Row { id: string; label: string; created_at: string; last_used_at: string | null }
const supa = vi.hoisted(() => ({
  rows: [] as Row[],
  selectError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  inserted: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'ingest_tokens') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          order: () =>
            Promise.resolve(supa.selectError ? { data: null, error: supa.selectError } : { data: supa.rows, error: null }),
        }),
        insert: (row: Record<string, unknown>) => {
          supa.inserted.push(row)
          return {
            select: () => ({
              single: () =>
                Promise.resolve(
                  supa.insertError
                    ? { data: null, error: supa.insertError }
                    : {
                        data: { id: 'new-id', label: row.label, created_at: '2026-11-15T02:00:00Z', last_used_at: null },
                        error: null,
                      },
                ),
            }),
          }
        },
        delete: () => ({
          eq: (_field: string, id: string) => {
            supa.deleted.push(id)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

import AutoIngest from './AutoIngest'
import { hashToken } from '../lib/ingestToken'

beforeEach(() => {
  navigateMock.mockClear()
  authState.user = { id: 'u1' }
  supa.rows = [
    { id: 't1', label: '电脑', created_at: '2026-11-10T03:00:00Z', last_used_at: '2026-11-14T10:02:00Z' },
    { id: 't2', label: '', created_at: '2026-11-12T03:00:00Z', last_used_at: null },
  ]
  supa.selectError = null
  supa.insertError = null
  supa.inserted = []
  supa.deleted = []
})

describe('AutoIngest', () => {
  it('列出已有令牌和入口地址', async () => {
    render(<AutoIngest />)
    expect(await screen.findByText('电脑')).toBeInTheDocument()
    expect(screen.getByText('autoIngestUnnamed')).toBeInTheDocument()
    expect(screen.getByText('autoIngestNeverUsed')).toBeInTheDocument()
    expect(screen.getByText(/\/functions\/v1\/ingest$/)).toBeInTheDocument()
  })

  it('没有令牌时给出空状态', async () => {
    supa.rows = []
    render(<AutoIngest />)
    expect(await screen.findByText('autoIngestNoTokens')).toBeInTheDocument()
  })

  it('读取失败时说明原因，不显示空状态', async () => {
    supa.selectError = { message: 'relation "ingest_tokens" does not exist' }
    render(<AutoIngest />)
    expect(await screen.findByText('autoIngestLoadFailed')).toBeInTheDocument()
    expect(screen.queryByText('autoIngestNoTokens')).not.toBeInTheDocument()
  })

  it('生成令牌：库里只存哈希，明文显示一次，并出现在列表里', async () => {
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.change(screen.getByPlaceholderText('autoIngestLabelPlaceholder'), { target: { value: ' iPhone ' } })
    fireEvent.click(screen.getByRole('button', { name: 'autoIngestGenerate' }))

    const shown = await screen.findByTestId('new-token')
    const token = shown.textContent ?? ''
    expect(token).toMatch(/^lgr_[A-Za-z0-9_-]{43}$/)

    expect(supa.inserted).toHaveLength(1)
    expect(supa.inserted[0]).toEqual({ user_id: 'u1', label: 'iPhone', token_hash: await hashToken(token) })
    expect(JSON.stringify(supa.inserted[0])).not.toContain(token)
    expect(screen.getByText('iPhone')).toBeInTheDocument()
    expect(screen.getByText('autoIngestNewTokenHint')).toBeInTheDocument()
  })

  it('生成失败时提示，不显示令牌', async () => {
    supa.insertError = { message: 'nope' }
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.click(screen.getByRole('button', { name: 'autoIngestGenerate' }))
    expect(await screen.findByText('autoIngestCreateFailed')).toBeInTheDocument()
    expect(screen.queryByTestId('new-token')).not.toBeInTheDocument()
  })

  it('撤销要点两次：第一次变成「确认撤销」，第二次才删', async () => {
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.click(screen.getAllByRole('button', { name: 'autoIngestRevoke' })[0])
    expect(supa.deleted).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'autoIngestRevokeConfirm' }))
    await waitFor(() => expect(supa.deleted).toEqual(['t1']))
    await waitFor(() => expect(screen.queryByText('电脑')).not.toBeInTheDocument())
  })

  it('返回按钮回上一页', async () => {
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.click(screen.getByRole('button', { name: 'backAriaLabel' }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })
})
