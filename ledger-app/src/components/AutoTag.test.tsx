import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}))

import AutoTag from './AutoTag'

describe('AutoTag', () => {
  it('手记的流水什么都不显示', () => {
    const { container } = render(<AutoTag tx={{ source: null, needs_review: false }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('没有 source 字段的老数据也不显示', () => {
    const { container } = render(<AutoTag tx={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('自动入账的显示「自动」', () => {
    render(<AutoTag tx={{ source: 'wechat', needs_review: false }} />)
    expect(screen.getByText('autoTag')).toBeInTheDocument()
    expect(screen.queryByText('autoNeedsReview')).not.toBeInTheDocument()
  })

  it('没确定类目的显示「待分类」，不再重复显示「自动」', () => {
    render(<AutoTag tx={{ source: 'wechat', needs_review: true }} />)
    expect(screen.getByText('autoNeedsReview')).toBeInTheDocument()
    expect(screen.queryByText('autoTag')).not.toBeInTheDocument()
  })
})
