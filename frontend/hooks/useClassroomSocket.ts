"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getPublicWsBase } from "@/lib/public-runtime"

const PING_INTERVAL_MS = 25_000
const MAX_BACKOFF_MS = 10_000
const MAX_PENDING_SEND = 12

export type ClassroomPhase =
  | "waiting"
  | "responding"
  | "reviewing"
  | "feedback"
  | "debrief"

export type Cluster = "sound" | "correct_poor" | "unsafe" | "insufficient"

export type WSMessage =
  | { type: "session_state"; phase: ClassroomPhase; current_step: string; student_count: number }
  | { type: "phase_change"; phase: ClassroomPhase; step_id: string }
  | { type: "response_evaluated"; cluster: Cluster; feedback: string; principles: Record<string, string>; score: number }
  | { type: "already_responded" }
  | { type: "response_received"; step_id: string; count: number; stats: StatsPayload }
  | { type: "student_joined"; student_count: number }
  | { type: "student_left"; student_count: number }
  | { type: "stats_update"; step_id: string; stats: StatsPayload }
  | { type: "error"; message: string }
  | { type: "pong" }

export interface StatsPayload {
  total: number
  clusters: Record<Cluster, { count: number; pct: number }>
  principles: Record<string, number>
  average_score: number
}

interface UseClassroomSocketOptions {
  sessionId: string
  role: "instructor" | "student"
  studentId?: string
  onMessage?: (msg: WSMessage) => void
}

/** Match backend session keys (UUID fragment stored uppercase). */
function normSessionId(raw: string): string {
  return (raw ?? "").trim().toUpperCase()
}

export function useClassroomSocket({
  sessionId,
  role,
  studentId,
  onMessage,
}: UseClassroomSocketOptions) {
  const sid = normSessionId(sessionId)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptRef = useRef(0)
  const mountedRef = useRef(false)
  const shouldReconnectRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  const pendingSendRef = useRef<object[]>([])

  const [connected, setConnected] = useState(false)

  onMessageRef.current = onMessage

  const send = useCallback((message: object): boolean => {
    const socket = wsRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message))
        return true
      } catch {
        /* fall through to queue */
      }
    }
    const q = pendingSendRef.current
    if (q.length >= MAX_PENDING_SEND) q.shift()
    q.push(message)
    return false
  }, [])

  useEffect(() => {
    mountedRef.current = true
    shouldReconnectRef.current = true

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const clearPing = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
    }

    const flushPending = () => {
      const socket = wsRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      const q = pendingSendRef.current
      while (q.length > 0) {
        const msg = q.shift()
        if (!msg) break
        try {
          socket.send(JSON.stringify(msg))
        } catch {
          q.unshift(msg)
          break
        }
      }
    }

    const safeCloseSocket = () => {
      const socket = wsRef.current
      wsRef.current = null
      if (!socket) return
      try {
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close()
        }
      } catch {
        /* ignore */
      }
    }

    const buildUrl = (): string | null => {
      if (!sid) return null
      if (role === "student" && !studentId?.trim()) return null
      const wsBase = getPublicWsBase()
      if (role === "instructor") {
        return `${wsBase}/classroom/ws/instructor/${sid}`
      }
      return `${wsBase}/classroom/ws/student/${sid}/${encodeURIComponent(studentId!.trim())}`
    }

    const scheduleReconnect = () => {
      if (!mountedRef.current || !shouldReconnectRef.current) return
      clearReconnect()
      const delay = Math.min(1_000 * 2 ** attemptRef.current, MAX_BACKOFF_MS)
      attemptRef.current += 1
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        openSocket()
      }, delay)
    }

    const startPing = (socket: WebSocket) => {
      clearPing()
      pingTimerRef.current = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return
        try {
          socket.send(JSON.stringify({ type: "ping" }))
        } catch {
          /* onclose will reconnect */
        }
      }, PING_INTERVAL_MS)
    }

    const openSocket = () => {
      if (!mountedRef.current || !shouldReconnectRef.current) return

      const url = buildUrl()
      if (!url) return

      clearReconnect()
      clearPing()
      safeCloseSocket()

      let socket: WebSocket
      try {
        socket = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }

      wsRef.current = socket

      socket.onopen = () => {
        if (!mountedRef.current || !shouldReconnectRef.current) {
          try {
            socket.close()
          } catch {
            /* ignore */
          }
          return
        }
        attemptRef.current = 0
        setConnected(true)
        startPing(socket)
        flushPending()
      }

      socket.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(String(event.data)) as WSMessage
          onMessageRef.current?.(parsed)
        } catch {
          /* ignore malformed */
        }
      }

      socket.onerror = () => {
        try {
          socket.close()
        } catch {
          /* ignore */
        }
      }

      socket.onclose = (event) => {
        /*
         * Replacing the socket sets wsRef to the new instance before the old
         * connection finishes closing. Ignore close events from superseded
         * sockets — otherwise we'd setConnected(false) and scheduleReconnect
         * while the new socket is already live (reconnect storm + log spam).
         */
        if (wsRef.current !== socket) return

        wsRef.current = null
        clearPing()
        setConnected(false)
        if (!mountedRef.current || !shouldReconnectRef.current) return
        if (event.code === 4004 || event.code === 4005) return
        scheduleReconnect()
      }
    }

    openSocket()

    return () => {
      mountedRef.current = false
      shouldReconnectRef.current = false
      clearReconnect()
      clearPing()
      safeCloseSocket()
      pendingSendRef.current = []
      setConnected(false)
    }
  }, [sid, role, studentId])

  return { connected, send }
}
