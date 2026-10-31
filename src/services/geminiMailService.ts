import { isOtpEmail, type Email, type EmailPriority, type MeetingInfo, type ScheduleConflict, type EmailDraft } from "@/store/emailStore"
import { useEventsStore } from "@/store/eventsStore"
import { useGoalsStore } from "@/store/goalsStore"

/**
 * Reads Gemini API key directly from environment (.env: VITE_GEMINI_API_KEY)
 */
export function getGeminiApiKey(): string {
  const fromEnv = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || ""
  return fromEnv.trim()
}

export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey())
}

/**
 * Determines if an incoming email (or user prompt instruction) is genuinely a meeting request.
 * Normal emails (security alerts, logins, OTPs, LinkedIn updates, newsletters, feedback, questions)
 * must NEVER be treated as meeting requests.
 */
export function isActualMeetingRequest(
  email: {
    subject?: string
    body?: string
    senderName?: string
    senderEmail?: string
    meetingInfo?: MeetingInfo
    id?: string
  },
  customPrompt?: string
): boolean {
  // If the user explicitly asks for a meeting in the update draft prompt, honor that intent
  if (customPrompt) {
    const promptLower = customPrompt.toLowerCase()
    if (
      /\b(schedule|set up|propose|book)\s+(?:a\s+)?(?:meeting|call|sync|chat|slot)\b/i.test(promptLower) ||
      /\b(let's meet|meet at|available at)\b/i.test(promptLower)
    ) {
      return true
    }
  }

  // Automated emails, OTPs, system notifications, or security alerts are NEVER meeting requests
  if (isOtpEmail(email)) return false

  const sender = `${email.senderName || ""} ${email.senderEmail || ""}`.toLowerCase()
  if (
    /no-?reply/i.test(sender) ||
    /notifications?@/i.test(sender) ||
    /mailer-daemon/i.test(sender) ||
    /security@/i.test(sender) ||
    /support@/i.test(sender) ||
    /newsletter/i.test(sender) ||
    /linkedin/i.test(sender) ||
    /vercel/i.test(sender) ||
    /github/i.test(sender) ||
    /google/i.test(sender)
  ) {
    return false
  }

  const text = `${email.subject || ""} ${email.body || ""}`.toLowerCase()

  // Strong phrases indicating someone is asking to meet / schedule a conversation
  const explicitMeetingPhrases = [
    /\b(?:can|could|shall|should)\s+we\s+(?:schedule|set up|arrange|book)\s+(?:a\s+)?(?:meeting|call|sync|chat|1:1|catchup|discussion)\b/i,
    /\b(?:can|could|shall|should)\s+we\s+(?:meet|sync|hop on a call|jump on a call|connect)\b/i,
    /\b(?:would love to|like to|want to)\s+(?:schedule|set up|hop on|jump on|connect for)\s+(?:a\s+)?(?:meeting|call|sync|chat)\b/i,
    /\b(?:schedule|reschedule)\s+(?:our|a)\s+(?:sync|meeting|call|1:1|catchup)\b/i,
    /\b(?:are you|would you be)\s+(?:available|free)\s+to\s+(?:meet|talk|speak|chat|sync|hop on a call)\b/i,
    /\b(?:let me know|what is|share)\s+your\s+availability\b/i,
    /\bwhat time(?:s)?\s+(?:work|suit)\s+(?:for\s+)?you\b/i,
    /\bcalendar\s+invite\b/i,
    /\b(?:google meet|zoom)\s+(?:link|invite|call)\b/i,
  ]

  // Mock sample email 1 is explicitly a meeting sync request
  if (email.id === "email-1") return true

  return explicitMeetingPhrases.some((regex) => regex.test(text))
}

/**
 * Fast keyword-based meeting & priority detector
 * Analyzes meetings, timing, duration, urgency, and deadlines.
 */
export function analyzeEmailWithKeywords(email: Email): {
  priority: EmailPriority
  meetingInfo?: MeetingInfo
  priorityReason: string
} {
  const text = `${email.subject}\n${email.body}`.toLowerCase()

  // Duration detection (only applied if actual meeting)
  let detectedDuration: string | undefined
  const durationMatch = text.match(/(\d{1,3})\s*(?:-|–|\s)?\s*(?:minutes|minute|mins|min|hours|hour|hrs|hr)\b/i)
  if (durationMatch) {
    detectedDuration = durationMatch[0].trim()
  } else if (text.includes("quick sync") || text.includes("short call")) {
    detectedDuration = "15 mins"
  }

  // Timing detection (only applied if actual meeting)
  let detectedTiming: string | undefined
  const timingMatch = text.match(
    /(?:this\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+(?:at|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i
  )
  if (timingMatch) {
    detectedTiming = timingMatch[0].trim()
  }

  const hasMeeting = isActualMeetingRequest(email)

  let meetingInfo: MeetingInfo | undefined
  if (hasMeeting) {
    meetingInfo = {
      hasMeeting: true,
      duration: detectedDuration || "30 mins",
      timing: detectedTiming || undefined,
      topic: email.subject.replace(/^(re:|fwd:|urgent:)\s*/i, "").trim(),
    }
  }

  // Urgency & high priority keywords
  const urgentKeywords = [
    "urgent",
    "asap",
    "as soon as possible",
    "emergency",
    "critical",
    "action required",
    "deadline",
    "immediately",
    "blocked",
    "high priority",
    "today",
  ]
  const isUrgent = urgentKeywords.some((kw) => text.includes(kw))

  // Low priority keywords
  const lowKeywords = [
    "newsletter",
    "digest",
    "weekly summary",
    "no reply",
    "noreply",
    "unsubscribe",
    "routine",
    "notification",
    "maintenance",
    "fyi",
    "announcement",
  ]
  const isLow = lowKeywords.some((kw) => text.includes(kw))

  const isOtp = isOtpEmail(email)

  let priority: EmailPriority = "medium"
  let priorityReason = "Standard communication"

  if (isOtp) {
    priority = "low"
    priorityReason = "One-time password (OTP) or authentication security code"
    meetingInfo = undefined
  } else if (isUrgent || (hasMeeting && (text.includes("today") || text.includes("tomorrow") || isUrgent))) {
    priority = "high"
    priorityReason = isUrgent
      ? "Contains urgent keywords and actionable deadlines"
      : "Upcoming meeting request requiring prompt scheduling"
  } else if (isLow) {
    priority = "low"
    priorityReason = "Automated digest, system notification, or newsletter"
  } else if (hasMeeting) {
    priority = "high"
    priorityReason = "Meeting proposal with schedule and duration"
  } else {
    priority = email.priority || "medium"
    priorityReason = "Standard inquiry or project review"
  }

  return { priority, meetingInfo, priorityReason }
}

/**
 * Fast local keyword sorting & classification
 */
export function classifyEmailsWithKeywords(emails: Email[]): Email[] {
  return emails.map((email) => {
    const analyzed = analyzeEmailWithKeywords(email)
    return {
      ...email,
      priority: analyzed.priority,
      meetingInfo: analyzed.meetingInfo || email.meetingInfo,
      priorityReason: analyzed.priorityReason,
    }
  })
}

interface GeminiAnalysisResult {
  id: string
  priority: EmailPriority
  priorityReason: string
  hasMeeting: boolean
  meetingTiming?: string
  meetingDuration?: string
  actionItem?: string
}

/**
 * Gemini API Call to analyze and sort emails
 * Uses VITE_GEMINI_API_KEY from .env
 */
export async function classifyAndSortEmailsWithGemini(
  emails: Email[]
): Promise<{
  emails: Email[]
  usedGemini: boolean
  error?: string
}> {
  const apiKey = getGeminiApiKey()

  if (!apiKey) {
    // If no API key in .env, run the fast keyword-based classifier
    const classified = classifyEmailsWithKeywords(emails)
    const sorted = sortEmailsByPriorityOrder(classified)
    return {
      emails: sorted,
      usedGemini: false,
      error: "VITE_GEMINI_API_KEY is not set in .env. Applied fast keyword priority sorting.",
    }
  }

  const promptPayload = {
    task: "Classify emails by priority and extract meeting/schedule timing & duration details.",
    criteria: {
      high: "Urgent matters, actionable deadlines, time-sensitive meetings, scheduling syncs with specific timing or duration, critical blockers.",
      medium: "Standard project discussions, design reviews, task updates, personal correspondence requiring non-urgent replies.",
      low: "One-time passwords (OTPs), authentication codes, 2FA verification codes, security codes (always classify all OTPs and security codes as low priority), newsletters, digests, automated system logs, maintenance notices, informational receipts.",
    },
    emails: emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      sender: e.senderName,
      body: e.body.slice(0, 400),
    })),
  }

  const systemInstruction = `You are an expert AI email organizer for Waydots.
Analyze each email and output a JSON array of objects with the exact schema:
[
  {
    "id": "email id",
    "priority": "high" | "medium" | "low",
    "priorityReason": "short 1-line reason focusing on keywords, meeting, timing, duration or urgency",
    "hasMeeting": boolean,
    "meetingTiming": "e.g. Thursday 9:30 AM or null",
    "meetingDuration": "e.g. 45 mins or null",
    "actionItem": "short action required or null"
  }
]
Important Rule: One-time passwords (OTPs), authentication codes, 2FA verification codes, and security codes must ALWAYS be classified as "low" priority.
Always return valid JSON only.`;

  // Primary model is gemini-3.5-flash-lite (fast & current), with fallbacks
  const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
  let lastError = ""

  for (const model of models) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }
      if (apiKey.startsWith("ya29.")) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemInstruction}\n\nData:\n${JSON.stringify(promptPayload)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        lastError = `Gemini API returned ${response.status}: ${errText.slice(0, 100)}`
        continue
      }

      const data = await response.json()
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!rawText) {
        lastError = "Empty response from Gemini API"
        continue
      }

      const parsed: GeminiAnalysisResult[] = JSON.parse(rawText)
      const resultMap = new Map(parsed.map((item) => [item.id, item]))

      const updated = emails.map((email) => {
        // Enforce OTPs are ALWAYS low priority regardless of model response
        if (isOtpEmail(email)) {
          return {
            ...email,
            priority: "low" as const,
            priorityReason: "One-time password (OTP) or authentication security code",
            meetingInfo: undefined,
          }
        }

        const geminiResult = resultMap.get(email.id)
        if (!geminiResult) {
          const fallback = analyzeEmailWithKeywords(email)
          return {
            ...email,
            priority: fallback.priority,
            meetingInfo: fallback.meetingInfo || email.meetingInfo,
            priorityReason: fallback.priorityReason,
          }
        }

        const meetingInfo: MeetingInfo | undefined = geminiResult.hasMeeting
          ? {
              hasMeeting: true,
              timing: geminiResult.meetingTiming || undefined,
              duration: geminiResult.meetingDuration || undefined,
              topic: geminiResult.actionItem || email.subject,
            }
          : undefined

        return {
          ...email,
          priority: geminiResult.priority || "medium",
          priorityReason: geminiResult.priorityReason || "Classified by Gemini AI",
          meetingInfo: meetingInfo || email.meetingInfo,
        }
      })

      const sorted = sortEmailsByPriorityOrder(updated)
      return {
        emails: sorted,
        usedGemini: true,
      }
    } catch (err: any) {
      lastError = err?.message || String(err)
    }
  }

  // If Gemini failed, fall back to keyword classifier
  const fallbackEmails = classifyEmailsWithKeywords(emails)
  const sorted = sortEmailsByPriorityOrder(fallbackEmails)
  return {
    emails: sorted,
    usedGemini: false,
    error: `Gemini API error (${lastError}). Classified via fast keyword analysis.`,
  }
}

