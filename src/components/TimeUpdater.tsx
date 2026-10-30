import { useEffect, useRef } from "react";
import { useTimeStore } from "@/store/timeStore";
import { useEventsStore } from "@/store/eventsStore";
import { useGoalsStore } from "@/store/goalsStore";
import { useAnalysisStore } from "@/store/analysisStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuthStore } from "@/store/authStore";

export default function TimeUpdater() {
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription(true);
  const updateTime = useTimeStore((state) => state.updateTime);
  const eventsCache = useEventsStore((state) => state.eventsCache);
  const syncGoalStatuses = useGoalsStore((state) => state.syncGoalStatuses);
  const { session, isAuthenticated } = useAuthStore();
  const lastUserIdRef = useRef<string | null>(null);
  const lastTickRef = useRef<Date>(new Date());

  useEffect(() => {
    if (!isAuthenticated) return;

    // Update immediately on mount
    updateTime();
    void useEventsStore.getState().autoCompletePastEvents(new Date());

    // Check every 15 seconds but only update when minute changes
    const intervalId = setInterval(() => {
      const now = new Date();
      const previousNow = lastTickRef.current;
      const currentMinute = now.getMinutes();
      const previousMinute = previousNow.getMinutes();
      const didDayChange =
        now.getFullYear() !== previousNow.getFullYear() ||
        now.getMonth() !== previousNow.getMonth() ||
        now.getDate() !== previousNow.getDate();
      
      if (currentMinute !== previousMinute || didDayChange) {
        updateTime(previousNow);
        void useEventsStore.getState().autoCompletePastEvents(now);

        if (didDayChange) {
          useEventsStore.getState().fetchEventsWindow(now);
          void useGoalsStore.getState().prefetchCurrentGoals(now, now);
        }

        lastTickRef.current = now;
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [updateTime, isAuthenticated]);

  // Handle data fetching on auth state changes
  useEffect(() => {
    if (!isAuthenticated || !session?.user) {
      if (lastUserIdRef.current) {
        // Just signed out
        useEventsStore.getState().clearCache();
        useGoalsStore.getState().clearGoals();
        useAnalysisStore.getState().clearAnalysis();
        useTimeStore.getState().clearDate();
        lastUserIdRef.current = null;
      }
      return;
    }

    const userId = session.user.id;
    const isNewUser = userId !== lastUserIdRef.current;
    lastUserIdRef.current = userId;

    const today = new Date();
    
    // Trigger fetches for the current session/user
    void useEventsStore.getState().fetchEventsWindow(today);
    void useGoalsStore.getState().prefetchCurrentGoals(today, today);
    void useEventsStore.getState().autoCompletePastEvents(today);
    
    if (!isSubscriptionLoading) {
      void useAnalysisStore.getState().fetchAnalysisEvents({ 
        force: isNewUser, 
        rangeDays: isPro ? 120 : 30 
      });
    }
  }, [session, isAuthenticated, isPro, isSubscriptionLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      void syncGoalStatuses();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [eventsCache, syncGoalStatuses, isAuthenticated]);

  return null;
}
