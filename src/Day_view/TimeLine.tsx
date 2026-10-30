import { useTimeStore } from "@/store/timeStore"
import { TOP_DEAD_ZONE } from "@/lib/eventUtils"

export default function TimeLine() {
  const dateInfo = useTimeStore((state) => state.dateInfo)
  const selectedDate = useTimeStore((state) => state.selectedDate)

  if (!dateInfo || !selectedDate) return null

  const totalMinutes =
    dateInfo.hours * 60 +
    dateInfo.minutes +
    dateInfo.seconds / 60

  const hourHeight = 100
  const correctTop =
    TOP_DEAD_ZONE + totalMinutes * (hourHeight / 60)

  const formatTime = () => {
    const hrs = dateInfo.hours
    const mins = dateInfo.minutes
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`
  }

  // ✅ Compare only the date part
  const isSameDay =
    selectedDate.toDateString() ===
    new Date().toDateString()

  if (!isSameDay) return null

  return (
    <div className="relative z-20 w-full h-full pointer-events-none">
      <div
        className="absolute -left-2 right-0 h-[2px] bg-red-500 z-10"
        style={{ top: `${correctTop}px` }}
      >
        <div className="absolute font-space-mono left-0 -translate-y-1/2 bg-red-500 text-white text-xl px-2 py-1 rounded-2xl">
          {formatTime()}
        </div>
      </div>
    </div>
  )
}
