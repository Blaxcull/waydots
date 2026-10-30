import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useEventsStore, formatDate, type NewEvent, type EventFieldValue } from '@/store/eventsStore'
import { Calendar } from '@/components/ui/calendar'
import calendarIcon from '@/assets/calendar2.png'
import clockIcon from '@/assets/clock.png'
import { useRecurringPropertyChange } from '@/hooks/useRecurringPropertyChange'

/* ================= TIME OPTIONS ================= */

const TIME_OPTIONS: { value: number; label: string }[] = []

for (let hour = 0; hour < 24; hour++) {
  for (let min = 0; min < 60; min += 15) {
    TIME_OPTIONS.push({
      value: hour * 60 + min,
      label: `${hour.toString().padStart(2, '0')}:${min
        .toString()
        .padStart(2, '0')}`,
    })
  }
}
TIME_OPTIONS.push({ value: 1440, label: '24:00' })

const formatTimeValue = (minutes: number) => {
  if (minutes === 1440) return '24:00'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m
    .toString()
    .padStart(2, '0')}`
}

const parseTypedTimeValue = (rawValue: string) => {
  const match = rawValue.match(/^(\d{1,2}):?(\d{0,2})$/)
  if (!match) return null

  let h = parseInt(match[1], 10)
  if (Number.isNaN(h)) return null
  if (h > 24) h = 24
  if (h < 0) h = 0

  const minutePart = match[2] || ""

  if (h === 24) {
    if (minutePart === "" || minutePart === "0" || minutePart === "00") return 1440
    return null
  }

  if (minutePart.length === 0) {
    return h * 60
  }

  if (minutePart.length === 1) {
    const digit = minutePart
    if (digit === "0") return h * 60
    if (digit === "1") return h * 60 + 15
    if (digit === "3") return h * 60 + 30
    if (digit === "4") return h * 60 + 45
    return null
  }

  if (minutePart.length === 2) {
    let m = parseInt(minutePart, 10)
    if (Number.isNaN(m)) return null
    if (m > 59) m = 59
    if (m < 0) m = 0
    return h * 60 + m
  }

  return null
}

const getClosestTimeOption = (minutes: number) => {
  return TIME_OPTIONS.reduce((prev, curr) =>
    Math.abs(curr.value - minutes) < Math.abs(prev.value - minutes)
      ? curr
      : prev
  ).value
}

const LAST_TIME_OPTION = 1440

const getSingleDayTimeFix = (startTime: number, endTime: number) => {
  if (endTime > startTime) return {}

  if (startTime >= LAST_TIME_OPTION) {
    return {
      start_time: LAST_TIME_OPTION - 15,
      end_time: LAST_TIME_OPTION,
    }
  }

  return {
    end_time: Math.min(startTime + 15, LAST_TIME_OPTION),
  }
}

/* ================= TIME PICKER ================= */

const TimePicker: React.FC<{
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
  minValue?: number
}> = ({ value, onChange, disabled, minValue }) => {

  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(formatTimeValue(value))
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [debouncedInput, setDebouncedInput] = useState(inputValue)

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isInputFocused = useRef(false)
  const externalValueRef = useRef(value)



  useEffect(() => {
  const t = setTimeout(() => {
    setDebouncedInput(inputValue)
  }, 60)

  return () => clearTimeout(t)
}, [inputValue])


  /* Sync external value; avoid clobbering while user is editing */
  useEffect(() => {
    externalValueRef.current = value
    if (!isInputFocused.current && !isOpen) {
      setInputValue(formatTimeValue(value))
    }
  }, [value, isOpen])

  /* Close on outside click */
  useEffect(() => {
  if (isOpen) {
    setHoveredValue(null)
  }
}, [isOpen])
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        isInputFocused.current = false
      }
    }

    if (isOpen) {
      document.addEventListener('mouseup', handleClickOutside)
    }

    return () =>
      document.removeEventListener('mouseup', handleClickOutside)
  }, [isOpen])

  /* 🔥 Smart closest match while typing */

  const roundedValue = useMemo(() => {
  return getClosestTimeOption(value)
}, [value])



const typedClosest = useMemo(() => parseTypedTimeValue(debouncedInput), [debouncedInput])



useEffect(() => {
  if (!isOpen) {
    setHoveredValue(null)
  }
}, [isOpen])

  /* Auto scroll to highlighted option */
useEffect(() => {
  if (!isOpen || !dropdownRef.current) return

  const container = dropdownRef.current

  const targetValue =
  typedClosest !== null &&
  TIME_OPTIONS.some(o => o.value === typedClosest)
    ? typedClosest
    : roundedValue

  const index = TIME_OPTIONS.findIndex(
    (opt) => opt.value === targetValue
  )

  if (index === -1) return

  requestAnimationFrame(() => {
    const option = container.children[index] as HTMLElement
    if (!option) return

    const containerHeight = container.clientHeight
    const optionHeight = option.clientHeight

    let scroll =
      option.offsetTop - containerHeight / 2 + optionHeight / 2

    const maxScroll = container.scrollHeight - containerHeight
    scroll = Math.max(0, Math.min(scroll, maxScroll))

    container.scrollTop = scroll
  })
}, [isOpen, typedClosest, roundedValue])

const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = e.target.value.replace(/[^0-9:]/g, '')
  setInputValue(val)
  if (!isOpen && !disabled) setIsOpen(true)
}

  const handleInputBlur = () => {
      isInputFocused.current = false
      const immediateTypedValue = parseTypedTimeValue(inputValue)
      let finalValue =
  immediateTypedValue !== null ? immediateTypedValue : externalValueRef.current

if (minValue !== undefined && finalValue < minValue) {
  finalValue = minValue
}

    onChange(finalValue)
    setInputValue(formatTimeValue(finalValue))
    setIsOpen(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      let finalValue =
        parseTypedTimeValue(inputValue) ?? externalValueRef.current

      if (minValue !== undefined && finalValue < minValue) {
        finalValue = minValue
      }

      onChange(finalValue)
      setInputValue(formatTimeValue(finalValue))
      setIsOpen(false)
      isInputFocused.current = false
      ;(e.target as HTMLInputElement).blur()
    }
  }

const handleSelect = (minutes: number) => {
  if (minValue !== undefined && minutes < minValue) return

  onChange(minutes)
  setInputValue(formatTimeValue(minutes))
  setIsOpen(false)
}
  return (
    <div ref={containerRef} className="relative shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        onFocus={() => {
          isInputFocused.current = true
          if (!disabled) setIsOpen(true)
        }}
        disabled={disabled}
        className={`bg-neutral-100 rounded-lg px-2 py-1 border-b-2 border-neutral-300 text-xl focus:outline-none focus:border-red-500 w-20 text-center ${
          disabled
            ? 'opacity-40 cursor-not-allowed text-neutral-800'
            : isOpen
            ? 'text-red-500'
            : 'text-neutral-800'
        }`}
      />

      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute left-1/2 -translate-x-1/2 mt-1 bg-[#f6f6f6] shadow rounded-lg shadow-xl p-1 max-h-[220px] overflow-y-auto w-28 z-50 no-scrollbar"
        >

{TIME_OPTIONS.map((option) => {
  const isDisabled =
    minValue !== undefined && option.value < minValue

  const isHovered = hoveredValue === option.value

  const isTypingMatch =
  hoveredValue === null &&
  typedClosest !== null &&
  TIME_OPTIONS.some(o => o.value === typedClosest) &&
  option.value === typedClosest

  return (
    <button
      key={option.value}
      type="button"
      disabled={isDisabled}
      onMouseDown={(e) => {
        e.preventDefault()
        handleSelect(option.value)
      }}
      onMouseEnter={() => !isDisabled && setHoveredValue(option.value)}
      className={`w-full text-center py-2 px-2 rounded text-lg transition-colors duration-100
        ${
          isDisabled
            ? "text-neutral-400 cursor-not-allowed"
            : isHovered || isTypingMatch
            ? "bg-red-400 text-white"
            : "text-neutral-800"
        }`}
    >
      {option.label}
    </button>
  )
})}
        </div>
      )}
    </div>
  )
}

/* ================= DATE PICKER ================= */

const DatePickerButton: React.FC<{
  value: string
  onChange: (date: Date) => void
  alignRight?: boolean
}> = ({ value, onChange, alignRight = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const propSelectedDate = useMemo(() => {
    return value ? new Date(value + 'T00:00:00') : undefined
  }, [value])

  const [optimisticDate, setOptimisticDate] = useState<Date | undefined>(() => propSelectedDate)
  const selectedDate = optimisticDate ?? propSelectedDate
  const [month, setMonth] = useState<Date | undefined>(() => selectedDate)

  useEffect(() => {
    if (isOpen) return
    setOptimisticDate(propSelectedDate)
  }, [isOpen, propSelectedDate])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () =>
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      )
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!isOpen && selectedDate) {
            setMonth(selectedDate)
          }
          setIsOpen(!isOpen)
        }}
        className="bg-neutral-100 hover:bg-neutral-200 rounded px-2 py-1.5 text-neutral-800 text-lg whitespace-nowrap focus:outline-none ring-2 ring-neutral-400 focus:ring-red-500"
      >
        {selectedDate
          ? selectedDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Select date'}
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-1 bg-[#f6f6f6] shadow  rounded-lg  p-2 ${
            alignRight
              ? 'right-0'
              : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => {
              if (date) {
                setOptimisticDate(date)
                onChange(date)
                setIsOpen(false)
              }
            }}
            className="bg-[#f6f6f6] text-black rounded-md"
          />

        </div>
      )}
    </div>
  )
}

/* ================= MAIN EDITOR ================= */

const DateTimeEditor: React.FC = () => {
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const liveEventTimes = useEventsStore((state) => state.liveEventTimes)
  useEventsStore((state) => state.eventsCache)
  useEventsStore((state) => state.computedEventsCache)
  const handleRecurringPropertyChange = useRecurringPropertyChange()
  
  // Get selected event - uses getEventById which handles both real and virtual events
  const getEventById = useEventsStore((state) => state.getEventById)
  const selectedEvent = selectedEventId ? getEventById(selectedEventId) : null

  const handlePropertyChange = useCallback((field: keyof NewEvent, value: EventFieldValue, extraFields?: Partial<Record<keyof NewEvent, EventFieldValue>>) => {
    const currentEventId = useEventsStore.getState().selectedEventId
    if (!currentEventId) return

    const freshEvent = useEventsStore.getState().getEventById(currentEventId)
    if (!freshEvent) return

    handleRecurringPropertyChange(freshEvent, field, value, extraFields)
  }, [handleRecurringPropertyChange])

  const [draftDate, setDraftDate] = useState("")
  const [draftEndDate, setDraftEndDate] = useState("")
  const [draftStartTime, setDraftStartTime] = useState(0)
  const [draftEndTime, setDraftEndTime] = useState(0)
  const livePreview = selectedEvent ? liveEventTimes[selectedEvent.id] : undefined

  useEffect(() => {
    if (!selectedEvent) return
    setDraftDate(livePreview?.date || selectedEvent.date)
    setDraftEndDate(livePreview?.end_date || selectedEvent.end_date || selectedEvent.date)
    setDraftStartTime(livePreview?.start_time ?? selectedEvent.start_time)
    setDraftEndTime(livePreview?.end_time ?? selectedEvent.end_time)
  }, [
    livePreview?.date,
    livePreview?.end_date,
    livePreview?.start_time,
    livePreview?.end_time,
    selectedEvent?.id,
    selectedEvent?.date,
    selectedEvent?.end_date,
    selectedEvent?.start_time,
    selectedEvent?.end_time,
  ])

  if (!selectedEvent) return null

  const displayDate = livePreview?.date ?? draftDate
  const displayEndDate = livePreview?.end_date ?? draftEndDate
  const displayStartTime = livePreview?.start_time ?? draftStartTime
  const displayEndTime = livePreview?.end_time ?? draftEndTime

  const isMultiDay = displayEndDate > displayDate
  const disableTime = !!selectedEvent.is_all_day

  return (
    <>
      <div className="shadow-lg border border-neutral-100 w-full bg-[#ececec] rounded-[52px] pl-5 pr-6 py-6 border-20 space-y-3 shadow-none">
        <div className="flex items-center gap-3">
          <img src={calendarIcon} alt="Calendar" className="w-7 h-7 opacity-30" />
          <span className="text-neutral-800 text-2xl w-16 pl-2 pr-55 shrink-0">
            Date
          </span>
          <DatePickerButton
            key={`date-${selectedEvent.id}-${displayDate}`}
            value={displayDate}
            onChange={(date) => {
              const newDate = formatDate(date)
              setDraftDate(newDate)
              setDraftEndDate(newDate)
              handlePropertyChange('date', newDate, {
                end_date: newDate,
                ...getSingleDayTimeFix(displayStartTime, displayEndTime),
              })
            }}
          />
          <span className="text-neutral-600">-</span>
          <DatePickerButton
            key={`enddate-${selectedEvent.id}-${displayEndDate}`}
            value={displayEndDate}
            onChange={(date) => {
              const newDate = formatDate(date)
              if (newDate < displayDate) {
                setDraftDate(newDate)
                setDraftEndDate(newDate)
                handlePropertyChange('date', newDate, {
                  end_date: newDate,
                  ...getSingleDayTimeFix(displayStartTime, displayEndTime),
                })
                return
              }

              setDraftEndDate(newDate)
              const extraFields =
                newDate === displayDate
                  ? getSingleDayTimeFix(displayStartTime, displayEndTime)
                  : undefined

              handlePropertyChange('end_date', newDate, extraFields)
            }}
            alignRight
          />
        </div>

        <hr className="border-neutral-200 border-t-[3px]" />
        <div className="flex items-center gap-3">
          <img src={clockIcon} alt="Clock" className="w-7 h-7 opacity-30" />
          <span className="text-neutral-800 text-2xl w-16 pl-2 pr-61 shrink-0">
            Time
          </span>
          <div className="ml-3 flex items-center gap-3">
            <TimePicker
              key={`start-${selectedEvent.id}-${displayStartTime}`}
              value={displayStartTime}
              onChange={(mins) => {
                const duration = displayEndTime - displayStartTime
                const newEndTime = Math.min(mins + duration, 1440)
                setDraftStartTime(mins)
                setDraftEndTime(newEndTime)
                handlePropertyChange('start_time', mins, { end_time: newEndTime })
              }}
              disabled={disableTime}
            />
            <span className="text-neutral-600">-</span>
            <TimePicker
              key={`end-${selectedEvent.id}-${displayEndTime}`}
              value={displayEndTime}
              onChange={(mins) => {
                setDraftEndTime(mins)
                handlePropertyChange('end_time', mins)
              }}
              disabled={disableTime}
              minValue={isMultiDay ? undefined : displayStartTime}
            />
          </div>
        </div>
      </div>

    </>
  )
}

export default DateTimeEditor
