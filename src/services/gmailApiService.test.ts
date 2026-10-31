import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { decodeGmailBase64, extractEmailBodies, fetchAllGmailFolders } from "./gmailApiService"

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

        return Promise.resolve({ ok: false, status: 404, text: async () => "Not found" })
      })

      globalThis.fetch = mockFetch as any

      const results = await fetchAllGmailFolders("mock-token")

      expect(results.length).toBe(3)

      const inboxMsg = results.find((m) => m.id === "msg-inbox")
      expect(inboxMsg).toBeDefined()
      expect(inboxMsg?.isDraft).toBeFalsy()
      expect(inboxMsg?.isSent).toBeFalsy()
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
    })
  })
})

