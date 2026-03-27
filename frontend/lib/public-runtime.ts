/**
 * Resolve public API / WebSocket URLs for browsers on HTTPS (e.g. phones on 4G).
 * Browsers block mixed content: an https:// join page cannot use ws:// or http://
 * to a remote host. Upgrade only for non-localhost targets; keep localhost for dev.
 */

function trimSlash(url: string): string {
  return url.replace(/\/$/, "")
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  )
}

export function getPublicApiBase(): string {
  const raw = trimSlash(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
  if (typeof window === "undefined") return raw
  if (window.location.protocol !== "https:") return raw
  try {
    const u = new URL(raw)
    if (u.protocol === "http:" && !isLocalHost(u.hostname)) {
      u.protocol = "https:"
      return trimSlash(u.toString())
    }
  } catch {
    /* ignore */
  }
  return raw
}

export function getPublicWsBase(): string {
  const raw = trimSlash(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000")
  if (typeof window === "undefined") return raw
  if (window.location.protocol !== "https:") return raw
  try {
    const u = new URL(raw)
    if (u.protocol === "ws:" && !isLocalHost(u.hostname)) {
      u.protocol = "wss:"
      return trimSlash(u.toString())
    }
  } catch {
    /* ignore */
  }
  return raw
}
