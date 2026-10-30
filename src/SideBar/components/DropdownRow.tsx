/**
 * Generic dropdown row component used by RepeatRow, EarlyReminderRow,
 * GoalRow, and GoalTypeRow. Eliminates duplicated dropdown logic.
 */
import React, { useState, useRef, useEffect } from "react"
import { ChevronsUpDown, Check } from "lucide-react"

interface DropdownRowProps {
  icon: React.ReactNode
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  maxWidth?: string
  dropdownMinWidth?: string
}

const DropdownRow: React.FC<DropdownRowProps> = ({
  icon,
  label,
  value,
  options,
  onChange,
  maxWidth = "max-w-[220px]",
  dropdownMinWidth = "min-w-[160px]",
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const validValue = options.includes(value) ? value : options[0]
  const selectedIndex = options.indexOf(validValue)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  // Auto-scroll to selected item when dropdown opens
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return
    requestAnimationFrame(() => {
      if (dropdownRef.current) {
        const itemHeight = 36
        const scrollPos = Math.max(0, (selectedIndex - 2) * itemHeight)
        dropdownRef.current.scrollTop = scrollPos
      }
    })
  }, [isOpen, selectedIndex])

  const handleSelect = (option: string) => {
    onChange(option)
    setIsOpen(false)
    setHoveredIndex(null)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between py-1 px-0">
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-neutral-800 pl-2 text-2xl shrink-0 whitespace-nowrap">{label}</span>
        </div>

        <div className="flex items-center gap-4">
          <span className={`text-neutral-700 text-2xl truncate whitespace-nowrap ${maxWidth}`}>
            {validValue}
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 bg-neutral-300 rounded-full transition-colors cursor-pointer hover:bg-neutral-500"
          >
            <ChevronsUpDown className="w-5 h-5 text-neutral-700" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute px-2 right-0 top-full mr-0 mt-1 z-50 bg-[#f6f6f6] rounded-lg shadow-xl py-1 ${dropdownMinWidth} max-h-[120px] overflow-y-auto [&::-webkit-scrollbar]:hidden`}
        >
          {options.map((option, index) => {
            const isSelected = option === validValue
            const isHovered = hoveredIndex === index
            const isHighlighted = isHovered || (isSelected && hoveredIndex === null)

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`
                  relative w-full rounded-[10px] flex items-center py-1 px-4 text-xl transition-colors duration-100
                  ${isSelected ? "bg-red-500 text-white font-medium" : isHighlighted ? "bg-red-400 text-white" : "text-neutral-700 hover:bg-red-400"}
                `}
              >
                {isSelected && <Check className="absolute left-2 w-4 h-4 shrink-0" />}
                <span className="pl-4 text-left">{option}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DropdownRow
