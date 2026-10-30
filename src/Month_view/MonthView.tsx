import { useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent, MouseEvent } from "react"
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { useNavigate, useParams } from "react-router-dom"
import { useTimeStore } from "@/store/timeStore"
import { useEventsStore, formatDate, getEventsForDatesSnapshot } from "@/store/eventsStore"
import type { CalendarEvent } from "@/store/eventsStore"
import { resolveGoalColorForEvent, useGoalsStore } from "@/store/goalsStore"
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from "@/store/recurringUtils"
import { getEventVisualColors, isAllDayEvent, isMultiDayEvent, isTimedMultiDayEvent } from "@/lib/eventUtils"
import {
  compareMonthEventsWithPinnedPriority,
  DATE_ROW_HEIGHT,
  formatClock,
  getDateAtStartOfDay,
  getDateFromSpanningClick,
  getEventLabel,
  getMonthCellTone,
  getTimedEventPieces,
  MAX_VISIBLE_EVENTS,
  MONTH_EVENT_CHIP_HEIGHT,
  MONTH_EVENT_ROW_GAP,
  MONTH_EVENT_ROW_HEIGHT,
  MULTI_DAY_ITEM_HEIGHT,
  MULTI_DAY_LANE_PITCH,
  MULTI_DAY_ROW_BOTTOM_GAP,
  MULTI_DAY_ROW_TOP_OFFSET,
  MULTI_DAY_VISIBLE_LANES,
  NORMAL_EVENT_TOP_OFFSET,
  prioritizeSelectedEvent,
  WEEKDAY_LABELS,
  withMiddayTime,
} from "./monthView.utils"

type WeekSpanItem = {
  event: CalendarEvent
  lane: number
  startIdx: number
  spanDays: number
  visibleStartKey: string
  isPinnedPriority?: boolean
}

type DraggedMonthEvent = {
  eventId: string
  sourceDateKey: string
}

