import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react"
import {
  Inbox,
  Send,
  Star,
  Sparkles,
  CheckCircle2,
  X,
  Calendar,
  CheckSquare,
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
  ExternalLink,
} from "lucide-react"
import { useEmailStore, type Email, type EmailPriority } from "@/store/emailStore"
import { useAuthStore } from "@/store/authStore"
import { useEventsStore } from "@/store/eventsStore"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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
  fetchAllGmailFolders,
  getGoogleProviderToken,
  sendGmailDraft,
  sendGmailMessage,
  saveGmailDraft,
} from "@/services/gmailApiService"
import EmailHtmlViewer from "./EmailHtmlViewer"

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

interface SmartReplyComposerProps {
  email: Email
  senderAccount: string
  replyText: string
  onReplyTextChange: (text: string) => void
  isGeneratingDraft: boolean
  isRefiningDraft: boolean
  isSending: boolean
  onGenerateDraft: () => void
  onRefineWithPrompt: (instructionToUse?: string) => void
  aiPromptInstruction: string
  onAiPromptInstructionChange: (instruction: string) => void
  onResolveAlternative: () => void
  onAcceptAndReschedule: () => void
  onClearDraft: () => void
  onSendReply: (text: string) => void
}

const SmartReplyComposer = memo(function SmartReplyComposer({
  email,
  senderAccount,
  replyText,
  onReplyTextChange,
  isGeneratingDraft,
  isRefiningDraft,
  isSending,
  onGenerateDraft,
  onRefineWithPrompt,
  aiPromptInstruction,
  onAiPromptInstructionChange,
  onResolveAlternative,
  onAcceptAndReschedule,
  onClearDraft,
  onSendReply,
}: SmartReplyComposerProps) {
  return (
    <div className="mt-2 rounded-2xl border border-gray-300/80 bg-[#ececeb] p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
      {/* Header: Reply-to Details and Generate AI Draft Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white font-bold text-xs shrink-0 shadow-xs">
            {email.senderName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-neutral-900 truncate">
              Reply to {email.senderName}
            </div>
            <div className="text-xs text-neutral-500 truncate">
              {email.senderEmail}
            </div>
          </div>
        </div>

        <Button
          type="button"
          disabled={isGeneratingDraft}
          onClick={onGenerateDraft}
          className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-3.5 py-1.5 font-semibold transition-all shadow-xs cursor-pointer active:scale-95 shrink-0 flex items-center gap-1.5 ml-auto"
        >
          <Sparkles className={`h-3.5 w-3.5 ${isGeneratingDraft ? "animate-spin text-amber-300" : "text-amber-400"}`} />
          <span>
            {isGeneratingDraft
              ? "Drafting..."
              : replyText.trim()
              ? "Regenerate AI Draft"
              : "Generate AI Draft"}
          </span>
        </Button>
      </div>

      {/* Schedule Conflict Alert & Resolution Controls */}
      {email.aiDraft?.conflict?.hasConflict && (
        <div
          className={`rounded-xl border p-3.5 transition-all ${
            email.aiDraft.conflict.resolved
              ? "border-emerald-300 bg-emerald-500/10 text-emerald-950"
              : "border-amber-300 bg-amber-500/10 text-amber-950"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {email.aiDraft.conflict.resolved ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">
                  {email.aiDraft.conflict.resolved
                    ? "Schedule Conflict Resolved"
                    : "Schedule Conflict Detected"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    email.aiDraft.conflict.resolved
                      ? "bg-emerald-200 text-emerald-800"
                      : "bg-amber-200 text-amber-900 animate-pulse"
                  }`}
                >
                  {email.aiDraft.conflict.resolved ? "Synced" : "Action Needed"}
                </span>
              </div>

              <p className="mt-1 text-neutral-700 leading-relaxed">
                {email.aiDraft.conflict.resolved
                  ? email.aiDraft.conflict.resolutionType === "rescheduled_conflicting"
                    ? `Conflicting task "${email.aiDraft.conflict.conflictingTitle}" has been moved to 2:00 PM in your Calendar & To-Do list. Meeting confirmed for 9:30 AM.`
                    : `Proposed alternative open slot (${email.aiDraft.conflict.alternativeSlot}) has been set in your drafted reply.`
                  : `The requested meeting conflicts with scheduled ${email.aiDraft.conflict.conflictingType} "${email.aiDraft.conflict.conflictingTitle}" (${email.aiDraft.conflict.conflictingTime}). Choose how to manage it:`}
              </p>

              {!email.aiDraft.conflict.resolved && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onResolveAlternative}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>Propose Alternative ({email.aiDraft.conflict.alternativeSlot.split("•")[1]?.trim() || "11:30 AM"})</span>
                  </button>

                  <button
                    type="button"
                    onClick={onAcceptAndReschedule}
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
      {((email.meetingInfo?.hasMeeting && email.aiDraft?.suggestedSlot) || email.aiDraft?.suggestedTaskTitle) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {email.meetingInfo?.hasMeeting && email.aiDraft?.suggestedSlot && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-300/70 bg-white/90 p-2 text-neutral-800">
              <Calendar className="h-4 w-4 text-neutral-600 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-neutral-900">Meeting Slot</div>
                <div className="text-[11px] text-neutral-600 truncate">
                  {email.aiDraft.suggestedSlot}
                </div>
              </div>
            </div>
          )}
          {email.aiDraft?.suggestedTaskTitle && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-300/70 bg-white/90 p-2 text-neutral-800">
              <CheckSquare className="h-4 w-4 text-neutral-600 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-neutral-900">Linked Action Item</div>
                <div className="text-[11px] text-neutral-600 truncate">
                  {email.aiDraft.suggestedTaskTitle}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft / Reply Body Editable */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Reply Message
          </label>
          {Boolean(replyText.length) && (
            <span className="text-[11px] text-neutral-400">
              {replyText.length} chars
            </span>
          )}
        </div>
        <textarea
          rows={5}
          value={replyText}
          onChange={(e) => onReplyTextChange(e.target.value)}
          placeholder={`Write your reply to ${email.senderName}, or click "Generate AI Draft" above to let Gemini craft one...`}
          className="w-full rounded-xl border border-gray-300/80 bg-white p-3 text-sm text-neutral-800 leading-relaxed outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400 font-sans placeholder:text-neutral-400 transition-all"
        />
      </div>

      {/* Interactive AI Changing Box ("AI Prompt Modification Box") */}
      <div className="rounded-xl border border-gray-300/80 bg-[#f7f7f6] p-3 shadow-2xs">
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
            { label: "✨ More Polite", prompt: "Make the tone warmer, more polite, and express appreciation" },
            { label: "⚡ Make Concise", prompt: "Make the reply concise, brief, and to the point (2-3 sentences max)" },
            { label: "💼 Professional", prompt: "Make the draft more formal, executive, and professional" },
            ...(email.meetingInfo?.hasMeeting
              ? [
                  { label: "⏱️ Propose 30 Mins", prompt: "Ask if we can keep the sync to 30 minutes instead of 45 minutes" },
                  { label: "📅 Suggest Friday", prompt: "Politely ask to reschedule for Friday morning at 10:00 AM instead" },
                ]
              : [
                  { label: "📝 Request More Details", prompt: "Politely ask for any additional documentation or context" },
                  { label: "✅ Confirm Next Steps", prompt: "Confirm agreement and outline immediate next steps" },
                ]),
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={isRefiningDraft}
              onClick={() => onRefineWithPrompt(chip.prompt)}
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
            onChange={(e) => onAiPromptInstructionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onRefineWithPrompt()
              }
            }}
            placeholder="Type prompt to change draft (e.g. 'Add request for slide deck', 'Sound more casual')..."
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
          />
          <button
            type="button"
            disabled={isRefiningDraft || !aiPromptInstruction.trim()}
            onClick={() => onRefineWithPrompt()}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shrink-0"
          >
            <Wand2 className={`h-3 w-3 ${isRefiningDraft ? "animate-spin" : ""}`} />
            <span>{isRefiningDraft ? "Modifying..." : "Update Draft"}</span>
          </button>
        </div>
      </div>

      {/* Sender Identity & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300/70 pt-3">
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <span>Sending from:</span>
          <span className="font-semibold text-neutral-800 truncate max-w-[200px] sm:max-w-xs">{senderAccount}</span>
        </div>

        <div className="flex items-center gap-2">
          {Boolean(replyText.trim()) && (
            <Button
              type="button"
              variant="ghost"
              onClick={onClearDraft}
              className="rounded-full text-xs font-semibold text-neutral-600 hover:bg-black/5 px-3.5 py-2 cursor-pointer"
            >
              Clear
            </Button>
          )}
          <Button
            type="button"
            disabled={!replyText.trim() || isSending}
            onClick={() => onSendReply(replyText)}
            className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 shadow-md text-xs px-5 py-2 font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className={`h-3.5 w-3.5 ${isSending ? "animate-pulse" : ""}`} />
            <span>{isSending ? "Sending..." : "Send Reply"}</span>
          </Button>
        </div>
      </div>
    </div>
  )
})

interface DraftEditorFormProps {
  email: Email
  isSending: boolean
  onSend: (draftId: string, text: string, recipient: string) => Promise<void>
}

const DraftEditorForm = memo(function DraftEditorForm({
  email,
  isSending,
  onSend,
}: DraftEditorFormProps) {
  const [body, setBody] = useState(email.body)
  const [recipient, setRecipient] = useState(email.recipientEmail || "")
  const [promptInput, setPromptInput] = useState("")
  const [isRefining, setIsRefining] = useState(false)

  useEffect(() => {
    setBody(email.body)
    setRecipient(email.recipientEmail || "")
  }, [email.id, email.body, email.recipientEmail])

  const handleRefine = async (instructionToUse?: string) => {
    const p = (instructionToUse || promptInput).trim()
    if (!p || isRefining) return
    setIsRefining(true)
    try {
      const refined = await refineDraftWithAiPrompt(email, body, p)
      setBody(refined)
      setPromptInput("")
    } catch {
      // ignore
    } finally {
      setIsRefining(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="rounded-2xl border border-gray-300/80 bg-[#ececeb] p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-neutral-800">
            Draft Message Content (Edit before sending)
          </div>
          {email.draftId && (
            <span className="text-[10px] font-mono text-neutral-600 bg-white/80 px-2 py-0.5 rounded-md border border-gray-200">
              Gmail Draft
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-600 shrink-0">To:</span>
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 rounded-xl border border-gray-300/80 bg-white px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-500 font-sans"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Draft Body
            </label>
            {Boolean(body.length) && (
              <span className="text-[11px] text-neutral-400">
                {body.length} chars
              </span>
            )}
          </div>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Draft content..."
            className="w-full rounded-xl border border-gray-300/80 bg-white p-3 text-sm text-neutral-800 outline-none focus:border-neutral-500 placeholder:text-neutral-400 font-sans leading-relaxed"
          />
        </div>

        {/* AI Prompt Modification Box for Draft */}
        <div className="rounded-xl border border-gray-300/80 bg-[#f7f7f6] p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
              <Sparkles className="h-3.5 w-3.5 text-neutral-900" />
              <span>AI Prompt Modification Box</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-medium">Powered by Gemini AI</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {[
              { label: "✨ More Polite", prompt: "Make the tone warmer, more polite, and express appreciation" },
              { label: "⚡ Make Concise", prompt: "Make the draft concise, brief, and to the point" },
              { label: "💼 Professional", prompt: "Make the draft more formal, executive, and professional" },
              { label: "📝 Request More Details", prompt: "Politely ask for any additional documentation or context" },
              { label: "✅ Confirm Next Steps", prompt: "Confirm agreement and outline immediate next steps" },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isRefining}
                onClick={() => handleRefine(chip.prompt)}
                className="rounded-full border border-gray-300/90 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleRefine()
                }
              }}
              placeholder="Type prompt to modify draft..."
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
            />
            <button
              type="button"
              disabled={isRefining || !promptInput.trim()}
              onClick={() => handleRefine()}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shrink-0"
            >
              <Wand2 className={`h-3 w-3 ${isRefining ? "animate-spin" : ""}`} />
              <span>{isRefining ? "Modifying..." : "Update Draft"}</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            disabled={isSending || !body.trim()}
            onClick={() => onSend(email.id, body, recipient)}
            className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-6 py-2.5 font-semibold shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className={`h-3.5 w-3.5 ${isSending ? "animate-pulse" : ""}`} />
            <span>{isSending ? "Sending Draft..." : "Send Draft"}</span>
          </Button>
        </div>
      </div>
    </div>
  )
})

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
    setActiveFolder,
    setSearchQuery,
    setSenderAccount,
    setLoggedInUserEmail,
    setPriorityFilter,
    setSortByPriority,
    setEmails,
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

  const [draftEditText, setDraftEditText] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  // Reset local AI draft text when switching selected emails
  useEffect(() => {
    setDraftEditText(null)
  }, [selectedEmailId])
  const [sentToast, setSentToast] = useState<string | null>(null)
  const [trashToast, setTrashToast] = useState<{
    message: string
    emails: Email[]
  } | null>(null)
  const trashToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const user = useAuthStore((state) => state.user)
  const session = useAuthStore((state) => state.session)
  const loggedInEmail = user?.email || session?.user?.email || (typeof window !== "undefined" ? localStorage.getItem("user_email") : null)

  // AI & Priority state
  const [isAiSorting, setIsAiSorting] = useState(false)
  const [aiPromptInstruction, setAiPromptInstruction] = useState("")
  const [isRefiningDraft, setIsRefiningDraft] = useState(false)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [isGmailSyncing, setIsGmailSyncing] = useState(false)
  const [isGmailAuthorizing, setIsGmailAuthorizing] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalReason, setAuthModalReason] = useState("")
  const [authModalActionUrl, setAuthModalActionUrl] = useState<string | null>(null)

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

  // Filter emails by folder and search query (memoized to keep typing fast & lag-free)
  const folderEmails = useMemo(() => {
    return emails.filter((email) => {
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
  }, [emails, activeFolder, searchQuery])

  // Priority counts within current folder
  const { highCount, mediumCount, lowCount } = useMemo(() => {
    let high = 0
    let medium = 0
    let low = 0
    for (const e of folderEmails) {
      if (e.priority === "high") high++
      else if (e.priority === "medium") medium++
      else if (e.priority === "low") low++
    }
    return { highCount: high, mediumCount: medium, lowCount: low }
  }, [folderEmails])

  // Filter by selected priority
  const priorityFilteredEmails = useMemo(() => {
    if (priorityFilter === "all") return folderEmails
    return folderEmails.filter((email) => email.priority === priorityFilter)
  }, [folderEmails, priorityFilter])

  // Order by priority if toggled or default
  const displayedEmails = useMemo(() => {
    return sortByPriority
      ? sortEmailsByPriorityOrder(priorityFilteredEmails)
      : priorityFilteredEmails
  }, [priorityFilteredEmails, sortByPriority])

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

  const handleScopeErrorIfPresent = (result: { code?: string; error?: string }) => {
    if (
      result.code === "GMAIL_INSUFFICIENT_SCOPES" ||
      result.error?.toLowerCase().includes("scope") ||
      result.error?.toLowerCase().includes("insufficient")
    ) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("google_provider_token")
        localStorage.setItem("google_provider_token_rejected", "true")
      }
      setAuthModalActionUrl(null)
      setAuthModalReason(
        "Your current Google authorization only allows reading emails. To send emails and drafts from Waydots, Google requires your permission. Click 'Grant Access with Google' below to grant send and compose permissions."
      )
      setAuthModalOpen(true)
      return true
    }
    return false
  }

  const handleSendReply = async (email: Email, textToSend?: string) => {
    const finalContent = (
      textToSend !== undefined
        ? textToSend
        : draftEditText !== null
        ? draftEditText
        : email.aiDraft?.suggestedReply || ""
    ).trim()

    if (!finalContent) {
      triggerToast("Reply message cannot be empty")
      return
    }

    setIsSending(true)
    try {
      const result = await sendGmailMessage({
        to: email.senderEmail,
        subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
        body: finalContent,
        threadId: email.threadId,
        senderAccount,
      })

      if (!result.success && result.error) {
        if (handleScopeErrorIfPresent(result)) {
          triggerToast("Additional Google permission required to send emails.")
          return
        }
        triggerToast(`Failed to send reply: ${result.error}`)
        return
      }

      // Both manual and generated replies use the exact same sending pathway
      sendReply(email.id, finalContent)
      if (email.aiDraft) {
        dismissAiDraft(email.id)
      }
      setDraftEditText("")

      // Non-blocking calendar sync if meeting info exists
      if (email.meetingInfo?.hasMeeting) {
        try {
          const isRescheduled =
            email.aiDraft?.conflict?.resolved &&
            email.aiDraft.conflict.resolutionType === "rescheduled_conflicting"

          void syncMeetingAndRescheduleToCalendar({
            email,
            slot: email.aiDraft?.suggestedSlot || email.meetingInfo.timing || "Thursday, Oct 31 • 9:30 AM",
            taskTitle: email.aiDraft?.suggestedTaskTitle,
            conflictingTitle: email.aiDraft?.conflict?.conflictingTitle,
            rescheduledToTime: isRescheduled
              ? { start: 14 * 60, end: 15 * 60, label: "2:00 PM - 3:00 PM" }
              : undefined,
          }).catch(() => {})
        } catch {
          // ignore
        }
      }

      triggerToast("Reply sent successfully! Copy added to Sent folder.")
    } catch (err: any) {
      if (!handleScopeErrorIfPresent({ error: err?.message })) {
        triggerToast(`Error sending reply: ${err?.message || "Unknown error"}`)
      }
    } finally {
      setIsSending(false)
    }
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
      const toastLabel = instructionToUse
        ? "Draft updated with AI!"
        : `Draft updated: "${promptText.length > 30 ? promptText.slice(0, 30) + "..." : promptText}"`
      triggerToast(toastLabel)
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

  // Set the logged-in mail id as the primary sender account
  useEffect(() => {
    if (loggedInEmail) {
      setLoggedInUserEmail(loggedInEmail)
    }
  }, [loggedInEmail, setLoggedInUserEmail])

  // Load cached synced Gmail emails for this user immediately on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    const cacheKey = `waydots_gmail_cache_${loggedInEmail || "default"}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEmails(parsed)
        }
      }
    } catch {
      // Ignore cache parse error
    }
  }, [loggedInEmail, setEmails])

  const handleGrantGmailAccess = async () => {
    try {
      setIsGmailAuthorizing(true)
      if (typeof window !== "undefined") {
        localStorage.removeItem("google_provider_token")
        localStorage.removeItem("google_provider_token_rejected")
      }
      const res = await connectGmailAccount()
      if (res.error) {
        triggerToast(res.error)
        setIsGmailAuthorizing(false)
      }
    } catch (err: any) {
      triggerToast(err?.message || "Failed to initialize Google authorization")
      setIsGmailAuthorizing(false)
    }
  }

  // Automatically fetch & sync all Gmail data across Inbox, Starred, Drafts, and Sent
  const syncGmailAutomatically = useCallback(async (isSilent = true) => {
    try {
      const token = await getGoogleProviderToken()
      if (!token) {
        if (!isSilent) {
          setAuthModalReason(
            "To sync all your mail across Inbox, Starred, Drafts, and Sent, please connect your Google account with Gmail access."
          )
          setAuthModalOpen(true)
        }
        return
      }

      setIsGmailSyncing(true)
      const liveEmails = await fetchAllGmailFolders(token, loggedInEmail || undefined)
      if (liveEmails.length > 0) {
        // Merge with existing local drafts/sent that aren't on Gmail yet
        const currentEmails = useEmailStore.getState().emails
        const liveIds = new Set(liveEmails.map((e) => e.id))
        const localDraftsAndSent = currentEmails.filter(
          (e) => !liveIds.has(e.id) && (e.isDraft || e.isSent) && e.id.startsWith("email-")
        )
        const allSynced = [...liveEmails, ...localDraftsAndSent]
        setEmails(allSynced)

        if (typeof window !== "undefined") {
          const cacheKey = `waydots_gmail_cache_${loggedInEmail || "default"}`
          localStorage.setItem(cacheKey, JSON.stringify(allSynced))
          if (window.location.hash.includes("access_token") || window.location.hash.includes("provider_token")) {
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        }

        if (!isSilent) {
          const inboxCount = allSynced.filter((e) => !e.isDraft && !e.isSent).length
          const starredCount = allSynced.filter((e) => e.starred).length
          const draftCount = allSynced.filter((e) => e.isDraft).length
          const sentCount = allSynced.filter((e) => e.isSent).length
          triggerToast(
            `All mail synced: ${inboxCount} inbox, ${starredCount} starred, ${draftCount} drafts, ${sentCount} sent`
          )
        }
      } else {
        if (!isSilent) {
          triggerToast("All mail synced: No emails found in Gmail mailbox.")
        }
      }
    } catch (err: any) {
      if (
        err?.code === "GMAIL_API_DISABLED" ||
        err?.message?.includes("not enabled in your Google Cloud") ||
        err?.message?.includes("is disabled")
      ) {
        const url =
          err?.enableUrl ||
          "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=575734561788"
        setAuthModalActionUrl(url)
        setAuthModalReason(
          "The Gmail API is not yet enabled in your Google Cloud Project (575734561788). To allow Waydots to fetch your Gmail messages, please enable the Gmail API in Google Cloud Console, then click Retry."
        )
        if (!isSilent) {
          setAuthModalOpen(true)
        }
      } else if (
        err?.message?.includes("GMAIL_INSUFFICIENT_SCOPES") ||
        err?.code === "GMAIL_INSUFFICIENT_SCOPES" ||
        err?.status === 403
      ) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("google_provider_token")
          localStorage.setItem("google_provider_token_rejected", "true")
        }
        setAuthModalActionUrl(null)
        setAuthModalReason(
          "Google requires your consent to read your Gmail inbox messages. Click below to grant Gmail read access."
        )
        if (!isSilent) {
          setAuthModalOpen(true)
        }
      } else {
        if (!isSilent) {
          triggerToast(err?.message || "Failed to fetch emails from Gmail")
        }
      }
      console.warn("Gmail sync error:", err)
    } finally {
      setIsGmailSyncing(false)
    }
  }, [loggedInEmail, setEmails])

  useEffect(() => {
    void syncGmailAutomatically(true)
  }, [syncGmailAutomatically])

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.provider_token) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("google_provider_token_rejected")
          localStorage.setItem("google_provider_token", session.provider_token)
        }
        void syncGmailAutomatically(true)
      }
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [syncGmailAutomatically])




  const handleSendDraft = useCallback(
    async (draftId: string, textToSend: string, recipientToSend: string) => {
      const email = emails.find((e) => e.id === draftId)
      if (!email) return

      setIsSending(true)
      try {
        const result = await sendGmailDraft({
          draftId: email.draftId,
          to: recipientToSend || "recipient@example.com",
          subject: email.subject,
          body: textToSend,
          threadId: email.threadId,
        })

        if (!result.success && result.error) {
          if (handleScopeErrorIfPresent(result)) {
            triggerToast("Additional Google permission required to send drafts.")
            return
          }
          triggerToast(`Failed to send draft: ${result.error}`)
          return
        }

        sendDraft(draftId, textToSend, recipientToSend)
        setActiveFolder("sent")
        triggerToast("Draft sent successfully! Moved to Sent folder.")
      } catch (err: any) {
        if (!handleScopeErrorIfPresent({ error: err?.message })) {
          triggerToast(`Error sending draft: ${err?.message || "Unknown error"}`)
        }
      } finally {
        setIsSending(false)
      }
    },
    [emails, sendDraft, setActiveFolder]
  )

  const handleSendCompose = async () => {
    if (!composeTo.trim() && !composeSubject.trim() && !composeBody.trim()) {
      setIsComposeOpen(false)
      return
    }

    const to = composeTo.trim() || "recipient@example.com"
    const subject = composeSubject.trim() || "(No Subject)"
    const body = composeBody.trim()

    setIsSending(true)
    try {
      const result = await sendGmailMessage({
        to,
        subject,
        body,
        senderAccount,
      })

      if (!result.success && result.error) {
        if (handleScopeErrorIfPresent(result)) {
          triggerToast("Additional Google permission required to send emails.")
          return
        }
        triggerToast(`Failed to send email: ${result.error}`)
        return
      }

      composeEmail({
        recipientEmail: to,
        subject,
        body,
        priority: composePriority,
        isDraft: false,
      })
      setComposeTo("")
      setComposeSubject("")
      setComposeBody("")
      setComposePriority("medium")
      setIsComposeOpen(false)
      triggerToast("Email sent successfully!")
    } catch (err: any) {
      if (!handleScopeErrorIfPresent({ error: err?.message })) {
        triggerToast(`Error sending email: ${err?.message || "Unknown error"}`)
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleSaveDraftCompose = async () => {
    const to = composeTo.trim() || "draft@example.com"
    const subject = composeSubject.trim() || "(Untitled Draft)"
    const body = composeBody.trim()

    try {
      const result = await saveGmailDraft({
        to,
        subject,
        body,
      })

      if (!result.success && result.error) {
        handleScopeErrorIfPresent(result)
      }

      composeEmail({
        recipientEmail: to,
        subject,
        body,
        priority: composePriority,
        isDraft: true,
        draftId: result.draftId,
      })
      setComposeTo("")
      setComposeSubject("")
      setComposeBody("")
      setComposePriority("medium")
      setIsComposeOpen(false)
      if (result.success && result.draftId) {
        triggerToast("Draft saved and synced to Gmail!")
      } else {
        triggerToast("Draft saved to Draft folder!")
      }
    } catch (err: any) {
      handleScopeErrorIfPresent({ error: err?.message })
      composeEmail({
        recipientEmail: to,
        subject,
        body,
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
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#f3f3f2] pt-[84px] sm:pt-[116px] px-2 sm:px-4 pb-24 sm:pb-4">
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
                  disabled={isSending}
                  onClick={handleSendCompose}
                  className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 text-xs px-6 py-2.5 font-semibold shadow-md transition-all hover:scale-105 active:scale-95 flex items-center disabled:opacity-50"
                >
                  <Send className={`mr-1.5 h-3.5 w-3.5 ${isSending ? "animate-pulse" : ""}`} />
                  {isSending ? "Sending..." : "Send Message"}
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
            <div className="flex items-center justify-between gap-3 border-b border-gray-300/70 px-3 sm:px-6 py-2.5 sm:py-3 bg-[#ececeb] overflow-hidden">
              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar w-full pb-1 sm:pb-0">
                {/* Fast Priority Filter Pills: All | High | Med | Low */}
                <div className="flex items-center rounded-full border border-gray-300/80 bg-[#dededc] p-1 shadow-inner shrink-0">
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
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 ${
                    sortByPriority
                      ? "border-gray-400 bg-[#dddddd] text-neutral-900 shadow-xs"
                      : "border-gray-300/80 bg-[#e7e7e6] text-neutral-600 hover:bg-[#dddddc]"
                  }`}
                >
                  <ArrowUpDown className={`h-3.5 w-3.5 ${isAiSorting ? "animate-spin text-neutral-700" : ""}`} />
                  <span>Priority Wise</span>
                </button>

                {/* Sync All Mail Button */}
                <button
                  type="button"
                  onClick={() => syncGmailAutomatically(false)}
                  disabled={isGmailSyncing || isGmailAuthorizing}
                  title="One-click sync for Inbox, Starred, Drafts & Sent"
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 ${
                    isGmailSyncing
                      ? "border-blue-400 bg-blue-50 text-blue-700 shadow-xs"
                      : "border-gray-300/80 bg-[#e7e7e6] text-neutral-700 hover:bg-[#dddddc] hover:text-neutral-900"
                  }`}
                >
                  {isGmailSyncing ? (
                    <>
                      <span className="h-3 w-3 border-2 border-blue-600/40 border-t-blue-600 rounded-full animate-spin" />
                      <span>Syncing All...</span>
                    </>
                  ) : isGmailAuthorizing ? (
                    <>
                      <span className="h-3 w-3 border-2 border-neutral-600/40 border-t-neutral-600 rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon className="h-3.5 w-3.5" />
                      <span>Sync All Mail</span>
                    </>
                  )}
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
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsComposeOpen(true)}
                      className="flex items-center gap-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <span>Compose Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void syncGmailAutomatically(false)}
                      disabled={isGmailSyncing || isGmailAuthorizing}
                      className="flex items-center gap-2 rounded-full border border-gray-300/80 bg-white hover:bg-neutral-50 text-neutral-700 px-4 py-2 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <GoogleIcon className="h-3.5 w-3.5" />
                      <span>
                        {isGmailSyncing
                          ? "Syncing All..."
                          : isGmailAuthorizing
                          ? "Connecting..."
                          : "Sync All Mail"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                displayedEmails.map((email) => {
                  const isChecked = selectedEmailIds.includes(email.id)
                  const isOpened = !email.unread

                  return (
                    <div
                      key={email.id}
                      onClick={() => selectEmail(email.id)}
                      className={`group w-full text-left transition-all duration-150 cursor-pointer ${
                        isChecked
                          ? "bg-[#dededc] border-l-2 border-neutral-700"
                          : isOpened
                          ? "bg-[#e8e8e6]/50 opacity-75 hover:opacity-100 hover:bg-[#f3f3f2]"
                          : "bg-[#ececeb] opacity-100 hover:bg-[#f3f3f2]"
                      }`}
                    >
                      {/* MOBILE VIEW (< md:): Multi-line clean card with avatar/sender on top, subject in middle, snippet below */}
                      <div className="flex md:hidden flex-col gap-1.5 px-3.5 py-3 border-b border-gray-200/60">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
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

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleStarEmail(email.id)
                              }}
                              className="text-neutral-400 hover:text-amber-500 transition-colors p-0.5 shrink-0"
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

                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dedddc] border border-white/60 font-bold text-[10px] text-neutral-700 shrink-0">
                              {email.senderName.charAt(0)}
                            </div>

                            <span
                              className={`truncate text-sm ${
                                email.unread
                                  ? "font-bold text-neutral-900"
                                  : "font-medium text-neutral-700"
                              }`}
                            >
                              {email.senderName}
                            </span>
                          </div>

                          <span className="shrink-0 text-xs font-medium text-neutral-400 tabular-nums">
                            {email.timestamp}
                          </span>
                        </div>

                        {/* Subject & optional meeting badge */}
                        <div className="flex items-center gap-2 min-w-0 pl-7">
                          <span
                            className={`truncate text-sm ${
                              email.unread ? "font-semibold text-neutral-900" : "font-normal text-neutral-800"
                            }`}
                          >
                            {email.subject}
                          </span>
                          {email.meetingInfo?.hasMeeting && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-neutral-700 shadow-2xs">
                              <Calendar className="h-2.5 w-2.5 text-neutral-600" />
                              <span>{email.meetingInfo.duration || "Meeting"}</span>
                            </span>
                          )}
                        </div>

                        {/* Body preview */}
                        <div className="min-w-0 pl-7">
                          <p className={`truncate text-xs ${email.unread ? "text-neutral-600" : "text-neutral-400"}`}>
                            {email.body.replace(/\n+/g, " ")}
                          </p>
                        </div>
                      </div>

                      {/* DESKTOP VIEW (md:): Original single-line layout preserved exactly */}
                      <div className="hidden md:flex w-full items-center gap-3.5 px-6 py-4">
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
            <div className="flex flex-1 flex-col h-full min-h-0 overflow-hidden bg-neutral-100/90">
              {/* STABLE HEADER: Always pinned at the top, does NOT scroll */}
              <div className="shrink-0 border-b border-gray-200/90 bg-neutral-100/95 px-4 sm:px-6 md:px-8 pt-4 pb-3.5 sm:pb-4 backdrop-blur-sm z-10">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-3.5">
                  {/* Row 1: Back to Full List Button & Priority Header */}
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => selectEmail(null)}
                      className="rounded-full border border-gray-300/80 bg-[#e7e7e6] hover:bg-[#dddddc] text-[#404040] text-xs font-semibold px-4 py-2 shadow-xs transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
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

                  {/* Row 2: Subject & Actions */}
                  <div className="flex items-start justify-between gap-4">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-neutral-800 line-clamp-2">
                      {selectedEmail.subject}
                    </h1>
                    <div className="flex items-center gap-1.5 shrink-0">
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
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/80 p-2.5 text-xs text-neutral-700">
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

                  {/* Row 3: Sender Avatar, Name, Email & Timestamp */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-[#dedddc] border border-white/60 font-bold text-sm text-neutral-700 shadow-inner shrink-0">
                        {selectedEmail.isDraft ? "D" : selectedEmail.senderName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                          {selectedEmail.isDraft ? "Draft" : selectedEmail.senderName}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {selectedEmail.isDraft
                            ? `To: ${selectedEmail.recipientEmail || "(No recipient)"}`
                            : selectedEmail.senderEmail}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-medium text-neutral-400 tabular-nums shrink-0">
                      {selectedEmail.timestamp}
                    </div>
                  </div>
                </div>
              </div>

              {/* SCROLLING MAIL CONTENT: Mail body & Smart Reply Composer scroll smoothly */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-8 py-5">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">

                {/* Email Content Body (Rich HTML or Typographic Text, hidden for drafts to maximize typing responsiveness) */}
                {!selectedEmail.isDraft && (
                  <EmailHtmlViewer
                    html={selectedEmail.htmlBody}
                    plainText={selectedEmail.body}
                  />
                )}

                {/* If Selected Email is a Draft: Show Send Draft Action & Editable Box */}
                {selectedEmail.isDraft ? (
                  <DraftEditorForm
                    email={selectedEmail}
                    isSending={isSending}
                    onSend={handleSendDraft}
                  />
                ) : (
                  <SmartReplyComposer
                    email={selectedEmail}
                    senderAccount={senderAccount}
                    replyText={
                      draftEditText !== null
                        ? draftEditText
                        : selectedEmail.aiDraft && selectedEmail.aiDraft.status !== "dismissed"
                        ? selectedEmail.aiDraft.suggestedReply
                        : ""
                    }
                    onReplyTextChange={(val) => setDraftEditText(val)}
                    isGeneratingDraft={isGeneratingDraft}
                    isRefiningDraft={isRefiningDraft}
                    isSending={isSending}
                    onGenerateDraft={() => handleGenerateContextualDraft(selectedEmail)}
                    onRefineWithPrompt={handleRefineDraftWithPrompt}
                    aiPromptInstruction={aiPromptInstruction}
                    onAiPromptInstructionChange={setAiPromptInstruction}
                    onResolveAlternative={() => handleResolveConflictWithAlternative(selectedEmail)}
                    onAcceptAndReschedule={() => handleAcceptAndRescheduleConflict(selectedEmail)}
                    onClearDraft={() => {
                      setDraftEditText("")
                      if (selectedEmail.aiDraft) {
                        dismissAiDraft(selectedEmail.id)
                      }
                    }}
                    onSendReply={(text) => handleSendReply(selectedEmail, text)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Mailbox Overview List */}
            <div className="hidden md:flex w-full md:w-[380px] lg:w-[420px] shrink-0 flex-col border-l border-gray-300/70 bg-[#ececeb]">
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

      {/* Gmail Authorization Modal */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="w-[min(480px,92vw)] overflow-hidden rounded-[28px] border border-gray-300 bg-neutral-100 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-xs">
                  <GoogleIcon className="h-4 w-4" />
                </div>
                <div className="text-base font-bold tracking-tight text-neutral-800">
                  Gmail Authorization
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAuthModalOpen(false)}
                className="h-8 w-8 rounded-full border border-gray-200 bg-[#e7e7e6] hover:bg-[#dddddc] text-[#404040] p-0 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-neutral-600">
              {authModalReason ||
                "To read and sync all your mail across Inbox, Starred, Drafts, and Sent, Google requires your permission to access your Gmail. Please click below to grant access."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAuthModalOpen(false)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-[#dededc] cursor-pointer"
              >
                Close
              </Button>
              {authModalActionUrl ? (
                <>
                  <a
                    href={authModalActionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Enable in Google Cloud</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(false)
                      void syncGmailAutomatically(false)
                    }}
                    disabled={isGmailSyncing}
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-xs cursor-pointer active:scale-95"
                  >
                    <span>Retry Sync</span>
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={async () => {
                    setAuthModalOpen(false)
                    await handleGrantGmailAccess()
                  }}
                  disabled={isGmailAuthorizing}
                  className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95 cursor-pointer"
                >
                  <GoogleIcon className="h-3.5 w-3.5" />
                  <span>{isGmailAuthorizing ? "Connecting..." : "Grant Access with Google"}</span>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
