import { describe, expect, it } from 'vitest'
import { generateToken, hashToken, ingestEndpoint } from './ingestToken'

describe('generateToken', () => {
  it('是 lgr_ 开头加 43 个 URL 安全字符', () => {
    expect(generateToken()).toMatch(/^lgr_[A-Za-z0-9_-]{43}$/)
  })

  it('每次都不一样', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateToken()))
    expect(seen.size).toBe(20)
  })
})

describe('hashToken', () => {
  it('是 SHA-256 的十六进制小写，和后端入口算法一致', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('ingestEndpoint', () => {
  it('拼出后端入口地址，去掉多余的斜杠', () => {
    expect(ingestEndpoint('https://abc.supabase.co')).toBe('https://abc.supabase.co/functions/v1/ingest')
    expect(ingestEndpoint('https://abc.supabase.co/')).toBe('https://abc.supabase.co/functions/v1/ingest')
  })
})
