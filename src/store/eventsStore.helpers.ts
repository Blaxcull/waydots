import { getGoalBucketKey, useGoalsStore, type GoalColumnType } from '@/store/goalsStore'
import { formatDate, getMonthKey, getMonthRange } from './dateUtils'
import { generateRecurringDatesForMonth, generateRecurringInstances } from './recurringUtils'
import type {
  CalendarEvent,
  Event,
  EventException,
  EventsCache,
  NewEvent,
} from './types'

export const VIRTUAL_ID_PATTERN = /-(\d{4}-\d{2}-\d{2})$/

export function isVirtualEventId(id: string): boolean {
  return VIRTUAL_ID_PATTERN.test(id)
}

export function extractMasterId(virtualId: string): string {
  return virtualId.replace(VIRTUAL_ID_PATTERN, '')
}

export function findEventInCache(cache: EventsCache, id: string): { event: Event; dateKey: string } | null {
  let best: { event: Event; dateKey: string } | null = null

  for (const dateKey of Object.keys(cache)) {
    const event = cache[dateKey].find((entry) => entry.id === id)
    if (!event) continue

    if (!best) {
      best = { event, dateKey }
      continue
    }

    const bestEndDate = best.event.end_date || best.event.date
    const eventEndDate = event.end_date || event.date
    const shouldReplace =
      event.date < best.event.date ||
      (event.date === best.event.date && eventEndDate > bestEndDate)

    if (shouldReplace) {
      best = { event, dateKey }
    }
  }

  return best
}

export function getClockwiseDurationMinutes(startMinutes: number, endMinutes: number): number {
  if (endMinutes >= startMinutes) return endMinutes - startMinutes
  return (1440 - startMinutes) + endMinutes
}

export function compareEventsByDisplayOrder(a: Pick<Event, 'start_time' | 'end_time' | 'title' | 'created_at' | 'id'>, b: Pick<Event, 'start_time' | 'end_time' | 'title' | 'created_at' | 'id'>) {
  if (a.start_time !== b.start_time) return a.start_time - b.start_time

  const aDuration = getClockwiseDurationMinutes(a.start_time, a.end_time)
  const bDuration = getClockwiseDurationMinutes(b.start_time, b.end_time)
  if (aDuration !== bDuration) return bDuration - aDuration

  const aCreatedAt = Date.parse(a.created_at || '')
  const bCreatedAt = Date.parse(b.created_at || '')
  if (!Number.isNaN(aCreatedAt) && !Number.isNaN(bCreatedAt) && aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt
  }

  const titleDiff = (a.title || '').localeCompare(b.title || '')
  if (titleDiff !== 0) return titleDiff

  return a.id.localeCompare(b.id)
}

export function getGoalTypeLabel(columnType: 'week' | 'month' | 'year' | 'life'): string {
  switch (columnType) {
    case 'week':
      return 'Weekly'
    case 'month':
      return 'Monthly'
    case 'year':
      return 'Yearly'
    case 'life':
      return 'Lifetime'
  }
}

export function getBucketDateRange(bucketKey: string): { start: string; end: string } | null {
  if (bucketKey === 'life') return null

  if (bucketKey.startsWith('week-')) {
    const [, year, month, day] = bucketKey.split('-')
    const start = new Date(Number(year), Number(month), Number(day))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return {
      start: formatDate(start),
      end: formatDate(end),
    }
  }

  if (bucketKey.startsWith('month-')) {
    const [, year, month] = bucketKey.split('-')
    const start = new Date(Number(year), Number(month), 1)
    const end = new Date(Number(year), Number(month) + 1, 0)
    return {
      start: formatDate(start),
      end: formatDate(end),
    }
  }

  if (bucketKey.startsWith('year-')) {
    const [, year] = bucketKey.split('-')
    const start = new Date(Number(year), 0, 1)
    const end = new Date(Number(year), 11, 31)
    return {
      start: formatDate(start),
      end: formatDate(end),
    }
  }

  return null
}

export function eventMatchesGoalSyncRange(event: Event, bucketKey: string): boolean {
  const range = getBucketDateRange(bucketKey)
  if (!range) return true
  return event.date >= range.start && event.date <= range.end
}

const EVENT_GOAL_TYPE_TO_COLUMN: Record<string, GoalColumnType | null> = {
  Weekly: 'week',
  Monthly: 'month',
  Yearly: 'year',
  Lifetime: 'life',
  None: null,
}

export function normalizeGoalMetadataForDateChange(
  currentEvent: Pick<Event, 'date' | 'goalType' | 'goal' | 'goalColor' | 'goalIcon'>,
  updates: Partial<NewEvent>
): Partial<NewEvent> {
  const nextDate = updates.date
  if (!nextDate || nextDate === currentEvent.date) return updates

  const nextGoalType = updates.goalType ?? currentEvent.goalType
  const nextGoal = updates.goal ?? currentEvent.goal

  if (!nextGoalType || !nextGoal || nextGoal === 'None') return updates

  const columnType = EVENT_GOAL_TYPE_TO_COLUMN[nextGoalType] ?? null
  if (!columnType || columnType === 'life') return updates

  const nextDateObj = new Date(`${nextDate}T00:00:00`)
  const bucketKey = getGoalBucketKey(columnType, nextDateObj)
  const goalsInBucket = useGoalsStore.getState().store[bucketKey] ?? []
  const hasMatchingGoal = goalsInBucket.some((item) => item.text === nextGoal)

  if (hasMatchingGoal) return updates

  return {
    ...updates,
    goalColor: '',
    goalIcon: '',
  }
}

export function findMasterEvent(cache: EventsCache, masterId: string): Event | null {
  for (const events of Object.values(cache)) {
    const found = events.find((event) => event.id === masterId)
    if (found) return found
  }
  return null
}

