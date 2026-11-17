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

const push = vi.hoisted(() => ({
  supported: true,
  enabled: false,
  enableResult: 'ok' as 'ok' | 'denied' | 'unsupported' | 'failed',
  enableCalls: [] as Array<[string, string]>,
  disableCalls: 0,
}))
vi.mock('../lib/push', () => ({
  pushSupported: () => push.supported,
  isPushEnabled: () => Promise.resolve(push.enabled),
  enablePush: (userId: string, label: string) => {
    push.enableCalls.push([userId, label])
    return Promise.resolve(push.enableResult)
  },
  disablePush: () => {
    push.disableCalls += 1
    return Promise.resolve()
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
  push.supported = true
  push.enabled = false
  push.enableResult = 'ok'
  push.enableCalls = []
  push.disableCalls = 0
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

  it('付款提醒：开启成功后显示已开启，再点一次关闭', async () => {
    render(<AutoIngest />)
    await screen.findByText('电脑')
    expect(screen.getByText('pushOff')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'pushEnable' }))
    expect(await screen.findByText('pushOn')).toBeInTheDocument()
    expect(push.enableCalls).toEqual([['u1', '']])
    fireEvent.click(screen.getByRole('button', { name: 'pushDisable' }))
    expect(await screen.findByText('pushOff')).toBeInTheDocument()
    expect(push.disableCalls).toBe(1)
  })

  it('付款提醒：进页面时这台设备已经开着，就显示已开启', async () => {
    push.enabled = true
    render(<AutoIngest />)
    expect(await screen.findByText('pushOn')).toBeInTheDocument()
  })

  it('付款提醒：权限被拒或开启失败时说明原因，状态仍是未开启', async () => {
    push.enableResult = 'denied'
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.click(screen.getByRole('button', { name: 'pushEnable' }))
    expect(await screen.findByText('pushDenied')).toBeInTheDocument()
    expect(screen.getByText('pushOff')).toBeInTheDocument()

    push.enableResult = 'failed'
    fireEvent.click(screen.getByRole('button', { name: 'pushEnable' }))
    expect(await screen.findByText('pushFailed')).toBeInTheDocument()
    expect(screen.queryByText('pushDenied')).not.toBeInTheDocument()
  })

  it('付款提醒：设备不支持时按钮不可点，并说明怎么办', async () => {
    push.supported = false
    render(<AutoIngest />)
    await screen.findByText('电脑')
    expect(screen.getByRole('button', { name: 'pushEnable' })).toBeDisabled()
    expect(screen.getByText('pushUnsupported')).toBeInTheDocument()
  })

  it('返回按钮回上一页', async () => {
    render(<AutoIngest />)
    await screen.findByText('电脑')
    fireEvent.click(screen.getByRole('button', { name: 'backAriaLabel' }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })
})
