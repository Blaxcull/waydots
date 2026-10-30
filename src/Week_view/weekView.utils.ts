import { addDays, format } from 'date-fns'

export const hourSlots = Array.from({ length: 24 }, (_, i) => i)
export const gridLines = Array.from({ length: 23 }, (_, i) => i)
export const TOP_ROW_LANE_PITCH = 34
export const TOP_ROW_ITEM_OFFSET = 2
export const TIMELINE_SURFACE_COLOR = '#e2e2e1'
export const TIMELINE_SURFACE_ACTIVE_COLOR = '#dcdcd9'

export const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const formatTimedSpanLabel = (startMinutes: number, endMinutes: number) =>
  `${formatTime(startMinutes)} - ${formatTime(endMinutes)}`

export const formatTopRowDateRange = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const startMonth = format(start, 'MMM')
  const endMonth = format(end, 'MMM')
  const startDay = start.getDate()
  const endDay = end.getDate()

  if (startMonth === endMonth) return `${startMonth} ${startDay}-${endDay}`
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
}

export const getDateFromSpanningClick = (
  eventClick: React.MouseEvent<HTMLElement>,
  startDateKey: string,
  spanDays: number
) => {
  if (spanDays <= 1) return new Date(`${startDateKey}T00:00:00`)
  const rect = eventClick.currentTarget.getBoundingClientRect()
  if (!rect.width || rect.width <= 0) return new Date(`${startDateKey}T00:00:00`)
  const boundedX = Math.max(0, Math.min(eventClick.clientX - rect.left, rect.width - 1))
  const dayWidth = rect.width / spanDays
  const dayOffset = Math.max(0, Math.min(spanDays - 1, Math.floor(boundedX / dayWidth)))
  return addDays(new Date(`${startDateKey}T00:00:00`), dayOffset)
}