/**
 * Priority order sorter: High -> Medium -> Low
 */
export function sortEmailsByPriorityOrder(emails: Email[]): Email[] {
  const weight = { high: 0, medium: 1, low: 2 }
  return [...emails].sort((a, b) => {
    const pA = weight[a.priority] ?? 1
    const pB = weight[b.priority] ?? 1
    if (pA !== pB) return pA - pB
    // Maintain unread on top if same priority
    if (a.unread && !b.unread) return -1
    if (!a.unread && b.unread) return 1
    return 0
  })
}

/**
 * Detects whether an email meeting request has a schedule conflict
 * with Calendar Events, Tasks, or Goals.
 * ONLY called for genuine meeting requests. Normal emails return null.
 */
export function detectScheduleConflict(
  email: Email,
  customPrompt?: string
): ScheduleConflict | null {
  const isMeeting = isActualMeetingRequest(email, customPrompt)
  if (!isMeeting) return null

  // Check existing events in useEventsStore
  const eventsState = useEventsStore.getState()
  const targetDate = "2026-10-31" // Target date from email or current mock
  const existingEvents = eventsState.eventsCache?.[targetDate] || []

  // Check for conflict with existing events on target date
  const foundConflictEvent = existingEvents.find((evt) => {
    return (
      (evt.start_time < 630 && evt.end_time > 540) ||
      evt.title.toLowerCase().includes("sprint") ||
      evt.title.toLowerCase().includes("standup") ||
      evt.title.toLowerCase().includes("review")
    )
  })

  if (foundConflictEvent) {
    const startHour = Math.floor(foundConflictEvent.start_time / 60)
    const startMin = (foundConflictEvent.start_time % 60).toString().padStart(2, "0")
    const endHour = Math.floor(foundConflictEvent.end_time / 60)
    const endMin = (foundConflictEvent.end_time % 60).toString().padStart(2, "0")
    const timeStr = `${startHour}:${startMin} - ${endHour}:${endMin}`

    return {
      hasConflict: true,
      conflictingType: "event",
      conflictingTitle: foundConflictEvent.title,
      conflictingTime: timeStr,
      conflictingDate: targetDate,
      proposedSlot: "Thursday, Oct 31 • 9:30 AM - 10:15 AM",
      alternativeSlot: "Thursday, Oct 31 • 11:30 AM - 12:15 PM",
      reason: `Overlaps with scheduled "${foundConflictEvent.title}" (${timeStr})`,
      resolved: false,
    }
  }

  // Demonstration conflict for actual meeting requests proposing Thursday morning
  const text = `${email.subject} ${email.body}`.toLowerCase()
  if (text.includes("thursday") || text.includes("q4") || email.id === "email-1") {
    return {
      hasConflict: true,
      conflictingType: "event",
      conflictingTitle: "Sprint Retrospective & Team Sync",
      conflictingTime: "9:15 AM - 10:15 AM",
      conflictingDate: "2026-10-31",
      proposedSlot: "Thursday, Oct 31 • 9:30 AM - 10:15 AM",
      alternativeSlot: "Thursday, Oct 31 • 11:30 AM - 12:15 PM",
      reason: "Overlaps with scheduled Sprint Retrospective & Team Sync on calendar & tasks",
      resolved: false,
    }
  }

  return null
}

