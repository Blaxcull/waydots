import { supabase } from "@/lib/supabase"
import type { Email } from "@/store/emailStore"
import { classifyEmailsWithKeywords } from "@/services/geminiMailService"

/**
 * All required Google OAuth scopes for full Gmail integration (read, send, compose, and modify).
 */
export const GOOGLE_OAUTH_SCOPES =
  "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify"

/**
 * Initiates Google OAuth with Gmail Read, Send, Compose, and Modify permissions via Supabase.
 */
export async function connectGmailAccount(): Promise<{ error?: string }> {
  try {
    const origin = window.location.origin
    const scopes = GOOGLE_OAUTH_SCOPES
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes,
        redirectTo: `${origin}/mail`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          scope: scopes,
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

    // Try refreshing session
    const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }))
    if (refreshData?.session?.provider_token) {
      localStorage.setItem("google_provider_token", refreshData.session.provider_token)
      return refreshData.session.provider_token
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

export const GMAIL_BOUNCE_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56" fill="none">` +
    `<rect x="2" y="2" width="44" height="52" rx="3" fill="#ea8600"/>` +
    `<circle cx="24" cy="9" r="2.5" fill="#c47000"/>` +
    `<rect x="7" y="15" width="34" height="32" rx="2" fill="#ffffff"/>` +
    `<path d="M2 42L14 54H2V42Z" fill="#c47000"/>` +
    `<text x="24" y="38" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="bold" fill="#ea8600" text-anchor="middle">?</text>` +
  `</svg>`
)}`

export function extractEmailBodies(payload: any): { plainText: string; htmlBody: string } {
  if (!payload) return { plainText: "", htmlBody: "" }

  let plainText = ""
  let htmlBody = ""
  const inlineImages = new Map<string, { mime: string; data: string }>()

  function traverse(part: any) {
    if (!part) return

    const mime = (part.mimeType || "").toLowerCase()
    const data = part.body?.data
    const headers: Array<{ name: string; value: string }> = part.headers || []

    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

    if (mime === "text/plain" && data) {
      const decoded = decodeGmailBase64(data)
      plainText = plainText ? `${plainText}\n\n${decoded}` : decoded
    } else if (mime === "text/html" && data) {
      const decoded = decodeGmailBase64(data)
      htmlBody = htmlBody ? `${htmlBody}<br/>${decoded}` : decoded
    } else if (data && (mime.startsWith("image/") || part.filename?.match(/\.(png|jpe?g|gif|webp|svg)$/i))) {
      const contentId = getHeader("content-id")
      const attachmentId = getHeader("x-attachment-id")
      const filename = part.filename || ""

      const effectiveMime = mime.startsWith("image/")
        ? mime
        : filename.toLowerCase().endsWith(".png")
          ? "image/png"
          : filename.toLowerCase().endsWith(".gif")
            ? "image/gif"
            : filename.toLowerCase().endsWith(".svg")
              ? "image/svg+xml"
              : "image/jpeg"

      let cleanData = data.replace(/-/g, "+").replace(/_/g, "/")
      while (cleanData.length % 4 !== 0) {
        cleanData += "="
      }

      const imgInfo = { mime: effectiveMime, data: cleanData }

      if (contentId) {
        const cleanCid = contentId.replace(/^<|>$/g, "").trim().toLowerCase()
        inlineImages.set(cleanCid, imgInfo)
        inlineImages.set(contentId.trim().toLowerCase(), imgInfo)
      }
      if (attachmentId) {
        inlineImages.set(attachmentId.trim().toLowerCase(), imgInfo)
      }
      if (filename) {
        inlineImages.set(filename.trim().toLowerCase(), imgInfo)
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart)
      }
    }
  }

  traverse(payload)

  // Replace inline cid: references in HTML with their data URIs
  if (htmlBody) {
    htmlBody = htmlBody.replace(
      /(src|href|poster|background)\s*=\s*(["'])cid:(?:<)?([^"'>]+?)(?:>)?\2/gi,
      (fullMatch, attr, quote, cidVal) => {
        const key = cidVal.trim().toLowerCase()
        const found = inlineImages.get(key)
        if (found) {
          return `${attr}=${quote}data:${found.mime};base64,${found.data}${quote}`
        }
        return fullMatch
      }
    )

    // Fallback for Mailer-Daemon delivery failure bounce icon if not resolved as inline CID
    htmlBody = htmlBody
      .replace(
        /(src|href|poster|background)\s*=\s*(["']?)cid:(?:<)?icon\.(?:png|jpe?g|gif|webp)(?:@[^"'\s>]+)?(?:>)?\2/gi,
        `$1="${GMAIL_BOUNCE_ICON_DATA_URI}"`
      )
      .replace(
        /<img\b([^>]*?)(src\s*=\s*(["']?)cid:[^"'\s>]+?\3)([^>]*?)>/gi,
        (match, before, _srcAttr, _quote, after) => {
          const combined = `${before} ${after}`
          if (/alt\s*=\s*["'](?:Error(?:\s+Icon)?|Delivery\s+Failure)["']/i.test(combined) || /icon\.png/i.test(match)) {
            return `<img ${before}src="${GMAIL_BOUNCE_ICON_DATA_URI}"${after}>`
          }
          return match
        }
      )
      .replace(
        /https:\/\/www\.gstatic\.com\/images\/icons\/material\/system\/2x\/help_outline_amber_48dp\.png/gi,
        GMAIL_BOUNCE_ICON_DATA_URI
      )
  }

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
async function fetchGmailJson<T>(
  url: string,
  accessToken: string
): Promise<{ data: T | null; status: number; ok: boolean }> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      return { data: null, status: res.status, ok: false }
    }
    const data = (await res.json()) as T
    return { data, status: res.status, ok: true }
  } catch {
    return { data: null, status: 0, ok: false }
  }
}

/**
 * Base64 encodes a UTF-8 string safely in browser/node environments.
 */
export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Encodes a UTF-8 string to URL-safe Base64 as required by the Gmail API.
 */
export function encodeGmailBase64(str: string): string {
  return encodeBase64Utf8(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Constructs an RFC 2822 formatted raw message and encodes it as URL-safe base64.
 */
export function buildRawRfc2822Email(params: {
  to: string
  from?: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  references?: string
}): string {
  const lines: string[] = []
  if (params.to) {
    lines.push(`To: ${params.to}`)
  }
  if (params.from) {
    lines.push(`From: ${params.from}`)
  }
  const encodedSubject = `=?utf-8?B?${encodeBase64Utf8(params.subject || "")}?=`
  lines.push(`Subject: ${encodedSubject}`)
  lines.push("Content-Type: text/plain; charset=utf-8")
  lines.push("MIME-Version: 1.0")
  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`)
  }
  if (params.references) {
    lines.push(`References: ${params.references}`)
  }
  lines.push("")
  lines.push(params.body || "")

  return encodeGmailBase64(lines.join("\r\n"))
}

