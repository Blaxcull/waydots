import { create } from "zustand"

export type EmailPriority = "high" | "medium" | "low"
export type MailFolder = "inbox" | "starred" | "trash" | "sent" | "draft"
export type PriorityFilter = "all" | "high" | "medium" | "low"

export interface MeetingInfo {
  hasMeeting: boolean
  timing?: string
  duration?: string
  topic?: string
}

export interface ScheduleConflict {
  hasConflict: boolean
  conflictingType: "event" | "goal" | "task"
  conflictingTitle: string
  conflictingTime: string
  conflictingDate?: string
  proposedSlot: string
  alternativeSlot: string
  reason: string
  resolved?: boolean
  resolutionType?: "proposed_alternative" | "rescheduled_conflicting"
}

export interface EmailDraft {
  suggestedReply: string
  suggestedSlot?: string
  suggestedTaskTitle?: string
  status: "pending_approval" | "approved" | "dismissed"
  conflict?: ScheduleConflict
}

export interface Email {
  id: string
  subject: string
  senderName: string
  senderEmail: string
  recipientEmail: string
  body: string
  htmlBody?: string
  timestamp: string
  unread: boolean
  priority: EmailPriority
  starred?: boolean
  isDraft?: boolean
  isSent?: boolean
  isTrash?: boolean
  draftId?: string
  threadId?: string
  aiDraft?: EmailDraft
  linkedTaskId?: string
  meetingInfo?: MeetingInfo
  priorityReason?: string
}

/**
 * Detects whether an email represents a one-time password (OTP),
 * two-factor authentication (2FA) verification code, or login security code.
 * OTPs must always be classified as low priority.
 */
export function isOtpEmail(email: {
  subject?: string
  body?: string
  senderName?: string
  senderEmail?: string
}): boolean {
  const text = `${email.subject || ""} ${email.body || ""} ${email.senderName || ""} ${email.senderEmail || ""}`.toLowerCase()

  const otpKeywords = [
    "one-time password",
    "one time password",
    "verification code",
    "security code",
    "auth code",
    "authentication code",
    "passcode",
    "login code",
    "confirmation code",
    "two-factor",
    "2fa",
    "pin code",
    "reset code",
    "access code",
    "temporary code",
    "security pin",
    "your code is",
    "your verification",
    "use this code",
    "enter this code",
  ]

  if (otpKeywords.some((kw) => text.includes(kw))) {
    return true
  }

  if (/\b(otp|2fa|passcode)\b/i.test(text)) {
    return true
  }

  if (/\b(?:security|verification|login|access|auth)\s+code\b/i.test(text)) {
    return true
  }

  if (/\b(?:code|pin)\s*(?:is|:)\s*\d{4,8}\b/i.test(text)) {
    return true
  }

  return false
}

