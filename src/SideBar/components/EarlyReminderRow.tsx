import React from "react"
import { Bell } from "lucide-react"
import DropdownRow from "./DropdownRow"

const EARLY_REMINDER_OPTIONS = [
  "None",
  "5 minutes before",
  "10 minutes before",
  "15 minutes before",
  "30 minutes before",
  "1 hour before",
  "1 day before",
] as const

interface EarlyReminderRowProps {
  value: string
  onChange: (value: string) => void
}

const EarlyReminderRow: React.FC<EarlyReminderRowProps> = ({ value, onChange }) => (
  <DropdownRow
    icon={<Bell className="w-7 h-7 text-neutral-600 opacity-30" />}
    label="Early Reminder"
    value={value}
    options={EARLY_REMINDER_OPTIONS}
    onChange={onChange}
    maxWidth="max-w-[220px]"
    dropdownMinWidth="min-w-[170px]"
  />
)

export default EarlyReminderRow
