import React from "react"
import { Repeat } from "lucide-react"
import DropdownRow from "./DropdownRow"

const REPEAT_OPTIONS = ["None", "Daily", "Weekly", "Monthly", "Yearly"] as const

interface RepeatRowProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const RepeatRow: React.FC<RepeatRowProps> = ({ value, onChange, disabled }) => (
  <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
    <DropdownRow
      icon={<Repeat className="w-7 h-7 text-neutral-600 opacity-30" />}
      label="Repeat"
      value={value}
      options={REPEAT_OPTIONS}
      onChange={onChange}
    />
  </div>
)

export default RepeatRow
