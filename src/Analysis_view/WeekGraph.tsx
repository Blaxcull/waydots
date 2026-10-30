import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { isoDate, type RawEvent } from "@/lib/streak-mock";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PeriodNavigator } from "./PeriodNavigator";

type Week = {
  label: string;
  startDate: Date;
  endDate: Date;
  days: { date: Date; doneCount: number; total: number }[];
  doneCount: number;
};

function sundayOf(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

export function WeekGraph({ events, weeks = 4, navigationDisabled = false }: { events: RawEvent[]; weeks?: number; navigationDisabled?: boolean }) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const data = useMemo<Week[]>(() => {
    const map = new Map<string, RawEvent[]>();
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    }

    const currentSunday = sundayOf(anchorDate);
    const out: Week[] = [];

    for (let weekIndex = weeks - 1; weekIndex >= 0; weekIndex--) {
      const start = new Date(currentSunday);
      start.setDate(currentSunday.getDate() - weekIndex * 7);
      const days: Week["days"] = [];
      let doneCount = 0;

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const day = new Date(start);
        day.setDate(start.getDate() + dayOffset);
        const eventsForDay = map.get(isoDate(day)) ?? [];
        const done = eventsForDay.filter((event) => event.status === "done").length;
        days.push({ date: day, doneCount: done, total: eventsForDay.length });
        doneCount += done;
      }

      out.push({
        label: `W${weeks - weekIndex}`,
        startDate: start,
        endDate: new Date(days[days.length - 1]?.date ?? start),
        days,
        doneCount,
      });
    }

    return out;
  }, [anchorDate, events, weeks]);

  const eventMap = useMemo(() => {
    const map = new Map<string, RawEvent[]>();
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    }
    return map;
  }, [events]);

  const windowStart = data[0]?.startDate;
  const windowEnd = data[data.length - 1]?.endDate;

  function shiftWindow(direction: -1 | 1) {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * weeks * 7);
      return next;
    });
  }

  function resetWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setAnchorDate(today);
  }

  return (
    <article className="card-soft p-8 md:p-10">
      <header className="mb-8 flex items-center justify-between">
        <h3 className="text-2xl font-bold tracking-tight text-gray-900">Weekly Consistency</h3>
        <PeriodNavigator
          label={`${formatShortDate(windowStart)} - ${formatShortDate(windowEnd)}`}
          onPrev={() => shiftWindow(-1)}
          onNext={() => shiftWindow(1)}
          onToday={resetWindow}
          disabled={navigationDisabled}
        />
      </header>

      <div className="grid grid-cols-4 gap-4">
        {data.map((week, weekIndex) => (
          <div
            key={week.label}
            className="flex min-h-[210px] flex-col gap-4 rounded-3xl border border-gray-100/50 bg-gray-50/50 p-4 transition-all hover:border-gray-200 hover:bg-white hover:shadow-lg"
          >
            <div className="flex h-24 w-full items-end justify-between px-1">
              {week.days.map((day, dayIndex) => {
                const dayKey = isoDate(day.date);
                const dayEvents = eventMap.get(dayKey) || [];
                return (
                  <DotStack
                    key={dayKey}
                    done={day.doneCount}
                    total={day.total}
                    delay={weekIndex * 0.1 + dayIndex * 0.05}
                    events={dayEvents}
                  />
                );
              })}
            </div>

            <div className="flex w-full justify-between px-1 font-mono text-[9px] font-bold text-gray-400">
              {week.days.map((day) => (
                <span key={isoDate(day.date)} className="w-2 text-center">
                  {day.date.getDate()}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div>
                <p className="text-xs font-bold text-gray-900">{week.label}</p>
                <p className="text-[10px] font-medium text-gray-400">
                  {formatShortDate(week.startDate)} - {formatShortDate(week.endDate)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-2 py-1 font-mono text-[12px] font-bold text-white">
                <Target size={10} />
                <span className="tabular-nums">{week.doneCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DotStack({
  done: _done,
  total,
  delay,
  events,
}: {
  done: number;
  total: number;
  delay: number;
  events: RawEvent[];
}) {
  const visible = Math.min(7, total);
  const orderedEvents = useMemo(() => {
    const statusRank = (status: RawEvent["status"]) => {
      if (status === "pending") return 0;
      if (status === "missed") return 1;
      return 2;
    };

    return [...events].sort((a, b) => {
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      if (a.start_time !== b.start_time) return a.start_time - b.start_time;
      return a.id.localeCompare(b.id);
    });
  }, [events]);
  const previewEvents = orderedEvents.slice(0, 4);
  const remainingCount = orderedEvents.length - previewEvents.length;
  const dotStatuses = Array.from({ length: visible }, (_, index) => orderedEvents[index]?.status ?? "pending");

  return (
    <div className="group relative flex cursor-pointer flex-col items-center gap-1.5">
      {dotStatuses.map((status, index) => {
        const isDone = status === "done";
        return (
          <motion.span
            key={index}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay, type: "spring", stiffness: 300, damping: 20 }}
            className={cn("h-2 w-2 rounded-full", isDone ? "bg-gray-900 shadow-[0_0_8px_rgba(0,0,0,0.15)]" : "bg-gray-200")}
          />
        );
      })}
      {orderedEvents.length > 0 ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 min-w-[160px] -translate-x-1/2 translate-y-2 rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white opacity-0 shadow-xl transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="mb-2 text-[9px] text-white/60">{orderedEvents.length} events</div>
          <div className="flex flex-col gap-1 whitespace-nowrap">
            {previewEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-2">
                <div className={cn("h-1 w-1 rounded-full", event.status === "done" ? "bg-green-400" : "bg-gray-400")} />
                {event.title}
              </div>
            ))}
            {remainingCount > 0 ? (
              <div className="pt-1 text-[9px] text-white/60">+{remainingCount} more</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatShortDate(date?: Date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
