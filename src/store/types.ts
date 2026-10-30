// Primitive value types that can be stored in an event field
export type EventFieldValue = string | number | boolean | string[] | undefined

// Core event shape as stored in the database
export interface Event {
  id: string
  user_id: string
  title: string
  description?: string
  notes?: string
  urls?: string[]
  date: string // ISO date string YYYY-MM-DD
  end_date: string // ISO date string YYYY-MM-DD for multi-day events
  start_time: number // Minutes since midnight
  end_time: number // Minutes since midnight
  color?: string
  is_all_day?: boolean
  location?: string
  repeat?: string // "None" | "Daily" | "Weekly" | "Monthly" | "Yearly"
  status?: number
  series_start_date?: string
  series_end_date?: string
  reminder?: string
  goalType?: string
  goal?: string
  goalColor?: string
  goalIcon?: string
  earlyReminder?: string
  created_at?: string
  updated_at?: string
  isTemp?: boolean // Marks optimistic local events not yet persisted
}

// Event with additional UI-only fields for recurring virtual instances
export interface CalendarEvent extends Event {
  isRecurringInstance?: boolean
  seriesMasterId?: string
  occurrenceDate?: string
}

// Exception to a recurring series (overrides specific occurrence properties)
export interface EventException {
  id: string
  series_id: string
  user_id?: string
  date: string
  start_time?: number
  end_time?: number
  title?: string
  deleted?: boolean
  created_at?: string
}

// Shape for creating or updating events (excludes server-generated fields)
export interface NewEvent {
  title: string
  description?: string
  notes?: string
  urls?: string[]
  date: string
  end_date: string
  start_time: number
  end_time: number
  color?: string
  is_all_day?: boolean
  location?: string
  repeat?: string
  status?: number
  series_start_date?: string
  series_end_date?: string
  reminder?: string
  goalType?: string
  goal?: string
  goalColor?: string
  goalIcon?: string
  earlyReminder?: string
  id?: string // Optional for optimistic temp events
}

// Cache structures keyed by date (YYYY-MM-DD) or month (YYYY-MM)
export interface EventsCache {
  [date: string]: Event[]
}

export interface ComputedEventsCache {
  [date: string]: CalendarEvent[]
}
