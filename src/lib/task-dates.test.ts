import { describe, it, expect } from 'vitest'
import { taskDate, taskIsOverdue } from './task-dates'

describe('task due dates', () => {
  it('keeps CRM calendar dates on their displayed day', () => {
    for (const value of ['2026-10-07', '2026-10-07T00:00:00.000Z']) {
      const date = taskDate(value)
      expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 7, 0])
      expect(taskIsOverdue({ dueDate: value, status: 'Not Started' }, new Date(2026, 9, 7, 23, 59))).toBe(false)
      expect(taskIsOverdue({ dueDate: value, status: 'Not Started' }, new Date(2026, 9, 8, 1))).toBe(true)
    }
  })
  it('retains callback times and ignores completed, invalid and undated tasks', () => {
    const dueDate = '2026-10-07T15:30:00.000Z'
    expect(taskIsOverdue({ dueDate, status: 'In Progress' }, new Date('2026-10-07T15:31:00Z'))).toBe(true)
    expect(taskIsOverdue({ dueDate, status: 'Completed' }, new Date('2026-10-08T00:00:00Z'))).toBe(false)
    expect(taskIsOverdue({ dueDate: null, status: 'Not Started' })).toBe(false)
    expect(taskIsOverdue({ dueDate: 'invalid', status: 'Not Started' })).toBe(false)
  })
})
