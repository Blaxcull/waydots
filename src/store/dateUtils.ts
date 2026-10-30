/**
 * Date manipulation utilities for the calendar.
 * All functions work with YYYY-MM-DD string format and local timezone.
 */

/** Format a Date object as YYYY-MM-DD using local timezone */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Add days to a Date object, returning a new Date */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Add days to a YYYY-MM-DD date string */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

/**
 * Add months to a YYYY-MM-DD date string.
 * Clamps day to last day of month if needed (e.g., Jan 31 + 1 month -> Feb 28).
 */
export function addMonthsToDateStr(dateStr: string, months: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  const originalDay = date.getDate()
  date.setMonth(date.getMonth() + months)
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(originalDay, lastDayOfMonth))
  return formatDate(date)
}

/**
 * Add years to a YYYY-MM-DD date string.
 * Handles Feb 29 -> Feb 28 for non-leap years automatically via JS Date.
 */
export function addYearsToDateStr(dateStr: string, years: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  date.setFullYear(date.getFullYear() + years)
  return formatDate(date)
}

/** Get the first and last day of the month containing the given date */
export function getMonthRange(date: Date): { monthStart: string; monthEnd: string } {
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { monthStart, monthEnd }
}

/** Get month key string (YYYY-MM) from a Date */
export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
