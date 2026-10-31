// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import MailView from "./MailView"
import { useEmailStore } from "@/store/emailStore"

vi.mock("@/services/gmailApiService", () => ({
  connectGmailAccount: vi.fn(),
  fetchAllGmailFolders: vi.fn().mockResolvedValue({ success: true, emails: [] }),
  getGoogleProviderToken: vi.fn().mockReturnValue(null),
  sendGmailDraft: vi.fn().mockResolvedValue({ success: true }),
  sendGmailMessage: vi.fn().mockResolvedValue({ success: true }),
  saveGmailDraft: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/services/geminiMailService", () => ({
  classifyAndSortEmailsWithGemini: vi.fn().mockImplementation((emails) => Promise.resolve({ emails, usedGemini: false })),
  classifyEmailsWithKeywords: vi.fn().mockImplementation((emails) => emails),
  sortEmailsByPriorityOrder: vi.fn().mockImplementation((emails) => emails),
  refineDraftWithAiPrompt: vi.fn().mockResolvedValue("Refined draft content"),
  generateContextualDraft: vi.fn().mockResolvedValue({
    id: "draft-1",
    emailId: "test-email-1",
    suggestedReply: "AI generated contextual reply",
    status: "pending_approval",
  }),
  syncMeetingAndRescheduleToCalendar: vi.fn().mockResolvedValue({ success: true }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("MailView Composer & Header Layout", () => {
  it("removes the sticky header banner and renders AI Draft actions in the composer area", () => {
    // Select an email in the store
    const store = useEmailStore.getState()
    const firstEmail = store.emails[0]
    store.selectEmail(firstEmail.id)

    render(<MailView />)

    // Verify Row 4 header banner is completely removed from the header
    expect(screen.queryByText("Evaluates Calendar & Tasks for timing conflicts and crafts a situation-aware reply")).not.toBeInTheDocument()

    // Verify the unified Smart Reply Composer has "Generate AI Draft"
    expect(screen.getByRole("button", { name: /Generate AI Draft/i })).toBeInTheDocument()

    // Verify AI Prompt Modification Box with quick style chips is present
    expect(screen.getByText("AI Prompt Modification Box")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /More Polite/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Make Concise/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Professional/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type prompt to change draft/i)).toBeInTheDocument()
  })
})
