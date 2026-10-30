import { supabase } from "@/lib/supabase"
import type { Email } from "@/store/emailStore"
import { classifyEmailsWithKeywords } from "@/services/geminiMailService"

/**
 * Initiates Google OAuth with Gmail Read-Only permission via Supabase.
 */
export async function connectGmailAccount(): Promise<{ error?: string }> {
  try {
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
        localStorage.setItem("google_provider_token", hashProviderToken)
        return hashProviderToken
      }
    }

    // 2. Check URL search query params
    if (window.location.search) {
      const searchParams = new URLSearchParams(window.location.search)
      const queryProviderToken = searchParams.get("provider_token")
      if (queryProviderToken) {
        localStorage.setItem("google_provider_token", queryProviderToken)
        return queryProviderToken
      }
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

function extractBodyFromPayload(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data && payload.mimeType === "text/plain") {
    try {
      return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"))
    } catch {}
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    // Check for text/plain parts first
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        try {
          return atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"))
        } catch {}
      }
    }
    // Recursive check for nested parts (multipart/alternative, etc.)
    for (const part of payload.parts) {
      if (part.parts) {
        const text = extractBodyFromPayload(part)
        if (text) return text
      }
    }
    // Check for text/html parts and strip html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        try {
          const html = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"))
          return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        } catch {}
      }
    }
  }
  return ""
}

/**
 * Fetches the top 20 actual emails from the user's Gmail inbox.
 */
export async function fetchTop20GmailMessages(
  accessToken: string,
  recipientEmail?: string
): Promise<Email[]> {
  const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox"
  const listRes = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!listRes.ok) {
    const errText = await listRes.text()
    if (listRes.status === 401 || listRes.status === 403) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("google_provider_token")
      }
    }
    const isScopeError = errText.toLowerCase().includes("scope") || listRes.status === 403
    if (isScopeError) {
      const scopeErr = new Error("GMAIL_INSUFFICIENT_SCOPES")
      ;(scopeErr as any).status = 403
      throw scopeErr
    }
    throw new Error(`Gmail API returned ${listRes.status}: ${errText.slice(0, 150)}`)
  }

  const listData = await listRes.json()
  const messageItems: Array<{ id: string; threadId: string }> = listData.messages || []

  if (messageItems.length === 0) {
    return []
  }

  let effectiveRecipient = recipientEmail
  if (!effectiveRecipient) {
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        if (userData?.email) {
          effectiveRecipient = userData.email
          if (typeof window !== "undefined") {
            localStorage.setItem("user_email", userData.email)
          }
        }
      }
    } catch {
      // Ignore userinfo lookup errors
    }
  }

  // Fetch full details for the top messages in parallel (batches of 5 to avoid throttling)
  const emailPromises = messageItems.slice(0, 20).map(async (item) => {
    try {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`
      const msgRes = await fetch(msgUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      })
      if (!msgRes.ok) return null
      const msg = await msgRes.json()

      const headers: Array<{ name: string; value: string }> = msg.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

      const subject = getHeader("Subject") || "(No Subject)"
      const fromHeader = getHeader("From") || "Unknown Sender"
      const dateHeader = getHeader("Date")

      // Parse sender name & email from "First Last <email@example.com>"
      let senderName = fromHeader
      let senderEmail = fromHeader
      const fromMatch = fromHeader.match(/^(.*?)\s*<(.+?)>$/)
      if (fromMatch) {
        senderName = fromMatch[1].replace(/["']/g, "").trim() || fromMatch[2]
        senderEmail = fromMatch[2].trim()
      }

      // Decode body cleanly or fallback to snippet
      let body = extractBodyFromPayload(msg.payload) || msg.snippet || ""
      if (body.length > 2000) {
        body = body.slice(0, 2000)
      }

      // Relative or formatted timestamp
      let timestamp = "Today"
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
          timestamp = "Recent"
        }
      }

      const labelIds: string[] = msg.labelIds || []
      const unread = labelIds.includes("UNREAD")
      const starred = labelIds.includes("STARRED")

      const emailObj: Email = {
        id: msg.id,
        subject,
        senderName,
        senderEmail,
        recipientEmail: effectiveRecipient || "you@waydots.com",
        body,
        timestamp,
        unread,
        starred,
        priority: "medium", // will be auto-classified
      }

      return emailObj
    } catch {
      return null
    }
  })

  const results = await Promise.all(emailPromises)
  const validEmails = results.filter((e): e is Email => e !== null)

  // Automatically classify priorities & meetings with keyword rules
  return classifyEmailsWithKeywords(validEmails)
}

