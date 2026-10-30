import { useMemo, useState } from "react";
import { type RawEvent } from "@/lib/streak-mock";
import { PeriodNavigator } from "./PeriodNavigator";

type WeekBucket = {
  label: string;
  total: number;
  done: number;
};

type MonthGroup = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  weeks: WeekBucket[];
  total: number;
};

const WEEK_BAR_MAX_HEIGHT = 110;
const WEEK_BAR_MIN_HEIGHT = 12;

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekOfMonth(date: Date): number {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = first.getDay();
  return Math.floor((date.getDate() - 1 + offset) / 7) + 1;
}

export function MonthGraph({ events, months = 4, navigationDisabled = false }: { events: RawEvent[]; months?: number; navigationDisabled?: boolean }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const groups = useMemo<MonthGroup[]>(() => {
    const out: MonthGroup[] = [];

    for (let index = months - 1; index >= 0; index--) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - index, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const weekCount = weekOfMonth(monthEnd);

      out.push({
        key: getMonthKey(date),
        shortLabel: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
        fullLabel: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        weeks: Array.from({ length: weekCount }, (_, weekIndex) => ({
          label: `W${weekIndex + 1}`,
          total: 0,
          done: 0,
        })),
        total: 0,
      });
    }

    const byKey = new Map(out.map((group) => [group.key, group]));
    for (const event of events) {
      const date = new Date(`${event.date}T12:00:00`);
      const group = byKey.get(getMonthKey(date));
      if (!group) continue;
      const weekIndex = weekOfMonth(date) - 1;
      const week = group.weeks[weekIndex];
      if (!week) continue;
      week.total += 1;
      if (event.status === "done") week.done += 1;
      group.total += 1;
    }

    return out;
  }, [anchorDate, events, months]);

  const maxWeekTotal = Math.max(1, ...groups.flatMap((group) => group.weeks).map((week) => week.total));

  function shiftWindow(direction: -1 | 1) {
    setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction * months, 1));
  }

  function resetWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setAnchorDate(today);
  }

  return (
    <article className="card-soft p-8 md:p-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold tracking-tight text-gray-900">Monthly Activity</h3>
        <PeriodNavigator
          label={`${groups[0]?.shortLabel ?? ""} - ${groups[groups.length - 1]?.shortLabel ?? ""}`}
          onPrev={() => shiftWindow(-1)}
          onNext={() => shiftWindow(1)}
          onToday={resetWindow}
          disabled={navigationDisabled}
        />
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {groups.map((group) => (
          <section
            key={group.key}
            className="rounded-[1.5rem] border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03]"
            title={group.fullLabel}
          >
            <div className="mb-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-gray-400">{group.shortLabel}</p>
            </div>

            <div className="flex h-40 items-end gap-2 border-b border-gray-200 pb-3">
              {group.weeks.map((week) => {
                const totalHeight = week.total > 0
                  ? Math.max(WEEK_BAR_MIN_HEIGHT, (week.total / maxWeekTotal) * WEEK_BAR_MAX_HEIGHT)
                  : 0;

                return (
                  <div key={`${group.key}-${week.label}`} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    {week.total > 0 ? (
                      <div className="flex h-full w-full items-end justify-center">
                        <div
                          className="w-3.5 rounded-full bg-gray-900"
                          style={{ height: `${totalHeight}px` }}
                        />
                      </div>
                    ) : (
                      <div className="h-full w-full" />
                    )}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2 translate-y-1 rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-bold whitespace-nowrap text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                      {week.done}/{week.total} done
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {group.weeks.map((week) => (
                <span
                  key={`${group.key}-${week.label}-label`}
                  className="min-w-0 flex-1 text-center font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400"
                >
                  {week.label}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
