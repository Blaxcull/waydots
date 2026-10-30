import { describe, it, expect } from "vitest"
import {
  analyzeEmailWithKeywords,
  sortEmailsByPriorityOrder,
  classifyEmailsWithKeywords,
  detectScheduleConflict,
  refineDraftWithAiPrompt,
  generateContextualDraft,
} from "./geminiMailService"
import type { Email } from "@/store/emailStore"

describe("geminiMailService", () => {
  const sampleMeetingEmail: Email = {
    id: "test-1",
    subject: "Urgent: Sprint Kickoff & 45-minute sync",
    senderName: "Alice",
    senderEmail: "alice@example.com",
    recipientEmail: "you@waydots.com",
    body: "Hi team, we need to schedule a 45-minute sync this Thursday morning after 9:00 AM as soon as possible.",
    timestamp: "10:00 AM",
    unread: true,
    priority: "low",
  }

  const sampleNewsletterEmail: Email = {
    id: "test-2",
    subject: "Weekly Tech Newsletter & Digest",
    senderName: "Digest",
    senderEmail: "news@digest.com",
    recipientEmail: "you@waydots.com",
    body: "Here is your routine weekly digest. Unsubscribe if you prefer.",
    timestamp: "Yesterday",
    unread: false,
    priority: "high",
  }

  it("extracts meeting timing, duration, and priority from keywords", () => {
    const analysis = analyzeEmailWithKeywords(sampleMeetingEmail)
    expect(analysis.priority).toBe("high")
    expect(analysis.meetingInfo?.hasMeeting).toBe(true)
    expect(analysis.meetingInfo?.duration).toContain("45-minute")
    expect(analysis.meetingInfo?.timing).toBeDefined()
  })

  it("identifies low priority newsletters and digests", () => {
    const analysis = analyzeEmailWithKeywords(sampleNewsletterEmail)
    expect(analysis.priority).toBe("low")
  })

  it("sorts emails in High -> Medium -> Low order", () => {
    const emails: Email[] = [
      { ...sampleNewsletterEmail, priority: "low" },
      { ...sampleMeetingEmail, priority: "high" },
      { ...sampleMeetingEmail, id: "test-3", priority: "medium" },
    ]

    const sorted = sortEmailsByPriorityOrder(emails)
    expect(sorted[0].priority).toBe("high")
    expect(sorted[1].priority).toBe("medium")
    expect(sorted[2].priority).toBe("low")
  })

  it("classifies an array of emails correctly", () => {
    const classified = classifyEmailsWithKeywords([sampleMeetingEmail, sampleNewsletterEmail])
    expect(classified[0].priority).toBe("high")
    expect(classified[1].priority).toBe("low")
  })

  it("detects schedule conflicts for overlapping meeting requests", () => {
    const conflict = detectScheduleConflict(sampleMeetingEmail)
    expect(conflict).not.toBeNull()
    expect(conflict?.hasConflict).toBe(true)
    expect(conflict?.conflictingTitle).toBeDefined()
    expect(conflict?.alternativeSlot).toBeDefined()
  })

  it("refines draft emails according to user prompt instructions", async () => {
    const originalDraft = "Thursday at 9:30 AM works. I will be there."
    const refined = await refineDraftWithAiPrompt(
      sampleMeetingEmail,
      originalDraft,
      "Make it more polite and friendly"
    )
    expect(refined.length).toBeGreaterThan(0)
    expect(refined).not.toBe(originalDraft)
  })

  it("generates a situation-aware contextual draft", async () => {
    const draft = await generateContextualDraft(sampleMeetingEmail)
    expect(draft.suggestedReply).toBeDefined()
    expect(draft.suggestedSlot).toBeDefined()
    expect(draft.status).toBe("pending_approval")
  })
})

