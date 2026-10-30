import { useMemo, useState } from "react";
import { type RawEvent } from "@/lib/streak-mock";
import { PeriodNavigator } from "./PeriodNavigator";

type YearMonth = {
  key: string;
  name: string;
  shortLabel: string;
  total: number;
  done: number;
  date: Date;
};

const YEAR_BAR_MAX_HEIGHT = 168;
const YEAR_BAR_MIN_HEIGHT = 14;

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function YearGraph({ events, navigationDisabled = false }: { events: RawEvent[]; navigationDisabled?: boolean }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const months = useMemo<YearMonth[]>(() => {
    const out: YearMonth[] = [];

    for (let index = 11; index >= 0; index--) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - index, 1);
      out.push({
        key: getMonthKey(date),
        name: date.toLocaleDateString(undefined, { month: "long" }),
        shortLabel: date.toLocaleDateString(undefined, { month: "short" }),
        total: 0,
        done: 0,
        date,
      });
    }

    const byKey = new Map(out.map((month) => [month.key, month]));
    for (const event of events) {
      const date = new Date(`${event.date}T12:00:00`);
      const month = byKey.get(getMonthKey(date));
      if (!month) continue;
      month.total += 1;
      if (event.status === "done") month.done += 1;
    }

    return out;
  }, [anchorDate, events]);

  const max = Math.max(1, ...months.map((month) => month.total));
  const totalDone = months.reduce((sum, month) => sum + month.done, 0);
  const activeMonths = months.filter((month) => month.total > 0).length;
  const bestMonth = months.reduce<YearMonth | null>((best, month) => {
    if (!best) return month;
    return month.total > best.total ? month : best;
  }, null);

  function shiftWindow(direction: -1 | 1) {
    setAnchorDate((prev) => new Date(prev.getFullYear() + direction, prev.getMonth(), 1));
  }

  function resetWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setAnchorDate(today);
  }

  return (
    <article className="card-soft p-8 md:p-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold tracking-tight text-gray-900">Yearly Performance</h3>
        <PeriodNavigator
          label={`${months[0]?.date.toLocaleDateString(undefined, { month: "short", year: "numeric" }) ?? ""} - ${months[months.length - 1]?.date.toLocaleDateString(undefined, { month: "short", year: "numeric" }) ?? ""}`}
          onPrev={() => shiftWindow(-1)}
          onNext={() => shiftWindow(1)}
          onToday={resetWindow}
          disabled={navigationDisabled}
        />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <YearStat label="Completed" value={totalDone} />
        <YearStat label="Active Months" value={activeMonths} />
        <YearStat label="Best Month" value={bestMonth?.shortLabel ?? "N/A"} />
      </div>

      <div className="mt-6 rounded-[1.9rem] border border-gray-100 bg-white p-6 shadow-sm ring-1 ring-black/[0.03]">
        <div className="flex h-52 items-end gap-3 border-b border-gray-200 pb-4">
          {months.map((month) => {
            const totalHeight = month.total > 0
              ? Math.max(YEAR_BAR_MIN_HEIGHT, (month.total / max) * YEAR_BAR_MAX_HEIGHT)
              : 0;

            return (
              <div key={month.key} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-3">
                <div className="flex h-full w-full items-end justify-center">
                  {month.total > 0 ? (
                    <div
                      className="w-5 rounded-full bg-gray-900"
                      style={{ height: `${totalHeight}px` }}
                    />
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2 translate-y-1 rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-bold whitespace-nowrap text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                  {month.done}/{month.total} done
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-12 gap-3">
          {months.map((month) => (
            <div key={`${month.key}-label`} className="text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{month.shortLabel}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function YearStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.03]">
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold leading-none tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
