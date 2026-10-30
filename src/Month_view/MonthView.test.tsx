// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
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

const { default: MonthView } = await import("@/Month_view/MonthView")
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
  start_time: overrides.start_time ?? 540,
  end_time: overrides.end_time ?? 600,
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderMonthView(initialPath = "/month/2026/4/15") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/month/:year/:month/:day" element={<><MonthView /><LocationProbe /></>} />
        <Route path="/day/:year/:month/:day" element={<LocationProbe />} />
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
      eventsCache: {},
      computedEventsCache: {},
      recurringEventsCache: {},
      eventExceptionsCache: {},
      selectedEventId: null,
      liveEventTimes: {},
    })
    useGoalsStore.setState({ store: {} })
    useTimeStore.setState({ selectedDate: new Date("2026-04-15T09:00:00"), dateInfo: null })
  })
})

afterEach(() => {
  cleanup()
})

describe("MonthView", () => {
  it("renders the route month and year heading", () => {
    renderMonthView()

    expect(screen.getByRole("heading", { name: /april 2026/i })).toBeInTheDocument()
  })

  it("selects a day cell and updates the month route when clicked", async () => {
    const user = userEvent.setup()
    renderMonthView()

    await user.click(screen.getByRole("button", { name: "April 10, 2026" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/month/2026/4/10")
    expect(useTimeStore.getState().selectedDate?.getDate()).toBe(10)
    expect(useEventsStore.getState().selectedEventId).toBeNull()
  })

  it("opens the day route on day-cell double click", async () => {
    const user = userEvent.setup()
    renderMonthView()

    await user.dblClick(screen.getByRole("button", { name: "April 18, 2026" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/day/2026/4/18")
  })

  it("quick-creates a local event for the requested day and selects it", async () => {
    const user = userEvent.setup()
    renderMonthView()

    await user.click(screen.getByRole("button", { name: "Add event on April 9" }))

    const createdEvents = useEventsStore.getState().getEventsForDate(new Date("2026-04-09T00:00:00"))
    expect(createdEvents).toHaveLength(1)
    expect(createdEvents[0]).toMatchObject({
      title: "New Event",
      date: "2026-04-09",
      end_date: "2026-04-09",
      isTemp: true,
    })
    expect(useEventsStore.getState().selectedEventId).toBe(createdEvents[0].id)
    expect(useTimeStore.getState().selectedDate?.getDate()).toBe(9)
  })

  it("pins a newly created draft to the top until it is deselected", async () => {
    const user = userEvent.setup()
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-09": [
            buildEvent({
              id: "early-1",
              title: "Breakfast",
              date: "2026-04-09",
              end_date: "2026-04-09",
              start_time: 480,
              end_time: 510,
            }),
            buildEvent({
              id: "late-1",
              title: "Review",
              date: "2026-04-09",
              end_date: "2026-04-09",
              start_time: 720,
              end_time: 780,
            }),
          ],
        },
      })
    })

    renderMonthView()

    await user.click(screen.getAllByRole("button", { name: "Add event on April 9" })[0])

    const april9Cell = screen.getAllByRole("button", { name: "April 9, 2026" })[0]
    expect(
      screen.getByRole("button", {
        name: "Open spanning event New Event starting 2026-04-09",
      })
    ).toBeInTheDocument()

    await user.click(april9Cell)

    const eventButtonsAfterDeselect = within(april9Cell)
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.startsWith("Open event "))

    expect(eventButtonsAfterDeselect[0]).toHaveAccessibleName("Open event 08:00 Breakfast on April 9, 2026")
  })

  it("renders timed events and selects them on click", async () => {
    const user = userEvent.setup()
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-10": [
            buildEvent({
              id: "timed-1",
              title: "Standup",
              date: "2026-04-10",
              end_date: "2026-04-10",
              start_time: 570,
              end_time: 600,
            }),
          ],
        },
      })
    })

    renderMonthView()

    const eventButton = screen.getByRole("button", {
      name: "Open event 09:30 Standup on April 10, 2026",
    })
    expect(eventButton).toBeInTheDocument()

    await user.click(eventButton)

    expect(useEventsStore.getState().selectedEventId).toBe("timed-1")
    expect(useTimeStore.getState().selectedDate?.getDate()).toBe(10)
  })

  it("deletes the selected event when Escape is pressed", async () => {
    const user = userEvent.setup()
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-10": [
            buildEvent({
              id: "timed-esc",
              title: "Delete Me",
              date: "2026-04-10",
              end_date: "2026-04-10",
              start_time: 570,
              end_time: 600,
            }),
          ],
        },
      })
    })

    renderMonthView()

    await user.click(
      screen.getByRole("button", {
        name: "Open event 09:30 Delete Me on April 10, 2026",
      })
    )
    expect(useEventsStore.getState().selectedEventId).toBe("timed-esc")

    fireEvent.keyDown(window, { key: "Escape" })

    expect(useEventsStore.getState().selectedEventId).toBeNull()
    expect(useEventsStore.getState().getEventById("timed-esc")).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "Open event 09:30 Delete Me on April 10, 2026",
      })
    ).not.toBeInTheDocument()
  })

  it("shows hidden event overflow and opens the day view from the more button", async () => {
    const user = userEvent.setup()
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-12": Array.from({ length: 5 }, (_, index) =>
            buildEvent({
              id: `overflow-${index + 1}`,
              title: `Event ${index + 1}`,
              date: "2026-04-12",
              end_date: "2026-04-12",
              start_time: 540 + index * 30,
              end_time: 570 + index * 30,
            })
          ),
        },
      })
    })

    renderMonthView()

    const dayCell = screen.getByRole("button", { name: "April 12, 2026" })
    const moreButton = within(dayCell).getByRole("button", { name: "2 more" })
    expect(moreButton).toBeInTheDocument()

    await user.click(moreButton)

    expect(screen.getByTestId("location")).toHaveTextContent("/day/2026/4/12")
  })

  it("renders multi-day events in the spanning row and selects the clicked day segment", () => {
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-07": [
            buildEvent({
              id: "trip-1",
              title: "Road Trip",
              date: "2026-04-07",
              end_date: "2026-04-09",
              start_time: 480,
              end_time: 1020,
              is_all_day: true,
            }),
          ],
        },
      })
    })

    renderMonthView()

    const spanningButton = screen.getByRole("button", {
      name: "Open spanning event Road Trip starting 2026-04-07",
    })

    Object.defineProperty(spanningButton, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 300,
        height: 24,
        top: 0,
        left: 0,
        right: 300,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    fireEvent.click(spanningButton, { clientX: 150 })

    expect(useEventsStore.getState().selectedEventId).toBe("trip-1")
    expect(useTimeStore.getState().selectedDate?.getFullYear()).toBe(2026)
    expect(useTimeStore.getState().selectedDate?.getMonth()).toBe(3)
    expect(useTimeStore.getState().selectedDate?.getDate()).toBe(8)
  })

  it("does not reserve multi-day spacing for dates in the same week that have no spanning events", () => {
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-07": [
            buildEvent({
              id: "trip-1",
              title: "Road Trip",
              date: "2026-04-07",
              end_date: "2026-04-09",
              start_time: 480,
              end_time: 1020,
              is_all_day: true,
            }),
          ],
          "2026-04-10": [
            buildEvent({
              id: "solo-1",
              title: "Standup",
              date: "2026-04-10",
              end_date: "2026-04-10",
              start_time: 540,
              end_time: 570,
            }),
          ],
        },
      })
    })

    renderMonthView()

    const april10Cells = screen.getAllByRole("button", { name: "April 10, 2026" })
    const currentMonthCell = april10Cells.find((cell) =>
      !within(cell).queryByText("Apr")
    )

    expect(currentMonthCell).toHaveStyle({ paddingTop: "34px" })
    expect(
      within(currentMonthCell as HTMLElement).getByRole("button", {
        name: "Open event 09:00 Standup on April 10, 2026",
      })
    ).toBeInTheDocument()
  })

  it("moves a timed event to another date by dragging it onto a day cell", () => {
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-10": [
            buildEvent({
              id: "move-1",
              title: "Move Me",
              date: "2026-04-10",
              end_date: "2026-04-10",
              start_time: 570,
              end_time: 630,
            }),
          ],
        },
      })
    })

    renderMonthView()

    const eventButton = screen.getByRole("button", {
      name: "Open event 09:30 Move Me on April 10, 2026",
    })
    const targetCell = screen.getByRole("button", { name: "April 14, 2026" })
    const dataTransfer = {
      setData: () => {},
      getData: () => "move-1",
      effectAllowed: "move",
      dropEffect: "move",
    }

    fireEvent.dragStart(eventButton, { dataTransfer })
    fireEvent.dragOver(targetCell, { dataTransfer })
    fireEvent.drop(targetCell, { dataTransfer })

    expect(useEventsStore.getState().getEventById("move-1")).toMatchObject({
      date: "2026-04-14",
      end_date: "2026-04-14",
    })
    expect(useTimeStore.getState().selectedDate?.getFullYear()).toBe(2026)
    expect(useTimeStore.getState().selectedDate?.getMonth()).toBe(3)
    expect(useTimeStore.getState().selectedDate?.getDate()).toBe(14)
  })

  it("moves a multi-day event and preserves its span when dropped on another date", () => {
    act(() => {
      useEventsStore.setState({
        eventsCache: {
          "2026-04-07": [
            buildEvent({
              id: "trip-move",
              title: "Road Trip",
              date: "2026-04-07",
              end_date: "2026-04-09",
              start_time: 480,
              end_time: 1020,
              is_all_day: true,
            }),
          ],
        },
      })
    })

    renderMonthView()

    const spanningButton = screen.getByRole("button", {
      name: "Open spanning event Road Trip starting 2026-04-07",
    })
    const targetCell = screen.getByRole("button", { name: "April 14, 2026" })
    const dataTransfer = {
      setData: () => {},
      getData: () => "trip-move",
      effectAllowed: "move",
      dropEffect: "move",
    }

    fireEvent.dragStart(spanningButton, { dataTransfer })
    fireEvent.dragOver(targetCell, { dataTransfer })
    fireEvent.drop(targetCell, { dataTransfer })

    expect(useEventsStore.getState().getEventById("trip-move")).toMatchObject({
      date: "2026-04-14",
      end_date: "2026-04-16",
    })
  })
})
