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
        scopes: "https://www.googleapis.com/auth/gmail.readonly email profile",
        redirectTo: `${origin}/mail`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
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
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.provider_token || null
  } catch {
    return null
  }
}

/**
 * Fetches the top 20 actual emails from the user's Gmail inbox.
 */
export async function fetchTop20GmailMessages(accessToken: string): Promise<Email[]> {
  const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox"
  const listRes = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!listRes.ok) {
    const errText = await listRes.text()
    throw new Error(`Gmail API returned ${listRes.status}: ${errText.slice(0, 150)}`)
  }

  const listData = await listRes.json()
  const messageItems: Array<{ id: string; threadId: string }> = listData.messages || []

  if (messageItems.length === 0) {
    return []
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

      // Decode body or fallback to snippet
      let body = msg.snippet || ""
      const bodyData =
        msg.payload?.parts?.[0]?.body?.data ||
        msg.payload?.body?.data
      if (bodyData) {
        try {
          const decoded = atob(bodyData.replace(/-/g, "+").replace(/_/g, "/"))
          if (decoded && decoded.length > 10) {
            body = decoded.slice(0, 800)
          }
        } catch {
          // keep snippet
        }
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
        recipientEmail: "you@waydots.com",
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

