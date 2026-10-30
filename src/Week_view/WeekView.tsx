import { useMemo, useRef, useEffect, useState } from "react"
import { addDays, format, startOfWeek } from "date-fns"
import { useTimeStore } from "@/store/timeStore"
import { useEventsStore, formatDate } from "@/store/eventsStore"
import { resolveGoalColorForEvent, useGoalsStore } from "@/store/goalsStore"
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from "@/store/recurringUtils"
import { TOP_DEAD_ZONE, SLOT_HEIGHT, addEventOnClick, calculateEventPositions, getClockwiseDurationMinutes, getEventVisualColors, isAllDayEvent, isMultiDayEvent, isTimedMultiDayEvent, isTopBarEventType, isOvernightTimedEvent, storeEventToUIEvent, uiEventToStoreEvent } from "@/lib/eventUtils"
import { compareEventsByDisplayOrder } from "@/store/eventsStore.helpers"
import {
  formatTime,
  formatTimedSpanLabel,
  formatTopRowDateRange,
  getDateFromSpanningClick,
  gridLines,
  hourSlots,
  TIMELINE_SURFACE_ACTIVE_COLOR,
  TIMELINE_SURFACE_COLOR,
  TOP_ROW_ITEM_OFFSET,
  TOP_ROW_LANE_PITCH,
} from "./weekView.utils"