const MonthView = () => {
  const navigate = useNavigate()
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const setDate = useTimeStore((state) => state.setDate)
  const getEventById = useEventsStore((state) => state.getEventById)
  const addEventLocal = useEventsStore((state) => state.addEventLocal)
  const deleteEvent = useEventsStore((state) => state.deleteEvent)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  const updateAllInSeries = useEventsStore((state) => state.updateAllInSeries)
  const updateEvent = useEventsStore((state) => state.updateEvent)
  const splitRecurringEvent = useEventsStore((state) => state.splitRecurringEvent)
  const updateThisAndFollowing = useEventsStore((state) => state.updateThisAndFollowing)
  const goalsStore = useGoalsStore((state) => state.store)
  const [draggedEvent, setDraggedEvent] = useState<DraggedMonthEvent | null>(null)
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null)
  const [eventListCapacityByDateKey, setEventListCapacityByDateKey] = useState<Record<string, number>>({})
  const suppressNextCellClickRef = useRef(false)
  const eventsCache = useEventsStore((state) => state.eventsCache)
  const recurringEventsCache = useEventsStore((state) => state.recurringEventsCache)
  const eventExceptionsCache = useEventsStore((state) => state.eventExceptionsCache)

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
    return isValidRouteDate ? routeDate : selectedDate || new Date()
  }, [day, month, selectedDate, year])

  const today = new Date()
  const monthStart = useMemo(() => startOfMonth(displayDate), [displayDate])
  const monthEnd = useMemo(() => endOfMonth(displayDate), [displayDate])
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart])
  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)),
    [gridStart]
  )
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => monthDays.slice(index * 7, index * 7 + 7)),
    [monthDays]
  )
  const visibleWeeks = useMemo(() => {
    const lastWeek = weeks[weeks.length - 1]
    if (!lastWeek) return weeks
    const isOnlyNextMonthDays = lastWeek.every(
      (date) => !isSameMonth(date, displayDate) && date > monthEnd
    )
    return isOnlyNextMonthDays ? weeks.slice(0, -1) : weeks
  }, [displayDate, monthEnd, weeks])

  const monthEventsByDateKey = useMemo(() => {
    return getEventsForDatesSnapshot(monthDays, eventsCache, recurringEventsCache, eventExceptionsCache)
  }, [eventExceptionsCache, eventsCache, monthDays, recurringEventsCache])

  const pinnedDraftEventId = useMemo(() => {
    if (!selectedEventId) return null
    const selectedEvent = getEventById(selectedEventId)
    if (!selectedEvent?.isTemp) return null
    return selectedEvent.id
  }, [getEventById, selectedEventId])

  const pinnedDraftEvent = useMemo(() => {
    if (!pinnedDraftEventId) return null
    return getEventById(pinnedDraftEventId)
  }, [getEventById, pinnedDraftEventId])

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    for (const events of Object.values(monthEventsByDateKey)) {
      const snapshotEvent = events.find((event) => event.id === selectedEventId)
      if (snapshotEvent) return snapshotEvent
    }
    return getEventById(selectedEventId)
  }, [getEventById, monthEventsByDateKey, selectedEventId])

  const pinnedSelectedEvent = useMemo(() => {
    if (!selectedEvent || selectedEvent.id === pinnedDraftEventId) return null
    return selectedEvent
  }, [pinnedDraftEventId, selectedEvent])

  const discardUntouchedTempSelection = () => {
    const { selectedEventId: currentSelectedEventId, getEventById: getLatestEventById } = useEventsStore.getState()
    if (!currentSelectedEventId) return

    const currentSelectedEvent = getLatestEventById(currentSelectedEventId)
    const isUntouchedTemp =
      currentSelectedEvent &&
      currentSelectedEvent.isTemp === true &&
      currentSelectedEvent.created_at === currentSelectedEvent.updated_at &&
      (currentSelectedEvent.title === "New Event" || !currentSelectedEvent.title?.trim())

    if (!isUntouchedTemp) return

    void deleteEvent(currentSelectedEventId)
    setSelectedEvent(null)
  }

  const weekLayouts = useMemo(() => {
    return visibleWeeks.map((week) => {
      const weekDateKeys = week.map((date) => formatDate(date))
      const firstWeekKey = weekDateKeys[0]
      const lastWeekKey = weekDateKeys[weekDateKeys.length - 1]
      const pinnedDraftVisibleInWeek =
        pinnedDraftEvent &&
        isMultiDayEvent(pinnedDraftEvent) &&
        pinnedDraftEvent.date >= firstWeekKey &&
        pinnedDraftEvent.date <= lastWeekKey
          ? pinnedDraftEvent
          : null
      const pinnedSelectedVisibleInWeek =
        pinnedSelectedEvent &&
        isMultiDayEvent(pinnedSelectedEvent) &&
        (pinnedSelectedEvent.end_date || pinnedSelectedEvent.date) >= firstWeekKey &&
        pinnedSelectedEvent.date <= lastWeekKey
          ? pinnedSelectedEvent
          : null
      const pinnedPriorityEvent = pinnedSelectedVisibleInWeek ?? pinnedDraftVisibleInWeek
      const pinnedSingleDayEventInWeek =
        ((pinnedSelectedEvent &&
          !isMultiDayEvent(pinnedSelectedEvent) &&
          pinnedSelectedEvent.date >= firstWeekKey &&
          pinnedSelectedEvent.date <= lastWeekKey &&
          pinnedSelectedEvent) ||
          (pinnedDraftEvent &&
            !isMultiDayEvent(pinnedDraftEvent) &&
            pinnedDraftEvent.date >= firstWeekKey &&
            pinnedDraftEvent.date <= lastWeekKey &&
            pinnedDraftEvent)) ??
        null
      const selectedSingleDayIndex = pinnedSingleDayEventInWeek
        ? weekDateKeys.indexOf(pinnedSingleDayEventInWeek.date)
        : -1
      const weekDayIndexByKey: Record<string, number> = {}
      weekDateKeys.forEach((key, index) => {
        weekDayIndexByKey[key] = index
      })

      const seen = new Set<string>()
      const items: Array<{ event: CalendarEvent; startIdx: number; endIdx: number; visibleStartKey: string }> = []

      week.forEach((date) => {
        const events = monthEventsByDateKey[formatDate(date)] || []
        events.forEach((event) => {
          if (pinnedPriorityEvent && event.id === pinnedPriorityEvent.id) return
          if (!isMultiDayEvent(event)) return
          const eventStartKey = event.date
          const eventEndKey = event.end_date || event.date
          if (eventEndKey < firstWeekKey || eventStartKey > lastWeekKey) return
          if (seen.has(event.id)) return
          seen.add(event.id)
          const visibleStartKey = eventStartKey < firstWeekKey ? firstWeekKey : eventStartKey
          const visibleEndKey = eventEndKey > lastWeekKey ? lastWeekKey : eventEndKey
          const startIdx = weekDayIndexByKey[visibleStartKey]
          const endIdx = weekDayIndexByKey[visibleEndKey]
          items.push({ event, startIdx, endIdx, visibleStartKey })
        })
      })

      items.sort((a, b) => {
        const priorityDiff = compareMonthEventsWithPinnedPriority(a.event, b.event, pinnedPriorityEvent?.id ?? null)
        if (priorityDiff !== 0) return priorityDiff
        if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx
        const aSpan = a.endIdx - a.startIdx
        const bSpan = b.endIdx - b.startIdx
        if (aSpan !== bSpan) return bSpan - aSpan
        return a.event.start_time - b.event.start_time
      })

      const pinnedSingleDayIndex =
        selectedSingleDayIndex >= 0 &&
        items.some((item) => item.startIdx <= selectedSingleDayIndex && item.endIdx >= selectedSingleDayIndex)
          ? selectedSingleDayIndex
          : -1

      const laneOccupancy: boolean[][] = []
      if (pinnedSingleDayIndex >= 0) {
        laneOccupancy[0] = Array.from({ length: 7 }, (_, dayIndex) => dayIndex === pinnedSingleDayIndex)
      }
      if (pinnedPriorityEvent && isMultiDayEvent(pinnedPriorityEvent)) {
        const pinnedStartKey = pinnedPriorityEvent.date < firstWeekKey ? firstWeekKey : pinnedPriorityEvent.date
        const pinnedEndKey =
          (pinnedPriorityEvent.end_date || pinnedPriorityEvent.date) > lastWeekKey
            ? lastWeekKey
            : pinnedPriorityEvent.end_date || pinnedPriorityEvent.date
        const pinnedStartIdx = weekDayIndexByKey[pinnedStartKey]
        const pinnedEndIdx = weekDayIndexByKey[pinnedEndKey]
        if (!laneOccupancy[0]) laneOccupancy[0] = Array(7).fill(false)
        for (let dayIndex = pinnedStartIdx; dayIndex <= pinnedEndIdx; dayIndex += 1) {
          laneOccupancy[0][dayIndex] = true
        }
      }
      const positionedItems: WeekSpanItem[] = items.map((item) => {
        let lane = 0
        while (lane < laneOccupancy.length) {
          const occupiedDays = laneOccupancy[lane]
          const collides = occupiedDays ? occupiedDays.slice(item.startIdx, item.endIdx + 1).some(Boolean) : false
          if (!collides) break
          lane += 1
        }
        if (!laneOccupancy[lane]) laneOccupancy[lane] = Array(7).fill(false)
        for (let dayIndex = item.startIdx; dayIndex <= item.endIdx; dayIndex += 1) {
          laneOccupancy[lane][dayIndex] = true
        }
        return {
          event: item.event,
          lane,
          startIdx: item.startIdx,
          spanDays: item.endIdx - item.startIdx + 1,
          visibleStartKey: item.visibleStartKey,
        }
      })

      const allPositionedItems = pinnedPriorityEvent
        ? [
            {
              event: pinnedPriorityEvent,
              lane: 0,
              startIdx:
                weekDayIndexByKey[pinnedPriorityEvent.date < firstWeekKey ? firstWeekKey : pinnedPriorityEvent.date],
              spanDays:
                differenceInCalendarDays(
                  getDateAtStartOfDay(
                    (pinnedPriorityEvent.end_date || pinnedPriorityEvent.date) > lastWeekKey
                      ? lastWeekKey
                      : pinnedPriorityEvent.end_date || pinnedPriorityEvent.date
                  ),
                  getDateAtStartOfDay(pinnedPriorityEvent.date < firstWeekKey ? firstWeekKey : pinnedPriorityEvent.date)
                ) + 1,
              visibleStartKey:
                pinnedPriorityEvent.date < firstWeekKey ? firstWeekKey : pinnedPriorityEvent.date,
              isPinnedPriority: true,
            } satisfies WeekSpanItem,
            ...positionedItems,
          ]
        : positionedItems

      const visibleLaneLimit = MULTI_DAY_VISIBLE_LANES + (pinnedPriorityEvent ? 1 : 0)
      const visibleItems = allPositionedItems.filter((item) => item.lane < visibleLaneLimit)
      const hiddenCount = Math.max(0, allPositionedItems.length - visibleItems.length)
      const highestVisibleLane = visibleItems.reduce((maxLane, item) => Math.max(maxLane, item.lane), -1)
      const visibleLaneCount = highestVisibleLane + 1
      const visibleMultiDayCountByDay = Array.from({ length: 7 }, (_, dayIndex) =>
        visibleItems.reduce((count, item) => {
          const itemEndIdx = item.startIdx + item.spanDays - 1
          if (dayIndex < item.startIdx || dayIndex > itemEndIdx) return count
          return count + 1
        }, 0)
      )
      const totalMultiDayCountByDay = Array.from({ length: 7 }, (_, dayIndex) =>
        allPositionedItems.reduce((count, item) => {
          const itemEndIdx = item.startIdx + item.spanDays - 1
          if (dayIndex < item.startIdx || dayIndex > itemEndIdx) return count
          return count + 1
        }, 0)
      )
      const multiDayHeightByDay = Array.from({ length: 7 }, (_, dayIndex) => {
        const highestLaneForDay = visibleItems.reduce((maxLane, item) => {
          const itemEndIdx = item.startIdx + item.spanDays - 1
          if (dayIndex < item.startIdx || dayIndex > itemEndIdx) return maxLane
          return Math.max(maxLane, item.lane)
        }, -1)
        if (highestLaneForDay < 0) return 0
        return highestLaneForDay * MULTI_DAY_LANE_PITCH + MULTI_DAY_ITEM_HEIGHT + MULTI_DAY_ROW_BOTTOM_GAP
      })
      const rowHeight =
        visibleItems.length > 0
          ? Math.max(MULTI_DAY_ITEM_HEIGHT, (visibleLaneCount - 1) * MULTI_DAY_LANE_PITCH + MULTI_DAY_ITEM_HEIGHT)
          : 0

      return {
        multiDayItems: visibleItems,
        multiDayRowHeight: rowHeight,
        multiDayHeightByDay,
        visibleMultiDayCountByDay,
        totalMultiDayCountByDay,
        hiddenMultiDayCount: hiddenCount,
      }
    })
  }, [monthEventsByDateKey, pinnedDraftEvent, pinnedDraftEventId, pinnedSelectedEvent, visibleWeeks])

  const openMonthDate = (date: Date) => {
    discardUntouchedTempSelection()
    setDate(withMiddayTime(date))
    setSelectedEvent(null)
    navigate(`/month/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`)
  }

  const openMonthDateKeepingSelection = (date: Date) => {
    discardUntouchedTempSelection()
    setDate(withMiddayTime(date))
    navigate(`/month/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`)
  }

  const openDayView = (date: Date) => {
    discardUntouchedTempSelection()
    setDate(withMiddayTime(date))
    navigate(`/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`)
  }

  const createEventForDate = (date: Date) => {
    const dateKey = formatDate(date)
    const now = new Date()
    const isToday = isSameDay(date, now)
    const startHour = isToday ? Math.min(now.getHours() + 1, 22) : 9
    const startMinutes = startHour * 60
    const endMinutes = startMinutes + 60
    setDate(withMiddayTime(date))
    const newEvent = addEventLocal({
      title: "New Event",
      date: dateKey,
      end_date: dateKey,
      start_time: startMinutes,
      end_time: endMinutes,
    })
    setSelectedEvent(newEvent.id)
  }

  const resetDragState = () => {
    setDraggedEvent(null)
    setDragOverDateKey(null)
  }

  const moveEventToDate = async (event: CalendarEvent, targetDateKey: string) => {
    const durationDays = Math.max(
      0,
      differenceInCalendarDays(getDateAtStartOfDay(event.end_date || event.date), getDateAtStartOfDay(event.date))
    )
    const commit = {
      date: targetDateKey,
      end_date: formatDate(addDays(getDateAtStartOfDay(targetDateKey), durationDays)),
      start_time: event.start_time,
      end_time: event.end_time,
    }
    const isRecurringSourceEvent = isSeriesActuallyRecurring(event) || !!event.seriesMasterId
    if (isRecurringSourceEvent) {
      if (isSeriesAnchorEvent(event)) {
        const seriesMasterId = event.seriesMasterId || event.id
        await updateAllInSeries(seriesMasterId, commit)
        return
      }
      const occurrenceDate = event.occurrenceDate || event.date
      showRecurringDialog(event, "edit", async (choice: string) => {
        if (choice === "cancel") {
          closeRecurringDialog()
          return
        }
        if (choice === "only-this") {
          await splitRecurringEvent(event, occurrenceDate, commit.start_time, commit.end_time, commit)
        } else if (choice === "all-events") {
          const seriesMasterId = event.seriesMasterId || event.id
          await updateAllInSeries(seriesMasterId, commit)
        } else if (choice === "this-and-following") {
          await updateThisAndFollowing(event, occurrenceDate, commit.start_time, commit.end_time, commit)
        }
        closeRecurringDialog()
      })
      return
    }
    await updateEvent(event.id, commit)
  }

  const handleEventDragStart = (dragEvent: DragEvent, event: CalendarEvent, sourceDateKey: string) => {
    dragEvent.stopPropagation()
    dragEvent.dataTransfer.effectAllowed = "move"
    dragEvent.dataTransfer.setData("text/plain", event.id)
    setDraggedEvent({ eventId: event.id, sourceDateKey })
  }

  const handleCellDragOver = (dragEvent: DragEvent, dateKey: string) => {
    if (!draggedEvent) return
    dragEvent.preventDefault()
    dragEvent.dataTransfer.dropEffect = "move"
    if (dragOverDateKey !== dateKey) setDragOverDateKey(dateKey)
  }

  const handleCellDrop = async (dragEvent: DragEvent, cellDate: Date) => {
    if (!draggedEvent) return
    dragEvent.preventDefault()
    dragEvent.stopPropagation()
    suppressNextCellClickRef.current = true
    const targetDateKey = formatDate(cellDate)
    const eventToMove = getEventById(draggedEvent.eventId)
    resetDragState()
    if (!eventToMove || draggedEvent.sourceDateKey === targetDateKey) return
    setDate(withMiddayTime(cellDate))
    setSelectedEvent(null)
    await moveEventToDate(eventToMove, targetDateKey)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selectedEventId) return
      const selectedEvent = getEventById(selectedEventId)
      if (!selectedEvent) return
      if (selectedEvent.title === "New Event") {
        void deleteEvent(selectedEvent.id)
        setSelectedEvent(null)
        return
      }
      const isRecurringDeleteTarget = !!(
        isSeriesActuallyRecurring(selectedEvent) || (selectedEvent as any).seriesMasterId
      )
      if (isRecurringDeleteTarget) {
        const occurrenceDate = (selectedEvent as any).occurrenceDate || selectedEvent.date
        if (isSeriesAnchorEvent(selectedEvent as any)) {
          const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
          void deleteEvent(seriesMasterId)
          setSelectedEvent(null)
          return
        }
        showRecurringDialog(selectedEvent as any, "delete", async (choice: string) => {
          if (choice === "cancel") {
            closeRecurringDialog()
            return
          }
          if (choice === "only-this") {
            const deleteSingleOccurrence = useEventsStore.getState().deleteSingleOccurrence
            await deleteSingleOccurrence(selectedEvent as any, occurrenceDate)
          } else if (choice === "all-events") {
            const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
            await deleteEvent(seriesMasterId)
          } else if (choice === "this-and-following") {
            const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
            const previousDay = (() => {
              const d = new Date(`${occurrenceDate}T00:00:00`)
              d.setDate(d.getDate() - 1)
              return formatDate(d)
            })()
            await updateAllInSeries(seriesMasterId, { series_end_date: previousDay })
          }
          setSelectedEvent(null)
          closeRecurringDialog()
        })
        return
      }
      void deleteEvent(selectedEvent.id)
      setSelectedEvent(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [closeRecurringDialog, deleteEvent, getEventById, selectedEventId, setSelectedEvent, showRecurringDialog, updateAllInSeries])

  useEffect(() => {
    const clearDragState = () => resetDragState()
    window.addEventListener("dragend", clearDragState)
    return () => window.removeEventListener("dragend", clearDragState)
  }, [])

  useEffect(() => {
    const measure = () => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("[data-month-event-list][data-date-key]")
      )
      const nextCapacities: Record<string, number> = {}
      elements.forEach((element) => {
        const dateKey = element.dataset.dateKey
        if (!dateKey) return
        const height = element.clientHeight
        const perRow = MONTH_EVENT_ROW_HEIGHT + MONTH_EVENT_ROW_GAP
        const capacity = Math.max(0, Math.floor((height + MONTH_EVENT_ROW_GAP) / perRow))
        nextCapacities[dateKey] = capacity
      })
      setEventListCapacityByDateKey((prev) => {
        const prevKeys = Object.keys(prev)
        const nextKeys = Object.keys(nextCapacities)
        if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === nextCapacities[k])) {
          return prev
        }
        return nextCapacities
      })
    }

    const raf = requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", measure)
    }
  }, [visibleWeeks, weekLayouts, monthEventsByDateKey, selectedEventId, pinnedDraftEventId])

  return (
    <div className="h-full w-full bg-[#f3f3f2] flex items-center justify-center overflow-hidden select-none">
      <div className="h-[100%] w-[100%] rounded-l-2xl bg-[radial-gradient(circle_at_18%_0%,#ffffff_0%,#ececeb_34%,#dfdfdc_100%)] shadow-xl flex flex-col overflow-hidden text-neutral-900 antialiased" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, system-ui, sans-serif' }}>
      {/* Title bar */}
      <div className="px-9 pt-32 pb-5 shrink-0">
        <h1 className="text-6xl pb-0 font-semibold text-neutral-800 tracking-tight">
          <span className="text-black">
            {format(displayDate, "MMMM")},
          </span>
          <span className="text-neutral-400 font-normal">
            {" "}
            {format(displayDate, "yyyy")}
          </span>
        </h1>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 overflow-hidden rounded-t-[28px] border border-black/80 bg-[linear-gradient(180deg,#252421_0%,#10100f_100%)] shadow-[0_14px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.06)]">
        {WEEKDAY_LABELS.map((label, index) => {
          const isWeekend = index === 0 || index === 6
          return (
            <div
              key={label}
              className="flex items-center justify-center border-r border-white/10 py-3.5 text-center last:border-r-0"
            >
              <div className={`text-[13px] font-bold uppercase tracking-[0.18em] ${isWeekend ? "text-white/45" : "text-white/85"}`}>
                {label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Calendar grid */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-b-[28px] border-x border-b border-[#c9c6bd] bg-[#c9c6bd] shadow-[0_18px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ gap: 1 }}>
        {visibleWeeks.map((week, weekIndex) => {
          const weekLayout = weekLayouts[weekIndex]
          const isLastWeek = weekIndex === visibleWeeks.length - 1

          return (
            <div
              key={`month-week-row-${weekIndex}`}
              className={`relative flex-1 min-h-0 ${isLastWeek ? "overflow-hidden rounded-b-[28px]" : ""}`}
            >
              <div className={`grid h-full grid-cols-7 ${isLastWeek ? "overflow-hidden rounded-b-[28px]" : ""}`} style={{ gap: 1 }}>
                {week.map((cellDate, dayIndex) => {
                  const dateKey = formatDate(cellDate)
                  const inCurrentMonth = isSameMonth(cellDate, displayDate)
                  const isTodayCell = isSameDay(cellDate, today)
                  const isSelected = selectedDate ? isSameDay(cellDate, selectedDate) : false
                  const isWeekend = dayIndex === 0 || dayIndex === 6
                  const visibleMultiDayCount = weekLayout.visibleMultiDayCountByDay?.[dayIndex] || 0
                  const hiddenMultiDayCountForDay = Math.max(
                    0,
                    (weekLayout.totalMultiDayCountByDay?.[dayIndex] || 0) - visibleMultiDayCount
                  )
                  const hasMultiDayOverlapOnDay = (weekLayout.totalMultiDayCountByDay?.[dayIndex] || 0) > 0
                  const selectedSingleDayEventPinnedInTopRow =
                    ((pinnedSelectedEvent &&
                      !isMultiDayEvent(pinnedSelectedEvent) &&
                      pinnedSelectedEvent.date === dateKey &&
                      hasMultiDayOverlapOnDay &&
                      pinnedSelectedEvent) ||
                      (pinnedDraftEvent &&
                        !isMultiDayEvent(pinnedDraftEvent) &&
                        pinnedDraftEvent.date === dateKey &&
                        hasMultiDayOverlapOnDay &&
                        pinnedDraftEvent)) ??
                    null
                  const dayEvents = (monthEventsByDateKey[dateKey] || []).filter((event) => {
                    if (isMultiDayEvent(event)) return false
                    if (selectedSingleDayEventPinnedInTopRow && event.id === selectedSingleDayEventPinnedInTopRow.id) {
                      return false
                    }
                    return true
                  })
                  const orderedDayEvents = prioritizeSelectedEvent(dayEvents, selectedEventId)
                  const fallbackSlots = MAX_VISIBLE_EVENTS
                  const dynamicEventSlots = eventListCapacityByDateKey[dateKey] ?? fallbackSlots
                  const totalListItems = hiddenMultiDayCountForDay + orderedDayEvents.length
                  const hasOverflow = totalListItems > dynamicEventSlots
                  const canShowMoreRow = hasOverflow && dynamicEventSlots >= 2
                  const visibleEventLimit = Math.max(
                    0,
                    canShowMoreRow
                      ? dynamicEventSlots - 1
                      : Math.min(dynamicEventSlots, orderedDayEvents.length)
                  )
                  const visibleEvents = orderedDayEvents.slice(0, visibleEventLimit)
                  const hiddenCount = Math.max(0, hiddenMultiDayCountForDay + orderedDayEvents.length - visibleEvents.length)
                  const hasOnlyNormalEvents =
                    orderedDayEvents.length > 0 &&
                    hiddenMultiDayCountForDay === 0 &&
                    !hasMultiDayOverlapOnDay
                  const normalEventTopOffset = hasOnlyNormalEvents ? NORMAL_EVENT_TOP_OFFSET : 0

                  return (
                    <div
                      key={dateKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (suppressNextCellClickRef.current) {
                          suppressNextCellClickRef.current = false
                          return
                        }
                        openMonthDate(cellDate)
                      }}
                      onDoubleClick={() => openDayView(cellDate)}
                      onDragOver={(event) => handleCellDragOver(event, dateKey)}
                      onDragEnter={(event) => handleCellDragOver(event, dateKey)}
                      onDragLeave={() => {
                        if (dragOverDateKey === dateKey) setDragOverDateKey(null)
                      }}
                      onDrop={(event) => {
                        void handleCellDrop(event, cellDate)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openMonthDateKeepingSelection(cellDate)
                        }
                      }}
                      className={`group relative flex min-h-0 flex-col px-2.5 pb-[2px] text-left outline-none transition-[background,box-shadow,transform] duration-150 ${getMonthCellTone(
                        inCurrentMonth,
                        isSelected,
                        isTodayCell
                      )} ${isLastWeek && dayIndex === 0 ? "rounded-bl-[28px]" : ""} ${
                        isLastWeek && dayIndex === 6 ? "rounded-br-[28px]" : ""
                      } ${isSelected ? "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : "hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),inset_0_18px_40px_rgba(255,255,255,0.28)]"} ${
                        draggedEvent && dragOverDateKey === dateKey
                          ? "ring-[2px] ring-black/70 ring-inset bg-[#f7f4ec]"
                          : ""
                      }`}
                      style={{
                        paddingTop:
                          DATE_ROW_HEIGHT +
                          ((weekLayout.multiDayHeightByDay?.[dayIndex] || 0) > 0
                            ? MULTI_DAY_ROW_TOP_OFFSET + (weekLayout.multiDayHeightByDay?.[dayIndex] || 0)
                            : 0) +
                          normalEventTopOffset,
                      }}
                    >
                      {/* Date header row */}
                      <div className="absolute left-2 right-2 top-1.5 flex items-center justify-between">
                        <div className="flex items-baseline gap-1.5">
                          {isSelected ? (
                            <div className="flex h-7 min-w-7 items-center justify-center rounded-full border border-black bg-white px-1.5 text-[13px] font-bold text-black shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
                              {cellDate.getDate()}
                            </div>
                          ) : isTodayCell ? (
                            <div className="flex h-7 min-w-7 items-center justify-center rounded-full bg-black px-1.5 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
                              {cellDate.getDate()}
                            </div>
                          ) : (
                            <span
                              className={`text-[13px] font-semibold tabular-nums ${
                                inCurrentMonth
                                  ? isWeekend
                                    ? "text-neutral-500"
                                    : "text-neutral-900"
                                  : "text-neutral-400"
                              }`}
                            >
                              {cellDate.getDate()}
                            </span>
                          )}
                          {!inCurrentMonth ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                              {format(cellDate, "MMM")}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            createEventForDate(cellDate)
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] leading-none text-neutral-400 opacity-0 transition-all hover:bg-neutral-900 hover:text-white group-hover:opacity-100 focus:opacity-100"
                          aria-label="Add event"
                        >
                          +
                        </button>
                      </div>

                      {/* Pinned selected single-day event. It overlays the multi-day lane without reserving extra vertical space. */}
                      {selectedSingleDayEventPinnedInTopRow ? (
                        <div
                          draggable
                          onDragStart={(dragEvent) =>
                            handleEventDragStart(dragEvent, selectedSingleDayEventPinnedInTopRow, formatDate(cellDate))
                          }
                          onDragEnd={() => resetDragState()}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            setDate(cellDate)
                            setSelectedEvent(selectedSingleDayEventPinnedInTopRow.id)
                          }}
                          className="absolute left-2 right-2 z-20 flex h-[23px] cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border-2 border-white px-2 text-left text-[15px] font-semibold"
                          style={{
                            top: DATE_ROW_HEIGHT + MULTI_DAY_ROW_TOP_OFFSET,
                            backgroundColor: getEventVisualColors(
                              selectedSingleDayEventPinnedInTopRow.goalColor ||
                                resolveGoalColorForEvent(goalsStore, selectedSingleDayEventPinnedInTopRow) ||
                                selectedSingleDayEventPinnedInTopRow.color
                            ).backgroundColor,
                            color: getEventVisualColors(
                              selectedSingleDayEventPinnedInTopRow.goalColor ||
                                resolveGoalColorForEvent(goalsStore, selectedSingleDayEventPinnedInTopRow) ||
                                selectedSingleDayEventPinnedInTopRow.color
                            ).textColor,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
                          }}
                        >
                          {(() => {
                            const timedPieces = isAllDayEvent(selectedSingleDayEventPinnedInTopRow)
                              ? null
                              : getTimedEventPieces(selectedSingleDayEventPinnedInTopRow)
                            return (
                              <span className="flex-1 truncate">
                                {timedPieces ? (
                                  <>
                                    <span className="font-semibold tabular-nums">{timedPieces.time}</span>
                                    <span className="ml-1.5 font-medium">{timedPieces.title}</span>
                                  </>
                                ) : (
                                  getEventLabel(selectedSingleDayEventPinnedInTopRow)
                                )}
                              </span>
                            )
                          })()}
                        </div>
                      ) : null}

                      <div
                        className="pointer-events-none absolute inset-x-2.5 bottom-[2px]"
                        data-month-event-list
                        data-date-key={dateKey}
                        style={{
                          top:
                            DATE_ROW_HEIGHT +
                            ((weekLayout.multiDayHeightByDay?.[dayIndex] || 0) > 0
                              ? MULTI_DAY_ROW_TOP_OFFSET + (weekLayout.multiDayHeightByDay?.[dayIndex] || 0)
                              : 0) +
                            normalEventTopOffset,
                        }}
                      />

                      {/* Single-day events */}
                      <div className="flex min-h-0 flex-col gap-px overflow-hidden">
                        {visibleEvents.map((event) => {
                          const resolvedColor =
                            event.goalColor || resolveGoalColorForEvent(goalsStore, event) || event.color
                          const { backgroundColor, mutedBackgroundColor, textColor, accentColor } = getEventVisualColors(resolvedColor)
                          const isEventSelected = selectedEventId === event.id
                          const isAllDay = isAllDayEvent(event)
                          const isTimedMultiDay = isTimedMultiDayEvent(event)
                          const isFilledAllDayChip = isAllDay || isTimedMultiDay
                          const timedPieces = !isAllDay && !isTimedMultiDay ? getTimedEventPieces(event) : null
                          const dotColor = accentColor || backgroundColor

                          return (
                            <div
                              key={event.id}
                              draggable
                              onDragStart={(dragEvent) => handleEventDragStart(dragEvent, event, formatDate(cellDate))}
                              onDragEnd={() => resetDragState()}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                setDate(cellDate)
                                setSelectedEvent(event.id)
                              }}
                              className={`flex w-full cursor-pointer items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[15px] transition-all ${
                                isEventSelected
                                  ? "h-[23px] border-2 border-white shadow-[0_8px_18px_rgba(0,0,0,0.16)]"
                                  : isFilledAllDayChip
                                    ? "h-[23px] border border-white/75 shadow-[0_3px_8px_rgba(0,0,0,0.08)]"
                                    : "h-[23px] hover:bg-white/55"
                              }`}
                              style={
                                isEventSelected
                                  ? {
                                      backgroundColor,
                                      color: textColor,
                                      boxShadow: "0 4px 10px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
                                    }
                                  : isFilledAllDayChip
                                    ? {
                                        backgroundColor: mutedBackgroundColor,
                                        color: textColor,
                                      }
                                  : {
                                      backgroundColor: "transparent",
                                      color: "#1c1c1e",
                                    }
                              }
                            >
                              {!isEventSelected && !isFilledAllDayChip && (
                                <span
                                  className="h-[7px] w-[7px] shrink-0 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.75)]"
                                  style={{ backgroundColor: dotColor }}
                                />
                              )}
                              {timedPieces ? (
                                <span className="flex flex-1 items-baseline gap-1 truncate">
                                  <span className={`shrink-0 tabular-nums ${isEventSelected ? "font-semibold" : "font-medium text-neutral-500"}`}>
                                    {timedPieces.time}
                                  </span>
                                  <span className={`truncate ${isEventSelected ? "font-medium" : "font-medium text-neutral-900"}`}>
                                    {timedPieces.title}
                                  </span>
                                </span>
                              ) : (
                                <span className={`flex-1 truncate ${isEventSelected ? "font-medium" : "font-medium"}`}>
                                  {getEventLabel(event)}
                                </span>
                              )}
                            </div>
                          )
                        })}

                        {hiddenCount > 0 && canShowMoreRow ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openDayView(cellDate)
                            }}
                            className="h-[23px] self-start rounded-full bg-white/45 px-2 text-left text-[15px] font-bold leading-[23px] text-neutral-500 shadow-sm transition-colors hover:bg-white hover:text-neutral-900"
                          >
                            {hiddenCount} more
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Multi-day spanning events overlay */}
              {weekLayout.multiDayRowHeight > 0 ? (
                <div
                  className="pointer-events-none absolute inset-x-0"
                  style={{ top: DATE_ROW_HEIGHT + MULTI_DAY_ROW_TOP_OFFSET, height: weekLayout.multiDayRowHeight }}
                >
                  {weekLayout.multiDayItems.map((item) => {
                    const resolvedColor =
                      item.event.goalColor || resolveGoalColorForEvent(goalsStore, item.event) || item.event.color
                    const { backgroundColor, mutedBackgroundColor, textColor } = getEventVisualColors(resolvedColor)
                    const isEventSelected = selectedEventId === item.event.id
                    const left = `calc(${(item.startIdx / 7) * 100}% + 6px)`
                    const width = `calc(${(item.spanDays / 7) * 100}% - 12px)`

                    return (
                      <div
                        key={`${item.event.id}-${item.startIdx}`}
                        draggable
                        onDragStart={(dragEvent) => handleEventDragStart(dragEvent, item.event, item.event.date)}
                        onDragEnd={() => resetDragState()}
                        onClick={(eventClick) => {
                          eventClick.stopPropagation()
                          const clickedDate = getDateFromSpanningClick(eventClick, item.visibleStartKey, item.spanDays)
                          setDate(clickedDate)
                          setSelectedEvent(item.event.id)
                        }}
                        className="pointer-events-auto absolute flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[15px] font-semibold transition-all"
                        style={{
                          top: item.lane * MULTI_DAY_LANE_PITCH,
                          left,
                          width,
                          height: MULTI_DAY_ITEM_HEIGHT,
                          backgroundColor: isEventSelected ? backgroundColor : mutedBackgroundColor,
                          color: textColor,
                          boxShadow: isEventSelected
                            ? "0 8px 20px rgba(0,0,0,0.18), 0 0 0 2px #ffffff"
                            : "0 4px 10px rgba(0,0,0,0.11), inset 0 0 0 1px rgba(255,255,255,0.22)",
                        }}
                      >
                        <span className="truncate">
                          {item.isPinnedPriority
                            ? getEventLabel(item.event)
                            : isTimedMultiDayEvent(item.event)
                            ? getEventLabel(item.event)
                            : item.event.title}
                        </span>
                      </div>
                    )
                  })}

                  {weekLayout.hiddenMultiDayCount > 0 ? (
                    <div className="pointer-events-auto absolute right-2 top-0 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-neutral-500 shadow-sm">
                      +{weekLayout.hiddenMultiDayCount} more
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

export default MonthView
