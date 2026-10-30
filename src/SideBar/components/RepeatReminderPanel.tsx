import React, { useCallback, useState, useEffect, useRef } from "react"
import { useEventsStore, type CalendarEvent, type NewEvent } from "@/store/eventsStore"
import { addYearsToDateStr } from "@/store/dateUtils"
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from "@/store/recurringUtils"
import RepeatRow from "./RepeatRow"
import EarlyReminderRow from "./EarlyReminderRow"
import AllDayRow from "./AllDayRow"
import { useRecurringPropertyChange } from "@/hooks/useRecurringPropertyChange"
import { getEventDurationMinutes, isMultiDayEvent } from "@/lib/eventUtils"

const RepeatReminderPanel: React.FC = () => {
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const updateEventField = useEventsStore((state) => state.updateEventField)
  const eventsCache = useEventsStore((state) => state.eventsCache)
  const computedEventsCache = useEventsStore((state) => state.computedEventsCache)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  const saveTrigger = useEventsStore((state) => state.saveTrigger)

  const [pendingRepeat, setPendingRepeat] = useState<string | null>(null)

  // Find event - real events from eventsCache, virtual from computedEventsCache
  const selectedEvent = React.useMemo(() => {
    if (!selectedEventId) return null

    const datePattern = /-(\d{4}-\d{2}-\d{2})$/
    const isVirtual = datePattern.test(selectedEventId)

    if (isVirtual) {
      // Check computed cache for virtual events
      for (const events of Object.values(computedEventsCache)) {
        const found = events.find(e => e.id === selectedEventId)
        if (found) return found as CalendarEvent
      }

      // Generate on-demand from master
      const match = selectedEventId.match(datePattern)
      if (match) {
        const virtualDate = match[1]
        const masterId = selectedEventId.replace(datePattern, '')
        for (const events of Object.values(eventsCache)) {
          const master = events.find(e => e.id === masterId)
          if (master) {
            const hasSeriesBounds =
              !!master.repeat &&
              master.repeat !== "None" &&
              !!(master as any).series_start_date &&
              !!(master as any).series_end_date
            if (!hasSeriesBounds) return null
            if (virtualDate < (master as any).series_start_date || virtualDate > (master as any).series_end_date) return null
            if (virtualDate === master.date) return null

            return {
              ...master,
              id: selectedEventId,
              date: virtualDate,
              end_date: virtualDate,
              isRecurringInstance: true,
              seriesMasterId: masterId,
              occurrenceDate: virtualDate,
            } as CalendarEvent
          }
        }
      }
      return null
    }

    // Real event
    for (const events of Object.values(eventsCache)) {
      const found = events.find(e => e.id === selectedEventId)
      if (found) return found as CalendarEvent
    }
    return null
  }, [selectedEventId, eventsCache, computedEventsCache])

  // Clear pending repeat when selected event changes
  useEffect(() => {
    if (selectedEvent) setPendingRepeat(null)
  }, [selectedEvent?.id])

  // Apply pending repeat on save
  const lastProcessedSaveTriggerRef = useRef<number>(0)
  useEffect(() => {
    if (saveTrigger === 0 || !selectedEventId || pendingRepeat === null) return
    if (!selectedEvent) return
    
    // Only process each saveTrigger value once
    if (saveTrigger === lastProcessedSaveTriggerRef.current) {
      return
    }
    
    // Only process if this is the event that was being edited
    if (selectedEvent.id !== selectedEventId) {
      return
    }
    
    lastProcessedSaveTriggerRef.current = saveTrigger

    const isRecurring = isSeriesActuallyRecurring(selectedEvent)
    const buildRepeatUpdates = (): Partial<NewEvent> => {
      const updates: Partial<NewEvent> = { repeat: pendingRepeat }
      if (pendingRepeat === "None") {
        updates.series_start_date = undefined
        updates.series_end_date = undefined
      }
      return updates
    }

    if (isRecurring) {
      if (isSeriesAnchorEvent(selectedEvent)) {
        const updateAllInSeries = useEventsStore.getState().updateAllInSeries
        const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
        const updates: Partial<NewEvent> = { repeat: pendingRepeat }
        if (pendingRepeat !== "None") {
          updates.series_start_date = selectedEvent.date
          updates.series_end_date = addYearsToDateStr(selectedEvent.date, 10)
        }
        void updateAllInSeries(seriesMasterId, updates)
        setPendingRepeat(null)
        return
      }

      showRecurringDialog(
        selectedEvent,
        "edit",
        async (choice: string) => {
          if (choice === "only-this") {
            const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
            await splitRecurringEvent(
              selectedEvent as any,
              selectedEvent.date,
              selectedEvent.start_time,
              selectedEvent.end_time,
              buildRepeatUpdates()
            )
          } else if (choice === "all-events") {
            const updateAllInSeries = useEventsStore.getState().updateAllInSeries
            const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEventId
            const updates: Partial<NewEvent> = { repeat: pendingRepeat }
            if (pendingRepeat !== "None") {
              updates.series_start_date = selectedEvent.date
              updates.series_end_date = addYearsToDateStr(selectedEvent.date, 10)
            }
            await updateAllInSeries(seriesMasterId, updates)
          } else if (choice === "this-and-following") {
            const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
            const updates: Partial<NewEvent> = { repeat: pendingRepeat }
            if (pendingRepeat !== "None") {
              updates.series_start_date = selectedEvent.date
              updates.series_end_date = addYearsToDateStr(selectedEvent.date, 10)
            }
            await updateThisAndFollowing(
              selectedEvent,
              selectedEvent.date,
              selectedEvent.start_time,
              selectedEvent.end_time,
              updates
            )
          }
          setPendingRepeat(null)
          closeRecurringDialog()
        }
      )
    } else {
      const updates: Partial<NewEvent> = { repeat: pendingRepeat }
      if (pendingRepeat !== "None") {
        updates.series_start_date = selectedEvent.date
        updates.series_end_date = addYearsToDateStr(selectedEvent.date, 10)
      }
      const updateEventFields = useEventsStore.getState().updateEventFields
      updateEventFields(selectedEventId, updates)
      setPendingRepeat(null)
    }
  }, [saveTrigger, selectedEventId, pendingRepeat, selectedEvent, updateEventField, showRecurringDialog, closeRecurringDialog])

  // Use shared hook for non-repeat property changes
  const handlePropertyChange = useRecurringPropertyChange()

  const handleRepeatChange = useCallback((value: string) => {
    setPendingRepeat(value)
  }, [])

  const handleEarlyReminderChange = useCallback(
    (value: string) => {
      if (!selectedEvent) return
      handlePropertyChange(selectedEvent, "earlyReminder", value)
    },
    [selectedEvent, handlePropertyChange]
  )

  const handleAllDayChange = useCallback(
    (value: boolean) => {
      if (!selectedEvent) return
      handlePropertyChange(selectedEvent, "is_all_day", value)
    },
    [selectedEvent, handlePropertyChange]
  )

  // Compute whether all-day should be forced (24h+ duration only)
  const shouldForceAllDay = React.useMemo(() => {
    if (!selectedEvent) return false
    return !isMultiDayEvent(selectedEvent) && getEventDurationMinutes(selectedEvent) >= 1440
  }, [selectedEvent])

  // Auto-enable all-day when duration is 24h+; disable when reverting
  const prevForceAllDay = useRef(shouldForceAllDay)
  useEffect(() => {
    if (!selectedEvent) return
    const wasForced = prevForceAllDay.current
    prevForceAllDay.current = shouldForceAllDay

    if (shouldForceAllDay && !selectedEvent.is_all_day) {
      handlePropertyChange(selectedEvent, "is_all_day", true)
    } else if (!shouldForceAllDay && wasForced && selectedEvent.is_all_day) {
      handlePropertyChange(selectedEvent, "is_all_day", false)
    }
  }, [selectedEvent?.id, selectedEvent?.date, selectedEvent?.end_date, selectedEvent?.is_all_day, shouldForceAllDay])

  // Whether the event is multi-day (repeat doesn't make sense for multi-day)
  const isMultiDay = React.useMemo(() => {
    if (!selectedEvent) return false
    return isMultiDayEvent(selectedEvent)
  }, [selectedEvent])

  if (!selectedEvent) return null

  const allDayDisabled = shouldForceAllDay

  return (
    <div className="shadow-lg border border-neutral-100 w-full bg-[#ececec] rounded-[52px] pl-5 pr-6 py-6 border-20 space-y-3 shadow-none">
      <RepeatRow
        value={pendingRepeat ?? (selectedEvent.repeat || "None")}
        onChange={handleRepeatChange}
        disabled={isMultiDay}
      />

      <hr className="border-neutral-300 border-t-[2px]" />

      <EarlyReminderRow
        value={selectedEvent.earlyReminder || "None"}
        onChange={handleEarlyReminderChange}
      />

      <hr className="border-neutral-300 border-t-[2px]" />

      <AllDayRow
        value={selectedEvent.is_all_day || false}
        onChange={handleAllDayChange}
        disabled={allDayDisabled}
      />
    </div>
  )
}

export default RepeatReminderPanel
