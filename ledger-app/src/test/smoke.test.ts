import { describe, expect, it } from 'vitest'

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('has jsdom DOM', () => {
    document.body.innerHTML = '<p>hi</p>'
    expect(document.querySelector('p')?.textContent).toBe('hi')
  })
})
