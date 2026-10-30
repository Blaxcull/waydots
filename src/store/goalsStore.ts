import { create } from "zustand";
import { supabase, getSafeSession } from "@/lib/supabase";
import type { Goal } from "@/Goal_view/goal";
import type { Event } from "@/store/eventsStore";
import type { GoalWriteRow } from "@/Goal_view/goalView.types";

export type GoalColumnType = "week" | "month" | "year" | "life";

export interface GoalBoardItem {
  id: string;
  text: string;
  completed: boolean;
  notes?: string;
  color?: string;
  icon?: string;
  targetValue?: number;
  targetPeriod?: Goal["targetPeriod"];
  status?: Goal["status"];
}

export type GoalBoardStore = Record<string, GoalBoardItem[]>;

const EVENT_GOAL_TYPE_TO_COLUMN: Record<string, GoalColumnType | null> = {
  Weekly: "week",
  Monthly: "month",
  Yearly: "year",
  Lifetime: "life",
  None: null,
};

interface GoalRow {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  color: string;
  icon: string;
  target_value: number;
  target_period: Goal["targetPeriod"];
  status: Goal["status"];
  completed: boolean;
  column_type: GoalColumnType;
  bucket_key: string;
  sort_order: number;
}

interface GoalsState {
  store: GoalBoardStore;
  userId: string | null;
  isLoadingCurrent: boolean;
  isLoadingAll: boolean;
  goalsError: string | null;
  hasPrefetchedCurrent: boolean;
  hasLoadedAll: boolean;
  pendingSyncs: Set<string>; // IDs of goals being synced/deleted
  setStore: (store: GoalBoardStore) => void;
  setGoalsError: (error: string | null) => void;
  clearGoals: () => void;
  fetchGoalBuckets: (keys: string[]) => Promise<void>;
  prefetchCurrentGoals: (currentDate?: Date, yearDate?: Date) => Promise<void>;
  fetchAllGoals: () => Promise<void>;
  syncGoalStatuses: () => Promise<void>;
  
  // CRUD Actions
  addGoal: (bucketKey: string, text: string) => Promise<string>;
  updateGoal: (bucketKey: string, goalId: string, updates: Partial<GoalBoardItem>) => Promise<void>;
  deleteGoal: (bucketKey: string, goalId: string) => Promise<void>;
  reorderGoals: (bucketKey: string, goalIds: string[]) => Promise<void>;
  moveGoal: (fromBucketKey: string, toBucketKey: string, goalId: string, targetIndex?: number) => Promise<void>;
}

interface GoalLinkedEventRow {
  date: string;
  end_date?: string | null;
  start_time: number;
  end_time: number;
  is_all_day?: boolean | null;
  goal: string | null;
  goal_type: string | null;
  status?: number | null;
}