const WeekView = () => {
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const setDate = useTimeStore((state) => state.setDate)
  const getEventsForDate = useEventsStore((state) => state.getEventsForDate)
  const addEventLocal = useEventsStore((state) => state.addEventLocal)
  const deleteEvent = useEventsStore((state) => state.deleteEvent)
  const updateEventFields = useEventsStore((state) => state.updateEventFields)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const scrollToEventId = useEventsStore((state) => state.scrollToEventId)
  const getEventById = useEventsStore((state) => state.getEventById)
  const setScrollToEventId = useEventsStore((state) => state.setScrollToEventId)
  const setLiveEventTime = useEventsStore((state) => state.setLiveEventTime)
  const clearLiveEventTime = useEventsStore((state) => state.clearLiveEventTime)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  const splitRecurringEvent = useEventsStore((state) => state.splitRecurringEvent)
  const updateAllInSeries = useEventsStore((state) => state.updateAllInSeries)
  const updateThisAndFollowing = useEventsStore((state) => state.updateThisAndFollowing)
  const eventsCache = useEventsStore((state) => state.eventsCache)
  const computedEventsCache = useEventsStore((state) => state.computedEventsCache)
  const recurringEventsCache = useEventsStore((state) => state.recurringEventsCache)
  const eventExceptionsCache = useEventsStore((state) => state.eventExceptionsCache)
  const goalsStore = useGoalsStore((state) => state.store)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const suppressNextClickRef = useRef(false)
  const dayColumnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const timedEventRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [previewById, setPreviewById] = useState<Record<string, { date: string; start_time: number; end_time: number }>>({})
  const [dragState, setDragState] = useState<{ id: string; duration: number; offsetMinutes: number; date: string; lockToDate: boolean } | null>(null)
  const [pendingDrag, setPendingDrag] = useState<{ id: string; duration: number; offsetMinutes: number; startX: number; startY: number; date: string; start: number; lockToDate: boolean } | null>(null)
  const [resizeState, setResizeState] = useState<{ id: string; start: number; resizeBaseStart: number; date: string; eventDate: string; endDate: string } | null>(null)
  const [horizontalResizeState, setHorizontalResizeState] = useState<{
    id: string
    startDate: string
    start_time: number
    end_time: number
  } | null>(null)
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(new Date())
  const [showAllTopEvents, setShowAllTopEvents] = useState(false)
  const interactionOriginalRef = useRef<Record<string, { date: string; end_date: string; start_time: number; end_time: number }>>({})

  const weekStart = useMemo(() => {
    const base = selectedDate || new Date()
    return startOfWeek(base, { weekStartsOn: 0 })
  }, [selectedDate])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const weekDateKeys = useMemo(() => weekDays.map((d) => formatDate(d)), [weekDays])
  const weekDayIndexByKey = useMemo(() => {
    const map: Record<string, number> = {}
    weekDateKeys.forEach((key, idx) => {
      map[key] = idx
    })
    return map
  }, [weekDateKeys])
  const todayKey = formatDate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowLineTop = TOP_DEAD_ZONE + (nowMinutes / 60) * SLOT_HEIGHT

  const topRowLayout = useMemo(() => {
    const baseByDay: Record<string, any[]> = Object.fromEntries(weekDateKeys.map((k) => [k, []]))
    const continuationHitAreasByDay: Record<string, Array<{ event: any; lane: number }>> = Object.fromEntries(
      weekDateKeys.map((k) => [k, []])
    )
    const seen = new Set<string>()
    const firstWeekKey = weekDateKeys[0]
    const lastWeekKey = weekDateKeys[weekDateKeys.length - 1]

    weekDays.forEach((day) => {
      const dayKey = formatDate(day)
      const events = getEventsForDate(day)
      events.forEach((event) => {
        if (!isTopBarEventType(event as any)) return
        const startKey = event.date
        const endKey = event.end_date || event.date
        const isSpan = endKey > startKey
        const visibleStartKey = startKey < firstWeekKey ? firstWeekKey : startKey
        if (endKey < firstWeekKey || startKey > lastWeekKey) return
        if (isSpan && visibleStartKey !== dayKey) return
        if (!weekDayIndexByKey.hasOwnProperty(visibleStartKey)) return
        if (seen.has(event.id)) return
        seen.add(event.id)
        baseByDay[visibleStartKey].push(event)
      })
    })

    // Authoritative pass from raw cache: ensures immediate top-row updates when
    // date/end_date/is_all_day changes happen locally before computed views settle.
    Object.values(eventsCache).forEach((events) => {
      events.forEach((event: any) => {
        if (!isTopBarEventType(event)) return
        const startKey = event.date
        const endKey = event.end_date || event.date
        const visibleStartKey = startKey < firstWeekKey ? firstWeekKey : startKey
        if (endKey < firstWeekKey || startKey > lastWeekKey) return
        if (!weekDayIndexByKey.hasOwnProperty(visibleStartKey)) return

        // Replace any stale copy with latest raw-cache version.
        weekDateKeys.forEach((key) => {
          baseByDay[key] = (baseByDay[key] || []).filter((entry: any) => entry.id !== event.id)
        })
        seen.add(event.id)
        baseByDay[visibleStartKey].push(event)
      })
    })

    // Ensure the currently edited/selected event reflects immediately in the top row,
    // even while deferred cache writes are still settling.
    if (selectedEventId) {
      const selectedEvent = getEventById(selectedEventId) as any
      if (selectedEvent && isTopBarEventType(selectedEvent)) {
        const selectedStartKey = selectedEvent.date
        const selectedEndKey = selectedEvent.end_date || selectedEvent.date
        const visibleSelectedStartKey = selectedStartKey < firstWeekKey ? firstWeekKey : selectedStartKey
        if (!(selectedEndKey < firstWeekKey || selectedStartKey > lastWeekKey) && weekDayIndexByKey.hasOwnProperty(visibleSelectedStartKey)) {
          weekDateKeys.forEach((key) => {
            baseByDay[key] = (baseByDay[key] || []).filter((event) => event.id !== selectedEvent.id)
          })
          baseByDay[visibleSelectedStartKey].push(selectedEvent)
          seen.add(selectedEvent.id)
        }
      }
    }

    Object.keys(baseByDay).forEach((key) => {
      baseByDay[key].sort((a, b) => {
        const aEnd = a.end_date || a.date
        const bEnd = b.end_date || b.date
        const aIsMultiDay = aEnd > a.date
        const bIsMultiDay = bEnd > b.date
        if (aIsMultiDay && !bIsMultiDay) return -1
        if (!aIsMultiDay && bIsMultiDay) return 1
        return compareEventsByDisplayOrder(a, b)
      })
    })

    const visibleByDay: Record<string, any[]> = {}
    weekDateKeys.forEach((key) => {
      visibleByDay[key] = baseByDay[key] || []
    })

    const flattened = weekDateKeys.flatMap((key) =>
      (visibleByDay[key] || []).map((event) => {
        const startIdx = weekDayIndexByKey[key]
        const endKey = event.end_date || event.date
        const endIdxRaw = weekDayIndexByKey[endKey]
        const endIdx = endIdxRaw === undefined ? 6 : Math.max(startIdx, Math.min(6, endIdxRaw))
        return { event, startKey: key, startIdx, endIdx, span: endIdx - startIdx + 1 }
      })
    )

    flattened.sort((a, b) => {
      if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx
      if (a.span !== b.span) return b.span - a.span
      return a.event.start_time - b.event.start_time
    })

    const laneEnds: number[] = []
    const laneByEventId: Record<string, number> = {}
    flattened.forEach((item) => {
      let lane = 0
      while (lane < laneEnds.length && item.startIdx <= laneEnds[lane]) lane += 1
      if (lane === laneEnds.length) laneEnds.push(item.endIdx)
      else laneEnds[lane] = item.endIdx
      laneByEventId[item.event.id] = lane
    })

    const visibleLaneLimit = showAllTopEvents ? laneEnds.length : Math.min(laneEnds.length, 2)
    const allEventIds = new Set(flattened.map((f) => f.event.id))
    const hiddenIds = new Set<string>()
    if (!showAllTopEvents) {
      Object.entries(laneByEventId).forEach(([eventId, lane]) => {
        if (lane >= 2) hiddenIds.add(eventId)
      })
    }

    weekDateKeys.forEach((key) => {
      visibleByDay[key] = visibleByDay[key].filter((event) => {
        if (!allEventIds.has(event.id)) return false
        return showAllTopEvents || (laneByEventId[event.id] ?? 0) < 2
      })
    })

    flattened.forEach((item) => {
      const lane = laneByEventId[item.event.id] ?? 0
      const isVisible = showAllTopEvents || lane < 2
      if (!isVisible) return
      for (let idx = item.startIdx + 1; idx <= item.endIdx; idx += 1) {
        const dayKey = weekDateKeys[idx]
        if (!dayKey) continue
        continuationHitAreasByDay[dayKey].push({ event: item.event, lane })
      }
    })

    const hiddenCount = hiddenIds.size
    const totalLaneCount = laneEnds.length
    const rowHeight = totalLaneCount === 0
      ? 0
      : Math.max(34, Math.max(visibleLaneLimit, 1) * TOP_ROW_LANE_PITCH + 8)
    const hasAnyMore = totalLaneCount > 2

    return {
      allByDay: baseByDay,
      visibleByDay,
      laneByEventId,
      continuationHitAreasByDay,
      rowHeight,
      hasAnyMore,
      hiddenCount,
      totalLaneCount,
      visibleLaneCount: Math.max(1, visibleLaneLimit),
    }
  }, [weekDays, weekDateKeys, weekDayIndexByKey, getEventsForDate, showAllTopEvents, eventsCache, computedEventsCache, recurringEventsCache, eventExceptionsCache, selectedEventId, getEventById])

  const timedWeekEvents = useMemo(() => {
    const unique = new Map<string, any>()
    weekDays.forEach((day) => {
      getEventsForDate(day).forEach((event) => {
        if (isTopBarEventType(event as any)) return

        const existing = unique.get(event.id)
        if (!existing) {
          unique.set(event.id, event)
          return
        }

        const existingEndDate = existing.end_date || existing.date
        const eventEndDate = event.end_date || event.date
        const shouldReplace =
          event.date < existing.date ||
          (event.date === existing.date && eventEndDate > existingEndDate)

        if (shouldReplace) {
          unique.set(event.id, event)
        }
      })
    })
    return Array.from(unique.values()).filter((event) => !dismissedEventIds.has(event.id))
  }, [getEventsForDate, weekDays, goalsStore, selectedEventId, dismissedEventIds, eventsCache, computedEventsCache, recurringEventsCache, eventExceptionsCache])

  useEffect(() => {
    if (!selectedEventId || showAllTopEvents) return
    const selectedEvent = getEventById(selectedEventId)
    if (!selectedEvent) return

    const endDate = selectedEvent.end_date || selectedEvent.date
    const isTopRowEvent = isTopBarEventType(selectedEvent as any)
    if (!isTopRowEvent) return

    const eventLane = topRowLayout.laneByEventId[selectedEventId] ?? -1
    if (eventLane >= 2) {
      const frame = window.requestAnimationFrame(() => {
        setShowAllTopEvents(true)
      })
      return () => window.cancelAnimationFrame(frame)
    }
  }, [selectedEventId, showAllTopEvents, getEventById, topRowLayout.laneByEventId])

  useEffect(() => {
    if (dismissedEventIds.size === 0) return
    const existingIds = new Set<string>()
    weekDays.forEach((day) => {
      getEventsForDate(day).forEach((event) => existingIds.add(event.id))
    })
    setDismissedEventIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id)
      })
      return next
    })
  }, [weekDays, getEventsForDate, selectedDate, eventsCache])

  useEffect(() => {
    if (!scrollToEventId) return

    const event = getEventById(scrollToEventId) as any
    if (!event) return

    const endDate = event.end_date || event.date
    const isTopRowEvent = isTopBarEventType(event as any)
    if (isTopRowEvent) {
      if (!showAllTopEvents) {
        const eventLane = topRowLayout.laneByEventId[scrollToEventId] ?? -1
        if (eventLane >= 2) {
          window.requestAnimationFrame(() => {
            setShowAllTopEvents(true)
          })
        }
      }
      setScrollToEventId(null)
      return
    }

    if (!scrollRef.current) return
    const scrollPosition = TOP_DEAD_ZONE + (event.start_time / 60) * SLOT_HEIGHT - 24
    scrollRef.current.scrollTo({ top: Math.max(0, scrollPosition), behavior: "auto" })
    setScrollToEventId(null)
  }, [scrollToEventId, getEventById, setScrollToEventId, showAllTopEvents, topRowLayout.laneByEventId])

  useEffect(() => {
    if (!selectedEventId || !scrollRef.current || !stickyHeaderRef.current) return

    const selectedEvent = getEventById(selectedEventId) as any
    if (!selectedEvent || isTopBarEventType(selectedEvent)) return

    const selectedDayKey = selectedDate ? formatDate(selectedDate) : null
    const preferredRefKey = selectedDayKey ? `${selectedEventId}:${selectedDayKey}` : null
    const eventElement =
      (preferredRefKey ? timedEventRefs.current[preferredRefKey] : null) ||
      Object.entries(timedEventRefs.current).find(([key, value]) => key.startsWith(`${selectedEventId}:`) && value)?.[1]

    if (!eventElement) return

    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = scrollRef.current
      const stickyHeader = stickyHeaderRef.current
      if (!scrollContainer || !stickyHeader) return

      const eventRect = eventElement.getBoundingClientRect()
      const scrollRect = scrollContainer.getBoundingClientRect()
      const stickyRect = stickyHeader.getBoundingClientRect()
      const visibleTop = stickyRect.bottom + 12
      const visibleBottom = scrollRect.bottom - 12

      if (eventRect.top < visibleTop) {
        scrollContainer.scrollBy({ top: eventRect.top - visibleTop, behavior: "smooth" })
        return
      }

      if (eventRect.bottom > visibleBottom) {
        scrollContainer.scrollBy({ top: eventRect.bottom - visibleBottom, behavior: "smooth" })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selectedEventId, selectedDate, getEventById, topRowLayout.rowHeight])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const snapToQuarter = (minutes: number) => Math.round(minutes / 15) * 15
  const toDayStamp = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getTime()
  const daySpan = (from: string, to: string) => Math.max(0, Math.floor((toDayStamp(to) - toDayStamp(from)) / 86400000))

  const findCanonicalCachedEvent = (eventId: string) => {
    const { eventsCache } = useEventsStore.getState()
    let canonical: any = null

    for (const events of Object.values(eventsCache)) {
      for (const event of events as any[]) {
        if (event.id !== eventId) continue
        if (!canonical || event.date < canonical.date || (event.date === canonical.date && (event.end_date || event.date) > (canonical.end_date || canonical.date))) {
          canonical = event
        }
      }
    }

    return canonical
  }

  const findDayByClientX = (clientX: number) => {
    for (const dayKey of weekDateKeys) {
      const el = dayColumnRefs.current[dayKey]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) return { dayKey, el }
    }
    return null
  }

  const getMinutesFromClientY = (clientY: number, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect()
    let y = clientY - rect.top - TOP_DEAD_ZONE
    y = Math.max(0, Math.min(y, 24 * SLOT_HEIGHT - 1))
    const mins = snapToQuarter((y / SLOT_HEIGHT) * 60)
    return Math.max(0, Math.min(mins, 23 * 60 + 45))
  }

  const applyLivePreviewToStore = (eventId: string, preview: { date: string; start_time: number; end_time: number; end_date?: string }) => {
    const { eventsCache } = useEventsStore.getState()
    const sourceEvent = findCanonicalCachedEvent(eventId)

    if (!sourceEvent) return

    const toDateKey = preview.date
    const updatedEvent = {
      ...sourceEvent,
      date: preview.date,
      end_date: preview.end_date || preview.date,
      start_time: preview.start_time,
      end_time: preview.end_time,
      updated_at: new Date().toISOString(),
    }

    const nextCache: Record<string, any[]> = { ...eventsCache }

    for (const cacheDateKey of Object.keys(nextCache)) {
      const filtered = (nextCache[cacheDateKey] || []).filter((e: any) => e.id !== eventId)
      if (filtered.length === 0) delete nextCache[cacheDateKey]
      else nextCache[cacheDateKey] = filtered
    }

    if (!nextCache[toDateKey]) nextCache[toDateKey] = []
    nextCache[toDateKey] = [...nextCache[toDateKey], updatedEvent]

    if (nextCache[toDateKey]) {
      nextCache[toDateKey] = [...nextCache[toDateKey]].sort((a: any, b: any) => compareEventsByDisplayOrder(a, b))
    }

    useEventsStore.setState({
      eventsCache: nextCache as any,
      computedEventsCache: {},
      recurringEventsCache: {},
      eventExceptionsCache: {},
    })
  }

  const captureOriginalIfNeeded = (eventId: string) => {
    if (interactionOriginalRef.current[eventId]) return
    const sourceEvent = findCanonicalCachedEvent(eventId) || getEventById(eventId)
    if (!sourceEvent) return
    interactionOriginalRef.current[eventId] = {
      date: sourceEvent.date,
      end_date: sourceEvent.end_date || sourceEvent.date,
      start_time: sourceEvent.start_time,
      end_time: sourceEvent.end_time,
    }
  }

  useEffect(() => {
    const isRecurringEvent = (event: any) => isSeriesActuallyRecurring(event)

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState && pendingDrag) {
        const moved = Math.abs(e.clientX - pendingDrag.startX) + Math.abs(e.clientY - pendingDrag.startY)
        if (moved >= 4) {
          const initialPreview = {
            date: pendingDrag.date,
            start_time: pendingDrag.start,
            end_time: pendingDrag.start + pendingDrag.duration,
          }
          setDragState({
            id: pendingDrag.id,
            duration: pendingDrag.duration,
            offsetMinutes: pendingDrag.offsetMinutes,
            date: pendingDrag.date,
            lockToDate: pendingDrag.lockToDate,
          })
          setPreviewById((prev) => ({
            ...prev,
            [pendingDrag.id]: initialPreview,
          }))
          setLiveEventTime(
            pendingDrag.id,
            initialPreview.start_time,
            initialPreview.end_time,
            initialPreview.date,
            initialPreview.date
          )
          const pendingEvent = getEventById(pendingDrag.id) as any
          if (!isRecurringEvent(pendingEvent)) {
            applyLivePreviewToStore(pendingDrag.id, initialPreview)
          }
          setPendingDrag(null)
          return
        }
      }

      if (dragState) {
        const target = dragState.lockToDate
          ? (() => {
              const el = dayColumnRefs.current[dragState.date]
              return el ? { dayKey: dragState.date, el } : null
            })()
          : findDayByClientX(e.clientX)
        if (!target) return
        const pointerMinutes = getMinutesFromClientY(e.clientY, target.el)
        const start = pointerMinutes - dragState.offsetMinutes
        const maxStart = Math.max(0, 1440 - dragState.duration)
        const clampedStart = Math.max(0, Math.min(start, maxStart))
        const next = {
          date: target.dayKey,
          start_time: clampedStart,
          end_time: clampedStart + dragState.duration,
        }
        setPreviewById((prev) => ({ ...prev, [dragState.id]: next }))
        setLiveEventTime(dragState.id, next.start_time, next.end_time, next.date, next.date)
        const movedEvent = getEventById(dragState.id) as any
        if (!isRecurringEvent(movedEvent)) {
          applyLivePreviewToStore(dragState.id, next)
        }
      } else if (resizeState) {
        const el = dayColumnRefs.current[resizeState.date]
        if (!el) return
        const end = Math.max(resizeState.resizeBaseStart + 15, getMinutesFromClientY(e.clientY, el))
        const clampedEnd = Math.min(end, 24 * 60)
        const original = interactionOriginalRef.current[resizeState.id]
        const nextPreview = {
          date: original?.date || resizeState.eventDate,
          start_time: resizeState.start,
          end_time: clampedEnd,
          end_date: original?.end_date || resizeState.endDate,
        }
        setPreviewById((prev) => ({
          ...prev,
          [resizeState.id]: nextPreview,
        }))
        setLiveEventTime(
          resizeState.id,
          resizeState.start,
          clampedEnd,
          nextPreview.date,
          nextPreview.end_date
        )
        const resizedEvent = getEventById(resizeState.id) as any
        if (!isRecurringEvent(resizedEvent)) {
          applyLivePreviewToStore(resizeState.id, nextPreview)
        }
      } else if (horizontalResizeState) {
        const target = findDayByClientX(e.clientX)
        if (!target) return
        const clampedDay = toDayStamp(target.dayKey) < toDayStamp(horizontalResizeState.startDate)
          ? horizontalResizeState.startDate
          : target.dayKey
        setPreviewById((prev) => ({
          ...prev,
          [horizontalResizeState.id]: {
            date: horizontalResizeState.startDate,
            start_time: horizontalResizeState.start_time,
            end_time: horizontalResizeState.end_time,
            end_date: clampedDay,
          } as any,
        }))
        setLiveEventTime(
          horizontalResizeState.id,
          horizontalResizeState.start_time,
          horizontalResizeState.end_time,
          horizontalResizeState.startDate,
          clampedDay
        )
        const horizontallyResizedEvent = getEventById(horizontalResizeState.id) as any
        if (!isRecurringEvent(horizontallyResizedEvent)) {
          applyLivePreviewToStore(horizontalResizeState.id, {
            date: horizontalResizeState.startDate,
            start_time: horizontalResizeState.start_time,
            end_time: horizontalResizeState.end_time,
            end_date: clampedDay,
          })
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      let derivedPreview: any = null
      const activeId = dragState?.id || resizeState?.id || horizontalResizeState?.id || pendingDrag?.id
      const pendingMoved =
        pendingDrag
          ? Math.abs(e.clientX - pendingDrag.startX) + Math.abs(e.clientY - pendingDrag.startY)
          : 0

      // Commit from the actual release coordinates. React state updates from
      // mousemove can lag behind mouseup, which made dragged events snap back.
      if (dragState) {
        const target = dragState.lockToDate
          ? (() => {
              const el = dayColumnRefs.current[dragState.date]
              return el ? { dayKey: dragState.date, el } : null
            })()
          : findDayByClientX(e.clientX)
        if (target) {
          const pointerMinutes = getMinutesFromClientY(e.clientY, target.el)
          const start = pointerMinutes - dragState.offsetMinutes
          const maxStart = Math.max(0, 1440 - dragState.duration)
          const clampedStart = Math.max(0, Math.min(start, maxStart))
          derivedPreview = {
            date: target.dayKey,
            start_time: clampedStart,
            end_time: clampedStart + dragState.duration,
          }
        }
      }

      // Fast-drag fallback: commit using mouse-up position even when no mousemove fired.
      if (!dragState && pendingDrag && pendingMoved >= 4) {
        const target = pendingDrag.lockToDate
          ? (() => {
              const el = dayColumnRefs.current[pendingDrag.date]
              return el ? { dayKey: pendingDrag.date, el } : null
            })()
          : findDayByClientX(e.clientX)
        if (target) {
          const pointerMinutes = getMinutesFromClientY(e.clientY, target.el)
          const start = pointerMinutes - pendingDrag.offsetMinutes
          const maxStart = Math.max(0, 1440 - pendingDrag.duration)
          const clampedStart = Math.max(0, Math.min(start, maxStart))
          derivedPreview = {
            date: target.dayKey,
            start_time: clampedStart,
            end_time: clampedStart + pendingDrag.duration,
          }
        }
      }

      const hadRealInteraction =
        !!dragState ||
        !!resizeState ||
        !!horizontalResizeState ||
        (!!pendingDrag && pendingMoved >= 4 && !!derivedPreview)

      if (pendingDrag) {
        setPendingDrag(null)
      }
      // Plain click on event body should NOT be treated as drag-drop.
      if (!activeId || !hadRealInteraction) return
      suppressNextClickRef.current = true
      window.setTimeout(() => {
        suppressNextClickRef.current = false
      }, 0)
      const clearInteractionState = (options?: { deferPreviewClear?: boolean; keepLiveTime?: boolean }) => {
        setDragState(null)
        setResizeState(null)
        setHorizontalResizeState(null)
        const clearPreviewAndLiveTime = () => {
          if (!options?.keepLiveTime) {
            clearLiveEventTime(activeId)
          }
          setPreviewById((prev) => {
            const next = { ...prev }
            delete next[activeId]
            return next
          })
        }

        if (options?.deferPreviewClear) {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(clearPreviewAndLiveTime)
          })
          return
        }

        clearPreviewAndLiveTime()
      }

      const preview = derivedPreview || (previewById[activeId] as any)
      if (!preview) {
        const original = interactionOriginalRef.current[activeId]
        if (original) {
          // If drag/resize ended without a valid drop target, restore original event state.
          updateEventFields(activeId, original)
          delete interactionOriginalRef.current[activeId]
        }
        clearInteractionState()
        return
      }

      const original = interactionOriginalRef.current[activeId]
      const commit = resizeState && original
        ? {
            date: original.date,
            end_date: original.end_date,
            start_time: preview.start_time,
            end_time: preview.end_time,
          }
        : {
            date: preview.date,
            end_date: preview.end_date || preview.date,
            start_time: preview.start_time,
            end_time: preview.end_time,
          }

      if (selectedEventId === activeId) {
        setDate(new Date(`${commit.date}T12:00:00`))
        setLiveEventTime(activeId, commit.start_time, commit.end_time, commit.date, commit.end_date)
        applyLivePreviewToStore(activeId, commit)
      }

      const sourceEvent = getEventById(activeId) as any
      const isRecurringSourceEvent = isRecurringEvent(sourceEvent)

      if (isRecurringSourceEvent) {
        if (isSeriesAnchorEvent(sourceEvent)) {
          const seriesMasterId = sourceEvent.seriesMasterId || sourceEvent.id
          void updateAllInSeries(seriesMasterId, commit)
          delete interactionOriginalRef.current[activeId]
          clearInteractionState()
          return
        }

        // Clean drag/resize visual state immediately while dialog is open.
        clearInteractionState()

        showRecurringDialog(sourceEvent, "edit", async (choice: string) => {
          const occurrenceDate = (sourceEvent as any).occurrenceDate || sourceEvent.date

          if (choice === "cancel") {
            delete interactionOriginalRef.current[activeId]
            setSelectedEvent(null)
            closeRecurringDialog()
            return
          }

          if (choice === "only-this") {
            await splitRecurringEvent(
              sourceEvent,
              occurrenceDate,
              commit.start_time,
              commit.end_time,
              {
                date: commit.date,
                end_date: commit.end_date,
                start_time: commit.start_time,
                end_time: commit.end_time,
              }
            )
          } else if (choice === "all-events") {
            const seriesMasterId = sourceEvent.seriesMasterId || sourceEvent.id
            await updateAllInSeries(seriesMasterId, commit)
          } else if (choice === "this-and-following") {
            await updateThisAndFollowing(
              sourceEvent,
              occurrenceDate,
              commit.start_time,
              commit.end_time,
              {
                date: commit.date,
                end_date: commit.end_date,
                start_time: commit.start_time,
                end_time: commit.end_time,
              }
            )
          }

          delete interactionOriginalRef.current[activeId]
          closeRecurringDialog()
        })
        return
      }

      updateEventFields(activeId, commit)
      delete interactionOriginalRef.current[activeId]
      clearInteractionState({ deferPreviewClear: true, keepLiveTime: selectedEventId === activeId })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [pendingDrag, dragState, resizeState, horizontalResizeState, previewById, updateEventFields, weekDateKeys, setDate, selectedEventId, getEventById, setLiveEventTime, clearLiveEventTime, showRecurringDialog, closeRecurringDialog, splitRecurringEvent, updateAllInSeries, updateThisAndFollowing])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !selectedEventId) return

      const selectedEvent = getEventById(selectedEventId) as any
      if (!selectedEvent) return

      const dismissEventId = (eventId: string) => {
        setDismissedEventIds((prev) => {
          const next = new Set(prev)
          next.add(eventId)
          return next
        })
      }

      const isRecurringDeleteTarget = !!(
        selectedEvent &&
        (
          isSeriesActuallyRecurring(selectedEvent) ||
          selectedEvent.seriesMasterId
        )
      )

      if (selectedEvent.title === "New Event") {
        dismissEventId(selectedEventId)
        void deleteEvent(selectedEventId)
        setSelectedEvent(null)
        return
      }

      if (isRecurringDeleteTarget) {
        const occurrenceDate = selectedEvent.occurrenceDate || selectedEvent.date
        if (isSeriesAnchorEvent(selectedEvent)) {
          const seriesMasterId = selectedEvent.seriesMasterId || selectedEvent.id
          dismissEventId(selectedEvent.id)
          void deleteEvent(seriesMasterId)
          setSelectedEvent(null)
          return
        }

        showRecurringDialog(selectedEvent, "delete", async (choice: string) => {
          if (choice === "cancel") {
            closeRecurringDialog()
            return
          }

          if (choice === "only-this") {
            const deleteSingleOccurrence = useEventsStore.getState().deleteSingleOccurrence
            dismissEventId(selectedEvent.id)
            await deleteSingleOccurrence(selectedEvent, occurrenceDate)
          } else if (choice === "all-events") {
            const seriesMasterId = selectedEvent.seriesMasterId || selectedEvent.id
            await deleteEvent(seriesMasterId)
          } else if (choice === "this-and-following") {
            const seriesMasterId = selectedEvent.seriesMasterId || selectedEvent.id
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

      dismissEventId(selectedEventId)
      void deleteEvent(selectedEventId)
      setSelectedEvent(null)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedEventId, deleteEvent, getEventById, setSelectedEvent, showRecurringDialog, closeRecurringDialog, updateAllInSeries])

  return (
    <div className="h-full w-full bg-[#f3f3f2] flex items-center justify-center overflow-hidden select-none">
      <div className="h-[100%] w-[100%] rounded-l-2xl bg-[#ececeb] shadow-xl flex flex-col overflow-hidden">
        <div className="px-9 pt-32 pb-3 border-b border-white/20 shrink-0">
          <h1 className="text-6xl pb-0 font-semibold text-neutral-800 tracking-tight">
            <span className="text-black">
              {format(weekStart, "d MMM")} - {format(addDays(weekStart, 6), "d MMM")},
            </span>
            <span className="text-neutral-400 font-normal">
              {" "}
              {format(addDays(weekStart, 6), "yyyy")}
            </span>
          </h1>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar bg-[#e2e2e1]">
          <div className="pb-14 bg-[#e2e2e1]">
            <div ref={stickyHeaderRef} className="sticky top-0 z-[500] isolate relative bg-[#e2e2e1]">
              <div className="flex relative z-[520] bg-[#e2e2e1]">
                <div className="w-[84px] shrink-0" />
                <div className="flex-1 grid grid-cols-7 gap-2 pl-3 pr-3">
                  {weekDays.map((day) => {
                    const dayKey = formatDate(day)
                    const isSelected = selectedDate ? format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd") : false
                    const isToday = dayKey === todayKey
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => setDate(day)}
                        className="group px-0 py-2 text-left transition-all duration-200 bg-transparent"
                      >
                        <div
                          className={`overflow-hidden rounded-3xl border px-4 py-3 transition-all duration-200 ${
                            isSelected
                              ? "border-black bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                              : "border-[#cfcfcb] bg-[#e2e2e1] text-neutral-900"
                          }`}
                        >
                          <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            isSelected ? "text-white/80" : "text-neutral-600"
                          }`}>
                            {format(day, "EEE")}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 overflow-hidden">
                            <span className={`min-w-0 shrink truncate text-[42px] font-semibold leading-none ${
                              isSelected ? "text-white" : "text-neutral-900"
                            }`}>
                              {format(day, "d")}
                            </span>
                            <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-hidden">
                              {isToday ? (
                                <span className={`hidden h-6 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.18em] min-[1180px]:inline-flex ${
                                  isSelected ? "bg-white/20 text-white" : "bg-black text-white"
                                }`}>
                                  Today
                                </span>
                              ) : null}
                              {!isToday ? (
                                <span className={`hidden h-6 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.16em] min-[1180px]:inline-flex ${
                                  isSelected ? "bg-white/18 text-white/90" : "bg-[#d1d1cd] text-neutral-600"
                                }`}>
                                  {format(day, "MMM")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex bg-[#e2e2e1] relative z-[510]">
                <div className="w-[84px] shrink-0 relative">
                  {topRowLayout.hasAnyMore ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowAllTopEvents((prev) => !prev)
                      }}
                      className="absolute right-2 z-30 w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
                              style={{ top: `${(topRowLayout.visibleLaneCount - 1) * TOP_ROW_LANE_PITCH + TOP_ROW_ITEM_OFFSET}px` }}
                      aria-label={showAllTopEvents ? "Collapse events" : "Show all events"}
                      title={showAllTopEvents ? "Show less" : "Show all"}
                    >
                      <svg className={`w-4 h-4 text-black transition-transform ${showAllTopEvents ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <div className="flex-1 grid grid-cols-7 gap-2 pl-3 pr-3">
                  {weekDays.map((day, dayIndex) => {
                    const dayKey = formatDate(day)
                    const topEvents = topRowLayout.allByDay[dayKey] || []
                    const visibleTopEvents = topRowLayout.visibleByDay[dayKey] || []

                    return (
                      <div
                        key={`top-${day.toISOString()}`}
                        className="px-0 py-1 relative z-40"
                        style={{ minHeight: `${topRowLayout.rowHeight}px` }}
                      >
                        <div className="relative z-50" style={{ minHeight: `${topRowLayout.rowHeight - 8}px` }}>
                          {visibleTopEvents.map((event) => {
                            const startKey = event.date
                            const endKey = event.end_date || event.date
                            const visibleStartKey = startKey < weekDateKeys[0] ? weekDateKeys[0] : startKey
                            const visibleEndKey = endKey > weekDateKeys[weekDateKeys.length - 1]
                              ? weekDateKeys[weekDateKeys.length - 1]
                              : endKey
                            const continuesFromPreviousWeek = startKey < weekDateKeys[0]
                            const continuesIntoNextWeek = endKey > weekDateKeys[weekDateKeys.length - 1]
                            const spanDays = Math.max(1, daySpan(visibleStartKey, visibleEndKey) + 1)
                            const lane = topRowLayout.laneByEventId[event.id] ?? 0
                            const isActive = selectedEventId === event.id
                            const { backgroundColor, mutedBackgroundColor, textColor, accentColor } = getEventVisualColors((event as any).goalColor || (event as any).color)
                            const isTimedMultiDay = isTimedMultiDayEvent(event as any)
                            const topRowDateRange = formatTopRowDateRange(event.date, endKey)
                            const spanWidth = spanDays > 1
                              ? `calc(${spanDays * 100}% + ${(spanDays - 1) * 0.5}rem)`
                              : "100%"
                            return (
                              <div
                                key={`top-sticky-${event.id}`}
                                onClick={(eventClick) => {
                                  eventClick.stopPropagation()
                                  setSelectedEvent(event.id)
                                  setDate(getDateFromSpanningClick(eventClick, visibleStartKey, spanDays))
                                }}
                                className={`truncate py-1 text-[13px] font-semibold absolute left-0 cursor-pointer transition-[width,transform,box-shadow] duration-200 ease-out ${
                                  isActive ? "z-[9999] border-2 border-white shadow-2xl rounded-xl" : "z-[60] shadow-sm border border-[#cfcfcb]"
                                } ${
                                  isActive
                                    ? continuesFromPreviousWeek && continuesIntoNextWeek
                                      ? "pl-4 pr-4"
                                      : continuesFromPreviousWeek
                                        ? "pl-4 pr-2"
                                        : continuesIntoNextWeek
                                          ? "pl-2 pr-4"
                                          : "px-2"
                                    : continuesFromPreviousWeek && continuesIntoNextWeek
                                    ? "rounded-none pl-4 pr-4"
                                    : continuesFromPreviousWeek
                                      ? "rounded-r-xl rounded-l-none pl-4 pr-2"
                                      : continuesIntoNextWeek
                                        ? "rounded-l-xl rounded-r-none pl-2 pr-4"
                                        : "rounded-xl px-2"
                                }`}
                                style={{
                                  top: `${lane * TOP_ROW_LANE_PITCH + TOP_ROW_ITEM_OFFSET}px`,
                                  backgroundColor: isActive ? backgroundColor : mutedBackgroundColor,
                                  color: textColor,
                                  left: "0px",
                                  width: spanWidth,
                                  clipPath: isActive
                                    ? "none"
                                    : continuesFromPreviousWeek && continuesIntoNextWeek
                                    ? "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)"
                                    : continuesFromPreviousWeek
                                      ? "polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)"
                                      : continuesIntoNextWeek
                                        ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                                        : undefined,
                                  borderRadius: isActive ? "20px" : undefined,
                                }}
                              >
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  {isTimedMultiDay ? (
                                    <span
                                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                      style={{ backgroundColor: "rgba(207,207,203,0.8)", color: accentColor }}
                                    >
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l2.5 2.5m6-2.5a8.5 8.5 0 11-17 0 8.5 8.5 0 0117 0z" />
                                      </svg>
                                      {formatTimedSpanLabel(event.start_time, event.end_time)}
                                    </span>
                                  ) : null}
                                  <span className="truncate">
                                    {event.title}
                                    {endKey > event.date ? "," : ""}
                                  </span>
                                  {endKey > event.date ? (
                                    <span className="shrink-0 opacity-70"> {topRowDateRange}</span>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                          {(topRowLayout.continuationHitAreasByDay[dayKey] || []).map(({ event, lane }) => (
                            <button
                              key={`top-hit-${event.id}-${dayKey}`}
                              type="button"
                              aria-label={`Open ${event.title} on ${dayKey}`}
                              onClick={(eventClick) => {
                                eventClick.stopPropagation()
                                setSelectedEvent(event.id)
                                setDate(new Date(`${dayKey}T12:00:00`))
                              }}
                              className="absolute -left-1 -right-1 z-[120] h-[23px] cursor-pointer rounded bg-transparent p-0 border-0"
                              style={{ top: `${lane * TOP_ROW_LANE_PITCH + TOP_ROW_ITEM_OFFSET}px` }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[530] h-px bg-[linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.3)_12%,rgba(0,0,0,0.3)_88%,transparent_100%)]" />
            </div>

              <div className="h-4 shrink-0" />
            <div className="flex relative">
              <div className="w-[84px] shrink-0">
                {hourSlots.map((hour) => (
                    <div key={hour} className="flex items-center justify-end pr-3" style={{ height: `${SLOT_HEIGHT}px` }}>
                    <span className="text-black text-xl">
                      {String(hour).padStart(2, "0")}
                      <span className="text-gray-600 text-lg">:00</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7 gap-2 pl-3 pr-3">
                {weekDays.map((day) => {
                  const dayKey = formatDate(day)
                  const dayTimedEvents = timedWeekEvents
                    .map((event) => {
                      const preview = previewById[event.id] as any
                      if (!preview) return event
                      return {
                        ...event,
                        date: preview.date,
                        end_date: preview.end_date || preview.date,
                        start_time: preview.start_time,
                        end_time: preview.end_time,
                      }
                    })
                    .filter((event) => {
                      const endDate = event.end_date || event.date
                      return event.date <= dayKey && endDate >= dayKey
                    })

                  const uiEvents = dayTimedEvents.map((event) => {
                    const resolvedGoalColor = resolveGoalColorForEvent(goalsStore, event as any)
                    return storeEventToUIEvent(
                      { ...event, color: (event as any).goalColor || resolvedGoalColor || (event as any).color } as any,
                      day
                    )
                  })
                  const positions = calculateEventPositions(uiEvents, selectedEventId)

                  const handleCreateEvent = (e: React.MouseEvent<HTMLDivElement>) => {
                    if (dragState || resizeState || horizontalResizeState) return
                    if (suppressNextClickRef.current) return
                    const target = e.target as HTMLElement
                    if (target.closest("[data-week-event='true']")) return
                    
                    // Use latest store state to prevent rapid-click duplicates
                    const currentSelectedId = useEventsStore.getState().selectedEventId
                    if (currentSelectedId) {
                      const datePattern = /-(\d{4}-\d{2}-\d{2})$/
                      const isVirtualEventId = datePattern.test(currentSelectedId)

                      if (!isVirtualEventId) {
                        let eventInStore: any = null

                        for (const events of Object.values(eventsCache)) {
                          const found = events.find((event: any) => event.id === currentSelectedId)
                          if (found) {
                            eventInStore = found
                            break
                          }
                        }

                        if (eventInStore && eventInStore.isTemp === true && eventInStore.created_at === eventInStore.updated_at) {
                          void deleteEvent(currentSelectedId)
                          setSelectedEvent(null)
                          return
                        }
                      }

                      setSelectedEvent(null)
                      return
                    }

                    const rect = e.currentTarget.getBoundingClientRect()
                    let clickY = e.clientY - rect.top
                    if (clickY < TOP_DEAD_ZONE) return
                    clickY -= TOP_DEAD_ZONE

                    const newUIEvent = addEventOnClick(clickY, uiEvents, day)
                    if (!newUIEvent) return

                    const storeEvent = uiEventToStoreEvent(newUIEvent, formatDate(day))
                    addEventLocal({
                      title: storeEvent.title!,
                      date: storeEvent.date!,
                      end_date: storeEvent.end_date!,
                      start_time: storeEvent.start_time!,
                      end_time: storeEvent.end_time!,
                      description: storeEvent.description,
                      notes: storeEvent.notes,
                      urls: storeEvent.urls,
                      color: storeEvent.color,
                      is_all_day: storeEvent.is_all_day,
                      location: storeEvent.location,
                      id: storeEvent.id,
                    })
                    setDate(day)
                    setSelectedEvent(newUIEvent.id)
                  }

                  return (
                    <div
                      key={day.toISOString()}
                      ref={(el) => { dayColumnRefs.current[dayKey] = el }}
                      onClick={handleCreateEvent}
                      className="relative min-h-[2448px] overflow-hidden rounded-3xl border border-[#cfcfcb] bg-[#e2e2e1]"
                    >
                      <div className="mt-12 h-[1px] bg-[#cfcfcb]" />
                      {gridLines.map((line) => (
                        <div key={line} className="h-[1px] bg-[#cfcfcb]" style={{ marginTop: `${SLOT_HEIGHT - 1}px` }} />
                      ))}

                      <div className="absolute inset-0">
                        {dayKey === todayKey ? (
                          <div className="absolute left-0 right-0 z-20" style={{ top: nowLineTop }}>
                            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500 shadow-sm" />
                            <div className="h-[2px] w-full bg-red-500/90" />
                          </div>
                        ) : null}
                        {uiEvents.map((event) => {
                          const sourceEvent = dayTimedEvents.find((entry) => entry.id === event.id)
                          const eventEndDate = (sourceEvent?.end_date || sourceEvent?.date || dayKey)
                          const isOvernightLinkedEvent = sourceEvent ? isOvernightTimedEvent(sourceEvent as any) : false
                          const isStartColumn = (sourceEvent?.date || dayKey) === dayKey
                          const extensionDays = isStartColumn && !isOvernightLinkedEvent ? daySpan(dayKey, eventEndDate) : 0
                          const isExtendedEvent = extensionDays > 0
                          const isHorizontalResizing = horizontalResizeState?.id === event.id
                          const isRecurringEvent = !!(
                            (sourceEvent as any)?.isRecurringInstance ||
                            ((sourceEvent as any)?.repeat && (sourceEvent as any)?.repeat !== "None")
                          )
                          const position = positions[event.id] || { left: "0", width: "100%", zIndex: 10 }
                          const isActive =
                            selectedEventId === event.id ||
                            dragState?.id === event.id ||
                            pendingDrag?.id === event.id ||
                            resizeState?.id === event.id ||
                            horizontalResizeState?.id === event.id
                          const { backgroundColor, mutedBackgroundColor, textColor, accentColor } = getEventVisualColors(event.color)
                          const startMins = event.startHour * 60 + event.startMin
                          const endMins = event.endHour * 60 + event.endMin
                          const labelStartMins = isOvernightLinkedEvent && sourceEvent ? sourceEvent.start_time : startMins
                          const labelEndMins = isOvernightLinkedEvent && sourceEvent ? sourceEvent.end_time : endMins
                          const durationMins = getClockwiseDurationMinutes(startMins, endMins)
                          const labelDurationMins = getClockwiseDurationMinutes(labelStartMins, labelEndMins)
                          const isVeryShortEvent = labelDurationMins <= 15
                          const titleSizeClass = durationMins <= 15
                            ? "text-sm"
                            : durationMins <= 30
                              ? "text-sm"
                              : "text-xl"

                          return (
                            <button
                              key={event.id}
                              type="button"
                              ref={(el) => {
                                timedEventRefs.current[`${event.id}:${dayKey}`] = el
                              }}
                              data-week-event="true"
                              onClick={(eventClick) => {
                                eventClick.stopPropagation()
                                if (suppressNextClickRef.current) return
                                setSelectedEvent(event.id)
                                const sourceDate = sourceEvent?.date || dayKey
                                setDate(getDateFromSpanningClick(eventClick, sourceDate, isExtendedEvent ? extensionDays + 1 : 1))
                              }}
                              onMouseDown={(eventMouseDown) => {
                                eventMouseDown.stopPropagation()
                                const start = event.startHour * 60 + event.startMin
                                const end = event.endHour * 60 + event.endMin
                                const duration = getClockwiseDurationMinutes(start, end)
                                const targetEl = eventMouseDown.currentTarget as HTMLButtonElement
                                const rect = targetEl.getBoundingClientRect()
                                const offsetY = Math.max(0, Math.min(eventMouseDown.clientY - rect.top, rect.height))
                                const offsetMinutes = Math.round((offsetY / SLOT_HEIGHT) * 60 / 15) * 15
                                captureOriginalIfNeeded(event.id)
                                setPendingDrag({
                                  id: event.id,
                                  duration,
                                  offsetMinutes,
                                  startX: eventMouseDown.clientX,
                                  startY: eventMouseDown.clientY,
                                  date: dayKey,
                                  start,
                                  lockToDate: isRecurringEvent,
                                })
                              }}
                              className={`group absolute rounded-md calendar-event cursor-grab active:cursor-grabbing select-none text-left ${
                                selectedEventId === event.id &&
                                dragState?.id !== event.id &&
                                pendingDrag?.id !== event.id &&
                                resizeState?.id !== event.id &&
                                horizontalResizeState?.id !== event.id
                                  ? "border-2 border-white"
                                  : dragState?.id === event.id || resizeState?.id === event.id || horizontalResizeState?.id === event.id
                                    ? "border-0"
                                    : "border-r-2 border-b-0 border-t-4 border-transparent"
                              }`}
                              style={{
                                top: event.slot + TOP_DEAD_ZONE,
                                height: event.height,
                                left: isActive || isExtendedEvent ? "0%" : position.left,
                                width: isActive
                                  ? isExtendedEvent
                                    ? `calc(${extensionDays + 1} * 100%)`
                                    : "100%"
                                  : isExtendedEvent
                                    ? `calc(${extensionDays + 1} * 100%)`
                                    : position.width,
                                zIndex: dragState?.id === event.id || pendingDrag?.id === event.id
                                  ? 320
                                  : resizeState?.id === event.id || horizontalResizeState?.id === event.id
                                    ? 310
                                    : selectedEventId === event.id
                                      ? 220
                                      : isExtendedEvent
                                        ? 120
                                        : isRecurringEvent
                                          ? 60
                                          : position.zIndex,
                                backgroundColor: isActive ? backgroundColor : mutedBackgroundColor,
                                color: textColor,
                                boxShadow: isActive ? "0 10px 24px rgba(0,0,0,0.24)" : undefined,
                                backgroundClip: isActive ? "border-box" : "padding-box",
                                transition: dragState?.id === event.id || resizeState?.id === event.id || horizontalResizeState?.id === event.id
                                  ? undefined
                                  : "left 200ms ease, width 200ms ease",
                              }}
                            >
                              <div className="absolute top-1 bottom-1 left-[3px] w-[6px] rounded" style={{ backgroundColor: selectedEventId === event.id ? "#ffffff" : accentColor }} />
                              <div className={`absolute inset-x-0 z-10 pl-[18px] pr-3 ${durationMins <= 15 ? "inset-y-0 flex" : "top-0"} ${durationMins > 15 && durationMins <= 30 ? "pt-0" : durationMins > 30 ? "pt-1" : ""}`} style={{ color: textColor }}>
                                {durationMins <= 15 ? (
                                  <div className="flex w-full items-end justify-between gap-1 overflow-hidden h-full pb-0.5 -translate-y-[2px]">
                                    <div className={`min-w-0 truncate font-extrabold leading-none ${titleSizeClass}`}>{event.title}</div>
                                    <div className="shrink-0 text-[11px] font-semibold opacity-90 whitespace-nowrap pr-1 leading-none">
                                      {formatTime(labelStartMins)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className={`truncate font-extrabold ${titleSizeClass}`}>{event.title}</div>
                                )}
                                {!isVeryShortEvent && durationMins > 20 ? (
                                  <div className="flex items-center gap-1.5 truncate text-sm font-medium opacity-95">
                                    <svg className="h-4 w-4 shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="truncate">{formatTime(labelStartMins)} - {formatTime(labelEndMins)}</span>
                                  </div>
                                ) : null}
                              </div>
                              <div
                                onMouseDown={(resizeMouseDown) => {
                                  resizeMouseDown.stopPropagation()
                                  const eventStartDate = sourceEvent?.date || dayKey
                                  const eventEndDate = sourceEvent?.end_date || sourceEvent?.date || dayKey
                                  const localStart = event.startHour * 60 + event.startMin
                                  const start = isOvernightLinkedEvent && sourceEvent ? sourceEvent.start_time : localStart
                                  const resizeBaseStart = isOvernightLinkedEvent && !isStartColumn ? localStart : start
                                  const end = event.endHour * 60 + event.endMin
                                  captureOriginalIfNeeded(event.id)
                                  setResizeState({ id: event.id, start, resizeBaseStart, date: dayKey, eventDate: eventStartDate, endDate: eventEndDate })
                                  setPreviewById((prev) => ({
                                    ...prev,
                                    [event.id]: { date: eventStartDate, start_time: start, end_time: end, end_date: eventEndDate },
                                  }))
                                }}
                                className="absolute bottom-0 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-b-md opacity-0 hover:opacity-100 group-hover:opacity-100"
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WeekView
