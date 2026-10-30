"use client"
import React from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useTimeStore } from "@/store/timeStore"
import { useEventsStore } from "@/store/eventsStore"
import EventTitle from "./components/EventTitle"
import RecurringActionDialog from "@/components/RecurringActionDialog"
import { SearchEventsDialog } from "./SearchEventsDialog"
import SidebarHeader from "./components/SidebarHeader"
import { getCalendarRouteView, navigateToDate, shiftCalendarDate } from "./sidebarNavigation"

interface SideBarProps {
  compact?: boolean
  onRequestClose?: () => void
}

export function SideBar({
  compact = false,
  onRequestClose
}: SideBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentCalendarView = getCalendarRouteView(location.pathname)
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const setDate = useTimeStore((state) => state.setDate)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const [searchOpen, setSearchOpen] = React.useState(false)

  const goToToday = () => {
    const today = new Date()
    setDate(today)
    navigateToDate(navigate, today, currentCalendarView)
  }

  const goToPreviousDay = () => {
    if (!selectedDate) return
    const prev = shiftCalendarDate(selectedDate, currentCalendarView, -1)
    setDate(prev)
    navigateToDate(navigate, prev, currentCalendarView)
  }

  const goToNextDay = () => {
    if (!selectedDate) return
    const next = shiftCalendarDate(selectedDate, currentCalendarView, 1)
    setDate(next)
    navigateToDate(navigate, next, currentCalendarView)
  }

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return
    setDate(date)
    navigateToDate(navigate, date, currentCalendarView)
  }

  const saveSelectedEvent = useEventsStore((state) => state.saveSelectedEvent)
  const recurringDialogOpen = useEventsStore((state) => state.recurringDialogOpen)
  const recurringDialogEvent = useEventsStore((state) => state.recurringDialogEvent)
  const recurringDialogActionType = useEventsStore((state) => state.recurringDialogActionType)

  const handleSave = React.useCallback(async () => {
    if (!selectedEventId) return
    
    try {
      await saveSelectedEvent()
    } catch (error) {
      // Save failed
    }
  }, [selectedEventId, saveSelectedEvent])

  const sidebarContent = (
    <>
      <Card className={`h-full flex flex-col bg-neutral-100 text-slate-800 border border-gray-300 py-3 relative overflow-y-auto ${compact ? "w-[min(630px,calc(100vw-24px))] rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.18)]" : "w-[630px]"}`}>
        {compact && onRequestClose ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onRequestClose}
            aria-label="Close sidebar"
            className="absolute left-4 top-4 z-20 h-12 w-12 rounded-full border border-gray-300 bg-[#ececeb] text-neutral-600 hover:bg-white hover:text-neutral-800"
          >
            <X className="h-5 w-5" />
          </Button>
        ) : null}
        <SidebarHeader
          compact={compact}
          selectedDate={selectedDate}
          onSelectDate={handleCalendarSelect}
          onOpenSearch={() => setSearchOpen(true)}
          onPrevious={goToPreviousDay}
          onToday={goToToday}
          onNext={goToNextDay}
        />

        <EventTitle />

        {selectedEventId && (
          <div className="mt-auto pt-4 px-4 pb-4 flex justify-end">
            <Button
              variant="secondary"
              onClick={handleSave}
              className="bg-red-600 text-white hover:bg-red-700 px-8 py-6 text-lg rounded-full disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Save
            </Button>
          </div>
        )}

        {recurringDialogOpen && recurringDialogEvent && recurringDialogActionType && (
          <RecurringActionDialog
            open={recurringDialogOpen}
            onChoice={(choice) => {
              const callback = useEventsStore.getState().recurringDialogCallback
              if (callback) callback(choice)
            }}
            actionType={recurringDialogActionType}
            eventTitle={recurringDialogEvent?.title || ""}
          />
        )}
      </Card>
      <SearchEventsDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )

  return <>{sidebarContent}</>
}
