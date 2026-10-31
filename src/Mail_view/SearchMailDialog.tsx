import React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import SearchIcon from "@/assets/search.svg"
import { useEmailStore, type Email } from "@/store/emailStore"
import { Star, X } from "lucide-react"

interface SearchMailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchMailDialog({ open, onOpenChange }: SearchMailDialogProps) {
  const { emails, selectEmail, setActiveFolder, searchQuery, setSearchQuery } = useEmailStore()
  const [localQuery, setLocalQuery] = React.useState(searchQuery)

  React.useEffect(() => {
    if (open) {
      setLocalQuery(searchQuery)
    }
  }, [open, searchQuery])

  const matchedEmails = React.useMemo(() => {
    const q = localQuery.trim().toLowerCase()
    const base = !q
      ? emails
      : emails.filter((email) => {
        const matchSubject = email.subject.toLowerCase().includes(q)
        const matchSender = email.senderName.toLowerCase().includes(q)
        const matchEmail = email.senderEmail.toLowerCase().includes(q)
        const matchBody = email.body.toLowerCase().includes(q)
        return matchSubject || matchSender || matchEmail || matchBody
      })

    return base.slice(0, 15)
  }, [emails, localQuery])

  const handleSelect = (email: Email) => {
    // Switch active folder to match email type if needed
    if (email.isDraft) {
      setActiveFolder("draft")
    } else if (email.isInbox) {
      setActiveFolder("inbox")
    } else if (email.isSent) {
      setActiveFolder("sent")
    } else if (email.starred) {
      // keep
    } else {
      setActiveFolder("inbox")
    }

    setSearchQuery(localQuery)
    selectEmail(email.id)
    onOpenChange(false)
  }

  const handleClear = () => {
    setLocalQuery("")
    setSearchQuery("")
  }

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,92vw)] overflow-hidden rounded-[28px] border border-gray-200 bg-neutral-100 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
        {/* Search Input Header */}
        <div className="border-b border-gray-200 px-4 sm:px-5 py-3 sm:py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="rounded-full bg-neutral-200/80 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-neutral-600 uppercase">
              Mail Page • Inbox &amp; Messages
            </span>
            <span className="text-xs text-neutral-400">
              {localQuery ? `${matchedEmails.length} match${matchedEmails.length === 1 ? "" : "es"}` : `${emails.length} emails on page`}
            </span>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 rounded-[24px] border border-gray-200 bg-[#e7e7e6] px-3.5 sm:px-4 py-2.5 sm:py-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-[#dddddc]">
              <img src={SearchIcon} alt="" className="h-4 w-4 sm:h-5 sm:w-5 opacity-60" />
            </div>
            <input
              autoFocus
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matchedEmails.length > 0) {
                  e.preventDefault()
                  handleSelect(matchedEmails[0])
                }
              }}
              placeholder="Search Mail on this page..."
              className="w-full bg-transparent text-xl sm:text-2xl font-semibold text-neutral-700 outline-none placeholder:text-neutral-400"
            />
                  {localQuery && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-full hover:bg-black/5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Results List */}
              <div className="max-h-[460px] overflow-y-auto px-3 py-3 space-y-2">
                {matchedEmails.length === 0 ? (
                  <div className="py-12 text-center text-sm font-medium text-neutral-500">
                    No matching emails found for &ldquo;{localQuery}&rdquo;
                  </div>
                ) : (
                  matchedEmails.map((email) => (
                    <button
                      key={email.id}
                      type="button"
                      onClick={() => handleSelect(email)}
                      className="group flex w-full items-start justify-between rounded-[20px] sm:rounded-[24px] border border-transparent bg-[#ececeb] px-3.5 sm:px-4 py-2.5 sm:py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          {email.unread && (
                            <span className="h-2 w-2 rounded-full bg-neutral-900 shrink-0" />
                          )}
                          <div className="truncate text-[17px] font-semibold text-neutral-800">
                            {email.senderName}
                          </div>
                          <span className="text-xs text-neutral-400 truncate">
                            &lt;{email.senderEmail}&gt;
                          </span>
                        </div>

                        <div className="mt-1 text-sm font-medium text-neutral-800 truncate">
                          {email.subject}
                        </div>

                        <p className="mt-1 text-xs text-neutral-500 line-clamp-1 leading-relaxed">
                          {email.body.replace(/\n+/g, " ")}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-500">
                          {email.isDraft && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                              Draft
                            </span>
                          )}
                          {email.isSent && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                              Sent
                            </span>
                          )}
                          {email.aiDraft && email.aiDraft.status === "pending_approval" && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                              AI Draft
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        {email.starred && (
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        )}
                        <span className="text-xs font-semibold text-neutral-500 tabular-nums">
                          {email.timestamp}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
          )
}

