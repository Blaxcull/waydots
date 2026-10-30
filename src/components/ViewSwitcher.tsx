import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNavigate, useLocation } from "react-router-dom"
import { useTimeStore } from "@/store/timeStore"

export type ViewType = "day" | "week" | "month" | "year"

interface ViewSwitcherProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const views: ViewType[] = ["day", "week", "month", "year"]

const getActiveViewFromPathname = (pathname: string): ViewType | null => {
  if (pathname.startsWith("/day/")) return "day"
  if (pathname.startsWith("/week/")) return "week"
  if (pathname.startsWith("/month/")) return "month"
  if (pathname.startsWith("/year/")) return "year"
  return null
}

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const routeActiveView = getActiveViewFromPathname(location.pathname)
  const shouldClearSelection = location.pathname === "/analysis" || location.pathname === "/goals"
  const activeView = routeActiveView ?? (shouldClearSelection ? null : currentView)

  const handleViewClick = (view: ViewType) => {
    onViewChange(view)
    const targetDate = selectedDate || new Date()
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() + 1
    const day = targetDate.getDate()

    if (view === "day") {
      navigate(`/day/${year}/${month}/${day}`)
      return
    }
    if (view === "week") {
      navigate(`/week/${year}/${month}/${day}`)
      return
    }
    if (view === "month") {
      navigate(`/month/${year}/${month}/${day}`)
      return
    }
    if (view === "year") {
      navigate(`/year/${year}/${month}/${day}`)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center overflow-x-auto rounded-full border border-black/5 bg-[#ececeb] p-2 shadow-sm">
        {views.map((view, i) => {
          const isActive = activeView === view
          const nextView = views[i + 1]
          const nextActive = nextView ? activeView === nextView : false

          return (
            <div key={view} className="flex items-center">
              <Button
                onClick={() => handleViewClick(view)}
                className={cn(
                  "w-[120px] rounded-full py-6 text-xl font-semibold capitalize",
                  "transition-all duration-200 ease-out",
                  "bg-transparent text-neutral-600",
                  "hover:bg-[#e3e3e1] hover:scale-105 active:scale-95",
                  isActive && "bg-[#dddddd] shadow-sm"
                )}
              >
                {view}
              </Button>

              {i < views.length - 1 && (
                <div
                  className={cn(
                    "w-px h-8 bg-gray-300 mx-1 transition-opacity duration-200",
                    isActive || nextActive ? "opacity-0" : "opacity-100"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
