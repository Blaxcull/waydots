import { useMemo } from "react";
import { getAppOpenDates, isoDate, type RawEvent } from "@/lib/streak-mock";

export function DayDotGrid({ events: _events, days = 28 }: { events: RawEvent[]; days?: number }) {
  const appOpenDays = useMemo(() => new Set(getAppOpenDates()), []);

  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find the Sunday of the current week
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - today.getDay());
    
    const result: { dayOfWeek: number; date: Date; hasEvents: boolean; eventCount: number }[][] = [];
    
    // We want 4 columns (weeks)
    for (let w = 0; w < 4; w++) {
      const week: { dayOfWeek: number; date: Date; hasEvents: boolean; eventCount: number }[] = [];
      // Week start for this column
      const columnSunday = new Date(currentSunday);
      columnSunday.setDate(currentSunday.getDate() - (3 - w) * 7);

      for (let d = 0; d < 7; d++) {
        const date = new Date(columnSunday);
        date.setDate(columnSunday.getDate() + d);
        const dateStr = isoDate(date);
        
        // Only mark as active if it's in the past or today, and has analysis
        const isFuture = date > today;
        
        week.push({
          dayOfWeek: d,
          date,
          hasEvents: !isFuture && appOpenDays.has(dateStr),
          eventCount: 0,
        });
      }
      result.push(week);
    }
    
    return result;
  }, [appOpenDays]);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <article className="card-soft p-10 anim-fade-up">
      <header className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold tracking-tight">Activity Grid</h3>
        <p className="text-[11px] text-muted-foreground">Last {days} days</p>
      </header>

      <div className="mt-6 overflow-x-auto">
        <div className="flex">
          <div className="flex flex-col justify-around pr-2">
            {dayLabels.map((label, i) => (
              <div key={i} className="h-5 flex items-center text-[10px] text-right text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
          
          <div className="flex gap-1">
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className="w-5 h-5 rounded-sm cursor-pointer relative group flex items-center justify-center"
                    style={{
                      backgroundColor: day.hasEvents ? "#111827" : "#e5e7eb",
                    }}
                  >
                    {day.hasEvents && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                        {day.date.toLocaleDateString()} - Analysis active
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-200" />
            <span>No analysis</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-900" />
            <span>Analysis day</span>
          </div>
        </div>
      </div>
    </article>
  );
}
