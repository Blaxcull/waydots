import { useLayoutEffect, useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useTimeStore } from '@/store/timeStore'
import { useEventsStore } from '@/store/eventsStore'
import DayView from '@/Day_view/DayView'
import WeekView from '@/Week_view/WeekView'
import MonthView from '@/Month_view/MonthView'
import YearView from '@/Year_view/YearView'

export function DayViewRoute() {
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const setDate = useTimeStore(state => state.setDate)
  const setToday = useTimeStore(state => state.setToday)
  const fetchEventsWindow = useEventsStore(state => state.fetchEventsWindow)
  const setSelectedEvent = useEventsStore(state => state.setSelectedEvent)

  useLayoutEffect(() => {
    // Validate URL parameters
    if (!year || !month || !day) {
      setToday()
      return
    }

    const yearNum = parseInt(year, 10)
    const monthNum = parseInt(month, 10) - 1 // URL is 1-indexed, JS Date is 0-indexed
    const dayNum = parseInt(day, 10)

    // Check if date is valid
    const date = new Date(yearNum, monthNum, dayNum)
    const isValidDate = 
      date.getFullYear() === yearNum &&
      date.getMonth() === monthNum &&
      date.getDate() === dayNum

    if (!isValidDate) {
      // Invalid date, redirect to today
      setToday()
      return
    }

    // Set the date in the store
    setDate(date)
    
    // Deselect any currently selected event when date changes
    setSelectedEvent(null)
    
    // Fetch events in background - don't wait for it
    // UI shows cached data immediately, updates when fetch completes
    queueMicrotask(() => {
      fetchEventsWindow(date)
    })
  }, [year, month, day, setDate, setToday, fetchEventsWindow, setSelectedEvent])

  const yearNum = parseInt(year || '', 10)
  const monthNum = parseInt(month || '', 10) - 1
  const dayNum = parseInt(day || '', 10)
  const date = useMemo(() => new Date(yearNum, monthNum, dayNum), [yearNum, monthNum, dayNum])
  
  const isValidDate = 
    !Number.isNaN(yearNum) &&
    !Number.isNaN(monthNum) &&
    !Number.isNaN(dayNum) &&
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum &&
    date.getDate() === dayNum

  if (!isValidDate) {
    return <Navigate to="/" replace />
  }

  return <DayView />
}

export function WeekViewRoute() {
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const setDate = useTimeStore(state => state.setDate)
  const setToday = useTimeStore(state => state.setToday)
  const fetchEventsWindow = useEventsStore(state => state.fetchEventsWindow)
  const setSelectedEvent = useEventsStore(state => state.setSelectedEvent)

  const yearNum = parseInt(year || '', 10)
  const monthNum = parseInt(month || '', 10) - 1
  const dayNum = parseInt(day || '', 10)
  const date = useMemo(() => new Date(yearNum, monthNum, dayNum), [yearNum, monthNum, dayNum])
  const isValidDate =
    !Number.isNaN(yearNum) &&
    !Number.isNaN(monthNum) &&
    !Number.isNaN(dayNum) &&
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum &&
    date.getDate() === dayNum

  useLayoutEffect(() => {
    if (!isValidDate) {
      setToday()
      return
    }

    setDate(date)
    setSelectedEvent(null)
    queueMicrotask(() => {
      fetchEventsWindow(date)
    })
  }, [year, month, day, setDate, setToday, fetchEventsWindow, setSelectedEvent, isValidDate, date])

  if (!isValidDate) {
    return <Navigate to="/" replace />
  }

  return <WeekView />
}

export function MonthViewRoute() {
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const setDate = useTimeStore(state => state.setDate)
  const setToday = useTimeStore(state => state.setToday)
  const fetchEventsWindow = useEventsStore(state => state.fetchEventsWindow)
  const setSelectedEvent = useEventsStore(state => state.setSelectedEvent)

  const yearNum = parseInt(year || '', 10)
  const monthNum = parseInt(month || '', 10) - 1
  const dayNum = parseInt(day || '', 10)
  const date = new Date(yearNum, monthNum, dayNum)
  const isValidDate =
    !Number.isNaN(yearNum) &&
    !Number.isNaN(monthNum) &&
    !Number.isNaN(dayNum) &&
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum &&
    date.getDate() === dayNum

  useLayoutEffect(() => {
    if (!isValidDate) {
      setToday()
      return
    }

    setDate(date)
    setSelectedEvent(null)

    const fetchCenter = new Date(yearNum, monthNum, 15)
    queueMicrotask(() => {
      fetchEventsWindow(fetchCenter)
    })
  }, [date, fetchEventsWindow, isValidDate, monthNum, setDate, setSelectedEvent, setToday, yearNum])

  if (!isValidDate) {
    return <Navigate to="/" replace />
  }

  return <MonthView />
}

export function YearViewRoute() {
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const setDate = useTimeStore(state => state.setDate)
  const setToday = useTimeStore(state => state.setToday)
  const setSelectedEvent = useEventsStore(state => state.setSelectedEvent)

  const yearNum = parseInt(year || '', 10)
  const monthNum = parseInt(month || '', 10) - 1
  const dayNum = parseInt(day || '', 10)
  const date = new Date(yearNum, monthNum, dayNum)
  const isValidDate =
    !Number.isNaN(yearNum) &&
    !Number.isNaN(monthNum) &&
    !Number.isNaN(dayNum) &&
    date.getFullYear() === yearNum &&
    date.getMonth() === monthNum &&
    date.getDate() === dayNum

  useLayoutEffect(() => {
    if (!isValidDate) {
      setToday()
      return
    }

    setDate(date)
    setSelectedEvent(null)
  }, [date, isValidDate, setDate, setSelectedEvent, setToday])

  if (!isValidDate) {
    return <Navigate to="/" replace />
  }

  return <YearView />
}

export function TodayRedirect() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1 // 1-indexed for URL
  const day = today.getDate()

  return <Navigate to={`/day/${year}/${month}/${day}`} replace />
}