const INITIAL_EMAILS: Email[] = [
  {
    id: "email-1",
    subject: "Urgent: Q4 Strategy Sync & Project Kickoff",
    senderName: "Sarah Chen",
    senderEmail: "sarah.chen@acme-corp.com",
    recipientEmail: "you@waydots.com",
    body: "Hi team,\n\nWe need to align on the Q4 deliverables and client kickoff milestones as soon as possible. Can we schedule a 45-minute sync this Thursday or Friday morning after 9:00 AM? Let me know your availability.\n\nBest regards,\nSarah",
    timestamp: "10:14 AM",
    unread: true,
    starred: true,
    priority: "high",
    priorityReason: "Urgent meeting sync with schedule & 45-min duration",
    meetingInfo: {
      hasMeeting: true,
      timing: "Thu/Fri morning after 9:00 AM",
      duration: "45 mins",
      topic: "Q4 Strategy Sync & Project Kickoff",
    },
    aiDraft: {
      suggestedReply:
        "Hi Sarah,\n\nThanks for reaching out! I would love to connect for our 45-minute Q4 sync.\n\nHowever, I currently have a schedule conflict on Thursday morning with 'Sprint Retrospective & Team Sync' (9:15 AM - 10:15 AM). Could we sync at Thursday 11:30 AM - 12:15 PM, or Friday morning at 10:00 AM instead?\n\nLooking forward to speaking!",
      suggestedSlot: "Thursday, Oct 31 • 9:30 AM - 10:15 AM",
      suggestedTaskTitle: "Prepare Q4 Strategy Deck for Acme Kickoff",
      status: "pending_approval",
      conflict: {
        hasConflict: true,
        conflictingType: "event",
        conflictingTitle: "Sprint Retrospective & Team Sync",
        conflictingTime: "9:15 AM - 10:15 AM",
        conflictingDate: "2026-10-31",
        proposedSlot: "Thursday, Oct 31 • 9:30 AM - 10:15 AM",
        alternativeSlot: "Thursday, Oct 31 • 11:30 AM - 12:15 PM",
        reason: "Overlaps with scheduled Sprint Retrospective & Team Sync on calendar & tasks",
        resolved: false,
      },
    },
  },
  {
    id: "email-2",
    subject: "Design System Review — Waydots v2 Components",
    senderName: "Alex Morgan",
    senderEmail: "alex.m@studio.design",
    recipientEmail: "you@waydots.com",
    body: "Hey there,\n\nI reviewed the latest icon pill buttons and view switcher interactions. The animations and tactile border shadows look great! Let me know when the email workspace prototype is ready for another pass.\n\nCheers,\nAlex",
    timestamp: "Yesterday",
    unread: true,
    starred: false,
    priority: "medium",
  },
  {
    id: "email-3",
    subject: "Weekly Analytics Summary & Goal Completion Rates",
    senderName: "Waydots Analytics",
    senderEmail: "insights@waydots.app",
    recipientEmail: "you@waydots.com",
    body: "Your weekly planning report is ready.\n\n• Weekly Goal Completion: 84%\n• Focus Time Logged: 28.5 hrs\n• Streak: 6 consecutive days on track\n\nKeep up the great momentum!",
    htmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 4px; color: #1e293b;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 18px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a;">Weekly Planning Report</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Summary for week ending Oct 28, 2026</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 22px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #10b981;">84%</div>
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px;">Goal Completion</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #3b82f6;">28.5h</div>
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px;">Focus Time</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #f59e0b;">6 Days</div>
            <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px;">Streak</div>
          </div>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
          Great work this week! Your focus time increased by <strong>12%</strong> compared to last week, and you maintained your streak across all 4 core goals.
        </p>
        <div style="margin-top: 20px;">
          <a href="https://waydots.vercel.app" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 9px 18px; border-radius: 9999px; font-size: 12px; font-weight: 600;">View Full Analytics Dashboard &rarr;</a>
        </div>
      </div>
    `,
    timestamp: "Oct 28",
    unread: false,
    starred: true,
    priority: "medium",
  },
  {
    id: "email-4",
    subject: "Tech Radar Monthly Newsletter — October 2026",
    senderName: "Tech Radar Digest",
    senderEmail: "updates@techradar.io",
    recipientEmail: "you@waydots.com",
    body: "Top engineering stories this month: Deterministic Agentic Workflows, React 19 Compiler deep dive, and the convergence of Calendar & Task tooling in modern workspaces.",
    htmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; color: #1e293b; padding: 4px;">
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); color: white; padding: 18px 20px; border-radius: 14px; margin-bottom: 20px;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #38bdf8;">Tech Radar Digest</span>
          <h2 style="margin: 6px 0 4px; font-size: 20px; font-weight: 700;">October 2026 Edition</h2>
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">The latest breakthroughs in agentic workflows, frontend compilers & tooling.</p>
        </div>
        <div style="margin-bottom: 16px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">1. Deterministic Agentic Workflows</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 10px;">
            How autonomous coding agents are moving from probabilistic guesswork to deterministic validation loops with live unit tests, compiler checks, and reproducible verification steps.
          </p>
        </div>
        <div style="margin-bottom: 16px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">2. React 19 Compiler in Production</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 10px;">
            Real-world performance gains, automated memoization patterns, and migration benchmarks from large-scale workspaces running React 19.
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          You received this email because you subscribed to Tech Radar. <a href="#" style="color: #64748b;">Unsubscribe</a>
        </p>
      </div>
    `,
    timestamp: "Oct 26",
    unread: false,
    starred: false,
    priority: "low",
  },
  {
    id: "email-5",
    subject: "Cloud Infrastructure Maintenance Notice (Scheduled)",
    senderName: "Infrastructure Operations",
    senderEmail: "notifications@cloudhost.com",
    recipientEmail: "you@waydots.com",
    body: "Routine database index maintenance scheduled for Sunday at 02:00 UTC. Zero expected downtime for calendar read/write operations.",
    timestamp: "Oct 24",
    unread: false,
    starred: false,
    priority: "low",
  },
  {
    id: "email-draft-1",
    subject: "Draft: Q4 Architecture & Performance Review",
    senderName: "You",
    senderEmail: "you@waydots.com",
    recipientEmail: "sarah.chen@acme-corp.com",
    body: "Hi Sarah,\n\nDrafting our preliminary agenda for the meeting:\n1. Cross-app agent integration\n2. Task sync with Google Tasks\n3. Human approval gates for email sending\n\nTalk soon!",
    timestamp: "Draft",
    unread: false,
    starred: false,
    isDraft: true,
    priority: "medium",
  },
  {
    id: "email-sent-1",
    subject: "Confirmed: Sprint 14 Deliverables & Retrospective",
    senderName: "You",
    senderEmail: "you@waydots.com",
    recipientEmail: "team@waydots.com",
    body: "Team,\n\nAll tasks have been synchronized with the master branch. Great work this week!\n\nBest,\nHarsh",
    timestamp: "Oct 22",
    unread: false,
    starred: false,
    isSent: true,
    priority: "low",
  },
  {
    id: "email-trash-1",
    subject: "Newsletter Subscription Notice",
    senderName: "Daily Digest",
    senderEmail: "news@dailydigest.com",
    recipientEmail: "you@waydots.com",
    body: "Your weekly digest is here. This conversation was moved to Trash.",
    timestamp: "Oct 19",
    unread: false,
    starred: false,
    isTrash: true,
    priority: "low",
    priorityReason: "In Trash",
  },
]

