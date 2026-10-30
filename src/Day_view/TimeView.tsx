import React, { useState, useRef, useEffect, useLayoutEffect } from "react"
import ReactDOM from "react-dom"
import type { EventType, EventPositions } from '../lib/eventUtils'
import {unlockInteraction, resetInteractionLock, addEventOnClick, TOP_DEAD_ZONE, SLOT_HEIGHT, calculateEventDuration, STEP_HEIGHT, snap, yToTimeSnapped, storeEventToUIEvent, uiEventToStoreEvent, calculateEventPositions } from '../lib/eventUtils'
import { useTimeStore } from "@/store/timeStore"
import { useEventsStore, formatDate } from "@/store/eventsStore"
import { resolveGoalColorForEvent, resolveGoalIconForEvent, useGoalsStore } from "@/store/goalsStore"
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from "@/store/recurringUtils"
import { supabase, getSafeSession } from '@/lib/supabase'

import { TimeEventCard } from "./TimeEventCard"
import { applyInsetPositionsToDOM, EVENT_FULL_WIDTH_WITH_GAPS, EVENT_SIDE_GAP, EVENT_TOP_GAP } from "./timeViewLayout"

interface TimeViewProps {
  initialEvents?: EventType[]
}

const TimeView: React.FC<TimeViewProps> = () => {
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const addEventLocal = useEventsStore((state) => state.addEventLocal)
  const updateEvent = useEventsStore((state) => state.updateEvent)
  const deleteEvent = useEventsStore((state) => state.deleteEvent)
  const getEventById = useEventsStore((state) => state.getEventById)
  const eventsCache = useEventsStore((state) => state.eventsCache)
  const computedEventsCache = useEventsStore((state) => state.computedEventsCache)
  const getEventsForDate = useEventsStore((state) => state.getEventsForDate)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)
  const setScrollToEventId = useEventsStore((state) => state.setScrollToEventId)
  const setLiveEventTime = useEventsStore((state) => state.setLiveEventTime)
  const clearLiveEventTime = useEventsStore((state) => state.clearLiveEventTime)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  const goalsStore = useGoalsStore((state) => state.store)

  // Local state for events - this is the key to performance!
  // We work with local events during drag/resize for instant feedback
  const [localEvents, setLocalEvents] = useState<EventType[]>([])
  const [eventPositions, setEventPositions] = useState<EventPositions>({})
  const localEventsRef = useRef<EventType[]>([])
  const livePreviewRef = useRef<{ id: string; start: number; end: number } | null>(null)
  
  // Skip sync ref for recurring action handling
  const skipSyncRef = useRef(false)
  const lastDateKeyRef = useRef<string | null>(null)
  const [containerVisible, setContainerVisible] = useState(false)
  const lastHandledAddNowTokenRef = useRef<string | null>(null)

  useEffect(() => {
    localEventsRef.current = localEvents
  }, [localEvents])

  const replaceLocalEvents = React.useCallback((nextEvents: EventType[]) => {
    localEventsRef.current = nextEvents
    setLocalEvents(nextEvents)
  }, [])
  
  // Sync local events from store when not dragging/resizing
  useEffect(() => {
    // Skip sync when handling recurring action (to preserve local state changes)
    if (skipSyncRef.current) {
      skipSyncRef.current = false
      return
    }
    
    if (!selectedDate) {
      replaceLocalEvents([])
      clearLiveEventTime()
      livePreviewRef.current = null
      return
    }
    
    // Check if date actually changed (not just events updates)
    const dateKey = selectedDate.toISOString().split('T')[0]
    const isDateChange = lastDateKeyRef.current !== dateKey
    if (isDateChange) {
      lastDateKeyRef.current = dateKey
      setContainerVisible(false)
    }
    
    const pendingDeletesList = useEventsStore.getState().pendingDeletes
    
    // If there are pending deletes, force skip sync to prevent re-adding
    if (pendingDeletesList && pendingDeletesList.size > 0) {
      skipSyncRef.current = true
    }
    
    const storeEvents = getEventsForDate(selectedDate)
    const pendingDeletes = useEventsStore.getState().pendingDeletes
    
    // Filter out events that are pending delete and also skip if master was deleted
    const filteredEvents = storeEvents.filter(e => {
      if (pendingDeletes.has(e.id)) return false
      if ((e as any).seriesMasterId && pendingDeletes.has((e as any).seriesMasterId)) return false
      return true
    })
    const uiEvents = filteredEvents.map(event => {
      const resolvedGoalColor = resolveGoalColorForEvent(goalsStore, event)
      const resolvedGoalIcon = resolveGoalIconForEvent(goalsStore, event)
      return storeEventToUIEvent(
        {
          ...event,
          color: event.goalColor || resolvedGoalColor || event.color,
          goalIcon: event.goalIcon || resolvedGoalIcon,
        },
        selectedDate
      )
    })
    
    // Check if any temp events were replaced with real ones (ID swap detection)
    const currentIds = new Set(localEvents.map(e => e.id))
    const newIds = new Set(uiEvents.map(e => e.id))
    
    // Find IDs that disappeared (temp events)
    const removedIds = [...currentIds].filter(id => !newIds.has(id))
    
    // Find ID swaps before updating state
    // When a temp event is replaced with a real one, we track the mapping
    // and update the DOM element's ID so React doesn't destroy and recreate it
    removedIds.forEach(removedId => {
      if (pendingEventIds.current.has(removedId)) {
        // Find the removed event's position
        const removedEvent = localEvents.find(e => e.id === removedId)
        if (removedEvent) {
          // Find a new event at the same position (the real one)
          const replacementEvent = uiEvents.find(e => 
            e.slot === removedEvent.slot && 
            e.startHour === removedEvent.startHour &&
            e.startMin === removedEvent.startMin &&
            e.height === removedEvent.height &&
            e.title === removedEvent.title
          )
          if (replacementEvent) {
            // Store the mapping from temp ID to real ID
            idMapping.current.set(removedId, replacementEvent.id)
            
            // Update the DOM element's ID from temp to real
            const tempEl = document.getElementById(removedId) as HTMLDivElement | null
            if (tempEl) {
              tempEl.id = replacementEvent.id
            }
            
            // Mark this ID to skip layout animation
            lastAddedEventId.current = replacementEvent.id
          }
        }
        pendingEventIds.current.delete(removedId)
      }
    })
    
    replaceLocalEvents(uiEvents)
    
    // Pre-calculate event positions synchronously so events render at correct positions
    const positions = calculateEventPositions(uiEvents.filter(e => !e.isAllDay), selectedEventId)
    setEventPositions(positions)
    
    // Clean up old ID mappings for events that no longer exist
    const currentEventIds = new Set(uiEvents.map(e => e.id))
    for (const [tempId, realId] of idMapping.current.entries()) {
      if (!currentEventIds.has(realId)) {
        idMapping.current.delete(tempId)
      }
    }
  }, [selectedDate, eventsCache, computedEventsCache, getEventsForDate, goalsStore, replaceLocalEvents])
  
  // UI state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const dragOffsetRef = useRef(0)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
  const recentlyInteractedRef = useRef(false)
  const mouseDownPosRef = useRef<{ x: number; y: number; eventId: string } | null>(null)
  const justCreatedEventRef = useRef<string | null>(null)
  const originalEventRef = useRef<{ id: string; slot: number; startHour: number; startMin: number; endHour: number; endMin: number; height: number; duration: number } | null>(null)
  const DRAG_THRESHOLD = 5

  const createNewEventAtY = (
    yInGrid: number,
    shouldScrollToNewEvent: boolean = false,
    startAtExactSlot: boolean = false
  ) => {
    if (!selectedDate) return null

    const newUIEvent = startAtExactSlot
      ? (() => {
          const duration = SLOT_HEIGHT
          const dayHeight = 24 * SLOT_HEIGHT
          const snappedStart = Math.max(0, snap(yInGrid))
          const startY = Math.min(snappedStart, dayHeight - duration)
          const start = yToTimeSnapped(startY)
          const end = yToTimeSnapped(startY + duration)
          return {
            id: Math.random().toString(36).slice(2, 11),
            slot: startY,
            height: duration,
            startHour: start.hour,
            startMin: start.min,
            endHour: end.hour,
            endMin: end.min,
            title: "New Event",
            date: selectedDate,
            endDate: selectedDate,
            notes: "",
            urls: [],
          }
        })()
      : addEventOnClick(yInGrid, localEventsRef.current, selectedDate)
    if (!newUIEvent) return null

    lastAddedEventId.current = newUIEvent.id
    pendingEventIds.current.add(newUIEvent.id)

    const allEventsWithNew = [...localEventsRef.current, newUIEvent]
    replaceLocalEvents(allEventsWithNew)

    const positions = calculateEventPositions(allEventsWithNew.filter(e => !(e as EventType).isAllDay), newUIEvent.id)
    applyInsetPositionsToDOM(positions)
    setEventPositions(positions)

    requestAnimationFrame(() => {
      const newEl = document.getElementById(newUIEvent.id) as HTMLDivElement | null
      if (newEl) {
        newEl.style.opacity = "0"

        requestAnimationFrame(() => {
          newEl.style.transition = "opacity 150ms ease-out"
          newEl.style.opacity = "1"

          setTimeout(() => {
            newEl.style.transition = ""
            newEl.style.opacity = ""
          }, 150)
        })
      }
    })

    const dateStr = formatDate(selectedDate)
    const storeEvent = uiEventToStoreEvent(newUIEvent, dateStr)
    try {
      justCreatedEventRef.current = newUIEvent.id
      setSelectedEvent(newUIEvent.id)
      if (shouldScrollToNewEvent) {
        setScrollToEventId(newUIEvent.id)
      }

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
    } catch (error) {
      // Event creation failed
    }

    return newUIEvent.id
  }

  // Reset interaction lock on mount to ensure clean state
  useEffect(() => {
    resetInteractionLock()
  }, [])

  // Handle ESC key to delete selected event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEventId) {
        const selectedGridEvent = localEvents.find((event) => event.id === selectedEventId)
        const selectedEvent = selectedGridEvent ?? getEventById(selectedEventId)
        if (selectedEvent) {
          if (selectedEvent.title === "New Event") {
            // Delete new events immediately in UI.
            if (selectedGridEvent) removeEventLocally(selectedEvent.id)
            void deleteEvent(selectedEvent.id)
            setSelectedEvent(null)
          } else if (isSeriesActuallyRecurring(selectedEvent as any)) {
            const eventDateStr = selectedEvent.date instanceof Date
              ? formatDate(selectedEvent.date)
              : selectedEvent.date

            if (isSeriesAnchorEvent(selectedEvent as any)) {
              if (selectedGridEvent) removeEventLocally(selectedEvent.id)
              void deleteEvent((selectedEvent as any).seriesMasterId || selectedEvent.id)
              setSelectedEvent(null)
              return
            }

            showRecurringDialog(selectedEvent as any, "delete", async (choice: string) => {
              if (choice === "only-this") {
                const deleteSingleOccurrence = useEventsStore.getState().deleteSingleOccurrence
                if (selectedGridEvent) removeEventLocally(selectedEvent.id)
                deleteSingleOccurrence(
                  selectedEvent as any,
                  eventDateStr,
                ).catch(() => {})
              } else if (choice === "all-events" && selectedEvent.seriesMasterId) {
                // Delete all events in the series - immediate optimistic delete
                const masterId = selectedEvent.seriesMasterId
                const { eventsCache, pendingDeletes } = useEventsStore.getState()
                const newCache = { ...eventsCache }
                for (const dateKey of Object.keys(newCache)) {
                  newCache[dateKey] = newCache[dateKey].filter(e => e.id !== masterId)
                }
                // Add to pending deletes so fetch won't re-add it
                const newPendingDeletes = new Set(pendingDeletes)
                newPendingDeletes.add(masterId)
                useEventsStore.setState({
                  eventsCache: newCache,
                  computedEventsCache: {},
                  recurringEventsCache: {},
                  eventExceptionsCache: {},
                  pendingDeletes: newPendingDeletes,
                })
                
                // Remove from local state
                setLocalEvents(prev => prev.filter(e => e.id !== masterId && e.seriesMasterId !== masterId))
                
                // Deselect if this was selected
                if (selectedEventId === selectedEvent.id) {
                  setSelectedEvent(null)
                }
                
                // Fire DB delete in background
                getSafeSession().then(({ data: { session } }) => {
                  if (!session?.user) return
                  supabase.from('events').delete().eq('id', masterId).then(({ error }) => {
                    if (error) {
                      console.error('Failed to delete series:', error)
                    } else {
                      // Remove from pendingDeletes after successful delete
                      const currentPending = useEventsStore.getState().pendingDeletes
                      const updatedPending = new Set(currentPending)
                      updatedPending.delete(masterId)
                      useEventsStore.setState({ pendingDeletes: updatedPending })
                    }
                  })
                })
              } else if (choice === "this-and-following" && selectedEvent.seriesMasterId) {
                const prevDay = (() => {
                  const d = new Date(eventDateStr)
                  d.setDate(d.getDate() - 1)
                  return d.toISOString().split('T')[0]
                })()
                const updateAllInSeries = useEventsStore.getState().updateAllInSeries
                await updateAllInSeries(selectedEvent.seriesMasterId, { series_end_date: prevDay })

                // Immediately remove affected recurring instances from local state
                setLocalEvents(prev => prev.filter(e => {
                  if (e.seriesMasterId === selectedEvent.seriesMasterId) {
                    const eventDate = e.date instanceof Date
                      ? formatDate(e.date)
                      : e.date
                    return eventDate < eventDateStr
                  }
                  return true
                }))
              }
              setSelectedEvent(null)
              closeRecurringDialog()
            })
          } else {
            // Non-recurring existing events - remove immediately, then persist delete.
            if (selectedGridEvent) removeEventLocally(selectedEvent.id)
            void deleteEvent(selectedEvent.id)
            setSelectedEvent(null)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEventId, deleteEvent, getEventById, setSelectedEvent, localEvents, showRecurringDialog, closeRecurringDialog])

  // Handle click on calendar to create events
  const handleContainerClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current || isResizingRef.current || recentlyInteractedRef.current) return
    
    const target = e.target as HTMLElement
    
    if (target.closest(".calendar-event")) {
      return
    }
    
    const currentSelectedId = useEventsStore.getState().selectedEventId
    if (currentSelectedId) {
      // Check if this is a virtual event ID (format: "masterEventId-YYYY-MM-DD")
      const datePattern = /-(\d{4}-\d{2}-\d{2})$/
      const isVirtualEventId = datePattern.test(currentSelectedId)
      
      // Only delete temp events that are in eventsCache (real events)
      // Virtual events should NOT be deleted - they're generated from master
      if (!isVirtualEventId) {
        const { eventsCache } = useEventsStore.getState()
        let eventInStore: any = null
        
        // Search in eventsCache (real events)
        for (const events of Object.values(eventsCache)) {
          const found = events.find(e => e.id === currentSelectedId)
          if (found) {
            eventInStore = found
            break
          }
        }
        
        if (eventInStore && eventInStore.isTemp === true && eventInStore.created_at === eventInStore.updated_at) {
          // Delete only untouched temp events (never edited — created_at === updated_at)
          deleteEvent(currentSelectedId)
          setSelectedEvent(null)
          justCreatedEventRef.current = null
          return
        }
      }
      
      // Ignore one outside click only for a truly untouched freshly created temp event.
      if (justCreatedEventRef.current === currentSelectedId) {
        const { eventsCache } = useEventsStore.getState()
        let currentSelectedEvent: any = null

        for (const events of Object.values(eventsCache)) {
          const found = events.find(e => e.id === currentSelectedId)
          if (found) {
            currentSelectedEvent = found
            break
          }
        }

        const isUntouchedFreshTemp =
          currentSelectedEvent &&
          currentSelectedEvent.isTemp === true &&
          currentSelectedEvent.created_at === currentSelectedEvent.updated_at &&
          (currentSelectedEvent.title === 'New Event' || !currentSelectedEvent.title?.trim())

        if (isUntouchedFreshTemp) {
          justCreatedEventRef.current = null
          return
        }

        justCreatedEventRef.current = null
      }
      
      // Clicking on empty grid just deselects - doesn't delete
      setSelectedEvent(null)
      // Recalculate positions so events go back to column layout
      const positions = calculateEventPositions(localEventsRef.current.filter(e => !e.isAllDay), null)
      setEventPositions(positions)
      return
    }
    
    // Create new event at click position
    const rect = e.currentTarget.getBoundingClientRect()
    let clickY = e.clientY - rect.top
    const clickX = e.clientX - rect.left
    
    if (clickY < TOP_DEAD_ZONE) return
    
    if (clickX < 76) {
      return
    }
    
    clickY -= TOP_DEAD_ZONE
    createNewEventAtY(clickY)
  }

  useEffect(() => {
    const maybeCreateNowEvent = (requestedToken?: string | null) => {
      if (!selectedDate) return

      const now = new Date()
      const isToday =
        selectedDate.getFullYear() === now.getFullYear() &&
        selectedDate.getMonth() === now.getMonth() &&
        selectedDate.getDate() === now.getDate()
      if (!isToday) return

      let tokenToHandle = requestedToken ?? null

      if (typeof window !== "undefined") {
        const pending = sessionStorage.getItem("pendingAddNowEvent")
        if (!tokenToHandle) tokenToHandle = pending
        if (!tokenToHandle || !pending || pending !== tokenToHandle) return
        if (lastHandledAddNowTokenRef.current === tokenToHandle) return
        lastHandledAddNowTokenRef.current = tokenToHandle
        sessionStorage.removeItem("pendingAddNowEvent")
      }

      const minutesNow = now.getHours() * 60 + now.getMinutes()
      const yInGrid = (minutesNow / 15) * STEP_HEIGHT
      const createdEventId = createNewEventAtY(yInGrid, true, true)
      if (!createdEventId || typeof window === "undefined") return

      window.requestAnimationFrame(() => {
        setSelectedEvent(createdEventId)
        setScrollToEventId(createdEventId)
      })
    }

    maybeCreateNowEvent()

    const onAddNow = (event: Event) => {
      const customEvent = event as CustomEvent<{ token?: string }>
      maybeCreateNowEvent(customEvent.detail?.token ?? null)
    }

    window.addEventListener("calendar:add-now-event", onAddNow)
    return () => window.removeEventListener("calendar:add-now-event", onAddNow)
  }, [selectedDate])

  const handleMouseDown = (e: React.MouseEvent, event: EventType) => {
    e.stopPropagation()
    e.preventDefault()
    
    mouseDownPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      eventId: event.id,
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffsetRef.current = e.clientY - rect.top
  }

  const startDrag = (event: EventType) => {
    setDraggingId(event.id)
    isDraggingRef.current = true
    recentlyInteractedRef.current = true
    
    const duration = calculateEventDuration(event)

    // Save original event state for cancel restore
    originalEventRef.current = {
      id: event.id,
      slot: event.slot,
      startHour: event.startHour,
      startMin: event.startMin,
      endHour: event.endHour,
      endMin: event.endMin,
      height: event.height,
      duration: duration
    }
    
    const el = document.getElementById(event.id) as HTMLDivElement | null
    if (!el) return
    
    el.style.left = `${EVENT_SIDE_GAP}px`
    el.style.width = EVENT_FULL_WIDTH_WITH_GAPS
    el.style.zIndex = "9999"
    el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)"
    el.style.transition = "box-shadow 100ms ease, width 200ms ease, left 200ms ease"
  }

  const handleResizeStart = (e: React.MouseEvent, event: EventType) => {
    e.stopPropagation()
    e.preventDefault()
    setResizingId(event.id)
    isResizingRef.current = true
    recentlyInteractedRef.current = true
    
    const duration = calculateEventDuration(event)

    // Save original event state for cancel restore
    originalEventRef.current = {
      id: event.id,
      slot: event.slot,
      startHour: event.startHour,
      startMin: event.startMin,
      endHour: event.endHour,
      endMin: event.endMin,
      height: event.height,
      duration: duration
    }
    
    // Style the element immediately for resize
    const el = document.getElementById(event.id) as HTMLDivElement | null
    if (el) {
      el.style.zIndex = "9999"
      el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)"
      el.style.transition = "box-shadow 100ms ease, width 200ms ease, left 200ms ease"
      el.style.left = `${EVENT_SIDE_GAP}px`
      el.style.width = EVENT_FULL_WIDTH_WITH_GAPS
    }
  }

  // Simple mousemove handler like the fast version
  // Effect dependencies are STABLE - localEvents only changes on mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector(".calendar-container")
      if (!container) return
      const rect = container.getBoundingClientRect()
      
      const tolerance = 50
      const isNearContainer = e.clientY >= rect.top - tolerance && e.clientY <= rect.bottom + tolerance
      
      if (!isNearContainer) {
        return
      }
      
      // Check for drag threshold to start dragging
      if (mouseDownPosRef.current && !isDraggingRef.current && !isResizingRef.current) {
        const dx = e.clientX - mouseDownPosRef.current.x
        const dy = e.clientY - mouseDownPosRef.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance > DRAG_THRESHOLD) {
        const event = localEventsRef.current.find(ev => ev.id === mouseDownPosRef.current?.eventId)
          if (event) {
            startDrag(event)
          }
        }
      }
      
      let y = e.clientY - rect.top - TOP_DEAD_ZONE
      const MAX_Y = 24 * 100
      y = Math.max(0, Math.min(y, MAX_Y))

      if (draggingId && isDraggingRef.current) {
        // Get current dragged event
        const draggedEvent = localEventsRef.current.find(ev => ev.id === draggingId)
        if (draggedEvent) {
          // Calculate new position with snapping
          const maxSlot = Math.max(0, (24 * 100) - draggedEvent.height)
          const snappedY = Math.max(0, Math.min(snap(y - dragOffsetRef.current), maxSlot))
          
          // Update DOM directly for smooth animation
          const el = document.getElementById(draggingId) as HTMLDivElement | null
          if (el) {
            el.style.top = `${snappedY + TOP_DEAD_ZONE + EVENT_TOP_GAP}px`
          }
          
          // Update local state for real-time overlap adjustments
          // This causes re-render but that's OK - it's local state only!
          const start = yToTimeSnapped(snappedY)
          const duration = originalEventRef.current?.duration || 0
          const startMinutes = start.hour * 60 + start.min
          const endMinutes = (startMinutes + duration) % 1440
          const endHour = Math.floor(endMinutes / 60)
          const endMin = endMinutes % 60

          const previousPreview = livePreviewRef.current
          if (
            !previousPreview ||
            previousPreview.id !== draggingId ||
            previousPreview.start !== startMinutes ||
            previousPreview.end !== endMinutes
          ) {
            setLiveEventTime(draggingId, startMinutes, endMinutes)
            livePreviewRef.current = { id: draggingId, start: startMinutes, end: endMinutes }
          }
          setLocalEvents(prev => {
            const updatedEvents = prev.map(ev =>
              ev.id === draggingId
                ? { ...ev, slot: snappedY, startHour: start.hour, startMin: start.min, endHour: endHour, endMin: endMin }
                : ev
            )
            localEventsRef.current = updatedEvents
            setEventPositions(calculateEventPositions(updatedEvents.filter(e => !e.isAllDay), draggingId))
            return updatedEvents
          })
        }
      }

      if (resizingId && isResizingRef.current) {
        // Get current resized event
        const resizedEvent = localEventsRef.current.find(ev => ev.id === resizingId)
        if (resizedEvent) {
          // Calculate new height with snapping
          const newHeight = Math.max(STEP_HEIGHT, snap(y - resizedEvent.slot))
          
          // Update DOM directly for smooth animation
          const el = document.getElementById(resizingId) as HTMLDivElement | null
          if (el) {
            el.style.height = `${Math.max(8, newHeight - EVENT_TOP_GAP)}px`
          }
          
          // Update local state for real-time overlap adjustments
          const end = yToTimeSnapped(resizedEvent.slot + newHeight)
          const startMinutes = resizedEvent.startHour * 60 + resizedEvent.startMin
          const endMinutes = end.hour * 60 + end.min
          console.log("[DayView resize move]", {
            id: resizingId,
            eventDate: resizedEvent.date instanceof Date ? formatDate(resizedEvent.date) : resizedEvent.date,
            slot: resizedEvent.slot,
            height: resizedEvent.height,
            newHeight,
            start_time: startMinutes,
            end_time: endMinutes,
            start_label: `${String(resizedEvent.startHour).padStart(2, "0")}:${String(resizedEvent.startMin).padStart(2, "0")}`,
            end_label: `${String(end.hour).padStart(2, "0")}:${String(end.min).padStart(2, "0")}`,
            originalStartHour: resizedEvent.originalStartHour,
            originalStartMin: resizedEvent.originalStartMin,
            originalEndHour: resizedEvent.originalEndHour,
            originalEndMin: resizedEvent.originalEndMin,
          })
          const previousPreview = livePreviewRef.current
          if (
            !previousPreview ||
            previousPreview.id !== resizingId ||
            previousPreview.start !== startMinutes ||
            previousPreview.end !== endMinutes
          ) {
            setLiveEventTime(resizingId, startMinutes, endMinutes)
            livePreviewRef.current = { id: resizingId, start: startMinutes, end: endMinutes }
          }
          setLocalEvents(prev => {
            const updatedEvents = prev.map(ev =>
              ev.id === resizingId
                ? { ...ev, height: newHeight, endHour: end.hour, endMin: end.min }
                : ev
            )
            localEventsRef.current = updatedEvents
            setEventPositions(calculateEventPositions(updatedEvents.filter(e => !e.isAllDay), resizingId))
            return updatedEvents
          })
        }
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
   }, [clearLiveEventTime, draggingId, resizingId, selectedEventId, setLiveEventTime])

  // Track the most recently added event to skip its layout animation
  const lastAddedEventId = useRef<string | null>(null)
  
  // Track temp event IDs that are pending database save
  const pendingEventIds = useRef<Set<string>>(new Set())
  
  // Track temp-to-real ID mappings for stable keys
  const idMapping = useRef<Map<string, string>>(new Map())

  const removeEventLocally = (eventId: string) => {
    pendingEventIds.current.delete(eventId)
    idMapping.current.delete(eventId)
    for (const [tempId, realId] of idMapping.current.entries()) {
      if (realId === eventId) idMapping.current.delete(tempId)
    }

    setLocalEvents(prev => {
      const next = prev.filter(e => e.id !== eventId)
      localEventsRef.current = next
      setEventPositions(calculateEventPositions(next.filter(e => !e.isAllDay), null))
      return next
    })
  }

  // Clean up any orphaned placeholders and duplicate event elements when events change
  useEffect(() => {
    if (draggingId || resizingId) return
    
    // Remove orphaned placeholders
    document.querySelectorAll('[id^="ph-"]').forEach(el => {
      el.remove()
    })
    
    // Remove any duplicate event elements (keep first occurrence)
    const seenIds = new Set<string>()
    document.querySelectorAll('.calendar-event').forEach(el => {
      const id = el.id
      if (seenIds.has(id)) {
        el.remove()
      } else {
        seenIds.add(id)
      }
    })
  }, [localEvents, draggingId, resizingId])

  // Apply layout widths whenever local events change
  // Skip during drag/resize - only update when drag ends
  useLayoutEffect(() => {
    // Handle drag/resize state - set full width for active event
    if (isDraggingRef.current || isResizingRef.current || draggingId || resizingId) {
      const activeId = draggingId || resizingId
      if (activeId) {
        const activeEl = document.getElementById(activeId) as HTMLDivElement | null
        if (activeEl) {
          activeEl.style.left = `${EVENT_SIDE_GAP}px`
          activeEl.style.width = EVENT_FULL_WIDTH_WITH_GAPS
          activeEl.style.zIndex = "9999"
        }
      }
      return
    }
    
    // Show container with fade-in (events already have correct positions from pre-calculation)
    setContainerVisible(true)
    
    // Apply animations for newly added events (user-created, not initial load)
    if (lastAddedEventId.current) {
      const newEl = document.getElementById(lastAddedEventId.current) as HTMLDivElement | null
      if (newEl) {
        newEl.style.transition = "opacity 150ms ease-out"
        newEl.style.opacity = "1"
        setTimeout(() => {
          newEl.style.transition = ""
        }, 150)
      }
      lastAddedEventId.current = null
    }
  }, [localEvents, draggingId, resizingId])

  // Recalculate positions when selection changes (expand selected, collapse on deselect)
  useEffect(() => {
    if (isDraggingRef.current || isResizingRef.current) return
    const positions = calculateEventPositions(localEventsRef.current.filter(e => !e.isAllDay), selectedEventId)
    setEventPositions(positions)
  }, [selectedEventId, localEvents])

  // Handle drag/resize end - update state with final positions
  const handleMouseUp = () => {
    const wasDragging = isDraggingRef.current
    const wasResizing = isResizingRef.current
    let dialogShown = false
    
    // Handle click (no drag/resize happened)
    if (mouseDownPosRef.current && !wasDragging && !wasResizing) {
      const event = localEventsRef.current.find(ev => ev.id === mouseDownPosRef.current?.eventId)
      if (event) {
        // Check if there's a temp event selected that needs to be deleted
        if (selectedEventId && selectedEventId !== event.id) {
          // Check if previous selected event is unsaved temp event
          const { eventsCache } = useEventsStore.getState()
          const prevEventInStore = Object.values(eventsCache).flat().find(e => e.id === selectedEventId)
          if (prevEventInStore && prevEventInStore.isTemp === true) {
            deleteEvent(selectedEventId)
          }
        }
        setSelectedEvent(event.id)

        // Recalculate positions so selected event expands to full width
        const positions = calculateEventPositions(localEventsRef.current.filter(e => !e.isAllDay), event.id)
        setEventPositions(positions)
      }
      mouseDownPosRef.current = null
      clearLiveEventTime()
      livePreviewRef.current = null
      return
    }
    
    mouseDownPosRef.current = null
    
    if (!draggingId && !resizingId) {
      clearLiveEventTime()
      livePreviewRef.current = null
      return
    }
    
    const wasDraggingId = draggingId
    const wasResizingId = resizingId
    if (wasDraggingId) clearLiveEventTime(wasDraggingId)
    if (wasResizingId) clearLiveEventTime(wasResizingId)
    livePreviewRef.current = null
    
    // Helper to restore original event position - updates both DOM and store
    const restoreOriginalPosition = () => {
      const original = originalEventRef.current
      if (!original) return
      
      const eventId = original.id
      
      // Skip sync when restoring
      skipSyncRef.current = true
      
      // Update store with original times
      const originalStartTime = original.startHour * 60 + original.startMin
      const originalEndTime = original.endHour * 60 + original.endMin
      useEventsStore.getState().updateEventField(eventId, 'start_time', originalStartTime)
      useEventsStore.getState().updateEventField(eventId, 'end_time', originalEndTime)
      
      // Update DOM immediately for instant visual restore
      const el = document.getElementById(eventId) as HTMLDivElement | null
      if (el) {
        el.style.top = `${original.slot + TOP_DEAD_ZONE + EVENT_TOP_GAP}px`
        el.style.height = `${Math.max(8, original.height - EVENT_TOP_GAP)}px`
        el.style.left = `${EVENT_SIDE_GAP}px`
        el.style.width = EVENT_FULL_WIDTH_WITH_GAPS
        el.style.boxShadow = "none"
        el.style.zIndex = "20"
        el.style.transition = ""
      }
      
      // Also recalculate positions for all events to ensure correct widths
      const positions = calculateEventPositions(localEventsRef.current.filter(e => !e.isAllDay), eventId)
      setEventPositions(positions)
      
      originalEventRef.current = null
      
      // Reset skip sync after a delay
      setTimeout(() => {
        skipSyncRef.current = false
      }, 100)
    }
    
    // Get final DOM values and sync to store
    if (wasDraggingId && isDraggingRef.current) {
      const el = document.getElementById(wasDraggingId) as HTMLDivElement | null
      if (el) {
        const finalTop = parseInt(el.style.top || '0') - TOP_DEAD_ZONE
        const snappedY = snap(finalTop)
        const start = yToTimeSnapped(snappedY)
        const draggedEvent = localEventsRef.current.find(e => e.id === wasDraggingId)
        
        if (draggedEvent && selectedDate) {
          const startMinutes = start.hour * 60 + start.min
          const duration = originalEventRef.current?.duration || 0
          const endMinutes = (startMinutes + duration) % 1440
          const endHour = Math.floor(endMinutes / 60)
          const endMin = endMinutes % 60
          const end = { hour: endHour, min: endMin }
          
          const dateStr = formatDate(selectedDate)
          
          const isRecurring = isSeriesActuallyRecurring(draggedEvent as any)
          
          if (isRecurring) {
            if (isSeriesAnchorEvent(draggedEvent as any)) {
              const updateAllInSeries = useEventsStore.getState().updateAllInSeries
              void updateAllInSeries(draggedEvent.seriesMasterId || draggedEvent.id, {
                start_time: startMinutes,
                end_time: endMinutes,
              })
              originalEventRef.current = null
              return
            }

            // Show recurring dialog - cleanup drag state immediately
            el.style.boxShadow = "none"
            isDraggingRef.current = false
            isResizingRef.current = false
            setDraggingId(null)
            setResizingId(null)
            unlockInteraction()
            dialogShown = true
            
            showRecurringDialog(
              draggedEvent as any,
              "edit",
              async (choice: string) => {
                // Cleanup after dialog closes
                el.style.boxShadow = "none"
                isDraggingRef.current = false
                isResizingRef.current = false
                setDraggingId(null)
                setResizingId(null)
                unlockInteraction()
                
                // Delay resetting recentlyInteracted to prevent stray clicks creating events
                const resetInteraction = () => {
                  setTimeout(() => {
                    recentlyInteractedRef.current = false
                  }, 100)
                }
                
                if (choice === "cancel") {
                  // Restore original position - DOM update is immediate
                  restoreOriginalPosition()
                  // Use flushSync for immediate deselect
                  ReactDOM.flushSync(() => {
                    setSelectedEvent(null)
                  })
                  resetInteraction()
                } else if (choice === "only-this") {
                  const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
                  await splitRecurringEvent(
                    draggedEvent as any,
                    dateStr,
                    startMinutes,
                    endMinutes
                  )
                  // Remove the dragged virtual event from local state since it's been replaced
                  if (draggedEvent.isRecurringInstance) {
                    setLocalEvents(prev => {
                      const next = prev.filter(e => e.id !== draggedEvent.id)
                      localEventsRef.current = next
                      return next
                    })
                  }
                  originalEventRef.current = null
                  setSelectedEvent(null)
                  resetInteraction()
                } else if (choice === "all-events") {
                  // Update all events in the series
                  const updateAllInSeries = useEventsStore.getState().updateAllInSeries
                  await updateAllInSeries(draggedEvent.seriesMasterId || draggedEvent.id, {
                    start_time: startMinutes,
                    end_time: endMinutes,
                  })
                  originalEventRef.current = null
                  resetInteraction()
                } else if (choice === "this-and-following") {
                  // Split into 2 recurring series
                  const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
                  await updateThisAndFollowing(
                    draggedEvent as any,
                    dateStr,
                    startMinutes,
                    endMinutes
                  )
                  originalEventRef.current = null
                  setSelectedEvent(null)
                  resetInteraction()
                }
                
                closeRecurringDialog()
              }
            )
            
            return
          } else {
            // Non-recurring: update directly
            updateEvent(wasDraggingId, {
              title: draggedEvent.title,
              date: dateStr,
              start_time: startMinutes,
              end_time: endMinutes,
            })
          }
        }

        // Cleanup styles
        el.style.boxShadow = "none"
      }
    }
    
    if (wasResizingId && isResizingRef.current) {
      const el = document.getElementById(wasResizingId) as HTMLDivElement | null
      if (el) {
        const finalHeight = parseInt(el.style.height || '100')
        const snappedHeight = Math.max(STEP_HEIGHT, snap(finalHeight))
        const resizedEvent = localEventsRef.current.find(e => e.id === wasResizingId)
        
        if (resizedEvent && selectedDate) {
          const end = yToTimeSnapped(resizedEvent.slot + snappedHeight)
          const dateStr = formatDate(selectedDate)
          const sourceEvent = getEventById(wasResizingId)
          const sourceStartTime = sourceEvent?.start_time ?? (resizedEvent.startHour * 60 + resizedEvent.startMin)
          const sourceDate = sourceEvent?.date ?? dateStr
          const sourceEndDate = sourceEvent?.end_date || sourceEvent?.date || dateStr
          const isResizingOvernightSegment =
            !!sourceEvent &&
            sourceDate !== dateStr &&
            sourceEndDate >= dateStr
          const commitStartTime = isResizingOvernightSegment
            ? sourceStartTime
            : (resizedEvent.startHour * 60 + resizedEvent.startMin)
          const commitDate = isResizingOvernightSegment ? sourceDate : dateStr
          const commitEndDate = isResizingOvernightSegment ? sourceEndDate : undefined
          
          const isRecurring = isSeriesActuallyRecurring(resizedEvent as any)
          
          if (isRecurring) {
            if (isSeriesAnchorEvent(resizedEvent as any)) {
              const updateAllInSeries = useEventsStore.getState().updateAllInSeries
              void updateAllInSeries(resizedEvent.seriesMasterId || resizedEvent.id, {
                end_time: end.hour * 60 + end.min,
              })
              originalEventRef.current = null
              return
            }

            // Show recurring dialog - cleanup resize state immediately
            el.style.boxShadow = "none"
            isDraggingRef.current = false
            isResizingRef.current = false
            setDraggingId(null)
            setResizingId(null)
            unlockInteraction()
            dialogShown = true
            
            showRecurringDialog(
              resizedEvent as any,
              "edit",
              async (choice: string) => {
                // Cleanup after dialog closes
                el.style.boxShadow = "none"
                isDraggingRef.current = false
                isResizingRef.current = false
                setDraggingId(null)
                setResizingId(null)
                unlockInteraction()
                
                // Delay resetting recentlyInteracted to prevent stray clicks creating events
                const resetInteraction = () => {
                  setTimeout(() => {
                    recentlyInteractedRef.current = false
                  }, 100)
                }
                
                if (choice === "cancel") {
                  // Restore original position - DOM update is immediate
                  restoreOriginalPosition()
                  // Use flushSync for immediate deselect
                  ReactDOM.flushSync(() => {
                    setSelectedEvent(null)
                  })
                  resetInteraction()
                } else if (choice === "only-this") {
                  const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
                  await splitRecurringEvent(
                    resizedEvent as any,
                    dateStr,
                    commitStartTime,
                    end.hour * 60 + end.min
                  )
                  // Remove the resized virtual event from local state since it's been replaced
                  if (resizedEvent.isRecurringInstance) {
                    setLocalEvents(prev => {
                      const next = prev.filter(e => e.id !== resizedEvent.id)
                      localEventsRef.current = next
                      return next
                    })
                  }
                  originalEventRef.current = null
                  setSelectedEvent(null)
                  resetInteraction()
                } else if (choice === "all-events") {
                  // Update all events in the series
                  const updateAllInSeries = useEventsStore.getState().updateAllInSeries
                  await updateAllInSeries(resizedEvent.seriesMasterId || resizedEvent.id, {
                    end_time: end.hour * 60 + end.min,
                  })
                  originalEventRef.current = null
                  resetInteraction()
                } else if (choice === "this-and-following" && selectedDate) {
                  // Split into 2 recurring series
                  const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
                  await updateThisAndFollowing(
                    resizedEvent as any,
                    dateStr,
                    resizedEvent.startHour * 60 + resizedEvent.startMin,
                    end.hour * 60 + end.min
                  )
                  originalEventRef.current = null
                  setSelectedEvent(null)
                  resetInteraction()
                } else {
                  // Fallback - reset interaction
                  resetInteraction()
                }
                
                closeRecurringDialog()
              }
            )
            
            return
          } else {
            // Non-recurring: update directly
            updateEvent(wasResizingId, {
              title: resizedEvent.title,
              date: commitDate,
              ...(commitEndDate ? { end_date: commitEndDate } : {}),
              start_time: commitStartTime,
              end_time: end.hour * 60 + end.min,
            })
          }
        }

        // Cleanup styles
        el.style.boxShadow = "none"
      }
    }

    // Skip final cleanup if dialog was shown - let the dialog callback handle it
    if (dialogShown) {
      setTimeout(() => {
        recentlyInteractedRef.current = false
      }, 100)
      return
    }

    isDraggingRef.current = false
    isResizingRef.current = false
    setDraggingId(null)
    setResizingId(null)
    unlockInteraction()
    originalEventRef.current = null

    // Recompute all overlap columns from state so no event keeps stale DOM geometry.
    setEventPositions(
      calculateEventPositions(
        localEventsRef.current.filter(e => !e.isAllDay),
        selectedEventId
      )
    )

    setTimeout(() => {
      recentlyInteractedRef.current = false
    }, 100)
  }

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [clearLiveEventTime, draggingId, resizingId, selectedDate, selectedEventId])

  // Filter out all-day events from time grid (they're shown in the sticky row)
  const timedEvents = localEvents.filter(event => !event.isAllDay)

  return (
    <>
      <div
        onClick={handleContainerClick}
        className="absolute inset-0 calendar-container"
        style={{ 
          zIndex: 10,
          opacity: containerVisible ? 1 : 0,
          transition: 'opacity 150ms ease-out'
        }}
      >
          {timedEvents.map(event => {
            // Get stable key - use temp ID if available in mapping, otherwise use real ID
            // This prevents React from remounting when temp ID is swapped to real ID
            let stableKey = event.id
            for (const [tempId, realId] of idMapping.current.entries()) {
              if (realId === event.id) {
                stableKey = tempId
                break
              }
            }

            return (
              <TimeEventCard
                key={stableKey}
                event={event}
                onMouseDown={e => handleMouseDown(e, event)}
                onResizeStart={handleResizeStart}
                isDragging={draggingId === event.id}
                isResizing={resizingId === event.id}
                isSelected={selectedEventId === event.id}
                position={eventPositions[event.id] || { left: "0", width: "100%", zIndex: 10 }}
              />
            )
          })}
      </div>
    </>
  )
}

export default TimeView
