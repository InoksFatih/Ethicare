"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { CheckCircle, Loader2, Send, Wifi, WifiOff } from "lucide-react"
import {
  useClassroomSocket,
  type ClassroomPhase,
  type Cluster,
  type WSMessage,
} from "@/hooks/useClassroomSocket"

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvaluationResult {
  cluster: Cluster
  feedback: string
  principles: Record<string, string>
  score: number
}

// ── Config ────────────────────────────────────────────────────────────────────

const CLUSTER_CONFIG: Record<
  Cluster,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  sound:          { label: "Ethically sound & well communicated", color: "#166534", bg: "#F0FDF4", border: "#86EFAC", icon: "✓" },
  correct_poor:   { label: "Correct but poorly communicated",       color: "#854D0E", bg: "#FFFBEB", border: "#FCD34D", icon: "~" },
  unsafe:         { label: "Ethically unsafe",                      color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5", icon: "!" },
  insufficient:   { label: "Not a serious answer yet",            color: "#475569", bg: "#F1F5F9", border: "#94A3B8", icon: "…" },
}

const PRINCIPLE_LABELS: Record<string, string> = {
  autonomy:       "Autonomy",
  honesty:        "Honesty",
  nonMaleficence: "Non-maleficence",
  nonMal:         "Non-maleficence",
  integrity:      "Professional Integrity",
  justice:        "Justice",
  legalRisk:      "Legal Risk",
}

const VERDICT_STYLE: Record<string, { color: string; label: string }> = {
  respected: { color: "#166534", label: "Respected" },
  avoided:   { color: "#166534", label: "Avoided" },
  protected: { color: "#166634", label: "Protected" },
  partial:   { color: "#854D0E", label: "Partial" },
  present:   { color: "#854D0E", label: "Present" },
  violated:  { color: "#991B1B", label: "Violated" },
  high:      { color: "#991B1B", label: "High risk" },
}

// ── Stable anonymous student ID ───────────────────────────────────────────────
// React's useId() produces a new value on every page reload, which would allow a
// student to bypass the server-side duplicate-submission guard by refreshing.
// We instead use sessionStorage so the ID is stable for the tab's lifetime.