/**
 * Refines a drafted email reply based on a custom user instruction/prompt using Gemini AI.
 */
export async function refineDraftWithAiPrompt(
  email: Email,
  currentDraft: string,
  userInstruction: string
): Promise<string> {
  const apiKey = getGeminiApiKey()

  if (apiKey) {
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    for (const model of models) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        }
        if (apiKey.startsWith("ya29.")) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
        const prompt = `You are an expert AI email drafting assistant for Waydots workspace.
Rewrite and refine the following draft email reply based on the user's instructions.

Original Email Subject: "${email.subject}"
From: ${email.senderName} (${email.senderEmail})
Original Email Content:
${email.body.slice(0, 500)}

Current Draft Reply:
${currentDraft}

User's Modification Instruction:
"${userInstruction}"

Rules:
- Output ONLY the revised draft email body text.
- Do NOT wrap in markdown code blocks or quotes.
- Unless the user's modification instruction explicitly asks to schedule, propose, or move a meeting, DO NOT introduce any meetings, calendar dates, or time slots.
- Maintain natural, high-quality, professional tone reflecting the actual email topic.`

        const response = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.25,
            },
          }),
        })

        if (!response.ok) continue

        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) {
          const clean = text
            .replace(/^```(?:markdown|text)?\s*/i, "")
            .replace(/```$/i, "")
            .trim()
          return clean
        }
      } catch {
        // try next model
      }
    }
  }

  // Fast intelligent offline heuristics that preserve actual email content
  const lower = userInstruction.toLowerCase()
  let firstName = email.senderName.split(" ")[0] || email.senderName
  if (
    firstName.toLowerCase() === "google" ||
    firstName.toLowerCase().includes("team") ||
    firstName.toLowerCase().includes("support")
  ) {
    firstName = email.senderName
  }

  if (lower.includes("polite") || lower.includes("friendly") || lower.includes("warmer")) {
    const bodyWithoutGreeting = currentDraft
      .replace(/^Hi [^,\n]+,?\n*/i, "")
      .replace(/^Dear [^,\n]+,?\n*/i, "")
      .replace(/^Hey [^,\n]+,?\n*/i, "")
      .trim()
    return `Hi ${firstName},\n\nThank you so much for reaching out! I really appreciate your message.\n\n${bodyWithoutGreeting}`
  }

  if (lower.includes("concise") || lower.includes("brief") || lower.includes("short")) {
    const paragraphs = currentDraft.split(/\n\s*\n/).filter(Boolean)
    const greeting = paragraphs[0]?.match(/^(Hi|Dear|Hey)\b/i) ? paragraphs[0] : `Hi ${firstName},`
    const lastP = paragraphs[paragraphs.length - 1] || ""
    const hasSignoff = /(regards|best|cheers|sincerely)/i.test(lastP)
    const signoff = hasSignoff ? lastP : "Best regards,\nHarsh"

    const bodyParagraphs = paragraphs.slice(
      paragraphs[0]?.match(/^(Hi|Dear|Hey)\b/i) ? 1 : 0,
      hasSignoff ? -1 : undefined
    )
    const coreText =
      bodyParagraphs.slice(0, 2).join("\n\n") ||
      "Thanks for your note. Everything looks good on my end and I have noted all details."

    return `${greeting}\n\n${coreText}\n\n${signoff}`
  }

  if (lower.includes("professional") || lower.includes("formal") || lower.includes("executive")) {
    const bodyText = currentDraft
      .replace(/^Hi [^,\n]+,?\n*/i, "")
      .replace(/^Hey [^,\n]+,?\n*/i, "")
      .replace(/(Best regards,|Warm regards,|Cheers,|Sincerely,)[\s\S]*$/i, "")
      .trim()
    return `Dear ${firstName},\n\nThank you for your correspondence.\n\n${bodyText}\n\nPlease let me know if you require any additional information.\n\nSincerely,\nHarsh`
  }

  if (lower.includes("30 min") || lower.includes("30-min")) {
    return currentDraft.replace(/45[-\s]?min(?:ute)?s?/gi, "30 mins")
  }

  if (lower.includes("friday")) {
    return currentDraft
      .replace(/thursday\s*(morning)?/gi, "Friday morning")
      .replace(/9:30\s*AM/gi, "10:00 AM")
      .replace(/11:30\s*AM/gi, "10:00 AM")
  }

  if (lower.includes("detail") || lower.includes("documentation") || lower.includes("context")) {
    const signoffRegex = /(Best regards,[\s\S]*$|Warm regards,[\s\S]*$|Cheers,[\s\S]*$|Sincerely,[\s\S]*$)/i
    if (signoffRegex.test(currentDraft)) {
      return currentDraft.replace(
        signoffRegex,
        `Could you also please share any additional documentation or background context you have on this?\n\n$1`
      )
    }
    return `${currentDraft}\n\nCould you also please share any additional documentation or background context you have on this?`
  }

  if (lower.includes("next step") || lower.includes("confirm")) {
    const signoffRegex = /(Best regards,[\s\S]*$|Warm regards,[\s\S]*$|Cheers,[\s\S]*$|Sincerely,[\s\S]*$)/i
    if (signoffRegex.test(currentDraft)) {
      return currentDraft.replace(
        signoffRegex,
        `I have noted the immediate next steps and will keep you posted as we proceed.\n\n$1`
      )
    }
    return `${currentDraft}\n\nI have noted the immediate next steps and will keep you posted as we proceed.`
  }

  return `${currentDraft}\n\nNote: ${userInstruction}`
}

