import React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import SearchIcon from "@/assets/search.svg"
import { useTasksStore, type TaskItem } from "@/store/tasksStore"
import { CheckCircle2, Circle, Flag, Calendar, X } from "lucide-react"

interface SearchTasksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchTasksDialog({ open, onOpenChange }: SearchTasksDialogProps) {
  const tasks = useTasksStore((state) => state.tasks)
  const sections = useTasksStore((state) => state.sections)
  const setSelectedTaskId = useTasksStore((state) => state.setSelectedTaskId)
  const setIsSidebarOpen = useTasksStore((state) => state.setIsSidebarOpen)
  const [searchQuery, setSearchQuery] = React.useState("")

  const sectionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    sections.forEach((s) => map.set(s.id, s.title))
    return map
  }, [sections])

  const matchedTasks = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      // Empty query shows up to 10 latest tasks on page
      return tasks.slice(0, 10)
    }

    return tasks
      .filter((task) => {
        const titleMatch = task.title.toLowerCase().includes(q)
        const notesMatch = task.notes ? task.notes.toLowerCase().includes(q) : false
        const sectionMatch = task.sectionId && sectionMap.get(task.sectionId)?.toLowerCase().includes(q)
        const subtasksMatch = task.subtasks?.some((st) => st.title.toLowerCase().includes(q))
        return titleMatch || notesMatch || sectionMatch || subtasksMatch
      })
      .slice(0, 20)
  }, [searchQuery, sectionMap, tasks])

  const handleSelect = (task: TaskItem) => {
    setSelectedTaskId(task.id)
    setIsSidebarOpen(true)
    onOpenChange(false)
  }

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,92vw)] overflow-hidden rounded-[28px] border border-gray-200 bg-neutral-100 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
        {/* Search Input Header */}
        <div className="border-b border-gray-200 px-4 sm:px-5 py-3 sm:py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="rounded-full bg-neutral-200/80 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-neutral-600 uppercase">
              Tasks &amp; To-Dos Page
            </span>
            <span className="text-xs text-neutral-400">
              {searchQuery
                ? `${matchedTasks.length} match${matchedTasks.length === 1 ? "" : "es"}`
                : `${tasks.length} task${tasks.length === 1 ? "" : "s"} on page`}
            </span>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 rounded-[24px] border border-gray-200 bg-[#e7e7e6] px-3.5 sm:px-4 py-2.5 sm:py-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-[#dddddc]">
              <img src={SearchIcon} alt="" className="h-4 w-4 sm:h-5 sm:w-5 opacity-60" />
            </div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matchedTasks.length > 0) {
                  e.preventDefault()
                  handleSelect(matchedTasks[0])
                }
              }}
              placeholder="Search tasks on this page..."
              className="w-full bg-transparent text-xl sm:text-2xl font-semibold text-neutral-700 outline-none placeholder:text-neutral-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-full hover:bg-black/5"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-[460px] overflow-y-auto px-3 py-3 space-y-2">
          {matchedTasks.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] p-6 text-center">
              <div>
                <p className="text-base font-semibold text-neutral-600">
                  {searchQuery ? `No tasks matching "${searchQuery}"` : "No tasks found on this page."}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  Try typing a task title, subtask, or section name.
                </p>
              </div>
            </div>
          ) : (
            matchedTasks.map((task) => {
              const sectionName = sectionMap.get(task.sectionId) || "Inbox"
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelect(task)}
                  className="group flex w-full items-start justify-between rounded-[20px] sm:rounded-[24px] border border-transparent bg-[#ececeb] px-3.5 sm:px-4 py-2.5 sm:py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
                >
                  <div className="min-w-0 flex-1 pr-3 flex items-start gap-3">
                    <div className="mt-1 text-neutral-500">
                      {task.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-neutral-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[17px] font-semibold text-neutral-800 truncate ${
                          task.completed ? "line-through text-neutral-400" : ""
                        }`}
                      >
                        {task.title || "Untitled Task"}
                      </div>

                      {task.notes && (
                        <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                          {task.notes}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-neutral-600">
                          {sectionName}
                        </span>
                        {task.dueDate && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-neutral-600">
                            <Calendar className="h-3 w-3" />
                            {task.dueDate}
                          </span>
                        )}
                        {task.priority && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 uppercase tracking-wider text-[10px] font-bold text-neutral-600">
                            <Flag className="h-3 w-3 text-red-500" />
                            {task.priority}
                          </span>
                        )}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-neutral-500">
                            {task.subtasks.filter((st) => st.completed).length}/{task.subtasks.length} subtasks
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-white text-base font-semibold leading-none text-neutral-300 transition-colors duration-200 group-hover:text-neutral-500">
                    &gt;
                  </div>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

