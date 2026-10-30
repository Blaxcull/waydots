import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useTimeStore } from "@/store/timeStore"
import { useAnalysisStore } from "@/store/analysisStore"
import { useTasksStore } from "@/store/tasksStore"
import { useSubscription } from "@/hooks/useSubscription"
import goalIcon from "@/assets/goal.png"
import plusIcon from "@/assets/plus.png"

interface TopBarLeftProps {
  onAddClick?: () => void
}

const progressIcon = "/assets/progress.png"
const createPendingAddToken = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

function HomeIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

function CalendarIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="4" rx="3" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <circle cx="8" cy="15" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <circle cx="16" cy="15" r="1" fill="currentColor" />
    </svg>
  )
}

export function TopBarLeft({ onAddClick }: TopBarLeftProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const fetchAnalysisEvents = useAnalysisStore((state) => state.fetchAnalysisEvents)
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [useCondensedNav, setUseCondensedNav] = useState(false)

  const isMailRoute = location.pathname === "/mail"
  const isTodoRoute = location.pathname === "/todos"
  const isEmailOrTodo = isMailRoute || isTodoRoute

  const isHomeSelected = location.pathname === "/"
  const isCalendarSelected =
    location.pathname.startsWith("/day") ||
    location.pathname.startsWith("/week") ||
    location.pathname.startsWith("/month") ||
    location.pathname.startsWith("/year") ||
    location.pathname === "/today"

  const isGoalSelected = location.pathname === "/goals"
  const isAnalysisSelected = location.pathname === "/analysis"
  const isDayRoute = /^\/day\/\d+\/\d+\/\d+$/.test(location.pathname)

  const calendarDate = selectedDate || new Date()
  const calendarPath = `/day/${calendarDate.getFullYear()}/${calendarDate.getMonth() + 1}/${calendarDate.getDate()}`

  const isAnySelected = isEmailOrTodo
    ? isHomeSelected || isCalendarSelected
    : isGoalSelected || isAnalysisSelected

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return

    const mediaQuery = window.matchMedia("(max-width: 1200px)")
    const applyNavMode = (matches: boolean) => {
      setUseCondensedNav(matches)
      if (!matches) setMobileMenuOpen(false)
    }

    applyNavMode(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => applyNavMode(event.matches)
    mediaQuery.addEventListener("change", handleChange)

    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [mobileMenuOpen])

  const triggerAddAtCurrentTime = () => {
    if (typeof window !== "undefined") {
      const token = createPendingAddToken()
      sessionStorage.setItem("pendingAddNowEvent", token)
      window.dispatchEvent(new CustomEvent("calendar:add-now-event", { detail: { token } }))
    }
  }

  const handlePlusClick = () => {
    if (onAddClick) {
      onAddClick()
      return
    }

    if (isMailRoute) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pendingComposeMail", "true")
        window.dispatchEvent(new CustomEvent("waydots:compose-mail"))
      }
      return
    }

    if (isTodoRoute) {
      useTasksStore.getState().setSelectedTaskId(null)
      useTasksStore.getState().setIsSidebarOpen(true)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("waydots:open-tasks"))
      }
      return
    }

    const now = new Date()
    const todayPath = `/day/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`

    if (isDayRoute && location.pathname === todayPath) {
      triggerAddAtCurrentTime()
      return
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("pendingAddNowEvent", createPendingAddToken())
    }
    navigate(todayPath)
  }

  const openHomeView = () => {
    setMobileMenuOpen(false)
    navigate("/")
  }

  const openCalendarView = () => {
    setMobileMenuOpen(false)
    navigate(calendarPath)
  }

  const openGoalView = () => {
    setMobileMenuOpen(false)
    navigate("/goals")
  }

  const openAnalysisView = () => {
    setMobileMenuOpen(false)
    if (!isSubscriptionLoading) {
      void fetchAnalysisEvents({ force: true, rangeDays: isPro ? 120 : 30 })
    }
    navigate("/analysis")
  }

  const plusAriaLabel = isMailRoute
    ? "Compose mail"
    : isTodoRoute
    ? "Add task"
    : "Add event"

  return (
    <>
      <div className={`fixed left-4 top-4 z-[20020] items-center gap-3 ${useCondensedNav ? "hidden" : "flex"}`}>
        <div className="group flex items-center border-[1px] rounded-full shadow-sm bg-[#ececeb]/90 border-black/5 backdrop-blur-sm">
          {isEmailOrTodo ? (
            <>
              {/* Home Section */}
              <button
                type="button"
                onClick={openHomeView}
                aria-label="Home"
                title="Home"
                className={`
                  h-16 w-16 flex items-center justify-center
                  cursor-pointer rounded-full
                  transition-all duration-200 ease-out
                  active:scale-95
                  border
                  ${
                    isHomeSelected
                      ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
                      : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
                  }
                `}
              >
                <HomeIcon className="w-8 h-8 text-[#404040] opacity-80" />
              </button>

              {/* Divider */}
              {!isAnySelected && (
                <div className="w-px h-9 bg-gray-300 transition-opacity duration-150 group-hover:opacity-0" />
              )}

              {/* Calendar Section */}
              <button
                type="button"
                onClick={openCalendarView}
                aria-label="Calendar"
                title="Calendar"
                className={`
                  h-16 w-16 flex items-center justify-center
                  cursor-pointer rounded-full
                  transition-all duration-150
                  active:scale-95
                  border
                  ${
                    isCalendarSelected
                      ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
                      : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
                  }
                `}
              >
                <CalendarIcon className="w-8 h-8 text-[#404040] opacity-80" />
              </button>
            </>
          ) : (
            <>
              {/* Goals Section */}
              <button
                type="button"
                onClick={openGoalView}
                aria-label="Goals"
                title="Goals"
                className={`
                  h-16 w-16 flex items-center justify-center
                  cursor-pointer rounded-full
                  transition-all duration-200 ease-out
                  active:scale-95
                  border
                  ${
                    isGoalSelected
                      ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
                      : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
                  }
                `}
              >
                <img src={goalIcon} alt="Goals" className="w-9 h-9 opacity-80" />
              </button>

              {/* Divider */}
              {!isAnySelected && (
                <div className="w-px h-9 bg-gray-300 transition-opacity duration-150 group-hover:opacity-0" />
              )}

              {/* Progress / Analysis Section */}
              <button
                type="button"
                onClick={openAnalysisView}
                aria-label="Progress"
                title="Progress"
                className={`
                  h-16 w-16 flex items-center justify-center
                  cursor-pointer rounded-full
                  transition-all duration-150
                  active:scale-95
                  border
                  ${
                    isAnalysisSelected
                      ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
                      : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
                  }
                `}
              >
                <img src={progressIcon} alt="Progress" className="w-9 h-9 opacity-60" />
              </button>
            </>
          )}
        </div>

        {/* Plus Button */}
        <Button
          type="button"
          variant="ghost"
          onClick={handlePlusClick}
          aria-label={plusAriaLabel}
          title={plusAriaLabel}
          className={`h-16 w-16 rounded-full shadow-lg border-[1px] text-slate-600 bg-[#ececeb]/95 backdrop-blur-sm transition-all duration-200 ease-out hover:text-slate-800 hover:scale-110 hover:shadow-xl active:scale-95 flex items-center justify-center ${
            isAnalysisSelected ? "bg-[#ececeb]/90 border-black/5 backdrop-blur-sm" : ""
          }`}
        >
          <img src={plusIcon} alt={plusAriaLabel} className="w-7 h-7 opacity-80" />
        </Button>
      </div>

      <div className={`fixed left-3 top-3 sm:left-4 sm:top-4 z-[20020] items-center gap-2 sm:gap-3 ${useCondensedNav ? "flex" : "hidden"}`}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMobileMenuOpen(true)}
          className="h-11 w-11 sm:h-16 sm:w-16 rounded-full border-[1px] bg-[#ececeb]/95 text-slate-600 shadow-md sm:shadow-lg backdrop-blur-sm transition-all duration-200 ease-out hover:text-slate-800 hover:scale-110 hover:shadow-xl active:scale-95 p-0 flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5 sm:h-7 sm:w-7 opacity-80" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handlePlusClick}
          className="flex h-11 w-11 sm:h-16 sm:w-16 items-center justify-center rounded-full border-[1px] bg-[#ececeb]/95 text-slate-600 shadow-md sm:shadow-lg backdrop-blur-sm transition-all duration-200 ease-out hover:text-slate-800 hover:scale-110 hover:shadow-xl active:scale-95 p-0"
          aria-label={plusAriaLabel}
          title={plusAriaLabel}
        >
          <img src={plusIcon} alt={plusAriaLabel} className="w-5 h-5 sm:w-7 sm:h-7 opacity-80" />
        </Button>
      </div>

      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[20030] bg-black/30 backdrop-blur-[2px]"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-3 top-3 sm:left-4 sm:top-4 z-[20040] w-[min(280px,calc(100vw-24px))] rounded-[28px] border border-black/5 bg-[#ececeb]/98 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-md">
            <div className="flex items-center justify-between px-2 pb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Navigate</div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 w-10 rounded-full text-neutral-500 hover:bg-white/70 hover:text-neutral-800"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {isEmailOrTodo ? (
              <>
                <button
                  type="button"
                  onClick={openHomeView}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all duration-200 ${
                    isHomeSelected ? "bg-[#dddddd] shadow-sm" : "hover:bg-white/70"
                  }`}
                >
                  <HomeIcon className="h-7 w-7 text-neutral-700" />
                  <div>
                    <div className="text-base font-semibold text-neutral-800">Home</div>
                    <div className="text-sm text-neutral-500">Go to home overview</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openCalendarView}
                  className={`mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all duration-200 ${
                    isCalendarSelected ? "bg-[#dddddd] shadow-sm" : "hover:bg-white/70"
                  }`}
                >
                  <CalendarIcon className="h-7 w-7 text-neutral-700" />
                  <div>
                    <div className="text-base font-semibold text-neutral-800">Calendar</div>
                    <div className="text-sm text-neutral-500">Open your calendar view</div>
                  </div>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openGoalView}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all duration-200 ${
                    isGoalSelected ? "bg-[#dddddd] shadow-sm" : "hover:bg-white/70"
                  }`}
                >
                  <img src={goalIcon} alt="" className="h-8 w-8 opacity-80" />
                  <div>
                    <div className="text-base font-semibold text-neutral-800">Goals</div>
                    <div className="text-sm text-neutral-500">Open your goal view</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openAnalysisView}
                  className={`mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all duration-200 ${
                    isAnalysisSelected ? "bg-[#dddddd] shadow-sm" : "hover:bg-white/70"
                  }`}
                >
                  <img src={progressIcon} alt="" className="h-9 w-9 opacity-60" />
                  <div>
                    <div className="text-base font-semibold text-neutral-800">Progress</div>
                    <div className="text-sm text-neutral-500">Open your analysis view</div>
                  </div>
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
