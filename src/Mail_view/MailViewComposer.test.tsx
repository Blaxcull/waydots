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
  deleteGmailMessage: vi.fn().mockResolvedValue({ success: true }),
  untrashGmailMessage: vi.fn().mockResolvedValue({ success: true }),
  markGmailMessageAsRead: vi.fn().mockResolvedValue({ success: true }),
  batchModifyGmailMessages: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/services/geminiMailService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/geminiMailService")>()
  return {
    ...actual,
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
  }
})

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

    // Verify "Powered by Gemini AI" attribution is removed
    expect(screen.queryByText(/Powered by Gemini/i)).not.toBeInTheDocument()

    // Verify "Linked Action Item" box is removed
    expect(screen.queryByText(/Linked Action Item/i)).not.toBeInTheDocument()

    // For firstEmail with an existing aiDraft:
    // Verify the unified Smart Reply Composer has "Regenerate AI Draft"
    expect(screen.getByRole("button", { name: /Regenerate AI Draft/i })).toBeInTheDocument()

    // Verify AI Prompt Modification Box with quick style chips is present
    expect(screen.getByText("AI Prompt Modification Box")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /More Polite/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Make Concise/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Professional/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type prompt to change draft/i)).toBeInTheDocument()
  })

  it("does not display the AI Prompt Modification Box until an AI draft is generated", async () => {
    const store = useEmailStore.getState()
    const secondEmail = store.emails[1] // Second email without initial draft
    store.selectEmail(secondEmail.id)

    render(<MailView />)

    // Initially, for an email without AI draft, AI Prompt Modification Box should NOT be displayed
    expect(screen.getByRole("button", { name: /Generate AI Draft/i })).toBeInTheDocument()
    expect(screen.queryByText("AI Prompt Modification Box")).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Type prompt to change draft/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Powered by Gemini/i)).not.toBeInTheDocument()

    // Click "Generate AI Draft"
    const generateBtn = screen.getByRole("button", { name: /Generate AI Draft/i })
    fireEvent.click(generateBtn)

    // Now the AI Prompt Modification Box should appear
    await waitFor(() => {
      expect(screen.getByText("AI Prompt Modification Box")).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Type prompt to change draft/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Regenerate AI Draft/i })).toBeInTheDocument()
    })
  })

  it("keeps the clicked tone tag selected and preserves it when refining with a custom prompt", async () => {
    const store = useEmailStore.getState()
    const firstEmail = store.emails[0]
    store.selectEmail(firstEmail.id)

    render(<MailView />)

    const politeBtn = screen.getByRole("button", { name: /More Polite/i })
    fireEvent.click(politeBtn)

    // Wait for the tone refinement to finish and verify polite button is selected
    await waitFor(() => {
      expect(politeBtn.className).toContain("bg-neutral-900")
      expect(screen.getByRole("button", { name: /Update Draft/i })).toBeInTheDocument()
    })

    // Enter a custom modification in the prompt input
    const promptInput = screen.getByPlaceholderText(/Add instructions/i)
    fireEvent.change(promptInput, { target: { value: "Add request for slide deck" } })

    // Click Update Draft
    const updateBtn = screen.getByRole("button", { name: /Update Draft/i })
    fireEvent.click(updateBtn)

    // Wait for custom refinement to complete
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Update Draft/i })).toBeInTheDocument()
    })

    // Verify refineDraftWithAiPrompt was called with the combined instruction
    const { refineDraftWithAiPrompt } = await import("@/services/geminiMailService")
    expect(refineDraftWithAiPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining("Maintain tone and style: Make the tone warmer, more polite, and express appreciation")
    )

    // Verify polite button stays selected after update
    expect(politeBtn.className).toContain("bg-neutral-900")
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

  it("does not render delete/bin button for sent emails or in the Sent folder", () => {
    const store = useEmailStore.getState()
    store.selectEmail(null)
    store.setActiveFolder("sent")

    render(<MailView />)

    // No delete buttons should be present in the sent view
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument()
    expect(screen.queryByTitle("Delete Selected")).not.toBeInTheDocument()
  })

  it("calls deleteGmailMessage when deleting an email and untrashGmailMessage on Undo", async () => {
    const { deleteGmailMessage, untrashGmailMessage } = await import("@/services/gmailApiService")
    const store = useEmailStore.getState()
    const inboxEmail = store.emails.find((e) => !e.isSent && !e.isDraft) || store.emails[0]
    store.selectEmail(inboxEmail.id)
    store.setActiveFolder("inbox")

    render(<MailView />)

    // Find the delete button
    const deleteBtns = screen.getAllByRole("button", { name: "Delete" })
    fireEvent.click(deleteBtns[0])

    // Verify deleteGmailMessage was called with the inbox email's id
    await waitFor(() => {
      expect(deleteGmailMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: inboxEmail.id,
        })
      )
    })

    // Verify the Undo button is present in the toast
    const undoBtn = screen.getByRole("button", { name: "Undo" })
    fireEvent.click(undoBtn)

    // Verify untrashGmailMessage was called to restore the email on Gmail
    await waitFor(() => {
      expect(untrashGmailMessage).toHaveBeenCalledWith(inboxEmail.id)
    })
  })

  it("sends read signal to Gmail as fast as possible when viewing an unread email", async () => {
    const { markGmailMessageAsRead } = await import("@/services/gmailApiService")
    const store = useEmailStore.getState()
    const targetEmail = store.emails.find((e) => !e.isSent && !e.isDraft) || store.emails[0]

    // Set email as unread and clear active selection
    store.selectEmail(null)
    store.setActiveFolder("inbox")
    store.setEmails(
      store.emails.map((e) => (e.id === targetEmail.id ? { ...e, unread: true } : e))
    )

    render(<MailView />)

    // Click on the email row to view it
    const emailRows = screen.getAllByText(targetEmail.subject)
    fireEvent.click(emailRows[0])

    // Verify markGmailMessageAsRead was called immediately with the email id
    await waitFor(() => {
      expect(markGmailMessageAsRead).toHaveBeenCalledWith(targetEmail.id)
    })
  })

  it("renders time/date toggle planner, checks conflicts, and sets event and to-do for meeting emails", async () => {
    const store = useEmailStore.getState()
    const meetingEmail: any = {
      id: "email-akash-meeting",
      subject: "Meeting",
      senderName: "Akash",
      senderEmail: "akashsharma27062004@gmail.com",
      recipientEmail: "you@waydots.com",
      body: "Tommorow meeting at 10 am",
      timestamp: "10:06 AM",
      unread: false,
      priority: "high",
    }
    store.setEmails([meetingEmail, ...store.emails])
    store.selectEmail(meetingEmail.id)

    render(<MailView />)

    // Verify Scheduler is present
    expect(screen.getByText(/Event & To-Do Scheduler/i)).toBeInTheDocument()
    expect(screen.getByText(/Hide Controls/i)).toBeInTheDocument()

    // Verify conflict status is displayed
    expect(
      screen.getByText(/completely free in both your Calendar and To-Dos/i)
    ).toBeInTheDocument()

    // Click "Set Event & To-Do"
    const setEventAndTodoBtn = screen.getByRole("button", { name: /Set Event & To-Do/i })
    fireEvent.click(setEventAndTodoBtn)

    // Verify confirmation
    await waitFor(() => {
      expect(screen.getByText(/Event & To-Do Added!/i)).toBeInTheDocument()
    })

    // Click "Update AI Draft with this Time"
    const updateDraftBtn = screen.getByRole("button", { name: /Update AI Draft with this Time/i })
    fireEvent.click(updateDraftBtn)

    // Verify textarea contains confirmation text
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Write your reply/i) as HTMLTextAreaElement
      expect(textarea.value).toContain("I have confirmed our meeting")
      expect(textarea.value).toContain("10:00 AM")
    })
  })
})
