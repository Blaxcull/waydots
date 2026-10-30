import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { isAllDayEvent, isMultiDayEvent, isTimedMultiDayEvent } from '@/lib/eventUtils'
import type { CalendarEvent } from '@/store/eventsStore'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MAX_VISIBLE_EVENTS = 4
export const MULTI_DAY_VISIBLE_LANES = 2
export const MONTH_EVENT_CHIP_HEIGHT = 23
export const MULTI_DAY_ITEM_HEIGHT = MONTH_EVENT_CHIP_HEIGHT
export const MULTI_DAY_LANE_PITCH = MONTH_EVENT_CHIP_HEIGHT + 2
export const DATE_ROW_HEIGHT = 30
export const MULTI_DAY_ROW_TOP_OFFSET = 5
export const MULTI_DAY_ROW_BOTTOM_GAP = 2
export const MONTH_EVENT_ROW_HEIGHT = MONTH_EVENT_CHIP_HEIGHT
export const MONTH_EVENT_ROW_GAP = 1
export const NORMAL_EVENT_TOP_OFFSET = 6

export const formatClock = (totalMinutes: number) => {
  const hour = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const getEventLabel = (event: CalendarEvent) => {
  if (isTimedMultiDayEvent(event)) return `${formatClock(event.start_time)}, ${event.title}`
  if (isAllDayEvent(event)) return event.title
  return `${formatClock(event.start_time)} ${event.title}`
}

export const getTimedEventPieces = (event: CalendarEvent) => ({
  time: formatClock(event.start_time),
  title: event.title,
})

export const getDateAtStartOfDay = (dateKey: string) => new Date(`${dateKey}T00:00:00`)

export const withMiddayTime = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)

export const getMonthCellTone = (inCurrentMonth: boolean, isSelected: boolean, isToday: boolean) => {
  if (isSelected) return 'bg-[linear-gradient(135deg,#f2efe6_0%,#ddded4_100%)]'
  if (!inCurrentMonth) return 'bg-[#deddd8]/75'
  if (isToday) return 'bg-[linear-gradient(135deg,#f7f4ec_0%,#e9e8df_100%)]'
  return 'bg-[linear-gradient(135deg,#ebeae6_0%,#e2e2dd_100%)]'
}

const compareMonthEvents = (a: CalendarEvent, b: CalendarEvent) => {
  const aIsMultiDay = isMultiDayEvent(a)
  const bIsMultiDay = isMultiDayEvent(b)
  if (aIsMultiDay !== bIsMultiDay) return aIsMultiDay ? -1 : 1
  const aIsAllDay = isAllDayEvent(a)
  const bIsAllDay = isAllDayEvent(b)
  if (aIsAllDay !== bIsAllDay) return aIsAllDay ? -1 : 1
  if (a.start_time !== b.start_time) return a.start_time - b.start_time
  const titleDiff = a.title.localeCompare(b.title)
  if (titleDiff !== 0) return titleDiff
  const aUpdatedAt = Date.parse(a.updated_at || '')
  const bUpdatedAt = Date.parse(b.updated_at || '')
  if (!Number.isNaN(aUpdatedAt) && !Number.isNaN(bUpdatedAt) && aUpdatedAt !== bUpdatedAt) {
    return bUpdatedAt - aUpdatedAt
  }
  return a.id.localeCompare(b.id)
}

export const compareMonthEventsWithPinnedPriority = (
  a: CalendarEvent,
  b: CalendarEvent,
  pinnedPriorityEventId: string | null
) => {
  if (pinnedPriorityEventId) {
    if (a.id === pinnedPriorityEventId && b.id !== pinnedPriorityEventId) return -1
    if (b.id === pinnedPriorityEventId && a.id !== pinnedPriorityEventId) return 1
  }
  return compareMonthEvents(a, b)
}

export const prioritizeSelectedEvent = (events: CalendarEvent[], pinnedPriorityEventId: string | null) =>
  [...events].sort((a, b) => compareMonthEventsWithPinnedPriority(a, b, pinnedPriorityEventId))

export const getDateFromSpanningClick = (
  eventClick: React.MouseEvent,
  visibleStartDateKey: string,
  spanDays: number
) => {
  if (spanDays <= 1) return withMiddayTime(getDateAtStartOfDay(visibleStartDateKey))
  const rect = eventClick.currentTarget.getBoundingClientRect()
  if (!rect.width || rect.width <= 0) return withMiddayTime(getDateAtStartOfDay(visibleStartDateKey))
  const boundedX = Math.max(0, Math.min(eventClick.clientX - rect.left, rect.width - 1))
  const dayWidth = rect.width / spanDays
  const dayOffset = Math.max(0, Math.min(spanDays - 1, Math.floor(boundedX / dayWidth)))
  return withMiddayTime(addDays(getDateAtStartOfDay(visibleStartDateKey), dayOffset))
}

export const getSpanDays = (visibleStartKey: string, visibleEndKey: string) =>
  differenceInCalendarDays(getDateAtStartOfDay(visibleEndKey), getDateAtStartOfDay(visibleStartKey)) + 1

export const formatMonthRangeLabel = (startKey: string, endKey: string) => {
  const start = getDateAtStartOfDay(startKey)
  const end = getDateAtStartOfDay(endKey)
  const sameMonth = format(start, 'MMM yyyy') === format(end, 'MMM yyyy')
  if (sameMonth) return `${format(start, 'MMM d')} - ${format(end, 'd')}`
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`
}
