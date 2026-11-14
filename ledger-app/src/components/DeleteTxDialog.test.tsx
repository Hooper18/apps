import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}))

import DeleteTxDialog from './DeleteTxDialog'

describe('DeleteTxDialog', () => {
  it('asks for confirmation before doing anything', () => {
    const onConfirm = vi.fn(() => Promise.resolve())
    render(<DeleteTxDialog onConfirm={onConfirm} onCancel={() => {}} onDone={() => {}} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('confirmDeleteMsg')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancel closes without deleting', () => {
    const onConfirm = vi.fn(() => Promise.resolve())
    const onCancel = vi.fn()
    const onDone = vi.fn()
    render(<DeleteTxDialog onConfirm={onConfirm} onCancel={onCancel} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('confirm runs the delete and reports done only after it finishes', async () => {
    let finish!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const onDone = vi.fn()
    render(<DeleteTxDialog onConfirm={onConfirm} onCancel={() => {}} onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'confirmDelete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    // 删除进行中：两个按钮都不能再点，防止重复删除
    expect(screen.getByRole('button', { name: 'deleting' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled()

    finish()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })
})
