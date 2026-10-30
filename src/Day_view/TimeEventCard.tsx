import React, { memo, useEffect, useRef, useState } from 'react'
import { getGoalIcon } from '@/Goal_view/goal'
import { TOP_DEAD_ZONE, getEventVisualColors } from '@/lib/eventUtils'
import type { EventType } from '@/lib/eventUtils'
import { useEventsStore } from '@/store/eventsStore'
import { EVENT_TOP_GAP, insetEventLeft, insetEventWidth } from './timeViewLayout'

export const TimeEventCard = memo(
  ({
    event,
    onMouseDown,
    onResizeStart,
    isDragging = false,
    isResizing = false,
    isSelected = false,
    position = { left: '0', width: '100%', zIndex: 10 },
  }: {
    event: EventType
    onMouseDown: (e: React.MouseEvent) => void
    onResizeStart: (e: React.MouseEvent, event: EventType) => void
    isDragging?: boolean
    isResizing?: boolean
    isSelected?: boolean
    position?: { left: string; width: string; zIndex: number }
  }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerWidth, setContainerWidth] = useState(0)

    // Subscribe to live updates from store for drag/resize feedback
    const liveTime = useEventsStore((state) => state.liveEventTimes[event.id])

    useEffect(() => {
      if (!containerRef.current) return
      const checkWidth = () => {
        if (containerRef.current) {
          setContainerWidth(containerRef.current.offsetWidth)
        }
      }
      checkWidth()
      const observer = new ResizeObserver(checkWidth)
      observer.observe(containerRef.current)
      return () => observer.disconnect()
    }, [])

    const { backgroundColor, mutedBackgroundColor, textColor, accentColor } = getEventVisualColors(event.color)
    const goalIconEntry = event.goalIcon ? getGoalIcon(event.goalIcon) : null
    const GoalIcon = goalIconEntry?.icon

    // Use live times if they exist, otherwise fallback to event props
    const labelStartHour = liveTime ? Math.floor(liveTime.start_time / 60) % 24 : (event.originalStartHour ?? event.startHour)
    const labelStartMin = liveTime ? liveTime.start_time % 60 : (event.originalStartMin ?? event.startMin)
    const labelEndHour = liveTime ? Math.floor(liveTime.end_time / 60) % 24 : (event.originalEndHour ?? event.endHour)
    const labelEndMin = liveTime ? liveTime.end_time % 60 : (event.originalEndMin ?? event.endMin)

    const compactTimeLabel = `${labelStartHour.toString().padStart(2, '0')}:${labelStartMin.toString().padStart(2, '0')}`
    const rangeTimeLabel = `${compactTimeLabel} - ${labelEndHour.toString().padStart(2, '0')}:${labelEndMin.toString().padStart(2, '0')}`
    const labelStartTotalMins = (labelStartHour * 60) + labelStartMin
    const labelEndTotalMins = (labelEndHour * 60) + labelEndMin
    const eventDuration = ((labelEndTotalMins - labelStartTotalMins) + 1440) % 1440 || 1440
    const isVeryShortEvent = eventDuration <= 15
    const isNarrowEvent = containerWidth > 0 && containerWidth < 180
    const isVeryNarrowEvent = containerWidth > 0 && containerWidth < 140
    const useInlineCompactLayout = isVeryShortEvent || isVeryNarrowEvent
    const useSuperCompactLayout = !useInlineCompactLayout && (eventDuration <= 20 || isNarrowEvent)
    const useCompactLayout = !useInlineCompactLayout && !useSuperCompactLayout && (eventDuration <= 30 || (containerWidth > 0 && containerWidth < 240))
    const showEndTime = containerWidth > 180
    const showGoalIcon = !!GoalIcon && containerWidth >= 170
    const showClockIcon = containerWidth >= 120
    const isRecurring = !!((event.repeat && event.repeat !== 'None') || event.isRecurringInstance)

    const isActive = isDragging || isResizing || isSelected
    const zIndex = isActive ? 'z-[9999]' : 'z-10'
    const shadow = isActive ? 'shadow-2xl' : ''

    const eventStyle: React.CSSProperties = {
      top: event.slot + TOP_DEAD_ZONE + EVENT_TOP_GAP,
      height: Math.max(8, event.height - EVENT_TOP_GAP),
      left: insetEventLeft(position.left),
      width: insetEventWidth(position.width),
      zIndex: isDragging ? 10000 : isResizing ? 9999 : isSelected ? 1000 : position.zIndex,
      backgroundColor: isActive ? backgroundColor : mutedBackgroundColor,
      backgroundClip: 'border-box',
      transition: isDragging || isResizing ? undefined : 'left 200ms ease, width 200ms ease',
    }

    const leftStripColor = isSelected ? '#ffffff' : accentColor

    return (
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        className={`absolute ${zIndex} ${shadow}
  rounded-md calendar-event
  cursor-grab active:cursor-grabbing select-none
  ${isDragging || isResizing ? 'border-0' : 'border-r-2 border-b-0 border-t-4 border-transparent'}
  ${isSelected ? 'ring-2 ring-white' : ''}
  bg-clip-padding`}
        id={event.id}
        style={eventStyle}
      >
        <div
          className={`absolute left-[3px] w-[7px] rounded ${isVeryShortEvent ? 'top-[0px] bottom-[5px]' : 'top-[0px] bottom-[5px]'}`}
          style={{ backgroundColor: leftStripColor }}
        />

        <div className="z-10 h-full pl-[18px] pr-3 pt-0" style={{ color: textColor }}>
          {isVeryShortEvent ? (
            <div className="absolute inset-y-0 left-[18px] right-2 flex min-w-0 items-center gap-2 -translate-y-[3px] text-base">
              <span className="min-w-0 truncate font-semibold leading-none">{event.title}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1 leading-none">
                {isRecurring && (
                  <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 13.0399V11C2 7.68629 4.68629 5 8 5H21V5" />
                    <path d="M19 2L22 5L19 8" />
                    <path d="M22 9.98004V12.02C22 15.3337 19.3137 18.02 16 18.02H3V18.02" />
                    <path d="M5 21L2 18L5 15" />
                  </svg>
                )}
                {showClockIcon ? (
                  <svg className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : null}
                <span className="text-xs font-medium opacity-80">{compactTimeLabel}</span>
              </div>
            </div>
          ) : useInlineCompactLayout ? (
            <div className="absolute inset-y-0 left-[18px] right-2 flex min-w-0 items-center gap-2 -translate-y-[2px]">
              <span className="min-w-0 truncate text-sm font-semibold leading-none">{event.title}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1 leading-none">
                {isRecurring && (
                  <svg className="h-3 w-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 13.0399V11C2 7.68629 4.68629 5 8 5H21V5" />
                    <path d="M19 2L22 5L19 8" />
                    <path d="M22 9.98004V12.02C22 15.3337 19.3137 18.02 16 18.02H3V18.02" />
                    <path d="M5 21L2 18L5 15" />
                  </svg>
                )}
                <span className="text-[11px] font-medium opacity-80">{compactTimeLabel}</span>
              </div>
            </div>
          ) : useSuperCompactLayout ? (
            <div className="text-base truncate flex h-5 items-center justify-between pr-2">
              <span className="truncate font-semibold">{event.title}</span>
              <div className="ml-1 flex shrink-0 items-center gap-1">
                {isRecurring && (
                  <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 13.0399V11C2 7.68629 4.68629 5 8 5H21V5" />
                    <path d="M19 2L22 5L19 8" />
                    <path d="M22 9.98004V12.02C22 15.3337 19.3137 18.02 16 18.02H3V18.02" />
                    <path d="M5 21L2 18L5 15" />
                  </svg>
                )}
                {showClockIcon ? (
                  <svg className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : null}
                <span className="text-xs opacity-70">{compactTimeLabel}</span>
              </div>
            </div>
          ) : useCompactLayout ? (
            <div className="flex items-center justify-between truncate pt-1 pr-2">
              <span className="truncate text-base font-semibold">{event.title}</span>
              <div className="ml-2 flex shrink-0 items-center gap-1.5">
                {isRecurring && (
                  <svg className="h-4 w-4 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 13.0399V11C2 7.68629 4.68629 5 8 5H21V5" />
                    <path d="M19 2L22 5L19 8" />
                    <path d="M22 9.98004V12.02C22 15.3337 19.3137 18.02 16 18.02H3V18.02" />
                    <path d="M5 21L2 18L5 15" />
                  </svg>
                )}
                {showClockIcon ? (
                  <svg className="h-4 w-4 shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : null}
                <span className="text-sm font-medium whitespace-nowrap">{showEndTime ? rangeTimeLabel : compactTimeLabel}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 truncate pt-1 text-2xl font-extrabold">
                {showGoalIcon ? <GoalIcon className="h-5 w-5 shrink-0" /> : null}
                {event.title}
              </div>
              <div className="flex items-center justify-between text-xl font-medium">
                <div className="flex items-center gap-2.5">
                  {isRecurring && (
                    <svg className="h-5 w-5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 13.0399V11C2 7.68629 4.68629 5 8 5H21V5" />
                      <path d="M19 2L22 5L19 8" />
                      <path d="M22 9.98004V12.02C22 15.3337 19.3137 18.02 16 18.02H3V18.02" />
                      <path d="M5 21L2 18L5 15" />
                    </svg>
                  )}
                  <div className="flex items-center gap-1.5">
                    {showClockIcon ? (
                      <svg className="h-5 w-5 shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : null}
                    <span className="whitespace-nowrap">{showEndTime ? rangeTimeLabel : compactTimeLabel}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div
          onMouseDown={(e) => {
            onResizeStart(e, event)
          }}
          className="absolute bottom-0 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-b-md"
          title="Drag to resize"
        />
      </div>
    )
  }
)