export function scheduleIdleStoreWrite(write: () => void) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => write(), { timeout: 120 })
    return
  }

  setTimeout(write, 0)
}

export function buildRecurringEventsForMonth(
  monthDate: Date,
  eventsCache: EventsCache,
  recurringEventsCache: Record<string, CalendarEvent[]>,
  eventExceptionsCache: Record<string, EventException[]>
): CalendarEvent[] {
  const monthKey = getMonthKey(monthDate)
  if (recurringEventsCache[monthKey]) {
    return recurringEventsCache[monthKey]
  }

  const { monthStart, monthEnd } = getMonthRange(monthDate)
  const seenMasterIds = new Set<string>()
  const allMasterEvents: Event[] = []

  for (const dayEvents of Object.values(eventsCache)) {
    for (const event of dayEvents) {
      if (
        event.repeat &&
        event.repeat !== 'None' &&
        event.series_start_date &&
        event.series_end_date &&
        event.series_end_date >= monthStart &&
        event.series_start_date <= monthEnd &&
        !seenMasterIds.has(event.id)
      ) {
        seenMasterIds.add(event.id)
        allMasterEvents.push(event)
      }
    }
  }

  const generatedRecurring: CalendarEvent[] = []
  for (const masterEvent of allMasterEvents) {
    const recurringDates = generateRecurringDatesForMonth(
      masterEvent.series_start_date!,
      masterEvent.series_end_date!,
      monthStart,
      monthEnd,
      masterEvent.repeat || 'Daily'
    )

    const seriesExceptions = eventExceptionsCache[masterEvent.id] || []
    const instances = generateRecurringInstances(masterEvent, recurringDates, seriesExceptions)
    generatedRecurring.push(...instances)
  }

  return generatedRecurring
}

export function buildCanonicalEventsForDate(
  dateKey: string,
  eventsCache: EventsCache,
  recurringEventsForMonth: CalendarEvent[]
): CalendarEvent[] {
  const realEvents: CalendarEvent[] = (eventsCache[dateKey] || []).map((event) => ({
    ...event,
    isRecurringInstance: false,
  }))

  for (const [otherDateKey, dayEvents] of Object.entries(eventsCache)) {
    if (otherDateKey === dateKey) continue
    for (const event of dayEvents) {
      const eventEndDate = event.end_date || event.date
      if (event.date <= dateKey && eventEndDate >= dateKey) {
        realEvents.push({ ...event, isRecurringInstance: false })
      }
    }
  }

  const recurringEvents = recurringEventsForMonth.filter((event) => event.date === dateKey)
  const canonicalById = new Map<string, CalendarEvent>()
  const allEvents = [...realEvents, ...recurringEvents]

  for (const event of allEvents) {
    const existing = canonicalById.get(event.id)
    if (!existing) {
      canonicalById.set(event.id, event)
      continue
    }

    const existingEndDate = existing.end_date || existing.date
    const eventEndDate = event.end_date || event.date
    const shouldReplace =
      event.date < existing.date ||
      (event.date === existing.date && eventEndDate > existingEndDate)

    if (shouldReplace) {
      canonicalById.set(event.id, event)
    }
  }

  // Deduplicate events that look identical (likely legacy standalone overlapping new virtual recurring)
  // Logic: same title + same start time + same end time = deduplicate.
  // Priority: keep real events over virtual ones.
  const deduplicated: CalendarEvent[] = []
  const seenHeuristic = new Set<string>()

  // Sort: real events first, then virtual
  const sortedForDedup = Array.from(canonicalById.values()).sort((a, b) => {
    if (a.isRecurringInstance !== b.isRecurringInstance) {
      return a.isRecurringInstance ? 1 : -1
    }
    return 0
  })

  for (const event of sortedForDedup) {
    const key = `${event.title}|${event.start_time}|${event.end_time}`
    if (seenHeuristic.has(key)) continue
    seenHeuristic.add(key)
    deduplicated.push(event)
  }

  return deduplicated.sort(compareEventsByDisplayOrder)
}

export function getEventsForDateSnapshot(
  date: Date,
  eventsCache: EventsCache,
  recurringEventsCache: Record<string, CalendarEvent[]>,
  eventExceptionsCache: Record<string, EventException[]>
): CalendarEvent[] {
  const dateKey = formatDate(date)
  const recurringEventsForMonth = buildRecurringEventsForMonth(
    date,
    eventsCache,
    recurringEventsCache,
    eventExceptionsCache
  )
  return buildCanonicalEventsForDate(dateKey, eventsCache, recurringEventsForMonth)
}

export function getEventsForDatesSnapshot(
  dates: Date[],
  eventsCache: EventsCache,
  recurringEventsCache: Record<string, CalendarEvent[]>,
  eventExceptionsCache: Record<string, EventException[]>
): Record<string, CalendarEvent[]> {
  const eventsByDateKey: Record<string, CalendarEvent[]> = {}
  const recurringByMonthKey = new Map<string, CalendarEvent[]>()

  dates.forEach((date) => {
    const dateKey = formatDate(date)
    const monthKey = getMonthKey(date)
    let recurringEventsForMonth = recurringByMonthKey.get(monthKey)

    if (!recurringEventsForMonth) {
      recurringEventsForMonth = buildRecurringEventsForMonth(
        date,
        eventsCache,
        recurringEventsCache,
        eventExceptionsCache
      )
      recurringByMonthKey.set(monthKey, recurringEventsForMonth)
    }

    eventsByDateKey[dateKey] = buildCanonicalEventsForDate(
      dateKey,
      eventsCache,
      recurringEventsForMonth
    )
  })

  return eventsByDateKey
}
