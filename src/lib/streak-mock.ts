export type RawEventStatus = "done" | "pending" | "missed"

export type RawEvent = {
  id: string
  title: string
  date: string
  start_time: number
  end_time: number
  is_all_day?: boolean
  status: RawEventStatus
  goal?: string
  goalType?: string
}

const APP_OPEN_DATES_KEY = "streak:app-open-dates"

function readStoredDates(): Record<string, string[]> {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.localStorage.getItem(APP_OPEN_DATES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredDates(data: Record<string, string[]>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(APP_OPEN_DATES_KEY, JSON.stringify(data))
}

export function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function minsToClock(minutes: number) {
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

export function minsToHuman(minutes: number) {
  const roundedMinutes = Math.max(0, Math.round(minutes))
  const hrs = Math.floor(roundedMinutes / 60)
  const mins = roundedMinutes % 60

  if (hrs <= 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

export function categoryTarget(category: string) {
  const targets: Record<string, number> = {
    Study: 2,
    Reading: 1,
    Fitness: 1,
    Work: 4,
    Mindfulness: 1,
    Breaks: 1,
    Other: 1,
  }

  return targets[category] ?? 1
}

export function getAppOpenDates(userId = "guest") {
  const stored = readStoredDates()
  return stored[userId] ?? []
}

export async function fetchAppOpenDates(userId: string) {
  return getAppOpenDates(userId)
}

export async function addAppOpenDate(userId: string, date: string) {
  const stored = readStoredDates()
  const existing = new Set(stored[userId] ?? [])
  existing.add(date)
  stored[userId] = [...existing].sort()
  writeStoredDates(stored)
}

export function computeStreak(events: RawEvent[]) {
  const streakDays = new Set(events.map((event) => event.date))

  if (streakDays.size === 0) {
    return { current: 0, longest: 0 }
  }

  const ordered = [...streakDays].sort()
  let longest = 0
  let run = 0
  let previous: Date | null = null

  for (const day of ordered) {
    const currentDate = new Date(`${day}T00:00:00`)
    if (previous) {
      const diff = Math.round((currentDate.getTime() - previous.getTime()) / 86_400_000)
      run = diff === 1 ? run + 1 : 1
    } else {
      run = 1
    }

    longest = Math.max(longest, run)
    previous = currentDate
  }

  let current = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  while (streakDays.has(isoDate(cursor))) {
    current += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { current, longest }
}
