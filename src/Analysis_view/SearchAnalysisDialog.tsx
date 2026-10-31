import React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import SearchIcon from "@/assets/search.svg"
import { useAnalysisStore } from "@/store/analysisStore"
import { useGoalsStore } from "@/store/goalsStore"
import { computeStreak } from "@/lib/streak-mock"
import { Flame, CheckCircle, TrendingUp, X } from "lucide-react"

interface SearchAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchAnalysisDialog({ open, onOpenChange }: SearchAnalysisDialogProps) {
  const events = useAnalysisStore((state) => state.events)
  const goalsStore = useGoalsStore((state) => state.store)
  const [searchQuery, setSearchQuery] = React.useState("")

  const { current, longest } = React.useMemo(() => computeStreak(events), [events])

  const analysisItems = React.useMemo(() => {
    const list: Array<{
      id: string
      title: string
      category: string
      metric: string
      detail: string
    }> = [
      {
        id: "streak-current",
        title: "Current Active Streak",
        category: "Habits",
        metric: `${current} days`,
        detail: "Consecutive days with tracked events completed",
      },
      {
        id: "streak-longest",
        title: "Longest Record Streak",
        category: "Habits",
        metric: `${longest} days`,
        detail: "Best all-time focus streak",
      },
      {
        id: "total-events",
        title: "Total Tracked Events",
        category: "Activity",
        metric: `${events.length} sessions`,
        detail: "Logged within the active analysis window",
      },
    ]

    // Add unique goals from goalsStore
    const seenGoals = new Set<string>()
    Object.entries(goalsStore).forEach(([bucketKey, items]) => {
      items.forEach((item) => {
        if (!seenGoals.has(item.text)) {
          seenGoals.add(item.text)
          list.push({
            id: `goal-${item.id}`,
            title: item.text,
            category: "Tracked Goal",
            metric: item.completed ? "Completed" : item.status || "In Progress",
            detail: item.notes || `Goal category: ${bucketKey.split("-")[0]}`,
          })
        }
      })
    })

    return list
  }, [current, events, goalsStore, longest])

  const filteredItems = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      return analysisItems.slice(0, 10)
    }

    return analysisItems
      .filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(q)
        const catMatch = item.category.toLowerCase().includes(q)
        const detailMatch = item.detail.toLowerCase().includes(q)
        return titleMatch || catMatch || detailMatch
      })
      .slice(0, 15)
  }, [analysisItems, searchQuery])

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
              Analysis Page • Metrics &amp; Habits
            </span>
            <span className="text-xs text-neutral-400">
              {searchQuery
                ? `${filteredItems.length} match${filteredItems.length === 1 ? "" : "es"}`
                : `${analysisItems.length} metrics on page`}
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
              placeholder="Search analysis metrics & habits on this page..."
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
          {filteredItems.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] p-6 text-center">
              <div>
                <p className="text-base font-semibold text-neutral-600">
                  {searchQuery ? `No metrics matching "${searchQuery}"` : "No metrics found on this page."}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  Try searching for streak, activity, or habit names.
                </p>
              </div>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex w-full items-start justify-between rounded-[20px] sm:rounded-[24px] border border-transparent bg-[#ececeb] px-3.5 sm:px-4 py-2.5 sm:py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
              >
                <div className="min-w-0 flex-1 pr-3 flex items-start gap-3">
                  <div className="mt-1 text-neutral-500">
                    {item.id.includes("streak") ? (
                      <Flame className="h-5 w-5 text-amber-500" />
                    ) : item.id.includes("goal") ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-semibold text-neutral-800 truncate">
                      {item.title}
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                      {item.detail}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs font-medium text-neutral-500">
                      <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-neutral-600">
                        {item.category}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 font-bold text-neutral-700">
                        {item.metric}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

