"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Users, ChevronRight, CheckCircle, AlertTriangle, XCircle, MinusCircle,
  BarChart3, Loader2, Wifi, WifiOff, QrCode, FlaskConical, BookOpen, Copy, ExternalLink,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import {
  useClassroomSocket,
  type ClassroomPhase,
  type Cluster,
  type StatsPayload,
  type WSMessage,
} from "@/hooks/useClassroomSocket"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const PUBLIC_JOIN_BASE = process.env.NEXT_PUBLIC_PUBLIC_JOIN_BASE_URL?.replace(/\/$/, "")

function makeJoinUrl(sessionId: string): string {
  if (!sessionId) return ""
  const base =
    PUBLIC_JOIN_BASE ||
    (typeof window !== "undefined" ? window.location.origin : "")
  return base ? `${base}/join/${sessionId}` : ""
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaseData {
  id: string
  title: string
  patient: { name: string; age: number; condition: string }
  law: { country: string; article: string; text: string }
  steps: Array<{
    id: string
    msg: string
    q: string
    hint: string
    idealResponse: string
    choices: Array<{ id: string; label: string; risk: string; optimal?: boolean }>
  }>
  debrief: {
    principles: Array<{ key: string; label: string; verdict: string }>
    riskMatrix: {
      give: { label: string; consequence: string }
      correct: { label: string; consequence: string }
    }
  }
}

interface ClusteredResponse { id: number; text: string; score: number }
interface ClusteredData {
  step_id: string; total: number
  clusters: Record<Cluster, ClusteredResponse[]>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLUSTER_CFG: Record<Cluster, {
  label: string; short: string; color: string; bg: string; border: string; Icon: React.ElementType
}> = {
  sound:          { label: "Ethically sound & well communicated", short: "Sound",        color: "#166534", bg: "#F0FDF4", border: "#86EFAC", Icon: CheckCircle  },
  correct_poor:   { label: "Correct but poorly communicated",     short: "Correct/Poor", color: "#854D0E", bg: "#FFFBEB", border: "#FCD34D", Icon: AlertTriangle },
  insufficient:   { label: "Not a serious answer yet",            short: "Insufficient", color: "#475569", bg: "#F1F5F9", border: "#94A3B8", Icon: MinusCircle  },
  unsafe:         { label: "Ethically unsafe",                    short: "Unsafe",       color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5", Icon: XCircle      },
}

const PRINCIPLE_LABELS: Record<string, string> = {
  autonomy: "Autonomy", honesty: "Honesty",
  nonMaleficence: "Non-maleficence", nonMal: "Non-maleficence",
  integrity: "Prof. Integrity", justice: "Justice", legalRisk: "Legal Risk",
}

// 11 screens — same structure for both cases
const SCREENS = [
  { id: "intro",        label: "1 · Case Introduction",      phase: "waiting"    as ClassroomPhase },
  { id: "decision_1",   label: "2 · First Decision",          phase: "waiting"    as ClassroomPhase },
  { id: "typing_1",     label: "3 · Typing Interaction (1)",  phase: "waiting"    as ClassroomPhase },
  { id: "pressure",     label: "4 · Pressure / Conflict",     phase: "waiting"    as ClassroomPhase },
  { id: "decision_2",   label: "5 · Second Decision",         phase: "waiting"    as ClassroomPhase },
  { id: "typing_2",     label: "6 · Typing Interaction (2)",  phase: "waiting"    as ClassroomPhase },
  { id: "combined",     label: "7 · Feedback + Law + Risk",   phase: "feedback"   as ClassroomPhase },
  { id: "qr",           label: "8 · QR Participation",        phase: "responding" as ClassroomPhase, step: "s1" },
  { id: "response_org", label: "9 · Response Organisation",   phase: "reviewing"  as ClassroomPhase },
  { id: "cluster_view", label: "10 · Clustered Answers",      phase: "reviewing"  as ClassroomPhase },
  { id: "stats",        label: "11 · Class Statistics",       phase: "debrief"    as ClassroomPhase },
] as const

type ScreenId = typeof SCREENS[number]["id"]

// ── Typewriter ────────────────────────────────────────────────────────────────

function Typewriter({ text, speed = 18 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState("")
  useEffect(() => {
    setShown("")
    let i = 0
    const t = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text, speed])
  return <span>{shown}<span className="animate-pulse opacity-70">|</span></span>
}

// ── QR display ────────────────────────────────────────────────────────────────

function QRDisplay({
  url,
  sessionId,
  accentColor,
  lastEventAt,
  connected,
  studentCount,
  responseCount,
}: {
  url: string
  sessionId: string
  accentColor: string
  lastEventAt: number | null
  connected: boolean
  studentCount: number
  responseCount: number
}) {
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [])

  const secondsSince = lastEventAt ? Math.max(0, Math.floor((now - lastEventAt) / 1000)) : null

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider"
          style={{
            background: connected ? `${accentColor}18` : "rgba(148,163,184,0.18)",
            color: connected ? accentColor : "#94A3B8",
            border: connected ? `1px solid ${accentColor}40` : "1px solid rgba(148,163,184,0.35)",
          }}
        >
          <span
            className={`w-2 h-2 rounded-full ${connected ? "animate-pulse" : ""}`}
            style={{ background: connected ? "#5EE6A8" : "rgba(148,163,184,0.7)" }}
          />
          Live
          <span className="opacity-60 font-bold normal-case">
            {secondsSince === null ? "" : `· updated ${secondsSince}s ago`}
          </span>
        </span>

        <span className="text-xs font-semibold text-[#5C7483]">
          <span className="font-bold" style={{ color: accentColor }}>{studentCount}</span> connected ·{" "}
          <span className="font-bold" style={{ color: accentColor }}>{responseCount}</span> responses
        </span>
      </div>

      <div
        className="rounded-3xl p-3 shadow-xl"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,1))",
          border: `2px solid ${accentColor}55`,
          boxShadow: `0 18px 60px ${accentColor}22`,
        }}
      >
        <div className="rounded-2xl bg-white p-3">
          <QRCodeSVG
            value={url || sessionId}
            size={208}
            level="M"
            includeMargin
            fgColor="#0F172A"
            bgColor="#FFFFFF"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-md">
        <div className="px-5 py-2.5 rounded-2xl text-center w-full" style={{ background: accentColor }}>
          <p className="text-white/65 text-xs mb-0.5 font-semibold">Session code</p>
          <p className="text-white font-black text-2xl tracking-widest">{sessionId}</p>
        </div>

        <div className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-[#5C7483] uppercase tracking-wider mb-1">Join link</p>
              <p className="text-[11px] font-mono text-[#1B3A4D] break-all leading-snug">{url}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 900)
                  } catch {
                    /* ignore */
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-[#E5E7EB] hover:bg-[#F8FAFC]"
                title="Copy join link"
                disabled={!url}
                style={{ color: accentColor, opacity: url ? 1 : 0.5 }}
              >
                <Copy className="w-4 h-4" />
                {copied ? "Copied" : "Copy"}
              </button>

              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-[#E5E7EB] hover:bg-[#F8FAFC]"
                title="Open join page"
                style={{ color: accentColor, pointerEvents: url ? "auto" : "none", opacity: url ? 1 : 0.5 }}
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </a>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-[#5C7483] text-center">
          If the camera can’t scan, open the link or go to{" "}
          <span className="font-semibold text-[#1B3A4D]">/join/{sessionId}</span>.
        </p>
      </div>
    </div>
  )
}

// ── Decision cards (reused for screens 2 and 5) ───────────────────────────────

function DecisionCards({ choices, title, hint }: {
  choices: CaseData["steps"][0]["choices"]
  title: string
  hint?: string
}) {
  const riskStyle = (risk: string, optimal: boolean | undefined) => {
    if (optimal) return { tagColor: "#22C55E", bg: "#F0FDF4", border: "2px solid #22C55E", shadow: "0 8px 24px rgba(34,197,94,0.2)", scale: "scale(1.03)", tag: "✓ SELECTED" }
    if (risk === "high")   return { tagColor: "#EF4444", bg: "#FEF2F2", border: "2px solid #EF444430", shadow: "none", scale: "scale(1)", tag: "HIGH RISK" }
    return { tagColor: "#F59E0B", bg: "#FFFBEB", border: "2px solid #F59E0B30", shadow: "none", scale: "scale(1)", tag: "PARTIAL" }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-[#1B3A4D]">{title}</h2>
        {hint && <p className="text-[#5C7483] text-sm mt-2 max-w-xl">{hint}</p>}
      </div>
      <div
        className="grid gap-5 w-full max-w-3xl"
        style={{ gridTemplateColumns: `repeat(${choices.length}, 1fr)` }}
      >
        {choices.map((c, i) => {
          const s = riskStyle(c.risk, c.optimal)
          return (
            <div
              key={c.id}
              className="rounded-2xl p-5 text-center"
              style={{ border: s.border, background: s.bg, transform: s.scale, boxShadow: s.shadow }}
            >
              <div className="text-2xl mb-3 font-extrabold" style={{ color: s.tagColor }}>
                {String.fromCharCode(65 + i)}.
              </div>
              <p className="font-bold text-[#1B3A4D] text-sm mb-3 leading-snug">{c.label}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: s.tagColor + "22", color: s.tagColor }}>
                {s.tag}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ClassroomDashboard() {
  const params     = useParams()
  const sessionId  = (params?.sessionId as string) ?? ""

  const [screenIdx,     setScreenIdx]     = useState(0)
  const [studentCount,  setStudentCount]  = useState(0)
  const [responseCount, setResponseCount] = useState(0)
  const [stats,         setStats]         = useState<StatsPayload | null>(null)
  const [clusteredData, setClusteredData] = useState<ClusteredData | null>(null)
  const [joinUrl,       setJoinUrl]       = useState("")
  const [loadingData,   setLoadingData]   = useState(false)
  const [caseData,      setCaseData]      = useState<CaseData | null>(null)
  const [caseLoading,   setCaseLoading]   = useState(true)
  const [lastEventAt,   setLastEventAt]   = useState<number | null>(null)

  const currentScreen = SCREENS[screenIdx]
  const isLastScreen  = screenIdx >= SCREENS.length - 1

  // Load case data from backend
  useEffect(() => {
    async function loadSession() {
      try {
        const r = await fetch(`${BASE}/classroom/sessions/${sessionId}`)
        if (!r.ok) return
        const session = await r.json()
        if (session.case_data) {
          setCaseData(session.case_data)
          return
        }
        const cr = await fetch(`${BASE}/cases/${session.case_id}`)
        if (!cr.ok) return
        setCaseData(await cr.json())
      } finally {
        setCaseLoading(false)
      }
    }
    loadSession()
  }, [sessionId])

  useEffect(() => {
    setJoinUrl(makeJoinUrl(sessionId))
  }, [sessionId])

  const { connected, send } = useClassroomSocket({
    sessionId,
    role: "instructor",
    onMessage: useCallback((msg: WSMessage) => {
      setLastEventAt(Date.now())
      if (msg.type === "student_joined" || msg.type === "student_left") {
        setStudentCount(msg.student_count)
      } else if (msg.type === "response_received") {
        setResponseCount(msg.count)
        setStats(msg.stats)
      } else if (msg.type === "stats_update") {
        setStats(msg.stats)
        if (typeof msg.stats?.total === "number") {
          setResponseCount(msg.stats.total)
        }
      }
    }, []),
  })

  useEffect(() => {
    if (!connected || !sessionId) return
    void (async () => {
      try {
        const r = await fetch(`${BASE}/classroom/sessions/${sessionId}`)
        if (!r.ok) return
        const s = await r.json()
        setStudentCount(s.student_count ?? 0)
        setResponseCount(s.response_count ?? 0)
      } finally {
        send({ type: "request_stats", step_id: "s1" })
      }
    })()
  }, [connected, sessionId, send])

  const advance = async () => {
    const nextIdx = screenIdx + 1
    if (nextIdx >= SCREENS.length) return
    const next = SCREENS[nextIdx]
    setScreenIdx(nextIdx)
    send({ type: "set_phase", phase: next.phase, step_id: (next as any).step ?? undefined })

    if (next.id === "cluster_view") {
      setLoadingData(true)
      try {
        const r = await fetch(`${BASE}/classroom/sessions/${sessionId}/responses?step_id=s1`)
        if (r.ok) setClusteredData(await r.json())
      } finally {
        setLoadingData(false)
      }
    }
    if (next.id === "stats") {
      send({ type: "request_stats", step_id: "s1" })
    }
  }

  if (caseLoading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #D4E8EC, #E8F4F6)" }}>
      <Loader2 className="w-8 h-8 animate-spin text-[#1B6B7D]" />
    </div>
  )

  const isResearch = caseData?.id === "case_research"
  const accentColor = isResearch ? "#2A6DF5" : "#1B6B7D"

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, #D4E8EC 0%, #E8F4F6 50%, #F0F8FA 100%)" }}>

      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 shrink-0"
        style={{ background: accentColor }}>
        <Link
          href="/classroom"
          className="text-white font-extrabold text-lg tracking-tight hover:opacity-90"
          title="Classroom case picker"
        >
          ETHICARE
        </Link>
        <span className="text-white/30">·</span>
        <span className="text-white/80 text-sm font-semibold">
          {caseData?.title ?? "Classroom Session"}
        </span>
        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Users className="w-4 h-4" />
            <span className="font-bold">{studentCount}</span>
            <span className="text-white/50">joined</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <BarChart3 className="w-4 h-4" />
            <span className="font-bold">{responseCount}</span>
            <span className="text-white/50">responses</span>
          </div>
          <div className="flex items-center gap-1.5">
            {connected ? <Wifi className="w-4 h-4 text-[#5EE6A8]" /> : <WifiOff className="w-4 h-4 text-white/40" />}
            <span className="text-xs font-semibold"
              style={{ color: connected ? "#5EE6A8" : "rgba(255,255,255,0.4)" }}>
              {sessionId}
            </span>
          </div>
          <span className="text-white/40 text-xs">Screen {screenIdx + 1} / {SCREENS.length}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex gap-4 p-5 min-h-0">

        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {SCREENS.map((s, i) => (
            <div key={s.id}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
              style={{
                background: i === screenIdx ? `${accentColor}22` : "transparent",
                color: i === screenIdx ? accentColor : i < screenIdx ? "#5C7483" : "#9CA3AF",
                fontWeight: i === screenIdx ? 700 : 500,
              }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{
                  background: i < screenIdx ? "#5EE6A8" : i === screenIdx ? accentColor : "#E5E7EB",
                  color: i <= screenIdx ? "white" : "#9CA3AF",
                }}>
                {i < screenIdx ? "✓" : i + 1}
              </div>
              {s.label}
            </div>
          ))}

          <div className="mt-3 bg-white rounded-2xl p-3 shadow-sm border border-[#E5E7EB] flex flex-col items-center gap-1">
            <p className="text-[10px] font-bold text-[#5C7483] uppercase tracking-wider">Join</p>
            <p className="text-[10px] font-black tracking-widest" style={{ color: accentColor }}>{sessionId}</p>
            <p className="text-[8px] font-mono text-[#9CA3AF] text-center break-all">{joinUrl}</p>
          </div>
        </aside>

        {/* Stage */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex-1 bg-white rounded-3xl shadow-xl border border-[#E5E7EB] overflow-hidden">
            <div className="h-full p-8 overflow-y-auto">
              {caseData && (
                <ScreenContent
                  screenId={currentScreen.id}
                  caseData={caseData}
                  stats={stats}
                  clusteredData={clusteredData}
                  studentCount={studentCount}
                  responseCount={responseCount}
                  loading={loadingData}
                  joinUrl={joinUrl}
                  sessionId={sessionId}
                  accentColor={accentColor}
                  lastEventAt={lastEventAt}
                  connected={connected}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end shrink-0">
            <button onClick={advance} disabled={isLastScreen}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all hover:shadow-xl"
              style={{ background: isLastScreen ? "#E5E7EB" : accentColor, color: isLastScreen ? "#9CA3AF" : "white" }}>
              {isLastScreen ? "Session complete" : "Next screen"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Screen renderer ───────────────────────────────────────────────────────────

function ScreenContent({
  screenId, caseData, stats, clusteredData, studentCount, responseCount,
  loading, joinUrl, sessionId, accentColor,
  lastEventAt, connected,
}: {
  screenId: ScreenId
  caseData: CaseData
  stats: StatsPayload | null
  clusteredData: ClusteredData | null
  studentCount: number
  responseCount: number
  loading: boolean
  joinUrl: string
  sessionId: string
  accentColor: string
  lastEventAt: number | null
  connected: boolean
}) {
  const step1 = caseData.steps?.[0]
  const step2 = caseData.steps?.[1]
  const isResearch = caseData.id === "case_research"

  // ── Screen 1 — Case Introduction ─────────────────────────────────────────
  if (screenId === "intro") return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
        style={{ background: isResearch ? "#EEF3FF" : "#E8F4F6" }}>
        {isResearch ? "👩" : "👨‍🎓"}
      </div>
      <div>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ background: isResearch ? "#EEF3FF" : "#E8F4F6", color: accentColor }}>
          {isResearch ? "RESEARCH ETHICS CASE" : "DEMO CASE"}
        </span>
        <h1 className="text-3xl font-extrabold text-[#1B3A4D] mb-2">{caseData.title}</h1>
        <p className="text-[#5C7483] text-base max-w-lg">
          {caseData.patient?.name ?? "Patient"}, {caseData.patient?.age ?? "?"} — {caseData.patient?.condition ?? "Scenario"}
        </p>
      </div>
      <div className="max-w-lg rounded-2xl p-5 text-left"
        style={{ background: "#FFF9F5", border: "2px solid #F7A35C" }}>
        <p className="text-sm font-bold text-[#F7A35C] mb-2">
          {isResearch ? "Participant says:" : "Patient says:"}
        </p>
        <p className="text-[#1B3A4D] text-lg leading-relaxed italic">
          "{step1?.msg ?? "…"}"
        </p>
      </div>
      {isResearch && (
        <div className="max-w-lg rounded-2xl p-4 w-full text-left"
          style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
          <p className="text-xs font-bold text-[#EF4444] mb-1">Coordinator says:</p>
          <p className="text-[#991B1B] text-sm italic leading-relaxed">
            "Just have her sign. Don't over-explain — she won't understand. If she refuses, she loses the free care."
          </p>
        </div>
      )}
    </div>
  )

  // ── Screen 2 — First Decision ─────────────────────────────────────────────
  if (screenId === "decision_1") return (
    step1 ? (
      <DecisionCards
        choices={step1.choices ?? []}
        title={step1.q ?? "Decision"}
        hint={step1.hint}
      />
    ) : null
  )

  // ── Screen 3 — Typing Interaction (1) ────────────────────────────────────
  if (screenId === "typing_1") return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-2">Typing Interaction</p>
        <h2 className="text-2xl font-extrabold text-[#1B3A4D]">How would you respond?</h2>
      </div>
      <div className="w-full max-w-xl">
        <div className="rounded-2xl px-5 py-4"
          style={{ background: "white", border: `2px solid ${accentColor}`, boxShadow: "0 4px 16px rgba(27,107,125,0.12)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
            <span className="text-xs text-[#9CA3AF] ml-1 font-medium">Ideal response</span>
          </div>
          <p className="text-[#1B3A4D] text-base leading-relaxed min-h-[2rem]">
            <Typewriter text={step1?.idealResponse ?? ""} speed={28} />
          </p>
        </div>
      </div>
    </div>
  )

  // ── Screen 4 — Pressure ───────────────────────────────────────────────────
  if (screenId === "pressure") return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#FEF2F2", border: "2px solid #FCA5A5" }}>
        <span className="text-3xl">{isResearch ? "💰" : "😰"}</span>
      </div>
      <div>
        <p className="text-[#EF4444] text-sm font-bold uppercase tracking-wider mb-3">
          {isResearch ? "Conflict of Interest" : "Emotional Pressure"}
        </p>
        <div className="max-w-lg rounded-2xl p-6" style={{ background: "#FEF2F2", border: "2px solid #FCA5A5" }}>
          <p className="text-[#1B3A4D] text-xl leading-relaxed italic font-medium">
            {isResearch
              ? '"The sponsor expects numbers. Don\'t block the recruitment. She\'s getting money and free tests — she should be grateful."'
              : '"Doctor, please… this could cost me my year…"'
            }
          </p>
        </div>
      </div>
      <p className="text-[#5C7483] text-sm max-w-md">
        {isResearch
          ? "Sponsor pressure creates a conflict of interest. Ethical practice requires resisting it."
          : "Yielding to emotional pressure is one of the most common sources of professional misconduct."
        }
      </p>
    </div>
  )

  // ── Screen 5 — Second Decision ────────────────────────────────────────────
  if (screenId === "decision_2") return (
    step2 ? (
      <DecisionCards
        choices={step2.choices ?? []}
        title={step2.q ?? "Decision"}
        hint={step2.hint}
      />
    ) : (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <p className="text-[#5C7483] font-semibold">This live session only has one decision step.</p>
        <p className="text-[#9CA3AF] text-sm">Continue to the QR participation screen to collect responses.</p>
      </div>
    )
  )

  // ── Screen 6 — Typing Interaction (2) ────────────────────────────────────
  if (screenId === "typing_2") return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-2">Ideal Response</p>
        <h2 className="text-2xl font-extrabold text-[#1B3A4D]">How would you respond?</h2>
      </div>
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl px-5 py-4"
          style={{ background: "white", border: `2px solid ${accentColor}`, boxShadow: "0 4px 16px rgba(27,107,125,0.12)" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
            <span className="text-xs text-[#9CA3AF] ml-1 font-medium">Ideal response</span>
          </div>
          <p className="text-[#1B3A4D] text-base leading-relaxed">
            <Typewriter text={step2?.idealResponse ?? ""} speed={14} />
          </p>
        </div>
      </div>
    </div>
  )

  // ── Screen 7 — COMBINED: Feedback + Law + Risk ────────────────────────────
  if (screenId === "combined") return (
    <div className="flex flex-col gap-5 h-full">
      <div className="text-center shrink-0">
        <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-1">Summary Slide</p>
        <h2 className="text-2xl font-extrabold text-[#1B3A4D]">Feedback · Legal Reference · Risk</h2>
      </div>

      {/* Principles row */}
      <div className="rounded-2xl p-4 shrink-0" style={{ background: "#F8FAFC", border: "1px solid #E5E7EB" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-[#F7A35C] flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
              <rect x="5" y="6" width="14" height="12" rx="2" fill="#1B6B7D" />
              <circle cx="9" cy="11" r="1.5" fill="white" />
              <circle cx="15" cy="11" r="1.5" fill="white" />
              <rect x="9" y="14" width="6" height="1" rx="0.5" fill="#58D8C8" />
            </svg>
          </div>
          <span className="text-xs font-extrabold text-[#F7A35C] uppercase tracking-wider">Dr. Ethics Feedback</span>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${caseData.debrief.principles.length}, 1fr)` }}>
          {caseData.debrief.principles.map(p => (
            <div key={p.key} className="rounded-xl p-3 text-center"
              style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <div className="w-7 h-7 rounded-full bg-[#22C55E] flex items-center justify-center mx-auto mb-1.5">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-[#166534] text-[10px] leading-tight mb-0.5">{p.label}</p>
              <p className="text-[9px] text-[#166534] opacity-70 capitalize">{p.verdict}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Law + Risk side by side */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Law */}
        <div className="rounded-2xl p-4 flex flex-col gap-2"
          style={{ background: "#F8FAFC", border: `2px solid ${accentColor}` }}>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl">{isResearch ? "🌍" : "🇲🇦"}</span>
            <div>
              <p className="text-[10px] font-bold text-[#5C7483] uppercase tracking-wider">
                {caseData.law.country.replace(/^.{1,2}\s/, "")}
              </p>
              <p className="font-extrabold text-sm" style={{ color: "#F7A35C" }}>{caseData.law.article}</p>
            </div>
          </div>
          <p className="text-[#1B3A4D] text-sm leading-relaxed italic flex-1">
            "{caseData.law.text}"
          </p>
        </div>

        {/* Risk */}
        <div className="flex flex-col gap-3">
          <div className="flex-1 rounded-2xl p-4 flex flex-col gap-2"
            style={{ background: "#FEF2F2", border: "2px solid #FCA5A5" }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#EF4444] flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-extrabold text-[#991B1B] text-xs">{caseData.debrief.riskMatrix.give.label}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#EF4444" }}>HIGH RISK</span>
              </div>
            </div>
            <p className="text-[#991B1B] text-xs leading-relaxed">{caseData.debrief.riskMatrix.give.consequence}</p>
          </div>
          <div className="flex-1 rounded-2xl p-4 flex flex-col gap-2"
            style={{ background: "#F0FDF4", border: "2px solid #86EFAC" }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#22C55E] flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-extrabold text-[#166534] text-xs">{caseData.debrief.riskMatrix.correct.label}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#22C55E" }}>ETHICAL COMPLIANCE</span>
              </div>
            </div>
            <p className="text-[#166534] text-xs leading-relaxed">{caseData.debrief.riskMatrix.correct.consequence}</p>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Screen 8 — QR ─────────────────────────────────────────────────────────
  if (screenId === "qr") return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div>
        <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-2">Group Participation</p>
        <h2 className="text-2xl font-extrabold text-[#1B3A4D] mb-1">Now it's your turn</h2>
        <p className="text-[#5C7483] text-sm">Scan the QR code or enter the session code on your phone</p>
      </div>
      <QRDisplay
        url={joinUrl}
        sessionId={sessionId}
        accentColor={accentColor}
        lastEventAt={lastEventAt}
        connected={connected}
        studentCount={studentCount}
        responseCount={responseCount}
      />
      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl" style={{ background: "#E8F4F6" }}>
        <Users className="w-5 h-5" style={{ color: accentColor }} />
        <span className="font-bold text-sm" style={{ color: accentColor }}>
          {studentCount} student{studentCount !== 1 ? "s" : ""} connected
        </span>
      </div>
    </div>
  )

  // ── Screen 9 — Response Organisation ─────────────────────────────────────
  if (screenId === "response_org") return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-2">AI Classification</p>
        <h2 className="text-2xl font-extrabold text-[#1B3A4D]">Response Organisation</h2>
        <p className="text-[#5C7483] text-sm mt-2 max-w-lg">
          Dr. Ethics AI classifies each response into 3 ethical categories.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
        {(["sound", "correct_poor", "insufficient", "unsafe"] as Cluster[]).map(k => {
          const cfg = CLUSTER_CFG[k]
          return (
            <div key={k} className="rounded-2xl p-5 flex flex-col items-center text-center gap-3"
              style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: cfg.color }}>
                <cfg.Icon className="w-7 h-7 text-white" />
              </div>
              <p className="font-extrabold text-sm leading-snug" style={{ color: cfg.color }}>{cfg.label}</p>
            </div>
          )
        })}
      </div>
      <p className="text-[#5C7483] text-xs text-center max-w-lg">
        Evaluated on: Autonomy · Honesty · Non-maleficence · {isResearch ? "Justice" : "Professional Integrity"} · {isResearch ? "Exploitation Risk" : "Legal Risk"}
      </p>
    </div>
  )

  // ── Screen 10 — Clustered Answers ─────────────────────────────────────────
  if (screenId === "cluster_view") {
    if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} /></div>
    if (!clusteredData || clusteredData.total === 0) return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <p className="text-[#5C7483] font-semibold">No responses collected yet.</p>
        <p className="text-[#9CA3AF] text-sm">Go back to the QR screen and wait for students to submit.</p>
      </div>
    )
    return (
      <div className="flex flex-col h-full gap-4">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-xl font-extrabold text-[#1B3A4D]">Clustered Answers</h2>
          <span className="text-sm text-[#5C7483] font-semibold">{clusteredData.total} responses</span>
        </div>
        <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
          {(["sound", "correct_poor", "insufficient", "unsafe"] as Cluster[]).map(cluster => {
            const cfg = CLUSTER_CFG[cluster]
            const items = clusteredData.clusters[cluster] ?? []
            return (
              <div key={cluster} className="flex flex-col gap-2 min-h-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <cfg.Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
                  <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.short} ({items.length})</span>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {items.map(r => (
                    <div key={r.id} className="rounded-xl p-3" style={{ background: cfg.bg, border: `1px solid ${cfg.border}40` }}>
                      <p className="text-xs text-[#1B3A4D] leading-relaxed">"{r.text}"</p>
                      <p className="text-[10px] mt-1 font-semibold" style={{ color: cfg.color }}>Score: {r.score}/100</p>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-[#9CA3AF] px-2 italic">No responses in this cluster.</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Screen 11 — Class Statistics ──────────────────────────────────────────
  if (screenId === "stats") {
    if (!stats || stats.total === 0) return (
      <div className="flex items-center justify-center h-full text-[#5C7483]">No data yet.</div>
    )
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center shrink-0">
          <p className="text-[#5C7483] text-sm font-semibold uppercase tracking-wider mb-1">Class Overview</p>
          <h2 className="text-2xl font-extrabold text-[#1B3A4D]">Class Statistics</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {(["sound", "correct_poor", "insufficient", "unsafe"] as Cluster[]).map(k => {
            const cfg = CLUSTER_CFG[k]
            const d = stats.clusters[k]
            return (
              <div key={k} className="rounded-2xl p-5 text-center" style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}>
                <div className="text-5xl font-extrabold mb-1" style={{ color: cfg.color }}>{d?.pct ?? 0}%</div>
                <div className="text-xs font-bold mb-0.5" style={{ color: cfg.color }}>{cfg.short}</div>
                <div className="text-[10px]" style={{ color: cfg.color, opacity: 0.7 }}>{d?.count ?? 0} students</div>
              </div>
            )
          })}
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#F8FAFC", border: "1px solid #E5E7EB" }}>
          <p className="text-sm font-bold text-[#1B3A4D] mb-4">Overall Ethical Profile — class average</p>
          <div className="flex flex-col gap-3">
            {Object.entries(stats.principles).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="text-xs text-[#5C7483] w-36 shrink-0">{PRINCIPLE_LABELS[k] ?? k}</span>
                <div className="flex-1 h-2.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${v}%`, background: v >= 75 ? "#22C55E" : v >= 50 ? "#F59E0B" : "#EF4444" }} />
                </div>
                <span className="text-xs font-bold text-[#1B3A4D] w-8 text-right">{v}%</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#E5E7EB] flex items-center justify-between">
            <span className="text-sm text-[#5C7483] font-semibold">Average ethics score</span>
            <span className="text-3xl font-extrabold"
              style={{ color: stats.average_score >= 70 ? "#22C55E" : stats.average_score >= 50 ? "#F59E0B" : "#EF4444" }}>
              {stats.average_score}<span className="text-base text-[#5C7483]">/100</span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  return null
}