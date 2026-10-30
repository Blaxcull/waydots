import { useMemo, useState } from "react";
import { isoDate, type RawEvent } from "@/lib/streak-mock";
import { PeriodNavigator } from "./PeriodNavigator";

type Bucket = { date: string; created: number; done: number; updated: number };

export function DayBarGraph({ events, days = 30, navigationDisabled = false }: { events: RawEvent[]; days?: number; navigationDisabled?: boolean }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const buckets = useMemo<Bucket[]>(() => {
    const end = new Date(anchorDate);
    end.setHours(0, 0, 0, 0);
    const map = new Map<string, Bucket>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const key = isoDate(d);
      map.set(key, { date: key, created: 0, done: 0, updated: 0 });
    }

    for (const event of events) {
      const bucket = map.get(event.date);
      if (!bucket) continue;
      bucket.created += 1;
      if (event.status === "done") bucket.done += 1;
      else if (event.status === "pending") bucket.updated += 1;
    }

    return [...map.values()];
  }, [anchorDate, days, events]);

  const totals = buckets.reduce(
    (acc, bucket) => {
      acc.created += bucket.created;
      acc.done += bucket.done;
      acc.updated += bucket.updated;
      return acc;
    },
    { created: 0, done: 0, updated: 0 }
  );

  const max = Math.max(1, ...buckets.map((bucket) => bucket.created));
  const startLabel = formatShortDate(buckets[0]?.date);
  const endLabel = formatShortDate(buckets[buckets.length - 1]?.date);

  function shiftWindow(direction: -1 | 1) {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * days);
      return next;
    });
  }

  function resetWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setAnchorDate(today);
  }

  return (
    <article className="card-soft p-7 md:p-8">
      <header className="flex items-center justify-between">
        <h3 className="text-2xl font-bold tracking-tight text-gray-900">Daily Activity</h3>
        <PeriodNavigator
          label={`${startLabel} - ${endLabel}`}
          onPrev={() => shiftWindow(-1)}
          onNext={() => shiftWindow(1)}
          onToday={resetWindow}
          disabled={navigationDisabled}
        />
      </header>

      <div className="relative mt-8 h-60 rounded-3xl border border-gray-100 bg-gray-50/50 p-5">
        <div className="flex h-44 items-end gap-1">
          {buckets.map((bucket, index) => {
            const pct = (bucket.created / max) * 100;
            const donePct = bucket.created > 0 ? (bucket.done / bucket.created) * 100 : 0;
            const isFullyDone = bucket.created > 0 && bucket.done === bucket.created;
            const hasEvents = bucket.created > 0;

            return (
              <div
                key={bucket.date}
                className="group relative flex h-full flex-1 items-end"
              >
                <div
                  className={`relative w-full origin-bottom overflow-hidden rounded-full anim-grow-y transition-all ${
                    !hasEvents
                      ? "bg-transparent"
                      : isFullyDone
                        ? "bg-gray-900"
                        : "bg-gray-200 hover:bg-gray-300"
                  }`}
                  style={{
                    height: `${Math.max(bucket.created > 0 ? 8 : 0, pct)}%`,
                    animationDelay: `${index * 10}ms`,
                  }}
                >
                  {!isFullyDone ? (
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-gray-900"
                      style={{ height: `${donePct}%` }}
                    />
                  ) : null}
                </div>
                {bucket.created > 0 ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                    {bucket.done}/{bucket.created} done
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-start justify-between px-1 font-mono text-[10px] font-bold text-gray-400">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <Metric label="Total Created" value={totals.created} primary />
        <Metric label="Completed" value={totals.done} />
        <Metric label="Pending" value={totals.updated} />
      </div>
    </article>
  );
}

function Metric({ label, value, primary }: { label: string; value: number; primary?: boolean }) {
  return (
    <div
      className={`flex min-w-[120px] flex-1 flex-col gap-1 rounded-2xl border p-4 transition-all hover:scale-[1.02] ${
        primary ? "border-transparent bg-gray-900 text-white shadow-lg" : "border-gray-100 bg-white text-gray-900 shadow-sm"
      }`}
    >
      <span className={`text-[9px] font-mono uppercase tracking-widest ${primary ? "text-white/50" : "text-gray-400"}`}>{label}</span>
      <span className="text-2xl font-bold leading-none tabular-nums">{value}</span>
    </div>
  );
}

function formatShortDate(dateString?: string) {
  if (!dateString) return "";
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
