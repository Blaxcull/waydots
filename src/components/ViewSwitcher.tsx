import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNavigate, useLocation } from "react-router-dom"
import { useTimeStore } from "@/store/timeStore"
import { useEmailStore, type MailFolder } from "@/store/emailStore"
import { useTasksStore, type TaskView as TaskViewType } from "@/store/tasksStore"

export type ViewType = "day" | "week" | "month" | "year"

interface ViewSwitcherProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const views: ViewType[] = ["day", "week", "month", "year"]
const taskViews: TaskViewType[] = ["inbox", "today", "upcoming", "completed"]

const mailTabs: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "starred", label: "Starred" },
  { id: "trash", label: "Trash" },
  { id: "sent", label: "Sent" },
]

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
  const isMailView = location.pathname === "/mail"
  const isTodoView = location.pathname === "/todos"
  const activeFolder = useEmailStore((state) => state.activeFolder)
  const setActiveFolder = useEmailStore((state) => state.setActiveFolder)
  const activeTaskView = useTasksStore((state) => state.activeView)
  const setActiveTaskView = useTasksStore((state) => state.setActiveView)

  const shouldClearSelection =
    location.pathname === "/analysis" ||
    location.pathname === "/goals" ||
    location.pathname === "/mail" ||
    location.pathname === "/todos"
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

  // When on /mail, render the 4 mail sections: Inbox, Starred, Trash, Sent
  if (isMailView) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-5 sm:bottom-auto sm:top-4 z-50 flex justify-center px-2 sm:px-4">
        <div className="pointer-events-auto flex max-w-full items-center overflow-x-auto no-scrollbar rounded-full border border-black/5 bg-[#ececeb]/95 sm:bg-[#ececeb] p-1.5 sm:p-2 shadow-lg sm:shadow-sm backdrop-blur-md">
          {mailTabs.map((tab, i) => {
            const isActive = activeFolder === tab.id
            const nextTab = mailTabs[i + 1]
            const nextActive = nextTab ? activeFolder === nextTab.id : false

            return (
              <div key={tab.id} className="flex items-center">
                <Button
                  onClick={() => setActiveFolder(tab.id)}
                  className={cn(
                    "rounded-full w-auto px-3.5 py-1.5 text-xs sm:w-[120px] sm:py-6 sm:text-xl font-semibold capitalize",
                    "transition-all duration-200 ease-out",
                    "bg-transparent text-neutral-600",
                    "hover:bg-[#e3e3e1] hover:scale-105 active:scale-95",
                    isActive && "bg-[#dddddd] shadow-sm text-neutral-800"
                  )}
                >
                  {tab.label}
                </Button>

                {i < mailTabs.length - 1 && (
                  <div
                    className={cn(
                      "w-px h-5 sm:h-8 bg-gray-300 mx-0.5 sm:mx-1 transition-opacity duration-200",
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

  // When on /todos, render the 4 task sections: Inbox, Today, Upcoming, Completed
  if (isTodoView) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-5 sm:bottom-auto sm:top-4 z-50 flex justify-center px-2 sm:px-4">
        <div className="pointer-events-auto flex max-w-full items-center overflow-x-auto no-scrollbar rounded-full border border-black/5 bg-[#ececeb]/95 sm:bg-[#ececeb] p-1.5 sm:p-2 shadow-lg sm:shadow-sm backdrop-blur-md">
          {taskViews.map((tab, i) => {
            const isActive = activeTaskView === tab
            const nextTab = taskViews[i + 1]
            const nextActive = nextTab ? activeTaskView === nextTab : false

            return (
              <div key={tab} className="flex items-center">
                <Button
                  onClick={() => setActiveTaskView(tab)}
                  className={cn(
                    "rounded-full w-auto px-3.5 py-1.5 text-xs sm:w-[125px] sm:py-6 sm:text-xl font-semibold capitalize",
                    "transition-all duration-200 ease-out",
                    "bg-transparent text-neutral-600",
                    "hover:bg-[#e3e3e1] hover:scale-105 active:scale-95",
                    isActive && "bg-[#dddddd] text-neutral-900 shadow-sm"
                  )}
                >
                  {tab}
                </Button>

                {i < taskViews.length - 1 && (
                  <div
                    className={cn(
                      "w-px h-5 sm:h-8 bg-gray-300 mx-0.5 sm:mx-1 transition-opacity duration-200",
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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 sm:bottom-auto sm:top-4 z-50 flex justify-center px-2 sm:px-4">
      <div className="pointer-events-auto flex max-w-full items-center overflow-x-auto no-scrollbar rounded-full border border-black/5 bg-[#ececeb]/95 sm:bg-[#ececeb] p-1.5 sm:p-2 shadow-lg sm:shadow-sm backdrop-blur-md">
        {views.map((view, i) => {
          const isActive = activeView === view
          const nextView = views[i + 1]
          const nextActive = nextView ? activeView === nextView : false

          return (
            <div key={view} className="flex items-center">
              <Button
                onClick={() => handleViewClick(view)}
                className={cn(
                  "rounded-full w-auto px-3.5 py-1.5 text-xs sm:w-[120px] sm:py-6 sm:text-xl font-semibold capitalize",
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
                    "w-px h-5 sm:h-8 bg-gray-300 mx-0.5 sm:mx-1 transition-opacity duration-200",
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