/**
 * Sends a message via the Gmail REST API (users.messages.send).
 */
export async function sendGmailMessage(params: {
  to: string
  subject: string
  body: string
  threadId?: string
  senderAccount?: string
  accessToken?: string
}): Promise<{ success: boolean; id?: string; error?: string; code?: string; status?: number }> {
  const token = params.accessToken || (await getGoogleProviderToken())
  if (!token) {
    // Mock / offline fallback: store will handle updating local state
    return { success: true }
  }

  try {
    const raw = buildRawRfc2822Email({
      to: params.to,
      from: params.senderAccount,
      subject: params.subject,
      body: params.body,
      threadId: params.threadId,
    })

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      }),
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => null)
      const errorMsg = errJson?.error?.message || `Failed to send email (${res.status})`
      const isInsufficientScopes =
        res.status === 403 ||
        errorMsg.toLowerCase().includes("scope") ||
        errorMsg.toLowerCase().includes("insufficient")

      if (isInsufficientScopes) {
        return {
          success: false,
          code: "GMAIL_INSUFFICIENT_SCOPES",
          status: 403,
          error:
            "Your Google account has not granted permission to send emails. Please ensure permissions were granted during login.",
        }
      }

      return {
        success: false,
        error: errorMsg,
      }
    }

    const json = await res.json()
    return { success: true, id: json.id }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to send email" }
  }
}

/**
 * Sends a draft email via Gmail API (users.drafts.send) or falls back to messages.send.
 */
