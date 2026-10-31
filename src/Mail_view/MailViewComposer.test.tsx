// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import MailView from "./MailView"
import { useEmailStore } from "@/store/emailStore"
import { sendGmailMessage } from "@/services/gmailApiService"

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

  it("sends AI generated draft reply using the exact same send flow as manually written messages", async () => {
    const store = useEmailStore.getState()
    const emailToTest = store.emails[1] // Second email without initial draft
    store.selectEmail(emailToTest.id)

    render(<MailView />)

    // 1. Click "Generate AI Draft"
    const generateBtn = screen.getByRole("button", { name: /Generate AI Draft/i })
    fireEvent.click(generateBtn)

    // The draft text should appear in the textarea
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Write your reply/i) as HTMLTextAreaElement
      expect(textarea.value).toBe("AI generated contextual reply")
    })

    // 2. Click "Send Reply"
    const sendBtn = screen.getByRole("button", { name: /Send Reply/i })
    fireEvent.click(sendBtn)

    // Verify sendGmailMessage was called with the generated reply text
    await waitFor(() => {
      expect(sendGmailMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: emailToTest.senderEmail,
          body: "AI generated contextual reply",
        })
      )
    })

    // Verify composer textarea is cleared after sending
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Write your reply/i) as HTMLTextAreaElement
      expect(textarea.value).toBe("")
    })
  })
})
