import { useMemo, useEffect } from "react";
import { computeStreak } from "@/lib/streak-mock";
import { AnalysisHero } from "./AnalysisHero";
import { GoalProgressTracker } from "./GoalProgressTracker";
import { DayBarGraph } from "./DayBarGraph";
import { WeekGraph } from "./WeekGraph";
import { MonthGraph } from "./MonthGraph";
import { YearGraph } from "./YearGraph";
import { useSubscription } from "@/hooks/useSubscription";
import { useAnalysisStore } from "@/store/analysisStore";

export default function AnalysisView() {
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription(true);
  const events = useAnalysisStore((state) => state.events);
  const hasLoaded = useAnalysisStore((state) => state.hasLoaded);
  const fetchAnalysisEvents = useAnalysisStore((state) => state.fetchAnalysisEvents);
  const displayEvents = hasLoaded ? events : [];
  const streakDays = useMemo(() => new Set(displayEvents.map((event) => event.date)), [displayEvents]);

  useEffect(() => {
    if (isSubscriptionLoading) return;
    void fetchAnalysisEvents({ rangeDays: isPro ? 120 : 30 });
  }, [fetchAnalysisEvents, isPro, isSubscriptionLoading]);

  const { current, longest } = useMemo(() => computeStreak(displayEvents), [displayEvents]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-[1800px] px-3 sm:px-5 pb-24 sm:pb-16 pt-16 sm:pt-28">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5">
              <AnalysisHero
                current={current}
                longest={longest}
                streakDays={streakDays}
              />
            </div>
            {hasLoaded ? (
              <GoalProgressTracker events={displayEvents} isPro={isPro} />
            ) : (
              <div className="card-soft h-[206px] animate-pulse bg-gray-100/70" />
            )}
            </div>

          <div className="flex flex-col gap-5">
            {hasLoaded ? (
              <>
                <DayBarGraph events={displayEvents} navigationDisabled={!isPro} />
                <WeekGraph events={displayEvents} navigationDisabled={!isPro} />
                <MonthGraph events={displayEvents} navigationDisabled={!isPro} />
                <YearGraph events={displayEvents} navigationDisabled={!isPro} />
              </>
            ) : (
              <>
                <div className="card-soft h-[332px] animate-pulse bg-gray-100/70" />
                <div className="card-soft h-[320px] animate-pulse bg-gray-100/70" />
                <div className="card-soft h-[320px] animate-pulse bg-gray-100/70" />
                <div className="card-soft h-[320px] animate-pulse bg-gray-100/70" />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
