"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Clock,
  User,
  CheckCircle,
  ArrowRight,
  RotateCcw,
  Trophy,
  Target,
  BookOpen,
  AlertCircle,
  HelpCircle,
  X,
  Radio,
} from "lucide-react"
import Sidebar from "@/components/ethicare/sidebar"
import ChatPanel from "@/components/ethicare/chat-panel"
import DecisionCards from "@/components/ethicare/decision-cards"
import EthicsPanel from "@/components/ethicare/ethics-panel"
import LawPanel from "@/components/ethicare/law-panel"
import DrEthicsPanel from "@/components/ethicare/dr-ethics-panel"
import ConsultationScene from "@/components/ethicare/consultation-scene"
import ComplicationModal, { type ComplicationCard } from "@/components/ethicare/complication-modal"
import { buildPrinciplesAnalysis, outcomeNarrative } from "@/lib/debrief-analysis"
import { resolveCertificatePatientSubtitle } from "@/lib/certificate-subtitles"

// Local fallback clips served from `/media/<file>` (Next route backed by `frontend/media/`).
const DOC_FALLBACK_VIDEO_URL = "/media/docexamine1.mp4"
const YSF_FALLBACK_VIDEO_URL = "/media/ysf_intro.mp4"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

/** Optional HeyGen-exported clip (or any MP4/WebM) for a one-avatar demo — e.g. `/videos/heygen-patient.mp4` */
const DEMO_AVATAR_VIDEO_URL = process.env.NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_VIDEO_URL?.trim() || undefined
const DEMO_AVATAR_POSTER_URL = process.env.NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_POSTER_URL?.trim() || undefined
const DEMO_AVATAR_SIDE =
  process.env.NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_SIDE?.trim().toLowerCase() === "doctor" ? "doctor" : "patient"

const DEMO_AVATAR_DOCTOR_VIDEO_URL_ENV = process.env.NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_DOCTOR_VIDEO_URL?.trim() || undefined
const DEMO_AVATAR_PATIENT_VIDEO_URL_ENV = process.env.NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_PATIENT_VIDEO_URL?.trim() || undefined

const usingLegacySingleClip =
  Boolean(DEMO_AVATAR_VIDEO_URL) && !DEMO_AVATAR_DOCTOR_VIDEO_URL_ENV && !DEMO_AVATAR_PATIENT_VIDEO_URL_ENV

const DEFAULT_DOCTOR_VIDEO_URL =
  DEMO_AVATAR_DOCTOR_VIDEO_URL_ENV ??
  (usingLegacySingleClip && DEMO_AVATAR_SIDE === "doctor" ? DEMO_AVATAR_VIDEO_URL : undefined) ??
  DOC_FALLBACK_VIDEO_URL

const DEFAULT_PATIENT_VIDEO_URL =
  DEMO_AVATAR_PATIENT_VIDEO_URL_ENV ??
  (usingLegacySingleClip && DEMO_AVATAR_SIDE === "patient" ? DEMO_AVATAR_VIDEO_URL : undefined) ??
  YSF_FALLBACK_VIDEO_URL

type Scores = {
  autonomy: number
  beneficence: number
  nonMal: number
  justice: number
}

type Emotions = {
  fear: number
  trust: number
  pain: number
}

type Choice = {
  id: string
  icon: string
  label: string
  sub: string
  reaction: string
  delta: Record<string, number>
  emo?: Record<string, number>
  optimal?: boolean
  risk?: string
  ends_case?: boolean
  ending_key?: string | null
}

type Step = {
  id: string
  msg: string
  q: string
  hint: string
  choices: Choice[]
  idealResponse?: string
}

type CaseData = {
  id: string
  num: string
  title: string
  desc: string
  category: string
  categoryColor?: string
  categoryBg?: string
  difficulty: "Easy" | "Medium" | "Hard"
  diffColor?: string
  tags: string[]
  patient: {
    name: string
    age: number
    condition: string
    gender?: string
  }
  law: {
    country: string
    article: string
    text: string
  }
  initScores: Scores
  initEmo: Emotions
  steps: Step[]
  complications?: ComplicationCard[]
  debrief: {
    summary: string
    points: string[]
    /** Optional per-branch debrief copy when choices use ending_key (e.g. certificate case). */
    endings?: Record<
      string,
      { headline: string; summary?: string; points?: string[] }
    >
    principles?: { key: string; label: string; verdict: string }[]
    riskMatrix?: {
      give: { label: string; level: string; color: string; consequence: string }
      correct: { label: string; level: string; color: string; consequence: string }
    }
  }
}

type DecisionResponse = {
  patient_reaction: string
  dr_ethics_feedback: string
  score_delta: Record<string, number>
  emo_delta: Record<string, number>
  updated_scores: Scores
  updated_emo: Emotions
  next_step_id: string | null
  is_final: boolean
  ending_key?: string | null
}

type DebriefResponse = {
  final_scores: Scores
  average_score: number
  grade: string
  summary: string
  learning_points: string[]
  principles_analysis?: { key: string; label: string; verdict: string }[]
  outcome_narrative?: string
}

type StartCaseResponse = {
  play_id: string
}