export async function sendGmailDraft(params: {
  draftId?: string
  to?: string
  subject?: string
  body: string
  threadId?: string
  accessToken?: string
}): Promise<{ success: boolean; id?: string; error?: string; code?: string; status?: number }> {
  const token = params.accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  try {
    // If draftId is an actual Gmail draft identifier
    if (params.draftId && !params.draftId.startsWith("email-draft-")) {
      const raw = buildRawRfc2822Email({
        to: params.to || "recipient@example.com",
        subject: params.subject || "(No Subject)",
        body: params.body,
        threadId: params.threadId,
      })

      const sendDraftRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: params.draftId,
          message: {
            raw,
            ...(params.threadId ? { threadId: params.threadId } : {}),
          },
        }),
      })

      if (sendDraftRes.ok) {
        const json = await sendDraftRes.json()
        return { success: true, id: json.id }
      }

      const errJson = await sendDraftRes.json().catch(() => null)
      const errorMsg = errJson?.error?.message || `Failed to send draft (${sendDraftRes.status})`
      const isInsufficientScopes =
        sendDraftRes.status === 403 ||
        errorMsg.toLowerCase().includes("scope") ||
        errorMsg.toLowerCase().includes("insufficient")

      if (isInsufficientScopes) {
        return {
          success: false,
          code: "GMAIL_INSUFFICIENT_SCOPES",
          status: 403,
          error:
            "Your Google account has not granted permission to send drafts. Please ensure permissions were granted during login.",
        }
      }

      // If draft was not found (404), fall back to sending as standard message
      if (sendDraftRes.status !== 404) {
        return {
          success: false,
          error: errorMsg,
        }
      }
    }

    // Fallback: send as standard message
    return await sendGmailMessage({
      to: params.to || "recipient@example.com",
      subject: params.subject || "(No Subject)",
      body: params.body,
      threadId: params.threadId,
      accessToken: token,
    })
  } catch (err: any) {
    return { success: false, error: err?.message || "Error sending draft" }
  }
}

/**
 * Saves or updates a draft in Gmail via users.drafts.create or users.drafts.update.
 */
export async function saveGmailDraft(params: {
  draftId?: string
  to: string
  subject: string
  body: string
  threadId?: string
  accessToken?: string
}): Promise<{
  success: boolean
  draftId?: string
  id?: string
  error?: string
  code?: string
  status?: number
}> {
  const token = params.accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  try {
    const raw = buildRawRfc2822Email({
      to: params.to,
      subject: params.subject,
      body: params.body,
      threadId: params.threadId,
    })

    if (params.draftId && !params.draftId.startsWith("email-draft-")) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(params.draftId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: params.draftId,
            message: {
              raw,
              ...(params.threadId ? { threadId: params.threadId } : {}),
            },
          }),
        }
      )

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        const errorMsg = errJson?.error?.message || `Failed to update draft (${res.status})`
        const isInsufficientScopes =
          res.status === 403 ||
          errorMsg.toLowerCase().includes("scope") ||
          errorMsg.toLowerCase().includes("insufficient")

        if (isInsufficientScopes) {
          return {
            success: false,
            code: "GMAIL_INSUFFICIENT_SCOPES",
            status: 403,
            error:
              "Your Google account has not granted permission to manage drafts. Please ensure permissions were granted during login.",
          }
        }

        return {
          success: false,
          error: errorMsg,
        }
      }

      const json = await res.json()
      return { success: true, draftId: json.id, id: json.message?.id }
    } else {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            raw,
            ...(params.threadId ? { threadId: params.threadId } : {}),
          },
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        const errorMsg = errJson?.error?.message || `Failed to create draft (${res.status})`
        const isInsufficientScopes =
          res.status === 403 ||
          errorMsg.toLowerCase().includes("scope") ||
          errorMsg.toLowerCase().includes("insufficient")

        if (isInsufficientScopes) {
          return {
            success: false,
            code: "GMAIL_INSUFFICIENT_SCOPES",
            status: 403,
            error:
              "Your Google account has not granted permission to manage drafts. Please ensure permissions were granted during login.",
          }
        }

        return {
          success: false,
          error: errorMsg,
        }
      }

      const json = await res.json()
      return { success: true, draftId: json.id, id: json.message?.id }
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save draft" }
  }
}

/**
 * Moves an email in Gmail to Trash (or permanently deletes a draft if it is an unsent draft).
 */