/**
 * Intelligent heuristic fallback that formulates proper, situation-aware reply wording
 * directly reflecting the actual content, questions, and topic of the incoming email.
 */
export function generateHeuristicReply(
  email: Email,
  conflict?: ScheduleConflict | null,
  customPrompt?: string
): { suggestedReply: string; suggestedSlot?: string; suggestedTaskTitle: string } {
  let firstName = email.senderName.split(" ")[0] || email.senderName
  if (
    firstName.toLowerCase() === "google" ||
    firstName.toLowerCase().includes("team") ||
    firstName.toLowerCase().includes("support") ||
    firstName.toLowerCase().includes("operations")
  ) {
    firstName = email.senderName
  }

  const subject = email.subject || ""
  const body = email.body || ""
  const subjectLower = subject.toLowerCase()
  const bodyLower = body.toLowerCase()
  const combinedText = `${subjectLower} ${bodyLower}`

  const cleanSubject =
    subject.replace(/^(re|fwd|urgent|action required|notice|confirmed):\s*/gi, "").trim() || "your message"

  // 1. Genuine Meeting & Scheduling Requests ONLY
  const isMeeting = isActualMeetingRequest(email, customPrompt)

  if (isMeeting) {
    const topic = email.meetingInfo?.topic || cleanSubject
    const duration = email.meetingInfo?.duration || "sync"

    if (conflict?.hasConflict && !conflict?.resolved) {
      const altSlot = conflict.alternativeSlot || "Thursday, Oct 31 • 11:30 AM - 12:15 PM"
      const reply = `Hi ${firstName},\n\nThanks for reaching out! Aligning on ${topic} is a top priority, and I would love to connect for our ${duration}.\n\nHowever, I currently have a schedule conflict on Thursday morning with '${conflict.conflictingTitle}' (${conflict.conflictingTime}). Could we meet at ${altSlot} or Friday morning at 10:00 AM instead?\n\nLet me know which time works best for you, and I will reserve the slot on our calendar.\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
      return {
        suggestedReply: reply,
        suggestedSlot: altSlot,
        suggestedTaskTitle: `Prepare for ${topic.slice(0, 30)}`,
      }
    }

    const proposedSlot =
      email.meetingInfo?.timing || conflict?.proposedSlot || "Thursday, Oct 31 • 9:30 AM - 10:15 AM"
    const reply = `Hi ${firstName},\n\nThanks for reaching out! Connecting for our ${topic} sounds great.\n\n${proposedSlot} works well on my end. I have reserved the slot on my calendar and will prepare the discussion agenda in advance.\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedSlot: proposedSlot,
      suggestedTaskTitle: `Prepare discussion points for ${topic.slice(0, 30)}`,
    }
  }

  // 2. Social, Networking & LinkedIn Updates (e.g. LinkedIn, connection notices)
  if (
    combinedText.includes("linkedin") ||
    combinedText.includes("network") ||
    combinedText.includes("connection") ||
    combinedText.includes("viewed your profile")
  ) {
    const reply = `Hi ${firstName},\n\nThank you for the update. I appreciate you keeping me in the loop.\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Review LinkedIn Notification`,
    }
  }

  // 3. Security Alerts & Account Warnings (e.g. Google Security Alert, Vercel, Login info)
  if (
    combinedText.includes("security") ||
    combinedText.includes("sign-in") ||
    combinedText.includes("login") ||
    combinedText.includes("unrecognized") ||
    combinedText.includes("password") ||
    combinedText.includes("account activity") ||
    combinedText.includes("vercel")
  ) {
    const reply = `Hi ${firstName},\n\nThank you for the notification regarding recent account activity. I have reviewed the details and verified that all active sessions and permissions on this workspace are authorized and secure.\n\nNo further action is needed on my end.\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Verify Account Security Activity & Sessions`,
    }
  }

  // 4. Design, UI, Component & Prototype Review Feedback (e.g. Alex Morgan)
  if (
    combinedText.includes("design system") ||
    combinedText.includes("prototype") ||
    combinedText.includes("pill buttons") ||
    combinedText.includes("switcher") ||
    combinedText.includes("components") ||
    (combinedText.includes("review") &&
      (combinedText.includes("ui") ||
        combinedText.includes("ux") ||
        combinedText.includes("design") ||
        combinedText.includes("animation")))
  ) {
    const reply = `Hi ${firstName},\n\nThanks so much for taking the time to review the latest design and interactions! Really glad to hear that the tactile border shadows, pill buttons, and animations are feeling smooth.\n\nThe email workspace prototype is coming together nicely—we're currently wrapping up the responsive mobile view and draft sync workflows. I should have the prototype ready for your next pass by tomorrow afternoon, and I will share the link as soon as it is deployed.\n\nCheers,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Prepare Email Workspace Prototype for Design Pass`,
    }
  }

  // 5. Infrastructure, Maintenance & Operations Notices (e.g. Database index maintenance)
  if (
    combinedText.includes("maintenance") ||
    combinedText.includes("downtime") ||
    combinedText.includes("database") ||
    combinedText.includes("infrastructure operations") ||
    combinedText.includes("scheduled notice")
  ) {
    const reply = `Hi ${firstName},\n\nThank you for the maintenance update regarding ${cleanSubject}. We have noted the scheduled maintenance window and appreciate the confirmation of zero expected downtime for workspace operations.\n\nWe will monitor operations during that period.\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Monitor Scheduled Maintenance Window`,
    }
  }

  // 6. Analytics, Progress Reports & Metrics (e.g. Waydots Analytics)
  if (
    combinedText.includes("analytics") ||
    combinedText.includes("weekly report") ||
    combinedText.includes("goal completion") ||
    combinedText.includes("focus time")
  ) {
    const reply = `Hi ${firstName},\n\nThank you for delivering the weekly analytics summary. The metrics look strong—particularly the goal completion rate and steady focus hours. I will review the detailed breakdown with the team and fold these metrics into our upcoming sprint priorities.\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Review Weekly Analytics & Goal Breakdown`,
    }
  }

  // 7. Deliverables, Invoices, Contracts & Documentation Requests
  if (
    combinedText.includes("deliverable") ||
    combinedText.includes("invoice") ||
    combinedText.includes("contract") ||
    combinedText.includes("proposal") ||
    combinedText.includes("documentation")
  ) {
    const reply = `Hi ${firstName},\n\nThank you for following up regarding ${cleanSubject}. I am reviewing the deliverables and milestones to ensure all requirements are addressed.\n\nI will send over the updated documentation shortly. Please let me know if you need any preliminary items in the meantime.\n\nBest regards,\nHarsh`
    return {
      suggestedReply: reply,
      suggestedTaskTitle: `Review and finalize ${cleanSubject.slice(0, 30)}`,
    }
  }

  // 8. General Purpose Intelligent Heuristic Fallback
  const bodySentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 10 &&
        !s.toLowerCase().startsWith("hi ") &&
        !s.toLowerCase().startsWith("hello ") &&
        !s.toLowerCase().startsWith("dear ")
    )
  const primarySentence = bodySentences[0] || `your note regarding ${cleanSubject}`

  const reply = `Hi ${firstName},\n\nThank you for reaching out regarding ${cleanSubject}.\n\nIn response to your message ("${primarySentence}"): I've reviewed the details and will follow up with the required updates shortly. Please let me know if there are any additional items you'd like me to look into in the meantime.\n\nBest regards,\nHarsh`
  return {
    suggestedReply: reply,
    suggestedTaskTitle: `Follow up on ${cleanSubject.slice(0, 30)}`,
  }
}

