/**
 * Utilities for generating recurring event instances from master events.
 */
import type { Event, CalendarEvent, EventException } from './types'
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  addYearsToDateStr,
} from './dateUtils'

function diffDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

/**
 * Generate all recurring occurrence dates for a given month.
 * Returns YYYY-MM-DD strings for each occurrence within the month range.
 */
export function generateRecurringDatesForMonth(
  seriesStartDate: string,
  seriesEndDate: string,
  monthStart: string,
  monthEnd: string,
  repeatType: string
): string[] {
  const dates: string[] = []

  if (seriesStartDate > monthEnd || seriesEndDate < monthStart) {
    return dates // Series doesn't overlap this month
  }

  let currentDate = seriesStartDate

  switch (repeatType) {
    case 'Daily':
      if (currentDate < monthStart) currentDate = monthStart
      break
    case 'Weekly': {
      if (currentDate < monthStart) {
        const offset = diffDays(currentDate, monthStart)
        const weeksToSkip = Math.floor(offset / 7)
        currentDate = addDaysToDateStr(currentDate, weeksToSkip * 7)
        while (currentDate < monthStart) {
          currentDate = addDaysToDateStr(currentDate, 7)
        }
      }
      break
    }
    default:
      break
  }

  while (currentDate <= seriesEndDate && currentDate <= monthEnd) {
    if (currentDate >= monthStart) {
      dates.push(currentDate)
    }

    switch (repeatType) {
      case 'Daily':
        currentDate = addDaysToDateStr(currentDate, 1)
        break
      case 'Weekly':
        currentDate = addDaysToDateStr(currentDate, 7)
        break
      case 'Monthly':
        currentDate = addMonthsToDateStr(currentDate, 1)
        break
      case 'Yearly':
        currentDate = addYearsToDateStr(currentDate, 1)
        break
      default:
        currentDate = addDaysToDateStr(currentDate, 1)
    }
  }

  return dates
}

/**
 * Build virtual recurring event instances for a specific date.
 * Skips the master event's original date (already in DB) and applies exceptions.
 */
export function generateRecurringInstances(
  masterEvent: Event,
  recurringDates: string[],
  exceptions: EventException[]
): CalendarEvent[] {
  const instances: CalendarEvent[] = []
  const exceptionsByDate = new Map(exceptions.map((exception) => [exception.date, exception]))
  const daySpan = (() => {
    const start = new Date(masterEvent.date + 'T00:00:00')
    const end = new Date((masterEvent.end_date || masterEvent.date) + 'T00:00:00')
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
  })()

  for (const recDate of recurringDates) {
    // Skip the master event's original date - it's a real DB row
    if (recDate === masterEvent.date) continue

    const exception = exceptionsByDate.get(recDate)

    if (exception && (exception as any).deleted === true) continue

    const instance: CalendarEvent = {
      ...masterEvent,
      id: `${masterEvent.id}-${recDate}`,
      date: recDate,
      end_date: addDaysToDateStr(recDate, daySpan),
      isRecurringInstance: true,
      seriesMasterId: masterEvent.id,
      occurrenceDate: recDate,
    }

    // Apply exception overrides if present
    if (exception) {
      if (exception.start_time !== undefined) instance.start_time = exception.start_time
      if (exception.end_time !== undefined) instance.end_time = exception.end_time
      if (exception.title !== undefined) instance.title = exception.title
    }

    instances.push(instance)
  }

  return instances
}

/**
 * Calculate the next occurrence date based on repeat type.
 */
export function getNextOccurrence(dateStr: string, repeatType: string): string {
  switch (repeatType) {
    case 'Daily':
      return addDaysToDateStr(dateStr, 1)
    case 'Weekly':
      return addDaysToDateStr(dateStr, 7)
    case 'Monthly':
      return addMonthsToDateStr(dateStr, 1)
    case 'Yearly':
      return addYearsToDateStr(dateStr, 1)
    default:
      return addDaysToDateStr(dateStr, 1)
  }
}

export function isSeriesActuallyRecurring(event: {
  repeat?: string
  series_start_date?: string
  series_end_date?: string
  isRecurringInstance?: boolean
  date?: string
} | null | undefined): boolean {
  if (!event) return false
  if (event.isRecurringInstance === true) return true
  if (!event.repeat || event.repeat === 'None') return false
  if (!event.series_start_date || !event.series_end_date) return false
  return event.series_end_date > event.series_start_date
}

export function isSeriesAnchorEvent(event: {
  isRecurringInstance?: boolean
  repeat?: string
  series_start_date?: string
  series_end_date?: string
  date?: string
} | null | undefined): boolean {
  if (!event) return false
  if (event.isRecurringInstance === true) return false
  if (!isSeriesActuallyRecurring(event)) return false
  return !!event.date && event.date === event.series_start_date
}
