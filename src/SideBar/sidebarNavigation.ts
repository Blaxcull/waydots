import type { NavigateFunction } from 'react-router-dom'

export type CalendarRouteView = 'day' | 'week' | 'month' | 'year'

export function getCalendarRouteView(pathname: string): CalendarRouteView {
  if (pathname.startsWith('/week')) return 'week'
  if (pathname.startsWith('/month')) return 'month'
  if (pathname.startsWith('/year')) return 'year'
  return 'day'
}

export function navigateToDate(navigate: NavigateFunction, date: Date, view: CalendarRouteView) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  if (view === 'week') {
    navigate(`/week/${year}/${month}/${day}`)
    return
  }

  if (view === 'month') {
    navigate(`/month/${year}/${month}/${day}`)
    return
  }

  if (view === 'year') {
    navigate(`/year/${year}/${month}/${day}`)
    return
  }

  navigate(`/day/${year}/${month}/${day}`)
}

export function shiftCalendarDate(date: Date, view: CalendarRouteView, direction: -1 | 1) {
  const nextDate = new Date(date)

  if (view === 'week') {
    nextDate.setDate(nextDate.getDate() + (7 * direction))
    return nextDate
  }

  if (view === 'month') {
    const originalDay = nextDate.getDate()
    nextDate.setDate(1)
    nextDate.setMonth(nextDate.getMonth() + direction)
    const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
    nextDate.setDate(Math.min(originalDay, lastDay))
    return nextDate
  }

  if (view === 'year') {
    nextDate.setFullYear(nextDate.getFullYear() + direction)
    return nextDate
  }

  nextDate.setDate(nextDate.getDate() + direction)
  return nextDate
}
