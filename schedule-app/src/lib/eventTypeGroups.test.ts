import { describe, expect, it } from 'vitest'
import {
  EVENT_TYPE_GROUP,
  groupOf,
  allowsCourse,
  allowsWeight,
} from './eventTypeGroups'
import type { EventType } from './types'

describe('eventTypeGroups', () => {
  it('每个 EventType 都映射到一个 group', () => {
    const allTypes: EventType[] = [
      'deadline', 'lab_report', 'video_submission', 'milestone',
      'personal', 'exam', 'midterm', 'quiz', 'presentation', 'tutorial', 'consultation',
      'holiday', 'revision',
    ]
    for (const t of allTypes) {
      expect(EVENT_TYPE_GROUP[t], `group for ${t}`).toBeDefined()
    }
  })

  it("ddl 组：deadline / lab_report / video_submission / milestone", () => {
    expect(groupOf('deadline')).toBe('ddl')
    expect(groupOf('lab_report')).toBe('ddl')
    expect(groupOf('video_submission')).toBe('ddl')
    expect(groupOf('milestone')).toBe('ddl')
  })

  it("slot 组：personal / exam / midterm / quiz / presentation / tutorial / consultation", () => {
    expect(groupOf('personal')).toBe('slot')
    expect(groupOf('exam')).toBe('slot')
    expect(groupOf('midterm')).toBe('slot')
    expect(groupOf('quiz')).toBe('slot')
    expect(groupOf('presentation')).toBe('slot')
    expect(groupOf('tutorial')).toBe('slot')
    expect(groupOf('consultation')).toBe('slot')
  })

  it("span 组：holiday / revision", () => {
    expect(groupOf('holiday')).toBe('span')
    expect(groupOf('revision')).toBe('span')
  })

  describe('allowsCourse', () => {
    it('span 组（holiday / revision）不挂课程', () => {
      expect(allowsCourse('holiday')).toBe(false)
      expect(allowsCourse('revision')).toBe(false)
    })

    it('personal 即便是 slot 组也不挂课程', () => {
      expect(allowsCourse('personal')).toBe(false)
    })

    it('ddl 组都可挂课程', () => {
      expect(allowsCourse('deadline')).toBe(true)
      expect(allowsCourse('lab_report')).toBe(true)
    })

    it('其他 slot 组可挂课程', () => {
      expect(allowsCourse('exam')).toBe(true)
      expect(allowsCourse('quiz')).toBe(true)
    })
  })

  describe('allowsWeight', () => {
    it('只有 ddl 组允许"权重"字段', () => {
      expect(allowsWeight('deadline')).toBe(true)
      expect(allowsWeight('lab_report')).toBe(true)
      expect(allowsWeight('milestone')).toBe(true)
    })

    it('slot / span 组不允许权重', () => {
      expect(allowsWeight('exam')).toBe(false)
      expect(allowsWeight('quiz')).toBe(false)
      expect(allowsWeight('holiday')).toBe(false)
    })
  })
})
