import React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import SearchIcon from "@/assets/search.svg"
import { useGoalsStore } from "@/store/goalsStore"
import type { ColumnType, SearchGoalResult, TodoStore } from "./goalView.types"
import { getColumnTypeFromBucketKey } from "./goalView.utils"
import { X, Target } from "lucide-react"

interface SearchGoalsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectGoal?: (goal: SearchGoalResult) => void
}

export function SearchGoalsDialog({ open, onOpenChange, onSelectGoal }: SearchGoalsDialogProps) {
  const store = useGoalsStore((state) => state.store) as TodoStore
  const [searchQuery, setSearchQuery] = React.useState("")

  const columnPriority: Record<ColumnType, number> = {
    week: 0,
    month: 1,
    year: 2,
    life: 3,
  }

  const searchableGoals: SearchGoalResult[] = React.useMemo(() => {
    return Object.entries(store).flatMap(([bucketKey, items]) => {
      const columnType = getColumnTypeFromBucketKey(bucketKey) as ColumnType | null
      if (!columnType) return []

      return items.map((item) => ({
        id: item.id,
        text: item.text,
        notes: item.notes,
        color: item.color,
        icon: item.icon,
        targetValue: item.targetValue,
        targetPeriod: item.targetPeriod,
        status: item.status,
        completed: item.completed,
        columnType,
        bucketKey,
        bucketLabel: bucketKey,
      }))
    })
  }, [store])

  const filteredGoals = React.useMemo(() => {
    const baseResults = [...searchableGoals].sort(
      (a, b) =>
        columnPriority[a.columnType] - columnPriority[b.columnType] ||
        a.text.localeCompare(b.text)
    )

    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return baseResults.slice(0, 10)
    }

    return searchableGoals
      .map((item) => {
        const text = item.text.toLowerCase()
        const notes = item.notes?.toLowerCase() || ""
        const columnType = item.columnType.toLowerCase()

        let textRank = -1
        if (text === query) textRank = 0
        else if (text.startsWith(query)) textRank = 1
        else if (text.includes(query)) textRank = 2
        else if (notes.includes(query)) textRank = 3
        else if (columnType.includes(query)) textRank = 4

        return { ...item, textRank }
      })
      .filter((item) => item.textRank !== -1)
      .sort((a, b) =>
        columnPriority[a.columnType] - columnPriority[b.columnType] ||
        a.textRank - b.textRank ||
        a.text.localeCompare(b.text)
      )
      .slice(0, 20)
  }, [columnPriority, searchableGoals, searchQuery])

  const handleSelect = (goal: SearchGoalResult) => {
    onSelectGoal?.(goal)
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
              Goals Page • Pillars &amp; Horizons
            </span>
            <span className="text-xs text-neutral-400">
              {searchQuery
                ? `${filteredGoals.length} match${filteredGoals.length === 1 ? "" : "es"}`
                : `${searchableGoals.length} goals on page`}
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
                if (e.key === "Enter" && filteredGoals.length > 0) {
                  e.preventDefault()
                  handleSelect(filteredGoals[0])
                }
              }}
              placeholder="Search goals on this page..."
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
          {filteredGoals.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] p-6 text-center">
              <div>
                <p className="text-base font-semibold text-neutral-600">
                  {searchQuery ? `No goals matching "${searchQuery}"` : "No goals found on this page."}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  Try typing a goal title or category name.
                </p>
              </div>
            </div>
          ) : (
            filteredGoals.map((goal) => (
              <button
                key={`${goal.bucketKey}-${goal.id}`}
                type="button"
                onClick={() => handleSelect(goal)}
                className="group flex w-full items-start justify-between rounded-[20px] sm:rounded-[24px] border border-transparent bg-[#ececeb] px-3.5 sm:px-4 py-2.5 sm:py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
              >
                <div className="min-w-0 flex-1 pr-3 flex items-start gap-3">
                  <div className="mt-1 text-neutral-500">
                    <Target className="h-5 w-5 text-neutral-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-semibold text-neutral-800 truncate">
                      {goal.text}
                    </div>
                    {goal.notes && (
                      <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                        {goal.notes}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
                      <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold uppercase tracking-wider text-neutral-600">
                        {goal.columnType}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-neutral-600">
                        {goal.completed ? "Completed" : goal.status || "Active"}
                      </span>
                      {goal.targetValue ? (
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-neutral-600">
                          Target: {goal.targetValue} {goal.targetPeriod || ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-white text-base font-semibold leading-none text-neutral-300 transition-colors duration-200 group-hover:text-neutral-500">
                  &gt;
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
