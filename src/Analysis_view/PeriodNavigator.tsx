import { ChevronLeft, ChevronRight } from "lucide-react";

type PeriodNavigatorProps = {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  disabled?: boolean;
};

export function PeriodNavigator({ label, onPrev, onNext, onToday, disabled = false }: PeriodNavigatorProps) {
  return (
    <div className="flex items-center gap-2">
      {label ? (
        <div className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500">
          {label}
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled}
          aria-label="Previous period"
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all ${disabled ? "cursor-not-allowed opacity-35" : "hover:border-gray-300 hover:text-gray-900"}`}
        >
          <ChevronLeft size={16} />
        </button>
        {onToday ? (
          <button
            type="button"
            onClick={onToday}
            disabled={disabled}
            className={`rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 transition-all ${disabled ? "cursor-not-allowed opacity-35" : "hover:border-gray-300 hover:text-gray-900"}`}
          >
            Today
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNext}
          disabled={disabled}
          aria-label="Next period"
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all ${disabled ? "cursor-not-allowed opacity-35" : "hover:border-gray-300 hover:text-gray-900"}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
