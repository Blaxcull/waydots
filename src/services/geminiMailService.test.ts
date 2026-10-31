import { describe, it, expect } from "vitest"
import {
  analyzeEmailWithKeywords,
  sortEmailsByPriorityOrder,
  classifyEmailsWithKeywords,
  detectScheduleConflict,
  refineDraftWithAiPrompt,
  generateContextualDraft,
} from "./geminiMailService"
import { isOtpEmail, type Email } from "@/store/emailStore"

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

  const sampleVercelOtpEmail: Email = {
    id: "test-otp-1",
    subject: "Your Vercel security code: 458464",
    senderName: "Vercel",
    senderEmail: "notifications@vercel.com",
    recipientEmail: "you@waydots.com",
    body: "We received a request to create deployment on your Vercel account. Enter code 458464 to verify. This code is valid for 10 minutes. Urgent action required if you did not request this.",
    timestamp: "5 minutes ago",
    unread: true,
    priority: "high", // Pre-existing incorrect priority to be overridden
  }

  it("always classifies OTP and security code emails as low priority", () => {
    expect(isOtpEmail(sampleVercelOtpEmail)).toBe(true)
    const analysis = analyzeEmailWithKeywords(sampleVercelOtpEmail)
    expect(analysis.priority).toBe("low")
    expect(analysis.priorityReason).toContain("One-time password")
    expect(analysis.meetingInfo).toBeUndefined()
  })

  it("classifies Google and GitHub 2FA codes as low priority", () => {
    const googleOtp: Email = {
      id: "test-otp-2",
      subject: "Google Verification Code",
      senderName: "Google",
      senderEmail: "noreply@google.com",
      recipientEmail: "you@waydots.com",
      body: "G-938210 is your Google verification code.",
      timestamp: "Just now",
      unread: true,
      priority: "medium",
    }
    expect(isOtpEmail(googleOtp)).toBe(true)
    const analysis = analyzeEmailWithKeywords(googleOtp)
    expect(analysis.priority).toBe("low")
  })

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

  it("drafts actual wording tailored to design and prototype review emails", async () => {
    const designEmail: Email = {
      id: "email-design",
      subject: "Design System Review — Waydots v2 Components",
      senderName: "Alex Morgan",
      senderEmail: "alex.m@studio.design",
      recipientEmail: "you@waydots.com",
      body: "I reviewed the latest icon pill buttons and view switcher interactions. The animations look great! Let me know when the email workspace prototype is ready.",
      timestamp: "Yesterday",
      unread: true,
      priority: "medium",
    }

    const draft = await generateContextualDraft(designEmail)
    expect(draft.suggestedReply).toContain("Alex")
    expect(draft.suggestedReply).toMatch(/review|design|prototype|buttons|animations/i)
    // Non-meeting email should not have a calendar meeting slot
    expect(draft.suggestedSlot).toBeUndefined()
  })

  it("drafts actual wording tailored to security notifications", async () => {
    const securityEmail: Email = {
      id: "email-sec",
      subject: "Security alert: New sign-in detected",
      senderName: "Google",
      senderEmail: "no-reply@accounts.google.com",
      recipientEmail: "you@waydots.com",
      body: "A new sign-in was detected on your account. Review your recent account activity.",
      timestamp: "Today",
      unread: true,
      priority: "low",
    }

    const draft = await generateContextualDraft(securityEmail)
    expect(draft.suggestedReply).toMatch(/security|activity|authorized|verified/i)
    expect(draft.suggestedSlot).toBeUndefined()
  })
})

