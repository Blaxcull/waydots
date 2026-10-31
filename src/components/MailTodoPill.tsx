import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useTimeStore } from "@/store/timeStore"

export function MailIcon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="15" x="2" y="4.5" rx="2.5" />
      <path d="m22 7.5-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7.5" />
    </svg>
  )
}

export function TodoIcon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="6" height="6" rx="1.5" />
      <path d="m3 17 2 2 4-4" strokeWidth="2.1" />
      <path d="M13 6h8" strokeWidth="2" />
      <path d="M13 12h8" strokeWidth="2" />
      <path d="M13 18h8" strokeWidth="2" />
    </svg>
  )
}

interface MailTodoPillProps {
  onMailClick?: () => void
  onTodoClick?: () => void
  isMailActive?: boolean
  isTodoActive?: boolean
  className?: string
}

export function MailTodoPill({
  onMailClick,
  onTodoClick,
  isMailActive,
  isTodoActive,
  className,
}: MailTodoPillProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedDate = useTimeStore((state) => state.selectedDate)
  const [internalActive] = useState<"mail" | "todo" | null>(null)

  const isMailRoute = location.pathname === "/mail"
  const isTodoRoute = location.pathname === "/todos"
  const mailActive = isMailActive !== undefined ? isMailActive : (isMailRoute || internalActive === "mail")
  const todoActive = isTodoActive !== undefined ? isTodoActive : (isTodoRoute || internalActive === "todo")
  const anyActive = mailActive || todoActive

  const calendarDate = selectedDate || new Date()
  const calendarPath = `/day/${calendarDate.getFullYear()}/${calendarDate.getMonth() + 1}/${calendarDate.getDate()}`

  const handleMailClick = () => {
    if (onMailClick) {
      onMailClick()
    } else {
      navigate("/mail")
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("waydots:open-mail"))
    }
  }

  const handleTodoClick = () => {
    if (onTodoClick) {
      onTodoClick()
    } else {
      navigate(isTodoRoute ? calendarPath : "/todos")
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("waydots:open-tasks"))
    }
  }

  return (
    <div
      className={cn(
        "group flex items-center border-[1px] rounded-full shadow-sm bg-[#ececeb]/90 border-black/5 backdrop-blur-sm",
        className
      )}
    >
      {/* Mail Button */}
      <button
        type="button"
        onClick={handleMailClick}
        aria-label="Mail"
        title="Mail"
        className={cn(
          "h-11 w-11 sm:h-16 sm:w-16 flex items-center justify-center cursor-pointer rounded-full",
          "transition-all duration-200 ease-out active:scale-95 border",
          mailActive
            ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
            : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
        )}
      >
        <MailIcon className="w-5 h-5 sm:w-9 sm:h-9 text-[#404040] opacity-80" />
      </button>

      {/* Divider */}
      {!anyActive && (
        <div className="w-px h-5 sm:h-9 bg-gray-300 transition-opacity duration-150 group-hover:opacity-0" />
      )}

      {/* To-Do List Button */}
      <button
        type="button"
        onClick={handleTodoClick}
        aria-label="To-do list"
        title="To-do list"
        className={cn(
          "h-11 w-11 sm:h-16 sm:w-16 flex items-center justify-center cursor-pointer rounded-full",
          "transition-all duration-200 ease-out active:scale-95 border",
          todoActive
            ? "bg-[#dddddd] border-white/80 shadow-inner scale-90 hover:scale-100 hover:bg-[#e7e7e6] hover:shadow-lg"
            : "border-transparent hover:border-white/40 hover:shadow-lg hover:scale-100"
        )}
      >
        <TodoIcon className="w-5 h-5 sm:w-9 sm:h-9 text-[#404040] opacity-80" />
      </button>
    </div>
  )
}
