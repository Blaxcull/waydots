import React from "react"
import { Sun } from "lucide-react"

interface AllDayRowProps {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

const AllDayRow: React.FC<AllDayRowProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="flex items-center justify-between py-1 px-0">
      
      <div className="flex items-center gap-3">
        <Sun className="w-7 h-7 text-neutral-600 opacity-30" />
        <span className="text-neutral-800 pl-2 text-2xl shrink-0">
          All Day
        </span>
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        className={`
          relative w-17 h-8 rounded-full transition-colors duration-200
          ${disabled ? "bg-neutral-200 cursor-not-allowed" : value ? "bg-red-500" : "bg-neutral-300"}
        `}
      >
        <span
          className={`
            absolute top-1 left-1 w-9 h-6 bg-white rounded-full shadow
            transform transition-transform duration-200
            ${value ? "translate-x-6" : "translate-x-0"}
          `}
        />
      </button>

    </div>
  )
}

export default AllDayRow