export async function deleteGmailMessage(params: {
  id: string
  draftId?: string
  isDraft?: boolean
  accessToken?: string
}): Promise<{ success: boolean; error?: string; status?: number }> {
  const token = params.accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  // Skip local mock IDs
  if (params.id.startsWith("email-") || params.id.startsWith("mock-")) {
    return { success: true }
  }

  try {
    // If it is a draft with a Gmail draftId, delete via drafts endpoint
    if (params.isDraft && params.draftId && !params.draftId.startsWith("email-")) {
      const draftRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(params.draftId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      if (draftRes.ok || draftRes.status === 204 || draftRes.status === 404) {
        return { success: true }
      }
    }

    // Move message to Trash via users.messages.trash
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(params.id)}/trash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (res.ok || res.status === 204 || res.status === 404) {
      return { success: true }
    }

    const errJson = await res.json().catch(() => null)
    return {
      success: false,
      status: res.status,
      error: errJson?.error?.message || `Failed to move email to Trash (${res.status})`,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to delete email in Gmail" }
  }
}

/**
 * Restores an email from Trash in Gmail (untrash).
 */
export async function untrashGmailMessage(
  id: string,
  accessToken?: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  const token = accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  if (id.startsWith("email-") || id.startsWith("mock-")) {
    return { success: true }
  }

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/untrash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (res.ok || res.status === 204 || res.status === 404) {
      return { success: true }
    }

    const errJson = await res.json().catch(() => null)
    return {
      success: false,
      status: res.status,
      error: errJson?.error?.message || `Failed to untrash email in Gmail (${res.status})`,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to untrash email in Gmail" }
  }
}

/**
 * Marks a Gmail message as read by removing the UNREAD label in Gmail.
 * Executed as fast as possible when viewing an email.
 */
export async function markGmailMessageAsRead(
  id: string,
  accessToken?: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  const token = accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  // Skip local mock IDs
  if (id.startsWith("email-") || id.startsWith("mock-")) {
    return { success: true }
  }

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          removeLabelIds: ["UNREAD"],
        }),
      }
    )

    if (res.ok || res.status === 204) {
      return { success: true }
    }

    const errJson = await res.json().catch(() => null)
    return {
      success: false,
      status: res.status,
      error: errJson?.error?.message || `Failed to mark email as read in Gmail (${res.status})`,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to mark email as read in Gmail" }
  }
}

/**
 * Modifies labels (such as UNREAD) on multiple messages simultaneously in Gmail.
 */