type Message = {
  role: "patient" | "doctor" | "interruption"
  text: string
  time: string
  interruptionLabel?: string
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`

/** Match demo choreography clock (e.g. 11:23). */
const INITIAL_SESSION_SECONDS = 11 * 60 + 23

/** Certificate case: delay before auto-playing the patient clip on each open line (intro / between steps). */
const CERT_PATIENT_INTRO_DELAY_MS = 3000

function verdictStyle(verdict: string): { bg: string; text: string; border: string } {
  const v = verdict.toLowerCase()
  if (/not adequately upheld|significant concern/i.test(v)) {
    return { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" }
  }
  if (/partially met in your run/i.test(v)) {
    return { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" }
  }
  if (
    /violat|unsafe|high|blocked|denied|poor|weak|risk/i.test(v) &&
    !/reduced|avoided/i.test(v)
  ) {
    return { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" }
  }
  if (/clear|protected|maintained|respected|preserved|avoided|safe|reduced|sound|excellent/i.test(v)) {
    return { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" }
  }
  if (/tension|mixed|medium|moderate|partial/i.test(v)) {
    return { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" }
  }
  return { bg: "#F8FAFC", text: "#334155", border: "#E2E8F0" }
}

/** Must be defined at module scope — an inner component gets a new identity every parent render and remounts (e.g. every session timer tick), resetting scroll. */
function CaseDebriefModal({
  caseData,
  debrief,
  scores,
  endingKey,
  onRestart,
  onBackToLibrary,
}: {
  caseData: CaseData
  debrief: DebriefResponse | null
  scores: Scores
  /** Branch id from last decision (bad_certificate, bad_communication, good, …). */
  endingKey: string | null
  onRestart: () => void
  onBackToLibrary: () => void
}) {
  const finalScores = debrief?.final_scores ?? scores
  const avgScore =
    debrief?.average_score ??
    Math.round(
      (finalScores.autonomy +
        finalScores.beneficence +
        finalScores.nonMal +
        finalScores.justice) /
        4
    )

  const branch = endingKey ? caseData.debrief.endings?.[endingKey] : undefined
  const summary =
    branch?.summary ?? debrief?.summary ?? caseData.debrief.summary ?? ""
  const points =
    branch?.points ?? debrief?.learning_points ?? caseData.debrief.points ?? []
  const caseEndedEarly = Boolean(endingKey && endingKey !== "good")
  const debriefTitle = caseEndedEarly ? "Case ended" : "Case complete!"
  const grade = debrief?.grade ?? (avgScore >= 75 ? "Excellent ethical judgment" : avgScore >= 60 ? "Good ethical reasoning" : avgScore >= 45 ? "Needs deeper reflection" : "Review core principles")
  const principlesResolved =
    debrief?.principles_analysis && debrief.principles_analysis.length > 0
      ? debrief.principles_analysis
      : buildPrinciplesAnalysis(caseData.debrief.principles, finalScores)
  const riskMatrix = caseData.debrief.riskMatrix
  const narrative = debrief?.outcome_narrative ?? outcomeNarrative(avgScore)
  const riskColumnOrder: ("give" | "correct")[] = avgScore < 52 ? ["give", "correct"] : ["correct", "give"]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="bg-gradient-to-r from-[var(--ethicare-teal)] to-[var(--ethicare-teal-light)] p-8 rounded-t-3xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white">{debriefTitle}</h2>
              <p className="text-white/80">{caseData.title}</p>
              {branch?.headline ? (
                <p className="text-white/90 text-sm font-semibold mt-2 border-l-4 border-[var(--ethicare-orange)] pl-3">
                  {branch.headline}
                </p>
              ) : null}
              {grade ? <p className="text-white/70 text-sm mt-1">{grade}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            {[
              { key: "autonomy", label: "Autonomy", color: "#58D8C8" },
              { key: "beneficence", label: "Beneficence", color: "#5EE6A8" },
              { key: "nonMal", label: "Non-mal.", color: "#F7A35C" },
              { key: "justice", label: "Justice", color: "#6B9FE8" },
            ].map(({ key, label, color }) => (
              <div key={key} className="bg-white/15 rounded-2xl p-4 text-center">
                <div className="text-3xl font-extrabold text-white mb-1">
                  {finalScores[key as keyof Scores]}
                </div>
                <div className="text-xs text-white/70 font-semibold">{label}</div>
                <div className="h-1.5 bg-white/20 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${finalScores[key as keyof Scores]}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8">
          <div className="flex items-center gap-6 mb-8 p-6 bg-[#F8FAFC] rounded-2xl border border-[#E5E7EB]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--ethicare-autonomy)] to-[var(--ethicare-beneficence)] flex items-center justify-center">
              <span className="text-3xl font-extrabold text-white">{avgScore}%</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1B3A4D] mb-1">Overall Ethics Score</h3>
              <p className="text-sm text-[#5C7483]">
                {avgScore >= 80
                  ? "Excellent ethical decision-making!"
                  : avgScore >= 60
                    ? "Good ethical awareness with room for improvement."
                    : "Consider reviewing the ethical principles for this scenario."}
              </p>
            </div>
          </div>

          {principlesResolved.length > 0 ? (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-[var(--ethicare-blue)]" />
                <h3 className="text-lg font-bold text-[#1B3A4D]">Dr. Ethics Analysis</h3>
              </div>
              <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
                Each row uses your final four-axis scores (with honesty / integrity / legal risk inferred where the
                case lists them).
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {principlesResolved.map((row) => {
                  const st = verdictStyle(row.verdict)
                  return (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-3 p-4 rounded-xl border"
                      style={{ backgroundColor: st.bg, borderColor: st.border }}
                    >
                      <span className="text-sm font-bold text-[#1B3A4D]">{row.label}</span>
                      <span
                        className="text-[11px] font-extrabold uppercase text-right max-w-[min(200px,55%)] leading-snug shrink-0"
                        style={{ color: st.text }}
                      >
                        {row.verdict}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-[var(--ethicare-teal)]" />
              <h3 className="text-lg font-bold text-[#1B3A4D]">Case Summary</h3>
            </div>
            <p className="text-[#5C7483] leading-relaxed">{summary}</p>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-[var(--ethicare-orange)]" />
              <h3 className="text-lg font-bold text-[#1B3A4D]">Key Learning Points</h3>
            </div>
            <div className="space-y-3">
              {points.map((point, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-4 bg-[#F0FDF4] rounded-xl border border-[#BBF7D0]"
                >
                  <CheckCircle className="w-5 h-5 text-[#22C55E] mt-0.5 shrink-0" />
                  <p className="text-sm text-[#166534]">{point}</p>
                </div>
              ))}
            </div>
          </div>

          {riskMatrix ? (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-[#EF4444]" />
                <h3 className="text-lg font-bold text-[#1B3A4D]">Risk vs. safe path</h3>
              </div>
              <p className="text-sm text-[#475569] mb-4 p-4 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] leading-relaxed">
                {narrative}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {riskColumnOrder.map((k) => {
                  const col = riskMatrix[k]
                  if (!col) return null
                  return (
                    <div
                      key={k}
                      className="rounded-2xl border-2 p-5"
                      style={{ borderColor: col.color, background: `${col.color}10` }}
                    >
                      <div
                        className="text-xs font-extrabold uppercase tracking-wider mb-1"
                        style={{ color: col.color }}
                      >
                        {col.level}
                      </div>
                      <div className="font-bold text-[#1B3A4D] mb-2">{col.label}</div>
                      <p className="text-sm text-[#5C7483] leading-relaxed">{col.consequence}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {caseData.law ? (
            <div className="mb-8">
              <LawPanel law={caseData.law} />
            </div>
          ) : null}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onRestart}
              className="flex-1 py-4 rounded-2xl border-2 border-[#E5E7EB] text-[#5C7483] font-bold text-sm hover:bg-[#F8FAFC] transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Case
            </button>
            <button
              type="button"
              onClick={onBackToLibrary}
              className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[var(--ethicare-orange)] to-[var(--ethicare-orange-dark)] text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              Back to Library
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EthiCarePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseId = searchParams.get("case")

  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [caseLoading, setCaseLoading] = useState(true)
  const [caseError, setCaseError] = useState<string | null>(null)

  const [stepIdx, setStepIdx] = useState(0)
  const [scores, setScores] = useState<Scores>({
    autonomy: 50,
    beneficence: 50,
    nonMal: 50,
    justice: 50,
  })
  const [emo, setEmo] = useState<Emotions>({
    fear: 50,
    trust: 50,
    pain: 50,
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; delta: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [secs, setSecs] = useState(INITIAL_SESSION_SECONDS)
  const [notes, setNotes] = useState("")
  const [showDebrief, setShowDebrief] = useState(false)
  const [debrief, setDebrief] = useState<DebriefResponse | null>(null)
  const [playId, setPlayId] = useState<string | null>(null)
  const [nextStepId, setNextStepId] = useState<string | null>(null)
  const [isFinalStep, setIsFinalStep] = useState(false)
  const [runEndingKey, setRunEndingKey] = useState<string | null>(null)
  const [simPaused, setSimPaused] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [instructorBanner, setInstructorBanner] = useState<{ text: string } | null>(null)
  const [complicationModalOpen, setComplicationModalOpen] = useState(false)
  const [principleFlashTick, setPrincipleFlashTick] = useState(0)
  const [lastPrincipleDelta, setLastPrincipleDelta] = useState<Record<string, number> | null>(null)
  /**
   * Certificate case: last patient clip URL for idle between steps (avoids snapping back to intro
   * after step 1). Updated on each successful decision.
   */
  const [certPatientHoldUrl, setCertPatientHoldUrl] = useState<string | null>(null)
  const certHoldSnapshotBeforeSubmitRef = useRef<string | null>(null)
  /** Certificate case: wait 3s on each open patient line before playing clip (intro / next-step lines). Reactions after submit play as soon as the patient speaks. */
  const [certPreSubmitPatientClipAllowed, setCertPreSubmitPatientClipAllowed] = useState(false)

  useEffect(() => {
    if (showDebrief || simPaused) return
    const t = setInterval(() => {
      setSecs((s) => s + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [showDebrief, simPaused])

  useEffect(() => {
    let cancelled = false

    async function loadCase() {
      if (!caseId) {
        setCaseError("Missing case id in URL")
        setCaseLoading(false)
        return
      }

      try {
        setCaseLoading(true)
        setCaseError(null)

        const r = await fetch(`${BASE}/cases/${encodeURIComponent(caseId)}`)
        if (!r.ok) {
          throw new Error(r.status === 404 ? "Case not found" : `HTTP ${r.status}`)
        }

        const data: CaseData = await r.json()
        let nextPlayId: string | null = null
        try {
          const sr = await fetch(`${BASE}/cases/${encodeURIComponent(caseId)}/start`, {
            method: "POST",
          })
          if (sr.ok) {
            const started = (await sr.json()) as StartCaseResponse
            nextPlayId = started.play_id ?? null
          }
        } catch {
          nextPlayId = null
        }
        if (cancelled) return

        setCaseData(data)
        setPlayId(nextPlayId)
        setStepIdx(0)
        setScores(data.initScores)
        setEmo(data.initEmo)
        setMessages(
          data.steps?.length
            ? [{ role: "patient", text: data.steps[0].msg, time: fmt(INITIAL_SESSION_SECONDS) }]
            : []
        )
        setSelected(null)
        setSubmitted(false)
        setFeedback(null)
        setLoading(false)
        setSecs(INITIAL_SESSION_SECONDS)
        setNotes("")
        setShowDebrief(false)
        setDebrief(null)
        setNextStepId(null)
        setIsFinalStep(false)
        setRunEndingKey(null)
        setSimPaused(false)
        setInstructorBanner(null)
        setComplicationModalOpen(false)
        setShowHelp(false)
        setPrincipleFlashTick(0)
        setLastPrincipleDelta(null)
        setCertPatientHoldUrl(null)
      } catch (err) {
        if (!cancelled) {
          setCaseError(err instanceof Error ? err.message : "Failed to load case")
        }
      } finally {
        if (!cancelled) setCaseLoading(false)
      }
    }

    loadCase()

    return () => {
      cancelled = true
    }
  }, [caseId])

  const step = useMemo(() => {
    if (!caseData) return null
    return caseData.steps[stepIdx] ?? null
  }, [caseData, stepIdx])

  const clinicianLabel = caseData?.category === "Research Ethics" ? "Student doctor" : "Doctor"
  const isResearchCase = caseData?.category === "Research Ethics"
  const isCertificateCase = caseData?.id === "case_cert"

  const latestMessage = useMemo(() => {
    return messages.length ? messages[messages.length - 1] : null
  }, [messages])

  /** Only after the last step’s decision is submitted does “View Debrief” apply (avoids skipping the final choice). */
  const actualIsFinal = submitted && isFinalStep

  const activeSpeaker = latestMessage?.role ?? "patient"
  const ambientTension = activeSpeaker === "interruption"
  const patientSpeaking = !ambientTension && activeSpeaker === "patient"
  const doctorSpeaking = !ambientTension && activeSpeaker === "doctor"

  useEffect(() => {
    if (!isCertificateCase || simPaused) return
    if (submitted) {
      setCertPreSubmitPatientClipAllowed(activeSpeaker === "patient")
      return
    }
    if (activeSpeaker !== "patient") {
      setCertPreSubmitPatientClipAllowed(false)
      return
    }
    setCertPreSubmitPatientClipAllowed(false)
    const t = setTimeout(() => setCertPreSubmitPatientClipAllowed(true), CERT_PATIENT_INTRO_DELAY_MS)
    return () => clearTimeout(t)
  }, [isCertificateCase, simPaused, submitted, activeSpeaker, stepIdx])

  const selectedChoice = selected && step ? step.choices.find((c) => c.id === selected) ?? null : null

  function variantIndexForChoiceId(choiceId: string | null): number {
    if (!choiceId) return 1
    return 1 + (choiceId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 3)
  }

  const variantIdx = variantIndexForChoiceId(selected)

  function doctorVideoForChoice(choice: Choice | null): string {
    if (!choice) return DEFAULT_DOCTOR_VIDEO_URL

    const ending = choice.ending_key ?? null
    if (ending === "bad_certificate") {
      const variants = ["/media/Docunwell1.mp4", "/media/DocHelp22.mp4", "/media/alrightdoc.mp4"] as const
      return variants[(variantIdx - 1) % variants.length]
    }
    if (ending === "bad_communication") {
      const variants = ["/media/Docno11.mp4", "/media/canthelpdoc.mp4", "/media/docno3.mp4"] as const
      return variants[(variantIdx - 1) % variants.length]
    }
    if (ending === "good") return "/media/dochonest.mp4"

    // Continuation (no terminal ending_key yet) usually means "examine first" or "honest letter".
    const reactionLower = choice.reaction.toLowerCase()
    if (reactionLower.includes("letter")) return "/media/DocHelp22.mp4"
    if (choice.optimal) return "/media/newdocexplain.mp4"

    return DEFAULT_DOCTOR_VIDEO_URL
  }

  function patientVideoForChoice(choice: Choice | null, variantChoiceId: string | null = null): string {
    if (!choice) return DEFAULT_PATIENT_VIDEO_URL

    const vIdx = variantIndexForChoiceId(variantChoiceId ?? choice.id)
    const ending = choice.ending_key ?? null
    if (ending === "bad_certificate") return `/media/ysf_thanks${vIdx}.mp4`
    if (ending === "bad_communication") return `/media/ysf_no${vIdx}.mp4`
    if (ending === "good") return `/media/ysf_good.mp4`

    const reactionLower = choice.reaction.toLowerCase()
    if (reactionLower.includes("letter")) return `/media/ysf_letter.mp4`
    if (choice.optimal) return `/media/ysf_explain.mp4`

    return DEFAULT_PATIENT_VIDEO_URL
  }

  // Doctor video is intentionally disabled; keep default non-video doctor figure.
  const doctorDemoVideoUrl = undefined
  /**
   * Certificate: reaction clip while patient is speaking after submit; otherwise last hold clip
   * (or intro if nothing played yet).
   */
  const patientDemoVideoUrl = isCertificateCase
    ? submitted && activeSpeaker === "patient"
      ? patientVideoForChoice(selectedChoice, selected)
      : certPatientHoldUrl ?? DEFAULT_PATIENT_VIDEO_URL
    : undefined

  const certificatePatientVideoPlaying =
    isCertificateCase &&
    Boolean(patientDemoVideoUrl) &&
    !simPaused &&
    activeSpeaker === "patient" &&
    (submitted || certPreSubmitPatientClipAllowed)

  const certificateSubtitle = useMemo(() => {
    if (!isCertificateCase || !step || !patientDemoVideoUrl) return null
    return resolveCertificatePatientSubtitle({
      submitted,
      activeSpeaker,
      stepId: step.id,
      selectedChoice,
      patientVideoUrl: patientDemoVideoUrl,
      defaultPatientVideoUrl: DEFAULT_PATIENT_VIDEO_URL,
    })
  }, [isCertificateCase, step, patientDemoVideoUrl, submitted, activeSpeaker, selectedChoice])

  const complicationCards = caseData?.complications ?? []

  function openComplicationModal() {
    if (!caseData || simPaused) return
    if (complicationCards.length === 0) return
    setComplicationModalOpen(true)
  }

  function handleInjectComplication(card: ComplicationCard) {
    if (!caseData) return
    setMessages((prev) => [
      ...prev,
      {
        role: "interruption",
        text: card.liveLine,
        time: fmt(secs),
        interruptionLabel: card.channelLabel,
      },
    ])
    setEmo((e) => ({
      fear: Math.min(100, Math.max(0, e.fear + card.fear)),
      trust: Math.min(100, Math.max(0, e.trust + card.trust)),
      pain: Math.min(100, Math.max(0, e.pain + card.pain)),
    }))
    setNotes(
      (n) => (n ? `${n}\n\n` : "") + `[Complication — ${card.title}] ${card.premise}`
    )
    setComplicationModalOpen(false)
  }

  function handleRevealLabResults() {
    if (!caseData) return
    const research = caseData.category === "Research Ethics"
    const text = research
      ? "Simulated chart review: clinically stable for discussion. No result replaces valid informed consent or removes vulnerability / coercion concerns."
      : "Simulated note: after examination, you would document objective findings. Ethical judgment here still hinges on honesty, limits of certification, and what you personally observed."
    setInstructorBanner({ text })
  }

  async function handleSubmit() {
    if (simPaused) return
    if (!caseData || !step || !selected || submitted || loading) return

    setSubmitted(true)
    setFeedback(null)

    const choice = step.choices.find((c) => c.id === selected)
    if (!choice) {
      setSubmitted(false)
      return
    }

    if (caseData.id === "case_cert") {
      certHoldSnapshotBeforeSubmitRef.current = certPatientHoldUrl
      setCertPatientHoldUrl(patientVideoForChoice(choice, choice.id))
    }

    setMessages((prev) => [
      ...prev,
      { role: "doctor", text: choice.label, time: fmt(secs + 12) },
    ])
    setLoading(true)

    let certDecisionSucceeded = false
    try {
      const r = await fetch(`${BASE}/cases/${encodeURIComponent(caseData.id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          play_id: playId ?? undefined,
          step_id: step.id,
          choice_id: selected,
          current_scores: scores,
          current_emo: emo,
        }),
      })

      if (!r.ok) {
        throw new Error(`Decision request failed (${r.status})`)
      }

      const data: DecisionResponse = await r.json()

      setScores(data.updated_scores)
      setEmo(data.updated_emo)
      setFeedback({
        text: data.dr_ethics_feedback,
        delta: data.score_delta,
      })
      setNextStepId(data.next_step_id)
      setIsFinalStep(data.is_final)
      setRunEndingKey(data.ending_key ?? null)
      setLastPrincipleDelta(data.score_delta)
      setPrincipleFlashTick((t) => t + 1)

      certDecisionSucceeded = true

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "patient", text: data.patient_reaction, time: fmt(secs + 24) },
        ])
      }, 500)
    } catch (err) {
      if (caseData.id === "case_cert") {
        setCertPatientHoldUrl(certHoldSnapshotBeforeSubmitRef.current)
        certHoldSnapshotBeforeSubmitRef.current = null
      }
      setSubmitted(false)
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.role === "doctor") return prev.slice(0, -1)
        return prev
      })
      setFeedback({
        text: err instanceof Error ? err.message : "Failed to process decision.",
        delta: {},
      })
    } finally {
      setLoading(false)
      if (caseData.id === "case_cert" && certDecisionSucceeded) {
        certHoldSnapshotBeforeSubmitRef.current = null
      }
    }
  }

  async function fetchDebrief(currentScores: Scores) {
    if (!caseData) return

    const qs = playId
      ? new URLSearchParams({ play_id: playId })
      : new URLSearchParams({
          autonomy: String(currentScores.autonomy),
          beneficence: String(currentScores.beneficence),
          nonMal: String(currentScores.nonMal),
          justice: String(currentScores.justice),
        })

    const r = await fetch(`${BASE}/cases/${encodeURIComponent(caseData.id)}/debrief?${qs.toString()}`)
    if (!r.ok) throw new Error(`Debrief request failed (${r.status})`)

    const data: DebriefResponse = await r.json()
    setDebrief(data)
    setShowDebrief(true)
  }

  async function handleNext() {
    if (simPaused) return
    if (!caseData) return
    if (!submitted || !feedback) return

    if (actualIsFinal) {
      try {
        await fetchDebrief(scores)
      } catch {
        setShowDebrief(true)
      }
      return
    }

    const nextIndex = caseData.steps.findIndex((s) => s.id === nextStepId)
    const resolvedNextIndex = nextIndex >= 0 ? nextIndex : stepIdx + 1
    const next = caseData.steps[resolvedNextIndex]

    setStepIdx(resolvedNextIndex)
    setSelected(null)
    setSubmitted(false)
    setFeedback(null)
    setNextStepId(null)
    setIsFinalStep(false)

    if (next) {
      setMessages((prev) => [
        ...prev,
        { role: "patient", text: next.msg, time: fmt(secs + 30) },
      ])
    }
  }

  function handleRestart() {
    if (!caseData) return

    setShowDebrief(false)
    setDebrief(null)
    setStepIdx(0)
    setScores(caseData.initScores)
    setEmo(caseData.initEmo)
    setMessages(
      caseData.steps?.length
        ? [{ role: "patient", text: caseData.steps[0].msg, time: fmt(INITIAL_SESSION_SECONDS) }]
        : []
    )
    setSelected(null)
    setSubmitted(false)
    setFeedback(null)
    setLoading(false)
    setSecs(INITIAL_SESSION_SECONDS)
    setNotes("")
    setNextStepId(null)
    setIsFinalStep(false)
    setRunEndingKey(null)
    setSimPaused(false)
    setInstructorBanner(null)
    setComplicationModalOpen(false)
    setPrincipleFlashTick(0)
    setLastPrincipleDelta(null)
    setCertPatientHoldUrl(null)
    // Refresh authoritative server-side play session for this new run.
    void fetch(`${BASE}/cases/${encodeURIComponent(caseData.id)}/start`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPlayId((d as StartCaseResponse | null)?.play_id ?? null))
      .catch(() => setPlayId(null))
  }

  function handleNextCase() {
    router.push("/cases")
  }

  if (caseLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)" }}
      >
        <div className="bg-white/90 rounded-3xl px-8 py-6 shadow-xl border border-white/60">
          <p className="text-[#1B3A4D] font-bold">Loading case...</p>
        </div>
      </div>
    )
  }

  if (caseError || !caseData || !step) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)" }}
      >
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center border border-red-100">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-extrabold text-[#1B3A4D] mb-2">Unable to load case</h2>
          <p className="text-sm text-[#5C7483] mb-6">{caseError ?? "Case not found."}</p>
          <button
            onClick={() => router.push("/cases")}
            className="px-5 py-3 rounded-2xl bg-[var(--ethicare-teal)] text-white font-bold"
          >
            Back to Library
          </button>
        </div>
      </div>
    )
  }

  if (showDebrief && caseData) {
    return (
      <CaseDebriefModal
        caseData={caseData}
        debrief={debrief}
        scores={scores}
        endingKey={runEndingKey}
        onRestart={handleRestart}
        onBackToLibrary={handleNextCase}
      />
    )
  }

  return (
    <>
    <div
      className="min-h-screen p-4"
      style={{
        background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)",
      }}
    >
      <div className="h-[calc(100vh-32px)] flex flex-col rounded-[32px] overflow-hidden bg-white/40 backdrop-blur-sm border border-white/60 shadow-2xl">
        <header className="flex items-center px-6 py-4 bg-[var(--ethicare-teal)] shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl pr-2 -ml-1 hover:bg-white/10 transition-colors"
            title="Home"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-6 h-6 text-white"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M12 2L12 6M12 18L12 22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12L6 12M18 12L22 12M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span className="text-white font-extrabold text-xl tracking-tight">ETHICARE</span>
          </Link>

          <div className="h-6 w-px bg-white/20 mx-4" />

          <span className="text-white/90 font-semibold text-sm">
            Step {stepIdx + 1}/{caseData.steps.length}
          </span>
          <span className="text-white/45 text-xs font-medium ml-1.5 tabular-nums">{caseData.num}</span>

          <div
            className="ml-3 px-4 py-1.5 rounded-full text-white text-xs font-semibold border border-white/25"
            style={{
              background: caseData.categoryColor ? `${caseData.categoryColor}33` : "rgba(255,255,255,0.18)",
              borderColor: caseData.categoryColor ? `${caseData.categoryColor}88` : undefined,
            }}
          >
            {caseData.category}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 text-white/90 font-semibold">
              <Clock className="w-4 h-4" />
              {fmt(secs)}
            </div>

            <Link
              href="/live-mode"
              className="flex items-center justify-center w-9 h-9 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="Live Mode designer"
              aria-label="Open Live Mode designer"
            >
              <Radio className="w-4 h-4" />
            </Link>

            <Link
              href="/cases"
              className="flex items-center justify-center w-9 h-9 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              title="Case library"
              aria-label="Open case library"
            >
              <User className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-3 bg-white/15 rounded-full pl-2 pr-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--ethicare-orange)] to-[var(--ethicare-orange-dark)] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <rect x="5" y="6" width="14" height="12" rx="2" fill="#1B6B7D" />
                  <circle cx="9" cy="11" r="1.5" fill="white" />
                  <circle cx="15" cy="11" r="1.5" fill="white" />
                  <rect x="9" y="14" width="6" height="1" rx="0.5" fill="#58D8C8" />
                </svg>
              </div>
              <span className="text-white font-semibold text-sm pr-1">Dr. Ethics</span>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="w-8 h-8 rounded-lg bg-[var(--ethicare-autonomy)] flex items-center justify-center hover:brightness-110 transition-all"
                title="Shortcuts & help"
                aria-label="Shortcuts and help"
              >
                <HelpCircle className="w-4 h-4 text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex gap-4 p-4 min-h-0">
          <Sidebar
            caseData={caseData}
            stepIdx={stepIdx}
            submitted={submitted}
            simulationComplete={submitted && isFinalStep}
            feedbackText={feedback?.text}
            paused={simPaused}
            onTogglePause={() => setSimPaused((p) => !p)}
          />

          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div
              className="flex flex-col flex-1 min-h-0 rounded-[32px] overflow-hidden relative"
              style={{
                background: `
                  radial-gradient(ellipse 90% 55% at 50% 28%, rgba(255,255,255,0.5), transparent 55%),
                  radial-gradient(ellipse 70% 45% at 20% 80%, rgba(88,216,200,0.12), transparent 50%),
                  radial-gradient(ellipse 65% 50% at 85% 75%, rgba(245,158,11,0.08), transparent 50%),
                  linear-gradient(180deg, #E8F2F5 0%, #D4E4E9 42%, #B9CCD4 100%)
                `,
              }}
            >
              {instructorBanner ? (
                <div
                  className="absolute top-[200px] left-8 right-8 z-[25] rounded-2xl border px-4 py-3 shadow-lg flex gap-3 items-start bg-sky-50 border-sky-200"
                >
                  <p className="flex-1 text-sm text-[#1B3A4D] leading-relaxed">{instructorBanner.text}</p>
                  <button
                    type="button"
                    className="text-xs font-bold text-[#64748B] hover:text-[#1B3A4D] shrink-0 px-2 py-1 rounded-lg hover:bg-black/5"
                    onClick={() => setInstructorBanner(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              <div className="shrink-0 z-20 px-8 pt-5 pb-2">
                <div
                  className={`rounded-[32px] px-10 py-6 border ${isResearchCase ? "border-b-[3px] border-b-[var(--ethicare-orange)]" : ""}`}
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    borderColor: "rgba(255,255,255,0.65)",
                    boxShadow: "0 14px 40px rgba(22, 52, 64, 0.12)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <h1 className="text-[20px] font-extrabold text-[#1B5870]">
                    {caseData.title}
                    {isResearchCase ? (
                      <span className="text-[13px] font-semibold text-[#64748B] ml-2">(International trial)</span>
                    ) : null}
                  </h1>
                  <p className="text-[15px] text-[#4F6675] mt-1">
                    {caseData.patient.name}, {caseData.patient.age} years old —{" "}
                    <span className="text-[var(--ethicare-orange)] font-extrabold">
                      {caseData.patient.condition}
                    </span>
                  </p>
                  <p className="text-[13px] text-[#5C7483] mt-3 leading-relaxed border-t border-[#E2E8F0] pt-3">
                    {caseData.desc}
                  </p>
                </div>
              </div>

              {/* Stage: fills remaining height; avatars cannot bleed into the decision row below */}
              <div className="relative flex-1 min-h-0 min-w-0 z-10 overflow-hidden pointer-events-none">
                <div
                  className={`absolute inset-0 pointer-events-none bg-gradient-to-b from-white/8 via-transparent to-[rgba(16,47,61,0.14)] ${
                    isResearchCase ? "ring-1 ring-inset ring-[var(--ethicare-orange)]/25" : ""
                  }`}
                />

                <ConsultationScene
                  doctorSpeaking={doctorSpeaking}
                  patientSpeaking={patientSpeaking}
                  ambientTension={ambientTension}
                  doctorDemoVideoUrl={doctorDemoVideoUrl}
                  patientDemoVideoUrl={patientDemoVideoUrl}
                  patientVideoInteractive={isCertificateCase && Boolean(patientDemoVideoUrl)}
                  patientVideoPlaying={certificatePatientVideoPlaying}
                  patientVideoMuted={false}
                  patientVideoLoop={false}
                  certificateSoloLayout={isCertificateCase && Boolean(patientDemoVideoUrl)}
                  patientVideoMountKey={
                    isCertificateCase && patientDemoVideoUrl
                      ? `${patientDemoVideoUrl}|s:${submitted ? 1 : 0}|${activeSpeaker}`
                      : undefined
                  }
                />

                <div
                  className={`absolute left-[13%] bottom-[14%] h-[34%] w-[17%] rounded-full blur-3xl transition-opacity duration-500 ${
                    doctorSpeaking ? "opacity-35" : "opacity-0"
                  }`}
                  style={{ background: "rgba(88,216,200,0.45)" }}
                />
                <div
                  className={`absolute right-[11%] bottom-[14%] h-[36%] w-[20%] rounded-full blur-3xl transition-opacity duration-500 ${
                    patientSpeaking ? "opacity-30" : "opacity-0"
                  }`}
                  style={{ background: "rgba(247,163,92,0.38)" }}
                />

                {certificateSubtitle ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[21] flex flex-col justify-end"
                    aria-live="polite"
                  >
                    <div
                      className="w-full px-4 pb-4 pt-14 sm:px-6 sm:pb-5 sm:pt-16"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(6,12,18,0.94) 0%, rgba(6,12,18,0.78) 38%, rgba(6,12,18,0.35) 62%, transparent 100%)",
                      }}
                    >
                      <p
                        className="mx-auto max-w-[min(36rem,100%)] whitespace-pre-line text-center text-[11px] font-medium leading-relaxed text-white/95 sm:text-[13px]"
                        style={{
                          textShadow:
                            "0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)",
                        }}
                      >
                        {certificateSubtitle}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
                  <div className="w-[min(640px,88%)]">
                    <ChatPanel
                      message={
                        isCertificateCase &&
                        latestMessage?.role === "patient" &&
                        certificateSubtitle
                          ? null
                          : latestMessage
                      }
                      patientName={caseData.patient.name}
                      clinicianLabel={clinicianLabel}
                    />
                  </div>
                </div>
              </div>

              <div className="shrink-0 z-40 px-5 pt-2 pb-5 relative">
                <DecisionCards
                  step={step}
                  selected={selected}
                  onSelect={setSelected}
                  submitted={submitted}
                  feedback={feedback}
                  evaluating={loading}
                  onSubmit={handleSubmit}
                  onNext={handleNext}
                  isFinal={actualIsFinal}
                />
              </div>

              {simPaused ? (
                <div className="absolute inset-0 z-[45] flex items-center justify-center rounded-[32px] bg-[rgba(15,52,64,0.4)] backdrop-blur-[3px]">
                  <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 max-w-sm text-center border border-[#E2E8F0] mx-4">
                    <p className="font-extrabold text-[#1B3A4D] mb-1">Simulation paused</p>
                    <p className="text-sm text-[#64748B] mb-5 leading-relaxed">
                      Session timer is frozen. Submit and Next Step are disabled until you resume.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSimPaused(false)}
                      className="w-full py-3 rounded-xl bg-[var(--ethicare-teal)] text-white font-bold text-sm hover:opacity-95 transition-opacity"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="w-[300px] xl:w-[320px] shrink-0 flex flex-col gap-3 overflow-y-auto min-h-0">
            <EthicsPanel
              scores={scores}
              principleFlashTick={principleFlashTick}
              lastPrincipleDelta={lastPrincipleDelta}
            />
            <DrEthicsPanel
              emo={emo}
              notes={notes}
              onNoteChange={setNotes}
              onComplication={openComplicationModal}
              complicationsAvailable={complicationCards.length > 0}
              onLabResults={handleRevealLabResults}
              onNextStep={handleNext}
              canAdvance={submitted && !!feedback && !loading && !simPaused}
            />
          </div>
        </div>
      </div>
    </div>

    {showHelp ? (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ethicare-help-title"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <h2 id="ethicare-help-title" className="font-extrabold text-[#1B3A4D]">
              Simulation help
            </h2>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B]"
              aria-label="Close help"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <ul className="px-5 py-4 text-sm text-[#475569] space-y-3 leading-relaxed">
            <li>
              <span className="font-semibold text-[#1B3A4D]">Pause</span> — Left sidebar freezes the timer and blocks
              decisions until you resume.
            </li>
            <li>
              <span className="font-semibold text-[#1B3A4D]">Instructor panel</span> — Add Complication opens case-specific
              live interventions (from the case library); Reveal Lab Results adds contextual clinical framing (does not
              replace ethics choices).
            </li>
            <li>
              <span className="font-semibold text-[#1B3A4D]">Next Step</span> — Matches the main decision panel: enabled
              after you submit and Dr. Ethics feedback appears.
            </li>
            <li>
              <span className="font-semibold text-[#1B3A4D]">User icon</span> — Opens the case library.{" "}
              <span className="font-semibold text-[#1B3A4D]">Logo</span> — Home menu.
            </li>
          </ul>
        </div>
      </div>
    ) : null}

    {caseData ? (
      <ComplicationModal
        open={complicationModalOpen}
        cards={complicationCards}
        caseTitle={caseData.title}
        onClose={() => setComplicationModalOpen(false)}
        onInject={handleInjectComplication}
      />
    ) : null}
    </>
  )
}