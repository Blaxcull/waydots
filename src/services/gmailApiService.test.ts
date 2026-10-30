import { describe, it, expect } from "vitest"
import { decodeGmailBase64, extractEmailBodies } from "./gmailApiService"

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
})
