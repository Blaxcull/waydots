import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react"

interface EmailHtmlViewerProps {
  html?: string
  plainText?: string
  className?: string
}

function EmailHtmlViewerComponent({
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
  const [iframeHeight, setIframeHeight] = useState<number>(300)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Construct isolated, responsive, and sandboxed HTML document
  const safeDoc = useMemo(() => {
    if (!rawHtml) return ""

    // Strip all executable scripts and inline event handlers to prevent sandbox blocked execution warnings
    let sanitizedHtml = rawHtml
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/\s(on\w+)\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
      .replace(/href\s*=\s*["']?javascript:[^"'>]*/gi, "")

    // Fix semicolon in viewport meta tags: ';' is not a valid separator in HTML meta content
    sanitizedHtml = sanitizedHtml.replace(
      /(<meta\s+[^>]*name=["']viewport["'][^>]*content=["'])([^"']*)(["'][^>]*>)/gi,
      (_match, p1, content, p3) => `${p1}${content.replace(/;/g, ",")}${p3}`
    )

    // Convert protocol-relative URLs (//example.com) to https (https://example.com)
    // In srcdoc iframe (about:srcdoc), "//" inherits "about:" scheme and fails with ERR_UNKNOWN_URL_SCHEME
    sanitizedHtml = sanitizedHtml
      .replace(/(src|href|poster|background)\s*=\s*(["'])(\/\/[^"'>]+)\2/gi, (_match, attr, quote, url) => {
        return `${attr}=${quote}https:${url}${quote}`
      })
      .replace(/(src|href|poster|background)\s*=\s*(\/\/[^\s>]+)/gi, (_match, attr, url) => {
        return `${attr}="https:${url}"`
      })
      .replace(/srcset\s*=\s*(["'])(.*?)\1/gi, (_match, quote, val) => {
        const updated = val.replace(/(^|[\s,])\/\/([^\s,]+)/g, "$1https://$2")
        return `srcset=${quote}${updated}${quote}`
      })
      .replace(/url\(\s*(['"]?)(\/\/[^)'"]+)\1\s*\)/gi, (_match, quote, url) => {
        return `url(${quote}https:${url}${quote})`
      })

    // Fallback for Mailer-Daemon delivery failure bounce icon if not resolved as inline CID
    sanitizedHtml = sanitizedHtml.replace(
      /(src|href|poster|background)\s*=\s*(["'])cid:(?:<)?icon\.png(?:>)?\2/gi,
      `$1=$2https://www.gstatic.com/images/icons/material/system/2x/help_outline_amber_48dp.png$2`
    )

    const metaTags = '<meta charset="utf-8"/><meta name="referrer" content="no-referrer"/>'
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
          max-width: 100%;
        }
        img[width="1"][height="1"], img[width="0"][height="0"] {
          display: none !important;
        }
        table {
          max-width: 100%;
        }
        hr {
          border: 0;
          border-top: 1px solid #e5e7eb;
          margin: 12px 0;
        }
        a {
          color: #2563eb;
          text-decoration: underline;
        }
      </style>
    `

    if (sanitizedHtml.toLowerCase().includes("<html")) {
      if (sanitizedHtml.toLowerCase().includes("<head")) {
        return sanitizedHtml.replace(/<head[^>]*>/i, `$&${metaTags}${baseTag}${responsiveStyle}`)
      }
      return sanitizedHtml.replace(/<html[^>]*>/i, `$&<head>${metaTags}${baseTag}${responsiveStyle}</head>`)
    }

    return `<!DOCTYPE html><html><head>${metaTags}${baseTag}${responsiveStyle}</head><body>${sanitizedHtml}</body></html>`
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
          setIframeHeight((prev) => (Math.abs(prev - (computed + 20)) > 10 ? computed + 20 : prev))
        }
      }
    } catch {
      // Ignore cross-origin limitations if any
    }
  }, [])

  // Auto-resize observing DOM changes and dynamic asset loading (images, webfonts)
  useEffect(() => {
    if (!isHtml) return
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
      if (doc) {
        const images = doc.querySelectorAll("img")
        images.forEach((img) => {
          img.addEventListener("load", updateHeight, { once: true })
          img.addEventListener("error", updateHeight, { once: true })
        })
      }
    } catch {
      // Ignore
    }

    const t1 = setTimeout(updateHeight, 350)
    const t2 = setTimeout(updateHeight, 1200)

    return () => {
      ro?.disconnect()
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [safeDoc, isHtml, updateHeight])

  // Pure Plain Text email: render directly with typographic line breaks
  if (!isHtml) {
    return (
      <div className={`text-neutral-800 text-sm md:text-base leading-relaxed whitespace-pre-line font-normal break-words ${className}`}>
        {plainText}
      </div>
    )
  }

  // Formatted HTML is displayed by default without any raw text toggle pill
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs ${className}`}>
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
  )
}

const EmailHtmlViewer = memo(EmailHtmlViewerComponent)
export default EmailHtmlViewer