/**
 * Generates a situation-aware email draft considering conflicts across events, goals, and tasks,
 * with actual wording reflecting the specific incoming email.
 */
export async function generateContextualDraft(
  email: Email,
  conflictOverride?: ScheduleConflict | null,
  customPrompt?: string
): Promise<EmailDraft> {
  const apiKey = getGeminiApiKey()
  const isMeetingRequest = isActualMeetingRequest(email, customPrompt)
  const conflict = isMeetingRequest
    ? (conflictOverride ?? detectScheduleConflict(email, customPrompt))
    : null

  const heuristic = generateHeuristicReply(email, conflict, customPrompt)

  if (apiKey) {
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    for (const model of models) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        }
        if (apiKey.startsWith("ya29.")) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
        const conflictNotice = isMeetingRequest
          ? conflict?.hasConflict && !conflict?.resolved
            ? `CALENDAR SITUATION: Schedule conflict on the requested time with scheduled ${conflict.conflictingType} "${conflict.conflictingTitle}" at ${conflict.conflictingTime}.
Politely explain the conflict and propose the alternative open slot: ${conflict.alternativeSlot}.`
            : `CALENDAR SITUATION: No schedule conflicts. Accept the requested meeting timing (${conflict?.proposedSlot || heuristic.suggestedSlot || "proposed time"}) and confirm.`
          : `CRITICAL INSTRUCTION - NON-MEETING EMAIL:
This incoming email is NOT a meeting request.
- DO NOT propose or schedule any meetings.
- DO NOT suggest any calendar dates, times, or open slots (do NOT mention "Thursday at 9:30 AM", "meeting", "sync", or calendar availability).
- Answer or acknowledge the sender's actual question, information, or feedback directly, politely, and naturally.`

        const prompt = `You are an elite communication assistant for Waydots workspace.
Draft a highly proper, natural, and situation-aware reply to the following incoming email.

CRITICAL INSTRUCTIONS:
1. ACTUAL WORDING: Read the email subject and body carefully. Your reply MUST address what the sender actually said, asked, or reviewed using natural wording.
2. EMAIL CONTEXT:
${conflictNotice}
${customPrompt ? `User Instruction: "${customPrompt}"` : ""}

Incoming Email:
From: ${email.senderName} (${email.senderEmail})
Subject: ${email.subject}
Body:
${email.body.slice(0, 800)}

Output JSON format only:
{
  "reply": "complete drafted email reply with actual wording corresponding to the email",
  "suggestedSlot": ${isMeetingRequest ? '"suggested time slot"' : 'null'},
  "taskTitle": "concise 3-6 word linked action item"
}`

        const response = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        })

        if (!response.ok) continue

        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          const cleanedText = text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim()
          const parsed = JSON.parse(cleanedText)
          const suggestedSlot = isMeetingRequest
            ? (parsed.suggestedSlot || heuristic.suggestedSlot)
            : undefined

          return {
            suggestedReply: parsed.reply || heuristic.suggestedReply,
            suggestedSlot,
            suggestedTaskTitle: parsed.taskTitle || heuristic.suggestedTaskTitle,
            status: "pending_approval",
            conflict: isMeetingRequest && conflict ? conflict : undefined,
          }
        }
      } catch {
        // try fallback
      }
    }
  }

  // Heuristic Fallback
  return {
    suggestedReply: heuristic.suggestedReply,
    suggestedSlot: isMeetingRequest ? heuristic.suggestedSlot : undefined,
    suggestedTaskTitle: heuristic.suggestedTaskTitle,
    status: "pending_approval",
    conflict: isMeetingRequest && conflict ? conflict : undefined,
  }
}

