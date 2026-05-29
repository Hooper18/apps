import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PasswordInput from './PasswordInput'

describe('PasswordInput', () => {
  it('starts as type=password (hidden)', () => {
    render(<PasswordInput value="" onChange={() => {}} />)
    const input = document.querySelector('input')
    expect(input).toHaveAttribute('type', 'password')
  })

  it('toggles to type=text when eye button clicked', () => {
    render(<PasswordInput value="secret" onChange={() => {}} />)
    const toggle = document.querySelector('button')!
    fireEvent.click(toggle)
    expect(document.querySelector('input')).toHaveAttribute('type', 'text')
    fireEvent.click(toggle)
    expect(document.querySelector('input')).toHaveAttribute('type', 'password')
  })

  it('forwards onChange events', () => {
    const onChange = vi.fn()
    render(<PasswordInput value="" onChange={onChange} />)
    fireEvent.change(document.querySelector('input')!, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('reflects controlled value', () => {
    render(<PasswordInput value="hello" onChange={() => {}} />)
    expect(document.querySelector('input')).toHaveValue('hello')
  })
})
