import React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type RecurringActionChoice =
  | "only-this"
  | "all-events"
  | "this-and-following"
  | "cancel"

export type RecurringActionType = "edit" | "delete"

interface RecurringActionDialogProps {
  open: boolean
  onChoice: (choice: RecurringActionChoice) => void
  actionType: RecurringActionType
  eventTitle: string
}

const RecurringActionDialog: React.FC<RecurringActionDialogProps> = ({
  open,
  onChoice,
  actionType,
  eventTitle,
}) => {
  if (!open) return null

  const isDelete = actionType === "delete"
  const title = isDelete ? "Delete" : "Edit"

  return (
    <Dialog open={open} onOpenChange={() => onChoice("cancel")}>
      <DialogContent className="w-[min(480px,92vw)] overflow-hidden rounded-[28px] border border-[#dddddc] !bg-[#ececea] p-0 shadow-[0_18px_45px_rgba(0,0,0,0.10)]">
        <div className="bg-[#ececea] border-b border-[#dddddc] px-6 pt-5 pb-4">
          <h2 className="text-xl font-semibold text-neutral-700">{title} Recurring Event</h2>
          <p className="mt-1 truncate text-sm text-neutral-500/90">{eventTitle}</p>
        </div>

        <div className="bg-[#ececea] px-4 py-3 space-y-2">
          <button
            onClick={() => onChoice("only-this")}
            className="w-full rounded-[24px] border border-transparent bg-[#f4f4f3] px-4 py-3 text-left transition-colors hover:border-[#dddddc] hover:bg-[#f8f8f7]"
          >
            <div className="text-[16px] font-medium text-neutral-700">Only this event</div>
            <div className="text-xs text-neutral-500/90">Change only this occurrence</div>
          </button>
          <button
            onClick={() => onChoice("this-and-following")}
            className="w-full rounded-[24px] border border-transparent bg-[#f4f4f3] px-4 py-3 text-left transition-colors hover:border-[#dddddc] hover:bg-[#f8f8f7]"
          >
            <div className="text-[16px] font-medium text-neutral-700">This and following</div>
            <div className="text-xs text-neutral-500/90">Change this and future occurrences</div>
          </button>
          <button
            onClick={() => onChoice("all-events")}
            className={`w-full rounded-[24px] border border-transparent bg-[#f4f4f3] px-4 py-3 text-left transition-colors ${
              isDelete ? "hover:border-red-200 hover:bg-red-50/40" : "hover:border-[#dddddc] hover:bg-[#f8f8f7]"
            }`}
          >
            <div className={`text-[16px] font-medium ${isDelete ? "text-red-600" : "text-neutral-800"}`}>All events</div>
            <div className="text-xs text-neutral-500/90">Change the full series</div>
          </button>
        </div>

        <div className="bg-[#ececea] border-t border-[#dddddc] px-4 py-3">
          <Button
            variant="ghost"
            className="h-10 w-full rounded-[16px] bg-[#f4f4f3] text-sm font-medium text-neutral-600 hover:bg-[#f8f8f7] hover:text-neutral-700"
            onClick={() => onChoice("cancel")}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default RecurringActionDialog
