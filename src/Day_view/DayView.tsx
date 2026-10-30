import { useTimeStore } from "@/store/timeStore"
import { useEventsStore, formatDate } from "@/store/eventsStore"
import { resolveGoalColorForEvent, resolveGoalIconForEvent, useGoalsStore } from "@/store/goalsStore"
import { getEventVisualColors, isAllDayEvent, isMultiDayEvent, isTimedMultiDayEvent, isTopBarEventType } from "@/lib/eventUtils"
import { getGoalIcon } from "@/Goal_view/goal"
import TimeLine from "./TimeLine"
import TimeView from "./TimeView"
import { useEffect, useRef, useMemo, useState } from "react"
import { TOP_DEAD_ZONE } from "@/lib/eventUtils"
import { useParams } from "react-router-dom"

const DayView = () => {
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const getEventsForDate = useEventsStore((state) => state.getEventsForDate)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const scrollToEventId = useEventsStore((state) => state.scrollToEventId)
  const scrollToTop = useEventsStore((state) => state.scrollToTop)
  const getEventById = useEventsStore((state) => state.getEventById)
  const setScrollToEventId = useEventsStore((state) => state.setScrollToEventId)
  const setScrollToTop = useEventsStore((state) => state.setScrollToTop)
  const goalsStore = useGoalsStore((state) => state.store)
  // Subscribe to eventsCache to trigger re-renders when events change
  useEventsStore((state) => state.eventsCache)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hourHeight = 100
  const selectedDateKey = selectedDate ? formatDate(selectedDate) : null

  // Compute all-day events for selected date
  const allDayEvents = (() => {
    if (!selectedDate) return []
    const events = getEventsForDate(selectedDate)

    const filtered = events.filter(event => isTopBarEventType(event))

    // Multi-day events above single-day all-day events
    return filtered.sort((a, b) => {
      const aEnd = a.end_date || a.date
      const bEnd = b.end_date || b.date
      const aIsMultiDay = aEnd > a.date
      const bIsMultiDay = bEnd > b.date
      if (aIsMultiDay && !bIsMultiDay) return -1
      if (!aIsMultiDay && bIsMultiDay) return 1
      return 0
    })
  })()

  const handleAllDayEventClick = (eventId: string) => {
    setScrollToTop(true)
    setSelectedEvent(eventId)
  }

  // Format multi-day event date range (e.g., "Mar 20-22" or "Mar 30 - Apr 1")
  const formatDateRange = (startDate: string, endDate: string): string => {
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const startDay = start.getDate()
    const endDay = end.getDate()
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60) % 24
    const mins = minutes % 60
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
  }

  const prevDateRef = useRef<string | null>(null)
  const [expandedAllDayDate, setExpandedAllDayDate] = useState<string | null>(null)
  const showAllAllDay = !!selectedDateKey && expandedAllDayDate === selectedDateKey

  useEffect(() => {
    if (!selectedDate || !scrollRef.current) return

    const currentDateStr = selectedDate.toDateString()
    
    if (prevDateRef.current === currentDateStr) return
    prevDateRef.current = currentDateStr

    const isToday = currentDateStr === new Date().toDateString()
    if (!isToday) return

    const now = new Date()
    const totalMinutes = now.getHours() * 60 + now.getMinutes()
    const scrollPosition = TOP_DEAD_ZONE + totalMinutes * (hourHeight / 60) - 200

    scrollRef.current.scrollTop = Math.max(0, scrollPosition)
  }, [selectedDate])

  useEffect(() => {
    if (!scrollToEventId || !scrollRef.current) return
    const event = getEventById(scrollToEventId)
    if (!event) return
    const scrollPosition = TOP_DEAD_ZONE + event.start_time * (hourHeight / 60) - 100
    scrollRef.current.scrollTop = Math.max(0, scrollPosition)
    setScrollToEventId(null)
  }, [scrollToEventId, getEventById, setScrollToEventId])

  useEffect(() => {
    if (!scrollToTop || !scrollRef.current) return
    scrollRef.current.scrollTop = 0
    setScrollToTop(false)
  }, [scrollToTop, setScrollToTop])

  // Memoize hour grid arrays to prevent recreation on every render
  const hourSlots = useMemo(() => 
    Array.from({ length: 24 }, (_, i) => i),
  [])

  const gridLines = useMemo(() => 
    Array.from({ length: 23 }, (_, i) => i),
  [])

  const displayDate = useMemo(() => {
    const yearNum = year ? parseInt(year, 10) : NaN
    const monthNum = month ? parseInt(month, 10) - 1 : NaN
    const dayNum = day ? parseInt(day, 10) : NaN
    const routeDate = new Date(yearNum, monthNum, dayNum)
    const isValidRouteDate =
      !Number.isNaN(yearNum) &&
      !Number.isNaN(monthNum) &&
      !Number.isNaN(dayNum) &&
      routeDate.getFullYear() === yearNum &&
      routeDate.getMonth() === monthNum &&
      routeDate.getDate() === dayNum

    const sourceDate = isValidRouteDate ? routeDate : selectedDate
    if (!sourceDate) return null
    return {
      monthName: sourceDate.toLocaleString("en-US", { month: "short" }),
      day: sourceDate.getDate(),
      year: sourceDate.getFullYear(),
      dayName: sourceDate.toLocaleDateString("en-US", { weekday: "long" }),
    }
  }, [day, month, selectedDate, year])

  return (
    <div className="h-full w-full bg-[#f3f3f2] flex items-center justify-center overflow-hidden select-none">
      {/* APP WINDOW */}
      <div className="h-[100%] w-[100%] rounded-l-2xl bg-[#ececeb] shadow-xl flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="px-9 pt-32 pb-3 border-b border-white/20 shrink-0">
          <h1 className="text-6xl pb-7 font-semibold text-neutral-800 tracking-tight">
            <span className="text-black">
              {displayDate?.monthName} {displayDate?.day},
            </span>
            <span className="text-neutral-400 font-normal"> {displayDate?.year}</span>
          </h1>
          <p className="mt-2 text-3xl text-neutral-700">{displayDate?.dayName}</p>
        </div>


{/* SCROLL AREA */}
<div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar">




  <div className="bg-[#e2e2e1] px-4 relative">


        {/* ALL-DAY EVENTS ROW */}
        {allDayEvents.length > 0 && (() => {
          const visibleEvents = showAllAllDay ? allDayEvents : allDayEvents.slice(0, 2)
          return (
          <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 bg-[#e2e2e1]/95 backdrop-blur supports-[backdrop-filter]:bg-[#e2e2e1]/80">
          <div className="shrink-0 text-white rounded-l-2xl flex flex-col gap-0.2 py-1">
            {visibleEvents.map((event, index) => {
              const endDate = event.end_date || event.date
              const isMultiDay = isMultiDayEvent(event)
              const isTimedMultiDay = isTimedMultiDayEvent(event)
              const currentDate = selectedDateKey
              const continuesFromPreviousDay = !!(isMultiDay && currentDate && currentDate > event.date)
              const continuesIntoNextDay = !!(isMultiDay && currentDate && currentDate < endDate)

              const showArrow = allDayEvents.length > 2 && index === visibleEvents.length - 1
              const isSelected = selectedEventId === event.id
              const resolvedGoalColor = resolveGoalColorForEvent(goalsStore, event)
              const resolvedGoalIcon = resolveGoalIconForEvent(goalsStore, event)
              const eventColor = event.goalColor || resolvedGoalColor || event.color
              const eventGoalIcon = event.goalIcon || resolvedGoalIcon
              const { backgroundColor, mutedBackgroundColor, textColor, accentColor } = getEventVisualColors(eventColor)
              const goalIconEntry = eventGoalIcon ? getGoalIcon(eventGoalIcon) : null
              const GoalIcon = goalIconEntry?.icon

              return (
                <div key={event.id} className="flex items-center">
                  <div className="w-[70px] shrink-0 flex items-center justify-center">
                    {showArrow && (
                      <button
                        onClick={() => setExpandedAllDayDate(showAllAllDay ? null : selectedDateKey)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
                      >
                        <svg className={`w-4 h-4 text-black transition-transform ${showAllAllDay ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div
                    onClick={() => handleAllDayEventClick(event.id)}
                    className={`relative flex-1 px-3 py-2 text-s font-medium cursor-pointer truncate flex items-center gap-2 box-border transition-shadow duration-200 ${
                      isSelected ? 'z-[9999] border-2 border-white shadow-2xl rounded-xl' : 'border border-[#cfcfcb]'
                    } ${
                      isSelected
                        ? ''
                        : continuesFromPreviousDay && continuesIntoNextDay
                          ? 'rounded-none'
                          : continuesFromPreviousDay
                            ? 'rounded-r-xl rounded-l-none'
                            : continuesIntoNextDay
                              ? 'rounded-l-xl rounded-r-none'
                              : 'rounded-xl'
                    }`}
                    style={{
                      backgroundColor: isSelected ? backgroundColor : mutedBackgroundColor,
                      color: textColor,
                      clipPath: isSelected
                        ? 'none'
                        : continuesFromPreviousDay && continuesIntoNextDay
                          ? 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)'
                          : continuesFromPreviousDay
                            ? 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)'
                            : continuesIntoNextDay
                              ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
                              : undefined,
                      borderRadius: isSelected ? '20px' : undefined,
                    }}
                  >
                    {isTimedMultiDay ? (
                      <span
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ backgroundColor: "rgba(255,255,255,0.5)", color: accentColor }}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l2.5 2.5m6-2.5a8.5 8.5 0 11-17 0 8.5 8.5 0 0117 0z" />
                        </svg>
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </span>
                    ) : null}
                    {GoalIcon ? <GoalIcon className="w-4 h-4 shrink-0" /> : null}
                    <span className="truncate">{event.title}{isMultiDay ? "," : ""}</span>
                    {isMultiDay && (
                      <span className="text-s opacity-70 shrink-0">{formatDateRange(event.date, endDate)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
          )
        })()}


    <TimeLine />

    <div className="pb-17 flex relative">
      
      {/* ⏰ LEFT COLUMN — TIME */}
      <div className="w-[72px] shrink-0">
        {hourSlots.map((hour) => (
          <div
            key={hour}
            className="flex items-center justify-end pr-3 "
            style={{ height: `${hourHeight}px` }}
          >
            <span className="text-black text-xl font-space-mono">
              {hour.toString().padStart(2, "0")}
              <span className="text-gray-600 text-lg">:00</span>
            </span>
          </div>
        ))}
      </div>

      {/* 📅 RIGHT COLUMN — GRID + EVENTS */}
<div className="flex-1 relative">
  {/* FIRST LINE (00:00) */}
  <div className="h-[1px] bg-[#cfcfcb] mt-12" />

  {/* Remaining hour lines */}
  {gridLines.map((i) => (
    <div
      key={i}
      className="h-[1px] bg-[#cfcfcb]"
      style={{ marginTop: `${hourHeight - 1}px` }}
    />
  ))}

  <TimeView />

    <div className="h-[10px] w-full" />
</div>
    </div>
  </div>
</div>
      </div>
    </div>
  )
}

export default DayView
