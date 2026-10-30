import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useEventsStore, type NewEvent, type EventFieldValue, type CalendarEvent } from '@/store/eventsStore'
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from '@/store/recurringUtils'
import { Input } from '@/components/ui/input'

interface URLChip {
  url: string
  id: string
}

interface EventIdentitySnapshot {
  id: string
  date?: string
  end_date?: string
  start_time?: number
  end_time?: number
}

const matchesEventIdentity = (
  previousEvent: EventIdentitySnapshot | null,
  nextEvent: CalendarEvent | null
) => (
  !!previousEvent &&
  !!nextEvent &&
  previousEvent.date === nextEvent.date &&
  (previousEvent.end_date || previousEvent.date) === (nextEvent.end_date || nextEvent.date) &&
  previousEvent.start_time === nextEvent.start_time &&
  previousEvent.end_time === nextEvent.end_time
)

const EventEditor: React.FC = () => {
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const updateEventField = useEventsStore((state) => state.updateEventField)
  const updateEventFields = useEventsStore((state) => state.updateEventFields)
  const saveTrigger = useEventsStore((state) => state.saveTrigger)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  const setHasEditsEventId = useEventsStore((state) => state.setHasEditsEventId)
  useEventsStore((state) => state.eventsCache)
  useEventsStore((state) => state.computedEventsCache)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlChips, setUrlChips] = useState<URLChip[]>([])
  const [, setHasEdits] = useState(false)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const prevSelectedEventIdRef = useRef<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const urlSectionRef = useRef<HTMLDivElement>(null)
  const savedEventIdRef = useRef<string | null>(null)
  const lastProcessedSaveTriggerRef = useRef<number>(0)
  const previousEventSnapshotRef = useRef<EventIdentitySnapshot | null>(null)

  const getEventById = useEventsStore((state) => state.getEventById)
  
  // Get the selected event from reactive cache slices above
  const selectedEvent = selectedEventId ? getEventById(selectedEventId) : null

  // Load event data when selected event changes
  const prevEventIdRef = useRef<string | null>(null)
  useEffect(() => {
    const currentId = selectedEvent?.id ?? null
    const prevId = prevEventIdRef.current
    
    // Only run if the ID actually changed
    if (currentId !== prevId) {
      if (selectedEvent) {
        const shouldPreserveLocalEdits =
          (
            (!!prevId && savedEventIdRef.current === prevId) ||
            (!!savedEventIdRef.current && !prevId)
          ) &&
          matchesEventIdentity(previousEventSnapshotRef.current, selectedEvent)

        if (shouldPreserveLocalEdits) {
          savedEventIdRef.current = currentId
          setHasEditsEventId(currentId)
        } else {
        setTitle(selectedEvent.title === 'New Event' ? '' : selectedEvent.title)
        setNotes(selectedEvent.notes || '')
        const urls = selectedEvent.urls || []
        setUrlChips(urls.map((url: string, index: number) => ({ url, id: `${index}-${url}` })))
        setHasEdits(false)
        setHasEditsEventId(null)
        }

        previousEventSnapshotRef.current = {
          id: selectedEvent.id,
          date: selectedEvent.date,
          end_date: selectedEvent.end_date,
          start_time: selectedEvent.start_time,
          end_time: selectedEvent.end_time,
        }
      } else {
        if (!savedEventIdRef.current) {
          previousEventSnapshotRef.current = null
        }
      }
      prevEventIdRef.current = currentId ?? null
    }
  }, [selectedEvent?.id])

  // Handle property change with recurring dialog
  const handlePropertyChange = useCallback((field: keyof NewEvent, value: EventFieldValue, extraFields?: Partial<Record<keyof NewEvent, EventFieldValue>>) => {
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    
    if (!currentEvent || !currentSelectedEventId) {
      return
    }
    
    const eventIsRecurring = isSeriesActuallyRecurring(currentEvent)

    if (eventIsRecurring) {
      // Capture values at this moment
      const eventId = currentEvent.id
      const eventDate = (currentEvent as any).date
      const currentField = field
      const currentValue = value
      const currentExtraFields = extraFields

      showRecurringDialog(
        currentEvent as CalendarEvent,
        "edit",
        async (choice: string) => {
          if (choice === "only-this") {
            // Use splitRecurringEvent to split the series
            const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
            
            // Build updates object with current field and any extra fields
            const updates: Record<string, EventFieldValue> = {}
            if (currentField && currentValue !== undefined) {
              updates[currentField] = currentValue
            }
            if (currentExtraFields) {
              Object.entries(currentExtraFields).forEach(([key, val]) => {
                if (val !== undefined) {
                  updates[key] = val
                }
              })
            }
            
            await splitRecurringEvent(
              currentEvent as any,
              eventDate,
              (currentEvent as any).start_time,
              (currentEvent as any).end_time,
              updates as any
            )
          } else if (choice === "all-events") {
            const updateAllInSeries = useEventsStore.getState().updateAllInSeries
            const seriesMasterId = (currentEvent as any).seriesMasterId || eventId
            
            // Build updates object with all fields
            const allUpdates: Record<string, EventFieldValue> = {}
            if (currentField && currentValue !== undefined) {
              allUpdates[currentField] = currentValue
            }
            if (currentExtraFields) {
              Object.entries(currentExtraFields).forEach(([key, val]) => {
                if (val !== undefined) {
                  allUpdates[key] = val
                }
              })
            }
            
            await updateAllInSeries(seriesMasterId, allUpdates as Partial<NewEvent>)
          } else if (choice === "this-and-following") {
            const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
            await updateThisAndFollowing(
              currentEvent as any,
              eventDate,
              (currentEvent as any).start_time,
              (currentEvent as any).end_time,
              {
                title: (currentValue as string) || 'New Event',
                notes: (currentExtraFields as any)?.notes || [],
                urls: (currentExtraFields as any)?.urls || []
              }
            )
          }
          closeRecurringDialog()
        }
      )
    } else {
      updateEventField(currentSelectedEventId, field, value)
      if (extraFields) {
        Object.entries(extraFields).forEach(([key, val]) => {
          if (val !== undefined) {
            updateEventField(currentSelectedEventId, key as keyof NewEvent, val)
          }
        })
      }
    }
  }, [updateEventField, showRecurringDialog, closeRecurringDialog])

  // Save local state to cache when saveTrigger changes
  const titleRef = useRef(title)
  const notesRef = useRef(notes)
  const urlChipsRef = useRef(urlChips)
  
  // Update refs when local state changes
  useEffect(() => {
    titleRef.current = title
  }, [title])
  
  useEffect(() => {
    notesRef.current = notes
  }, [notes])
  
  useEffect(() => {
    urlChipsRef.current = urlChips
  }, [urlChips])
  
  useEffect(() => {
    if (saveTrigger === 0) {
      return
    }
    
    // Only process each saveTrigger value once
    if (saveTrigger === lastProcessedSaveTriggerRef.current) {
      return
    }
    
    const currentEventId = selectedEventId
    if (!currentEventId) {
      return
    }
    
    // Only process if edits were made (savedEventIdRef is set when user types)
    if (!savedEventIdRef.current) {
      return
    }
    
    // Only process if the event being saved is the one that was selected when save was triggered
    if (currentEventId !== savedEventIdRef.current) {
      return
    }
    
    lastProcessedSaveTriggerRef.current = saveTrigger
    
    // Check if this is a virtual event ID (format: "masterEventId-YYYY-MM-DD")
    const datePattern = /-(\d{4}-\d{2}-\d{2})$/
    const isVirtualEventId = datePattern.test(currentEventId)
    
    // Get caches
    const { computedEventsCache, eventsCache } = useEventsStore.getState()
    let currentEvent: any = null
    
    if (isVirtualEventId) {
      // First check computedEventsCache for virtual events
      if (computedEventsCache) {
        for (const events of Object.values(computedEventsCache)) {
          const found = events.find((e: any) => e.id === currentEventId)
          if (found) {
            currentEvent = found
            break
          }
        }
      }
      
      // Not in cache - try to generate it on-demand
      if (!currentEvent) {
        const match = currentEventId.match(datePattern)
        if (match) {
          const virtualDate = match[1]
          const masterEventId = currentEventId.replace(datePattern, '')
          
          // Find master event in eventsCache
          for (const events of Object.values(eventsCache)) {
            const found = events.find((e: any) => e.id === masterEventId)
            if (found) {
              const hasSeriesBounds =
                !!found.repeat &&
                found.repeat !== 'None' &&
                !!found.series_start_date &&
                !!found.series_end_date
              if (!hasSeriesBounds) break
              const seriesStartDate = found.series_start_date as string
              const seriesEndDate = found.series_end_date as string
              if (virtualDate < seriesStartDate || virtualDate > seriesEndDate) break
              if (virtualDate === found.date) break

              currentEvent = {
                ...found,
                id: currentEventId,
                date: virtualDate,
                end_date: virtualDate,
                isRecurringInstance: true,
                seriesMasterId: masterEventId,
                occurrenceDate: virtualDate,
              }
              break
            }
          }
        }
      }
    } else {
      // Real event
      currentEvent = getEventById(currentEventId)
    }
    
    if (!currentEvent) {
      return
    }
    
    const eventIsRecurring = isSeriesActuallyRecurring(currentEvent)
    
    const capturedTitle = titleRef.current || 'New Event'
    const capturedNotes = notesRef.current
    const capturedUrls = urlChipsRef.current.map(c => c.url)
    
    if (eventIsRecurring) {
      if (isSeriesAnchorEvent(currentEvent as any)) {
        const updateAllInSeries = useEventsStore.getState().updateAllInSeries
        const seriesMasterId = (currentEvent as any).seriesMasterId || currentEventId
        void updateAllInSeries(seriesMasterId, {
          title: capturedTitle,
          notes: capturedNotes,
          urls: capturedUrls
        })
        setHasEdits(false)
        setHasEditsEventId(null)
        savedEventIdRef.current = null
        return
      }

      showRecurringDialog(
        currentEvent as CalendarEvent,
        "edit",
        async (choice: string) => {
          if (choice === "only-this") {
            const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
            await splitRecurringEvent(
              currentEvent as any,
              (currentEvent as any).date,
              (currentEvent as any).start_time,
              (currentEvent as any).end_time,
              {
                title: capturedTitle,
                notes: capturedNotes,
                urls: capturedUrls
              }
            )
          } else if (choice === "all-events") {
            const updateAllInSeries = useEventsStore.getState().updateAllInSeries
            const seriesMasterId = (currentEvent as any).seriesMasterId || currentEventId
            
            await updateAllInSeries(seriesMasterId, {
              title: capturedTitle,
              notes: capturedNotes,
              urls: capturedUrls
            })
          } else if (choice === "this-and-following") {
            const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
            await updateThisAndFollowing(
              currentEvent as any,
              (currentEvent as any).date,
              (currentEvent as any).start_time,
              (currentEvent as any).end_time,
              {
                title: capturedTitle,
                notes: capturedNotes,
                urls: capturedUrls
              }
            )
          }
          setHasEdits(false)
          setHasEditsEventId(null)
          savedEventIdRef.current = null
          closeRecurringDialog()
        }
      )
    } else {
      updateEventField(currentEventId, 'title', titleRef.current || 'New Event')
      updateEventField(currentEventId, 'notes', notesRef.current)
      updateEventField(currentEventId, 'urls', urlChipsRef.current.map(c => c.url))
      
      // If repeat is set but series dates are missing, add them now
      const repeat = (currentEvent as any).repeat
      if (repeat && repeat !== 'None' && !(currentEvent as any).series_start_date) {
        const eventDate = (currentEvent as any).date
        const addYearsFn = (dateStr: string, years: number): string => {
          const date = new Date(dateStr + 'T00:00:00')
          date.setFullYear(date.getFullYear() + years)
          return date.toISOString().split('T')[0]
        }
        const seriesEndDate = addYearsFn(eventDate, 10)
        updateEventField(currentEventId, 'series_start_date', eventDate)
        updateEventField(currentEventId, 'series_end_date', seriesEndDate)
      }
    }
  }, [saveTrigger, selectedEventId, getEventById, updateEventField, showRecurringDialog, closeRecurringDialog])

  // Clear title on blur without Enter
  useEffect(() => {
    const prevId = prevSelectedEventIdRef.current
    const currentId = selectedEventId

    if (prevId && !currentId && !savedEventIdRef.current) {
      setTitle('')
      setNotes('')
      setUrlChips([])
      setHasEdits(false)
      setHasEditsEventId(null)
    }

    prevSelectedEventIdRef.current = currentId
  }, [selectedEventId])

  const handleContainerBlur = (e: React.FocusEvent) => {
    if (!editorRef.current?.contains(e.relatedTarget as Node)) {
      // Save any URL input that hasn't been added as chip yet
      if (selectedEventId && urlInput.trim()) {
        addUrlChip(urlInput.trim())
      }
      setUrlInput('')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    titleRef.current = newTitle
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    if (currentSelectedEventId) {
      savedEventIdRef.current = currentSelectedEventId
      setHasEdits(true)
      setHasEditsEventId(currentSelectedEventId)

      const currentEvent = useEventsStore.getState().getEventById(currentSelectedEventId)
      if (currentEvent && !isSeriesActuallyRecurring(currentEvent)) {
        updateEventField(currentSelectedEventId, 'title', newTitle.trim() || 'New Event')
      }
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    if (e.key === 'Enter' && currentSelectedEventId) {
      e.preventDefault()
      e.stopPropagation()
      const nextTitle = e.currentTarget.value.trim() || 'New Event'
      setTitle(nextTitle === 'New Event' ? '' : nextTitle)
      titleRef.current = nextTitle
      savedEventIdRef.current = currentSelectedEventId
      setHasEdits(false)
      setHasEditsEventId(null)
      // Enter on title should only update title and keep current selection.
      if (currentEvent && !isSeriesActuallyRecurring(currentEvent)) {
        updateEventFields(currentSelectedEventId, {
          title: nextTitle,
          notes: notesRef.current,
          urls: urlChipsRef.current.map(c => c.url),
        })
        return
      }
      handlePropertyChange('title', nextTitle)
    }
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNotes = e.target.value
    setNotes(newNotes)
    notesRef.current = newNotes
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    if (currentSelectedEventId) {
      savedEventIdRef.current = currentSelectedEventId
      setHasEdits(true)
      setHasEditsEventId(currentSelectedEventId)
    }
  }

  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    if (e.key === 'Enter' && currentSelectedEventId && currentEvent) {
      e.preventDefault()
      e.stopPropagation()
      handlePropertyChange('title', title || 'New Event', {
        notes: notes,
        urls: urlChips.map(c => c.url)
      })
    }
  }

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    if (value.endsWith(' ')) {
      const trimmedUrl = value.trim()
      if (trimmedUrl) {
        addUrlChip(trimmedUrl)
      }
      setUrlInput('')
    } else {
      setUrlInput(value)
    }
  }

  const handleUrlInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && urlInput === '' && urlChips.length > 0) {
      const newChips = urlChips.slice(0, -1)
      setUrlChips(newChips)
    }

    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    if (e.key === 'Enter' && currentSelectedEventId && currentEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (urlInput.trim()) {
        addUrlChip(urlInput.trim())
        setUrlInput('')
      }
      handlePropertyChange('title', title || 'New Event', {
        notes: notes,
        urls: urlChips.map(c => c.url)
      })
    }
  }

  const addUrlChip = (url: string) => {
    const newChip: URLChip = {
      url,
      id: `${Date.now()}-${url}`,
    }
    const newChips = [...urlChips, newChip]
    setUrlChips(newChips)
    urlChipsRef.current = newChips
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    if (currentSelectedEventId && currentEvent) {
      savedEventIdRef.current = currentSelectedEventId
      setHasEdits(true)
      setHasEditsEventId(currentSelectedEventId)
      handlePropertyChange('urls', newChips.map(c => c.url))
    }
  }

  const removeUrlChip = (chipId: string) => {
    const newChips = urlChips.filter(chip => chip.id !== chipId)
    setUrlChips(newChips)
    urlChipsRef.current = newChips
    const currentSelectedEventId = useEventsStore.getState().selectedEventId
    const currentEvent = currentSelectedEventId ? useEventsStore.getState().getEventById(currentSelectedEventId) : null
    if (currentSelectedEventId && currentEvent) {
      savedEventIdRef.current = currentSelectedEventId
      setHasEdits(true)
      setHasEditsEventId(currentSelectedEventId)
      handlePropertyChange('urls', newChips.map(c => c.url))
    }
  }

  if (!selectedEvent) {
    return (
      <div className="px-4 py-4 text-slate-400">
        <p className="text-sm">Click an event to edit</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">

        {/* Card */}
        <div 
          ref={editorRef}
          onBlur={handleContainerBlur}
          className="
shadow-lg border border-neutral-100

      w-full bg-[#ececec] rounded-[52px] p-5 border-20  space-y-3 shadow-none">


          {/* Title */}
          <Input
            type="text"
            placeholder="Title"
            value={title || ''}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}

            className="text-5xl font-bold  bg-transparent border-none
                       focus-visible:ring-0 focus-visible:ring-offset-0
                       px-0 h-14 placeholder:text-neutral-600 text-neutral-600"
          />

          {/* Notes */}
          <Input
            type="text"
            placeholder="Notes"
            value={notes}
            onChange={handleNotesChange}
            onKeyDown={handleNotesKeyDown}
            className="text-xl bg-transparent font-bold border-none
                       focus-visible:ring-0 focus-visible:ring-offset-0
                       px-0 h-6 placeholder:text-neutral-500 text-neutral-500"
          />

          {/* Divider */}
          <hr className="border-neutral-00  border-t-[3px]" />

          {/* URL Chips */}
          <div
            ref={urlSectionRef}
            className="flex flex-wrap items-center gap-2 min-h-[36px] cursor-text"
            onClick={() => urlInputRef.current?.focus()}
          >
{urlChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 px-2 
               bg-neutral-100  
               border-neutral-300 border-2 border-solid
               text-neutral-400 text-xl
               font-semibold
                          rounded-full"
              >
                <span className="truncate max-w-[150px]">
                  {chip.url}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeUrlChip(chip.id)
                  }}
                  className="text-neutral-400 hover:text-neutral-500"
                >
                  ×
                </button>
              </span>
            ))}

            <input
              type="text"
              placeholder={urlChips.length === 0 ? "URL" : ""}
              value={urlInput}
              onChange={handleUrlInputChange}
              onKeyDown={handleUrlInputKeyDown}
              className="flex-1 min-w-[80px] bg-transparent
                          text-xl text-neutral-500
                          placeholder:text-neutral-400
             
                   font-semibold
                          focus:outline-none"
            />
          </div>
        </div>
      </div>

    </>
  )
}

export default EventEditor
