import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase, getSafeSession } from "@/lib/supabase";
import type { RawEvent } from "@/lib/streak-mock";

type AnalysisStore = {
  events: RawEvent[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  fetchedUserId: string | null;
  fetchedThroughDate: string | null;
  fetchedRangeDays: number;
  fetchAnalysisEvents: (options?: { rangeDays?: number; throughDate?: Date; force?: boolean }) => Promise<void>;
  clearAnalysis: () => void;
};

function mapEventStatus(status?: number): RawEvent["status"] {
  return status === 1 ? "done" : "pending";
}

function toIsoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist((set, get) => ({
  events: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  fetchedUserId: null,
  fetchedThroughDate: null,
  fetchedRangeDays: 0,

  fetchAnalysisEvents: async (options) => {
    const rangeDays = options?.rangeDays ?? 120;
    const throughDate = options?.throughDate ? new Date(options.throughDate) : new Date();
    throughDate.setHours(0, 0, 0, 0);
    const throughDateKey = toIsoDate(throughDate);

    const { data: { session } } = await getSafeSession();
        const user = session?.user;

        if (!user)
 {
      set({
        events: [],
        isLoading: false,
        hasLoaded: false,
        error: "User not authenticated",
        fetchedUserId: null,
        fetchedThroughDate: null,
        fetchedRangeDays: 0,
      });
      return;
    }

    const current = get();
    const isCovered =
      current.hasLoaded &&
      current.fetchedUserId === user.id &&
      current.fetchedThroughDate === throughDateKey &&
      current.fetchedRangeDays >= rangeDays;

    if (current.isLoading) {
      return;
    }

    if (!options?.force && isCovered) {
      return;
    }

    set({ events: [], hasLoaded: false, isLoading: true, error: null });

    const startDate = new Date(throughDate);
    startDate.setDate(throughDate.getDate() - rangeDays);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", toIsoDate(startDate))
      .lte("date", throughDateKey)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      set({
        isLoading: false,
        hasLoaded: false,
        error: error.message,
      });
      return;
    }

    const seen = new Map<string, RawEvent>();
    for (const row of data ?? []) {
      const key = `${row.date}|${row.start_time}|${row.end_time}|${row.title}`;
      if (!seen.has(key)) {
        seen.set(key, {
          id: row.id,
          title: row.title,
          date: row.date,
          start_time: row.start_time,
          end_time: row.end_time,
          is_all_day: row.is_all_day ?? undefined,
          goal: row.goal ?? undefined,
          goalType: row.goal_type ?? undefined,
          status: mapEventStatus(row.status),
        });
      }
    }

    set({
      events: [...seen.values()],
      isLoading: false,
      hasLoaded: true,
      error: null,
      fetchedUserId: user.id,
      fetchedThroughDate: throughDateKey,
      fetchedRangeDays: rangeDays,
    });
  },

  clearAnalysis: () =>
    set({
      events: [],
      isLoading: false,
      hasLoaded: false,
      error: null,
      fetchedUserId: null,
      fetchedThroughDate: null,
      fetchedRangeDays: 0,
    }),
  }), {
    name: "analysis-store",
    partialize: (state) => ({
      events: state.events,
      hasLoaded: state.hasLoaded,
      fetchedUserId: state.fetchedUserId,
      fetchedThroughDate: state.fetchedThroughDate,
      fetchedRangeDays: state.fetchedRangeDays,
    }),
  })
);
