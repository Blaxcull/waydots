import { cn } from "@/lib/utils";

export type AnalysisViewMode = "Day" | "Week" | "Month" | "Year";
const VIEWS: AnalysisViewMode[] = ["Day", "Week", "Month", "Year"];

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: AnalysisViewMode;
  onChange: (v: AnalysisViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="relative w-full flex items-center gap-1 rounded-t-full rounded-b-none border border-gray-200 bg-gray-50 p-1 shadow-sm"
    >
      {VIEWS.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 relative z-10 py-2 text-sm font-medium tracking-tight rounded-t-lg transition-all",
              active ? "text-white" : "text-gray-500 hover:text-gray-900"
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-t-lg bg-gray-900 animate-pop"
              />
            )}
            {v}
          </button>
        );
      })}
    </div>
  );
}