export async function batchModifyGmailMessages(params: {
  ids: string[]
  addLabelIds?: string[]
  removeLabelIds?: string[]
  accessToken?: string
}): Promise<{ success: boolean; error?: string; status?: number }> {
  const realIds = params.ids.filter((id) => !id.startsWith("email-") && !id.startsWith("mock-"))
  if (realIds.length === 0) {
    return { success: true }
  }

  const token = params.accessToken || (await getGoogleProviderToken())
  if (!token) {
    return { success: true }
  }

  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: realIds,
          ...(params.addLabelIds ? { addLabelIds: params.addLabelIds } : {}),
          ...(params.removeLabelIds ? { removeLabelIds: params.removeLabelIds } : {}),
        }),
      }
    )

    if (res.ok || res.status === 204) {
      return { success: true }
    }

    const errJson = await res.json().catch(() => null)
    return {
      success: false,
      status: res.status,
      error: errJson?.error?.message || `Failed to batch modify emails in Gmail (${res.status})`,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to batch modify emails in Gmail" }
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
  isTrash?: boolean
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

    if (profileRes.status === 401 || detailedMsg.toLowerCase().includes("invalid authentication")) {
      const authErr = new Error("Google access token has expired. Please sign in again with Google to refresh access.")
      ;(authErr as any).status = 401
      ;(authErr as any).code = "GMAIL_TOKEN_EXPIRED"
      throw authErr
    }

    if (detailedMsg.includes("has not been used in project") || detailedMsg.includes("is disabled")) {
      const match = detailedMsg.match(/https:\/\/console\.developers\.google\.com\/[^\s]+/i)
      const enableUrl = match ? match[0] : "https://console.cloud.google.com/apis/library/gmail.googleapis.com"
      const apiErr = new Error(`Gmail API is not enabled in your Google Cloud Project: ${detailedMsg}`)
      ;(apiErr as any).status = 403
      ;(apiErr as any).code = "GMAIL_API_DISABLED"
      ;(apiErr as any).enableUrl = enableUrl
      throw apiErr
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

  // 2. Concurrently query Inbox, Starred, Sent, Drafts, and Trash
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

  const [inboxRes, starredRes, sentRes, draftMsgRes, draftsListRes, trashRes] = await Promise.allSettled([
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
    fetchGmailJson<GmailListResult>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&includeSpamTrash=true&q=in:trash",
      accessToken
    ),
  ])

  // Check if any folder query failed due to invalid token or insufficient scopes
  const has401 = [inboxRes, starredRes, sentRes, draftMsgRes, draftsListRes, trashRes].some(
    (r) => r.status === "fulfilled" && r.value.status === 401
  )
  if (has401) {
    const authErr = new Error("Google access token has expired. Please sign in again with Google to refresh access.")
    ;(authErr as any).status = 401
    ;(authErr as any).code = "GMAIL_TOKEN_EXPIRED"
    throw authErr
  }

  const authForbidden = [inboxRes, starredRes, sentRes, draftMsgRes, draftsListRes, trashRes].some(
    (r) => r.status === "fulfilled" && r.value.status === 403
  )
  if (authForbidden) {
    const scopeErr = new Error("GMAIL_INSUFFICIENT_SCOPES: Google authorization expired or insufficient scopes")
    ;(scopeErr as any).status = 403
    ;(scopeErr as any).code = "GMAIL_INSUFFICIENT_SCOPES"
    throw scopeErr
  }

  // 3. Deduplicate message IDs and accumulate folder membership tags
  const itemMap = new Map<string, MessageItemMeta>()

  const recordItem = (
    id: string,
    threadId: string | undefined,
    flag: "isInbox" | "isStarred" | "isSent" | "isDraft" | "isTrash",
    draftId?: string
  ) => {
    if (!id) return
    const cur = itemMap.get(id) || { id, threadId }
    cur[flag] = true
    if (threadId && !cur.threadId) cur.threadId = threadId
    if (draftId && !cur.draftId) cur.draftId = draftId
    itemMap.set(id, cur)
  }

  if (inboxRes.status === "fulfilled" && inboxRes.value?.data?.messages) {
    for (const m of inboxRes.value.data.messages) recordItem(m.id, m.threadId, "isInbox")
  }
  if (starredRes.status === "fulfilled" && starredRes.value?.data?.messages) {
    for (const m of starredRes.value.data.messages) recordItem(m.id, m.threadId, "isStarred")
  }
  if (sentRes.status === "fulfilled" && sentRes.value?.data?.messages) {
    for (const m of sentRes.value.data.messages) recordItem(m.id, m.threadId, "isSent")
  }
  if (draftMsgRes.status === "fulfilled" && draftMsgRes.value?.data?.messages) {
    for (const m of draftMsgRes.value.data.messages) recordItem(m.id, m.threadId, "isDraft")
  }
  if (draftsListRes.status === "fulfilled" && draftsListRes.value?.data?.drafts) {
    for (const d of draftsListRes.value.data.drafts) {
      const msgId = d.message?.id || d.id
      recordItem(msgId, d.message?.threadId, "isDraft", d.id)
    }
  }
  if (trashRes.status === "fulfilled" && trashRes.value?.data?.messages) {
    for (const m of trashRes.value.data.messages) recordItem(m.id, m.threadId, "isTrash")
  }

  const itemsToFetch = Array.from(itemMap.values())
  if (itemsToFetch.length === 0) {
    return []
  }

  // 4. Fetch full details in parallel batches of 10 to minimize latency & respect rate limits
  const batchSize = 10
  const fetchedEmails: Email[] = []
  let authErrorDetected = false

  for (let i = 0; i < itemsToFetch.length; i += batchSize) {
    if (authErrorDetected) break

    const chunk = itemsToFetch.slice(i, i + batchSize)
    const chunkPromises = chunk.map(async (meta) => {
      try {
        const msgRes = await fetchGmailJson<any>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${meta.id}?format=full`,
          accessToken
        )
        if (msgRes.status === 401 || msgRes.status === 403) {
          authErrorDetected = true
          return null
        }
        let msg = msgRes.data
        if (!msg && meta.draftId) {
          const draftRes = await fetchGmailJson<any>(
            `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${meta.draftId}?format=full`,
            accessToken
          )
          if (draftRes.status === 401 || draftRes.status === 403) {
            authErrorDetected = true
            return null
          }
          if (draftRes.data?.message) {
            msg = draftRes.data.message
          }
        }
        if (!msg) return null

        const labelIds: string[] = msg.labelIds || []
        const isTrash = Boolean(labelIds.includes("TRASH") || meta.isTrash)
        const isDraft = Boolean((labelIds.includes("DRAFT") || meta.isDraft) && !isTrash)
        const isSent = Boolean((labelIds.includes("SENT") || meta.isSent) && !isDraft && !isTrash)
        const starred = Boolean((labelIds.includes("STARRED") || meta.isStarred) && !isTrash)
        const unread = Boolean(labelIds.includes("UNREAD") && !isDraft && !isSent && !isTrash)

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
          isTrash: isTrash || undefined,
          priority: isTrash ? "low" : "medium",
          priorityReason: isTrash ? "In Trash / Bin" : undefined,
          draftId: meta.draftId,
          threadId: msg.threadId || meta.threadId,
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

  if (authErrorDetected) {
    const scopeErr = new Error("GMAIL_INSUFFICIENT_SCOPES: Google authorization expired or insufficient scopes")
    ;(scopeErr as any).status = 403
    ;(scopeErr as any).code = "GMAIL_INSUFFICIENT_SCOPES"
    throw scopeErr
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