export const getGoalBucketKey = (type: GoalColumnType, date: Date): string => {
  if (type === "life") return "life";
  if (type === "year") return `year-${date.getFullYear()}`;
  if (type === "month") return `month-${date.getFullYear()}-${date.getMonth()}`;
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  return `week-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const getColumnTypeFromBucketKey = (bucketKey: string): GoalColumnType | null => {
  if (bucketKey === "life") return "life";
  if (bucketKey.startsWith("year-")) return "year";
  if (bucketKey.startsWith("month-")) return "month";
  if (bucketKey.startsWith("week-")) return "week";
  return null;
};

const getMatchingGoalForEvent = (
  goalsStore: GoalBoardStore,
  event: Pick<Event, "date" | "goalType" | "goal">
) => {
  if (!event.goalType || !event.goal || event.goal === "None") return undefined;

  const columnType = EVENT_GOAL_TYPE_TO_COLUMN[event.goalType] ?? null;
  if (!columnType) return undefined;

  const eventDate = new Date(`${event.date}T00:00:00`);
  const bucketKey = columnType === "life" ? "life" : getGoalBucketKey(columnType, eventDate);
  return goalsStore[bucketKey]?.find((item) => item.text === event.goal);
};

export function resolveGoalColorForEvent(
  goalsStore: GoalBoardStore,
  event: Pick<Event, "date" | "goalType" | "goal" | "goalColor">
): string | undefined {
  const goal = getMatchingGoalForEvent(goalsStore, event);
  if (!goal) return undefined;
  return event.goalColor || goal.color;
}

export function resolveGoalIconForEvent(
  goalsStore: GoalBoardStore,
  event: Pick<Event, "date" | "goalType" | "goal" | "goalIcon">
): string | undefined {
  const goal = getMatchingGoalForEvent(goalsStore, event);
  if (!goal) return undefined;
  return event.goalIcon || goal.icon;
}

const rowToGoalItem = (row: GoalRow): GoalBoardItem => ({
  id: row.id,
  text: row.name,
  completed: row.completed,
  notes: row.notes ?? undefined,
  color: row.color || undefined,
  icon: row.icon || undefined,
  targetValue: row.target_value,
  targetPeriod: row.target_period,
  status: row.status,
});

const buildStoreFromRows = (rows: GoalRow[]): GoalBoardStore => {
  return rows.reduce<GoalBoardStore>((acc, row) => {
    const key = row.bucket_key;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rowToGoalItem(row));
    return acc;
  }, {});
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getGoalTypeLabel = (columnType: GoalColumnType) => {
  switch (columnType) {
    case "week":
      return "Weekly";
    case "month":
      return "Monthly";
    case "year":
      return "Yearly";
    case "life":
      return "Lifetime";
  }
};

const getBucketDateRange = (bucketKey: string): { start: string; end: string } | null => {
  if (bucketKey === "life") return null;

  if (bucketKey.startsWith("week-")) {
    const [, year, month, day] = bucketKey.split("-");
    const start = new Date(Number(year), Number(month), Number(day));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: formatLocalDate(start),
      end: formatLocalDate(end),
    };
  }

  if (bucketKey.startsWith("month-")) {
    const [, year, month] = bucketKey.split("-");
    const start = new Date(Number(year), Number(month), 1);
    const end = new Date(Number(year), Number(month) + 1, 0);
    return {
      start: formatLocalDate(start),
      end: formatLocalDate(end),
    };
  }

  if (bucketKey.startsWith("year-")) {
    const [, year] = bucketKey.split("-");
    const start = new Date(Number(year), 0, 1);
    const end = new Date(Number(year), 11, 31);
    return {
      start: formatLocalDate(start),
      end: formatLocalDate(end),
    };
  }

  return null;
};

const startOfLocalDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const diffDaysInclusive = (start: Date, end: Date) => {
  const startTime = startOfLocalDay(start).getTime();
  const endTime = startOfLocalDay(end).getTime();
  return Math.max(1, Math.floor((endTime - startTime) / 86_400_000) + 1);
};

const countCoveredUnits = (start: Date, end: Date, period: Goal["targetPeriod"]) => {
  if (period === "day") return diffDaysInclusive(start, end);
  if (period === "week") return Math.max(1, Math.ceil(diffDaysInclusive(start, end) / 7));
  if (period === "month") {
    return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
  }
  return Math.max(1, end.getFullYear() - start.getFullYear() + 1);
};

const getTargetMinutesForGoalBucket = (item: GoalBoardItem, bucketKey: string) => {
  const baseMinutes = Math.max(0, item.targetValue ?? 0) * 60;
  const period = item.targetPeriod ?? "week";
  const range = getBucketDateRange(bucketKey);

  if (!range || baseMinutes === 0) return baseMinutes;

  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  return Math.max(0, baseMinutes * countCoveredUnits(start, end, period));
};

const getEventDurationMinutes = (event: GoalLinkedEventRow) => {
  if (event.is_all_day) return 0;
  if (event.end_time >= event.start_time) return event.end_time - event.start_time;
  return 1440 - event.start_time + event.end_time;
};

const eventMatchesGoalBucket = (
  event: GoalLinkedEventRow,
  goalName: string,
  goalType: string,
  bucketKey: string
) => {
  if (event.goal !== goalName || event.goal_type !== goalType) return false;

  const range = getBucketDateRange(bucketKey);
  if (!range) return true;

  return event.date >= range.start && event.date <= range.end;
};

export const useGoalsStore = create<GoalsState>((set, get) => ({
  store: {},
  userId: null,
  isLoadingCurrent: false,
  isLoadingAll: false,
  goalsError: null,
  hasPrefetchedCurrent: false,
  hasLoadedAll: false,
  pendingSyncs: new Set(),

  setStore: (store) => set({ store }),
  setGoalsError: (goalsError) => set({ goalsError }),

  clearGoals: () =>
    set({
      store: {},
      userId: null,
      isLoadingCurrent: false,
      isLoadingAll: false,
      goalsError: null,
      hasPrefetchedCurrent: false,
      hasLoadedAll: false,
      pendingSyncs: new Set(),
    }),

  fetchGoalBuckets: async (keys) => {
    const uniqueKeys = Array.from(new Set(keys)).filter(Boolean);
    if (uniqueKeys.length === 0) return;

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) {
      get().clearGoals();
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .in("bucket_key", uniqueKeys)
      .order("bucket_key", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      set({
        userId: user.id,
        goalsError: error.message,
      });
      return;
    }

    const fetchedRows = (data ?? []) as GoalRow[];
    const { pendingSyncs } = get();
    
    set((state) => {
      const nextStore = { ...state.store };
      for (const key of uniqueKeys) {
        // Map over fetched rows to preserve local pending versions where applicable
        const rowsForKey = fetchedRows.filter(r => r.bucket_key === key);
        const items = rowsForKey.map(row => {
          if (pendingSyncs.has(row.id)) {
            const local = (state.store[key] || []).find(i => i.id === row.id);
            return local || rowToGoalItem(row);
          }
          return rowToGoalItem(row);
        });

        // Also include local pending items that weren't in the fetched results (e.g. newly added)
        const fetchedIds = new Set(rowsForKey.map(r => r.id));
        const localOnlyPending = (state.store[key] || []).filter(i => pendingSyncs.has(i.id) && !fetchedIds.has(i.id));
        
        nextStore[key] = [...items, ...localOnlyPending];
      }

      return {
        store: nextStore,
        userId: user.id,
        goalsError: null,
      };
    });

    void get().syncGoalStatuses();
  },

  prefetchCurrentGoals: async (currentDate = new Date(), yearDate = currentDate) => {
    if (get().isLoadingCurrent) return;

    const currentKeys = [
      getGoalBucketKey("week", currentDate),
      getGoalBucketKey("month", currentDate),
      getGoalBucketKey("year", yearDate),
      "life",
    ];

    set({ isLoadingCurrent: true, goalsError: null });

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) {
      set({ isLoadingCurrent: false });
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .in("bucket_key", currentKeys)
      .order("bucket_key", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      set({
        userId: user.id,
        isLoadingCurrent: false,
        goalsError: error.message,
      });
      return;
    }

    const fetchedRows = (data ?? []) as GoalRow[];
    const { pendingSyncs } = get();

    set((state) => {
      const nextStore = { ...state.store };
      for (const key of currentKeys) {
        const rowsForKey = fetchedRows.filter(r => r.bucket_key === key);
        const items = rowsForKey.map(row => {
          if (pendingSyncs.has(row.id)) {
            const local = (state.store[key] || []).find(i => i.id === row.id);
            return local || rowToGoalItem(row);
          }
          return rowToGoalItem(row);
        });

        const fetchedIds = new Set(rowsForKey.map(r => r.id));
        const localOnlyPending = (state.store[key] || []).filter(i => pendingSyncs.has(i.id) && !fetchedIds.has(i.id));
        
        nextStore[key] = [...items, ...localOnlyPending];
      }

      return {
        store: nextStore,
        userId: user.id,
        isLoadingCurrent: false,
        goalsError: null,
        hasPrefetchedCurrent: true,
      };
    });

    void get().syncGoalStatuses();
  },

  fetchAllGoals: async () => {
    if (get().isLoadingAll) return;

    set({ isLoadingAll: true, goalsError: null });

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) {
      set({ isLoadingAll: false });
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("bucket_key", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      set({
        userId: user.id,
        isLoadingAll: false,
        goalsError: error.message,
      });
      return;
    }

    const fetchedRows = (data ?? []) as GoalRow[];
    const { pendingSyncs } = get();
    const fullStoreFromRows = buildStoreFromRows(fetchedRows);

    set((state) => {
      const nextStore: GoalBoardStore = {};
      
      // First, take all bucket keys from either the fetched results or the current state
      const allKeys = new Set([...Object.keys(fullStoreFromRows), ...Object.keys(state.store)]);
      
      for (const key of allKeys) {
        const rowsForKey = fetchedRows.filter(r => r.bucket_key === key);
        const items = rowsForKey.map(row => {
          if (pendingSyncs.has(row.id)) {
            const local = (state.store[key] || []).find(i => i.id === row.id);
            return local || rowToGoalItem(row);
          }
          return rowToGoalItem(row);
        });

        const fetchedIds = new Set(rowsForKey.map(r => r.id));
        const localOnlyPending = (state.store[key] || []).filter(i => pendingSyncs.has(i.id) && !fetchedIds.has(i.id));
        
        nextStore[key] = [...items, ...localOnlyPending];
      }

      return {
        store: nextStore,
        userId: user.id,
        isLoadingAll: false,
        goalsError: null,
        hasPrefetchedCurrent: true,
        hasLoadedAll: true,
      };
    });

    void get().syncGoalStatuses();
  },

  syncGoalStatuses: async () => {
    const { store } = get();
    const hasGoals = Object.values(store).some((items) => items.length > 0);
    if (!hasGoals) return;

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("events")
      .select("date, end_date, start_time, end_time, is_all_day, goal, goal_type, status")
      .eq("user_id", user.id)
      .neq("goal", "None")
      .neq("goal_type", "None");

    if (error) {
      set({ goalsError: error.message });
      return;
    }

    const goalEvents = (data ?? []) as GoalLinkedEventRow[];
    const changedRows: Array<{ id: string; status: Goal["status"]; completed: boolean }> = [];
    let didChange = false;

    const nextStore = Object.fromEntries(
      Object.entries(store).map(([bucketKey, items]) => {
        const columnType: GoalColumnType = bucketKey.startsWith("week-")
          ? "week"
          : bucketKey.startsWith("month-")
          ? "month"
          : bucketKey.startsWith("year-")
          ? "year"
          : "life";
        const goalType = getGoalTypeLabel(columnType);

        return [
          bucketKey,
          items.map((item) => {
            // Manual goals: life goals or goals with no target.
            // Also skip paused goals from auto-syncing.
            const targetMinutes = getTargetMinutesForGoalBucket(item, bucketKey);
            if (bucketKey === "life" || targetMinutes <= 0 || item.status === "paused") {
              return item;
            }

            const achievedMinutes = goalEvents.reduce((sum, event) => {
              if (event.status !== 1) return sum;
              if (!eventMatchesGoalBucket(event, item.text, goalType, bucketKey)) return sum;
              return sum + getEventDurationMinutes(event);
            }, 0);

            const isAutoCompleted = achievedMinutes >= targetMinutes;
            // A goal is completed if it was already marked as such OR if it meets the auto-completion criteria.
            // This ensures manual completions are not reset by auto-sync.
            const nextCompleted = item.completed || isAutoCompleted;
            const nextStatus: Goal["status"] = nextCompleted
              ? "completed"
              : (item.status === "completed" ? "active" : (item.status ?? "active"));

            if (item.completed !== nextCompleted || (item.status ?? "active") !== nextStatus) {
              didChange = true;
              changedRows.push({ id: item.id, status: nextStatus, completed: nextCompleted });
              return {
                ...item,
                completed: nextCompleted,
                status: nextStatus,
              };
            }

            return item;
          }),
        ];
      })
    ) as GoalBoardStore;

    if (!didChange) return;

    set({ store: nextStore, goalsError: null });

    await Promise.all(
      changedRows.map((row) =>
        supabase
          .from("goals")
          .update({ status: row.status, completed: row.completed })
          .eq("user_id", user.id)
          .eq("id", row.id)
      )
    );
  },

  addGoal: async (bucketKey, text) => {
    const id = crypto.randomUUID();
    const newGoal: GoalBoardItem = { id, text, completed: false, status: "active", targetValue: 0, targetPeriod: "week" };
    
    set(state => ({
      store: {
        ...state.store,
        [bucketKey]: [...(state.store[bucketKey] || []), newGoal]
      },
      pendingSyncs: new Set(state.pendingSyncs).add(id)
    }));

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return id;

    const columnType = getColumnTypeFromBucketKey(bucketKey) || "week";
    const sortOrder = get().store[bucketKey]?.length || 0;

    const row: GoalWriteRow = {
      id,
      user_id: user.id,
      name: text,
      notes: null,
      color: "",
      icon: "",
      target_value: 1,
      target_period: "week",
      status: "active",
      completed: false,
      column_type: columnType,
      bucket_key: bucketKey,
      sort_order: sortOrder,
    };
    const { error } = await supabase.from("goals").insert([row]);
    
    set(state => {
      const nextPending = new Set(state.pendingSyncs);
      nextPending.delete(id);
      return { pendingSyncs: nextPending };
    });

    if (error) console.error("Failed to add goal", error);
    return id;
  },

  updateGoal: async (bucketKey, goalId, updates) => {
    set(state => ({
      store: {
        ...state.store,
        [bucketKey]: (state.store[bucketKey] || []).map(g => g.id === goalId ? { ...g, ...updates } : g)
      },
      pendingSyncs: new Set(state.pendingSyncs).add(goalId)
    }));

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    // Build update object with only defined fields to avoid overwriting with undefined
    const supabaseUpdates: Record<string, unknown> = {};
    if (updates.text !== undefined) supabaseUpdates.name = updates.text;
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes;
    if (updates.color !== undefined) supabaseUpdates.color = updates.color;
    if (updates.icon !== undefined) supabaseUpdates.icon = updates.icon;
    if (updates.targetValue !== undefined) supabaseUpdates.target_value = updates.targetValue;
    if (updates.targetPeriod !== undefined) supabaseUpdates.target_period = updates.targetPeriod;
    if (updates.status !== undefined) supabaseUpdates.status = updates.status;
    if (updates.completed !== undefined) supabaseUpdates.completed = updates.completed;

    if (Object.keys(supabaseUpdates).length === 0) {
      set(state => {
        const nextPending = new Set(state.pendingSyncs);
        nextPending.delete(goalId);
        return { pendingSyncs: nextPending };
      });
      return;
    }

    const { error } = await supabase
      .from("goals")
      .update(supabaseUpdates)
      .eq("id", goalId)
      .eq("user_id", user.id);

    set(state => {
      const nextPending = new Set(state.pendingSyncs);
      nextPending.delete(goalId);
      return { pendingSyncs: nextPending };
    });

    if (error) console.error("Failed to update goal", error);
  },

  deleteGoal: async (bucketKey, goalId) => {
    const items = get().store[bucketKey] || [];
    const goalToDelete = items.find(g => g.id === goalId);
    const goalName = goalToDelete?.text;

    set(state => ({
      store: {
        ...state.store,
        [bucketKey]: (state.store[bucketKey] || []).filter(g => g.id !== goalId)
      },
      pendingSyncs: new Set(state.pendingSyncs).add(goalId)
    }));

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    // 1. Delete the goal itself
    const { error: deleteError } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", user.id);

    // 2. If the goal had a name, clean up any events referencing it
    if (goalName && !deleteError) {
      const columnType = getColumnTypeFromBucketKey(bucketKey) || "week";
      const goalTypeLabel = getGoalTypeLabel(columnType);

      await supabase
        .from("events")
        .update({
          goal: "None",
          goal_type: "None",
          goal_color: null,
          goal_icon: null
        })
        .eq("user_id", user.id)
        .eq("goal", goalName)
        .eq("goal_type", goalTypeLabel);
      
      // 3. Sync local events store
      const { useEventsStore } = await import("@/store/eventsStore");
      useEventsStore.getState().syncEventsWithDeletedGoal(goalName, goalTypeLabel);
    }

    set(state => {
      const nextPending = new Set(state.pendingSyncs);
      nextPending.delete(goalId);
      return { pendingSyncs: nextPending };
    });

    if (deleteError) console.error("Failed to delete goal", deleteError);
  },

  reorderGoals: async (bucketKey, goalIds) => {
    const items = get().store[bucketKey] || [];
    const reordered = goalIds.map(id => items.find(i => i.id === id)!).filter(Boolean);
    
    set(state => ({
      store: { ...state.store, [bucketKey]: reordered }
    }));

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    const columnType = getColumnTypeFromBucketKey(bucketKey) || "week";
    const updates: GoalWriteRow[] = reordered.map((item, index) => ({
      id: item.id,
      user_id: user.id,
      name: item.text,
      notes: item.notes ?? null,
      color: item.color ?? "",
      icon: item.icon ?? "",
      target_value: item.targetValue ?? 1,
      target_period: item.targetPeriod ?? "week",
      status: item.status ?? "active",
      completed: item.completed,
      column_type: columnType,
      bucket_key: bucketKey,
      sort_order: index,
    }));

    const { error } = await supabase.from("goals").upsert(updates, { onConflict: "id" });
    if (error) console.error("Failed to reorder goals", error);
  },

  moveGoal: async (fromBucketKey, toBucketKey, goalId, targetIndex) => {
    const fromItems = get().store[fromBucketKey] || [];
    const item = fromItems.find(i => i.id === goalId);
    if (!item) return;

    const nextFromItems = fromItems.filter(i => i.id !== goalId);
    const nextToItems = [...(get().store[toBucketKey] || [])];
    
    if (targetIndex !== undefined) {
      nextToItems.splice(targetIndex, 0, item);
    } else {
      nextToItems.push(item);
    }

    set(state => ({
      store: {
        ...state.store,
        [fromBucketKey]: nextFromItems,
        [toBucketKey]: nextToItems,
      }
    }));

    const { data: { session } } = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    const columnType = getColumnTypeFromBucketKey(toBucketKey) || "week";

    const { error } = await supabase
      .from("goals")
      .update({
        bucket_key: toBucketKey,
        column_type: columnType,
        sort_order: targetIndex ?? nextToItems.length - 1
      })
      .eq("id", goalId)
      .eq("user_id", user.id);

    if (error) console.error("Failed to move goal", error);

    void get().reorderGoals(fromBucketKey, nextFromItems.map(i => i.id));
    void get().reorderGoals(toBucketKey, nextToItems.map(i => i.id));
  },
}));
