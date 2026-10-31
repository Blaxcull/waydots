import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Eye, Code } from "lucide-react"

interface EmailHtmlViewerProps {
  html?: string
  plainText?: string
  className?: string
}

export default function EmailHtmlViewer({
  html,
  plainText = "",
  className = "",
}: EmailHtmlViewerProps) {
  // Detect if content has HTML elements (either explicitly passed in html or containing HTML tags in plainText)
  const isHtml = Boolean(
    (html && html.trim().length > 0) ||
    (plainText && /<(p|div|span|table|a|ul|ol|li|br|h[1-6]|b|i|strong|em|img|blockquote|section|header|footer|tbody|tr|td)[^>]*>/i.test(plainText))
  )

  const rawHtml = html || (isHtml ? plainText : "")
  const [viewMode, setViewMode] = useState<"html" | "text">("html")
  const [iframeHeight, setIframeHeight] = useState<number>(300)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Construct isolated, responsive, and sandboxed HTML document
  const safeDoc = useMemo(() => {
    if (!rawHtml) return ""

    const baseTag = '<base target="_blank">'
    const responsiveStyle = `
      <style>
        *, *::before, *::after {
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          background-color: transparent;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1f2937;
          line-height: 1.6;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        body {
          padding: 14px 10px;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
        }
        table {
          max-width: 100% !important;
          width: auto !important;
        }
        a {
          color: #2563eb;
          text-decoration: underline;
        }
      </style>
    `

    if (rawHtml.toLowerCase().includes("<html")) {
      if (rawHtml.toLowerCase().includes("<head>")) {
        return rawHtml.replace(/<head>/i, `<head>${baseTag}${responsiveStyle}`)
      }
      return rawHtml.replace(/<html[^>]*>/i, `$&<head>${baseTag}${responsiveStyle}</head>`)
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${baseTag}${responsiveStyle}</head><body>${rawHtml}</body></html>`
  }, [rawHtml])

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        const bodyHeight = doc.body?.scrollHeight || 0
        const htmlHeight = doc.documentElement?.scrollHeight || 0
        const computed = Math.max(bodyHeight, htmlHeight)
        if (computed > 30) {
          setIframeHeight(computed + 20)
        }
      }
    } catch {
      // Ignore cross-origin limitations if any
    }
  }, [])

  // Auto-resize observing DOM changes and dynamic asset loading (images, webfonts)
  useEffect(() => {
    if (!isHtml || viewMode !== "html") return
    const iframe = iframeRef.current
    if (!iframe) return

    updateHeight()

    let ro: ResizeObserver | null = null
    try {
      const doc = iframe.contentDocument
      if (doc?.body && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => updateHeight())
        ro.observe(doc.body)
      }
    } catch {
      // Ignore
    }

    const t1 = setTimeout(updateHeight, 300)
    const t2 = setTimeout(updateHeight, 1000)
    const t3 = setTimeout(updateHeight, 2400)

    return () => {
      ro?.disconnect()
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [safeDoc, isHtml, viewMode, updateHeight])

  // Pure Plain Text email: render directly with typographic line breaks
  if (!isHtml) {
    return (
      <div className={`text-neutral-800 text-sm md:text-base leading-relaxed whitespace-pre-line font-normal break-words ${className}`}>
        {plainText}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {/* View Toggle Bar (Only shown for HTML emails when clean plain text is also available) */}
      {plainText && plainText !== rawHtml && (
        <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
          <div className="text-[11px] font-medium text-neutral-500">
            {viewMode === "html" ? "Rich HTML Email" : "Plain Text View"}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-gray-300/70 bg-[#dededc] p-0.5 text-[11px] font-semibold text-neutral-600">
            <button
              type="button"
              onClick={() => setViewMode("html")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-all cursor-pointer ${
                viewMode === "html"
                  ? "bg-white text-neutral-900 shadow-2xs"
                  : "hover:text-neutral-900"
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>Formatted</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("text")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-all cursor-pointer ${
                viewMode === "text"
                  ? "bg-white text-neutral-900 shadow-2xs"
                  : "hover:text-neutral-900"
              }`}
            >
              <Code className="h-3 w-3" />
              <span>Raw Text</span>
            </button>
          </div>
        </div>
      )}

      {viewMode === "html" ? (
        <div className="w-full overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs">
          <iframe
            ref={iframeRef}
            srcDoc={safeDoc}
            onLoad={updateHeight}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            title="Email Message Content"
            className="w-full border-0 transition-all block"
            style={{ height: `${iframeHeight}px`, minHeight: "220px" }}
          />
        </div>
      ) : (
        <div className="text-neutral-800 text-sm md:text-base leading-relaxed whitespace-pre-line font-normal break-words p-3 bg-white/70 rounded-xl border border-gray-200/70 font-mono text-xs">
          {plainText}
        </div>
      )}
    </div>
  )
}

