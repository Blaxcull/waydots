import { useState, useMemo, useCallback } from "react"
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Check,
  Sparkles,
  ListTodo,
} from "lucide-react"
import { useEventsStore } from "@/store/eventsStore"
import { useTasksStore } from "@/store/tasksStore"
import {
  extractMeetingDateTime,
  checkDateTimeConflicts,
  formatMinutesToTime,
  rescheduleConflictingItem,
  isActualMeetingRequest,
  type ConflictItem,
} from "@/services/geminiMailService"
import type { Email } from "@/store/emailStore"

interface MeetingSchedulePlannerProps {
  email: Email
  onUpdateDraftText?: (text: string) => void
  currentDraftText?: string
}

// Predefined 30-minute time options from 8:00 AM to 8:00 PM
const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30
  return {
    minutes: totalMinutes,
    label: formatMinutesToTime(totalMinutes),
  }
})

export default function MeetingSchedulePlanner({
  email,
  onUpdateDraftText,
}: MeetingSchedulePlannerProps) {
  const initial = useMemo(() => extractMeetingDateTime(email), [email])
  const isMeeting = useMemo(() => isActualMeetingRequest(email), [email])

  // Toggle state: expanded by default for meeting emails
  const [isOpen, setIsOpen] = useState<boolean>(isMeeting)

  // User-modifiable schedule fields
  const [date, setDate] = useState<string>(initial.date)
  const [startTime, setStartTime] = useState<number>(initial.startTimeMinutes)
  const [duration, setDuration] = useState<number>(initial.durationMinutes)
  const [title, setTitle] = useState<string>(
    `Meeting with ${email.senderName || "Akash"}: ${email.subject.replace(/^(re:|fwd:|urgent:)\s*/i, "")}`
  )

  // Status feedback state
  const [addedStatus, setAddedStatus] = useState<"idle" | "event" | "task">("idle")
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // Read stores for reactive conflict checking
  const eventsCache = useEventsStore((s) => s.eventsCache)
  const tasks = useTasksStore((s) => s.tasks)

  // Real-time conflict checking
  const conflicts: ConflictItem[] = useMemo(() => {
    return checkDateTimeConflicts(date, startTime, startTime + duration)
  }, [date, startTime, duration, eventsCache, tasks])

  // Quick date preset helpers
  const handleSetQuickDate = (offsetDays: number) => {
    const target = new Date()
    target.setDate(target.getDate() + offsetDays)
    const yyyy = target.getFullYear()
    const mm = String(target.getMonth() + 1).padStart(2, "0")
    const dd = String(target.getDate()).padStart(2, "0")
    setDate(`${yyyy}-${mm}-${dd}`)
    setAddedStatus("idle")
    setFeedbackMessage(null)
  }

  // Find next conflict-free slot
  const handleFindNextFreeSlot = useCallback(() => {
    for (let testTime = startTime + 30; testTime <= 18 * 60; testTime += 30) {
      const testConflicts = checkDateTimeConflicts(date, testTime, testTime + duration)
      if (testConflicts.length === 0) {
        setStartTime(testTime)
        return
      }
    }
    // Fallback: next day at 10:00 AM
    handleSetQuickDate(1)
    setStartTime(10 * 60)
  }, [date, startTime, duration])

  // Reschedule conflicting item to 2:00 PM
  const handleRescheduleConflict = (conflict: ConflictItem) => {
    rescheduleConflictingItem(conflict, 14 * 60) // 2:00 PM
    setFeedbackMessage(`Rescheduled "${conflict.title}" to 2:00 PM to free up this slot!`)
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  // Action: Add Event to Calendar
  const handleAddEvent = async () => {
    try {
      await useEventsStore.getState().addEventOptimistic({
        title,
        date,
        end_date: date,
        start_time: startTime,
        end_time: startTime + duration,
        description: `Meeting request from ${email.senderName} (${email.senderEmail})\nSubject: ${email.subject}`,
        color: "#4f46e5",
      })
      setAddedStatus("event")
      setFeedbackMessage(`Calendar event created for ${formatMinutesToTime(startTime)} on ${date}!`)
      setTimeout(() => setFeedbackMessage(null), 4000)
    } catch (err: any) {
      setFeedbackMessage(err?.message || "Failed to add event")
    }
  }

  // Action: Add Task / To-Do
  const handleAddTask = () => {
    try {
      useTasksStore.getState().addTask({
        title,
        dueDate: date,
        dueTime: formatMinutesToTime(startTime),
        notes: `Meeting with ${email.senderName} (${email.senderEmail})`,
        priority: "p2",
      })
      setAddedStatus("task")
      setFeedbackMessage(`To-Do created for ${formatMinutesToTime(startTime)} on ${date}!`)
      setTimeout(() => setFeedbackMessage(null), 4000)
    } catch (err: any) {
      setFeedbackMessage(err?.message || "Failed to add task")
    }
  }

  // Action: Update AI Draft with confirmed date/time
  const handleUpdateDraft = () => {
    if (!onUpdateDraftText) return
    const formattedTime = formatMinutesToTime(startTime)
    const senderFirst = email.senderName.split(" ")[0] || "there"
    const newDraft = `Hi ${senderFirst},\n\nThank you for reaching out! I would be glad to meet. I have confirmed our meeting for ${date} at ${formattedTime} (${duration} mins).\n\nLooking forward to speaking with you!\n\nBest regards,\nHarsh`
    onUpdateDraftText(newDraft)
    setFeedbackMessage(`Draft reply updated with ${formattedTime} confirmation!`)
    setTimeout(() => setFeedbackMessage(null), 3500)
  }

  return (
    <div className="rounded-2xl border border-gray-300/80 bg-white/95 p-3.5 sm:p-4 shadow-xs transition-all flex flex-col gap-3">
      {/* Header with Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-white shrink-0 shadow-2xs">
            <Calendar className="h-4 w-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-neutral-800 flex items-center gap-2 truncate">
              <span>Meeting Scheduler</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 border border-neutral-200">
                {formatMinutesToTime(startTime)} ({duration}m)
              </span>
            </div>
            <div className="text-[11px] text-neutral-500 truncate">
              Target: {date} • {conflicts.length > 0 ? "⚠️ Conflict" : "✓ Slot Free"}
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95 ${
            isOpen
              ? "bg-neutral-900 text-white"
              : "bg-[#e7e7e6] text-neutral-700 hover:bg-[#dddddc] border border-gray-300/80"
          }`}
          title={isOpen ? "Collapse Planner" : "Change Date & Time"}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{isOpen ? "Hide Controls" : "Change Time & Date"}</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded Scheduling & Conflict Controls */}
      {isOpen && (
        <div className="flex flex-col gap-3 pt-2 border-t border-gray-200/80 animate-in fade-in duration-200">
          {/* Row 1: Title input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-neutral-600">Meeting / Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          {/* Row 2: Date, Time & Duration Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Date Picker */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-neutral-600 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setAddedStatus("idle")
                }}
                className="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-500 font-medium cursor-pointer"
              />
            </div>

            {/* Time Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-neutral-600 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Start Time</span>
              </label>
              <select
                value={startTime}
                onChange={(e) => {
                  setStartTime(Number(e.target.value))
                  setAddedStatus("idle")
                }}
                className="rounded-xl border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-500 font-medium cursor-pointer"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-neutral-600">Duration</label>
              <div className="flex items-center gap-1">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setDuration(mins)
                      setAddedStatus("idle")
                    }}
                    className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      duration === mins
                        ? "bg-neutral-900 text-white shadow-2xs"
                        : "border border-gray-300 bg-white text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conflict Checking Banner */}
          {conflicts.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-3 text-xs text-amber-950 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Conflict Detected ({conflicts.length} overlapping item{conflicts.length > 1 ? "s" : ""}):</span>
                </div>
                <button
                  type="button"
                  onClick={handleFindNextFreeSlot}
                  className="rounded-lg border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 active:scale-95 transition-all shadow-2xs"
                >
                  ⚡ Find Next Free Slot
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {conflicts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-2.5 py-1 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-neutral-800 uppercase text-[9px] bg-amber-200 text-amber-900 px-1 rounded">
                        {c.type}
                      </span>
                      <span className="truncate font-medium text-neutral-800">{c.title}</span>
                      <span className="text-neutral-500">({c.time})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRescheduleConflict(c)}
                      className="text-neutral-600 hover:text-neutral-900 font-semibold underline text-[10px] shrink-0"
                    >
                      Reschedule to 2 PM
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-300 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-950 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium">
                No conflicts! This slot ({formatMinutesToTime(startTime)} – {formatMinutesToTime(startTime + duration)}) is completely free in both your Calendar and To-Dos.
              </span>
            </div>
          )}

          {/* Feedback banner if action performed */}
          {feedbackMessage && (
            <div className="rounded-xl bg-neutral-900 text-white text-xs px-3 py-1.5 font-medium flex items-center gap-2 animate-in fade-in">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Row 3: Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddEvent}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                  addedStatus === "event"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm"
                }`}
              >
                {addedStatus === "event" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" />
                )}
                <span>{addedStatus === "event" ? "Calendar Event Added!" : "Set Calendar Event"}</span>
              </button>

              <button
                type="button"
                onClick={handleAddTask}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                  addedStatus === "task"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "border border-gray-300 bg-white text-neutral-800 hover:bg-neutral-100 shadow-2xs"
                }`}
              >
                {addedStatus === "task" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ListTodo className="h-3.5 w-3.5 text-neutral-600" />
                )}
                <span>{addedStatus === "task" ? "To-Do Added!" : "Set To-Do"}</span>
              </button>
            </div>

            {onUpdateDraftText && (
              <button
                type="button"
                onClick={handleUpdateDraft}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-white active:scale-95 transition-all shadow-2xs cursor-pointer ml-auto"
                title="Updates your email reply text to confirm this date and time"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Update AI Draft with this Time</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
