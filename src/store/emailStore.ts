import { create } from "zustand"

export type EmailPriority = "high" | "medium" | "low"
export type MailFolder = "inbox" | "starred" | "draft" | "sent"
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
  timestamp: string
  unread: boolean
  priority: EmailPriority
  starred?: boolean
  isDraft?: boolean
  isSent?: boolean
  aiDraft?: EmailDraft
  linkedTaskId?: string
  meetingInfo?: MeetingInfo
  priorityReason?: string
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
  sendDraft: (draftId: string) => void
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
  setEmails: (emails) => set({ emails }),

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
    set((state) => ({
      emails: state.emails.map((e) => {
        if (e.id !== id) return e
        const bodyToSend = finalReplyText || e.aiDraft?.suggestedReply || ""
        return {
          ...e,
          unread: false,
          aiDraft: e.aiDraft ? { ...e.aiDraft, status: "approved" } : undefined,
          isSent: true,
          body: `${e.body}\n\n--- Sent Reply (${state.senderAccount}) ---\n${bodyToSend}`,
        }
      }),
    })),

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
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === emailId
          ? {
              ...e,
              isSent: true,
              body: `${e.body}\n\n--- Sent Reply (${state.senderAccount}) ---\n${replyText}`,
            }
          : e
      ),
    })),

  sendDraft: (draftId) =>
    set((state) => ({
      emails: state.emails.map((e) =>
        e.id === draftId
          ? {
              ...e,
              isDraft: false,
              isSent: true,
              timestamp: "Just now",
            }
          : e
      ),
    })),

  deleteEmail: (id) =>
    set((state) => ({
      emails: state.emails.filter((e) => e.id !== id),
      selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
    })),

  restoreDeletedEmails: (restored) =>
    set((state) => ({
      emails: [
        ...restored.filter((r) => !state.emails.some((e) => e.id === r.id)),
        ...state.emails,
      ],
    })),

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
      emails: state.emails.filter((e) => !ids.includes(e.id)),
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

  composeEmail: ({ subject, recipientEmail, body, priority, isDraft = false }) =>
    set((state) => {
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
        priority,
      }
      return {
        emails: [newEmail, ...state.emails],
        selectedEmailId: newEmail.id,
        activeFolder: isDraft ? "draft" : "sent",
      }
    }),
}))
