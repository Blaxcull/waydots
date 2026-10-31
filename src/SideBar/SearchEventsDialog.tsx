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

  // Determine active date from URL or timeStore
  const activeDate = React.useMemo(() => {
    const match = location.pathname.match(/\/(day|week|month|year)\/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
    if (match) {
      const y = parseInt(match[2], 10)
      const m = parseInt(match[3], 10) - 1
      const d = parseInt(match[4], 10)
      const date = new Date(y, m, d)
      if (!Number.isNaN(date.getTime())) return date
    }
    return selectedDate ? new Date(selectedDate) : new Date()
  }, [location.pathname, selectedDate])

  // Compute exact bounds for the current page's calendar cycle
  const { cycleStartStr, cycleEndStr, cycleBadge, searchPlaceholder, emptyMessage } = React.useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0")
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (currentCalendarView === "day") {
      const ymd = toYMD(activeDate)
      const dayLabel = activeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      return {
        cycleStartStr: ymd,
        cycleEndStr: ymd,
        cycleBadge: `Day • ${dayLabel}`,
        searchPlaceholder: `Search events on ${dayLabel}...`,
        emptyMessage: `No events scheduled for this day (${dayLabel}).`,
      }
    }

    if (currentCalendarView === "week") {
      const start = new Date(activeDate)
      start.setDate(activeDate.getDate() - activeDate.getDay()) // Sunday
      const end = new Date(start)
      end.setDate(start.getDate() + 6) // Saturday
      const startStr = toYMD(start)
      const endStr = toYMD(end)
      const weekLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      return {
        cycleStartStr: startStr,
        cycleEndStr: endStr,
        cycleBadge: `Week • ${weekLabel}`,
        searchPlaceholder: `Search this week's events (${weekLabel})...`,
        emptyMessage: `No events scheduled for this week (${weekLabel}).`,
      }
    }

    if (currentCalendarView === "month") {
      const year = activeDate.getFullYear()
      const month = activeDate.getMonth()
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0)
      const monthLabel = activeDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      return {
        cycleStartStr: toYMD(start),
        cycleEndStr: toYMD(end),
        cycleBadge: `Month • ${monthLabel}`,
        searchPlaceholder: `Search ${monthLabel} events...`,
        emptyMessage: `No events scheduled for ${monthLabel}.`,
      }
    }

    // year view
    const year = activeDate.getFullYear()
    return {
      cycleStartStr: `${year}-01-01`,
      cycleEndStr: `${year}-12-31`,
      cycleBadge: `Year • ${year}`,
      searchPlaceholder: `Search ${year} events...`,
      emptyMessage: `No events scheduled for the year ${year}.`,
    }
  }, [activeDate, currentCalendarView])

  const searchableEvents = React.useMemo(() => {
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

      // Strict Calendar Cycle Boundary Check:
      // An event belongs to this page only if it overlaps with [cycleStartStr, cycleEndStr]
      if (eventDate > cycleEndStr || endDate < cycleStartStr) {
        return
      }

      const isAllDay = isAllDayEvent(event)
      const isMultiDay = isMultiDayEvent(event)
      const isTimedMultiDay = isTimedMultiDayEvent(event)
      const isRecurring = !!event.isRecurringInstance || !!(event.repeat && event.repeat !== "None")

      let bucketPriority = 3
      let bucketLabel = formatShortDate(eventDate)

      if (currentCalendarView === "day") {
        if (isRecurring) {
          bucketPriority = 1
          bucketLabel = "Recurring"
        } else if (isAllDay || isMultiDay) {
          bucketPriority = 1
          bucketLabel = "All Day"
        } else {
          bucketPriority = 0
          bucketLabel = "Today"
        }
      } else if (currentCalendarView === "week") {
        const eventD = new Date(`${eventDate}T00:00:00`)
        bucketLabel = eventD.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })
        bucketPriority = eventDate.localeCompare(cycleStartStr)
      } else if (currentCalendarView === "month") {
        bucketLabel = formatShortDate(eventDate)
        bucketPriority = parseInt(eventDate.slice(8, 10), 10) || 0
      } else {
        const eventD = new Date(`${eventDate}T00:00:00`)
        bucketLabel = eventD.toLocaleDateString("en-US", { month: "short" })
        bucketPriority = eventD.getMonth()
      }

      const key = `${event.id}_${eventDate}`
      if (eventMap.has(key)) return

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

    // Only inspect relevant cached days for computed and direct events
    for (const events of Object.values(eventsCache)) events.forEach(addEntry)
    for (const events of Object.values(computedEventsCache)) events.forEach(addEntry)

    return Array.from(eventMap.values())
  }, [computedEventsCache, currentCalendarView, cycleEndStr, cycleStartStr, eventsCache, goalsStore])

  const filteredEvents = React.useMemo(() => {
    const baseResults = [...searchableEvents].sort((a, b) =>
      a.date.localeCompare(b.date) || a.bucketPriority - b.bucketPriority || a.title.localeCompare(b.title)
    )

    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      // Empty query shows up to 10 events belonging to this calendar cycle
      return baseResults.slice(0, 10)
    }

    return searchableEvents
      .map((entry) => {
        const title = entry.title.toLowerCase()
        const notes = entry.notes.toLowerCase()
        const location = entry.location.toLowerCase()
        const bucketLabel = entry.bucketLabel.toLowerCase()
        const dateRangeLabel = entry.dateRangeLabel.toLowerCase()

        let textRank = -1
        if (title === query) textRank = 0
        else if (title.startsWith(query)) textRank = 1
        else if (title.includes(query)) textRank = 2
        else if (location.includes(query)) textRank = 3
        else if (notes.includes(query)) textRank = 4
        else if (bucketLabel.includes(query)) textRank = 5
        else if (dateRangeLabel.includes(query)) textRank = 6

        return { ...entry, textRank }
      })
      .filter((entry) => entry.textRank !== -1)
      .sort((a, b) =>
        a.textRank - b.textRank ||
        a.date.localeCompare(b.date) ||
        a.title.localeCompare(b.title)
      )
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
          <div className="mb-2.5 flex items-center justify-between">
            <span className="rounded-full bg-neutral-200/80 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-neutral-600 uppercase">
              {cycleBadge}
            </span>
            <span className="text-xs text-neutral-400">
              {searchQuery ? `${filteredEvents.length} match${filteredEvents.length === 1 ? "" : "es"}` : `${searchableEvents.length} event${searchableEvents.length === 1 ? "" : "s"} on page`}
            </span>
          </div>
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
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xl sm:text-2xl font-semibold text-neutral-700 outline-none placeholder:text-neutral-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="rounded-full p-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-600"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
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
            <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] p-6 text-center">
              <div>
                <p className="text-base font-semibold text-neutral-600">
                  {searchQuery ? `No matching events found on this ${currentCalendarView}` : emptyMessage}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {searchQuery ? "Try searching for a different title or location." : "Only events occurring within this calendar page cycle appear here."}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