function useStableStudentId(sessionId: string): string {
  const key = `ethicare-student-id-${sessionId}`
  const idRef = useRef<string>("")

  if (!idRef.current) {
    try {
      const stored = sessionStorage.getItem(key)
      if (stored) {
        idRef.current = stored
      } else {
        const fresh = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        sessionStorage.setItem(key, fresh)
        idRef.current = fresh
      }
    } catch {
      // sessionStorage unavailable (e.g. private mode with restrictions)
      idRef.current = `s-${Math.random().toString(36).slice(2, 14)}`
    }
  }

  return idRef.current
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const params    = useParams()
  const sessionId = (params?.sessionId as string) ?? ""
  const studentId = useStableStudentId(sessionId)

  const [phase,            setPhase]            = useState<ClassroomPhase>("waiting")
  const [currentStep,      setCurrentStep]      = useState("s1")
  const [text,             setText]             = useState("")
  const [submitting,       setSubmitting]        = useState(false)
  const [submitted,        setSubmitted]         = useState(false)
  const [result,           setResult]            = useState<EvaluationResult | null>(null)
  const [alreadyResponded, setAlreadyResponded]  = useState(false)
  const [serverError,      setServerError]       = useState<string | null>(null)

  // useCallback prevents the WS hook from reconnecting every render.
  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "session_state":
        setPhase(msg.phase)
        setCurrentStep(msg.current_step)
        break

      case "phase_change":
        setPhase(msg.phase)
        setCurrentStep(msg.step_id)
        if (msg.phase === "responding") {
          setSubmitted(false)
          setResult(null)
          setAlreadyResponded(false)
          setServerError(null)
          setText("")
        }
        break

      case "response_evaluated":
        setResult({
          cluster:    msg.cluster,
          feedback:   msg.feedback,
          principles: msg.principles,
          score:      msg.score,
        })
        setSubmitted(true)
        setSubmitting(false)
        break

      case "already_responded":
        setAlreadyResponded(true)
        setSubmitting(false)
        break

      case "error":
        setServerError(msg.message ?? "An error occurred.")
        setSubmitting(false)
        break
    }
  }, [])

  const { connected, send } = useClassroomSocket({
    sessionId,
    role: "student",
    studentId,
    onMessage: handleMessage,
  })

  const handleSubmit = () => {
    if (!text.trim() || submitting || submitted) return
    setSubmitting(true)
    setServerError(null)
    send({ type: "submit_response", step_id: currentStep, text: text.trim() })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit()
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #0D3D4A 0%, #1B6B7D 100%)" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 rounded-lg hover:bg-white/10 transition-colors pr-2 -ml-1">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-white font-extrabold text-base tracking-tight">ETHICARE</span>
        </Link>

        <div className="flex items-center gap-2">
          {connected
            ? <Wifi className="w-4 h-4 text-[#5EE6A8]" />
            : <WifiOff className="w-4 h-4 text-white/40" />
          }
          <span
            className="text-xs font-semibold"
            style={{ color: connected ? "#5EE6A8" : "rgba(255,255,255,0.4)" }}
          >
            {connected ? sessionId : "Connecting…"}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col px-5 pb-8">

        {/* ── WAITING ── */}
        {phase === "waiting" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
            </div>
            <div>
              <p className="text-white font-bold text-lg mb-1">You're in!</p>
              <p className="text-white/60 text-sm">Waiting for the instructor to start…</p>
            </div>
            <div
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
            >
              Session: {sessionId}
            </div>
          </div>
        )}

        {/* ── RESPONDING — text input ── */}
        {phase === "responding" && !submitted && !alreadyResponded && (
          <div className="flex-1 flex flex-col gap-5 pt-4">
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Your turn</p>
              <p className="text-white text-base leading-relaxed font-medium">
                How would you respond to this situation? Write your answer below.
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-3">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response here…"
                rows={6}
                maxLength={2000}
                className="w-full rounded-2xl px-4 py-3 text-sm text-[#1B3A4D] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#58D8C8]"
                style={{ background: "rgba(255,255,255,0.95)" }}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{text.length}/2000 · Ctrl+Enter to submit</span>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || submitting}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: text.trim() && !submitting ? "#F7A35C" : "rgba(255,255,255,0.15)",
                    color:      text.trim() && !submitting ? "white"    : "rgba(255,255,255,0.4)",
                    cursor:     text.trim() && !submitting ? "pointer"  : "not-allowed",
                  }}
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                  Submit
                </button>
              </div>

              {serverError && (
                <p
                  className="text-xs rounded-xl px-3 py-2"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  {serverError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── ALREADY RESPONDED ── */}
        {alreadyResponded && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <CheckCircle className="w-12 h-12 text-[#5EE6A8]" />
            <p className="text-white font-bold text-lg">Already submitted!</p>
            <p className="text-white/60 text-sm">Your response for this step has been recorded.</p>
          </div>
        )}

        {/* ── EVALUATED — personal feedback ── */}
        {submitted && result && (
          <div className="flex-1 flex flex-col gap-4 pt-4">
            {/* Cluster badge */}
            <div
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{
                background: CLUSTER_CONFIG[result.cluster].bg,
                border: `2px solid ${CLUSTER_CONFIG[result.cluster].border}`,
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black shrink-0"
                style={{
                  background: CLUSTER_CONFIG[result.cluster].border,
                  color:      CLUSTER_CONFIG[result.cluster].color,
                }}
              >
                {CLUSTER_CONFIG[result.cluster].icon}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: CLUSTER_CONFIG[result.cluster].color }}>
                  {CLUSTER_CONFIG[result.cluster].label}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: CLUSTER_CONFIG[result.cluster].color, opacity: 0.7 }}
                >
                  Score: {result.score}/100
                </p>
              </div>
            </div>

            {/* Dr. Ethics feedback */}
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-[#F7A35C] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                    <rect x="5" y="6" width="14" height="12" rx="2" fill="#1B6B7D" />
                    <circle cx="9" cy="11" r="1.5" fill="white" />
                    <circle cx="15" cy="11" r="1.5" fill="white" />
                    <rect x="9" y="14" width="6" height="1" rx="0.5" fill="#58D8C8" />
                  </svg>
                </div>
                <span className="text-[#F7A35C] text-xs font-extrabold uppercase tracking-wider">Dr. Ethics</span>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">{result.feedback}</p>
            </div>

            {/* Principle breakdown */}
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-3">Ethical Principles</p>
              <div className="flex flex-col gap-2">
                {Object.entries(result.principles).map(([key, verdict]) => {
                  const style = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.partial
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-white/80 text-xs">{PRINCIPLE_LABELS[key] ?? key}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: style.color + "22", color: style.color }}
                      >
                        {style.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEWING / FEEDBACK / DEBRIEF — waiting ── */}
        {(phase === "reviewing" || phase === "feedback" || phase === "debrief") && !submitted && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-2">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Loader2 className="w-8 h-8 text-[#58D8C8] animate-spin" />
            </div>
            <p className="text-white font-bold">Collection paused</p>
            <p className="text-white/50 text-sm max-w-md">
              The facilitator closed the response window. You can’t submit until they press start again and you see
              <span className="text-white/70 font-semibold"> Your turn</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}