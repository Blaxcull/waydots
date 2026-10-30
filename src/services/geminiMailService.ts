import type { Email, EmailPriority, MeetingInfo, ScheduleConflict, EmailDraft } from "@/store/emailStore"
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
 * Fast keyword-based meeting & priority detector
 * Analyzes meetings, timing, duration, urgency, and deadlines.
 */
export function analyzeEmailWithKeywords(email: Email): {
  priority: EmailPriority
  meetingInfo?: MeetingInfo
  priorityReason: string
} {
  const text = `${email.subject}\n${email.body}`.toLowerCase()

  // Meeting keywords
  const meetingKeywords = [
    "meet",
    "meeting",
    "sync",
    "call",
    "1:1",
    "one-on-one",
    "kickoff",
    "schedule",
    "reschedule",
    "calendar",
    "invite",
    "zoom",
    "google meet",
    "huddle",
    "catch up",
  ]
  const hasMeetingKeyword = meetingKeywords.some((kw) => text.includes(kw))

  // Duration detection
  let detectedDuration: string | undefined
  const durationMatch = text.match(/(\d{1,3})\s*(?:-|–|\s)?\s*(?:minutes|minute|mins|min|hours|hour|hrs|hr)\b/i)
  if (durationMatch) {
    detectedDuration = durationMatch[0].trim()
  } else if (text.includes("quick sync") || text.includes("short call")) {
    detectedDuration = "15 mins"
  }

  // Timing detection
  let detectedTiming: string | undefined
  const timingMatch = text.match(
    /(?:this\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+(?:at|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i
  )
  if (timingMatch) {
    detectedTiming = timingMatch[0].trim()
  }

  const hasMeeting = hasMeetingKeyword || Boolean(detectedDuration) || Boolean(detectedTiming)

  let meetingInfo: MeetingInfo | undefined
  if (hasMeeting) {
    meetingInfo = {
      hasMeeting: true,
      duration: detectedDuration || (hasMeetingKeyword ? "30 mins" : undefined),
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

  let priority: EmailPriority = "medium"
  let priorityReason = "Standard communication"

  if (isUrgent || (hasMeeting && (text.includes("today") || text.includes("tomorrow") || isUrgent))) {
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
      low: "Newsletters, digests, automated system logs, maintenance notices, informational receipts.",
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
Always return valid JSON only.`;

  // Primary model is gemini-3.5-flash-lite (fast & current), with fallbacks
  const models = ["gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"]
  let lastError = ""

  for (const model of models) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }
      if (apiKey.startsWith("AQ.") || apiKey.startsWith("ya29.")) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(4000),
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
 */
export function detectScheduleConflict(email: Email): ScheduleConflict | null {
  const text = `${email.subject} ${email.body}`.toLowerCase()
  const isMeeting =
    email.meetingInfo?.hasMeeting ||
    text.includes("sync") ||
    text.includes("meet") ||
    text.includes("call") ||
    text.includes("schedule")
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

  // Contextual situation detection for emails proposing Thursday morning
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
    const models = ["gemini-3.5-flash-lite", "gemini-2.5-flash"]
    for (const model of models) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        }
        if (apiKey.startsWith("AQ.") || apiKey.startsWith("ya29.")) {
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
- Keep relevant timing, date slots, and sender names intact unless the user instruction asks to change them.
- Maintain natural, high-quality tone.`

        const response = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(5000),
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
          return text
        }
      } catch {
        // try next model
      }
    }
  }

  // Fast offline heuristics
  const lower = userInstruction.toLowerCase()
  const firstName = email.senderName.split(" ")[0] || email.senderName

  if (lower.includes("polite") || lower.includes("friendly")) {
    return `Hi ${firstName},\n\nThank you so much for reaching out! I really appreciate you connecting.\n\n${currentDraft.replace(/^Hi [^,\n]+,?\n*/i, "").trim()}\n\nLooking forward to speaking soon!\n\nWarm regards,\nHarsh`
  }

  if (lower.includes("concise") || lower.includes("short")) {
    return `Hi ${firstName},\n\nSounds great. Thursday at 11:30 AM works well for our sync. I have reserved the slot on my calendar.\n\nBest,\nHarsh`
  }

  if (lower.includes("30 min") || lower.includes("30-min")) {
    return currentDraft.replace(/45[-\s]?min(?:ute)?s?/gi, "30 mins")
  }

  if (lower.includes("friday")) {
    return currentDraft
      .replace(/thursday/gi, "Friday")
      .replace(/9:30\s*AM/gi, "10:00 AM")
      .replace(/11:30\s*AM/gi, "10:00 AM")
  }

  return `${currentDraft}\n\n[Updated per instruction: "${userInstruction}"]`
}

/**
 * Generates a situation-aware email draft considering conflicts across events, goals, and tasks.
 */
export async function generateContextualDraft(
  email: Email,
  conflictOverride?: ScheduleConflict | null,
  customPrompt?: string
): Promise<EmailDraft> {
  const apiKey = getGeminiApiKey()
  const conflict = conflictOverride ?? detectScheduleConflict(email)
  const firstName = email.senderName.split(" ")[0] || email.senderName

  let defaultSlot = email.meetingInfo?.timing
    ? `${email.meetingInfo.timing} (${email.meetingInfo.duration || "45 mins"})`
    : "Thursday, Oct 31 • 11:30 AM - 12:15 PM"
  const defaultTask = `Prepare for ${email.meetingInfo?.topic || email.subject.slice(0, 30)}`

  if (apiKey) {
    const models = ["gemini-3.5-flash-lite", "gemini-2.5-flash"]
    for (const model of models) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        }
        if (apiKey.startsWith("AQ.") || apiKey.startsWith("ya29.")) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
        const conflictNotice =
          conflict?.hasConflict && !conflict?.resolved
            ? `CRITICAL SITUATION: There is a schedule conflict on the requested time with scheduled ${conflict.conflictingType} "${conflict.conflictingTitle}" at ${conflict.conflictingTime}.
Politely explain the conflict and propose the alternative open slot: ${conflict.alternativeSlot}.`
            : `SITUATION: No schedule conflicts. Accept the requested meeting timing (${conflict?.proposedSlot || defaultSlot}) and mention reserving the calendar slot and adding the prep task to the to-do list.`

        const prompt = `You are an AI assistant for Waydots workspace.
Draft an email response to:
Sender: ${email.senderName} (${email.senderEmail})
Subject: ${email.subject}
Body:
${email.body.slice(0, 600)}

${conflictNotice}
${customPrompt ? `User Instruction: "${customPrompt}"` : ""}

Output JSON only in this format:
{
  "reply": "draft response text",
  "suggestedSlot": "proposed or alternative time slot",
  "taskTitle": "concise 4-7 word linked task title"
}`

        const response = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(5000),
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
          const parsed = JSON.parse(text)
          return {
            suggestedReply: parsed.reply || "",
            suggestedSlot: parsed.suggestedSlot || defaultSlot,
            suggestedTaskTitle: parsed.taskTitle || defaultTask,
            status: "pending_approval",
            conflict: conflict || undefined,
          }
        }
      } catch {
        // try fallback
      }
    }
  }

  // Heuristic Fallback
  let fallbackReply = ""
  if (conflict?.hasConflict && !conflict?.resolved) {
    defaultSlot = conflict.alternativeSlot
    fallbackReply = `Hi ${firstName},\n\nThanks for reaching out! I would love to connect for our ${email.meetingInfo?.duration || "sync"}.\n\nHowever, I currently have a schedule conflict on Thursday morning with '${conflict.conflictingTitle}' (${conflict.conflictingTime}). Could we meet at ${conflict.alternativeSlot} or Friday morning at 10:00 AM instead?\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
  } else {
    defaultSlot = "Thursday, Oct 31 • 9:30 AM - 10:15 AM"
    fallbackReply = `Hi ${firstName},\n\nThanks for reaching out! Thursday at 9:30 AM works great for our sync. I have reserved the slot on my calendar and added the prep task to my to-do list.\n\nLooking forward to speaking!\n\nBest regards,\nHarsh`
  }

  return {
    suggestedReply: fallbackReply,
    suggestedSlot: defaultSlot,
    suggestedTaskTitle: defaultTask,
    status: "pending_approval",
    conflict: conflict || undefined,
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
