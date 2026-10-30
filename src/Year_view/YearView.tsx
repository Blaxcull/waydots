import { useMemo } from "react"
import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { useNavigate, useParams } from "react-router-dom"
import { useTimeStore } from "@/store/timeStore"

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]

const YearView = () => {
  const navigate = useNavigate()
  const { year, month, day } = useParams<{ year: string; month: string; day: string }>()
  const setDate = useTimeStore((state) => state.setDate)

  const displayDate = useMemo(() => {
    const yearNum = year ? parseInt(year, 10) : NaN
    const monthNum = month ? parseInt(month, 10) - 1 : NaN
    const dayNum = day ? parseInt(day, 10) : NaN
    const routeDate = new Date(yearNum, monthNum, dayNum)
    const isValidRouteDate =
      !Number.isNaN(yearNum) &&
      !Number.isNaN(monthNum) &&
      !Number.isNaN(dayNum) &&
      routeDate.getFullYear() === yearNum &&
      routeDate.getMonth() === monthNum &&
      routeDate.getDate() === dayNum

    return isValidRouteDate ? routeDate : new Date()
  }, [day, month, year])

  const today = new Date()
  const displayYear = displayDate.getFullYear()

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(displayYear, monthIndex, 1)
      const monthStart = startOfMonth(monthDate)
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
      const monthDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))

      return {
        monthDate,
        visibleWeeks: Array.from({ length: 6 }, (_, index) => monthDays.slice(index * 7, index * 7 + 7)),
      }
    })
  }, [displayYear])

  const openMonth = (date: Date) => {
    setDate(date)
    navigate(`/month/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`)
  }

  const openDay = (date: Date) => {
    setDate(date)
    navigate(`/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`)
  }

  return (
    <div className="h-full w-full bg-[#f3f3f2] flex items-center justify-center overflow-hidden select-none">
      <div className="h-full w-full rounded-l-2xl bg-[#ececeb] shadow-xl flex flex-col overflow-hidden">
        <div className="px-9 pt-32 pb-3 border-b border-white/20 shrink-0 bg-[#ececeb]">
          <h1 className="text-6xl font-semibold tracking-tight text-neutral-800">
            <span>{displayYear}</span>
          </h1>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#e2e2e1] px-4 pb-4 pt-4 no-scrollbar">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {months.map(({ monthDate, visibleWeeks }) => (
              <div
                key={monthDate.toISOString()}
                className="min-h-0 rounded-2xl border border-black/5 bg-[#ececeb] px-3 pb-3 pt-2.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => openMonth(monthDate)}
                  className="mb-2 text-left"
                >
                  <h2 className="text-lg font-semibold tracking-tight text-neutral-800">
                    {format(monthDate, "MMMM")}
                  </h2>
                </button>

                <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <div key={`${monthDate.getMonth()}-${label}-${index}`}>{label}</div>
                  ))}
                </div>

                <div
                  className="mt-1.5 grid grid-cols-7 gap-x-0.5 gap-y-0.5"
                  style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}
                >
                  {visibleWeeks.flat().map((cellDate) => {
                    const inCurrentMonth = isSameMonth(cellDate, monthDate)
                    const isTodayCell = isSameDay(cellDate, today)

                    return (
                      <button
                        key={cellDate.toISOString()}
                        type="button"
                        onClick={() => openDay(cellDate)}
                        className="group flex min-h-[34px] items-center justify-center px-0.5 py-0.5 text-center"
                      >
                        <span
                          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[12px] font-semibold transition-colors ${
                            isTodayCell
                              ? "bg-black text-white"
                              : inCurrentMonth
                                ? "text-neutral-800 group-hover:bg-black/5"
                                : "text-neutral-400"
                          }`}
                        >
                            {cellDate.getDate()}
                          </span>
                        </button>
                      )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default YearView
