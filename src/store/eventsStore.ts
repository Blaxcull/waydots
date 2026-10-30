/**
 * Primary Zustand store for calendar events.
 *
 * Responsibilities:
 * - Cache events fetched from Supabase for a sliding date window
 * - Generate virtual recurring event instances on-the-fly
 * - Provide optimistic local-first CRUD operations
 * - Manage UI state for event selection and recurring dialogs
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, getSafeSession } from '@/lib/supabase'

import type {
  Event,
  CalendarEvent,
  EventException,
  NewEvent,
  EventFieldValue,
  EventsCache,
  ComputedEventsCache,
} from './types'

import {
  formatDate,
  addDaysToDateStr,
  addDays,
  getMonthKey,
} from './dateUtils'

import {
  getNextOccurrence,
  isSeriesActuallyRecurring,
} from './recurringUtils'

import {
  buildEventForDb,
  filterUpdatesForDb,
  dbRowToEvent,
  generateTempId,
} from './dbHelpers'
import {
  buildCanonicalEventsForDate,
  buildRecurringEventsForMonth,
  eventMatchesGoalSyncRange,
  extractMasterId,
  findEventInCache,
  findMasterEvent,
  getClockwiseDurationMinutes,
  getBucketDateRange,
  getGoalTypeLabel,
  compareEventsByDisplayOrder,
  isVirtualEventId,
  normalizeGoalMetadataForDateChange,
  scheduleIdleStoreWrite,
  VIRTUAL_ID_PATTERN,
} from './eventsStore.helpers'

// Re-export types and functions so existing imports from '@/store/eventsStore' still work
export type { EventFieldValue, Event, CalendarEvent, EventException, NewEvent }
export { formatDate } from './dateUtils'
export { getEventsForDateSnapshot, getEventsForDatesSnapshot } from './eventsStore.helpers'

// How many days before/after center date to fetch
const CACHE_WINDOW_DAYS = 45
const PERSIST_PAST_DAYS = 30
const PERSIST_FUTURE_DAYS = 90
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000
const inFlightTempSaveIds = new Set<string>()
const inFlightFetches = new Set<string>()
const INITIAL_TEMP_SAVE_DELAY_MS = 600

/**
 * Insert an event row only if no exact duplicate exists in the DB.
 * Duplicate = same user_id, date, start_time, end_time, and title.
 */
async function insertIfNotDuplicate(
  payload: Record<string, any>,
  userId: string
): Promise<{ data: any; error: any }> {
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('user_id', userId)
    .eq('date', payload.date)
    .eq('start_time', payload.start_time)
    .eq('end_time', payload.end_time)
    .eq('title', payload.title)
    .limit(1)

  if (existing && existing.length > 0) {
    return { data: existing[0], error: null }
  }

  return supabase.from('events').insert([payload]).select().single()
}

// ---- Store Interface ----

interface EventsState {
  // Cache storage
  eventsCache: EventsCache
  computedEventsCache: ComputedEventsCache
  recurringEventsCache: Record<string, CalendarEvent[]>
  eventExceptionsCache: Record<string, EventException[]>

  // Current cached date window
  cacheStartDate: string | null
  cacheEndDate: string | null
  cachedUserId: string | null
  lastPersistedAt: number | null

  // Loading / error
  isLoading: boolean
  isAutoCompleting: boolean
  loadingCount: number
  error: string | null

  // Sync tracking for optimistic updates
  pendingSyncs: Set<string>
  pendingUpdates: Map<string, Partial<NewEvent>[]>
  pendingDeletes: Set<string>

  // UI state
  selectedEventId: string | null
  scrollToEventId: string | null
  scrollToTop: boolean
  saveTrigger: number
  hasEditsEventId: string | null
  liveEventTimes: Record<string, { start_time: number; end_time: number; date?: string; end_date?: string }>

  // Recurring action dialog
  recurringDialogOpen: boolean
  recurringDialogEvent: CalendarEvent | null
  recurringDialogActionType: 'edit' | 'delete' | null
  recurringDialogCallback: ((choice: string) => void) | null

  // Actions
  fetchEventsWindow: (centerDate: Date) => void
  addEvent: (event: NewEvent) => Promise<Event>
  addEventOptimistic: (event: NewEvent) => Promise<Event>
  addEventLocal: (event: NewEvent) => Event
  saveTempEvent: (tempEventId: string) => Promise<void>
  updateEvent: (id: string, updates: Partial<NewEvent>) => Promise<Event | null>
  updateAllInSeries: (seriesMasterId: string, updates: Partial<NewEvent>) => Promise<void>
  deleteEvent: (id: string) => Promise<boolean>
  getEventsForDate: (date: Date) => CalendarEvent[]
  getEventById: (id: string) => CalendarEvent | null
  clearCache: () => void
  isEventSyncing: (eventId: string) => boolean
  isAnyEventSyncing: () => boolean
  setSelectedEvent: (id: string | null) => void
  setScrollToEventId: (id: string | null) => void
  setScrollToTop: (value: boolean) => void
  updateEventField: (id: string, field: keyof NewEvent, value: EventFieldValue) => void
  updateEventFields: (id: string, updates: Partial<NewEvent>) => void
  syncGoalLinkedEvents: (params: {
    columnType: 'week' | 'month' | 'year' | 'life'
    bucketKey: string
    previousGoalText: string
    nextGoalText: string
    color?: string
    icon?: string
  }) => Promise<void>
  syncEventsWithDeletedGoal: (goalName: string, goalTypeLabel: string) => void
  saveSelectedEvent: () => Promise<void>
  autoCompletePastEvents: (now?: Date) => Promise<void>
  showRecurringDialog: (event: CalendarEvent, actionType: 'edit' | 'delete', callback: (choice: string) => void) => void
  closeRecurringDialog: () => void
  setHasEditsEventId: (id: string | null) => void
  previewEventTime: (id: string, start_time: number, end_time: number) => void
  setLiveEventTime: (id: string, start_time: number, end_time: number, date?: string, end_date?: string) => void
  clearLiveEventTime: (id?: string) => void
  splitRecurringEvent: (event: CalendarEvent, selectedDate: string, newStartTime?: number, newEndTime?: number, updates?: Partial<NewEvent>) => Promise<void>
  updateThisAndFollowing: (event: CalendarEvent, selectedDate: string, newStartTime?: number, newEndTime?: number, updates?: Partial<NewEvent>) => Promise<void>
  deleteSingleOccurrence: (event: CalendarEvent, selectedDate: string) => Promise<void>
}

// ---- Helpers ----

const buildPersistWindow = () => {
  const now = new Date()
  return {
    minDate: formatDate(addDays(now, -PERSIST_PAST_DAYS)),
    maxDate: formatDate(addDays(now, PERSIST_FUTURE_DAYS)),
  }
}

const isValidDateKey = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
)

const normalizeEventForCache = (event: Event | null | undefined): Event | null => {
  if (!event || typeof event.id !== 'string' || !isValidDateKey(event.date)) return null
  if (typeof event.start_time !== 'number' || typeof event.end_time !== 'number') return null

  return {
    ...event,
    end_date: isValidDateKey(event.end_date) ? event.end_date : event.date,
  }
}

const sanitizeEventsCache = (eventsCache: EventsCache): EventsCache => {
  const nextCache: EventsCache = {}

  for (const events of Object.values(eventsCache)) {
    if (!Array.isArray(events)) continue

    for (const event of events) {
      const normalizedEvent = normalizeEventForCache(event)
      if (!normalizedEvent) continue

      if (!nextCache[normalizedEvent.date]) nextCache[normalizedEvent.date] = []
      nextCache[normalizedEvent.date].push(normalizedEvent)
    }
  }

  for (const events of Object.values(nextCache)) {
    events.sort(compareEventsByDisplayOrder)
  }

  return nextCache
}

const prunePersistedEventsCache = (eventsCache: EventsCache) => {
  const { minDate, maxDate } = buildPersistWindow()
  const sanitizedCache = sanitizeEventsCache(eventsCache)

  return Object.fromEntries(
    Object.entries(sanitizedCache)
      .filter(([dateKey]) => dateKey >= minDate && dateKey <= maxDate)
      .map(([dateKey, events]) => [dateKey, events.filter((event) => event.isTemp !== true)])
      .filter(([, events]) => events.length > 0)
  )
}

const prunePersistedExceptionsCache = (
  eventExceptionsCache: Record<string, EventException[]>,
  eventsCache: EventsCache
) => {
  const retainedMasterIds = new Set<string>()

  Object.values(eventsCache).forEach((events) => {
    events.forEach((event) => {
      if (event.repeat && event.repeat !== 'None') {
        retainedMasterIds.add(event.id)
      }
      if (isVirtualEventId(event.id)) {
        retainedMasterIds.add(extractMasterId(event.id))
      }
    })
  })

  return Object.fromEntries(
    Object.entries(eventExceptionsCache).filter(([masterId]) => retainedMasterIds.has(masterId))
  )
}

const eventsLikelyMatch = (a: Event, b: Event) => (
  a.date === b.date &&
  (a.end_date || a.date) === (b.end_date || b.date) &&
  a.start_time === b.start_time &&
  a.end_time === b.end_time &&
  (a.title || '') === (b.title || '') &&
  (a.repeat || 'None') === (b.repeat || 'None')
)

const hasEventPassed = (event: Event, now: Date) => {
  const todayKey = formatDate(now)
  const endDate = event.end_date || event.date

  if (endDate < todayKey) return true
  if (endDate > todayKey) return false
  if (event.is_all_day) return false

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return event.end_time <= currentMinutes
}

const getInitialEventStatus = (event: NewEvent, now: Date) => {
  const candidate: Event = {
    id: 'temp-status-check',
    user_id: 'temp-user',
    title: event.title,
    date: event.date,
    end_date: event.end_date || event.date,
    start_time: event.start_time,
    end_time: event.end_time,
    is_all_day: event.is_all_day,
    repeat: event.repeat,
    status: event.status ?? 0,
  }

  const isRecurringSeriesMaster =
    !!candidate.repeat &&
    candidate.repeat !== 'None'

  if (isRecurringSeriesMaster) {
    return event.status ?? 0
  }

  // Only auto-complete if status is 0 (initial/pending).
  // Status 2 is "manually uncompleted" and should be respected.
  return (hasEventPassed(candidate, now) && (event.status ?? 0) === 0) ? 1 : (event.status ?? 0)
}

// ---- Store ----