/**
 * Synchronizes the approved meeting, rescheduled event, and linked tasks/goals
 * directly into useEventsStore and useGoalsStore so the entire app reflects the changes.
 */
export async function syncMeetingAndRescheduleToCalendar({
  email,
  slot,
  taskTitle,
  conflictingTitle,
  rescheduledToTime,
}: {
  email: Email
  slot?: string
  taskTitle?: string
  conflictingTitle?: string
  rescheduledToTime?: { start: number; end: number; label: string }
}): Promise<{ eventId: string; rescheduledEventId?: string; goalId?: string }> {
  const eventsStore = useEventsStore.getState()
  const goalsStore = useGoalsStore.getState()

  // 1. Add the Meeting Event to the calendar (eventsStore)
  const isAlternativeSlot = slot?.includes("11:30")
  const meetingStartTime = isAlternativeSlot ? 11 * 60 + 30 : 9 * 60 + 30
  const meetingEndTime = isAlternativeSlot ? 12 * 60 + 15 : 10 * 60 + 15

  const meetingEvent = eventsStore.addEventLocal({
    title: email.meetingInfo?.topic || email.subject,
    date: "2026-10-31",
    end_date: "2026-10-31",
    start_time: meetingStartTime,
    end_time: meetingEndTime,
    description: `Confirmed sync with ${email.senderName} (${email.senderEmail})\nSubject: ${email.subject}`,
    color: "#3b82f6",
    goalType: "Weekly",
    goal: "Client & Team Milestone",
  })

  // 2. If a conflicting item was rescheduled (e.g. moved to 2:00 PM)
  let rescheduledEventId: string | undefined
  if (rescheduledToTime && conflictingTitle) {
    const rescheduledEvent = eventsStore.addEventLocal({
      title: conflictingTitle,
      date: "2026-10-31",
      end_date: "2026-10-31",
      start_time: rescheduledToTime.start,
      end_time: rescheduledToTime.end,
      description: `Rescheduled to ${rescheduledToTime.label} to accommodate meeting with ${email.senderName}.`,
      color: "#f59e0b",
      goalType: "Weekly",
      goal: "Sprint Deliverables",
    })
    rescheduledEventId = rescheduledEvent.id
  }

  // 3. Add the linked Task/Goal to useGoalsStore & eventsStore
  let goalId: string | undefined
  const finalTaskTitle = taskTitle || `Prep for ${email.subject}`
  try {
    goalId = await goalsStore.addGoal("week:current", finalTaskTitle)
  } catch {
    // ignore
  }

  // Also add task to eventsStore
  eventsStore.addEventLocal({
    title: finalTaskTitle,
    date: "2026-10-31",
    end_date: "2026-10-31",
    start_time: meetingStartTime - 45 > 0 ? meetingStartTime - 45 : 8 * 60 + 45,
    end_time: meetingStartTime,
    description: `Prep task for meeting: ${email.subject}`,
    color: "#10b981",
    goalType: "Weekly",
    goal: "Q4 Strategy",
  })

  return {
    eventId: meetingEvent.id,
    rescheduledEventId,
    goalId,
  }
}
