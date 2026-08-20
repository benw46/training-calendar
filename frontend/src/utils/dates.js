// Shared bounds for every date-navigation control in the app (main calendar
// month nav, day paging, and the Race Calendar's year nav) — arbitrary but
// generous limits so navigation can't run away indefinitely.
export const MIN_YEAR = 1999
export const MAX_YEAR = 2100
export const MIN_DATE = new Date(MIN_YEAR, 0, 1)
export const MAX_DATE = new Date(MAX_YEAR, 11, 31)

export function getMondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function addWeeks(date, n) {
  return addDays(date, n * 7)
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function toYMD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDayHeader(date, today) {
  const isToday = isSameDay(date, today)
  const num = date.getDate()
  if (isToday) return { primary: 'Today', secondary: String(num) }
  if (num === 1) return { primary: String(num), secondary: MONTH_SHORT[date.getMonth()] }
  return { primary: String(num), secondary: null }
}

export function formatSyncedAt(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  const month = MONTH_SHORT[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${d.getDate()}, ${hh}:${mm}`
}
