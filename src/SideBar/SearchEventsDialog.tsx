import React from "react"
import { useNavigate, useLocation } from "react-router-dom"
import SearchIcon from "@/assets/search.svg"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useTimeStore } from "@/store/timeStore"
import { useEventsStore } from "@/store/eventsStore"
import { resolveGoalColorForEvent, useGoalsStore } from "@/store/goalsStore"
import { getEventVisualColors, isAllDayEvent, isMultiDayEvent, isTimedMultiDayEvent } from "@/lib/eventUtils"

type CalendarRouteView = "day" | "week" | "month" | "year"

function navigateToDate(navigate: ReturnType<typeof useNavigate>, date: Date, view: CalendarRouteView) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (view === "week") return navigate(`/week/${year}/${month}/${day}`)
  if (view === "month") return navigate(`/month/${year}/${month}/${day}`)
  if (view === "year") return navigate(`/year/${year}/${month}/${day}`)
  navigate(`/day/${year}/${month}/${day}`)
}

interface SearchEventsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchEventsDialog({ open, onOpenChange }: SearchEventsDialogProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentCalendarView: CalendarRouteView = location.pathname.startsWith("/week")
    ? "week"
    : location.pathname.startsWith("/month")
      ? "month"
      : location.pathname.startsWith("/year")
        ? "year"
        : "day"
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const setScrollToEventId = useEventsStore((state) => state.setScrollToEventId)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)
  const eventsCache = useEventsStore((state) => state.eventsCache)
  const computedEventsCache = useEventsStore((state) => state.computedEventsCache)
  const goalsStore = useGoalsStore((state) => state.store)
  const [searchQuery, setSearchQuery] = React.useState("")

  const searchableEvents = React.useMemo(() => {
    const selectedDateStr = selectedDate
      ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
      : null
    const selectedMonthKey = selectedDateStr?.slice(0, 7) ?? null
    const selectedYear = selectedDateStr?.slice(0, 4) ?? null
    const eventMap = new Map<string, {
      id: string
      title: string
      notes: string
      location: string
      date: string
      endDate: string
      isAllDay: boolean
      isMultiDay: boolean
      timeLabel: string
      dateRangeLabel: string
      bucketPriority: number
      bucketLabel: string
      color?: string
    }>()

    const buildTimeLabel = (startMinutes: number, endMinutes: number) => {
      const formatTime = (mins: number) => {
        const hours = Math.floor(mins / 60) % 24
        const minutes = mins % 60
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
      }
      return `${formatTime(startMinutes)} - ${formatTime(endMinutes)}`
    }

    const formatShortDate = (dateStr: string) =>
      new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

    const addEntry = (event: any) => {
      const eventDate = typeof event?.date === "string" ? event.date : null
      if (!eventDate) return

      const endDate = typeof event.end_date === "string" ? event.end_date : eventDate
      const isAllDay = isAllDayEvent(event)
      const isMultiDay = isMultiDayEvent(event)
      const isTimedMultiDay = isTimedMultiDayEvent(event)
      const isRecurring = !!event.isRecurringInstance || !!(event.repeat && event.repeat !== "None")

      let bucketPriority = 5
      let bucketLabel = "Other events"
      if (isRecurring) {
        bucketPriority = 2
        bucketLabel = "Repeat"
      } else if (selectedDateStr && eventDate === selectedDateStr && isMultiDay) {
        bucketPriority = 1
        bucketLabel = "Multi Day"
      } else if (selectedDateStr && eventDate === selectedDateStr && !isAllDay) {
        bucketPriority = 0
        bucketLabel = "Current day"
      } else if (selectedDateStr && eventDate === selectedDateStr && isAllDay) {
        bucketPriority = 2
        bucketLabel = "All Day"
      } else if (selectedMonthKey && eventDate.slice(0, 7) === selectedMonthKey) {
        bucketPriority = 3
        bucketLabel = "This month"
      } else if (selectedYear && eventDate.slice(0, 4) === selectedYear) {
        bucketPriority = 4
        bucketLabel = "This year"
      }

      const key = isRecurring ? `${(event as any).seriesMasterId || event.id}-repeat` : `${event.id}`
      const existing = eventMap.get(key)
      if (existing && existing.bucketPriority <= bucketPriority) return

      eventMap.set(key, {
        id: event.id,
        title: event.title || "New Event",
        notes: event.notes || "",
        location: event.location || "",
        date: eventDate,
        endDate,
        isAllDay,
        isMultiDay,
        timeLabel: isTimedMultiDay
          ? buildTimeLabel(event.start_time, event.end_time)
          : isMultiDay || isAllDay
            ? "All Day"
            : buildTimeLabel(event.start_time, event.end_time),
        dateRangeLabel: `${formatShortDate(eventDate)} - ${formatShortDate(endDate)}`,
        bucketPriority,
        bucketLabel,
        color: event.goalColor || resolveGoalColorForEvent(goalsStore, event) || event.color,
      })
    }

    for (const events of Object.values(eventsCache)) events.forEach(addEntry)
    for (const events of Object.values(computedEventsCache)) events.forEach(addEntry)
    return Array.from(eventMap.values())
  }, [computedEventsCache, eventsCache, goalsStore, selectedDate])

  const filteredEvents = React.useMemo(() => {
    const baseResults = [...searchableEvents]
      .sort((a, b) => a.bucketPriority - b.bucketPriority || a.date.localeCompare(b.date) || a.title.localeCompare(b.title))

    const query = searchQuery.trim().toLowerCase()
    if (!query) return baseResults.slice(0, 3)

    const matched = searchableEvents
      .map((entry) => {
        const title = entry.title.toLowerCase()
        const notes = entry.notes.toLowerCase()
        const location = entry.location.toLowerCase()
        const bucketLabel = entry.bucketLabel.toLowerCase()
        const dateRangeLabel = entry.dateRangeLabel.toLowerCase()
        const multiDayLabel = entry.isMultiDay ? "multi day" : ""

        let textRank = -1
        if (title === query) textRank = 0
        else if (title.startsWith(query)) textRank = 1
        else if (title.includes(query)) textRank = 2
        else if (location.includes(query)) textRank = 3
        else if (notes.includes(query)) textRank = 4
        else if (bucketLabel.includes(query)) textRank = 5
        else if (dateRangeLabel.includes(query)) textRank = 6
        else if (multiDayLabel.includes(query)) textRank = 7

        return { ...entry, textRank }
      })
      .filter((entry) => entry.textRank !== -1)
      .sort((a, b) =>
        a.bucketPriority - b.bucketPriority ||
        a.textRank - b.textRank ||
        a.date.localeCompare(b.date) ||
        a.title.localeCompare(b.title)
      )
      .slice(0, 3)

    if (matched.length >= 3) return matched

    const usedIds = new Set(matched.map((entry) => entry.id))
    const filler = baseResults.filter((entry) => !usedIds.has(entry.id)).slice(0, 3 - matched.length)
    return [...matched, ...filler]
  }, [searchQuery, searchableEvents])

  const openSearchResult = React.useCallback((eventId: string, dateStr: string) => {
    onOpenChange(false)
    setSearchQuery("")
    navigateToDate(navigate, new Date(`${dateStr}T00:00:00`), currentCalendarView)
    window.setTimeout(() => {
      setScrollToEventId(eventId)
      setSelectedEvent(eventId)
    }, 80)
  }, [currentCalendarView, navigate, onOpenChange, setScrollToEventId, setSelectedEvent])

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,92vw)] overflow-hidden rounded-[28px] border border-gray-200 bg-neutral-100 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-[#e7e7e6] px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dddddc]">
              <img src={SearchIcon} alt="" className="h-5 w-5 opacity-60" />
            </div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredEvents.length > 0) {
                  e.preventDefault()
                  const first = filteredEvents[0]
                  openSearchResult(first.id, first.date)
                }
              }}
              placeholder="Search Events"
              className="w-full bg-transparent text-2xl font-semibold text-neutral-700 outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto px-3 py-3">
          {filteredEvents.length > 0 ? (
            <div className="space-y-2">
              {filteredEvents.map((event) => {
                const { backgroundColor } = getEventVisualColors(event.color)
                const showTypeLabel = event.isMultiDay || event.isAllDay
                const typeLabel = event.isMultiDay ? "MULTI DAY" : event.isAllDay ? "ALL DAY" : null
                const showBucketLabel = !showTypeLabel
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openSearchResult(event.id, event.date)}
                    className="group flex w-full items-start justify-between rounded-[24px] border border-transparent bg-[#ececeb] px-4 py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="mt-0.5 inline-flex h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ backgroundColor }} />
                        <div className="truncate text-[17px] font-semibold text-neutral-800">{event.title}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-500">
                        {showBucketLabel && (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                            {event.bucketLabel}
                          </span>
                        )}
                        {showTypeLabel ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-neutral-500">
                            {typeLabel}
                          </span>
                        ) : null}
                        {(event.timeLabel && (!showTypeLabel || event.isMultiDay)) ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {event.timeLabel}
                          </span>
                        ) : null}
                        {event.isMultiDay ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {event.dateRangeLabel}
                          </span>
                        ) : (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {event.date}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-white text-xl font-semibold leading-none text-neutral-300 transition-colors duration-200 group-hover:text-neutral-500">
                      &gt;
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] text-center">
              <div>
                <p className="text-base font-semibold text-neutral-500">No matching events</p>
                <p className="mt-1 text-sm text-neutral-400">Try a title, place, or repeat event name.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
