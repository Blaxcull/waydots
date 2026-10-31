// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import EmailHtmlViewer from "./EmailHtmlViewer"

afterEach(() => {
  cleanup()
})

describe("EmailHtmlViewer", () => {
  it("renders plain text directly when no HTML is detected", () => {
    render(<EmailHtmlViewer plainText="Just a simple plain text message." />)
    expect(screen.getByText("Just a simple plain text message.")).toBeInTheDocument()
    expect(screen.queryByTitle("Email Message Content")).not.toBeInTheDocument()
  })

  it("renders sandboxed iframe with formatted HTML by default when html is provided", () => {
    render(
      <EmailHtmlViewer
        html="<p>Welcome to our newsletter</p>"
        plainText="Welcome to our newsletter"
      />
    )
    const iframe = screen.getByTitle("Email Message Content") as HTMLIFrameElement
    expect(iframe).toBeInTheDocument()
    expect(iframe.getAttribute("sandbox")).toContain("allow-popups")
    expect(iframe.getAttribute("sandbox")).toContain("allow-same-origin")

    // Verify toggle pills are completely removed
    expect(screen.queryByText("Formatted")).not.toBeInTheDocument()
    expect(screen.queryByText("Raw Text")).not.toBeInTheDocument()
  })

  it("automatically detects HTML tags in plainText if html prop is omitted", () => {
    render(<EmailHtmlViewer plainText="<div><h3>Hello from HTML</h3></div>" />)
    expect(screen.getByTitle("Email Message Content")).toBeInTheDocument()
  })
})
