// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Event } from "@/store/eventsStore"

const storage = new Map<string, string>()

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => {
      storage.clear()
    },
  },
})

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const { default: DayView } = await import("@/Day_view/DayView")
const { useEventsStore } = await import("@/store/eventsStore")
const { useGoalsStore } = await import("@/store/goalsStore")
const { useTimeStore } = await import("@/store/timeStore")

const initialEventsState = useEventsStore.getInitialState()
const initialGoalsState = useGoalsStore.getInitialState()
const initialTimeState = useTimeStore.getInitialState()

const buildEvent = (overrides: Partial<Event>): Event => ({
  id: overrides.id ?? "event-1",
  user_id: overrides.user_id ?? "user-1",
  title: overrides.title ?? "Event",
  date: overrides.date ?? "2026-04-10",
  end_date: overrides.end_date ?? overrides.date ?? "2026-04-10",
  start_time: overrides.start_time ?? 0,
  end_time: overrides.end_time ?? 0,
  description: overrides.description,
  notes: overrides.notes,
  urls: overrides.urls,
  color: overrides.color,
  is_all_day: overrides.is_all_day,
  location: overrides.location,
  repeat: overrides.repeat,
  series_start_date: overrides.series_start_date,
  series_end_date: overrides.series_end_date,
  reminder: overrides.reminder,
  goalType: overrides.goalType,
  goal: overrides.goal,
  goalColor: overrides.goalColor,
  goalIcon: overrides.goalIcon,
  earlyReminder: overrides.earlyReminder,
  created_at: overrides.created_at,
  updated_at: overrides.updated_at,
  isTemp: overrides.isTemp,
})

function renderDayView(initialPath = "/day/2026/4/10") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/day/:year/:month/:day" element={<DayView />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  storage.clear()
  act(() => {
    useEventsStore.setState(initialEventsState, true)
    useGoalsStore.setState(initialGoalsState, true)
    useTimeStore.setState(initialTimeState, true)
    useEventsStore.setState({
      eventsCache: {
        "2026-04-10": [
          buildEvent({
            id: "all-day-1",
            title: "Offsite",
            date: "2026-04-10",
            end_date: "2026-04-10",
            start_time: 0,
            end_time: 0,
            is_all_day: true,
          }),
        ],
      },
      computedEventsCache: {},
      recurringEventsCache: {},
      eventExceptionsCache: {},
      selectedEventId: null,
      liveEventTimes: {},
    })
    useGoalsStore.setState({ store: {} })
    useTimeStore.setState({ selectedDate: new Date("2026-04-10T09:00:00"), dateInfo: null })
  })
})

afterEach(() => {
  cleanup()
})

describe("DayView escape deletion", () => {
  it("deletes a selected all-day event when Escape is pressed", async () => {
    renderDayView()

    fireEvent.click(screen.getByText("Offsite"))
    expect(useEventsStore.getState().selectedEventId).toBe("all-day-1")

    fireEvent.keyDown(window, { key: "Escape" })

    expect(useEventsStore.getState().selectedEventId).toBeNull()
    expect(useEventsStore.getState().getEventById("all-day-1")).toBeNull()
    expect(screen.queryByText("Offsite")).not.toBeInTheDocument()
  })
})
