import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { isoDate, minsToHuman, type RawEvent } from "@/lib/streak-mock";
import { motion, AnimatePresence } from "framer-motion";
import { PeriodNavigator } from "./PeriodNavigator";
import { getGoalBucketKey, useGoalsStore, type GoalBoardItem, type GoalColumnType } from "@/store/goalsStore";

const sectionIcons: Record<ScopeKey, string> = {
  week: "/weeklyGoals.png",
  month: "/monthlyGoals.png",
  year: "/yearlyGoals.png",
  life: "/lifeGoals.png",
};

type GoalAgg = {
  name: string;
  status: GoalBoardItem["status"];
  totalMinutes: number;
  doneMinutes: number;
  targetMinutes: number;
  pct: number;
  visualPct: number;
  previousDoneMinutes: number;
  targetPeriod: GoalBoardItem["targetPeriod"];
  monthWeeks: {
    label: string;
    startISO: string;
    endISO: string;
    doneMinutes: number;
    targetMinutes: number;
    pct: number;
  }[];
  yearMonths: {
    label: string;
    monthLabel: string;
    startISO: string;
    endISO: string;
    doneMinutes: number;
    targetMinutes: number;
    pct: number;
    weeks: {
      label: string;
      startISO: string;
      endISO: string;
      doneMinutes: number;
      targetMinutes: number;
      pct: number;
    }[];
  }[];
  lifeYears: {
    label: string;
    yearLabel: string;
    startISO: string;
    endISO: string;
    doneMinutes: number;
    targetMinutes: number;
    pct: number;
    months: {
      label: string;
      monthLabel: string;
      startISO: string;
      endISO: string;
      doneMinutes: number;
      targetMinutes: number;
      pct: number;
      weeks: {
        label: string;
        startISO: string;
        endISO: string;
        doneMinutes: number;
        targetMinutes: number;
        pct: number;
      }[];
    }[];
  }[];
  recent: RawEvent[];
};

type ScopeKey = "week" | "month" | "year" | "life";

type ScopeSection = {
  key: ScopeKey;
  title: string;
  label: string;
  emptyMessage: string;
  goals: GoalAgg[];
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
};

function startOfSundayWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function endOfSaturdayWeek(date: Date) {
  const next = startOfSundayWeek(date);
  next.setDate(next.getDate() + 6);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function formatRangeLabel(start: Date, end: Date) {
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatDayRangeLabel(startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString(undefined, { month: "short" })}`;
}

function findCurrentWeekIndex<T extends { startISO: string; endISO: string }>(items: T[]) {
  const todayISO = isoDate(new Date());
  return items.findIndex((item) => item.startISO <= todayISO && item.endISO >= todayISO);
}

function sumDoneMinutesForRange(events: RawEvent[], startISO: string, endISO: string) {
  return events.reduce((sum, event) => {
    if (event.status !== "done") return sum;
    if (event.date < startISO || event.date > endISO) return sum;
    return sum + (event.is_all_day ? 0 : Math.max(0, event.end_time - event.start_time));
  }, 0);
}

function computeTargetMinutesForRange(
  targetValue: number,
  targetPeriod: GoalBoardItem["targetPeriod"],
  start: Date,
  end: Date,
) {
  const units = countCoveredUnits(start, end, targetPeriod);
  return Math.max(0, targetValue * units * 60);
}

function computeWeekBreakdownTargetMinutes(
  targetValue: number,
  targetPeriod: GoalBoardItem["targetPeriod"],
  weekStart: Date,
  weekEnd: Date,
) {
  if (targetPeriod === "month") {
    const days = diffDaysInclusive(weekStart, weekEnd);
    return Math.max(0, (targetValue * (days / 30.44)) * 60);
  }

  return computeTargetMinutesForRange(targetValue, targetPeriod, weekStart, weekEnd);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function diffDaysInclusive(start: Date, end: Date) {
  const startTime = startOfDay(start).getTime();
  const endTime = startOfDay(end).getTime();
  return Math.max(1, Math.floor((endTime - startTime) / 86_400_000) + 1);
}

function countCoveredUnits(start: Date, end: Date, period: GoalBoardItem["targetPeriod"]) {
  const days = diffDaysInclusive(start, end);
  if (period === "day") return days;
  if (period === "week") return days / 7;
  if (period === "month") {
    // Precise month count
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    const totalMonths = yearDiff * 12 + monthDiff;
    
    // Day portion
    const startDay = start.getDate();
    const endDay = end.getDate();
    const daysInEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    
    if (endDay >= startDay) {
      return totalMonths + (endDay - startDay + 1) / 30.44;
    }
    return totalMonths - 1 + (daysInEndMonth - startDay + endDay + 1) / 30.44;
  }
  return days / 365.25;
}

function goalTypeToColumnType(goalType: RawEvent["goalType"]): GoalColumnType | null {
  if (goalType === "Weekly") return "week";
  if (goalType === "Monthly") return "month";
  if (goalType === "Yearly") return "year";
  if (goalType === "Lifetime") return "life";
  return null;
}

function getGoalConfigForEvent(
  goalsStore: ReturnType<typeof useGoalsStore.getState>["store"],
  event: RawEvent
) {
  const columnType = goalTypeToColumnType(event.goalType);
  if (!columnType || !event.goal) return null;

  const eventDate = new Date(`${event.date}T00:00:00`);
  const bucketKey = columnType === "life" ? "life" : getGoalBucketKey(columnType, eventDate);
  return goalsStore[bucketKey]?.find((item) => item.text === event.goal) ?? null;
}

function buildGoalsForScope(
  events: RawEvent[],
  startISO: string | null,
  endISO: string | null,
  goalType: RawEvent["goalType"],
  goalsStore: ReturnType<typeof useGoalsStore.getState>["store"],
  scopeKey: ScopeKey,
  scopeStart: Date | null,
  scopeEnd: Date | null,
) {
  const map = new Map<string, GoalAgg>();
  let previousStartISO: string | null = null;
  let previousEndISO: string | null = null;

  if (scopeKey === "week" && scopeStart && scopeEnd) {
    const prevStart = new Date(scopeStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(scopeEnd);
    prevEnd.setDate(prevEnd.getDate() - 7);
    previousStartISO = isoDate(prevStart);
    previousEndISO = isoDate(prevEnd);
  } else if (scopeKey === "month" && scopeStart) {
    const prevStart = new Date(scopeStart.getFullYear(), scopeStart.getMonth() - 1, 1);
    const prevEnd = endOfMonth(prevStart);
    previousStartISO = isoDate(prevStart);
    previousEndISO = isoDate(prevEnd);
  } else if (scopeKey === "year" && scopeStart) {
    const prevStart = new Date(scopeStart.getFullYear() - 1, 0, 1);
    const prevEnd = endOfYear(prevStart);
    previousStartISO = isoDate(prevStart);
    previousEndISO = isoDate(prevEnd);
  }

  for (const event of events) {
    if (!event.goal || event.goal === "None") continue;
    if (goalType && event.goalType !== goalType) continue;

    const isInCurrentRange = (!startISO || event.date >= startISO) && (!endISO || event.date <= endISO);
    const isInPreviousRange = (!!previousStartISO && !!previousEndISO && event.date >= previousStartISO && event.date <= previousEndISO);
    if (!isInCurrentRange && !isInPreviousRange) continue;

    const duration = event.is_all_day ? 0 : Math.max(0, event.end_time - event.start_time);
    const goalConfig = getGoalConfigForEvent(goalsStore, event);
    const current = map.get(event.goal) ?? {
      name: event.goal,
      status: goalConfig?.status ?? "active",
      totalMinutes: 0,
      doneMinutes: 0,
      targetMinutes: Math.max(0, (goalConfig?.targetValue ?? 1) * 60),
      pct: 0,
      visualPct: 0,
      previousDoneMinutes: 0,
      targetPeriod: goalConfig?.targetPeriod ?? "week",
      monthWeeks: [],
      yearMonths: [],
      lifeYears: [],
      recent: [],
    };

    if (isInCurrentRange) {
      current.totalMinutes += duration;
      if (event.status === "done") current.doneMinutes += duration;
      current.recent.push(event);
    } else if (isInPreviousRange && event.status === "done") {
      current.previousDoneMinutes += duration;
    }

    map.set(event.goal, current);
  }

  const goals = [...map.values()].filter((goal) => goal.recent.length > 0);
  for (const goal of goals) {
    const goalEvent = goal.recent[0];
    const goalConfig = goalEvent ? getGoalConfigForEvent(goalsStore, goalEvent) : null;
    const targetPeriod = goalConfig?.targetPeriod ?? (
      goalType === "Weekly" ? "week" :
      goalType === "Monthly" ? "month" :
      goalType === "Yearly" ? "year" :
      "year"
    );
    const targetValue = goalConfig?.targetValue ?? 1;
    goal.targetPeriod = targetPeriod;
    goal.status = goalConfig?.status ?? goal.status ?? "active";

    let effectiveStart = scopeStart;
    let effectiveEnd = scopeEnd;
    if (scopeKey === "life" || !effectiveStart || !effectiveEnd) {
      const orderedDates = goal.recent
        .map((event) => new Date(`${event.date}T00:00:00`))
        .sort((a, b) => a.getTime() - b.getTime());
      effectiveStart = orderedDates[0] ?? null;
      effectiveEnd = orderedDates[orderedDates.length - 1] ?? effectiveStart;
    }

    goal.targetMinutes = effectiveStart && effectiveEnd
      ? computeTargetMinutesForRange(targetValue, targetPeriod, effectiveStart, effectiveEnd)
      : 0;
    goal.pct = goal.targetMinutes > 0 ? Math.round((goal.doneMinutes / goal.targetMinutes) * 100) : 0;
    goal.visualPct = Math.min(100, Math.max(0, goal.pct));
    goal.recent.sort((a, b) => b.date.localeCompare(a.date) || b.start_time - a.start_time);

    if (scopeKey === "month" && scopeStart && scopeEnd) {
      const weekBuckets: GoalAgg["monthWeeks"] = [];
      let cursor = startOfSundayWeek(scopeStart);

      while (cursor <= scopeEnd) {
        const weekStart = new Date(cursor);
        const weekEnd = endOfSaturdayWeek(cursor);
        
        const visibleWeekStart = weekStart < scopeStart ? scopeStart : weekStart;
        const visibleWeekEnd = weekEnd > scopeEnd ? scopeEnd : weekEnd;
        
        const weekStartISO = isoDate(visibleWeekStart);
        const weekEndISO = isoDate(visibleWeekEnd);
        const doneMinutes = sumDoneMinutesForRange(goal.recent, weekStartISO, weekEndISO);
        const weekTargetMinutes = computeWeekBreakdownTargetMinutes(targetValue, targetPeriod, visibleWeekStart, visibleWeekEnd);

        weekBuckets.push({
          label: formatRangeLabel(visibleWeekStart, visibleWeekEnd),
          startISO: weekStartISO,
          endISO: weekEndISO,
          doneMinutes,
          targetMinutes: weekTargetMinutes,
          pct: weekTargetMinutes > 0 ? Math.round((doneMinutes / weekTargetMinutes) * 100) : 0,
        });

        cursor = new Date(weekStart);
        cursor.setDate(cursor.getDate() + 7);
      }

      goal.monthWeeks = weekBuckets;
    }

    if (scopeKey === "year" && scopeStart && scopeEnd) {
      const monthBuckets: GoalAgg["yearMonths"] = [];

      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const monthStart = new Date(scopeStart.getFullYear(), monthIndex, 1);
        const monthEnd = endOfMonth(monthStart);
        if (monthStart > scopeEnd) break;

        const monthStartISO = isoDate(monthStart);
        const monthEndISO = isoDate(monthEnd);
        const monthDoneMinutes = sumDoneMinutesForRange(goal.recent, monthStartISO, monthEndISO);
        const monthTargetMinutes = computeTargetMinutesForRange(targetValue, targetPeriod, monthStart, monthEnd);

        const weeks: GoalAgg["yearMonths"][number]["weeks"] = [];
        let weekCursor = startOfSundayWeek(monthStart);

        while (weekCursor <= monthEnd) {
          const weekStart = new Date(weekCursor);
          const weekEnd = endOfSaturdayWeek(weekCursor);
          const visibleWeekStart = weekStart < monthStart ? monthStart : weekStart;
          const visibleWeekEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
          const weekStartISO = isoDate(visibleWeekStart);
          const weekEndISO = isoDate(visibleWeekEnd);
          const weekDoneMinutes = sumDoneMinutesForRange(goal.recent, weekStartISO, weekEndISO);
          const weekTargetMinutes = computeWeekBreakdownTargetMinutes(targetValue, targetPeriod, visibleWeekStart, visibleWeekEnd);

          weeks.push({
            label: formatRangeLabel(visibleWeekStart, visibleWeekEnd),
            startISO: weekStartISO,
            endISO: weekEndISO,
            doneMinutes: weekDoneMinutes,
            targetMinutes: weekTargetMinutes,
            pct: weekTargetMinutes > 0 ? Math.round((weekDoneMinutes / weekTargetMinutes) * 100) : 0,
          });

          weekCursor = new Date(weekStart);
          weekCursor.setDate(weekCursor.getDate() + 7);
        }

        monthBuckets.push({
          label: monthStart.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
          monthLabel: monthStart.toLocaleDateString(undefined, { month: "long" }),
          startISO: monthStartISO,
          endISO: monthEndISO,
          doneMinutes: monthDoneMinutes,
          targetMinutes: monthTargetMinutes,
          pct: monthTargetMinutes > 0 ? Math.round((monthDoneMinutes / monthTargetMinutes) * 100) : 0,
          weeks,
        });
      }

      goal.yearMonths = monthBuckets;
    }

    if (scopeKey === "life" && effectiveStart && effectiveEnd) {
      const yearBuckets: GoalAgg["lifeYears"] = [];
      const today = new Date();
      const startYear = Math.min(effectiveStart.getFullYear(), today.getFullYear() - 10);
      const endYear = effectiveEnd.getFullYear();
      const displayEndYear = Math.max(endYear, today.getFullYear() + 10);

      for (let year = startYear; year <= displayEndYear; year += 1) {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        const yearStartISO = isoDate(yearStart);
        const yearEndISO = isoDate(yearEnd);
        const yearDoneMinutes = sumDoneMinutesForRange(goal.recent, yearStartISO, yearEndISO);
        const yearTargetMinutes = computeTargetMinutesForRange(targetValue, targetPeriod, yearStart, yearEnd);

        const months: GoalAgg["lifeYears"][number]["months"] = [];
        const firstMonth = 0;
        const lastMonth = 11;

        for (let monthIndex = firstMonth; monthIndex <= lastMonth; monthIndex += 1) {
          const rawMonthStart = new Date(year, monthIndex, 1);
          const rawMonthEnd = endOfMonth(rawMonthStart);
          const monthStart = rawMonthStart;
          const monthEnd = rawMonthEnd;
          const monthStartISO = isoDate(monthStart);
          const monthEndISO = isoDate(monthEnd);
          const monthDoneMinutes = sumDoneMinutesForRange(goal.recent, monthStartISO, monthEndISO);
          const monthTargetMinutes = computeTargetMinutesForRange(targetValue, targetPeriod, monthStart, monthEnd);

          const weeks: GoalAgg["lifeYears"][number]["months"][number]["weeks"] = [];
          let weekCursor = startOfSundayWeek(monthStart);

          while (weekCursor <= monthEnd) {
            const weekStart = new Date(weekCursor);
            const weekEnd = endOfSaturdayWeek(weekCursor);
            const visibleWeekStart = weekStart < monthStart ? monthStart : weekStart;
            const visibleWeekEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
            const weekStartISO = isoDate(visibleWeekStart);
            const weekEndISO = isoDate(visibleWeekEnd);
            const weekDoneMinutes = sumDoneMinutesForRange(goal.recent, weekStartISO, weekEndISO);
            const weekTargetMinutes = computeWeekBreakdownTargetMinutes(targetValue, targetPeriod, visibleWeekStart, visibleWeekEnd);

            weeks.push({
              label: formatRangeLabel(visibleWeekStart, visibleWeekEnd),
              startISO: weekStartISO,
              endISO: weekEndISO,
              doneMinutes: weekDoneMinutes,
              targetMinutes: weekTargetMinutes,
              pct: weekTargetMinutes > 0 ? Math.round((weekDoneMinutes / weekTargetMinutes) * 100) : 0,
            });

            weekCursor = new Date(weekStart);
            weekCursor.setDate(weekCursor.getDate() + 7);
          }

          months.push({
            label: rawMonthStart.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
            monthLabel: rawMonthStart.toLocaleDateString(undefined, { month: "long" }),
            startISO: monthStartISO,
            endISO: monthEndISO,
            doneMinutes: monthDoneMinutes,
            targetMinutes: monthTargetMinutes,
            pct: monthTargetMinutes > 0 ? Math.round((monthDoneMinutes / monthTargetMinutes) * 100) : 0,
            weeks,
          });
        }

        yearBuckets.push({
          label: `${year}`,
          yearLabel: `${year}`,
          startISO: yearStartISO,
          endISO: yearEndISO,
          doneMinutes: yearDoneMinutes,
          targetMinutes: yearTargetMinutes,
          pct: yearTargetMinutes > 0 ? Math.round((yearDoneMinutes / yearTargetMinutes) * 100) : 0,
          months,
        });
      }

      goal.lifeYears = yearBuckets;
      const totalEndYear = Math.max(endYear, today.getFullYear());
      goal.targetMinutes = yearBuckets.reduce((sum, year) => {
        const bucketYear = Number.parseInt(year.yearLabel, 10);
        return bucketYear <= totalEndYear ? sum + year.targetMinutes : sum;
      }, 0);
      goal.pct = goal.targetMinutes > 0 ? Math.round((goal.doneMinutes / goal.targetMinutes) * 100) : 0;
      goal.visualPct = Math.min(100, Math.max(0, goal.pct));
    }
  }

  return goals.sort((a, b) => b.pct - a.pct || b.doneMinutes - a.doneMinutes).slice(0, 6);
}

export function GoalProgressTracker({ events, isPro }: { events: RawEvent[]; isPro: boolean }) {
  const goalsStore = useGoalsStore((state) => state.store);
  const [scopeDates, setScopeDates] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      week: new Date(today),
      month: new Date(today),
      year: new Date(today),
    };
  });

  const sections = useMemo<ScopeSection[]>(() => {
    const weekStart = startOfSundayWeek(scopeDates.week);
    const weekEnd = endOfSaturdayWeek(scopeDates.week);
    const monthStart = startOfMonth(scopeDates.month);
    const monthEnd = endOfMonth(scopeDates.month);
    const yearStart = startOfYear(scopeDates.year);
    const yearEnd = endOfYear(scopeDates.year);

    const resetToday = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    };

    return [
      {
        key: "week",
        title: "Weekly Goal Progress",
        label: formatRangeLabel(weekStart, weekEnd),
        emptyMessage: "No weekly goal activity in this week yet.",
        goals: buildGoalsForScope(events, isoDate(weekStart), isoDate(weekEnd), "Weekly", goalsStore, "week", weekStart, weekEnd),
        onPrev: () => setScopeDates((prev) => ({ ...prev, week: new Date(prev.week.getFullYear(), prev.week.getMonth(), prev.week.getDate() - 7) })),
        onNext: () => setScopeDates((prev) => ({ ...prev, week: new Date(prev.week.getFullYear(), prev.week.getMonth(), prev.week.getDate() + 7) })),
        onToday: () => setScopeDates((prev) => ({ ...prev, week: resetToday() })),
      },
      {
        key: "month",
        title: "Monthly Goal Progress",
        label: scopeDates.month.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        emptyMessage: "No monthly goal activity in this month yet.",
        goals: buildGoalsForScope(events, isoDate(monthStart), isoDate(monthEnd), "Monthly", goalsStore, "month", monthStart, monthEnd),
        onPrev: () => setScopeDates((prev) => ({ ...prev, month: new Date(prev.month.getFullYear(), prev.month.getMonth() - 1, 1) })),
        onNext: () => setScopeDates((prev) => ({ ...prev, month: new Date(prev.month.getFullYear(), prev.month.getMonth() + 1, 1) })),
        onToday: () => setScopeDates((prev) => ({ ...prev, month: resetToday() })),
      },
      {
        key: "year",
        title: "Yearly Goal Progress",
        label: scopeDates.year.toLocaleDateString(undefined, { year: "numeric" }),
        emptyMessage: "No yearly goal activity in this year yet.",
        goals: buildGoalsForScope(events, isoDate(yearStart), isoDate(yearEnd), "Yearly", goalsStore, "year", yearStart, yearEnd),
        onPrev: () => setScopeDates((prev) => ({ ...prev, year: new Date(prev.year.getFullYear() - 1, 0, 1) })),
        onNext: () => setScopeDates((prev) => ({ ...prev, year: new Date(prev.year.getFullYear() + 1, 0, 1) })),
        onToday: () => setScopeDates((prev) => ({ ...prev, year: resetToday() })),
      },
      {
        key: "life",
        title: "Lifetime Goal Progress",
        label: "All Time",
        emptyMessage: "No lifetime goal activity yet.",
        goals: buildGoalsForScope(events, null, null, "Lifetime", goalsStore, "life", null, null),
      },
    ];
  }, [events, goalsStore, scopeDates]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section
          key={section.key}
          className="card-soft p-8 md:p-12"
        >
          <header className="mb-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100/50 p-1 shadow-sm">
                <img
                  src={sectionIcons[section.key]}
                  alt={section.title}
                  className="h-20 w-20 object-contain"
                />
              </div>
              <h2 className="whitespace-nowrap text-2xl font-bold tracking-tight text-gray-900">{section.title}</h2>
            </div>
            {section.onPrev && section.onNext && section.onToday ? (
              <PeriodNavigator
                label={section.label}
                onPrev={section.onPrev}
                onNext={section.onNext}
                onToday={section.onToday}
              />
            ) : (
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400">{section.label}</span>
            )}
          </header>

          <ul className="flex flex-col gap-3">
            {section.goals.map((goal) => {
              const openKey = `${section.key}:${goal.name}`;
              return (
                <GoalRow
                  key={openKey}
                  goal={goal}
                  scopeKey={section.key}
                  open={open === openKey}
                  isPro={isPro}
                  onToggle={() => setOpen(open === openKey ? null : openKey)}
                />
              );
            })}
            {section.goals.length === 0 && (
              <li className="py-12 text-center card-soft border-dashed bg-transparent shadow-none">
                <p className="text-sm font-medium text-gray-400">{section.emptyMessage}</p>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GoalRow({ goal, scopeKey, open, onToggle, isPro }: { goal: GoalAgg; scopeKey: ScopeKey; open: boolean; onToggle: () => void; isPro: boolean }) {
  const [selectedMonthWeekIndex, setSelectedMonthWeekIndex] = useState(0);
  const [selectedYearMonthIndex, setSelectedYearMonthIndex] = useState(0);
  const [selectedYearMonthWeekIndex, setSelectedYearMonthWeekIndex] = useState(0);
  const [selectedYearBreakdownMode, setSelectedYearBreakdownMode] = useState<"month" | "week">("month");
  const [selectedLifeYearIndex, setSelectedLifeYearIndex] = useState(0);
  const [selectedLifeMonthIndex, setSelectedLifeMonthIndex] = useState(0);
  const [selectedLifeWeekIndex, setSelectedLifeWeekIndex] = useState(0);
  const [selectedLifeBreakdownMode, setSelectedLifeBreakdownMode] = useState<"year" | "month" | "week">("month");

  useEffect(() => {
    setSelectedMonthWeekIndex(0);
  }, [goal.name, goal.monthWeeks.length, open]);

  useEffect(() => {
    const today = new Date();
    const currentMonthIndex = goal.yearMonths.findIndex((month) => {
      const monthDate = new Date(`${month.startISO}T00:00:00`);
      return monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() === today.getMonth();
    });
    const resolvedMonthIndex = currentMonthIndex >= 0 ? currentMonthIndex : 0;
    const resolvedMonth = goal.yearMonths[resolvedMonthIndex];
    const currentWeekIndex = findCurrentWeekIndex(resolvedMonth?.weeks ?? []);

    setSelectedYearMonthIndex(resolvedMonthIndex);
    setSelectedYearMonthWeekIndex(currentWeekIndex >= 0 ? currentWeekIndex : 0);
    setSelectedYearBreakdownMode("month");
  }, [goal.name, goal.yearMonths.length, open]);

  useEffect(() => {
    const today = new Date();
    const currentYearIndex = goal.lifeYears.findIndex((year) => {
      const yearDate = new Date(`${year.startISO}T00:00:00`);
      return yearDate.getFullYear() === today.getFullYear();
    });
    const resolvedYearIndex = currentYearIndex >= 0 ? currentYearIndex : 0;
    const resolvedYear = goal.lifeYears[resolvedYearIndex];
    const currentMonthIndex = resolvedYear?.months.findIndex((month) => {
      const monthDate = new Date(`${month.startISO}T00:00:00`);
      return monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() === today.getMonth();
    }) ?? 0;
    const resolvedMonthIndex = currentMonthIndex >= 0 ? currentMonthIndex : 0;
    const resolvedMonth = resolvedYear?.months[resolvedMonthIndex];
    const currentWeekIndex = findCurrentWeekIndex(resolvedMonth?.weeks ?? []);

    setSelectedLifeYearIndex(resolvedYearIndex);
    setSelectedLifeMonthIndex(resolvedMonthIndex);
    setSelectedLifeWeekIndex(currentWeekIndex >= 0 ? currentWeekIndex : 0);
    setSelectedLifeBreakdownMode("month");
  }, [goal.name, goal.lifeYears.length, open]);

  const selectedMonthWeek = goal.monthWeeks[selectedMonthWeekIndex] ?? null;
  const selectedYearMonth = goal.yearMonths[selectedYearMonthIndex] ?? null;
  const selectedYearMonthWeek = selectedYearMonth?.weeks[selectedYearMonthWeekIndex] ?? null;
  const selectedLifeYear = goal.lifeYears[selectedLifeYearIndex] ?? null;
  const selectedLifeMonth = selectedLifeYear?.months[selectedLifeMonthIndex] ?? null;
  const selectedLifeWeek = selectedLifeMonth?.weeks[selectedLifeWeekIndex] ?? null;
  const isPaused = goal.status === "paused";
  const canOpenBreakdown = !isPaused;

  const goToPreviousLifeMonth = () => {
    if (selectedLifeMonthIndex > 0) {
      setSelectedLifeMonthIndex((value) => value - 1);
      setSelectedLifeWeekIndex(0);
      return;
    }

    if (selectedLifeYearIndex > 0) {
      const previousYearIndex = selectedLifeYearIndex - 1;
      const previousYear = goal.lifeYears[previousYearIndex];
      setSelectedLifeYearIndex(previousYearIndex);
      setSelectedLifeMonthIndex(Math.max(0, (previousYear?.months.length ?? 1) - 1));
      setSelectedLifeWeekIndex(0);
    }
  };

  const goToNextLifeMonth = () => {
    if (selectedLifeYear && selectedLifeMonthIndex < selectedLifeYear.months.length - 1) {
      setSelectedLifeMonthIndex((value) => value + 1);
      setSelectedLifeWeekIndex(0);
      return;
    }

    if (selectedLifeYearIndex < goal.lifeYears.length - 1) {
      const nextYearIndex = selectedLifeYearIndex + 1;
      setSelectedLifeYearIndex(nextYearIndex);
      setSelectedLifeMonthIndex(0);
      setSelectedLifeWeekIndex(0);
    }
  };

  const goToPreviousLifeWeek = () => {
    if (selectedLifeWeekIndex > 0) {
      setSelectedLifeWeekIndex((value) => value - 1);
      return;
    }

    if (selectedLifeMonthIndex > 0) {
      const previousMonthIndex = selectedLifeMonthIndex - 1;
      const previousMonth = selectedLifeYear?.months[previousMonthIndex];
      setSelectedLifeMonthIndex(previousMonthIndex);
      setSelectedLifeWeekIndex(Math.max(0, (previousMonth?.weeks.length ?? 1) - 1));
      return;
    }

    if (selectedLifeYearIndex > 0) {
      const previousYearIndex = selectedLifeYearIndex - 1;
      const previousYear = goal.lifeYears[previousYearIndex];
      const previousMonthIndex = Math.max(0, (previousYear?.months.length ?? 1) - 1);
      const previousMonth = previousYear?.months[previousMonthIndex];
      setSelectedLifeYearIndex(previousYearIndex);
      setSelectedLifeMonthIndex(previousMonthIndex);
      setSelectedLifeWeekIndex(Math.max(0, (previousMonth?.weeks.length ?? 1) - 1));
    }
  };

  const goToNextLifeWeek = () => {
    if (selectedLifeMonth && selectedLifeWeekIndex < selectedLifeMonth.weeks.length - 1) {
      setSelectedLifeWeekIndex((value) => value + 1);
      return;
    }

    if (selectedLifeYear && selectedLifeMonthIndex < selectedLifeYear.months.length - 1) {
      const nextMonthIndex = selectedLifeMonthIndex + 1;
      setSelectedLifeMonthIndex(nextMonthIndex);
      setSelectedLifeWeekIndex(0);
      return;
    }

    if (selectedLifeYearIndex < goal.lifeYears.length - 1) {
      const nextYearIndex = selectedLifeYearIndex + 1;
      setSelectedLifeYearIndex(nextYearIndex);
      setSelectedLifeMonthIndex(0);
      setSelectedLifeWeekIndex(0);
    }
  };

  const isLifeMonthNavDisabled = goal.lifeYears.length <= 1 && (selectedLifeYear?.months.length ?? 0) <= 1;
  const isLifeWeekNavDisabled =
    goal.lifeYears.length <= 1 &&
    (selectedLifeYear?.months.length ?? 0) <= 1 &&
    (selectedLifeMonth?.weeks.length ?? 0) <= 1;

  const visibleRecentActivities = goal.recent.filter((event) => {
    if (scopeKey === "month" && selectedMonthWeek) {
      return event.date >= selectedMonthWeek.startISO && event.date <= selectedMonthWeek.endISO;
    }
    if (scopeKey === "year" && selectedYearBreakdownMode === "week" && selectedYearMonthWeek) {
      return event.date >= selectedYearMonthWeek.startISO && event.date <= selectedYearMonthWeek.endISO;
    }
    if (scopeKey === "year" && selectedYearMonth) {
      return event.date >= selectedYearMonth.startISO && event.date <= selectedYearMonth.endISO;
    }
    if (scopeKey === "life" && selectedLifeBreakdownMode === "week" && selectedLifeWeek) {
      return event.date >= selectedLifeWeek.startISO && event.date <= selectedLifeWeek.endISO;
    }
    if (scopeKey === "life" && selectedLifeBreakdownMode === "month" && selectedLifeMonth) {
      return event.date >= selectedLifeMonth.startISO && event.date <= selectedLifeMonth.endISO;
    }
    if (scopeKey === "life" && selectedLifeYear) {
      return event.date >= selectedLifeYear.startISO && event.date <= selectedLifeYear.endISO;
    }
    return true;
  });

  return (
    <li className={cn(
      "rounded-3xl border transition-all duration-300",
      open ? "bg-gray-50/50 border-gray-100 p-6" : "bg-white border-transparent p-4 hover:bg-gray-50/30"
    )}>
      <button
        onClick={canOpenBreakdown ? onToggle : undefined}
        className="group flex w-full items-center gap-5 text-left"
        aria-expanded={open}
        disabled={!canOpenBreakdown}
      >
        <div className={cn("min-w-0 flex-1", isPaused ? "opacity-75" : "")}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-tight text-gray-900">{goal.name}</h3>
            </div>
            {isPaused ? (
              <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-red-500">
                Paused
              </span>
            ) : (
              <span className="font-mono text-[11px] font-bold tabular-nums text-gray-400">
                {minsToHuman(goal.doneMinutes)} <span className="opacity-30">/</span> {minsToHuman(goal.targetMinutes)}
              </span>
            )}
          </div>
          <div className="relative mt-3 flex items-center gap-4">
            <div className={cn("relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200/50", isPaused ? "blur-[1.5px]" : "")}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${goal.visualPct}%` }}
                transition={{ duration: 1, ease: "circOut" }}
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  isPaused ? "bg-red-500" : "bg-gray-900"
                )}
              />
            </div>
            {!isPaused ? (
              <span className="w-10 text-right font-mono text-xs font-bold tabular-nums text-gray-900">
                {goal.pct}%
              </span>
            ) : null}
          </div>
        </div>
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center border border-gray-100 transition-all",
          !canOpenBreakdown
            ? "bg-white text-gray-300"
            : open
            ? "bg-gray-900 text-white border-transparent rotate-180"
            : "bg-white text-gray-400"
        )}>
          <ChevronDown size={16} />
        </div>
      </button>

      <AnimatePresence>
        {open && canOpenBreakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-2.5">
              <div className="relative">
                <div className={!isPro ? "pointer-events-none select-none blur-[6px]" : ""}>
              {scopeKey === "month" && selectedMonthWeek ? (
                <div className="mb-4 overflow-hidden rounded-[20px] border border-gray-100 bg-gradient-to-br from-white via-white to-gray-50/70 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-gray-400">Weekly Breakdown</p>
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                          {selectedMonthWeek.label}
                        </p>
                      </div>
                      <div className="-mt-1 rounded-full border border-gray-100 bg-white/90 p-1 shadow-sm">
                        <PeriodNavigator
                          label=""
                          onPrev={() => setSelectedMonthWeekIndex((value) => Math.max(0, value - 1))}
                          onNext={() => setSelectedMonthWeekIndex((value) => Math.min(goal.monthWeeks.length - 1, value + 1))}
                          disabled={goal.monthWeeks.length <= 1}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Covered</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{minsToHuman(selectedMonthWeek.doneMinutes)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Target</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{minsToHuman(selectedMonthWeek.targetMinutes)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative h-2 w-[90%] overflow-hidden rounded-full bg-gray-200/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, selectedMonthWeek.pct))}%` }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="absolute inset-y-0 left-0 rounded-full bg-gray-900"
                      />
                    </div>
                    <span className="ml-auto font-mono text-[11px] font-bold text-gray-500">{selectedMonthWeek.pct}%</span>
                  </div>
                </div>
              ) : null}
              {scopeKey === "year" && selectedYearMonth ? (
                <div className="mb-4 overflow-hidden rounded-[20px] border border-gray-100 bg-gradient-to-br from-white via-white to-gray-50/70 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setSelectedYearBreakdownMode("month")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-all",
                          selectedYearBreakdownMode === "month" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedYearBreakdownMode("week")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-all",
                          selectedYearBreakdownMode === "week" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        Week
                      </button>
                    </div>
                    <div className="-mt-1 rounded-full border border-gray-100 bg-white/90 p-1 shadow-sm">
                      <PeriodNavigator
                        label=""
                        onPrev={() => {
                          if (selectedYearBreakdownMode === "month") {
                            setSelectedYearMonthIndex((value) => {
                              const nextValue = Math.max(0, value - 1);
                              setSelectedYearMonthWeekIndex(0);
                              return nextValue;
                            });
                            return;
                          }
                          setSelectedYearMonthWeekIndex((value) => Math.max(0, value - 1));
                        }}
                        onNext={() => {
                          if (selectedYearBreakdownMode === "month") {
                            setSelectedYearMonthIndex((value) => {
                              const nextValue = Math.min(goal.yearMonths.length - 1, value + 1);
                              setSelectedYearMonthWeekIndex(0);
                              return nextValue;
                            });
                            return;
                          }
                          setSelectedYearMonthWeekIndex((value) => Math.min((selectedYearMonth.weeks.length - 1), value + 1));
                        }}
                        disabled={selectedYearBreakdownMode === "month" ? goal.yearMonths.length <= 1 : selectedYearMonth.weeks.length <= 1}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="ml-2">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                          {selectedYearBreakdownMode === "month"
                            ? formatDayRangeLabel(selectedYearMonth.startISO, selectedYearMonth.endISO)
                            : (selectedYearMonthWeek?.label ?? selectedYearMonth.label)}
                        </p>
                      </div>
                      <div />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Covered</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {minsToHuman(selectedYearBreakdownMode === "month" ? selectedYearMonth.doneMinutes : (selectedYearMonthWeek?.doneMinutes ?? 0))}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Target</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {minsToHuman(selectedYearBreakdownMode === "month" ? selectedYearMonth.targetMinutes : (selectedYearMonthWeek?.targetMinutes ?? 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative h-2 w-[90%] overflow-hidden rounded-full bg-gray-200/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, selectedYearBreakdownMode === "month" ? selectedYearMonth.pct : (selectedYearMonthWeek?.pct ?? 0)))}%` }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="absolute inset-y-0 left-0 rounded-full bg-gray-900"
                      />
                    </div>
                    <span className="ml-auto font-mono text-[11px] font-bold text-gray-500">
                      {selectedYearBreakdownMode === "month" ? selectedYearMonth.pct : (selectedYearMonthWeek?.pct ?? 0)}%
                    </span>
                  </div>
                </div>
              ) : null}
              {scopeKey === "life" && selectedLifeYear ? (
                <div className="mb-4 overflow-hidden rounded-[20px] border border-gray-100 bg-gradient-to-br from-white via-white to-gray-50/70 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setSelectedLifeBreakdownMode("year")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-all",
                          selectedLifeBreakdownMode === "year" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        Year
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLifeBreakdownMode("month")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-all",
                          selectedLifeBreakdownMode === "month" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedLifeBreakdownMode("week")}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-all",
                          selectedLifeBreakdownMode === "week" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        Week
                      </button>
                    </div>
                    <div className="-mt-1 rounded-full border border-gray-100 bg-white/90 p-1 shadow-sm">
                      <PeriodNavigator
                        label=""
                        onPrev={() => {
                          if (selectedLifeBreakdownMode === "year") {
                            setSelectedLifeYearIndex((value) => {
                              const nextValue = Math.max(0, value - 1);
                              setSelectedLifeMonthIndex(0);
                              setSelectedLifeWeekIndex(0);
                              return nextValue;
                            });
                            return;
                          }
                          if (selectedLifeBreakdownMode === "month") {
                            goToPreviousLifeMonth();
                            return;
                          }
                          goToPreviousLifeWeek();
                        }}
                        onNext={() => {
                          if (selectedLifeBreakdownMode === "year") {
                            setSelectedLifeYearIndex((value) => {
                              const nextValue = Math.min(goal.lifeYears.length - 1, value + 1);
                              setSelectedLifeMonthIndex(0);
                              setSelectedLifeWeekIndex(0);
                              return nextValue;
                            });
                            return;
                          }
                          if (selectedLifeBreakdownMode === "month") {
                            goToNextLifeMonth();
                            return;
                          }
                          goToNextLifeWeek();
                        }}
                        disabled={
                          selectedLifeBreakdownMode === "year"
                            ? goal.lifeYears.length <= 1
                            : selectedLifeBreakdownMode === "month"
                              ? isLifeMonthNavDisabled
                              : isLifeWeekNavDisabled
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="ml-2">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                          {selectedLifeBreakdownMode === "year"
                            ? selectedLifeYear.yearLabel
                            : selectedLifeBreakdownMode === "month"
                              ? formatDayRangeLabel(selectedLifeMonth?.startISO ?? selectedLifeYear.startISO, selectedLifeMonth?.endISO ?? selectedLifeYear.endISO)
                              : (selectedLifeWeek?.label ?? selectedLifeMonth?.label ?? selectedLifeYear.label)}
                        </p>
                      </div>
                      <div />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Covered</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {minsToHuman(
                            selectedLifeBreakdownMode === "year"
                              ? selectedLifeYear.doneMinutes
                              : selectedLifeBreakdownMode === "month"
                                ? (selectedLifeMonth?.doneMinutes ?? 0)
                                : (selectedLifeWeek?.doneMinutes ?? 0)
                          )}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">Target</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {minsToHuman(
                            selectedLifeBreakdownMode === "year"
                              ? selectedLifeYear.targetMinutes
                              : selectedLifeBreakdownMode === "month"
                                ? (selectedLifeMonth?.targetMinutes ?? 0)
                                : (selectedLifeWeek?.targetMinutes ?? 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative h-2 w-[90%] overflow-hidden rounded-full bg-gray-200/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0,
                          selectedLifeBreakdownMode === "year"
                            ? selectedLifeYear.pct
                            : selectedLifeBreakdownMode === "month"
                              ? (selectedLifeMonth?.pct ?? 0)
                              : (selectedLifeWeek?.pct ?? 0)
                        ))}%` }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="absolute inset-y-0 left-0 rounded-full bg-gray-900"
                      />
                    </div>
                    <span className="ml-auto font-mono text-[11px] font-bold text-gray-500">
                      {selectedLifeBreakdownMode === "year"
                        ? selectedLifeYear.pct
                        : selectedLifeBreakdownMode === "month"
                          ? (selectedLifeMonth?.pct ?? 0)
                          : (selectedLifeWeek?.pct ?? 0)}%
                    </span>
                  </div>
                </div>
              ) : null}
                </div>
                {!isPro ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[20px] bg-white/35">
                    <span className="rounded-full bg-gray-900 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-white">
                      Pro only
                    </span>
                  </div>
                ) : null}
              </div>
              {isPro ? (
                <>
              <p className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Activities</p>
              <div className="relative">
                <div>
                  {visibleRecentActivities.slice(0, 5).map((e, i) => (
                    <motion.div
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      key={e.id}
                      className="flex items-center gap-4 rounded-2xl bg-white border border-gray-100/50 px-4 py-3 shadow-sm"
                    >
                      <StatusIcon status={e.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-sm text-gray-900">{e.title}</p>
                        <p className="text-[10px] font-mono text-gray-400">
                          {new Date(`${e.date}T12:00:00`).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-[11px] font-bold text-gray-900">
                          {e.is_all_day ? "All day" : minsToHuman(e.end_time - e.start_time)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              {visibleRecentActivities.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-400 font-medium italic">
                  No events recorded
                </div>
              )}
                </>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function StatusIcon({ status }: { status: RawEvent["status"] }) {
  if (status === "done") return <div className="p-1.5 bg-gray-100 rounded-lg text-gray-900"><CircleCheck size={14} /></div>;
  if (status === "missed") return <div className="p-1.5 bg-red-50 rounded-lg text-red-400"><CircleX size={14} /></div>;
  return <div className="p-1.5 bg-gray-50 rounded-lg text-gray-300"><CircleDashed size={14} /></div>;
}
