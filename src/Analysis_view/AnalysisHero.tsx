import { useMemo } from "react";
import { isoDate } from "@/lib/streak-mock";
import { cn } from "@/lib/utils";

export function AnalysisHero({
  current,
  longest,
  streakDays,
}: {
  current: number;
  longest: number;
  streakDays?: Set<string>;
}) {
  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = today.getDay();
    const daysToShow = 29 + todayDow;
    const result: { date: Date; hasEvents: boolean }[] = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      result.push({
        date: d,
        hasEvents: streakDays ? streakDays.has(isoDate(d)) : false,
      });
    }
    return result;
  }, [streakDays]);
  const activeDays = grid.filter((day) => day.hasEvents).length;
  const consistency = grid.length > 0 ? Math.round((activeDays / grid.length) * 100) : 0;

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <section className="card-soft relative overflow-hidden p-12 md:p-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative flex flex-col gap-8">
        <div className="flex items-end gap-6">
          <span className="text-[10rem] md:text-[14rem] font-bold leading-none tracking-tighter tabular-nums text-gray-900">
            {current}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-8 pt-8">
          <Stat label="Longest" value={`${longest}d`} />
          <Stat label="Active days" value={`${activeDays}`} />
          <Stat label="Consistency" value={`${consistency}%`} />
        </div>
      </div>

      <div className="absolute right-8 top-[42%] hidden -translate-y-1/2 self-start lg:flex flex-col gap-2">
        <div className="flex gap-2 ml-1">
          {dayLabels.map((label, i) => (
            <div key={i} className="w-8 text-center text-[12px] font-medium text-gray-400">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {grid.map((day, i) => (
            <div
              key={i}
              className={cn(
                "h-8 w-8 rounded-xl border transition-colors",
                day.hasEvents
                  ? "border-transparent bg-gray-800 shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                  : "border-gray-200 bg-gray-50"
              )}
              title={day.date.toLocaleDateString()}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
