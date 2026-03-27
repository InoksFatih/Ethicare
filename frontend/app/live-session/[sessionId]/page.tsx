"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import {
  Activity,
  ArrowLeft,
  Copy,
  ExternalLink,
  RotateCcw,
  Loader2,
  Play,
  Square,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useClassroomSocket, type StatsPayload, type WSMessage } from "@/hooks/useClassroomSocket"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const PUBLIC_JOIN_BASE = process.env.NEXT_PUBLIC_PUBLIC_JOIN_BASE_URL?.replace(/\/$/, "")

function makeJoinUrl(sessionId: string): string {
  if (!sessionId) return ""
  const base =
    PUBLIC_JOIN_BASE ||
    (typeof window !== "undefined" ? window.location.origin : "")
  return base ? `${base}/join/${sessionId}` : ""
}

type LiveCaseData = {
  id: string
  title: string
  desc: string
  category?: string
  patient?: { name?: string; age?: number; condition?: string }
  steps?: Array<{ id: string; msg?: string; q?: string; hint?: string }>
  law?: { text?: string }
  tags?: string[]
}

type ClusterKey = "sound" | "correct_poor" | "unsafe" | "insufficient"
type ClusteredResponse = { id: number; text: string; score: number; feedback?: string }

function formatSince(ms: number) {
  if (ms < 1000)  return "just now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export default function LiveSessionInstructorPage() {
  const params    = useParams()
  const sessionId = (params?.sessionId as string) ?? ""
  /** Align with backend `session_manager._norm_sid` so WS, REST, and join links match. */
  const sid = useMemo(() => sessionId.trim().toUpperCase(), [sessionId])

  const [caseData,      setCaseData]      = useState<LiveCaseData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [studentCount,  setStudentCount]  = useState(0)
  const [responseCount, setResponseCount] = useState(0)
  const [stats,         setStats]         = useState<StatsPayload | null>(null)
  const [lastEventAt,   setLastEventAt]   = useState<number | null>(null)
  const [phase,         setPhase]         = useState<"waiting" | "responding" | "reviewing" | "feedback" | "debrief">("waiting")
  const [joinUrl,       setJoinUrl]       = useState("")
  const [copied,        setCopied]        = useState(false)
  const [resetting,     setResetting]     = useState(false)
  const [pendingAction, setPendingAction] = useState<"start" | "pause" | "reset" | null>(null)
  const [actionNote, setActionNote] = useState<{ kind: "ok" | "warn"; text: string } | null>(null)
  const [clickFx, setClickFx] = useState<"start" | "pause" | "reset" | null>(null)
  const [presentationMode, setPresentationMode] = useState(false)
  const [events, setEvents] = useState<Array<{ id: string; label: string; detail?: string; ts: number }>>([])
  const [clustered, setClustered] = useState<Record<ClusterKey, ClusteredResponse[]>>({
    sound: [], correct_poor: [], unsafe: [], insufficient: [],
  })

  const qrSize = presentationMode ? 260 : 220

  const prompt = useMemo(() => {
    const s1 = caseData?.steps?.find(s => s.id === "s1") ?? caseData?.steps?.[0]
    return { msg: s1?.msg ?? "…", q: s1?.q ?? "How would you respond?", hint: s1?.hint ?? null }
  }, [caseData])

  const flatRecent = useMemo(() => {
    const all = [
      ...clustered.sound.map(r => ({ ...r, cluster: "sound" as const })),
      ...clustered.correct_poor.map(r => ({ ...r, cluster: "correct_poor" as const })),
      ...clustered.unsafe.map(r => ({ ...r, cluster: "unsafe" as const })),
      ...clustered.insufficient.map(r => ({ ...r, cluster: "insufficient" as const })),
    ]
    all.sort((a, b) => b.id - a.id)
    return all.slice(0, 10)
  }, [clustered])

  useEffect(() => {
    setJoinUrl(makeJoinUrl(sid))
  }, [sid])

  useEffect(() => {
    try {
      const v = localStorage.getItem("ethicare-live-presentation-default")
      setPresentationMode(v === "1")
    } catch {
      setPresentationMode(false)
    }
  }, [])

  const togglePresentationMode = (value: boolean) => {
    setPresentationMode(value)
    try {
      localStorage.setItem("ethicare-live-presentation-default", value ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(`${BASE}/classroom/sessions/${sid}`)
        if (!r.ok) return
        const s = await r.json()
        if (!cancelled) {
          setStudentCount(s.student_count ?? 0)
          setResponseCount(s.response_count ?? 0)
          setPhase((s.phase ?? "waiting"))
          setCaseData(s.case_data ?? null)
        }
        const st = await fetch(`${BASE}/classroom/sessions/${sid}/stats?step_id=s1`)
        if (st.ok && !cancelled) {
          setStats(await st.json())
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sid])

  /**
   * Fetch clustered responses once — called on demand, not on a polling loop.
   * The WS handler calls this whenever a new response arrives.
   */
  const refreshClustered = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/classroom/sessions/${sid}/responses?step_id=s1`)
      if (!r.ok) return
      const d = await r.json()
      if (!d?.clusters) return
      setClustered({
        sound:          d.clusters.sound          ?? [],
        correct_poor:   d.clusters.correct_poor   ?? [],
        unsafe:         d.clusters.unsafe         ?? [],
        insufficient:   d.clusters.insufficient   ?? [],
      })
    } catch {
      /* ignore — non-fatal, WS events will trigger retry */
    }
  }, [sid])

  // Initial load of existing responses (covers page-refresh scenario).
  useEffect(() => { void refreshClustered() }, [refreshClustered])

  const { connected, send } = useClassroomSocket({
    sessionId: sid,
    role: "instructor",
    onMessage: useCallback((msg: WSMessage) => {
      setLastEventAt(Date.now())
      if (msg.type === "session_state") {
        setEvents((prev) => {
          const next = [
            ...prev,
            { id: `${msg.phase}-${Date.now()}`, label: `Session: ${msg.phase}`, ts: Date.now() },
          ]
          return next.slice(-5)
        })
      } else if (msg.type === "phase_change") {
        setEvents((prev) => {
          const next = [...prev, { id: `phase-${msg.phase}-${Date.now()}`, label: `Phase: ${msg.phase}`, ts: Date.now() }]
          return next.slice(-5)
        })
      } else if (msg.type === "student_joined") {
        setEvents((prev) => {
          const next = [...prev, { id: `join-${Date.now()}`, label: "Student joined", detail: `${msg.student_count} total`, ts: Date.now() }]
          return next.slice(-5)
        })
      } else if (msg.type === "student_left") {
        setEvents((prev) => {
          const next = [...prev, { id: `left-${Date.now()}`, label: "Student left", detail: `${msg.student_count} total`, ts: Date.now() }]
          return next.slice(-5)
        })
      } else if (msg.type === "response_received") {
        setEvents((prev) => {
          const next = [
            ...prev,
            {
              id: `resp-${msg.count}-${Date.now()}`,
              label: "Response received",
              detail: `Total: ${msg.count}`,
              ts: Date.now(),
            },
          ]
          return next.slice(-5)
        })
      }
      if (msg.type === "session_state") {
        setPhase(msg.phase)
      } else if (msg.type === "phase_change") {
        setPhase(msg.phase)
      }
      if (msg.type === "student_joined" || msg.type === "student_left") {
        setStudentCount(msg.student_count)
      } else if (msg.type === "response_received") {
        setResponseCount(msg.count)
        setStats(msg.stats)
        // Refresh text list reactively on each new response — no polling loop needed.
        void refreshClustered()
      } else if (msg.type === "stats_update") {
        setStats(msg.stats)
        if (typeof msg.stats?.total === "number") {
          setResponseCount(msg.stats.total)
        }
        void refreshClustered()
      }
    }, [refreshClustered]),
  })

  // When the instructor socket connects (or reconnects), resync from the server.
  // Otherwise submissions that arrived while offline / before open never update counts.
  useEffect(() => {
    if (!connected || !sid) return
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(`${BASE}/classroom/sessions/${sid}`)
        if (!r.ok || cancelled) return
        const s = await r.json()
        if (cancelled) return
        setStudentCount(s.student_count ?? 0)
        setResponseCount(s.response_count ?? 0)
        setPhase((s.phase ?? "waiting") as "waiting" | "responding" | "reviewing" | "feedback" | "debrief")
        if (s.case_data) setCaseData(s.case_data)
        void refreshClustered()
      } finally {
        if (!cancelled) send({ type: "request_stats", step_id: "s1" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connected, sid, send, refreshClustered])

  // Periodic stats refresh via WS — covers missed pushes and keeps snapshot warm.
  useEffect(() => {
    const t = window.setInterval(
      () => send({ type: "request_stats", step_id: "s1" }),
      10_000
    )
    return () => window.clearInterval(t)
  }, [send])

  const startCollecting = () => send({ type: "set_phase", phase: "responding", step_id: "s1" })
  const stopCollecting  = () => send({ type: "set_phase", phase: "reviewing",  step_id: "s1" })
  const isCollecting = phase === "responding"
  const participationPct = studentCount > 0 ? Math.min(100, Math.round((responseCount / studentCount) * 100)) : 0
  const phaseBadge = (() => {
    if (phase === "responding") return { label: "Collecting live", bg: "#DCFCE7", color: "#166534" }
    if (phase === "reviewing") return { label: "Reviewing", bg: "#FEF3C7", color: "#92400E" }
    if (phase === "feedback") return { label: "Feedback", bg: "#E0E7FF", color: "#3730A3" }
    if (phase === "debrief") return { label: "Debrief", bg: "#EDE9FE", color: "#6D28D9" }
    return { label: "Waiting", bg: "#F1F5F9", color: "#475569" }
  })()

  const resetResponses = async () => {
    setPendingAction("reset")
    setActionNote(null)
    setEvents([])
    setResetting(true)
    try {
      const r = await fetch(`${BASE}/classroom/sessions/${sid}/reset?step_id=s1`, { method: "POST" })
      if (!r.ok) throw new Error("Reset request failed")
      setResponseCount(0)
      setStats(null)
      setClustered({ sound: [], correct_poor: [], unsafe: [], insufficient: [] })
      send({ type: "request_stats", step_id: "s1" })
      setActionNote({ kind: "ok", text: "Responses reset." })
    } catch {
      setActionNote({ kind: "warn", text: "Reset failed. Check backend connection." })
    } finally {
      setPendingAction(null)
      setResetting(false)
    }
  }

  const triggerPhase = (next: "responding" | "reviewing") => {
    const isStart = next === "responding"
    setClickFx(isStart ? "start" : "pause")
    window.setTimeout(() => setClickFx(null), 220)
    setPendingAction(isStart ? "start" : "pause")
    // Optimistic phase update for immediate click feedback.
    setPhase(next)
    send({ type: "set_phase", phase: next, step_id: "s1" })
    setActionNote({ kind: "ok", text: isStart ? "Collecting started." : "Collection paused." })
    window.setTimeout(() => setPendingAction(null), 450)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #D4E8EC, #E8F4F6)" }}>
      <Loader2 className="w-8 h-8 animate-spin text-[#1B6B7D]" />
    </div>
  )

  return (
    <div className="ethicare-home-root relative overflow-hidden min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #D4E8EC 0%, #E8F4F6 50%, #F0F8FA 100%)" }}>
      <div className="ethicare-splash-aurora" />
      <div className="ethicare-splash-grid" />

      <header className="shrink-0 px-6 py-4 flex items-center gap-4 relative z-10" style={{ background: "#0F2840" }}>
        <Link href="/live-mode" className="inline-flex items-center gap-2 text-white/80 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
          Back to Live Mode
        </Link>
        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Users className="w-4 h-4" />
            <span className="font-bold">{studentCount}</span>
            <span className="text-white/50">joined</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Activity className="w-4 h-4" />
            <span className="font-bold">{responseCount}</span>
            <span className="text-white/50">responses</span>
          </div>
          <div className="flex items-center gap-2">
            {connected ? <Wifi className="w-4 h-4 text-[#5EE6A8]" /> : <WifiOff className="w-4 h-4 text-white/40" />}
            <span className="text-xs font-semibold" style={{ color: connected ? "#5EE6A8" : "rgba(255,255,255,0.4)" }}>
              {sid || sessionId}
            </span>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-white/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={presentationMode}
              onChange={(e) => togglePresentationMode(e.target.checked)}
              className="w-4 h-4 rounded border border-white/20"
              style={{ accentColor: "#5EE6A8" }}
            />
            Presentation
          </label>
        </div>
      </header>

      <main className="flex-1 p-6 relative z-10">
        <div className="max-w-[1200px] mx-auto mb-4 rounded-2xl border border-[#D9E5EC] bg-white/80 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Session phase</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: phaseBadge.bg, color: phaseBadge.color }}>
            {phaseBadge.label}
          </span>
          <span className="text-[11px] text-[#64748B]">Participation</span>
          <div className="flex-1 min-w-[160px] h-2.5 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCollecting ? "animate-pulse" : ""}`}
              style={{ width: `${participationPct}%`, background: "linear-gradient(90deg, #2A9D8F, #58D8C8)" }}
            />
          </div>
          <span className="text-xs font-bold text-[#334155] tabular-nums">{participationPct}%</span>
          {phase !== "responding" ? (
            <p className="w-full text-[11px] text-[#64748B] leading-snug">
              Participants only get the text box while <strong className="text-[#334155]">Collecting live</strong> is on.
              Press <strong className="text-[#334155]">Start</strong> so answers flow into the snapshot below.
            </p>
          ) : null}
        </div>
        {actionNote && (
          <div
            className="max-w-[1200px] mx-auto mb-4 rounded-xl px-4 py-2 text-sm border"
            style={
              actionNote.kind === "ok"
                ? { background: "#ECFDF5", borderColor: "#A7F3D0", color: "#065F46" }
                : { background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }
            }
          >
            {actionNote.text}
          </div>
        )}

        {/* ── Live event ticker ─────────────────────────────────────────── */}
        {!presentationMode ? (
          <div className="max-w-[1200px] mx-auto mb-4 rounded-2xl border border-[#D9E5EC] bg-white/70 backdrop-blur px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Event ticker</p>
              <p className="text-[10px] text-[#64748B]">Last 5 updates</p>
            </div>
            {events.length === 0 ? (
              <div className="text-sm text-[#64748B]">
                {phase === "responding"
                  ? "Collecting is on — joins and responses will show here as they happen."
                  : "Waiting… Start collecting to see activity."}
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A] truncate">{e.label}</p>
                      {e.detail ? <p className="text-xs text-[#64748B] truncate">{e.detail}</p> : null}
                    </div>
                    <p className="text-[10px] font-mono text-[#94A3B8] whitespace-nowrap">
                      {formatSince(Date.now() - e.ts)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left: prompt + responses ──────────────────────────────────── */}
          <section className={`${presentationMode ? "lg:col-span-6" : "lg:col-span-7"} bg-white rounded-3xl border border-[#E5E7EB] shadow-xl p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Live session prompt</p>
                <h1 className="text-2xl font-extrabold text-[#0F172A] mt-1">{caseData?.title ?? "Live session"}</h1>
                <p className="text-sm text-[#5C7483] mt-2 leading-relaxed">{caseData?.desc ?? ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => triggerPhase("responding")}
                  disabled={isCollecting}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold text-white
                    ${presentationMode ? "transition-none" : "transition-all duration-150 ease-out"} select-none overflow-hidden
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2A9D8F]/45 focus-visible:ring-offset-1
                    ${presentationMode ? "shadow-md active:scale-100 active:translate-y-0" : "hover:brightness-105 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] hover:shadow-lg"}
                    ${clickFx === "start" ? "scale-[0.98] shadow-inner" : ""}`}
                  style={{ background: "#2A9D8F", opacity: isCollecting ? 0.65 : 1, boxShadow: "0 8px 22px rgba(42,157,143,0.28)" }}
                >
                  <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
                    {pendingAction === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {presentationMode ? "Start" : "Start collecting"}
                  </span>
                  {!presentationMode && clickFx === "start" && (
                    <span className="absolute inset-0 rounded-2xl border-2 border-white/70 animate-ping pointer-events-none z-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => triggerPhase("reviewing")}
                  disabled={!isCollecting}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold
                    ${presentationMode ? "transition-none" : "transition-all duration-150 ease-out"} select-none overflow-hidden
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94A3B8]/45 focus-visible:ring-offset-1
                    ${presentationMode ? "shadow-sm active:scale-100 active:translate-y-0" : "hover:bg-[#EAF0F6] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] hover:shadow-md"}
                    ${clickFx === "pause" ? "scale-[0.98] shadow-inner" : ""}`}
                  style={{ background: "#F1F5F9", color: "#334155", border: "1px solid #E2E8F0", opacity: !isCollecting ? 0.65 : 1 }}
                >
                  <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
                    {pendingAction === "pause" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                    {presentationMode ? "Pause" : "Pause"}
                  </span>
                  {!presentationMode && clickFx === "pause" && (
                    <span className="absolute inset-0 rounded-2xl border-2 border-[#334155]/30 animate-ping pointer-events-none z-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setClickFx("reset")
                    window.setTimeout(() => setClickFx(null), 220)
                    void resetResponses()
                  }}
                  disabled={resetting}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold border border-[#E2E8F0]
                    ${presentationMode ? "transition-none" : "transition-all duration-150 ease-out"} select-none overflow-hidden
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94A3B8]/45 focus-visible:ring-offset-1
                    ${presentationMode ? "shadow-sm active:scale-100 active:translate-y-0" : "hover:bg-[#F8FAFC] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] hover:shadow-md"}
                    ${clickFx === "reset" ? "scale-[0.98] shadow-inner" : ""}`}
                  style={{ background: "#fff", color: "#334155", opacity: resetting ? 0.6 : 1 }}
                >
                  <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
                    <RotateCcw className={`w-4 h-4 ${resetting || pendingAction === "reset" ? "animate-spin" : ""}`} />
                    Reset
                  </span>
                  {!presentationMode && clickFx === "reset" && (
                    <span className="absolute inset-0 rounded-2xl border-2 border-[#334155]/25 animate-ping pointer-events-none z-0" />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-3xl p-6" style={{ background: "linear-gradient(135deg, #F8FAFC, #FFFFFF)", border: "1px solid #E5E7EB" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#5C7483] mb-2">Patient says</p>
              <p className="text-[#0F172A] text-lg leading-relaxed italic">"{prompt.msg}"</p>
            </div>

            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#5C7483] mb-2">Prompt</p>
              <div className="rounded-2xl px-5 py-4 bg-[#F8FAFC] border border-[#E5E7EB]">
                <p className="text-[#0F172A] font-extrabold">{prompt.q}</p>
                {prompt.hint && <p className="text-sm text-[#64748B] mt-2">{prompt.hint}</p>}
                {caseData?.law?.text && (
                  <p className="text-xs text-[#64748B] mt-3 border-t border-[#E5E7EB] pt-3">{caseData.law.text}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-xs text-[#64748B]">
              <span>{lastEventAt ? `Last update: ${formatSince(Date.now() - lastEventAt)}` : "Waiting for activity…"}</span>
              <span className="font-mono">{caseData?.patient?.name ?? ""}</span>
            </div>

            {/* Latest responses */}
            {!presentationMode ? (
            <div className="mt-6">
              <div className="flex items-end justify-between gap-4 mb-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Latest responses</p>
                  <p className="text-xs text-[#64748B] mt-1">Showing the 10 most recent submissions.</p>
                </div>
                <span className="text-xs font-semibold text-[#334155]">{responseCount} total</span>
              </div>

              {flatRecent.length === 0 ? (
                <div className="rounded-2xl p-5 bg-[#F8FAFC] border border-[#E5E7EB] text-sm text-[#64748B]">
                  No responses yet. Click <span className="font-semibold text-[#0F172A]">Start collecting</span> and have students submit.
                </div>
              ) : (
                <div className="space-y-3">
                  {flatRecent.map(r => {
                    const color = r.cluster === "sound" ? "#166534" : r.cluster === "correct_poor" ? "#854D0E" : r.cluster === "insufficient" ? "#475569" : "#991B1B"
                    const bg    = r.cluster === "sound" ? "#F0FDF4" : r.cluster === "correct_poor" ? "#FFFBEB" : r.cluster === "insufficient" ? "#F1F5F9" : "#FEF2F2"
                    const label = r.cluster === "sound" ? "Sound" : r.cluster === "correct_poor" ? "Correct/Poor" : r.cluster === "insufficient" ? "Insufficient" : "Unsafe"
                    return (
                      <div key={`${r.cluster}-${r.id}`} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: bg, color }}>
                            {label} · {r.score}/100
                          </span>
                          <span className="text-[10px] font-mono text-[#94A3B8]">#{r.id}</span>
                        </div>
                        <p className="text-sm text-[#0F172A] leading-relaxed">"{r.text}"</p>
                        <div className="mt-3 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.score))}%`, background: color }} />
                        </div>
                        {r.feedback ? (
                          <div className="mt-3 text-[11px] text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-[#2A9D8F] font-bold mr-1"><Sparkles className="w-3 h-3" />AI:</span>
                            {r.feedback}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            ) : null}
          </section>

          {/* ── Right: QR + stats ─────────────────────────────────────────── */}
          <aside className={`${presentationMode ? "lg:col-span-6" : "lg:col-span-5"} space-y-6`}>
            <section className="bg-white rounded-3xl border border-[#E5E7EB] shadow-xl p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Join</p>
                  <p className="text-sm text-[#334155] mt-1">Scan or open the link</p>
                </div>
                <div
                  className="text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{ background: connected ? "#DCFCE7" : "#F1F5F9", color: connected ? "#166534" : "#64748B" }}
                >
                  {connected ? "LIVE" : "OFFLINE"}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center">
                <div
                  className={`rounded-3xl p-3 ${isCollecting ? "animate-pulse" : ""}`}
                  style={{
                    background: "#fff",
                    border: `2px solid ${isCollecting ? "#2A9D8F" : "#1B6B7D55"}`,
                    boxShadow: `0 18px 60px ${isCollecting ? "rgba(42,157,143,0.25)" : "rgba(27,107,125,0.14)"}`,
                  }}
                >
                  <QRCodeSVG
                    value={joinUrl || makeJoinUrl(sid)}
                    size={qrSize}
                    level="M"
                    includeMargin
                    fgColor="#0F172A"
                    bgColor="#FFFFFF"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
                <p className="text-[10px] font-bold text-[#5C7483] uppercase tracking-wider mb-1">Join link</p>
                <p className="text-[11px] font-mono text-[#0F172A] break-all">{joinUrl}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button"
                    onClick={async () => { try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 900) } catch {} }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-[#E5E7EB] hover:bg-[#F8FAFC]"
                    style={{ color: "#1B6B7D" }}>
                    <Copy className="w-4 h-4" />{copied ? "Copied" : "Copy"}
                  </button>
                  <a href={joinUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-[#E5E7EB] hover:bg-[#F8FAFC]"
                    style={{ color: "#1B6B7D" }}>
                    <ExternalLink className="w-4 h-4" />Open
                  </a>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-[#E5E7EB] shadow-xl p-6">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#5C7483]">Live snapshot</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["sound", "correct_poor", "insufficient", "unsafe"] as const).map(k => {
                  const c      = stats?.clusters?.[k]
                  const label  = k === "sound" ? "Sound" : k === "correct_poor" ? "Correct/Poor" : k === "insufficient" ? "Insufficient" : "Unsafe"
                  const color  = k === "sound" ? "#166534" : k === "correct_poor" ? "#854D0E" : k === "insufficient" ? "#475569" : "#991B1B"
                  const bg     = k === "sound" ? "#F0FDF4" : k === "correct_poor" ? "#FFFBEB" : k === "insufficient" ? "#F1F5F9" : "#FEF2F2"
                  const border = k === "sound" ? "#86EFAC" : k === "correct_poor" ? "#FCD34D" : k === "insufficient" ? "#94A3B8" : "#FCA5A5"
                  return (
                    <div key={k} className="rounded-2xl p-4 text-center" style={{ background: bg, border: `2px solid ${border}` }}>
                      <div className="text-3xl font-extrabold" style={{ color }}>{c?.pct ?? 0}%</div>
                      <div className="text-xs font-bold" style={{ color }}>{label}</div>
                      <div className="text-[10px]" style={{ color, opacity: 0.75 }}>{c?.count ?? 0} responses</div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 rounded-2xl bg-[#F8FAFC] border border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#334155]">Average score</span>
                <span className="text-2xl font-extrabold text-[#0F172A] tabular-nums">{stats?.average_score ?? 0}/100</span>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}