// Test script for calculating start of week
function getStartOfWeek(dateStr) {
  const d = new Date(dateStr)
  // Get day of week (0-6, where 0 is Sunday, 1 is Monday)
  const day = d.getDay()
  // Diff to Monday: if Sunday (0), diff is -6, else diff is 1 - day
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  
  const weekStart = new Date(d)
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart.toISOString().split('T')[0]
}

console.log("June 8, 2026:", getStartOfWeek("2026-06-08T12:00:00Z"))
console.log("June 9, 2026:", getStartOfWeek("2026-06-09T12:00:00Z"))
console.log("June 14, 2026 (Sun):", getStartOfWeek("2026-06-14T12:00:00Z"))