interface EmailStoreState {
  emails: Email[]
  selectedEmailId: string | null
  activeFolder: MailFolder
  priorityFilter: PriorityFilter
  sortByPriority: boolean
  searchQuery: string
  senderAccount: string
  availableSenders: string[]

  selectEmail: (id: string | null) => void
  markAsRead: (id: string) => void
  toggleStarEmail: (id: string) => void
  setActiveFolder: (folder: MailFolder) => void
  setPriorityFilter: (filter: PriorityFilter) => void
  setSortByPriority: (sortByPriority: boolean) => void
  toggleSortByPriority: () => void
  setEmails: (emails: Email[]) => void
  setSearchQuery: (query: string) => void
  setSenderAccount: (account: string) => void
  setLoggedInUserEmail: (email: string) => void
  approveAiDraftAndSend: (id: string, finalReplyText?: string) => void
  dismissAiDraft: (id: string) => void
  setAiDraftForEmail: (id: string, draft: EmailDraft) => void
  updateEmailDraft: (id: string, updates: Partial<EmailDraft>) => void
  resolveDraftConflict: (id: string, resolution: "alternative" | "reschedule") => void
  sendReply: (emailId: string, replyText: string) => void
  sendDraft: (draftId: string, updatedBody?: string, updatedRecipient?: string) => void
  deleteEmail: (id: string) => void
  restoreDeletedEmails: (emails: Email[]) => void
  markBatchAsRead: (ids: string[]) => void
  markBatchAsUnread: (ids: string[]) => void
  deleteBatchEmails: (ids: string[]) => void
  toggleStarBatch: (ids: string[], star?: boolean) => void
  composeEmail: (data: {
    subject: string
    recipientEmail: string
    body: string
    priority: EmailPriority
    isDraft?: boolean
    draftId?: string
    threadId?: string
  }) => void
}