export const useEventsStore = create<EventsState>()(
  persist(
    (set, get) => ({
      eventsCache: {},
      computedEventsCache: {},
      recurringEventsCache: {},
      eventExceptionsCache: {},
      cacheStartDate: null,
      cacheEndDate: null,
      cachedUserId: null,
      lastPersistedAt: null,
      isLoading: false,
      isAutoCompleting: false,
      loadingCount: 0,
      error: null,
      pendingSyncs: new Set<string>(),
      pendingUpdates: new Map<string, Partial<NewEvent>[]>(),
      pendingDeletes: new Set<string>(),
      selectedEventId: null,
      scrollToEventId: null,
      scrollToTop: false,
      saveTrigger: 0,
      recurringDialogOpen: false,
      recurringDialogEvent: null,
      recurringDialogActionType: null,
      recurringDialogCallback: null,
      hasEditsEventId: null,
      liveEventTimes: {},

      // ---- Fetch ----

      fetchEventsWindow: async (centerDate: Date) => {
        const startDate = addDays(centerDate, -CACHE_WINDOW_DAYS)
        const endDate = addDays(centerDate, CACHE_WINDOW_DAYS)
        const startStr = formatDate(startDate)
        const endStr = formatDate(endDate)

        const fetchKey = `${startStr}_${endStr}`
        if (inFlightFetches.has(fetchKey)) return

        set((s) => ({ isLoading: true, loadingCount: s.loadingCount + 1, error: null }))
        inFlightFetches.add(fetchKey)

        try {
          const { data: { session } } = await getSafeSession()
          const user = session?.user
          if (!user) {
            inFlightFetches.delete(fetchKey)
            set((s) => {
              const nextCount = s.loadingCount - 1
              return { 
                isLoading: nextCount > 0, 
                loadingCount: nextCount, 
                error: 'User not authenticated', 
                cachedUserId: null 
              }
            })
            return
          }

          // Clear cache if user changed
          const { cachedUserId } = get()
          if (cachedUserId !== user.id) {
            set({
              eventsCache: {},
              computedEventsCache: {},
              recurringEventsCache: {},
              eventExceptionsCache: {},
              cacheStartDate: null,
              cacheEndDate: null,
              cachedUserId: user.id,
              lastPersistedAt: null,
            })
          }

          // Revert quoting as it might be breaking the query. ISO dates are safe.
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('user_id', user.id)
            .or(`and(date.gte.${startStr},date.lte.${endStr}),and(repeat.neq.None,series_start_date.lte.${endStr},series_end_date.gte.${startStr})`)
            .order('start_time', { ascending: true })

          if (error) {
            console.error('Failed to fetch events:', error)
            set({ error: error.message })
            return
          }

          const fetchedEvents = (data || [])
            .map((row: Record<string, any>) => dbRowToEvent(row))
            .map(normalizeEventForCache)
            .filter((event): event is Event => event !== null)
          const buildMergedCache = (
            baseCache: EventsCache,
            syncs: Set<string>,
            deletes: Set<string>,
            updates: Map<string, Partial<NewEvent>[]>
          ): EventsCache => {
            const mergedCache: EventsCache = sanitizeEventsCache({ ...baseCache })
            const fetchedIds = new Set(fetchedEvents.map(e => e.id))

            // 1. Prune deletions: Remove events that SHOULD have been in this fetch
            // but were missing from the results.
            for (const dateKey of Object.keys(mergedCache)) {
              mergedCache[dateKey] = mergedCache[dateKey].filter(event => {
                if (fetchedIds.has(event.id)) return true
                if (syncs.has(event.id) || deletes.has(event.id) || updates.has(event.id)) return true
                
                const isRecurring = event.repeat && event.repeat !== 'None'
                const inRange = (event.date >= startStr && event.date <= endStr)
                const seriesInRange = isRecurring && event.series_start_date && event.series_end_date && 
                                      (event.series_start_date <= endStr && event.series_end_date >= startStr)
                
                if (inRange || seriesInRange) return false
                return true
              })
              if (mergedCache[dateKey].length === 0) delete mergedCache[dateKey]
            }

            // 2. Merge fetched events (modifications and additions)
            fetchedEvents.forEach((event) => {
              if (deletes.has(event.id)) return

              // Apply any pending updates to the fetched event before merging it into cache
              let mergedEvent = { ...event }
              const queuedUpdates = updates.get(event.id)
              if (queuedUpdates) {
                for (const update of queuedUpdates) {
                  mergedEvent = { ...mergedEvent, ...update }
                }
              }

              // Robust pruning: remove this event ID from ALL buckets in mergedCache first.
              // This prevents stale copies staying in old date buckets after a date change.
              for (const dateKey of Object.keys(mergedCache)) {
                if (mergedCache[dateKey].some(e => e.id === mergedEvent.id)) {
                  mergedCache[dateKey] = mergedCache[dateKey].filter((e) => e.id !== mergedEvent.id)
                  if (mergedCache[dateKey].length === 0) delete mergedCache[dateKey]
                }
              }

              if (!mergedCache[mergedEvent.date]) mergedCache[mergedEvent.date] = []
              mergedCache[mergedEvent.date].push(mergedEvent)
              mergedCache[mergedEvent.date].sort(compareEventsByDisplayOrder)
            })

            // 3. Keep optimistic temp events and ensure pending deletions are respected
            for (const date of Object.keys(baseCache)) {
              const tempEvents = baseCache[date].filter(
                (event) => syncs.has(event.id) && !deletes.has(event.id)
              )
              if (tempEvents.length === 0) continue
              if (!mergedCache[date]) mergedCache[date] = []
              for (const tempEvent of tempEvents) {
                if (!mergedCache[date].some((event) => event.id === tempEvent.id || eventsLikelyMatch(event, tempEvent))) {
                  mergedCache[date].push(tempEvent)
                }
              }
              mergedCache[date].sort(compareEventsByDisplayOrder)
            }

            return sanitizeEventsCache(mergedCache)
          }

          // Merge fetched data with the latest cache state, not the pre-request snapshot.
          const {
            eventsCache: latestCache,
            pendingSyncs,
            pendingDeletes,
            pendingUpdates,
          } = get()
          const newCache = buildMergedCache(latestCache, pendingSyncs, pendingDeletes, pendingUpdates)

          // Fetch exceptions for all recurring masters currently present in cache.
          // This covers masters that started outside the current fetch window but
          // still generate occurrences inside it.
          const masterIds = new Set<string>()
          Object.values(newCache).forEach((events) => {
            events.forEach((event) => {
              if (
                event.id &&
                event.repeat &&
                event.repeat !== 'None' &&
                event.series_start_date &&
                event.series_end_date
              ) {
                masterIds.add(event.id)
              }
            })
          })

          if (masterIds.size > 0) {
            const { data: exceptionsData, error: excError } = await supabase
              .from('exceptions')
              .select('*')
              .in('series_id', Array.from(masterIds))

            if (!excError && exceptionsData) {
              // Completely rebuild exceptions cache for all masters we currently have
              // to ensure deletions from other devices are reflected.
              const cleanedExceptions: Record<string, EventException[]> = {}
              
              for (const exc of exceptionsData) {
                const seriesId = exc.series_id
                if (!cleanedExceptions[seriesId]) {
                  cleanedExceptions[seriesId] = []
                }
                cleanedExceptions[seriesId].push({
                  id: exc.id,
                  series_id: exc.series_id,
                  user_id: exc.user_id,
                  date: exc.date,
                  start_time: exc.start_time,
                  end_time: exc.end_time,
                  title: exc.title,
                  deleted: exc.deleted,
                  created_at: exc.created_at,
                })
              }
              
              set({ eventExceptionsCache: cleanedExceptions })
            }
          }

          const {
            cacheStartDate: currentStart,
            cacheEndDate: currentEnd,
          } = get()

          set({
            eventsCache: newCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            cacheStartDate: currentStart ? (startStr < currentStart ? startStr : currentStart) : startStr,
            cacheEndDate: currentEnd ? (endStr > currentEnd ? endStr : currentEnd) : endStr,
            cachedUserId: user.id,
          })
        } catch (err) {
          set({ 
            error: err instanceof Error ? err.message : 'Failed to fetch events',
          })
        } finally {
          inFlightFetches.delete(fetchKey)
          set((s) => {
            const nextCount = Math.max(0, s.loadingCount - 1)
            return { 
              isLoading: nextCount > 0, 
              loadingCount: nextCount,
            }
          })
        }
      },

      // ---- Create ----

      addEvent: async (event: NewEvent) => {
        const tempId = generateTempId()
        const now = new Date().toISOString()
        const initialStatus = getInitialEventStatus(event, new Date())
        const localEvent: Event = {
          id: tempId,
          user_id: 'temp-user',
          title: event.title,
          date: event.date,
          end_date: event.end_date || event.date,
          start_time: event.start_time,
          end_time: event.end_time,
          status: initialStatus,
          description: event.description,
          notes: event.notes,
          urls: event.urls,
          color: event.color,
          is_all_day: event.is_all_day,
          location: event.location,
          created_at: now,
          updated_at: now,
        }

        const { eventsCache, computedEventsCache } = get()
        const dateKey = event.date
        const newComputedCache = { ...computedEventsCache }
        delete newComputedCache[dateKey]

        set({
          eventsCache: {
            ...eventsCache,
            [dateKey]: [...(eventsCache[dateKey] || []), localEvent]
              .sort(compareEventsByDisplayOrder),
          },
          computedEventsCache: newComputedCache,
        })

        // Background DB save
        setTimeout(async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const user = session?.user
            if (!user) return

            const eventForDb = buildEventForDb(event, user.id)
            const { data, error } = await insertIfNotDuplicate(eventForDb, user.id)

            if (error || !data) return

            const savedEvent = dbRowToEvent(data)
            const { eventsCache: currentCache } = get()
            const newCache = { ...currentCache }
            if (newCache[dateKey]) {
              newCache[dateKey] = newCache[dateKey].map(e =>
                e.id === tempId ? savedEvent : e
              )
              newCache[dateKey].sort(compareEventsByDisplayOrder)
            }
            set({ eventsCache: newCache })
          } catch { /* background save failed silently */ }
        }, 0)

        return localEvent
      },

      addEventOptimistic: async (event: NewEvent) => {
        const tempId = event.id || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const now = new Date().toISOString()
        const initialStatus = getInitialEventStatus(event, new Date())

        // Calculate series end date for recurring events (10 years from start)
        let seriesEndDate: string | undefined
        if (event.repeat && event.repeat !== 'None' && event.date) {
          const startDate = new Date(event.date + 'T00:00:00')
          startDate.setFullYear(startDate.getFullYear() + 10)
          seriesEndDate = startDate.toISOString().split('T')[0]
        }

        const tempEvent: Event = {
          id: tempId,
          user_id: 'temp-user',
          title: event.title,
          date: event.date,
          end_date: event.end_date || event.date,
          start_time: event.start_time,
          end_time: event.end_time,
          status: initialStatus,
          description: event.description,
          notes: event.notes,
          urls: event.urls,
          color: event.color,
          is_all_day: event.is_all_day,
          location: event.location,
          repeat: event.repeat,
          series_start_date: event.repeat && event.repeat !== 'None' ? event.date : undefined,
          series_end_date: seriesEndDate,
          created_at: now,
          updated_at: now,
          isTemp: true,
        }

        const { eventsCache, computedEventsCache } = get()
        const dateKey = event.date
        const currentPendingSyncs = new Set(get().pendingSyncs)
        currentPendingSyncs.add(tempId)
        const newComputedCache = { ...computedEventsCache }
        delete newComputedCache[dateKey]

        set({
          eventsCache: {
            ...eventsCache,
            [dateKey]: [...(eventsCache[dateKey] || []), tempEvent]
              .sort(compareEventsByDisplayOrder),
          },
          computedEventsCache: newComputedCache,
          pendingSyncs: currentPendingSyncs,
        })

        // Background DB save with error rollback
        setTimeout(async () => {
          const rollbackTempEvent = () => {
            const { eventsCache: cc, pendingSyncs: ps, pendingUpdates: pu } = get()
            const nc = { ...cc }
            const nps = new Set(ps)
            const npu = new Map(pu)
            nps.delete(tempId)
            npu.delete(tempId)
            if (nc[dateKey]) nc[dateKey] = nc[dateKey].filter(e => e.id !== tempId)
            set({ eventsCache: nc, pendingSyncs: nps, pendingUpdates: npu })
          }

          try {
            const { data: { session } } = await getSafeSession()
            const user = session?.user
            if (!user) {
              console.error('Failed to save optimistic event: No user session')
              rollbackTempEvent()
              return
            }

            const eventForDb = buildEventForDb(event, user.id)
            const { data, error } = await insertIfNotDuplicate(eventForDb, user.id)

            if (error || !data) {
              console.error('Failed to insert optimistic event into database:', error)
              rollbackTempEvent()
              return
            }

            // Replace temp event with real data
            const savedEvent = dbRowToEvent(data)
            const { eventsCache: currentCache, pendingSyncs, pendingUpdates } = get()
            const newCache = { ...currentCache }
            const newPendingSyncs = new Set(pendingSyncs)
            newPendingSyncs.delete(tempId)

            const currentSelectedId = get().selectedEventId
            const currentHasEditsEventId = get().hasEditsEventId
            const queuedUpdates = pendingUpdates.get(tempId)
            const newPendingUpdates = new Map(pendingUpdates)
            newPendingUpdates.delete(tempId)

            let finalEvent = { ...savedEvent, isTemp: false }

            if (newCache[dateKey] && queuedUpdates && queuedUpdates.length > 0) {
              for (const update of queuedUpdates) {
                finalEvent = { ...finalEvent, ...update, updated_at: new Date().toISOString() }
              }
            }

            let insertionIndex = -1
            const originalDateEvents = currentCache[dateKey] || []
            insertionIndex = originalDateEvents.findIndex((e) => e.id === tempId)

            for (const cacheDateKey of Object.keys(newCache)) {
              const filtered = newCache[cacheDateKey].filter(
                (e) => e.id !== tempId && e.id !== savedEvent.id
              )
              if (filtered.length === 0) {
                delete newCache[cacheDateKey]
              } else {
                newCache[cacheDateKey] = filtered
              }
            }

            if (!newCache[dateKey]) newCache[dateKey] = []
            const nextDateEvents = [...newCache[dateKey]]
            if (insertionIndex >= 0 && insertionIndex <= nextDateEvents.length) {
              nextDateEvents.splice(insertionIndex, 0, finalEvent)
            } else {
              nextDateEvents.push(finalEvent)
            }
            newCache[dateKey] = nextDateEvents.sort(compareEventsByDisplayOrder)

            const shouldPreserveEditingSelection =
              currentSelectedId === tempId ||
              (currentSelectedId === null && currentHasEditsEventId === tempId)
            const newSelectedId = shouldPreserveEditingSelection ? finalEvent.id : currentSelectedId
            const { computedEventsCache: currentComputedCache } = get()
            const newComputedCache = { ...currentComputedCache }
            delete newComputedCache[dateKey]

            set({
              eventsCache: newCache,
              computedEventsCache: newComputedCache,
              pendingSyncs: newPendingSyncs,
              pendingUpdates: newPendingUpdates,
              selectedEventId: newSelectedId,
              hasEditsEventId: currentHasEditsEventId === tempId ? finalEvent.id : currentHasEditsEventId,
            })

            // Sync queued updates to DB
            if (queuedUpdates && queuedUpdates.length > 0) {
              const mergedUpdates = filterUpdatesForDb(
                Object.assign({}, ...queuedUpdates)
              )
              if (Object.keys(mergedUpdates).length > 0) {
                await supabase.from('events').update(mergedUpdates).eq('id', data.id)
              }
            }
          } catch {
            rollbackTempEvent()
          }
        }, 0)

        return tempEvent
      },

      addEventLocal: (event: NewEvent): Event => {
        const { eventsCache, pendingSyncs: currentPendingSyncs } = get()
        const existingForDate = eventsCache[event.date] || []

        // Prevent duplicate: skip if there's already a pending temp event
        // at the exact same date and time slot (avoids duplicates from
        // double-clicks or rapid handler invocations).
        const existingPending = existingForDate.find(
          e => e.isTemp === true &&
               currentPendingSyncs.has(e.id) &&
               e.start_time === event.start_time &&
               e.end_time === event.end_time
        )
        if (existingPending) return existingPending as Event

        const tempId = event.id || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const now = new Date().toISOString()
        const initialStatus = getInitialEventStatus(event, new Date())

        let seriesEndDate: string | undefined
        if (event.repeat && event.repeat !== 'None' && event.date) {
          const startDate = new Date(event.date + 'T00:00:00')
          startDate.setFullYear(startDate.getFullYear() + 10)
          seriesEndDate = startDate.toISOString().split('T')[0]
        }

        const tempEvent: Event = {
          id: tempId,
          user_id: 'temp-user',
          title: event.title,
          date: event.date,
          end_date: event.end_date || event.date,
          start_time: event.start_time,
          end_time: event.end_time,
          status: initialStatus,
          description: event.description,
          notes: event.notes,
          urls: event.urls,
          color: event.color,
          is_all_day: event.is_all_day,
          location: event.location,
          repeat: event.repeat,
          series_start_date: event.repeat && event.repeat !== 'None' ? event.date : undefined,
          series_end_date: seriesEndDate,
          created_at: now,
          updated_at: now,
          isTemp: true,
        }

        const { computedEventsCache, pendingSyncs } = get()
        const dateKey = event.date
        const newComputedCache = { ...computedEventsCache }
        delete newComputedCache[dateKey]
        const newPendingSyncs = new Set(pendingSyncs)
        newPendingSyncs.add(tempId)

        set({
          eventsCache: {
            ...eventsCache,
            [dateKey]: [...(eventsCache[dateKey] || []), tempEvent].sort(compareEventsByDisplayOrder),
          },
          computedEventsCache: newComputedCache,
          pendingSyncs: newPendingSyncs,
        })

        // Delay the first DB save slightly so fast title edits on newly-created events
        // are captured before the temp event is swapped to a real row.
        setTimeout(() => {
          void get().saveTempEvent(tempId)
        }, INITIAL_TEMP_SAVE_DELAY_MS)

        return tempEvent
      },

      saveTempEvent: async (tempEventId: string) => {
        if (inFlightTempSaveIds.has(tempEventId)) return
        inFlightTempSaveIds.add(tempEventId)

        const clearCancelledTemp = () => {
          const currentPendingDeletes = new Set(get().pendingDeletes)
          if (!currentPendingDeletes.has(tempEventId)) return
          currentPendingDeletes.delete(tempEventId)
          set({ pendingDeletes: currentPendingDeletes })
        }
        try {
          const { eventsCache, pendingUpdates } = get()
          let tempEvent: Event | null = null
          let dateKey: string | null = null

          for (const key of Object.keys(eventsCache)) {
            const event = eventsCache[key].find(e => e.id === tempEventId)
            if (event) { tempEvent = event; dateKey = key; break }
          }

          if (!tempEvent || !dateKey) return
          if (get().pendingDeletes.has(tempEventId)) {
            clearCancelledTemp()
            return
          }

          // Apply queued updates before saving
          const queuedUpdates = pendingUpdates.get(tempEventId) || []
          let updatedTempEvent = { ...tempEvent }
          for (const update of queuedUpdates) {
            updatedTempEvent = { ...updatedTempEvent, ...update }
          }

          const { data: { session } } = await getSafeSession()
          const user = session?.user
          if (!user) {
            console.error('Failed to save temp event: No user session')
            return
          }
          if (get().pendingDeletes.has(tempEventId)) {
            clearCancelledTemp()
            return
          }

          const eventForDb = buildEventForDb(updatedTempEvent, user.id)
          const { data: rawSavedEvent, error } = await insertIfNotDuplicate(eventForDb, user.id)

          if (error || !rawSavedEvent) {
            console.error('Failed to insert temp event into database:', error)
            return
          }
          if (get().pendingDeletes.has(tempEventId)) {
            await supabase.from('events').delete().eq('id', rawSavedEvent.id)
            clearCancelledTemp()
            return
          }

          const savedEvent = dbRowToEvent(rawSavedEvent)

          // Re-read queued updates after insert so late edits that happened while the
          // temp event was being saved are not lost.
          const {
            eventsCache: currentCache,
            pendingUpdates: currentPendingUpdates,
            selectedEventId: currentSelectedId,
            hasEditsEventId: currentHasEditsEventId,
          } = get()
          const latestQueuedUpdates = currentPendingUpdates.get(tempEventId) || []
          let finalEvent = { ...updatedTempEvent, ...savedEvent, id: savedEvent.id, isTemp: false as const }
          for (const update of latestQueuedUpdates) {
            finalEvent = { ...finalEvent, ...update, updated_at: new Date().toISOString() }
          }

          // Replace temp with real event
          const newCache = { ...currentCache }
          const savedDateKey = finalEvent.date
          let insertionIndex = -1
          
          // Original bucket logic
          const originalDateEvents = currentCache[dateKey] || []
          insertionIndex = originalDateEvents.findIndex((e) => e.id === tempEventId)

          // Clear the temp ID and any duplicate real ID from all buckets
          for (const cacheDateKey of Object.keys(newCache)) {
            const filtered = newCache[cacheDateKey].filter(
              (e) => e.id !== tempEventId && e.id !== savedEvent.id
            )
            if (filtered.length === 0) {
              delete newCache[cacheDateKey]
            } else {
              newCache[cacheDateKey] = filtered
            }
          }

          // Add to the CORRECT date bucket for the saved event
          if (!newCache[savedDateKey]) newCache[savedDateKey] = []
          const nextDateEvents = [...newCache[savedDateKey]]
          
          if (savedDateKey === dateKey && insertionIndex >= 0 && insertionIndex <= nextDateEvents.length) {
            nextDateEvents.splice(insertionIndex, 0, finalEvent)
          } else {
            nextDateEvents.push(finalEvent)
          }
          newCache[savedDateKey] = nextDateEvents.sort(compareEventsByDisplayOrder)

          const newPendingSyncs = new Set(get().pendingSyncs)
          newPendingSyncs.delete(tempEventId)
          const newPendingUpdates = new Map(currentPendingUpdates)
          newPendingUpdates.delete(tempEventId)

          set({
            eventsCache: newCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            pendingSyncs: newPendingSyncs,
            pendingUpdates: newPendingUpdates,
            selectedEventId:
              currentSelectedId === tempEventId ||
              (currentSelectedId === null && currentHasEditsEventId === tempEventId)
                ? savedEvent.id
                : currentSelectedId,
            hasEditsEventId: currentHasEditsEventId === tempEventId ? savedEvent.id : currentHasEditsEventId,
          })

          if (latestQueuedUpdates.length > 0) {
            const mergedUpdates = filterUpdatesForDb(Object.assign({}, ...latestQueuedUpdates))
            if (Object.keys(mergedUpdates).length > 0) {
              await supabase.from('events').update(mergedUpdates).eq('id', savedEvent.id)
            }
          }
        } finally {
          inFlightTempSaveIds.delete(tempEventId)
        }
      },

      // ---- Update ----

      updateEvent: async (id: string, updates: Partial<NewEvent>) => {
        const { eventsCache, pendingSyncs } = get()
        const found = findEventInCache(eventsCache, id)

        if (!found) return null

        const { event: currentEvent, dateKey: oldDate } = found
        const normalizedUpdates = normalizeGoalMetadataForDateChange(currentEvent, updates)

        const updatedEvent = {
          ...currentEvent,
          ...normalizedUpdates,
          updated_at: new Date().toISOString(),
        }

        const newDate = normalizedUpdates.date || oldDate

        set((state) => {
          const newCache = { ...state.eventsCache }
          // Remove any stale copies of this event from every cached date bucket first.
          for (const cacheDateKey of Object.keys(newCache)) {
            const filtered = newCache[cacheDateKey].filter(e => e.id !== id)
            if (filtered.length === 0) delete newCache[cacheDateKey]
            else newCache[cacheDateKey] = filtered
          }

          if (!newCache[newDate]) newCache[newDate] = []
          newCache[newDate] = [...newCache[newDate], updatedEvent].sort(compareEventsByDisplayOrder)

          return {
            eventsCache: newCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            eventExceptionsCache: {},
          }
        })

        // Queue update for all events to prevent re-fetch overwrites
        const newPendingUpdates = new Map(get().pendingUpdates)
        const existing = newPendingUpdates.get(id) || []
        newPendingUpdates.set(id, [...existing, normalizedUpdates])

        if (updatedEvent.isTemp === true || pendingSyncs.has(id)) {
          if (updatedEvent.isTemp === true && !pendingSyncs.has(id)) {
            const newPendingSyncs = new Set(pendingSyncs)
            newPendingSyncs.add(id)
            set({ pendingUpdates: newPendingUpdates, pendingSyncs: newPendingSyncs })
            void get().saveTempEvent(id)
          } else {
            set({ pendingUpdates: newPendingUpdates })
          }

          return updatedEvent
        }

        set({ pendingUpdates: newPendingUpdates })

        // Background DB update
        setTimeout(async () => {
          try {
            const filteredUpdates = filterUpdatesForDb(normalizedUpdates)
            const { error } = await supabase.from('events').update(filteredUpdates).eq('id', id)
            if (error) {
              console.error('Failed to update event in database:', error)
            }
          } catch (err) {
            console.error('Unexpected error during background event update:', err)
          } finally {
            // Clear this specific update from pending list after DB call finishes
            const { pendingUpdates: latestUpdates } = get()
            const nextUpdates = new Map(latestUpdates)
            const currentList = nextUpdates.get(id) || []
            const newList = currentList.filter(u => u !== normalizedUpdates)
            if (newList.length === 0) nextUpdates.delete(id)
            else nextUpdates.set(id, newList)
            set({ pendingUpdates: nextUpdates })
          }
        }, 0)

        return updatedEvent
      },

      updateAllInSeries: async (seriesMasterId: string, updates: Partial<NewEvent>) => {
        const currentEvent = findMasterEvent(get().eventsCache, seriesMasterId)
        if (!currentEvent) return

        const nextSeriesStartDate = updates.series_start_date ?? currentEvent.series_start_date
        const nextSeriesEndDate = updates.series_end_date ?? currentEvent.series_end_date
        const shouldCollapseToSingleEvent =
          !!currentEvent.repeat &&
          currentEvent.repeat !== 'None' &&
          !!nextSeriesStartDate &&
          !!nextSeriesEndDate &&
          nextSeriesEndDate <= nextSeriesStartDate

        const normalizedUpdates = shouldCollapseToSingleEvent
          ? {
              ...updates,
              repeat: 'None',
              series_start_date: undefined,
              series_end_date: undefined,
            }
          : updates

        await get().updateEvent(seriesMasterId, normalizedUpdates)
        set({
          recurringEventsCache: {},
          computedEventsCache: {},
          selectedEventId: null,
        })
      },

      // ---- Delete ----

      deleteEvent: async (id: string) => {
        const { eventsCache } = get()
        const newCache = { ...eventsCache }

        const event = Object.values(eventsCache).flat().find(e => e.id === id)
        const isTempEvent = event?.isTemp === true
        const isRecurringEvent = event?.repeat && event.repeat !== 'None'

        const affectedDates: string[] = []
        for (const date of Object.keys(newCache)) {
          if (newCache[date].some(e => e.id === id)) {
            affectedDates.push(date)
            newCache[date] = newCache[date].filter(e => e.id !== id)
          }
        }

        const datesToClearFromComputed: string[] = [...affectedDates]
        if (event && !isRecurringEvent && event.end_date) {
          const startDate = new Date(event.date)
          const endDate = new Date(event.end_date)
          const current = new Date(startDate)
          while (current <= endDate) {
            const dateKey = formatDate(current)
            if (!datesToClearFromComputed.includes(dateKey)) {
              datesToClearFromComputed.push(dateKey)
            }
            current.setDate(current.getDate() + 1)
          }
        }

        set((state) => {
          const nextCache = { ...state.eventsCache }
          const nextComputed = { ...state.computedEventsCache }

          for (const date of affectedDates) {
            nextCache[date] = (nextCache[date] || []).filter(e => e.id !== id)
            if (nextCache[date].length === 0) delete nextCache[date]
          }

          if (isRecurringEvent) {
            return {
              eventsCache: nextCache,
              computedEventsCache: {},
              recurringEventsCache: {},
              eventExceptionsCache: {},
            }
          }

          for (const date of datesToClearFromComputed) delete nextComputed[date]
          return {
            eventsCache: nextCache,
            computedEventsCache: nextComputed,
            recurringEventsCache: {},
            eventExceptionsCache: {},
          }
        })

        const newPendingDeletes = new Set(get().pendingDeletes)
        newPendingDeletes.add(id)
        const newPendingSyncs = new Set(get().pendingSyncs)
        newPendingSyncs.delete(id)
        const newPendingUpdates = new Map(get().pendingUpdates)
        newPendingUpdates.delete(id)

        set({
          pendingDeletes: newPendingDeletes,
          pendingSyncs: newPendingSyncs,
          pendingUpdates: newPendingUpdates,
        })

        if (isTempEvent) return true

        setTimeout(async () => {
          try {
            const { data: { session } } = await getSafeSession()
            if (!session?.user) return
            const { error } = await supabase.from('events').delete().eq('id', id)
            if (error) {
              console.error('Failed to delete event:', error)
              return
            }
            const currentPendingDeletes = new Set(get().pendingDeletes)
            currentPendingDeletes.delete(id)
            set({ pendingDeletes: currentPendingDeletes })
          } catch { /* background delete failed silently */ }
        }, 0)

        return true
      },

      // ---- Read ----

      getEventsForDate: (date: Date): CalendarEvent[] => {
        const dateKey = formatDate(date)
        const { eventsCache, computedEventsCache, recurringEventsCache, eventExceptionsCache } = get()
        const eventsCacheSnapshot = eventsCache
        const eventExceptionsSnapshot = eventExceptionsCache

        // Return cached computed events if available
        if (computedEventsCache[dateKey]) {
          return computedEventsCache[dateKey]
        }

        const monthKey = getMonthKey(date)
        const recurringEventsForMonth = buildRecurringEventsForMonth(
          date,
          eventsCache,
          recurringEventsCache,
          eventExceptionsCache
        )
        const uniqueEvents = buildCanonicalEventsForDate(dateKey, eventsCache, recurringEventsForMonth)

        scheduleIdleStoreWrite(() => {
          set(state => {
            if (state.eventsCache !== eventsCacheSnapshot || state.eventExceptionsCache !== eventExceptionsSnapshot) {
              return state
            }

            const nextRecurringCache = state.recurringEventsCache[monthKey]
              ? state.recurringEventsCache
              : {
                  ...state.recurringEventsCache,
                  [monthKey]: recurringEventsForMonth,
                }

            if (state.computedEventsCache[dateKey] && nextRecurringCache === state.recurringEventsCache) {
              return state
            }

            return {
              recurringEventsCache: nextRecurringCache,
              computedEventsCache: state.computedEventsCache[dateKey]
                ? state.computedEventsCache
                : {
                    ...state.computedEventsCache,
                    [dateKey]: uniqueEvents,
                  },
            }
          })
        })

        return uniqueEvents
      },

      getEventById: (id: string): CalendarEvent | null => {
        const { eventsCache, computedEventsCache, eventExceptionsCache } = get()

        // Virtual recurring instance IDs
        if (isVirtualEventId(id)) {
          // Check computed cache first
          for (const dateKey of Object.keys(computedEventsCache)) {
            const event = computedEventsCache[dateKey].find(e => e.id === id)
            if (event) return event
          }

          // Generate on-demand from master event
          const virtualDate = id.match(VIRTUAL_ID_PATTERN)![1]
          const masterId = extractMasterId(id)
          const masterEvent = findMasterEvent(eventsCache, masterId)

          if (masterEvent) {
            const hasSeriesBounds =
              !!masterEvent.repeat &&
              masterEvent.repeat !== 'None' &&
              !!masterEvent.series_start_date &&
              !!masterEvent.series_end_date
            if (!hasSeriesBounds) return null
            if (virtualDate < masterEvent.series_start_date! || virtualDate > masterEvent.series_end_date!) return null
            if (virtualDate === masterEvent.date) return null
            const seriesExceptions = eventExceptionsCache[masterId] || []
            const matchingException = seriesExceptions.find((exception) => exception.date === virtualDate)
            if (matchingException?.deleted) return null

            const virtualEvent: CalendarEvent = {
              ...masterEvent,
              id,
              date: virtualDate,
              end_date: virtualDate,
              isRecurringInstance: true,
              seriesMasterId: masterId,
              occurrenceDate: virtualDate,
            }

            // Cache it lazily without putting timer work directly on the current render path.
            scheduleIdleStoreWrite(() => {
              set(state => {
                const existingForDate = state.computedEventsCache[virtualDate] || []
                if (existingForDate.some((event) => event.id === id)) {
                  return state
                }
                const currentExceptions = state.eventExceptionsCache[masterId] || []
                if (currentExceptions.some((exception) => exception.date === virtualDate && exception.deleted)) {
                  return state
                }
                return {
                  computedEventsCache: {
                    ...state.computedEventsCache,
                    [virtualDate]: [...existingForDate, virtualEvent],
                  },
                }
              })
            })

            return virtualEvent
          }
        }

        // Search real events, preferring the canonical earliest-date copy.
        const found = findEventInCache(eventsCache, id)
        if (found) return found.event as CalendarEvent

        return null
      },

      // ---- UI State ----

      isEventSyncing: (eventId: string) => get().pendingSyncs.has(eventId),
      isAnyEventSyncing: () => get().pendingSyncs.size > 0,

      setSelectedEvent: (id) =>
        set((state) => {
          if (state.selectedEventId === id) return state
          if (!state.selectedEventId) return { selectedEventId: id }

          const nextLive = { ...state.liveEventTimes }
          delete nextLive[state.selectedEventId]
          return {
            selectedEventId: id,
            liveEventTimes: id === null ? {} : nextLive,
          }
        }),
      setScrollToEventId: (id) => set({ scrollToEventId: id }),
      setScrollToTop: (value) => set({ scrollToTop: value }),
      setHasEditsEventId: (id) => set({ hasEditsEventId: id }),
      previewEventTime: (id: string, start_time: number, end_time: number) => {
        const { eventsCache, computedEventsCache } = get()
        const found = findEventInCache(eventsCache, id)
        if (!found) return

        const { event: currentEvent, dateKey } = found
        if (currentEvent.start_time === start_time && currentEvent.end_time === end_time) return

        const nextCache = { ...eventsCache }
        const eventIndex = nextCache[dateKey].findIndex((e) => e.id === id)
        if (eventIndex === -1) return

        nextCache[dateKey] = [...nextCache[dateKey]]
        nextCache[dateKey][eventIndex] = {
          ...nextCache[dateKey][eventIndex],
          start_time,
          end_time,
          updated_at: new Date().toISOString(),
        }
        nextCache[dateKey].sort(compareEventsByDisplayOrder)

        const nextComputed = { ...computedEventsCache }
        delete nextComputed[dateKey]

        set({
          eventsCache: nextCache,
          computedEventsCache: nextComputed,
        })
      },
      setLiveEventTime: (id: string, start_time: number, end_time: number, date?: string, end_date?: string) =>
        set((state) => ({
          liveEventTimes: {
            ...state.liveEventTimes,
            [id]: { start_time, end_time, date, end_date },
          },
        })),
      clearLiveEventTime: (id?: string) =>
        set((state) => {
          if (!id) return { liveEventTimes: {} }
          if (!(id in state.liveEventTimes)) return state
          const next = { ...state.liveEventTimes }
          delete next[id]
          return { liveEventTimes: next }
        }),

      updateEventField: (id: string, field: keyof NewEvent, value: EventFieldValue) => {
        if (value === undefined) return

        const { eventsCache, pendingSyncs } = get()

        // Virtual recurring instances default to "only-this" semantics.
        if (isVirtualEventId(id)) {
          const virtualEvent = get().getEventById(id)
          const match = id.match(VIRTUAL_ID_PATTERN)
          if (!virtualEvent || !match) return
          const occurrenceDate = match[1]
          void get().splitRecurringEvent(
            virtualEvent,
            occurrenceDate,
            undefined,
            undefined,
            { [field]: value } as Partial<NewEvent>
          )
          return
        }

        const found = findEventInCache(eventsCache, id)
        if (!found) return

        const { event: currentEvent, dateKey } = found

        // If we are updating the status of a recurring master event (e.g. from the checkbox),
        // we should treat it as an "only-this" change and split it from the series.
        if (field === 'status' && isSeriesActuallyRecurring(currentEvent)) {
          void get().splitRecurringEvent(
            currentEvent as CalendarEvent,
            currentEvent.date,
            undefined,
            undefined,
            { [field]: value } as Partial<NewEvent>
          )
          return
        }

        const normalizedUpdates = normalizeGoalMetadataForDateChange(currentEvent, { [field]: value })
        if (currentEvent[field as keyof Event] === value) return

        const duration = getClockwiseDurationMinutes(currentEvent.start_time, currentEvent.end_time)
        const endTimeValue = field === 'start_time' && typeof value === 'number'
          ? value + duration
          : currentEvent.end_time

        const updatedEvent = {
          ...currentEvent,
          ...normalizedUpdates,
          ...(field === 'start_time' && typeof value === 'number' && { end_time: endTimeValue }),
          updated_at: new Date().toISOString(),
        }

        set((state) => {
          const newCache = { ...state.eventsCache }
          // Handle date changes
          if (field === 'date' && typeof value === 'string' && value !== dateKey) {
            newCache[dateKey] = (newCache[dateKey] || []).filter(e => e.id !== id)
            if (newCache[dateKey].length === 0) delete newCache[dateKey]
            if (!newCache[value]) newCache[value] = []
            newCache[value] = [...newCache[value], updatedEvent]
          } else {
            const bucket = newCache[dateKey] || []
            const eventIndex = bucket.findIndex(e => e.id === id)
            if (eventIndex !== -1) {
              const updatedBucket = [...bucket]
              updatedBucket[eventIndex] = updatedEvent
              newCache[dateKey] = updatedBucket
            }
          }

          return {
            eventsCache: newCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            eventExceptionsCache: {},
          }
        })

        // Queue update for all events to prevent re-fetch overwrites
        const newPendingUpdates = new Map(get().pendingUpdates)
        const existing = newPendingUpdates.get(id) || []
        const effectiveUpdates = { ...normalizedUpdates }
        if (field === 'start_time') (effectiveUpdates as any).end_time = endTimeValue
        newPendingUpdates.set(id, [...existing, effectiveUpdates])

        if (currentEvent.isTemp === true || pendingSyncs.has(id)) {
          if (currentEvent.isTemp === true && !pendingSyncs.has(id)) {
            const newPendingSyncs = new Set(pendingSyncs)
            newPendingSyncs.add(id)
            set({ pendingUpdates: newPendingUpdates, pendingSyncs: newPendingSyncs })
            void get().saveTempEvent(id)
          } else {
            set({ pendingUpdates: newPendingUpdates })
          }

          return
        }

        set({ pendingUpdates: newPendingUpdates })

        // Background DB update
        setTimeout(async () => {
          try {
            const { data: { session } } = await getSafeSession()
            if (!session?.user) return

            const updatesForDb: Record<string, any> = { ...normalizedUpdates }
            if (field === 'start_time') updatesForDb.end_time = endTimeValue
            await supabase.from('events').update(updatesForDb).eq('id', id)
          } catch { /* background field update failed silently */ }
          finally {
            // Clear this specific update from pending list
            const { pendingUpdates: latestUpdates } = get()
            const nextUpdates = new Map(latestUpdates)
            const currentList = nextUpdates.get(id) || []
            const newList = currentList.filter(u => u !== effectiveUpdates)
            if (newList.length === 0) nextUpdates.delete(id)
            else nextUpdates.set(id, newList)
            set({ pendingUpdates: nextUpdates })
          }
        }, 0)
      },

      updateEventFields: (id: string, updates: Partial<NewEvent>) => {
        const entries = Object.entries(updates).filter(([, value]) => value !== undefined) as [keyof NewEvent, EventFieldValue][]
        if (entries.length === 0) return

        const { eventsCache, pendingSyncs, pendingUpdates } = get()

        if (isVirtualEventId(id)) {
          const virtualEvent = get().getEventById(id)
          const match = id.match(VIRTUAL_ID_PATTERN)
          if (!virtualEvent || !match) return
          const occurrenceDate = match[1]
          void get().splitRecurringEvent(
            virtualEvent,
            occurrenceDate,
            undefined,
            undefined,
            updates
          )
          return
        }

        const found = findEventInCache(eventsCache, id)
        if (!found) return

        const { event: currentEvent, dateKey } = found

        // If we are updating the status of a recurring master event (e.g. from the checkbox),
        // we should treat it as an "only-this" change and split it from the series.
        if (updates.status !== undefined && isSeriesActuallyRecurring(currentEvent)) {
          void get().splitRecurringEvent(
            currentEvent as CalendarEvent,
            currentEvent.date,
            undefined,
            undefined,
            updates
          )
          return
        }

        const normalizedUpdates = normalizeGoalMetadataForDateChange(currentEvent, updates)
        
        // Ensure series_start_date stays in sync with date for master recurring events
        if (
          normalizedUpdates.date && 
          normalizedUpdates.date !== currentEvent.date && 
          currentEvent.repeat && 
          currentEvent.repeat !== 'None' &&
          currentEvent.date === currentEvent.series_start_date
        ) {
          normalizedUpdates.series_start_date = normalizedUpdates.date
        }

        const nextEvent: Event = {
          ...currentEvent,
          ...normalizedUpdates,
          updated_at: new Date().toISOString(),
        }

        const nextDateKey = typeof nextEvent.date === 'string' ? nextEvent.date : dateKey
        const newCache = { ...eventsCache }

        // Remove any stale copies of this event from every cached date bucket first.
        for (const cacheDateKey of Object.keys(newCache)) {
          const filtered = newCache[cacheDateKey].filter(e => e.id !== id)
          if (filtered.length === 0) delete newCache[cacheDateKey]
          else newCache[cacheDateKey] = filtered
        }

        if (!newCache[nextDateKey]) newCache[nextDateKey] = []
        newCache[nextDateKey] = [...newCache[nextDateKey], nextEvent]

        if (newCache[nextDateKey]) {
          newCache[nextDateKey] = [...newCache[nextDateKey]].sort(compareEventsByDisplayOrder)
        }

        set({ eventsCache: newCache, computedEventsCache: {}, recurringEventsCache: {}, eventExceptionsCache: {} })

        // Queue update for all events to prevent re-fetch overwrites
        const newPendingUpdates = new Map(pendingUpdates)
        const existing = newPendingUpdates.get(id) || []
        newPendingUpdates.set(id, [...existing, normalizedUpdates])

        if (currentEvent.isTemp === true || pendingSyncs.has(id)) {
          if (currentEvent.isTemp === true && !pendingSyncs.has(id)) {
            const newPendingSyncs = new Set(pendingSyncs)
            newPendingSyncs.add(id)
            set({ pendingUpdates: newPendingUpdates, pendingSyncs: newPendingSyncs })
            void get().saveTempEvent(id)
          } else {
            set({ pendingUpdates: newPendingUpdates })
          }

          return
        }

        set({ pendingUpdates: newPendingUpdates })

        setTimeout(async () => {
          try {
            const { data: { session } } = await getSafeSession()
            if (!session?.user) return
            await supabase.from('events').update(filterUpdatesForDb(normalizedUpdates)).eq('id', id)
          } catch { /* background field update failed silently */ }
          finally {
            // Clear this specific update from pending list after DB call finishes
            const { pendingUpdates: latestUpdates } = get()
            const nextUpdates = new Map(latestUpdates)
            const currentList = nextUpdates.get(id) || []
            const newList = currentList.filter(u => u !== normalizedUpdates)
            if (newList.length === 0) nextUpdates.delete(id)
            else nextUpdates.set(id, newList)
            set({ pendingUpdates: nextUpdates })
          }
        }, 0)
      },

      syncGoalLinkedEvents: async ({ columnType, bucketKey, previousGoalText, nextGoalText, color, icon }) => {
        const goalType = getGoalTypeLabel(columnType)
        const updates: Partial<NewEvent> = {
          goal: nextGoalText,
          goalColor: color || '',
          goalIcon: icon || '',
        }

        set((state) => {
          const nextCache: EventsCache = {}
          let didChange = false

          for (const [dateKey, events] of Object.entries(state.eventsCache)) {
            nextCache[dateKey] = events.map((event) => {
              if (
                event.goalType !== goalType ||
                event.goal !== previousGoalText ||
                !eventMatchesGoalSyncRange(event, bucketKey)
              ) {
                return event
              }

              didChange = true
              return {
                ...event,
                goal: updates.goal,
                goalColor: updates.goalColor,
                goalIcon: updates.goalIcon,
                updated_at: new Date().toISOString(),
              }
            })
          }

          if (!didChange) return {}

          return {
            eventsCache: nextCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            eventExceptionsCache: {},
          }
        })

        const { data: { session } } = await getSafeSession()
                    const user = session?.user
                    if (!user)
 return

        let query = supabase
          .from('events')
          .update(filterUpdatesForDb(updates))
          .eq('user_id', user.id)
          .eq('goal_type', goalType)
          .eq('goal', previousGoalText)

        const range = getBucketDateRange(bucketKey)
        if (range) {
          query = query.gte('date', range.start).lte('date', range.end)
        }

        const { error } = await query
        if (error) {
          console.error('Failed to sync goal-linked events:', error)
        }
      },

      autoCompletePastEvents: async (now = new Date()) => {
        if (get().isAutoCompleting) return
        set({ isAutoCompleting: true })

        try {
          const { eventsCache, pendingSyncs } = get()
          const idsToPersist = new Set<string>()
          const recurringSplits: { event: CalendarEvent; date: string }[] = []
          let didChange = false
          const nextCache: EventsCache = {}

          for (const [dateKey, events] of Object.entries(eventsCache)) {
            let dateChanged = false
            const updatedEvents = events.map((event) => {
              const isRecurringSeriesMaster =
                !!event.repeat &&
                event.repeat !== 'None' &&
                !!event.series_start_date &&
                !!event.series_end_date

              if (isRecurringSeriesMaster) {
                // For recurring series, we only auto-complete if the first occurrence (the master itself)
                // has passed. This will trigger a split.
                if (hasEventPassed(event, now) && (event.status ?? 0) === 0) {
                  recurringSplits.push({ event: event as CalendarEvent, date: event.date })
                }
                return event
              }

              if (
                (event.status ?? 0) !== 0 ||
                !hasEventPassed(event, now)
              ) {
                return event
              }

              didChange = true
              dateChanged = true
              if (!event.isTemp && !pendingSyncs.has(event.id)) {
                idsToPersist.add(event.id)
              }

              const nextEvent = {
                ...event,
                status: 1,
                updated_at: new Date().toISOString(),
              }

              if (event.isTemp === true || pendingSyncs.has(event.id)) {
                const newPendingUpdates = new Map(get().pendingUpdates)
                const existing = newPendingUpdates.get(event.id) || []
                newPendingUpdates.set(event.id, [...existing, { status: 1 }])
                set({ pendingUpdates: newPendingUpdates })
              }

              return nextEvent
            })

            if (dateChanged) {
              nextCache[dateKey] = updatedEvents
            }
          }

          if (didChange) {
            set((state) => ({
              eventsCache: {
                ...state.eventsCache,
                ...nextCache,
              },
              computedEventsCache: {},
              recurringEventsCache: {},
              eventExceptionsCache: {},
            }))

            if (idsToPersist.size > 0) {
              try {
                await supabase.from('events').update({ status: 1 }).in('id', Array.from(idsToPersist))
              } catch {
                // Offline or transient failure: rely on local state
              }
            }
          }

          // Handle splits sequentially to avoid race conditions on the cache
          for (const split of recurringSplits) {
            await get().splitRecurringEvent(split.event, split.date, undefined, undefined, { status: 1 })
          }
        } finally {
          set({ isAutoCompleting: false })
        }
      },

      syncEventsWithDeletedGoal: (goalName, goalTypeLabel) => {
        set((state) => {
          const nextCache: EventsCache = {}
          let didChange = false

          for (const [dateKey, events] of Object.entries(state.eventsCache)) {
            nextCache[dateKey] = events.map((event) => {
              if (event.goal !== goalName || event.goalType !== goalTypeLabel) {
                return event
              }

              didChange = true
              return {
                ...event,
                goal: 'None',
                goalType: 'None',
                goalColor: undefined,
                goalIcon: undefined,
                updated_at: new Date().toISOString(),
              }
            })
          }

          if (!didChange) return {}

          return {
            eventsCache: nextCache,
            computedEventsCache: {},
            recurringEventsCache: {},
            eventExceptionsCache: {},
          }
        })
      },

      saveSelectedEvent: async () => {
        try {
          const { saveTrigger, selectedEventId: currentSelectedId } = get()
          if (!currentSelectedId) return
          const nextSaveTrigger = saveTrigger + 1
          
          set({ saveTrigger: nextSaveTrigger })

          // Give React a frame to flush sidebar draft state without a fixed 50ms delay.
          await new Promise<void>((resolve) => {
            if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
              setTimeout(resolve, 0)
              return
            }

            window.requestAnimationFrame(() => resolve())
          })

          // Check if selection hasn't changed
          const { selectedEventId: afterWaitId, eventsCache, saveTrigger: afterTrigger } = get()
          
          // Only proceed if still the same event and same trigger
          if (!afterWaitId || afterWaitId !== currentSelectedId || afterTrigger !== nextSaveTrigger) {
            set({ saveTrigger: 0 })
            return
          }

          const found = findEventInCache(eventsCache, currentSelectedId)
          if (!found) {
            set({ saveTrigger: 0 })
            return
          }

          const { event } = found

          // The editor can close as soon as local draft state has flushed.
          // Persisting to Supabase continues in the background using the captured event id.
          set((state) => {
            const nextLive = { ...state.liveEventTimes }
            delete nextLive[currentSelectedId]
            return {
              saveTrigger: 0,
              selectedEventId: null,
              hasEditsEventId: null,
              liveEventTimes: nextLive,
            }
          })

          if (event.isTemp === true) {
            await get().saveTempEvent(currentSelectedId)
          } else {
            const updates: Partial<NewEvent> = {
              title: event.title,
              date: event.date,
              end_date: event.end_date,
              start_time: event.start_time,
              end_time: event.end_time,
              description: event.description,
              notes: event.notes,
              urls: event.urls,
              color: event.color,
              is_all_day: event.is_all_day,
              location: event.location,
              goalType: event.goalType,
              goal: event.goal,
              goalColor: event.goalColor,
              goalIcon: event.goalIcon,
            }

            const filteredUpdates = filterUpdatesForDb(updates)
            const { data: { session } } = await getSafeSession()
            if (!session?.user) return

            const { error } = await supabase
              .from('events')
              .update(filteredUpdates)
              .eq('id', currentSelectedId)

            if (error) {
              throw error
            }
          }
        } catch {
          set({ saveTrigger: 0 })
        }
      },

      showRecurringDialog: (event, actionType, callback) => {
        set({
          recurringDialogOpen: true,
          recurringDialogEvent: event,
          recurringDialogActionType: actionType,
          recurringDialogCallback: callback,
        })
      },

      closeRecurringDialog: () => {
        set({
          recurringDialogOpen: false,
          recurringDialogEvent: null,
          recurringDialogActionType: null,
          recurringDialogCallback: null,
        })
      },

      // ---- Recurring Series Operations ----

      splitRecurringEvent: async (event, selectedDate, newStartTime, newEndTime, updates) => {
        const startTimeForNewEvent = newStartTime ?? updates?.start_time
        const endTimeForNewEvent = newEndTime ?? updates?.end_time
        const { computedEventsCache, eventsCache } = get()

        const masterEventId = event.seriesMasterId || event.id
        const masterEvent = findMasterEvent(eventsCache, masterEventId)
        const currentSelectedId = get().selectedEventId
        const isEventSelected = currentSelectedId === event.id || currentSelectedId === masterEventId

        // Safety: if we are splitting the very first occurrence and it's the ONLY occurrence (no repeat),
        // just update the master.
        const originalRepeat = masterEvent?.repeat || event.repeat || 'None'
        const originalSeriesEndDate = masterEvent?.series_end_date || event.series_end_date || event.date
        const nextOccurrence = getNextOccurrence(selectedDate, originalRepeat)
        
        if (masterEvent && selectedDate === masterEvent.date && nextOccurrence > originalSeriesEndDate) {
          await get().updateEvent(masterEventId, updates || {})
          return
        }

        const originalEventEndDate = masterEvent?.end_date || event.end_date || event.date
        const originalDurationDays = (() => {
          const start = new Date((masterEvent?.date || event.date) + 'T00:00:00')
          const end = new Date(originalEventEndDate + 'T00:00:00')
          return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
        })()
        const prevDay = (() => {
          const d = new Date(selectedDate + 'T00:00:00')
          d.setDate(d.getDate() - 1)
          return formatDate(d)
        })()

        // Look up original title from master event
        let originalTitle = event.title
        const masterForTitle = findMasterEvent(eventsCache, masterEventId)
          || (() => {
            for (const events of Object.values(computedEventsCache)) {
              const found = events.find(e => e.id === masterEventId)
              if (found) return found
            }
            return null
          })()
        if (masterForTitle) originalTitle = masterForTitle.title

        const isFirstOccurrence = selectedDate === (event.series_start_date || event.date)
        const mergedStandaloneFields = normalizeGoalMetadataForDateChange(masterEvent ?? event, {
          title: updates?.title ?? (event.title && event.title !== 'New Event' ? event.title : originalTitle),
          description: updates?.description ?? event.description ?? masterEvent?.description,
          notes: updates?.notes ?? event.notes ?? masterEvent?.notes,
          urls: updates?.urls ?? event.urls ?? masterEvent?.urls,
          date: selectedDate,
          end_date: updates?.end_date ?? event.end_date ?? selectedDate,
          start_time: startTimeForNewEvent ?? event.start_time,
          end_time: endTimeForNewEvent ?? event.end_time,
          color: updates?.color ?? masterEvent?.color ?? event.color,
          is_all_day: updates?.is_all_day ?? masterEvent?.is_all_day ?? event.is_all_day,
          location: updates?.location ?? masterEvent?.location ?? event.location,
          goalType: updates?.goalType ?? masterEvent?.goalType ?? event.goalType,
          goal: updates?.goal ?? masterEvent?.goal ?? event.goal,
          goalColor: updates?.goalColor ?? masterEvent?.goalColor ?? event.goalColor,
          goalIcon: updates?.goalIcon ?? masterEvent?.goalIcon ?? event.goalIcon,
          repeat: 'None',
        })

        // Optimistic update
        const masterUpdates: Partial<NewEvent> = isFirstOccurrence 
          ? { series_end_date: undefined, series_start_date: undefined, repeat: 'None', ...updates }
          : { series_end_date: prevDay }

        const { pendingUpdates: currentPendingUpdates } = get()
        const newPendingUpdates = new Map(currentPendingUpdates)
        const existing = newPendingUpdates.get(masterEventId) || []
        newPendingUpdates.set(masterEventId, [...existing, masterUpdates])

        if (isFirstOccurrence) {
          // First occurrence: make it non-recurring
          set((state) => {
            const nextCache = { ...state.eventsCache }
            for (const dateKey of Object.keys(nextCache)) {
              nextCache[dateKey] = nextCache[dateKey].map(e => {
                if (e.id === masterEventId) {
                  return {
                    ...e,
                    ...masterUpdates,
                    updated_at: new Date().toISOString()
                  }
                }
                return e
              })
            }
            return {
              eventsCache: nextCache,
              computedEventsCache: {},
              recurringEventsCache: {},
              selectedEventId: isEventSelected ? masterEventId : currentSelectedId,
              pendingUpdates: newPendingUpdates,
            }
          })
          
          // Fire DB in background
          setTimeout(async () => {
            try {
              await supabase.from('events').update({
                series_end_date: null,
                series_start_date: null,
                repeat: 'None',
                ...filterUpdatesForDb(updates ?? {}),
              }).eq('id', masterEventId)
            } finally {
              const { pendingUpdates: latestUpdates } = get()
              const nextUpdates = new Map(latestUpdates)
              const currentList = nextUpdates.get(masterEventId) || []
              const newList = currentList.filter(u => u !== masterUpdates)
              if (newList.length === 0) nextUpdates.delete(masterEventId)
              else nextUpdates.set(masterEventId, newList)
              set({ pendingUpdates: nextUpdates })
            }
          }, 0)
        } else {
          // Shorten original series and add new standalone event - do optimistically
          const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const tempEvent = {
            id: tempId,
            user_id: 'temp',
            title: mergedStandaloneFields.title || 'New Event',
            description: mergedStandaloneFields.description,
            notes: mergedStandaloneFields.notes,
            urls: mergedStandaloneFields.urls,
            date: mergedStandaloneFields.date || selectedDate,
            end_date: mergedStandaloneFields.end_date || selectedDate,
            start_time: mergedStandaloneFields.start_time ?? event.start_time,
            end_time: mergedStandaloneFields.end_time ?? event.end_time,
            color: mergedStandaloneFields.color,
            is_all_day: mergedStandaloneFields.is_all_day,
            location: mergedStandaloneFields.location,
            goalType: mergedStandaloneFields.goalType,
            goal: mergedStandaloneFields.goal,
            goalColor: mergedStandaloneFields.goalColor,
            goalIcon: mergedStandaloneFields.goalIcon,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            repeat: 'None',
            isTemp: true,
          }

          set((state) => {
            const nextCache = { ...state.eventsCache }
            const nextPendingSyncs = new Set(state.pendingSyncs)

            // Shorten master series
            for (const dateKey of Object.keys(nextCache)) {
              nextCache[dateKey] = nextCache[dateKey].map(e => {
                if (e.id === masterEventId) {
                  return { ...e, ...masterUpdates, updated_at: new Date().toISOString() }
                }
                return e
              })
            }

            if (!nextCache[selectedDate]) nextCache[selectedDate] = []
            nextCache[selectedDate] = [...nextCache[selectedDate], tempEvent]
            nextPendingSyncs.add(tempId)

            return {
              eventsCache: nextCache,
              computedEventsCache: {},
              recurringEventsCache: {},
              selectedEventId: isEventSelected ? tempId : currentSelectedId,
              pendingSyncs: nextPendingSyncs,
              pendingUpdates: newPendingUpdates,
            }
          })
          
          // Fire DB in background
          setTimeout(async () => {
            try {
              const { data: { session } } = await getSafeSession()
              const user = session?.user
              if (!user) return
              
              // Update master series
              await supabase.from('events').update({ series_end_date: prevDay }).eq('id', masterEventId)
              
              // Insert new standalone event
              const queuedUpdates = (get().pendingUpdates.get(tempId) || [])
              const mergedQueuedUpdates = Object.assign({}, ...queuedUpdates)
              const finalStandaloneFields = {
                ...mergedStandaloneFields,
                ...mergedQueuedUpdates,
              }
              const newEventData = buildEventForDb(finalStandaloneFields, user.id)
              
              const { data: result } = await insertIfNotDuplicate(newEventData, user.id)
              
              if (result) {
                const realEvent = dbRowToEvent(result)
                const {
                  eventsCache: finalCache,
                  selectedEventId: currentSelectedId,
                  pendingSyncs: currentPendingSyncs,
                  pendingUpdates: currentPendingUpdates,
                } = get()
                const nextPendingSyncs = new Set(currentPendingSyncs)
                nextPendingSyncs.delete(tempId)
                const nextPendingUpdates = new Map(currentPendingUpdates)
                nextPendingUpdates.delete(tempId)
                set({
                  eventsCache: {
                    ...finalCache,
                    [selectedDate]: (finalCache[selectedDate] || []).map(e => e.id === tempId ? realEvent : e)
                  },
                  selectedEventId: currentSelectedId === tempId ? realEvent.id : currentSelectedId,
                  pendingSyncs: nextPendingSyncs,
                  pendingUpdates: nextPendingUpdates,
                })
              }
            } catch (err) {
              console.error('Failed to save split event:', err)
              const {
                eventsCache: finalCache,
                pendingSyncs: currentPendingSyncs,
                pendingUpdates: currentPendingUpdates,
                selectedEventId: currentSelectedId,
              } = get()
              const nextPendingSyncs = new Set(currentPendingSyncs)
              nextPendingSyncs.delete(tempId)
              const nextPendingUpdates = new Map(currentPendingUpdates)
              nextPendingUpdates.delete(tempId)
              set({
                eventsCache: {
                  ...finalCache,
                  [selectedDate]: (finalCache[selectedDate] || []).filter(e => e.id !== tempId),
                },
                pendingSyncs: nextPendingSyncs,
                pendingUpdates: nextPendingUpdates,
                selectedEventId: currentSelectedId === tempId ? null : currentSelectedId,
              })
            } finally {
              // Clear the master series update from pending list
              const { pendingUpdates: latestUpdates } = get()
              const nextUpdates = new Map(latestUpdates)
              const currentList = nextUpdates.get(masterEventId) || []
              const newList = currentList.filter(u => u !== masterUpdates)
              if (newList.length === 0) nextUpdates.delete(masterEventId)
              else nextUpdates.set(masterEventId, newList)
              set({ pendingUpdates: nextUpdates })
            }
          }, 0)
        }

        // Create new recurring series from next occurrence in background
        if (nextOccurrence <= originalSeriesEndDate) {
          const nextSeriesEndDate = originalSeriesEndDate
          const tempNextSeriesId = `temp-series-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const tempNextSeriesEvent: Event = {
            id: tempNextSeriesId,
            user_id: 'temp-user',
            title: originalTitle,
            description: masterEvent?.description ?? event.description,
            notes: masterEvent?.notes ?? event.notes,
            urls: masterEvent?.urls ?? event.urls,
            date: nextOccurrence,
            end_date: addDaysToDateStr(nextOccurrence, originalDurationDays),
            start_time: masterEvent?.start_time ?? event.start_time,
            end_time: masterEvent?.end_time ?? event.end_time,
            color: masterEvent?.color ?? event.color,
            is_all_day: masterEvent?.is_all_day ?? event.is_all_day,
            location: masterEvent?.location ?? event.location,
            goalType: masterEvent?.goalType ?? event.goalType,
            goal: masterEvent?.goal ?? event.goal,
            goalColor: masterEvent?.goalColor ?? event.goalColor,
            goalIcon: masterEvent?.goalIcon ?? event.goalIcon,
            repeat: originalRepeat,
            series_start_date: nextOccurrence,
            series_end_date: nextSeriesEndDate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            isTemp: true,
          }

          const { pendingSyncs } = get()
          const nextPendingSyncs = new Set(pendingSyncs)
          nextPendingSyncs.add(tempNextSeriesId)

          set(state => ({
            eventsCache: {
              ...state.eventsCache,
              [nextOccurrence]: [...(state.eventsCache[nextOccurrence] || []), tempNextSeriesEvent],
            },
            computedEventsCache: {},
            recurringEventsCache: {},
            eventExceptionsCache: {},
            pendingSyncs: nextPendingSyncs,
          }))

          setTimeout(async () => {
            try {
              const { data: { session } } = await getSafeSession()
                          const user = session?.user
                          if (!user)

 return

              const queuedUpdates = (get().pendingUpdates.get(tempNextSeriesId) || [])
              const mergedQueuedUpdates = Object.assign({}, ...queuedUpdates)
              const event3Data = buildEventForDb({
                title: originalTitle,
                description: masterEvent?.description ?? event.description,
                notes: masterEvent?.notes ?? event.notes,
                urls: masterEvent?.urls ?? event.urls,
                date: nextOccurrence,
                end_date: addDaysToDateStr(nextOccurrence, originalDurationDays),
                start_time: masterEvent?.start_time ?? event.start_time,
                end_time: masterEvent?.end_time ?? event.end_time,
                color: masterEvent?.color ?? event.color,
                is_all_day: masterEvent?.is_all_day ?? event.is_all_day,
                location: masterEvent?.location ?? event.location,
                goalType: masterEvent?.goalType ?? event.goalType,
                goal: masterEvent?.goal ?? event.goal,
                goalColor: masterEvent?.goalColor ?? event.goalColor,
                goalIcon: masterEvent?.goalIcon ?? event.goalIcon,
                repeat: originalRepeat,
                series_start_date: nextOccurrence,
                series_end_date: nextSeriesEndDate,
                ...mergedQueuedUpdates,
              }, user.id)

              const { data: result, error } = await insertIfNotDuplicate(event3Data, user.id)

              if (error || !result) throw error

              const realSeriesEvent = dbRowToEvent(result)
              const {
                eventsCache: finalCache,
                pendingSyncs: currentPendingSyncs,
                pendingUpdates: currentPendingUpdates,
                selectedEventId: currentSelectedId,
              } = get()
              const nextPendingSyncs = new Set(currentPendingSyncs)
              nextPendingSyncs.delete(tempNextSeriesId)
              const nextPendingUpdates = new Map(currentPendingUpdates)
              nextPendingUpdates.delete(tempNextSeriesId)
              set({
                eventsCache: {
                  ...finalCache,
                  [nextOccurrence]: (finalCache[nextOccurrence] || []).map(e =>
                    e.id === tempNextSeriesId ? realSeriesEvent : e
                  ),
                },
                computedEventsCache: {},
                recurringEventsCache: {},
                eventExceptionsCache: {},
                pendingSyncs: nextPendingSyncs,
                pendingUpdates: nextPendingUpdates,
                selectedEventId: currentSelectedId === tempNextSeriesId ? realSeriesEvent.id : currentSelectedId,
              })
            } catch {
              const {
                eventsCache: finalCache,
                pendingSyncs: currentPendingSyncs,
                pendingUpdates: currentPendingUpdates,
                selectedEventId: currentSelectedId,
              } = get()
              const nextPendingSyncs = new Set(currentPendingSyncs)
              nextPendingSyncs.delete(tempNextSeriesId)
              const nextPendingUpdates = new Map(currentPendingUpdates)
              nextPendingUpdates.delete(tempNextSeriesId)
              set({
                eventsCache: {
                  ...finalCache,
                  [nextOccurrence]: (finalCache[nextOccurrence] || []).filter(e => e.id !== tempNextSeriesId),
                },
                computedEventsCache: {},
                recurringEventsCache: {},
                eventExceptionsCache: {},
                pendingSyncs: nextPendingSyncs,
                pendingUpdates: nextPendingUpdates,
                selectedEventId: currentSelectedId === tempNextSeriesId ? null : currentSelectedId,
              })
            }
          }, 0)
        }
      },

      updateThisAndFollowing: async (event, selectedDate, newStartTime, newEndTime, updates) => {
        const startTimeForNewEvent = updates?.start_time ?? newStartTime
        const endTimeForNewEvent = updates?.end_time ?? newEndTime
        const { eventsCache } = get()

        const masterEventId = event.seriesMasterId || event.id
        const masterEvent = findMasterEvent(eventsCache, masterEventId)
        const currentSelectedId = get().selectedEventId
        const isEventSelected = currentSelectedId === event.id || currentSelectedId === masterEventId

        // Safety: if we are performing "this and following" on the very first occurrence of the series,
        // it is equivalent to updating the entire series.
        if (masterEvent && selectedDate === masterEvent.date) {
          await get().updateAllInSeries(masterEventId, updates || {})
          return
        }

        const originalSeriesEndDate = masterEvent?.series_end_date || event.series_end_date || event.date
        const originalRepeat = masterEvent?.repeat || event.repeat || 'None'
        const nextRepeat = updates?.repeat ?? originalRepeat
        const nextSeriesEndDate = nextRepeat === 'None' ? undefined : originalSeriesEndDate
        const prevDay = (() => {
          const d = new Date(selectedDate + 'T00:00:00')
          d.setDate(d.getDate() - 1)
          return formatDate(d)
        })()

        // Optimistically shorten original series in cache
        const { eventsCache: currentEventsCache } = get()
        const newCache = { ...currentEventsCache }
        for (const dateKey of Object.keys(newCache)) {
          newCache[dateKey] = newCache[dateKey].map(e => {
            if (e.id === masterEventId) {
              return { ...e, series_end_date: prevDay, updated_at: new Date().toISOString() }
            }
            return e
          })
        }
        set({
          eventsCache: newCache,
          computedEventsCache: {},
          recurringEventsCache: {},
          eventExceptionsCache: {},
        })

        // Create new series in cache optimistically
        const tempSeriesId = `temp-series-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const mergedSeriesFields = normalizeGoalMetadataForDateChange(masterEvent ?? event, {
          title: updates?.title ?? event.title,
          description: updates?.description ?? masterEvent?.description ?? event.description,
          notes: updates?.notes ?? masterEvent?.notes ?? event.notes,
          urls: updates?.urls ?? masterEvent?.urls ?? event.urls,
          date: selectedDate,
          end_date: updates?.end_date ?? event.end_date ?? selectedDate,
          start_time: startTimeForNewEvent ?? masterEvent?.start_time ?? event.start_time,
          end_time: endTimeForNewEvent ?? masterEvent?.end_time ?? event.end_time,
          color: updates?.color ?? masterEvent?.color ?? event.color,
          is_all_day: updates?.is_all_day ?? masterEvent?.is_all_day ?? event.is_all_day,
          location: updates?.location ?? masterEvent?.location ?? event.location,
          goalType: updates?.goalType ?? masterEvent?.goalType ?? event.goalType,
          goal: updates?.goal ?? masterEvent?.goal ?? event.goal,
          goalColor: updates?.goalColor ?? masterEvent?.goalColor ?? event.goalColor,
          goalIcon: updates?.goalIcon ?? masterEvent?.goalIcon ?? event.goalIcon,
          repeat: nextRepeat,
          series_start_date: nextRepeat === 'None' ? undefined : selectedDate,
          series_end_date: nextSeriesEndDate,
        })
        const tempSeriesCached: Event = {
          id: tempSeriesId,
          user_id: 'temp-user',
          title: mergedSeriesFields.title || 'New Event',
          description: mergedSeriesFields.description,
          notes: mergedSeriesFields.notes,
          urls: mergedSeriesFields.urls,
          date: mergedSeriesFields.date || selectedDate,
          end_date: mergedSeriesFields.end_date || selectedDate,
          start_time: mergedSeriesFields.start_time ?? event.start_time,
          end_time: mergedSeriesFields.end_time ?? event.end_time,
          color: mergedSeriesFields.color,
          is_all_day: mergedSeriesFields.is_all_day,
          location: mergedSeriesFields.location,
          goalType: mergedSeriesFields.goalType,
          goal: mergedSeriesFields.goal,
          goalColor: mergedSeriesFields.goalColor,
          goalIcon: mergedSeriesFields.goalIcon,
          repeat: nextRepeat,
          series_start_date: nextRepeat === 'None' ? undefined : selectedDate,
          series_end_date: nextSeriesEndDate,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          isTemp: true,
        }

        const { pendingSyncs } = get()
        const nextPendingSyncs = new Set(pendingSyncs)
        nextPendingSyncs.add(tempSeriesId)

        set(state => ({
          eventsCache: {
            ...state.eventsCache,
            [selectedDate]: [...(state.eventsCache[selectedDate] || []), tempSeriesCached],
          },
          computedEventsCache: {},
          recurringEventsCache: {},
          eventExceptionsCache: {},
          pendingSyncs: nextPendingSyncs,
          selectedEventId: isEventSelected ? tempSeriesId : currentSelectedId,
        }))

        // Fire DB operations in background
        setTimeout(async () => {
          try {
            // Update master event series_end_date
            await supabase.from('events').update({ series_end_date: prevDay }).eq('id', masterEventId)

            // Insert new series
            const { data: { session } } = await getSafeSession()
                        const user = session?.user
                        if (!user)
 return

            const queuedUpdates = (get().pendingUpdates.get(tempSeriesId) || [])
            const mergedQueuedUpdates = Object.assign({}, ...queuedUpdates)
            const newSeriesData = buildEventForDb({ ...mergedSeriesFields, ...mergedQueuedUpdates }, user.id)

            const { data: result, error } = await insertIfNotDuplicate(newSeriesData, user.id)

            if (error || !result) return

            // Replace temp with real event
            const realSeriesCached = dbRowToEvent(result)
            const {
              eventsCache: finalCache,
              pendingSyncs: currentPendingSyncs,
              pendingUpdates: currentPendingUpdates,
              selectedEventId: currentSelectedId,
            } = get()
            const nextPendingSyncs = new Set(currentPendingSyncs)
            nextPendingSyncs.delete(tempSeriesId)
            const nextPendingUpdates = new Map(currentPendingUpdates)
            nextPendingUpdates.delete(tempSeriesId)
            set({
              eventsCache: {
                ...finalCache,
                [selectedDate]: (finalCache[selectedDate] || []).map(e =>
                  e.id === tempSeriesId ? realSeriesCached : e
                ),
              },
              computedEventsCache: {},
              recurringEventsCache: {},
              eventExceptionsCache: {},
              pendingSyncs: nextPendingSyncs,
              pendingUpdates: nextPendingUpdates,
              selectedEventId: currentSelectedId === tempSeriesId ? realSeriesCached.id : currentSelectedId,
            })
          } catch {
            const {
              eventsCache: finalCache,
              pendingSyncs: currentPendingSyncs,
              pendingUpdates: currentPendingUpdates,
              selectedEventId: currentSelectedId,
            } = get()
            const nextPendingSyncs = new Set(currentPendingSyncs)
            nextPendingSyncs.delete(tempSeriesId)
            const nextPendingUpdates = new Map(currentPendingUpdates)
            nextPendingUpdates.delete(tempSeriesId)
            set({
              eventsCache: {
                ...finalCache,
                [selectedDate]: (finalCache[selectedDate] || []).filter(e => e.id !== tempSeriesId),
              },
              computedEventsCache: {},
              recurringEventsCache: {},
              eventExceptionsCache: {},
              pendingSyncs: nextPendingSyncs,
              pendingUpdates: nextPendingUpdates,
              selectedEventId: currentSelectedId === tempSeriesId ? null : currentSelectedId,
            })
          }
        }, 0)
      },

      deleteSingleOccurrence: async (event, selectedDate) => {
        const { eventsCache, eventExceptionsCache } = get()
        const masterEventId = event.seriesMasterId || event.id
        const masterEvent = findMasterEvent(eventsCache, masterEventId)
        if (!masterEvent) return

        const isMasterOccurrence = selectedDate === masterEvent.date
        if (isMasterOccurrence) {
          const repeatType = masterEvent.repeat || event.repeat || 'None'
          const seriesEndDate = masterEvent.series_end_date || event.series_end_date || masterEvent.date
          const nextOccurrence = getNextOccurrence(selectedDate, repeatType)

          if (repeatType === 'None' || nextOccurrence > seriesEndDate) {
            await get().deleteEvent(masterEventId)
            return
          }

          const durationDays = (() => {
            const start = new Date(masterEvent.date + 'T00:00:00')
            const end = new Date((masterEvent.end_date || masterEvent.date) + 'T00:00:00')
            return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
          })()

          await get().updateEvent(masterEventId, {
            date: nextOccurrence,
            end_date: addDaysToDateStr(nextOccurrence, durationDays),
            series_start_date: nextOccurrence,
          })
          return
        }

        // Optimistically add exception to cache
        const newException: EventException = {
          id: `temp-exception-${Date.now()}`,
          series_id: masterEventId,
          date: selectedDate,
          deleted: true as any,
        }

        const existingExceptions = eventExceptionsCache[masterEventId] || []
        const updatedExceptions = [...existingExceptions, newException]

        set({
          eventExceptionsCache: {
            ...eventExceptionsCache,
            [masterEventId]: updatedExceptions,
          },
          computedEventsCache: {},
          recurringEventsCache: {},
        })

        // Fire DB in background
        setTimeout(async () => {
          try {
            const { data: { session } } = await getSafeSession()
                        const user = session?.user
                        if (!user)
 return

            const { data: existingExceptions, error: selectError } = await supabase
              .from('exceptions')
              .select('id')
              .eq('series_id', masterEventId)
              .eq('date', selectedDate)
              .limit(1)

            if (selectError) throw selectError

            const existingExceptionId = existingExceptions?.[0]?.id

            if (existingExceptionId) {
              const { error: updateError } = await supabase
                .from('exceptions')
                .update({ deleted: true })
                .eq('id', existingExceptionId)

              if (updateError) throw updateError
            } else {
              const payloadWithUser = {
                series_id: masterEventId,
                user_id: user.id,
                date: selectedDate,
                deleted: true,
              }

              let insertError: Error | null = null

              const withUserResult = await supabase
                .from('exceptions')
                .insert([payloadWithUser])

              if (withUserResult.error) {
                const message = withUserResult.error.message || ''
                const details = withUserResult.error.details || ''
                const hints = withUserResult.error.hint || ''
                const combined = `${message} ${details} ${hints}`.toLowerCase()

                const unknownUserColumn =
                  combined.includes('user_id') &&
                  (combined.includes('column') || combined.includes('schema cache'))

                if (!unknownUserColumn) {
                  throw withUserResult.error
                }

                const fallbackResult = await supabase
                  .from('exceptions')
                  .insert([{
                    series_id: masterEventId,
                    date: selectedDate,
                    deleted: true,
                  }])

                insertError = fallbackResult.error
              }

              if (insertError) throw insertError
            }
          } catch (error) {
            console.error('Failed to persist deleted recurring occurrence:', error)
            // Rollback on failure
            set({
              eventExceptionsCache: {
                ...eventExceptionsCache,
                [masterEventId]: existingExceptions,
              },
            })
          }
        }, 0)
      },

      clearCache: () => {
        set({
          eventsCache: {},
          computedEventsCache: {},
          recurringEventsCache: {},
          eventExceptionsCache: {},
          cacheStartDate: null,
          cacheEndDate: null,
          cachedUserId: null,
          lastPersistedAt: null,
          isLoading: false,
          isAutoCompleting: false,
          loadingCount: 0,
          error: null,
          pendingSyncs: new Set(),
          pendingUpdates: new Map(),
          pendingDeletes: new Set(),
          selectedEventId: null,
          scrollToEventId: null,
          scrollToTop: false,
          saveTrigger: 0,
          recurringDialogOpen: false,
          recurringDialogEvent: null,
          recurringDialogActionType: null,
          recurringDialogCallback: null,
          hasEditsEventId: null,
          liveEventTimes: {},
        })
      },
    }),
    {
      name: 'events-storage',
      partialize: (state) => {
        const prunedEventsCache = prunePersistedEventsCache(state.eventsCache)

        return {
          eventsCache: prunedEventsCache,
          eventExceptionsCache: prunePersistedExceptionsCache(state.eventExceptionsCache, prunedEventsCache),
          cacheStartDate: state.cacheStartDate,
          cacheEndDate: state.cacheEndDate,
          cachedUserId: state.cachedUserId,
          lastPersistedAt: Date.now(),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state?.lastPersistedAt) return
        if (Date.now() - state.lastPersistedAt <= PERSIST_TTL_MS) {
          state.eventsCache = sanitizeEventsCache(state.eventsCache)
          return
        }

        state.clearCache()
      },
    }
  )
)
