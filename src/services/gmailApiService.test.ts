import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  decodeGmailBase64,
  encodeGmailBase64,
  buildRawRfc2822Email,
  extractEmailBodies,
  GMAIL_BOUNCE_ICON_DATA_URI,
  fetchAllGmailFolders,
  sendGmailDraft,
  sendGmailMessage,
  saveGmailDraft,
  deleteGmailMessage,
  untrashGmailMessage,
  markGmailMessageAsRead,
  batchModifyGmailMessages,
} from "./gmailApiService"

describe("gmailApiService decoding and HTML extraction", () => {
  it("decodes URL-safe base64 string including UTF-8 characters", () => {
    // UTF-8 string: "Hello, World! 🚀 Café"
    // UTF-8 bytes: [72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33, 32, 240, 159, 154, 128, 32, 67, 97, 102, 195, 169]
    // Base64 standard: SGVsbG8sIFdvcmxkISDwn5mAIE stere...
    // Let's test with simple base64 first
    const raw = "SGVsbG8sIFdvcmxkIQ==" // "Hello, World!"
    expect(decodeGmailBase64(raw)).toBe("Hello, World!")

    // URL-safe with '-' and '_'
    // "a+b/c" in URL-safe base64: "YStiL2M"
    expect(decodeGmailBase64("YStiL2M=")).toBe("a+b/c")
  })

  it("extracts plainText and htmlBody from single-part HTML payload", () => {
    // "<b>Hello World</b>" in base64: "PGI+SGVsbG8gV29ybGQ8L2I+"
    const payload = {
      mimeType: "text/html",
      body: {
        data: "PGI+SGVsbG8gV29ybGQ8L2I+",
      },
    }

    const { plainText, htmlBody } = extractEmailBodies(payload)
    expect(htmlBody).toBe("<b>Hello World</b>")
    expect(plainText).toBe("Hello World")
  })

  it("extracts plainText and htmlBody from multipart/alternative payload", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: "UGxhaW4gdGV4dCB2ZXJzaW9u", // "Plain text version"
          },
        },
        {
          mimeType: "text/html",
          body: {
            data: "PGgxPlJpY2ggSFRNTDwvaDE+", // "<h1>Rich HTML</h1>"
          },
        },
      ],
    }

    const { plainText, htmlBody } = extractEmailBodies(payload)
    expect(plainText).toBe("Plain text version")
    expect(htmlBody).toBe("<h1>Rich HTML</h1>")
  })

  it("traverses nested multipart/mixed structures cleanly", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: "TmVzdGVkIHBsYWluIHRleHQ=", // "Nested plain text"
              },
            },
            {
              mimeType: "text/html",
              body: {
                data: "PHA+TmVzdGVkIDxzdHJvbmc+SFRNTDwvc3Ryb25nPjwvcD4=", // "<p>Nested <strong>HTML</strong></p>"
              },
            },
          ],
        },
      ],
    }

    const { plainText, htmlBody } = extractEmailBodies(payload)
    expect(plainText).toBe("Nested plain text")
    expect(htmlBody).toBe("<p>Nested <strong>HTML</strong></p>")
  })

  it("extracts inline CID images and converts them to base64 data URIs", () => {
    // base64 encoded "image-bytes-mock"
    const rawImageBytes = "aW1hZ2UtYnl0ZXMtbW9jaw=="
    const htmlWithCid = encodeGmailBase64(
      '<p>Here is the attachment: <img src="cid:chart.png" alt="chart"/></p>'
    )

    const payload = {
      mimeType: "multipart/related",
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: htmlWithCid,
          },
        },
        {
          mimeType: "image/png",
          filename: "chart.png",
          headers: [
            { name: "Content-ID", value: "<chart.png>" },
            { name: "Content-Disposition", value: 'inline; filename="chart.png"' },
          ],
          body: {
            data: rawImageBytes,
          },
        },
      ],
    }

    const { htmlBody } = extractEmailBodies(payload)
    expect(htmlBody).toContain('src="data:image/png;base64,aW1hZ2UtYnl0ZXMtbW9jaw=="')
  })

  it("provides fallback for Mailer-Daemon delivery failure bounce icon if not resolved as inline CID", () => {
    const htmlWithBounce = encodeGmailBase64(
      '<div><b>Address not found</b><img src="cid:icon.png" alt="Error"/></div>'
    )

    const payload = {
      mimeType: "text/html",
      body: {
        data: htmlWithBounce,
      },
    }

    const { htmlBody } = extractEmailBodies(payload)
    expect(htmlBody).toContain(`src="${GMAIL_BOUNCE_ICON_DATA_URI}"`)
  })

  describe("fetchAllGmailFolders one-click synchronization", () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      vi.restoreAllMocks()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it("fetches, deduplicates, and categorizes Inbox, Starred, Sent, and Draft emails", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/users/me/profile")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ emailAddress: "harsh@waydots.com" }),
          })
        }
        if (url.includes("q=in%3Ainbox") || url.includes("q=in:inbox")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ id: "msg-inbox", threadId: "t-1" }] }),
          })
        }
        if (url.includes("q=is%3Astarred") || url.includes("q=is:starred")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ id: "msg-inbox", threadId: "t-1" }, { id: "msg-starred-sent", threadId: "t-2" }] }),
          })
        }
        if (url.includes("q=in%3Asent") || url.includes("q=in:sent")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ id: "msg-starred-sent", threadId: "t-2" }] }),
          })
        }
        if (url.includes("q=in%3Adraft") || url.includes("q=in:draft")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          })
        }
        if (url.includes("q=in%3Atrash") || url.includes("q=in:trash")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ id: "msg-trash", threadId: "t-4" }] }),
          })
        }
        if (url.includes("/users/me/drafts")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              drafts: [
                {
                  id: "draft-xyz",
                  message: { id: "msg-draft", threadId: "t-3" },
                },
              ],
            }),
          })
        }
        if (url.includes("/messages/msg-inbox")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "msg-inbox",
              labelIds: ["INBOX", "UNREAD", "STARRED"],
              payload: {
                headers: [
                  { name: "Subject", value: "Quarterly Review Sync" },
                  { name: "From", value: "Sarah <sarah@acme.com>" },
                  { name: "Date", value: new Date().toISOString() },
                ],
                body: { data: "UGxhaW4=" },
              },
            }),
          })
        }
        if (url.includes("/messages/msg-starred-sent")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "msg-starred-sent",
              labelIds: ["SENT", "STARRED"],
              payload: {
                headers: [
                  { name: "Subject", value: "Sent Proposal" },
                  { name: "From", value: "harsh@waydots.com" },
                  { name: "To", value: "client@example.com" },
                  { name: "Date", value: new Date().toISOString() },
                ],
                body: { data: "UGxhaW4=" },
              },
            }),
          })
        }
        if (url.includes("/messages/msg-draft")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "msg-draft",
              labelIds: ["DRAFT"],
              payload: {
                headers: [
                  { name: "Subject", value: "Draft: Next Steps" },
                  { name: "To", value: "partner@example.com" },
                ],
                body: { data: "UGxhaW4=" },
              },
            }),
          })
        }
        if (url.includes("/messages/msg-trash")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "msg-trash",
              labelIds: ["TRASH"],
              payload: {
                headers: [
                  { name: "Subject", value: "Deleted Promotion" },
                  { name: "From", value: "promo@store.com" },
                  { name: "Date", value: new Date().toISOString() },
                ],
                body: { data: "UGxhaW4=" },
              },
            }),
          })
        }

        return Promise.resolve({ ok: false, status: 404, text: async () => "Not found" })
      })

      globalThis.fetch = mockFetch as any

      const results = await fetchAllGmailFolders("mock-token")

      expect(results.length).toBe(4)

      const inboxMsg = results.find((m) => m.id === "msg-inbox")
      expect(inboxMsg).toBeDefined()
      expect(inboxMsg?.isDraft).toBeFalsy()
      expect(inboxMsg?.isSent).toBeFalsy()
      expect(inboxMsg?.isInbox).toBe(true)
      expect(inboxMsg?.isTrash).toBeFalsy()
      expect(inboxMsg?.starred).toBe(true)
      expect(inboxMsg?.unread).toBe(true)

      const sentMsg = results.find((m) => m.id === "msg-starred-sent")
      expect(sentMsg).toBeDefined()
      expect(sentMsg?.isSent).toBe(true)
      expect(sentMsg?.starred).toBe(true)
      expect(sentMsg?.senderName).toBe("You")
      expect(sentMsg?.recipientEmail).toBe("client@example.com")

      const draftMsg = results.find((m) => m.id === "msg-draft")
      expect(draftMsg).toBeDefined()
      expect(draftMsg?.isDraft).toBe(true)
      expect(draftMsg?.isSent).toBeFalsy()
      expect(draftMsg?.senderName).toBe("You")
      expect(draftMsg?.recipientEmail).toBe("partner@example.com")
      expect(draftMsg?.draftId).toBe("draft-xyz")
      expect(draftMsg?.threadId).toBe("t-3")

      const trashMsg = results.find((m) => m.id === "msg-trash")
      expect(trashMsg).toBeDefined()
      expect(trashMsg?.isTrash).toBe(true)
      expect(trashMsg?.subject).toBe("Deleted Promotion")
    })
  })

  describe("Sending and Drafting emails via Gmail API", () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      vi.restoreAllMocks()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it("builds a valid RFC 2822 base64 email string", () => {
      const encoded = encodeGmailBase64("Subject: Test\n\nHello")
      expect(typeof encoded).toBe("string")

      const raw = buildRawRfc2822Email({
        to: "sarah@acme.com",
        subject: "Meeting Confirmation",
        body: "Confirmed for 10:00 AM",
      })

      expect(typeof raw).toBe("string")
      const decoded = decodeGmailBase64(raw)
      expect(decoded).toContain("To: sarah@acme.com")
      expect(decoded).toContain("Subject:")
      expect(decoded).toContain("Confirmed for 10:00 AM")
    })

    it("sends a message via Gmail messages.send endpoint", async () => {
      let requestedUrl = ""
      let requestedBody: any = null

      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedBody = JSON.parse(options.body)
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "sent-msg-123" }),
        })
      }) as any

      const res = await sendGmailMessage({
        to: "alex@studio.design",
        subject: "Design Review",
        body: "Looks good to me!",
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(res.id).toBe("sent-msg-123")
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
      expect(requestedBody.raw).toBeDefined()
    })

    it("sends an existing draft via Gmail drafts.send endpoint", async () => {
      let requestedUrl = ""
      let requestedBody: any = null

      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedBody = JSON.parse(options.body)
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "draft-sent-id" }),
        })
      }) as any

      const res = await sendGmailDraft({
        draftId: "r-987654321",
        to: "client@example.com",
        subject: "Final Deliverable",
        body: "Attached is the final deliverable.",
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(res.id).toBe("draft-sent-id")
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send")
      expect(requestedBody.id).toBe("r-987654321")
      expect(requestedBody.message?.raw).toBeDefined()
    })

    it("creates a draft via Gmail drafts endpoint", async () => {
      let requestedUrl = ""

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        requestedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "created-draft-id", message: { id: "draft-msg-id" } }),
        })
      }) as any

      const res = await saveGmailDraft({
        to: "lead@example.com",
        subject: "Draft Proposal",
        body: "Drafting the scope of work...",
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(res.draftId).toBe("created-draft-id")
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts")
    })

    it("handles 403 insufficient scopes error and returns GMAIL_INSUFFICIENT_SCOPES code", async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 403,
              message: "Request had insufficient authentication scopes.",
              status: "PERMISSION_DENIED",
            },
          }),
        })
      ) as any

      const res = await sendGmailMessage({
        to: "recipient@example.com",
        subject: "Test",
        body: "Test body",
        accessToken: "old-token-readonly",
      })

      expect(res.success).toBe(false)
      expect(res.code).toBe("GMAIL_INSUFFICIENT_SCOPES")
      expect(res.status).toBe(403)
      expect(res.error).toContain("Google account has not granted permission to send")
    })

    it("moves a Gmail message to Trash via deleteGmailMessage", async () => {
      let requestedUrl = ""
      let requestedMethod = ""
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedMethod = options?.method
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "msg-123", labelIds: ["TRASH"] }),
        })
      }) as any

      const res = await deleteGmailMessage({
        id: "msg-123",
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-123/trash")
      expect(requestedMethod).toBe("POST")
    })

    it("deletes a draft message via drafts endpoint if isDraft and draftId provided", async () => {
      let requestedUrl = ""
      let requestedMethod = ""
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedMethod = options?.method
        return Promise.resolve({
          ok: true,
          status: 204,
        })
      }) as any

      const res = await deleteGmailMessage({
        id: "msg-draft-123",
        draftId: "draft-456",
        isDraft: true,
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts/draft-456")
      expect(requestedMethod).toBe("DELETE")
    })

    it("untrashes a Gmail message via untrashGmailMessage", async () => {
      let requestedUrl = ""
      let requestedMethod = ""
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedMethod = options?.method
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "msg-123", labelIds: ["INBOX"] }),
        })
      }) as any

      const res = await untrashGmailMessage("msg-123", "test-token-123")

      expect(res.success).toBe(true)
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-123/untrash")
      expect(requestedMethod).toBe("POST")
    })

    it("marks a Gmail message as read via markGmailMessageAsRead by removing UNREAD label", async () => {
      let requestedUrl = ""
      let requestedBody: any = null
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedBody = JSON.parse(options?.body || "{}")
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "msg-123", labelIds: ["INBOX"] }),
        })
      }) as any

      const res = await markGmailMessageAsRead("msg-123", "test-token-123")

      expect(res.success).toBe(true)
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-123/modify")
      expect(requestedBody).toEqual({ removeLabelIds: ["UNREAD"] })
    })

    it("modifies multiple messages via batchModifyGmailMessages", async () => {
      let requestedUrl = ""
      let requestedBody: any = null
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        requestedUrl = url
        requestedBody = JSON.parse(options?.body || "{}")
        return Promise.resolve({
          ok: true,
          status: 204,
        })
      }) as any

      const res = await batchModifyGmailMessages({
        ids: ["msg-1", "msg-2"],
        removeLabelIds: ["UNREAD"],
        accessToken: "test-token-123",
      })

      expect(res.success).toBe(true)
      expect(requestedUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify")
      expect(requestedBody).toEqual({
        ids: ["msg-1", "msg-2"],
        removeLabelIds: ["UNREAD"],
      })
    })
  })
})

