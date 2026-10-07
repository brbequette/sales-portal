/** CRM due dates are calendar days serialized at UTC midnight. Timed local
 * follow-ups retain their actual time and should still become overdue that day. */
export function taskDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}

export function taskIsOverdue(task: { dueDate: string | null; status: string }, now = new Date()): boolean {
  if (!task.dueDate || task.status === 'Completed') return false
  const due = taskDate(task.dueDate)
  if (/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(task.dueDate)) due.setDate(due.getDate() + 1)
  return due.getTime() < now.getTime()
}
