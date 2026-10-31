import { supabase } from "@/lib/supabase"
import type { Email } from "@/store/emailStore"
import { classifyEmailsWithKeywords } from "@/services/geminiMailService"

/**
 * Initiates Google OAuth with Gmail Read-Only permission via Supabase.
 */
export async function connectGmailAccount(): Promise<{ error?: string }> {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("google_provider_token")
      localStorage.removeItem("google_provider_token_rejected")
    }
    const origin = window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
        redirectTo: `${origin}/mail`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
        },
      },
    })
    if (error) {
      return { error: error.message }
    }
    return {}
  } catch (err: any) {
    return { error: err?.message || "Failed to initialize Google login" }
  }
}

/**
 * Retrieves the current session's Google OAuth provider token (access token).
 */
export async function getGoogleProviderToken(): Promise<string | null> {
  if (typeof window === "undefined") return null

  try {
    // 1. Immediately extract from URL hash if returning from Google OAuth redirect
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      const hashProviderToken = hashParams.get("provider_token")
      if (hashProviderToken) {
        localStorage.removeItem("google_provider_token_rejected")
        localStorage.setItem("google_provider_token", hashProviderToken)
        return hashProviderToken
      }
    }

    // 2. Check URL search query params
    if (window.location.search) {
      const searchParams = new URLSearchParams(window.location.search)
      const queryProviderToken = searchParams.get("provider_token")
      if (queryProviderToken) {
        localStorage.removeItem("google_provider_token_rejected")
        localStorage.setItem("google_provider_token", queryProviderToken)
        return queryProviderToken
      }
    }

    // If the token was previously rejected for 403 / insufficient scopes, do not reuse it
    if (localStorage.getItem("google_provider_token_rejected") === "true") {
      return null
    }

    // 3. Check dedicated localStorage cache
    const cachedToken = localStorage.getItem("google_provider_token")
    if (cachedToken) {
      return cachedToken
    }

    // 4. Check Supabase session
    const { data } = await supabase.auth.getSession()
    const token = data.session?.provider_token
    if (token) {
      localStorage.setItem("google_provider_token", token)
      return token
    }

    // 5. Inspect Supabase's stored auth item in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith("sb-") || key.includes("auth-token"))) {
        try {
          const raw = localStorage.getItem(key)
          if (raw) {
            const parsed = JSON.parse(raw)
            const pt = parsed?.provider_token || parsed?.currentSession?.provider_token
            if (pt) {
              localStorage.setItem("google_provider_token", pt)
              return pt
            }
          }
        } catch {
          // ignore parse error
        }
      }
    }

    return null
  } catch {
    return localStorage.getItem("google_provider_token")
  }
}

export function decodeGmailBase64(base64Str: string): string {
  if (!base64Str) return ""
  try {
    let clean = base64Str.replace(/-/g, "+").replace(/_/g, "/")
    while (clean.length % 4 !== 0) {
      clean += "="
    }
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder("utf-8").decode(bytes)
  } catch {
    try {
      return atob(base64Str.replace(/-/g, "+").replace(/_/g, "/"))
    } catch {
      return ""
    }
  }
}

export function extractEmailBodies(payload: any): { plainText: string; htmlBody: string } {
  if (!payload) return { plainText: "", htmlBody: "" }

  let plainText = ""
  let htmlBody = ""

  function traverse(part: any) {
    if (!part) return

    const mime = (part.mimeType || "").toLowerCase()
    const data = part.body?.data

    if (mime === "text/plain" && data) {
      const decoded = decodeGmailBase64(data)
      plainText = plainText ? `${plainText}\n\n${decoded}` : decoded
    } else if (mime === "text/html" && data) {
      const decoded = decodeGmailBase64(data)
      htmlBody = htmlBody ? `${htmlBody}<br/>${decoded}` : decoded
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart)
      }
    }
  }

  traverse(payload)

  // If plainText is missing but htmlBody exists, strip tags cleanly for search/snippets/AI
  if (!plainText && htmlBody) {
    plainText = htmlBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
  }

  return { plainText, htmlBody }
}

/**
 * Helper to fetch and parse JSON from Gmail API with Authorization header
 */
async function fetchGmailJson<T>(url: string, accessToken: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      return null
    }
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface MessageItemMeta {
  id: string
  threadId?: string
  draftId?: string
  isInbox?: boolean
  isStarred?: boolean
  isSent?: boolean
  isDraft?: boolean
}

/**
 * Fetches and synchronizes all emails across Inbox, Starred, Drafts, and Sent
 * in a single operation from the user's Gmail account.
 */