export const useEmailStore = create<EmailStoreState>((set) => ({
  emails: INITIAL_EMAILS,
  selectedEmailId: null,
  activeFolder: "inbox",
  priorityFilter: "all",
  sortByPriority: false,
  searchQuery: "",
  senderAccount: "you@waydots.com",
  availableSenders: [
    "you@waydots.com (Primary)",
    "team@waydots.com (Shared)",
    "assistant@waydots.com (Agent)",
  ],

  selectEmail: (id) =>
    set((state) => {
      if (!id) return { selectedEmailId: null }
      return {
        selectedEmailId: id,
        emails: state.emails.map((e) => (e.id === id ? { ...e, unread: false } : e)),
      }
    }),

  markAsRead: (id) =>
    set((state) => ({
      emails: state.emails.map((e) => (e.id === id ? { ...e, unread: false } : e)),
    })),

  toggleStarEmail: (id) =>
    set((state) => ({
      emails: state.emails.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)),
    })),

  setActiveFolder: (folder) =>
    set((state) => {
      const matching = state.emails.filter((email) => {
        if (folder === "starred") return email.starred
        if (folder === "draft") return email.isDraft
        if (folder === "sent") return email.isSent
        return !email.isDraft && !email.isSent
      })
      const isCurrentInFolder = matching.some((e) => e.id === state.selectedEmailId)
      return {
        activeFolder: folder,
        selectedEmailId: isCurrentInFolder ? state.selectedEmailId : null,
      }
    }),

  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setSortByPriority: (sortByPriority) => set({ sortByPriority }),
  toggleSortByPriority: () => set((state) => ({ sortByPriority: !state.sortByPriority })),
  setEmails: (emails) =>
    set({
      emails: emails.map((e) =>
        isOtpEmail(e)
          ? {
              ...e,
              priority: "low" as const,
              priorityReason: "One-time password (OTP) or authentication security code",
            }
          : e
      ),
    }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSenderAccount: (senderAccount) => set({ senderAccount }),
  setLoggedInUserEmail: (email) =>
    set((state) => {
      const trimmed = email.trim()
      if (!trimmed) return state
      const primary = `${trimmed} (Primary)`
      const others = state.availableSenders.filter(
        (s) => !s.startsWith(trimmed) && !s.includes("(Primary)")
      )
      return {
        senderAccount: trimmed,
        availableSenders: [primary, ...others],
      }
    }),

  approveAiDraftAndSend: (id, finalReplyText) =>
    set((state) => {
      const targetEmail = state.emails.find((e) => e.id === id)
      if (!targetEmail) return state

      const bodyToSend = finalReplyText || targetEmail.aiDraft?.suggestedReply || ""

      const sentEmail: Email = {
        id: `email-sent-${Date.now()}`,
        subject: targetEmail.subject.startsWith("Re: ")
          ? targetEmail.subject
          : `Re: ${targetEmail.subject}`,
        senderName: "You",
        senderEmail: state.senderAccount,
        recipientEmail: targetEmail.senderEmail,
        body: bodyToSend,
        timestamp: "Just now",
        unread: false,
        starred: false,
        isDraft: false,
        isSent: true,
        priority: targetEmail.priority,
      }

      const updatedEmails = state.emails.map((e) => {
        if (e.id !== id) return e
        return {
          ...e,
          unread: false,
          aiDraft: undefined,
          body: `${e.body}\n\n--- Sent Reply (${state.senderAccount}) ---\n${bodyToSend}`,
        }
      })

      return {
        emails: [sentEmail, ...updatedEmails],
      }
    }),

  dismissAiDraft: (id) =>
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === id && e.aiDraft
          ? { ...e, aiDraft: { ...e.aiDraft, status: "dismissed" } }
          : e
      ),
    })),

  setAiDraftForEmail: (id, draft) =>
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === id ? { ...e, aiDraft: draft } : e
      ),
    })),

  updateEmailDraft: (id, updates) =>
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === id && e.aiDraft
          ? { ...e, aiDraft: { ...e.aiDraft, ...updates } }
          : e
      ),
    })),

  resolveDraftConflict: (id, resolution) =>
    set((state) => ({
      emails: state.emails.map((e) => {
        if (e.id !== id || !e.aiDraft?.conflict) return e
        const currentConflict = e.aiDraft.conflict
        if (resolution === "alternative") {
          return {
            ...e,
            aiDraft: {
              ...e.aiDraft,
              suggestedSlot: currentConflict.alternativeSlot,
              suggestedReply: `Hi ${e.senderName.split(" ")[0] || e.senderName},\n\nThanks for reaching out! Let's meet at ${currentConflict.alternativeSlot}. I have reserved the slot on my calendar.\n\nLooking forward to speaking!`,
              conflict: {
                ...currentConflict,
                resolved: true,
                resolutionType: "proposed_alternative",
              },
            },
          }
        } else {
          return {
            ...e,
            aiDraft: {
              ...e.aiDraft,
              suggestedReply: `Hi ${e.senderName.split(" ")[0] || e.senderName},\n\nThanks for following up! ${currentConflict.proposedSlot} works great for our sync. I have adjusted my schedule and reserved the slot.\n\nLooking forward to speaking!`,
              conflict: {
                ...currentConflict,
                resolved: true,
                resolutionType: "rescheduled_conflicting",
              },
            },
          }
        }
      }),
    })),

  sendReply: (emailId, replyText) =>
    set((state) => {
      const targetEmail = state.emails.find((e) => e.id === emailId)
      if (!targetEmail) return state

      const sentEmail: Email = {
        id: `email-sent-${Date.now()}`,
        subject: targetEmail.subject.startsWith("Re: ")
          ? targetEmail.subject
          : `Re: ${targetEmail.subject}`,
        senderName: "You",
        senderEmail: state.senderAccount,
        recipientEmail: targetEmail.senderEmail,
        body: replyText,
        timestamp: "Just now",
        unread: false,
        starred: false,
        isDraft: false,
        isSent: true,
        priority: targetEmail.priority,
      }

      const updatedEmails = state.emails.map((e) =>
        e.id === emailId
          ? {
              ...e,
              unread: false,
              aiDraft: undefined,
              body: `${e.body}\n\n--- Sent Reply (${state.senderAccount}) ---\n${replyText}`,
            }
          : e
      )

      return {
        emails: [sentEmail, ...updatedEmails],
      }
    }),

  sendDraft: (draftId, updatedBody, updatedRecipient) =>
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === draftId
          ? {
              ...e,
              body: updatedBody !== undefined ? updatedBody : e.body,
              recipientEmail: updatedRecipient !== undefined ? updatedRecipient : e.recipientEmail,
              isDraft: false,
              isSent: true,
              timestamp: "Just now",
            }
          : e
      ),
    })),

  deleteEmail: (id) =>
    set((state) => {
      const target = state.emails.find((e) => e.id === id)
      if (target?.isTrash) {
        // Already in Trash: permanently delete
        return {
          emails: state.emails.filter((e) => e.id !== id),
          selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
        }
      }
      // Move to Trash
      return {
        emails: state.emails.map((e) => (e.id === id ? { ...e, isTrash: true } : e)),
        selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
      }
    }),

  restoreDeletedEmails: (restored) =>
    set((state) => {
      const restoredIds = new Set(restored.map((r) => r.id))
      const updated = state.emails.map((e) => (restoredIds.has(e.id) ? { ...e, isTrash: false } : e))
      const missing = restored
        .filter((r) => !state.emails.some((e) => e.id === r.id))
        .map((r) => ({ ...r, isTrash: false }))
      return {
        emails: [...missing, ...updated],
      }
    }),

  markBatchAsRead: (ids) =>
    set((state) => ({
      emails: state.emails.map((e) => (ids.includes(e.id) ? { ...e, unread: false } : e)),
    })),

  markBatchAsUnread: (ids) =>
    set((state) => ({
      emails: state.emails.map((e) => (ids.includes(e.id) ? { ...e, unread: true } : e)),
    })),

  deleteBatchEmails: (ids) =>
    set((state) => ({
      emails: state.emails.flatMap((e) => {
        if (!ids.includes(e.id)) return [e]
        if (e.isTrash) return []
        return [{ ...e, isTrash: true }]
      }),
      selectedEmailId: ids.includes(state.selectedEmailId || "") ? null : state.selectedEmailId,
    })),

  toggleStarBatch: (ids, star) =>
    set((state) => ({
      emails: state.emails.map((e) => {
        if (!ids.includes(e.id)) return e
        return {
          ...e,
          starred: typeof star === "boolean" ? star : !e.starred,
        }
      }),
    })),

  composeEmail: ({
    subject,
    recipientEmail,
    body,
    priority,
    isDraft = false,
    draftId,
    threadId,
  }) =>
    set((state) => {
      const isOtp = isOtpEmail({ subject, body })
      const newEmail: Email = {
        id: `email-${Date.now()}`,
        subject: subject || (isDraft ? "(Untitled Draft)" : "(No Subject)"),
        senderName: "You",
        senderEmail: state.senderAccount,
        recipientEmail: recipientEmail || "recipient@example.com",
        body,
        timestamp: isDraft ? "Draft" : "Just now",
        unread: false,
        starred: false,
        isDraft,
        isSent: !isDraft,
        priority: isOtp ? "low" : priority,
        priorityReason: isOtp ? "One-time password (OTP) or authentication security code" : undefined,
        draftId,
        threadId,
      }
      return {
        emails: [newEmail, ...state.emails],
        selectedEmailId: newEmail.id,
        activeFolder: isDraft ? state.activeFolder : "sent",
      }
    }),
}))
