import { useState, useEffect, useRef } from "react"
import {
  Inbox,
  Send,
  Star,
  Sparkles,
  CheckCircle2,
  X,
  Calendar,
  CheckSquare,
  Square,
  MinusSquare,
  Minus,
  ChevronDown,
  MailOpen,
  Mail,
  Check,
  ArrowLeft,
  Maximize2,
  Trash2,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  Wand2,
} from "lucide-react"
import { useEmailStore, type Email, type EmailPriority, type PriorityFilter } from "@/store/emailStore"
import { useEventsStore } from "@/store/eventsStore"
import { Button } from "@/components/ui/button"
import {
  classifyAndSortEmailsWithGemini,
  classifyEmailsWithKeywords,
  sortEmailsByPriorityOrder,
  refineDraftWithAiPrompt,
  generateContextualDraft,
  syncMeetingAndRescheduleToCalendar,
} from "@/services/geminiMailService"
import {
  connectGmailAccount,
  fetchTop20GmailMessages,
  getGoogleProviderToken,
} from "@/services/gmailApiService"

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

export default function MailView() {
  const {
    emails,
    selectedEmailId,
    activeFolder,
    priorityFilter,
    sortByPriority,
    searchQuery,
    senderAccount,
    availableSenders,
    selectEmail,
    setSearchQuery,
    setSenderAccount,
    setPriorityFilter,
    setSortByPriority,
    toggleSortByPriority,
    setEmails,
    approveAiDraftAndSend,
    dismissAiDraft,
    updateEmailDraft,
    resolveDraftConflict,
    setAiDraftForEmail,
    sendReply,
    sendDraft,
    composeEmail,
    toggleStarEmail,
    deleteEmail,
    restoreDeletedEmails,
    markBatchAsRead,
    markBatchAsUnread,
    deleteBatchEmails,
    toggleStarBatch,
  } = useEmailStore()

  const [replyText, setReplyText] = useState("")
  const [draftEditText, setDraftEditText] = useState<string | null>(null)
  const [sentToast, setSentToast] = useState<string | null>(null)
  const [trashToast, setTrashToast] = useState<{
    message: string
    emails: Email[]
  } | null>(null)
  const trashToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI & Priority state
  const [isAiSorting, setIsAiSorting] = useState(false)
  const [aiPromptInstruction, setAiPromptInstruction] = useState("")
  const [isRefiningDraft, setIsRefiningDraft] = useState(false)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [isGmailConnected, setIsGmailConnected] = useState(false)
  const [isGmailFetching, setIsGmailFetching] = useState(false)

  // Selection state (like Gmail)
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([])
  const [isSelectDropdownOpen, setIsSelectDropdownOpen] = useState(false)
  const selectDropdownRef = useRef<HTMLDivElement>(null)

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeTo, setComposeTo] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [composePriority, setComposePriority] = useState<EmailPriority>("medium")

  useEffect(() => {
    if (typeof window === "undefined") return

    if (sessionStorage.getItem("pendingComposeMail") === "true") {
      sessionStorage.removeItem("pendingComposeMail")
      setIsComposeOpen(true)
    }

    const handleCompose = () => {
      setIsComposeOpen(true)
    }

    window.addEventListener("waydots:compose-mail", handleCompose)
    return () => window.removeEventListener("waydots:compose-mail", handleCompose)
  }, [])

  // Close selection dropdown on outside click
  useEffect(() => {
    if (!isSelectDropdownOpen) return

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        selectDropdownRef.current &&
        !selectDropdownRef.current.contains(e.target as Node)
      ) {
        setIsSelectDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [isSelectDropdownOpen])

  // Filter emails by folder and search query
  const folderEmails = emails.filter((email) => {
    if (activeFolder === "starred" && !email.starred) return false
    if (activeFolder === "draft" && !email.isDraft) return false
    if (activeFolder === "sent" && !email.isSent) return false
    if (activeFolder === "inbox" && (email.isDraft || email.isSent)) return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchSubject = email.subject.toLowerCase().includes(q)
      const matchSender = email.senderName.toLowerCase().includes(q)
      const matchBody = email.body.toLowerCase().includes(q)
      return matchSubject || matchSender || matchBody
    }

    return true
  })

  // Priority counts within current folder
  const highCount = folderEmails.filter((e) => e.priority === "high").length
  const mediumCount = folderEmails.filter((e) => e.priority === "medium").length
  const lowCount = folderEmails.filter((e) => e.priority === "low").length

  // Filter by selected priority
  const priorityFilteredEmails = folderEmails.filter((email) => {
    if (priorityFilter === "all") return true
    return email.priority === priorityFilter
  })

  // Order by priority if toggled or default
  const displayedEmails = sortByPriority
    ? sortEmailsByPriorityOrder(priorityFilteredEmails)
    : priorityFilteredEmails

  const selectedEmail =
    selectedEmailId !== null ? emails.find((e) => e.id === selectedEmailId) || null : null

  // Selection states
  const allDisplayedSelected =
    displayedEmails.length > 0 &&
    displayedEmails.every((e) => selectedEmailIds.includes(e.id))
  const isSomeSelected =
    selectedEmailIds.length > 0 && !allDisplayedSelected

  const toggleSelectEmail = (id: string) => {
    setSelectedEmailIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleMasterCheckboxClick = () => {
    if (allDisplayedSelected) {
      setSelectedEmailIds([])
    } else {
      setSelectedEmailIds(displayedEmails.map((e) => e.id))
    }
  }

  const handleSelectFilter = (
    type: "all" | "none" | "read" | "unread" | "starred" | "unstarred"
  ) => {
    setIsSelectDropdownOpen(false)
    if (type === "all") {
      setSelectedEmailIds(displayedEmails.map((e) => e.id))
    } else if (type === "none") {
      setSelectedEmailIds([])
    } else if (type === "read") {
      setSelectedEmailIds(displayedEmails.filter((e) => !e.unread).map((e) => e.id))
    } else if (type === "unread") {
      setSelectedEmailIds(displayedEmails.filter((e) => e.unread).map((e) => e.id))
    } else if (type === "starred") {
      setSelectedEmailIds(displayedEmails.filter((e) => e.starred).map((e) => e.id))
    } else if (type === "unstarred") {
      setSelectedEmailIds(displayedEmails.filter((e) => !e.starred).map((e) => e.id))
    }
  }

  const handleBatchMarkAsRead = () => {
    if (selectedEmailIds.length === 0) return
    markBatchAsRead(selectedEmailIds)
    triggerToast(`${selectedEmailIds.length} marked as read`)
  }

  const handleBatchMarkAsUnread = () => {
    if (selectedEmailIds.length === 0) return
    markBatchAsUnread(selectedEmailIds)
    triggerToast(`${selectedEmailIds.length} marked as unread`)
  }

  const handleBatchToggleStar = () => {
    if (selectedEmailIds.length === 0) return
    toggleStarBatch(selectedEmailIds)
    triggerToast("Starred status updated")
  }

  const showTrashToast = (deleted: Email[], message = "Conversation moved to Trash.") => {
    if (trashToastTimerRef.current) {
      clearTimeout(trashToastTimerRef.current)
    }
    setTrashToast({ message, emails: deleted })
    trashToastTimerRef.current = setTimeout(() => {
      setTrashToast(null)
    }, 5000)
  }

  const handleUndoTrash = () => {
    if (!trashToast || trashToast.emails.length === 0) return
    restoreDeletedEmails(trashToast.emails)
    if (trashToastTimerRef.current) {
      clearTimeout(trashToastTimerRef.current)
    }
    setTrashToast(null)
    triggerToast("Action undone")
  }

  const handleDismissTrashToast = () => {
    if (trashToastTimerRef.current) {
      clearTimeout(trashToastTimerRef.current)
    }
    setTrashToast(null)
  }

  const handleBatchDelete = () => {
    if (selectedEmailIds.length === 0) return
    const deleted = emails.filter((e) => selectedEmailIds.includes(e.id))
    deleteBatchEmails(selectedEmailIds)
    setSelectedEmailIds([])
    showTrashToast(
      deleted,
      deleted.length > 1 ? `${deleted.length} conversations moved to Trash.` : "Conversation moved to Trash."
    )
  }

  const triggerToast = (msg: string) => {
    setSentToast(msg)
    setTimeout(() => setSentToast(null), 3500)
  }

  // Priority Wise Sort handler: sorts INSTANTLY on 1st single click + background Gemini AI enrichment
  const handleTogglePrioritySort = () => {
    const nextSortByPriority = !sortByPriority
    setSortByPriority(nextSortByPriority)

    if (nextSortByPriority) {
      // 1. Instantly sort emails synchronously on first click (zero delay)
      const locallyClassified = classifyEmailsWithKeywords(emails)
      const locallySorted = sortEmailsByPriorityOrder(locallyClassified)
      setEmails(locallySorted)

      // 2. Seamlessly refine with Gemini AI in the background without blocking the UI
      setIsAiSorting(true)
      classifyAndSortEmailsWithGemini(locallySorted)
        .then((result) => {
          setEmails(result.emails)
          if (result.usedGemini) {
            triggerToast("Prioritized with Gemini AI (Meeting timing, duration & urgency)")
          }
        })
        .catch(() => {
          // Keep locally sorted emails
        })
        .finally(() => {
          setIsAiSorting(false)
        })
    }
  }

  const handleApproveDraft = async (email: Email) => {
    const finalContent =
      draftEditText !== null ? draftEditText : email.aiDraft?.suggestedReply || ""
    approveAiDraftAndSend(email.id, finalContent)

    if (email.aiDraft) {
      const isRescheduled =
        email.aiDraft.conflict?.resolved &&
        email.aiDraft.conflict.resolutionType === "rescheduled_conflicting"

      await syncMeetingAndRescheduleToCalendar({
        email,
        slot: email.aiDraft.suggestedSlot,
        taskTitle: email.aiDraft.suggestedTaskTitle,
        conflictingTitle: email.aiDraft.conflict?.conflictingTitle,
        rescheduledToTime: isRescheduled
          ? { start: 14 * 60, end: 15 * 60, label: "2:00 PM - 3:00 PM" }
          : undefined,
      })
    }

    setDraftEditText(null)
    triggerToast("Email sent! Meeting scheduled & synced with Calendar and To-Do list.")
  }

  const handleResolveConflictWithAlternative = (email: Email) => {
    resolveDraftConflict(email.id, "alternative")
    const altSlot =
      email.aiDraft?.conflict?.alternativeSlot || "Thursday, Oct 31 • 11:30 AM - 12:15 PM"
    const senderFirst = email.senderName.split(" ")[0] || email.senderName
    const altReply = `Hi ${senderFirst},\n\nThanks for reaching out! Let's meet at ${altSlot}. I have reserved the slot on my calendar.\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
    setDraftEditText(altReply)
    updateEmailDraft(email.id, {
      suggestedSlot: altSlot,
      suggestedReply: altReply,
    })
    triggerToast(`Proposed alternative time: ${altSlot}`)
  }

  const handleAcceptAndRescheduleConflict = async (email: Email) => {
    resolveDraftConflict(email.id, "reschedule")
    const proposed =
      email.aiDraft?.conflict?.proposedSlot || "Thursday, Oct 31 • 9:30 AM - 10:15 AM"
    const conflictingTitle =
      email.aiDraft?.conflict?.conflictingTitle || "Sprint Retrospective & Team Sync"

    // Reschedule conflicting event/task to 2:00 PM on the calendar
    const { addEventLocal } = useEventsStore.getState()
    addEventLocal({
      title: conflictingTitle,
      date: "2026-10-31",
      end_date: "2026-10-31",
      start_time: 14 * 60, // 2:00 PM
      end_time: 15 * 60,   // 3:00 PM
      description: `Rescheduled to 2:00 PM to accommodate sync with ${email.senderName}.`,
      color: "#f59e0b",
      goalType: "Weekly",
      goal: "Sprint Deliverables",
    })

    const senderFirst = email.senderName.split(" ")[0] || email.senderName
    const acceptedReply = `Hi ${senderFirst},\n\nThanks for following up! ${proposed} works great for our sync. I have adjusted my schedule and reserved the slot.\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
    setDraftEditText(acceptedReply)
    updateEmailDraft(email.id, {
      suggestedReply: acceptedReply,
    })
    triggerToast(`"${conflictingTitle}" rescheduled to 2:00 PM in Calendar & To-Do list!`)
  }

  const handleRefineDraftWithPrompt = async (instructionToUse?: string) => {
    if (!selectedEmail) return
    const promptText = (instructionToUse || aiPromptInstruction).trim()
    if (!promptText) return

    setIsRefiningDraft(true)
    try {
      const currentText =
        draftEditText !== null
          ? draftEditText
          : selectedEmail.aiDraft?.suggestedReply || ""
      const refined = await refineDraftWithAiPrompt(selectedEmail, currentText, promptText)
      setDraftEditText(refined)
      updateEmailDraft(selectedEmail.id, { suggestedReply: refined })
      triggerToast(`Draft updated: "${promptText}"`)
      setAiPromptInstruction("")
    } catch {
      triggerToast("Could not refine draft.")
    } finally {
      setIsRefiningDraft(false)
    }
  }

  const handleGenerateContextualDraft = async (email: Email) => {
    setIsGeneratingDraft(true)
    try {
      const newDraft = await generateContextualDraft(email)
      setAiDraftForEmail(email.id, newDraft)
      setDraftEditText(newDraft.suggestedReply)
      triggerToast(
        newDraft.conflict?.hasConflict
          ? "AI Draft ready: Schedule conflict detected and handled!"
          : "Contextual AI Draft generated!"
      )
    } catch {
      triggerToast("Failed to generate draft.")
    } finally {
      setIsGeneratingDraft(false)
    }
  }

  useEffect(() => {
    getGoogleProviderToken().then((token) => {
      if (token) {
        setIsGmailConnected(true)
      }
    })
  }, [])

  const handleConnectOrSyncGmail = async () => {
    setIsGmailFetching(true)
    try {
      const token = await getGoogleProviderToken()
      if (token) {
        triggerToast("Fetching top 20 actual emails from Gmail...")
        const liveEmails = await fetchTop20GmailMessages(token)
        if (liveEmails.length > 0) {
          setEmails(liveEmails)
          setIsGmailConnected(true)
          triggerToast(`Loaded top ${liveEmails.length} emails from your Gmail inbox!`)
        } else {
          triggerToast("Connected to Gmail, but no inbox emails found.")
        }
      } else {
        triggerToast("Redirecting to Google Sign-In...")
        const res = await connectGmailAccount()
        if (res.error) {
          triggerToast(`Google sign-in error: ${res.error}`)
        }
      }
    } catch (err: any) {
      triggerToast(err?.message || "Failed to fetch Gmail emails.")
    } finally {
      setIsGmailFetching(false)
    }
  }

  const handleSendManualReply = (emailId: string) => {
    if (!replyText.trim()) return
    sendReply(emailId, replyText.trim())
    setReplyText("")
    triggerToast("Reply sent successfully!")
  }

  const handleSendDraft = (draftId: string) => {
    sendDraft(draftId)
    triggerToast("Draft sent successfully!")
  }

  const handleSendCompose = () => {
    if (!composeTo.trim() && !composeSubject.trim() && !composeBody.trim()) {
      setIsComposeOpen(false)
      return
    }
    composeEmail({
      recipientEmail: composeTo.trim() || "recipient@example.com",
      subject: composeSubject.trim() || "(No Subject)",
      body: composeBody.trim(),
      priority: composePriority,
      isDraft: false,
    })
    setComposeTo("")
    setComposeSubject("")
    setComposeBody("")
    setComposePriority("medium")
    setIsComposeOpen(false)
    triggerToast("Email sent successfully!")
  }

  const handleSaveDraftCompose = () => {
    composeEmail({
      recipientEmail: composeTo.trim() || "draft@example.com",
      subject: composeSubject.trim() || "(Untitled Draft)",
      body: composeBody.trim(),
      priority: composePriority,
      isDraft: true,
    })
    setComposeTo("")
    setComposeSubject("")
    setComposeBody("")
    setComposePriority("medium")
    setIsComposeOpen(false)
    triggerToast("Draft saved to Draft folder!")
  }

  const folderTitle =
    activeFolder === "inbox"
      ? "Inbox"
      : activeFolder === "starred"
      ? "Starred"
      : activeFolder === "draft"
      ? "Drafts"
      : "Sent"

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#f3f3f2] pt-[116px] px-4 pb-4">
      {/* Gmail-Style Bottom-Left "Conversation moved to Trash" Toast with Undo (5s) */}
      {trashToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-4 rounded-lg bg-white px-4 py-3 text-sm text-neutral-800 shadow-[0_6px_24px_rgba(0,0,0,0.18)] border border-gray-200/90 select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="text-neutral-700 font-normal">{trashToast.message}</span>
          <button
            type="button"
            onClick={handleUndoTrash}
            className="text-[#1a73e8] hover:text-[#174ea6] font-semibold text-sm cursor-pointer transition-colors hover:underline active:scale-95"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleDismissTrashToast}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Other Action Notifications */}
      {sentToast && !trashToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full border border-gray-300 bg-[#ececeb] px-5 py-3 text-sm font-semibold text-neutral-800 shadow-[0_12px_40px_rgba(0,0,0,0.14)] transition-all">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>{sentToast}</span>
        </div>
      )}

      {/* Compose Mail Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-[20050] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsComposeOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-gray-300 bg-neutral-100 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div className="text-xl font-bold tracking-tight text-neutral-800">New Message</div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsComposeOpen(false)}
                className="h-10 w-10 rounded-full border border-gray-200 bg-[#e7e7e6] hover:bg-[#dddddc] text-[#404040] p-0 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-neutral-500 font-medium">From:</span>
                <select
                  value={senderAccount}
                  onChange={(e) => setSenderAccount(e.target.value)}
                  className="rounded-xl border border-gray-300/80 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 outline-none"
                >
                  {availableSenders.map((s) => (
                    <option key={s} value={s.split(" ")[0]}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <input
                  type="email"
                  placeholder="To: recipient@example.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300/80 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500"
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300/80 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500"
                />
              </div>

              {/* Priority Selectors */}
              <div className="flex items-center gap-2 pt-1 text-xs font-medium">
                <span className="text-neutral-500">Priority:</span>
                <button
                  type="button"
                  onClick={() => setComposePriority("high")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    composePriority === "high"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "border border-gray-300/60 bg-[#e7e7e6] text-neutral-600 hover:bg-[#dddddc]"
                  }`}
                >
                  🔴 High
                </button>
                <button
                  type="button"
                  onClick={() => setComposePriority("medium")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    composePriority === "medium"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "border border-gray-300/60 bg-[#e7e7e6] text-neutral-600 hover:bg-[#dddddc]"
                  }`}
                >
                  🟡 Medium
                </button>
                <button
                  type="button"
                  onClick={() => setComposePriority("low")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    composePriority === "low"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "border border-gray-300/60 bg-[#e7e7e6] text-neutral-600 hover:bg-[#dddddc]"
                  }`}
                >
                  🟢 Low
                </button>
              </div>

              <div>
                <textarea
                  rows={8}
                  placeholder="Type your message here..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300/80 bg-white p-4 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500 leading-relaxed"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={handleSaveDraftCompose}
                className="rounded-full text-xs font-semibold text-neutral-600 hover:bg-black/5 px-4 py-2"
              >
                Save as Draft
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsComposeOpen(false)}
                  className="rounded-full text-xs text-neutral-600 hover:bg-black/5 px-4 py-2"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSendCompose}
                  className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-6 py-2.5 font-semibold shadow-md transition-all hover:scale-105 active:scale-95 flex items-center"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send Message
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Mail Container */}
      <div className="flex h-full w-full min-h-0 overflow-hidden rounded-[28px] border border-gray-300/80 bg-[#ececeb] shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
        {/* VIEW 1: FULL PAGE MAILBOX OVERVIEW (When no email is selected) */}
        {!selectedEmail ? (
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#ececeb]">
            {/* Header: All | High (x) | Med (y) | Low (z) | Priority Wise */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300/70 px-6 py-3.5 bg-[#ececeb]">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Fast Priority Filter Pills: All | High | Med | Low */}
                <div className="flex items-center rounded-full border border-gray-300/80 bg-[#dededc] p-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("all")}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                      priorityFilter === "all"
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-600 hover:text-neutral-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("high")}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                      priorityFilter === "high"
                        ? "bg-white text-rose-700 shadow-sm"
                        : "text-neutral-600 hover:text-rose-700"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    High ({highCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("medium")}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                      priorityFilter === "medium"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-neutral-600 hover:text-amber-700"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Med ({mediumCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("low")}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                      priorityFilter === "low"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-neutral-600 hover:text-emerald-700"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Low ({lowCount})
                  </button>
                </div>

                {/* Priority Sort Toggle */}
                <button
                  type="button"
                  onClick={handleTogglePrioritySort}
                  title="Toggle priority ordering (High to Low)"
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                    sortByPriority
                      ? "border-gray-400 bg-[#dddddd] text-neutral-900 shadow-xs"
                      : "border-gray-300/80 bg-[#e7e7e6] text-neutral-600 hover:bg-[#dddddc]"
                  }`}
                >
                  <ArrowUpDown className={`h-3.5 w-3.5 ${isAiSorting ? "animate-spin text-neutral-700" : ""}`} />
                  <span>Priority Wise</span>
                </button>

                {/* Connect / Sync Gmail Button */}
                <button
                  type="button"
                  onClick={handleConnectOrSyncGmail}
                  disabled={isGmailFetching}
                  title="Connect your Google Account to fetch top 20 actual emails from your Gmail inbox"
                  className="flex items-center gap-1.5 rounded-full border border-gray-300/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-800 shadow-2xs hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <GoogleIcon className="h-3.5 w-3.5" />
                  <span>
                    {isGmailFetching
                      ? "Fetching Gmail..."
                      : isGmailConnected
                      ? "Sync Gmail (Top 20)"
                      : "Connect Gmail"}
                  </span>
                </button>
              </div>

              {searchQuery && (
                <div className="flex items-center gap-2 rounded-full border border-gray-300/80 bg-[#dededc] px-3 py-1 text-xs font-medium text-neutral-700">
                  <span>Filtered: &ldquo;{searchQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="font-bold text-neutral-500 hover:text-neutral-800"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* SELECTION TOOLBAR (Select options like Mail: Master Checkbox + Dropdown + Bulk Actions) */}
            <div className="flex items-center justify-between border-b border-gray-300/60 px-6 py-2.5 bg-[#ececeb] text-xs text-neutral-600">
              <div className="flex items-center gap-3">
                {/* Master Checkbox with Dropdown Trigger */}
                <div ref={selectDropdownRef} className="relative flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleMasterCheckboxClick}
                    className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition-all shrink-0 ${
                      allDisplayedSelected || isSomeSelected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-gray-300 bg-white/90 hover:border-gray-500"
                    }`}
                    title={allDisplayedSelected ? "Deselect All" : "Select All"}
                  >
                    {allDisplayedSelected ? (
                      <Check className="h-3 w-3 stroke-[3]" />
                    ) : isSomeSelected ? (
                      <Minus className="h-3 w-3 stroke-[3]" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSelectDropdownOpen(!isSelectDropdownOpen)}
                    className="flex h-5 w-4 items-center justify-center text-neutral-400 hover:text-neutral-700 transition-colors"
                    title="Select options"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {/* Dropdown Menu (All, None, Read, Unread, Starred, Unstarred) */}
                  {isSelectDropdownOpen && (
                    <div className="absolute left-0 top-7 z-50 w-36 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("all")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("none")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        None
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("read")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        Read
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("unread")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        Unread
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("starred")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        Starred
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilter("unstarred")}
                        className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-[#ececeb] rounded-xl transition-colors"
                      >
                        Unstarred
                      </button>
                    </div>
                  )}
                </div>

                {/* Bulk Action Buttons if emails are selected */}
                {selectedEmailIds.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-neutral-800 text-xs mr-1">
                      {selectedEmailIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={handleBatchMarkAsRead}
                      title="Mark as Read"
                      className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-all shadow-2xs"
                    >
                      <MailOpen className="h-3.5 w-3.5 text-neutral-600" />
                      <span>Read</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchMarkAsUnread}
                      title="Mark as Unread"
                      className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-all shadow-2xs"
                    >
                      <Mail className="h-3.5 w-3.5 text-neutral-600" />
                      <span>Unread</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchToggleStar}
                      title="Star / Unstar"
                      className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-all shadow-2xs"
                    >
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      <span>Star</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      title="Delete Selected"
                      className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-all shadow-2xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      <span>Delete</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEmailIds([])}
                      title="Deselect All"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-black/5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] font-medium text-neutral-500">
                    Select emails to perform bulk actions
                  </span>
                )}
              </div>

              {/* Counts display */}
              <div className="text-[11px] font-medium text-neutral-500 tabular-nums">
                1–{displayedEmails.length} of {folderEmails.length}
              </div>
            </div>

            {/* Full-Width Email Rows List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-200/80 bg-[#ececeb]">
              {displayedEmails.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
                  <Inbox className="h-10 w-10 text-neutral-400" />
                  <p className="mt-3 text-sm font-medium text-neutral-500">
                    No emails matching current criteria in {folderTitle}
                  </p>
                </div>
              ) : (
                displayedEmails.map((email) => {
                  const isChecked = selectedEmailIds.includes(email.id)
                  const isOpened = !email.unread

                  return (
                    <div
                      key={email.id}
                      onClick={() => selectEmail(email.id)}
                      className={`group flex w-full items-center gap-3.5 px-6 py-4 text-left transition-all duration-150 cursor-pointer ${
                        isChecked
                          ? "bg-[#dededc] border-l-2 border-neutral-700"
                          : isOpened
                          ? "bg-[#e8e8e6]/50 opacity-75 hover:opacity-100 hover:bg-[#f3f3f2]"
                          : "bg-[#ececeb] opacity-100 hover:bg-[#f3f3f2]"
                      }`}
                    >
                      {/* Selection Checkbox (like Gmail) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelectEmail(email.id)
                        }}
                        className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition-all shrink-0 ${
                          isChecked
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-gray-300 bg-white/90 hover:border-gray-500"
                        }`}
                        title={isChecked ? "Deselect" : "Select"}
                      >
                        {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                      </button>

                      {/* Star & Priority-Colored Read/Unread Dot */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStarEmail(email.id)
                          }}
                          className="text-neutral-400 hover:text-amber-500 transition-colors p-1"
                          title={email.starred ? "Unstar" : "Star"}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              email.starred ? "text-amber-400 fill-amber-400" : ""
                            }`}
                          />
                        </button>
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${
                            email.unread
                              ? email.priority === "high"
                                ? "bg-rose-500 shadow-2xs"
                                : email.priority === "medium"
                                ? "bg-amber-500 shadow-2xs"
                                : "bg-emerald-500 shadow-2xs"
                              : "bg-transparent"
                          }`}
                          title={email.unread ? `Unread (${email.priority.toUpperCase()} priority)` : "Read"}
                        />
                      </div>

                      {/* Sender */}
                      <div className="flex items-center gap-3 w-44 shrink-0 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dedddc] border border-white/60 font-bold text-xs text-neutral-700 shrink-0 shadow-xs">
                          {email.senderName.charAt(0)}
                        </div>
                        <span
                          className={`truncate text-sm ${
                            email.unread
                              ? "font-bold text-neutral-900"
                              : "font-normal text-neutral-600"
                          }`}
                        >
                          {email.senderName}
                        </span>
                      </div>

                      {/* Subject, Snippet & Meeting Badges */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span
                          className={`shrink-0 text-sm ${
                            email.unread
                              ? "font-bold text-neutral-900"
                              : "font-normal text-neutral-600"
                          }`}
                        >
                          {email.subject}
                        </span>

                        {/* Meeting Timing & Duration Badge */}
                        {email.meetingInfo?.hasMeeting && (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-neutral-700 shadow-2xs">
                            <Calendar className="h-3 w-3 text-neutral-600" />
                            <span>
                              {email.meetingInfo.duration
                                ? email.meetingInfo.duration
                                : "Meeting"}
                              {email.meetingInfo.timing
                                ? ` • ${email.meetingInfo.timing}`
                                : ""}
                            </span>
                          </span>
                        )}

                        <span className="text-neutral-400">—</span>
                        <span
                          className={`truncate text-xs ${
                            email.unread ? "text-neutral-600" : "text-neutral-400"
                          }`}
                        >
                          {email.body.replace(/\n+/g, " ")}
                        </span>
                      </div>

                      {/* Right: Timestamp & Hover Delete Button */}
                      <div className="relative flex items-center justify-end w-24 shrink-0">
                        <span className="text-xs font-medium text-neutral-400 group-hover:opacity-0 transition-opacity tabular-nums">
                          {email.timestamp}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteEmail(email.id)
                            showTrashToast([email], "Conversation moved to Trash.")
                          }}
                          title="Delete"
                          className="absolute right-0 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-full text-neutral-400 hover:text-rose-600 hover:bg-black/5 active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          /* VIEW 2: SPLIT VIEW (Left: Opened Email Conversation, Right: Mailbox Overview List) */
          <>
            {/* LEFT COLUMN: Opened Email Conversation & Actions */}
            <div className="flex flex-1 flex-col overflow-y-auto bg-neutral-100/90 p-6 md:p-8">
              {/* Back to Full List Button Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => selectEmail(null)}
                  className="rounded-full border border-gray-300/80 bg-[#e7e7e6] hover:bg-[#dddddc] text-[#404040] text-xs font-semibold px-4 py-2 shadow-xs transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to {folderTitle} Overview
                </Button>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      selectedEmail.priority === "high"
                        ? "bg-rose-100 text-rose-700 border border-rose-300"
                        : selectedEmail.priority === "medium"
                        ? "bg-amber-100 text-amber-700 border border-amber-300"
                        : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    }`}
                  >
                    Priority: {selectedEmail.priority.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-neutral-400">
                    {folderTitle}
                  </span>
                </div>
              </div>

              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-5">
                {/* Header */}
                <div className="border-b border-gray-200 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-800">
                      {selectedEmail.subject}
                    </h1>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleStarEmail(selectedEmail.id)}
                        className="p-1.5 rounded-full text-neutral-400 hover:text-amber-500 hover:bg-black/5 transition-colors cursor-pointer"
                        title={selectedEmail.starred ? "Unstar" : "Star"}
                      >
                        <Star
                          className={`h-5 w-5 ${
                            selectedEmail.starred ? "text-amber-400 fill-amber-400" : ""
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteEmail(selectedEmail.id)
                          showTrashToast([selectedEmail], "Conversation moved to Trash.")
                        }}
                        className="p-1.5 rounded-full text-neutral-400 hover:text-rose-600 hover:bg-black/5 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Meeting Details Bar if present */}
                  {selectedEmail.meetingInfo?.hasMeeting && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/80 p-2.5 text-xs text-neutral-700">
                      <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
                        <Calendar className="h-4 w-4 text-neutral-700" />
                        <span>Detected Meeting:</span>
                      </div>
                      {selectedEmail.meetingInfo.timing && (
                        <span className="flex items-center gap-1 rounded-md bg-[#e7e7e6] px-2 py-0.5 text-neutral-800">
                          <Clock className="h-3 w-3" />
                          {selectedEmail.meetingInfo.timing}
                        </span>
                      )}
                      {selectedEmail.meetingInfo.duration && (
                        <span className="rounded-md bg-[#e7e7e6] px-2 py-0.5 text-neutral-800">
                          Duration: {selectedEmail.meetingInfo.duration}
                        </span>
                      )}
                      {selectedEmail.priorityReason && (
                        <span className="text-neutral-500 text-[11px] ml-auto italic">
                          {selectedEmail.priorityReason}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dedddc] border border-white/60 font-bold text-sm text-neutral-700 shadow-inner">
                        {selectedEmail.senderName.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {selectedEmail.senderName}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {selectedEmail.senderEmail}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-medium text-neutral-400 tabular-nums">
                      {selectedEmail.timestamp}
                    </div>
                  </div>
                </div>

                {/* AI Auto-Draft Card */}
                {selectedEmail.aiDraft && selectedEmail.aiDraft.status === "pending_approval" && (
                  <div className="rounded-2xl border border-gray-300 bg-[#ececeb] p-5 shadow-xs mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white shadow-xs">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                            <span>AI Contextual Response</span>
                            {selectedEmail.aiDraft.conflict?.hasConflict && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  selectedEmail.aiDraft.conflict.resolved
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    : "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                                }`}
                              >
                                {selectedEmail.aiDraft.conflict.resolved ? "Conflict Resolved" : "Conflict Detected"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500">
                            Evaluated against Calendar Events, Goals &amp; To-Do Tasks
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissAiDraft(selectedEmail.id)}
                        className="text-neutral-400 hover:text-neutral-600 p-1 rounded-full hover:bg-black/5"
                        title="Dismiss AI Draft"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Schedule Conflict Alert & Resolution Controls */}
                    {selectedEmail.aiDraft.conflict?.hasConflict && (
                      <div
                        className={`mt-3.5 rounded-xl border p-3.5 transition-all ${
                          selectedEmail.aiDraft.conflict.resolved
                            ? "border-emerald-300 bg-emerald-500/10 text-emerald-950"
                            : "border-amber-300 bg-amber-500/10 text-amber-950"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {selectedEmail.aiDraft.conflict.resolved ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold">
                                {selectedEmail.aiDraft.conflict.resolved
                                  ? "Schedule Conflict Resolved"
                                  : "Schedule Conflict Detected"}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  selectedEmail.aiDraft.conflict.resolved
                                    ? "bg-emerald-200 text-emerald-800"
                                    : "bg-amber-200 text-amber-900"
                                }`}
                              >
                                {selectedEmail.aiDraft.conflict.resolved ? "Synced" : "Action Needed"}
                              </span>
                            </div>

                            <p className="mt-1 text-neutral-700 leading-relaxed">
                              {selectedEmail.aiDraft.conflict.resolved
                                ? selectedEmail.aiDraft.conflict.resolutionType === "rescheduled_conflicting"
                                  ? `Conflicting task "${selectedEmail.aiDraft.conflict.conflictingTitle}" has been moved to 2:00 PM in your Calendar & To-Do list. Meeting confirmed for 9:30 AM.`
                                  : `Proposed alternative open slot (${selectedEmail.aiDraft.conflict.alternativeSlot}) has been set in your drafted reply.`
                                : `The requested meeting conflicts with scheduled ${selectedEmail.aiDraft.conflict.conflictingType} "${selectedEmail.aiDraft.conflict.conflictingTitle}" (${selectedEmail.aiDraft.conflict.conflictingTime}). Choose how to manage it:`}
                            </p>

                            {!selectedEmail.aiDraft.conflict.resolved && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflictWithAlternative(selectedEmail)}
                                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
                                >
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Propose Alternative ({selectedEmail.aiDraft.conflict.alternativeSlot.split("•")[1]?.trim() || "11:30 AM"})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAcceptAndRescheduleConflict(selectedEmail)}
                                  className="flex items-center gap-1.5 rounded-lg border border-amber-400 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 active:scale-95 transition-all cursor-pointer"
                                >
                                  <Calendar className="h-3.5 w-3.5 text-amber-400" />
                                  <span>Accept &amp; Reschedule Task to 2:00 PM</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Proposed Slot & Linked Task Previews */}
                    <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {selectedEmail.aiDraft.suggestedSlot && (
                        <div className="flex items-center gap-2 rounded-xl border border-gray-300/70 bg-white/90 p-2.5 text-neutral-800">
                          <Calendar className="h-4 w-4 text-neutral-600 shrink-0" />
                          <div>
                            <div className="font-semibold text-neutral-900">Meeting Slot</div>
                            <div className="text-[11px] text-neutral-600">
                              {selectedEmail.aiDraft.suggestedSlot}
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedEmail.aiDraft.suggestedTaskTitle && (
                        <div className="flex items-center gap-2 rounded-xl border border-gray-300/70 bg-white/90 p-2.5 text-neutral-800">
                          <CheckSquare className="h-4 w-4 text-neutral-600 shrink-0" />
                          <div>
                            <div className="font-semibold text-neutral-900">Linked To-Do Task</div>
                            <div className="text-[11px] text-neutral-600 truncate">
                              {selectedEmail.aiDraft.suggestedTaskTitle}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Draft Body Editable */}
                    <div className="mt-3.5">
                      <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                        Draft Message Text
                      </label>
                      <textarea
                        rows={5}
                        value={
                          draftEditText !== null
                            ? draftEditText
                            : selectedEmail.aiDraft.suggestedReply
                        }
                        onChange={(e) => setDraftEditText(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300/80 bg-white p-3 text-sm text-neutral-800 leading-relaxed outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400 font-normal"
                      />
                    </div>

                    {/* Interactive AI Changing Box ("Ask AI to Change Draft") */}
                    <div className="mt-3.5 rounded-xl border border-gray-300/80 bg-[#f7f7f6] p-3 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                          <Sparkles className="h-3.5 w-3.5 text-neutral-900" />
                          <span>AI Prompt Modification Box</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-medium">Powered by Gemini AI</span>
                      </div>

                      {/* Quick prompt suggestion chips */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        {[
                          { label: "✨ More Polite", prompt: "Make the tone warmer, more polite, and express excitement to sync" },
                          { label: "⚡ Make Concise", prompt: "Make the reply concise, brief, and to the point (2-3 sentences max)" },
                          { label: "⏱️ Propose 30 Mins", prompt: "Ask if we can keep the sync to 30 minutes instead of 45 minutes" },
                          { label: "📅 Suggest Friday", prompt: "Politely ask to reschedule for Friday morning at 10:00 AM instead" },
                          { label: "💼 Professional", prompt: "Make the draft more formal, executive, and professional" },
                        ].map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            disabled={isRefiningDraft}
                            onClick={() => handleRefineDraftWithPrompt(chip.prompt)}
                            className="rounded-full border border-gray-300/90 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom Prompt Input & Refine Button */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={aiPromptInstruction}
                          onChange={(e) => setAiPromptInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleRefineDraftWithPrompt()
                            }
                          }}
                          placeholder="Type prompt to change draft (e.g. 'Add request for slide deck', 'Sound more casual')..."
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
                        />
                        <button
                          type="button"
                          disabled={isRefiningDraft || !aiPromptInstruction.trim()}
                          onClick={() => handleRefineDraftWithPrompt()}
                          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                        >
                          <Wand2 className={`h-3 w-3 ${isRefiningDraft ? "animate-spin" : ""}`} />
                          <span>{isRefiningDraft ? "Modifying..." : "Update Draft"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Sender Identity & Action Buttons */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-300/70 pt-3">
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <span>Sending from:</span>
                        <span className="font-semibold text-neutral-800">{senderAccount}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => dismissAiDraft(selectedEmail.id)}
                          className="rounded-full text-xs font-semibold text-neutral-600 hover:bg-black/5 px-4 py-2"
                        >
                          Dismiss
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleApproveDraft(selectedEmail)}
                          className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 shadow-md text-xs px-5 py-2 font-semibold transition-all hover:scale-105 active:scale-95"
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Approve &amp; Sync to Calendar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* If Email has NO active draft: Show On-Demand Contextual Draft Generator */}
                {(!selectedEmail.aiDraft || selectedEmail.aiDraft.status === "dismissed") && !selectedEmail.isDraft && (
                  <div className="mb-5 flex items-center justify-between rounded-2xl border border-gray-300 bg-[#ececeb] p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white shadow-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-900">
                          Generate Contextual AI Draft
                        </div>
                        <div className="text-[11px] text-neutral-600">
                          Evaluates Calendar &amp; Tasks for timing conflicts and crafts a situation-aware reply
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      disabled={isGeneratingDraft}
                      onClick={() => handleGenerateContextualDraft(selectedEmail)}
                      className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-4 py-1.5 font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Sparkles className={`mr-1.5 h-3 w-3 ${isGeneratingDraft ? "animate-spin" : ""}`} />
                      <span>{isGeneratingDraft ? "Drafting..." : "Generate Draft"}</span>
                    </Button>
                  </div>
                )}

                {/* Email Content Body */}
                <div className="text-neutral-800 text-sm md:text-base leading-relaxed whitespace-pre-line font-normal">
                  {selectedEmail.body}
                </div>

                {/* If Selected Email is a Draft: Show Send Draft Action */}
                {selectedEmail.isDraft ? (
                  <div className="mt-6 flex justify-end">
                    <Button
                      type="button"
                      onClick={() => handleSendDraft(selectedEmail.id)}
                      className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-6 py-2.5 font-semibold shadow-md transition-all hover:scale-105 active:scale-95"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send Draft
                    </Button>
                  </div>
                ) : (
                  /* Manual Reply Form */
                  <div className="mt-6 rounded-2xl border border-gray-300/80 bg-[#ececeb] p-4">
                    <div className="text-xs font-semibold text-neutral-600 mb-2">Write a Reply</div>
                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply as ${senderAccount}...`}
                      className="w-full rounded-xl border border-gray-300/80 bg-white p-3 text-sm text-neutral-800 outline-none focus:border-neutral-500 placeholder:text-neutral-400"
                    />
                    <div className="mt-2.5 flex justify-end">
                      <Button
                        type="button"
                        onClick={() => handleSendManualReply(selectedEmail.id)}
                        disabled={!replyText.trim()}
                        className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-5 py-2 font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Send Reply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Mailbox Overview List */}
            <div className="flex w-full md:w-[380px] lg:w-[420px] shrink-0 flex-col border-l border-gray-300/70 bg-[#ececeb]">
              {/* Header with expand to full page button */}
              <div className="flex items-center justify-between border-b border-gray-300/70 px-4 py-3 bg-[#e7e7e6]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    {folderTitle} ({displayedEmails.length})
                  </span>
                  {sortByPriority && (
                    <span className="rounded-full bg-[#dededc] px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                      Priority Wise
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => selectEmail(null)}
                  title="Expand to Full Page Overview"
                  className="flex items-center gap-1 rounded-full border border-gray-300/80 bg-white/70 px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-white hover:text-neutral-800 transition-all active:scale-95 shadow-xs"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Full View</span>
                </button>
              </div>

              {searchQuery && (
                <div className="flex items-center justify-between border-b border-gray-200 bg-neutral-200/50 px-4 py-2 text-xs text-neutral-600">
                  <span className="truncate">Filter: &ldquo;{searchQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="ml-2 font-semibold text-neutral-500 hover:text-neutral-800"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto divide-y divide-gray-200/80">
                {displayedEmails.map((email) => {
                  const isSelected = selectedEmail?.id === email.id
                  const isOpened = !email.unread

                  return (
                    <div
                      key={email.id}
                      onClick={() => selectEmail(email.id)}
                      className={`group flex w-full flex-col gap-1.5 p-4 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#dddddd] shadow-xs"
                          : isOpened
                          ? "bg-[#e8e8e6]/40 opacity-75 hover:opacity-100 hover:bg-[#f3f3f2]"
                          : "hover:bg-[#f3f3f2] opacity-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {email.unread && (
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                email.priority === "high"
                                  ? "bg-rose-500 shadow-2xs"
                                  : email.priority === "medium"
                                  ? "bg-amber-500 shadow-2xs"
                                  : "bg-emerald-500 shadow-2xs"
                              }`}
                              title={`Priority: ${email.priority.toUpperCase()}`}
                            />
                          )}
                          <span
                            className={`truncate text-sm ${
                              email.unread
                                ? "font-bold text-neutral-900"
                                : "font-normal text-neutral-600"
                            }`}
                          >
                            {email.senderName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleStarEmail(email.id)
                            }}
                            className="text-neutral-400 hover:text-amber-500 transition-colors p-1"
                            title={email.starred ? "Unstar" : "Star"}
                          >
                            <Star
                              className={`h-4 w-4 ${
                                email.starred
                                  ? "text-amber-400 fill-amber-400"
                                  : ""
                              }`}
                            />
                          </button>
                          <div className="relative flex items-center justify-end">
                            <span className="text-xs text-neutral-400 group-hover:opacity-0 transition-opacity tabular-nums">
                              {email.timestamp}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteEmail(email.id)
                                showTrashToast([email], "Conversation moved to Trash.")
                              }}
                              title="Delete"
                              className="absolute right-0 opacity-0 group-hover:opacity-100 transition-all p-1 text-neutral-400 hover:text-rose-600 hover:bg-black/5 rounded-full active:scale-95"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-xs ${
                            email.unread ? "font-semibold text-neutral-900" : "text-neutral-600 font-normal"
                          }`}
                        >
                          {email.subject}
                        </span>
                      </div>

                      {email.meetingInfo?.hasMeeting && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-600">
                          <Calendar className="h-3 w-3 text-neutral-500" />
                          <span className="truncate">
                            {email.meetingInfo.duration || "Meeting"}
                            {email.meetingInfo.timing ? ` • ${email.meetingInfo.timing}` : ""}
                          </span>
                        </div>
                      )}

                      <p className="line-clamp-2 text-xs leading-relaxed text-neutral-500">
                        {email.body.replace(/\n+/g, " ")}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