export async function fetchAllGmailFolders(
  accessToken: string,
  recipientEmail?: string
): Promise<Email[]> {
  // 1. Verify token & permissions with user's Gmail profile
  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!profileRes.ok) {
    const errText = await profileRes.text()
    let detailedMsg = errText
    try {
      const errJson = JSON.parse(errText)
      if (errJson?.error?.message) {
        detailedMsg = errJson.error.message
      }
    } catch {
      // ignore json parse error
    }

    console.error("Gmail API Error (" + profileRes.status + "):", detailedMsg)

    if (detailedMsg.includes("has not been used in project") || detailedMsg.includes("is disabled")) {
      const match = detailedMsg.match(/https:\/\/console\.developers\.google\.com\/[^\s]+/i)
      const enableUrl = match ? match[0] : "https://console.cloud.google.com/apis/library/gmail.googleapis.com"
      const apiErr = new Error(`Gmail API is not enabled in your Google Cloud Project: ${detailedMsg}`)
      ;(apiErr as any).status = 403
      ;(apiErr as any).code = "GMAIL_API_DISABLED"
      ;(apiErr as any).enableUrl = enableUrl
      throw apiErr
    }

    if (profileRes.status === 401 || profileRes.status === 403) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("google_provider_token")
        localStorage.setItem("google_provider_token_rejected", "true")
      }
    }

    if (detailedMsg.toLowerCase().includes("scope") || profileRes.status === 403) {
      const scopeErr = new Error(`GMAIL_INSUFFICIENT_SCOPES: ${detailedMsg}`)
      ;(scopeErr as any).status = 403
      ;(scopeErr as any).code = "GMAIL_INSUFFICIENT_SCOPES"
      throw scopeErr
    }

    throw new Error(`Gmail API returned ${profileRes.status}: ${detailedMsg.slice(0, 150)}`)
  }

  const profileData = await profileRes.json().catch(() => null)
  let effectiveRecipient = recipientEmail || profileData?.emailAddress
  if (!effectiveRecipient && typeof window !== "undefined") {
    effectiveRecipient = localStorage.getItem("user_email") || undefined
  }
  if (profileData?.emailAddress && typeof window !== "undefined") {
    localStorage.setItem("user_email", profileData.emailAddress)
  }

  // 2. Concurrently query Inbox, Starred, Sent, and Drafts
  interface GmailListResult {
    messages?: Array<{ id: string; threadId?: string }>
    resultSizeEstimate?: number
  }

  interface GmailDraftsResult {
    drafts?: Array<{
      id: string
      message?: { id: string; threadId?: string }
    }>
    resultSizeEstimate?: number
  }

  const [inboxRes, starredRes, sentRes, draftMsgRes, draftsListRes] = await Promise.allSettled([
    fetchGmailJson<GmailListResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:inbox",
      accessToken
    ),
    fetchGmailJson<GmailListResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=is:starred",
      accessToken
    ),
    fetchGmailJson<GmailListResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:sent",
      accessToken
    ),
    fetchGmailJson<GmailListResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:draft",
      accessToken
    ),
    fetchGmailJson<GmailDraftsResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=25",
      accessToken
    ),
  ])

  // 3. Deduplicate message IDs and accumulate folder membership tags
  const itemMap = new Map<string, MessageItemMeta>()

  const recordItem = (
    id: string,
    threadId: string | undefined,
    flag: "isInbox" | "isStarred" | "isSent" | "isDraft",
    draftId?: string
  ) => {
    if (!id) return
    const cur = itemMap.get(id) || { id, threadId }
    cur[flag] = true
    if (threadId && !cur.threadId) cur.threadId = threadId
    if (draftId && !cur.draftId) cur.draftId = draftId
    itemMap.set(id, cur)
  }

  if (inboxRes.status === "fulfilled" && inboxRes.value?.messages) {
    for (const m of inboxRes.value.messages) recordItem(m.id, m.threadId, "isInbox")
  }
  if (starredRes.status === "fulfilled" && starredRes.value?.messages) {
    for (const m of starredRes.value.messages) recordItem(m.id, m.threadId, "isStarred")
  }
  if (sentRes.status === "fulfilled" && sentRes.value?.messages) {
    for (const m of sentRes.value.messages) recordItem(m.id, m.threadId, "isSent")
  }
  if (draftMsgRes.status === "fulfilled" && draftMsgRes.value?.messages) {
    for (const m of draftMsgRes.value.messages) recordItem(m.id, m.threadId, "isDraft")
  }
  if (draftsListRes.status === "fulfilled" && draftsListRes.value?.drafts) {
    for (const d of draftsListRes.value.drafts) {
      const msgId = d.message?.id || d.id
      recordItem(msgId, d.message?.threadId, "isDraft", d.id)
    }
  }

  const itemsToFetch = Array.from(itemMap.values())
  if (itemsToFetch.length === 0) {
    return []
  }

  // 4. Fetch full details in parallel batches of 10 to minimize latency & respect rate limits
  const batchSize = 10
  const fetchedEmails: Email[] = []

  for (let i = 0; i < itemsToFetch.length; i += batchSize) {
    const chunk = itemsToFetch.slice(i, i + batchSize)
    const chunkPromises = chunk.map(async (meta) => {
      try {
        let msg = await fetchGmailJson<any>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${meta.id}?format=full`,
          accessToken
        )
        if (!msg && meta.draftId) {
          const draftObj = await fetchGmailJson<any>(
            `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${meta.draftId}?format=full`,
            accessToken
          )
          if (draftObj?.message) {
            msg = draftObj.message
          }
        }
        if (!msg) return null

        const labelIds: string[] = msg.labelIds || []
        const isDraft = Boolean(labelIds.includes("DRAFT") || meta.isDraft)
        const isSent = Boolean((labelIds.includes("SENT") || meta.isSent) && !isDraft)
        const starred = Boolean(labelIds.includes("STARRED") || meta.isStarred)
        const unread = Boolean(labelIds.includes("UNREAD") && !isDraft && !isSent)

        const headers: Array<{ name: string; value: string }> = msg.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

        const subject = getHeader("Subject") || (isDraft ? "(Draft)" : "(No Subject)")
        const fromHeader = getHeader("From") || ""
        const toHeader = getHeader("To") || ""
        const dateHeader = getHeader("Date")

        let senderName = fromHeader || "Unknown Sender"
        let senderEmail = fromHeader || ""
        const fromMatch = fromHeader.match(/^(.*?)\s*<(.+?)>$/)
        if (fromMatch) {
          senderName = fromMatch[1].replace(/["']/g, "").trim() || fromMatch[2]
          senderEmail = fromMatch[2].trim()
        }

        let recipientEmail = effectiveRecipient || "you@waydots.com"
        if (toHeader) {
          const toMatch = toHeader.match(/^(.*?)\s*<(.+?)>$/)
          recipientEmail = toMatch ? toMatch[2].trim() : toHeader.replace(/["']/g, "").trim()
        }

        // For drafts and sent emails, user is the sender
        if (isDraft || isSent) {
          if (
            !senderName ||
            senderName === "Unknown Sender" ||
            (effectiveRecipient && senderEmail.toLowerCase() === effectiveRecipient.toLowerCase()) ||
            senderName.toLowerCase().includes("me")
          ) {
            senderName = "You"
          }
        }

        let timestamp = isDraft ? "Draft" : "Today"
        if (dateHeader) {
          try {
            const d = new Date(dateHeader)
            const now = new Date()
            if (d.toDateString() === now.toDateString()) {
              timestamp = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            } else {
              timestamp = d.toLocaleDateString([], { month: "short", day: "numeric" })
            }
          } catch {
            timestamp = isDraft ? "Draft" : "Recent"
          }
        }

        const { plainText, htmlBody } = extractEmailBodies(msg.payload)
        let body = plainText || msg.snippet || ""
        if (!body && htmlBody) {
          body = msg.snippet || "Email content"
        }

        const emailObj: Email = {
          id: msg.id,
          subject,
          senderName,
          senderEmail,
          recipientEmail,
          body,
          htmlBody: htmlBody || undefined,
          timestamp,
          unread,
          starred,
          isDraft: isDraft || undefined,
          isSent: isSent || undefined,
          priority: "medium",
        }

        return emailObj
      } catch {
        return null
      }
    })

    const chunkResults = await Promise.all(chunkPromises)
    for (const item of chunkResults) {
      if (item) fetchedEmails.push(item)
    }
  }

  // Automatically classify priorities & meetings with keyword intelligence
  return classifyEmailsWithKeywords(fetchedEmails)
}

/**
 * Backward-compatible alias for fetchAllGmailFolders.
 */
export async function fetchTop20GmailMessages(
  accessToken: string,
  recipientEmail?: string
): Promise<Email[]> {
  return fetchAllGmailFolders(accessToken, recipientEmail)
}

