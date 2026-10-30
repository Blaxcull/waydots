import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useEventsStore, type NewEvent } from "@/store/eventsStore"
import { getGoalBucketKey, useGoalsStore, type GoalColumnType } from "@/store/goalsStore"
import { isSeriesActuallyRecurring, isSeriesAnchorEvent } from "@/store/recurringUtils"
import GoalTypeRow from "./GoalTypeRow"
import GoalRow from "./GoalRow"

const GOAL_TYPE_TO_COLUMN: Record<string, GoalColumnType | null> = {
  None: null,
  Weekly: "week",
  Monthly: "month",
  Yearly: "year",
  Lifetime: "life",
}

const GoalPanel: React.FC = () => {
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const getEventById = useEventsStore((state) => state.getEventById)
  const updateEventFields = useEventsStore((state) => state.updateEventFields)
  const saveTrigger = useEventsStore((state) => state.saveTrigger)
  const showRecurringDialog = useEventsStore((state) => state.showRecurringDialog)
  const closeRecurringDialog = useEventsStore((state) => state.closeRecurringDialog)
  useEventsStore((state) => state.eventsCache)
  useEventsStore((state) => state.computedEventsCache)
  const goalsStore = useGoalsStore((state) => state.store)
  const fetchGoalBuckets = useGoalsStore((state) => state.fetchGoalBuckets)
  const [goalTypeValue, setGoalTypeValue] = useState("None")
  const [goalValue, setGoalValue] = useState("None")

  const selectedEvent = selectedEventId ? getEventById(selectedEventId) : null

  useEffect(() => {
    setGoalTypeValue(selectedEvent?.goalType || "None")
    setGoalValue(selectedEvent?.goal || "None")
  }, [selectedEvent?.id, selectedEvent?.goalType, selectedEvent?.goal])

  const selectedEventDate = useMemo(() => {
    if (!selectedEvent?.date) return null
    return new Date(`${selectedEvent.date}T00:00:00`)
  }, [selectedEvent?.date])

  const selectedGoalColumn = goalTypeValue
    ? GOAL_TYPE_TO_COLUMN[goalTypeValue] ?? null
    : null

  const selectedGoalBucketKey = useMemo(() => {
    if (!selectedGoalColumn) return null
    if (selectedGoalColumn === "life") return "life"
    if (!selectedEventDate) return null
    return getGoalBucketKey(selectedGoalColumn, selectedEventDate)
  }, [selectedEventDate, selectedGoalColumn])

  const eventGoalBucketKeys = useMemo(() => {
    if (!selectedEventDate) return [] as string[]
    return [
      getGoalBucketKey("week", selectedEventDate),
      getGoalBucketKey("month", selectedEventDate),
      getGoalBucketKey("year", selectedEventDate),
      "life",
    ]
  }, [selectedEventDate])

  useEffect(() => {
    if (eventGoalBucketKeys.length === 0) return
    void fetchGoalBuckets(eventGoalBucketKeys)
  }, [eventGoalBucketKeys, fetchGoalBuckets])

  useEffect(() => {
    if (!selectedGoalBucketKey) return
    void fetchGoalBuckets([selectedGoalBucketKey])
  }, [fetchGoalBuckets, selectedGoalBucketKey])

  const goalOptions = useMemo(() => {
    if (!selectedGoalBucketKey) return ["None"] as const
    const goalsInBucket = (goalsStore[selectedGoalBucketKey] ?? []).filter(
      (goal) => goal.status !== "paused" || goal.text === goalValue
    )
    const names = goalsInBucket.map((goal) => goal.text)
    return ["None", ...Array.from(new Set(names))] as const
  }, [goalValue, goalsStore, selectedGoalBucketKey])

  const selectedGoals = useMemo(() => {
    if (!selectedGoalBucketKey) return []
    return goalsStore[selectedGoalBucketKey] ?? []
  }, [goalsStore, selectedGoalBucketKey])

  const pendingGoalType = goalTypeValue
  const pendingGoal = goalValue
  const matchedGoal = useMemo(
    () => selectedGoals.find((goal) => goal.text === pendingGoal),
    [pendingGoal, selectedGoals]
  )
  const pendingGoalColor = pendingGoal === "None" ? "" : matchedGoal?.color || ""
  const pendingGoalIcon = pendingGoal === "None" ? "" : matchedGoal?.icon || ""
  const hasPendingGoalChanges =
    !!selectedEvent &&
    (
      (selectedEvent.goalType || "None") !== pendingGoalType ||
      (selectedEvent.goal || "None") !== pendingGoal ||
      (selectedEvent.goalColor || "") !== pendingGoalColor ||
      (selectedEvent.goalIcon || "") !== pendingGoalIcon
    )

  useEffect(() => {
    if (saveTrigger === 0 || !selectedEventId || !selectedEvent || !hasPendingGoalChanges) return

    const updates: Partial<NewEvent> = {
      goalType: pendingGoalType,
      goal: pendingGoal,
      goalColor: pendingGoalColor,
      goalIcon: pendingGoalIcon,
    }

    const isRecurring = isSeriesActuallyRecurring(selectedEvent)

    if (isRecurring) {
      if (isSeriesAnchorEvent(selectedEvent)) {
        const updateAllInSeries = useEventsStore.getState().updateAllInSeries
        const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
        void updateAllInSeries(seriesMasterId, updates)
        return
      }

      showRecurringDialog(selectedEvent, "edit", async (choice: string) => {
        if (choice === "only-this") {
          const splitRecurringEvent = useEventsStore.getState().splitRecurringEvent
          await splitRecurringEvent(
            selectedEvent as any,
            selectedEvent.date,
            selectedEvent.start_time,
            selectedEvent.end_time,
            updates
          )
        } else if (choice === "all-events") {
          const updateAllInSeries = useEventsStore.getState().updateAllInSeries
          const seriesMasterId = (selectedEvent as any).seriesMasterId || selectedEvent.id
          await updateAllInSeries(seriesMasterId, updates)
        } else if (choice === "this-and-following") {
          const updateThisAndFollowing = useEventsStore.getState().updateThisAndFollowing
          await updateThisAndFollowing(
            selectedEvent as any,
            selectedEvent.date,
            selectedEvent.start_time,
            selectedEvent.end_time,
            updates
          )
        }

        closeRecurringDialog()
      })
      return
    }

    updateEventFields(selectedEventId, updates)
  }, [
    closeRecurringDialog,
    hasPendingGoalChanges,
    pendingGoal,
    pendingGoalColor,
    pendingGoalIcon,
    pendingGoalType,
    saveTrigger,
    selectedEvent,
    selectedEventId,
    showRecurringDialog,
    updateEventFields,
  ])

  const handleGoalTypeChange = useCallback(
    (value: string) => {
      setGoalTypeValue(value)
      setGoalValue("None")
    },
    []
  )

  const handleGoalChange = useCallback(
    (value: string) => {
      setGoalValue(value)
    },
    []
  )

  if (!selectedEvent) return null

  return (
    <div className="shadow-lg border border-neutral-100 w-full bg-[#ececec] rounded-[52px] pl-5 pr-6 py-6 border-20 space-y-3 shadow-none">
      <GoalTypeRow
        value={goalTypeValue}
        onChange={handleGoalTypeChange}
      />

      <hr className="border-neutral-300 border-t-[2px]" />

      <GoalRow
        value={goalValue}
        options={goalOptions}
        onChange={handleGoalChange}
      />
    </div>
  )
}

export default GoalPanel
