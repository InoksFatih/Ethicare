"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Cloud,
  BookMarked,
  Library,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Users,
  Zap,
  Pencil,
  User,
  MoreHorizontal,
  Check,
  Settings,
  LogOut,
  Home,
  Plus,
  Upload,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  Mic,
} from "lucide-react"

const STORAGE_KEY = "ethicare-live-mode-v2"
const LEGACY_STORAGE_KEY = "ethicare-live-mode-v1"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function httpErrorDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "Request failed"
  const d = (data as { detail?: unknown }).detail
  if (typeof d === "string") return d
  if (Array.isArray(d))
    return d.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : JSON.stringify(x))).join("; ")
  return "Request failed"
}

/** Mockup-aligned accent (teal primary actions) */
const TEAL = "#2A9D8F"
const TEAL_DIM = "rgba(42, 157, 143, 0.22)"
const NAVY_TOP = "#0F2840"
const NAVY_BOT = "#0A1E30"
const PAGE_BG = "#E8EDF2"
const CARD_RADIUS = "12px"

const SPECIALTIES = [
  "Oncology",
  "Cardiology",
  "Neurology",
  "Pediatrics",
  "Obstetrics & palliative care",
  "Psychiatry",
  "Emergency medicine",
  "Research ethics",
  "Other (custom)",
] as const

const ETHICAL_FOCUS = [
  "Announcing bad news",
  "Consent & information",
  "Treatment refusal",
  "Capacity & surrogate decisions",
  "Resource allocation / triage",
  "Truth-telling vs therapeutic privilege",
  "Confidentiality & disclosure",
  "Vulnerable populations",
  "End-of-life & goals of care",
  "Professional boundaries",
] as const

const LEARNER_LEVELS = [
  "Pre-clinical / early medical students",
  "Clinical-year medical students",
  "Residents & fellows",
  "Nursing & allied health",
  "Interprofessional teams (mixed level)",
  "Faculty development",
] as const

const PATIENT_TONES = [
  "varied (AI spreads affects across cards)",
  "distraught / flooding emotions",
  "stoic / minimized distress",
  "defensive / mistrustful of the system",
  "hopeful but anxious",
  "skeptical, detail-oriented",
  "fatigued, decision-wearied",
] as const

const DEFAULT_CLINICAL =
  "Female, 55, metastatic breast cancer — first discussion of progression on current line of therapy. Family in waiting room."

export type SessionBriefModel = {
  sessionTitle: string | null
  clinicalContextBullets: string[]
  facilitatorNote: string | null
}

export type ScenarioCardModel = {
  id: string
  name: string
  age: number
  breadcrumb: string
  patientProfileBullets: string[]
  psychBullets: string[]
  /** At most one card should use LAUNCH in the third slot; others use ⋯ */
  primaryLaunch: boolean
  /** Shown in the bottom simulation bar when this patient is selected */
  diagnosis?: string
  extension?: string
  openingLine?: string
  stakeholders?: string[]
  possibleTwist?: string
  debriefHooks?: string[]
  communicationBarrier?: string
}

type PersistedLiveMode = {
  v: 2
  scenarios: ScenarioCardModel[]
  specialty: (typeof SPECIALTIES)[number]
  specialtyCustom: string
  clinicalInput: string
  focus: Record<string, boolean>
  customEthicalTags: string
  scenarioCount: number
  difficulty: "intro" | "standard" | "advanced"
  learnerLevel: string
  patientTone: string
  simulationPacing: "briefing" | "standard" | "slow_deep"
  localeOrSetting: string
  customInstructions: string
  temperature: number
  sessionBrief: SessionBriefModel | null
  advancedOpen: boolean
  generated: boolean
  selectedId: string | null
}

function parseScenarioImport(raw: unknown): ScenarioCardModel | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id : `imported-${Date.now()}`
  const name = typeof o.name === "string" ? o.name : "Patient"
  const age = typeof o.age === "number" && o.age >= 0 ? Math.min(120, o.age) : 45
  const breadcrumb = typeof o.breadcrumb === "string" ? o.breadcrumb : "Custom › Scenario"
  const toLines = (x: unknown): string[] => {
    if (Array.isArray(x)) return x.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    if (typeof x === "string") return x.split("\n").map((l) => l.trim()).filter(Boolean)
    return ["Clinical details to be completed."]
  }
  const stakeholders = Array.isArray(o.stakeholders)
    ? o.stakeholders.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined
  const debriefHooks = Array.isArray(o.debriefHooks)
    ? o.debriefHooks.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined

  return {
    id,
    name,
    age,
    breadcrumb,
    patientProfileBullets: toLines(o.patientProfileBullets),
    psychBullets: toLines(o.psychBullets),
    primaryLaunch: o.primaryLaunch === true,
    diagnosis: typeof o.diagnosis === "string" ? o.diagnosis : undefined,
    extension: typeof o.extension === "string" ? o.extension : undefined,
    openingLine: typeof o.openingLine === "string" ? o.openingLine : undefined,
    stakeholders: stakeholders?.length ? stakeholders : undefined,
    possibleTwist: typeof o.possibleTwist === "string" ? o.possibleTwist : undefined,
    debriefHooks: debriefHooks?.length ? debriefHooks : undefined,
    communicationBarrier: typeof o.communicationBarrier === "string" ? o.communicationBarrier : undefined,
  }
}

function parseSessionBrief(raw: unknown): SessionBriefModel | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const title = o.sessionTitle
  const note = o.facilitatorNote
  const bullets = Array.isArray(o.clinicalContextBullets)
    ? o.clinicalContextBullets.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  if (!bullets.length && typeof title !== "string" && typeof note !== "string") return null
  return {
    sessionTitle: typeof title === "string" ? title : null,
    clinicalContextBullets: bullets.length ? bullets : [],
    facilitatorNote: typeof note === "string" ? note : null,
  }
}

const INITIAL_SCENARIOS: ScenarioCardModel[] = [
  {
    id: "maria",
    name: "Maria",
    age: 56,
    breadcrumb: "Breast cancer › Breast cancer",
    patientProfileBullets: [
      "Metastatic disease (hepatic and bone involvement).",
      "Anxious about prognosis and impact on her family.",
    ],
    psychBullets: [
      "Announcing bad news — pacing and empathy.",
      "Treatment refusal — explore values and capacity.",
    ],
    primaryLaunch: false,
  },
  {
    id: "claire",
    name: "Claire",
    age: 58,
    breadcrumb: "Breast cancer › Breast cancer",
    patientProfileBullets: [
      "Locally advanced disease; multidisciplinary discussion ongoing.",
      "Limited health literacy; spouse often present in clinic.",
    ],
    psychBullets: [
      "Consent & information — teach-back and shared decision aids.",
      "Announcing bad news — align disclosure with patient readiness.",
    ],
    primaryLaunch: false,
  },
  {
    id: "linda",
    name: "Linda",
    age: 54,
    breadcrumb: "Breast cancer › Breast cancer",
    patientProfileBullets: [
      "Metastatic breast cancer; emphasis on quality of life.",
      "Works in healthcare; prefers transparent, shared decisions.",
    ],
    psychBullets: [
      "Treatment refusal vs intensity — reconcile goals of care.",
      "Psychological support — acknowledge fear beneath composure.",
    ],
    primaryLaunch: true,
  },
]

function EthicareLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden>
      <path
        d="M20 34C12 28 6 22 6 15.5C6 11 9.5 8 13.5 8C16.2 8 18.4 9.3 20 11.2C21.6 9.3 23.8 8 26.5 8C30.5 8 34 11 34 15.5C34 22 28 28 20 34Z"
        stroke="white"
        strokeWidth="1.5"
        fill="rgba(255,255,255,0.12)"
      />
      <path d="M20 14v10M17 17h6M17 21h6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M14 16c1.5 2 2.5 3 3 4M26 16c-1.5 2-2.5 3-3 4"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="20" cy="11" r="2" fill="white" opacity="0.9" />
    </svg>
  )
}

export default function LiveModeDesignerPage() {
  const router = useRouter()
  const profileRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const [storageReady, setStorageReady] = useState(false)

  const [specialty, setSpecialty] = useState<(typeof SPECIALTIES)[number]>("Oncology")
  const [specialtyCustom, setSpecialtyCustom] = useState("")
  const [focus, setFocus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ETHICAL_FOCUS.map((k) => [k, k === "Announcing bad news" || k === "Consent & information" || k === "Treatment refusal"]))
  )
  const [customEthicalTags, setCustomEthicalTags] = useState("")
  const [clinicalInput, setClinicalInput] = useState(DEFAULT_CLINICAL)
  const [sessionBrief, setSessionBrief] = useState<SessionBriefModel | null>(null)
  const [scenarioCount, setScenarioCount] = useState(3)
  const [difficulty, setDifficulty] = useState<"intro" | "standard" | "advanced">("standard")
  const [learnerLevel, setLearnerLevel] = useState<string>(LEARNER_LEVELS[2]!)
  const [patientTone, setPatientTone] = useState<string>(PATIENT_TONES[0]!)
  const [simulationPacing, setSimulationPacing] = useState<"briefing" | "standard" | "slow_deep">("standard")
  const [localeOrSetting, setLocaleOrSetting] = useState("")
  const [customInstructions, setCustomInstructions] = useState("")
  const [temperature, setTemperature] = useState(0.72)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [openaiReady, setOpenaiReady] = useState<boolean | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioCardModel[]>(() =>
    INITIAL_SCENARIOS.map((s) => ({ ...s }))
  )

  const [structOpen, setStructOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({
    maria: true,
    claire: true,
    linda: true,
  })
  const [cardChecked, setCardChecked] = useState<Record<string, boolean>>({
    maria: true,
    claire: true,
    linda: true,
  })

  const [moreOpenId, setMoreOpenId] = useState<string | null>(null)

  const [modifyTargetId, setModifyTargetId] = useState<string | null>(null)
  const [modifyForm, setModifyForm] = useState({
    name: "",
    age: 0,
    breadcrumb: "",
    profileLines: "",
    psychLines: "",
    diagnosis: "",
    extension: "",
    openingLine: "",
    stakeholdersLines: "",
    possibleTwist: "",
    debriefHooksLines: "",
    communicationBarrier: "",
    primaryLaunch: false,
  })

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: "",
    age: 45,
    breadcrumb: "",
    profileLines: "",
    psychLines: "",
    diagnosis: "",
    extension: "",
    openingLine: "",
    stakeholdersLines: "",
    possibleTwist: "",
    debriefHooksLines: "",
    communicationBarrier: "",
    primaryLaunch: false,
  })

  const resolvedSpecialty = useCallback(() => {
    if (specialty === "Other (custom)" && specialtyCustom.trim()) return specialtyCustom.trim().slice(0, 120)
    return specialty
  }, [specialty, specialtyCustom])

  const openModify = useCallback((id: string) => {
    const s = scenarios.find((x) => x.id === id)
    if (!s) return
    setModifyForm({
      name: s.name,
      age: s.age,
      breadcrumb: s.breadcrumb,
      profileLines: s.patientProfileBullets.join("\n"),
      psychLines: s.psychBullets.join("\n"),
      diagnosis: s.diagnosis ?? "",
      extension: s.extension ?? "",
      openingLine: s.openingLine ?? "",
      stakeholdersLines: (s.stakeholders ?? []).join("\n"),
      possibleTwist: s.possibleTwist ?? "",
      debriefHooksLines: (s.debriefHooks ?? []).join("\n"),
      communicationBarrier: s.communicationBarrier ?? "",
      primaryLaunch: s.primaryLaunch,
    })
    setModifyTargetId(id)
    setMoreOpenId(null)
  }, [scenarios])

  const saveModify = useCallback(() => {
    if (!modifyTargetId) return
    const pl = modifyForm.primaryLaunch
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== modifyTargetId) {
          return pl ? { ...s, primaryLaunch: false } : s
        }
        return {
          ...s,
          name: modifyForm.name.trim() || s.name,
          age: Math.max(18, Math.min(120, modifyForm.age || s.age)),
          breadcrumb: modifyForm.breadcrumb.trim() || s.breadcrumb,
          patientProfileBullets: modifyForm.profileLines
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          psychBullets: modifyForm.psychLines
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          diagnosis: modifyForm.diagnosis.trim() || undefined,
          extension: modifyForm.extension.trim() || undefined,
          openingLine: modifyForm.openingLine.trim() || undefined,
          stakeholders: (() => {
            const st = modifyForm.stakeholdersLines
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
            return st.length ? st : undefined
          })(),
          possibleTwist: modifyForm.possibleTwist.trim() || undefined,
          debriefHooks: (() => {
            const h = modifyForm.debriefHooksLines
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
            return h.length ? h : undefined
          })(),
          communicationBarrier: modifyForm.communicationBarrier.trim() || undefined,
          primaryLaunch: pl,
        }
      })
    )
    setModifyTargetId(null)
  }, [modifyTargetId, modifyForm])

  const openAddScenario = useCallback(() => {
    setAddForm({
      name: "",
      age: 45,
      breadcrumb: `${resolvedSpecialty()} › Custom case`,
      profileLines: "Describe the patient’s clinical situation (one line per bullet).",
      psychLines: "Ethical or psychological themes (one line per bullet).",
      diagnosis: "",
      extension: "",
      openingLine: "",
      stakeholdersLines: "",
      possibleTwist: "",
      debriefHooksLines: "",
      communicationBarrier: "",
      primaryLaunch: scenarios.every((s) => !s.primaryLaunch),
    })
    setAddOpen(true)
  }, [resolvedSpecialty, scenarios])

  const saveAddScenario = useCallback(() => {
    const pl = addForm.primaryLaunch
    const id = `custom-${Date.now()}`
    const next: ScenarioCardModel = {
      id,
      name: addForm.name.trim() || "New patient",
      age: Math.max(18, Math.min(120, addForm.age || 45)),
      breadcrumb: addForm.breadcrumb.trim() || "Custom › Scenario",
      patientProfileBullets: addForm.profileLines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      psychBullets: addForm.psychLines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      primaryLaunch: pl,
      diagnosis: addForm.diagnosis.trim() || undefined,
      extension: addForm.extension.trim() || undefined,
      openingLine: addForm.openingLine.trim() || undefined,
      stakeholders: (() => {
        const st = addForm.stakeholdersLines
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
        return st.length ? st : undefined
      })(),
      possibleTwist: addForm.possibleTwist.trim() || undefined,
      debriefHooks: (() => {
        const h = addForm.debriefHooksLines
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
        return h.length ? h : undefined
      })(),
      communicationBarrier: addForm.communicationBarrier.trim() || undefined,
    }
    setScenarios((prev) => {
      const base = pl ? prev.map((s) => ({ ...s, primaryLaunch: false })) : prev
      return [...base, next]
    })
    setCardExpanded((x) => ({ ...x, [id]: true }))
    setCardChecked((x) => ({ ...x, [id]: true }))
    setSelectedId(id)
    setGenerated(true)
    setAddOpen(false)
  }, [addForm])

  const launchSimulation = useCallback(
    (id: string | null) => {
      const sid = id ?? selectedId
      const picked = sid ? scenarios.find((s) => s.id === sid) : null
      try {
        sessionStorage.setItem(
          "ethicare-live-scenario",
          JSON.stringify({
            specialty: resolvedSpecialty(),
            clinicalInput,
            focus,
            sessionBrief,
            scenario: picked ?? null,
            liveSettings: {
              difficulty,
              learnerLevel,
              patientTone,
              simulationPacing,
              localeOrSetting: localeOrSetting.trim() || null,
              customInstructions: customInstructions.trim() || null,
            },
            ts: Date.now(),
          })
        )
      } catch {
        /* ignore quota */
      }
      // Create a realtime Classroom session from the selected Live Mode scenario.
      // This makes "Launch" actually run a live session (QR + responses) instead of dropping into the case library.
      if (!picked) {
        router.push("/classroom")
        return
      }
      fetch(`${BASE}/live-mode/create-live-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialty: resolvedSpecialty(),
          clinical_input: clinicalInput,
          ethical_focus: ETHICAL_FOCUS.filter((k) => focus[k]),
          session_brief: sessionBrief,
          scenario: {
            ...picked,
            stakeholders: picked.stakeholders ?? [],
            debriefHooks: picked.debriefHooks ?? [],
          },
        }),
      })
        .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d })))
        .then(({ ok, status, d }) => {
          if (!ok) throw new Error((d && typeof d === "object" && "detail" in d ? String((d as any).detail) : null) || `HTTP ${status}`)
          const sessionId = (d as { session_id?: string }).session_id
          if (sessionId) router.push(`/live-session/${sessionId}`)
          else router.push("/live-mode")
        })
        .catch(() => {
          router.push("/live-mode")
        })
    },
    [
      router,
      scenarios,
      clinicalInput,
      focus,
      selectedId,
      resolvedSpecialty,
      sessionBrief,
      difficulty,
      learnerLevel,
      patientTone,
      simulationPacing,
      localeOrSetting,
      customInstructions,
    ]
  )

  const loadDemoScenarios = useCallback(() => {
    setGenerateError(null)
    setScenarios(INITIAL_SCENARIOS.map((s) => ({ ...s })))
    setGenerated(true)
    setSelectedId(null)
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setGenerateError(null)
    setSelectedId(null)
    const ethicalFocus = ETHICAL_FOCUS.filter((k) => focus[k])
    const tagParts = customEthicalTags
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12)
    try {
      const r = await fetch(`${BASE}/live-mode/generate-scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinical_input: clinicalInput,
          specialty: resolvedSpecialty(),
          ethical_focus: ethicalFocus,
          custom_ethical_tags: tagParts,
          scenario_count: scenarioCount,
          difficulty,
          learner_level: learnerLevel,
          patient_tone: patientTone,
          simulation_pacing: simulationPacing,
          locale_or_setting: localeOrSetting.trim() || null,
          custom_instructions: customInstructions.trim() || null,
          creative_seed: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          temperature,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(httpErrorDetail(data) || `HTTP ${r.status}`)
      }
      const brief = parseSessionBrief((data as { sessionBrief?: unknown }).sessionBrief)
      setSessionBrief(brief)
      const list = (data as { scenarios?: unknown }).scenarios
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error("Server returned no scenarios")
      }
      const next: ScenarioCardModel[] = []
      for (const item of list) {
        const s = parseScenarioImport(item)
        if (s) next.push(s)
      }
      if (next.length === 0) throw new Error("Could not parse scenario cards")
      setScenarios(next)
      setGenerated(true)
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }, [
    clinicalInput,
    resolvedSpecialty,
    focus,
    customEthicalTags,
    scenarioCount,
    difficulty,
    learnerLevel,
    patientTone,
    simulationPacing,
    localeOrSetting,
    customInstructions,
    temperature,
  ])

  const handleNewScenario = () => {
    setSpecialty("Oncology")
    setSpecialtyCustom("")
    setFocus(
      Object.fromEntries(
        ETHICAL_FOCUS.map((k) => [k, k === "Announcing bad news" || k === "Consent & information" || k === "Treatment refusal"])
      )
    )
    setCustomEthicalTags("")
    setClinicalInput(DEFAULT_CLINICAL)
    setSessionBrief(null)
    setScenarioCount(3)
    setDifficulty("standard")
    setLearnerLevel(LEARNER_LEVELS[2]!)
    setPatientTone(PATIENT_TONES[0]!)
    setSimulationPacing("standard")
    setLocaleOrSetting("")
    setCustomInstructions("")
    setTemperature(0.72)
    setAdvancedOpen(false)
    setGenerated(false)
    setSelectedId(null)
    setGenerateError(null)
    setScenarios(INITIAL_SCENARIOS.map((s) => ({ ...s })))
    setCardExpanded({ maria: true, claire: true, linda: true })
    setCardChecked({ maria: true, claire: true, linda: true })
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const selectedScenario = selectedId ? scenarios.find((s) => s.id === selectedId) : null

  const defaultDx = "Invasive breast carcinoma"
  const defaultExt = "Hepatic and bone metastases"

  const bottomSummary = selectedScenario
    ? `${selectedScenario.name}, ${selectedScenario.age} years old | Diagnosis: ${selectedScenario.diagnosis ?? defaultDx} | Extension: ${selectedScenario.extension ?? defaultExt}`
    : `Female, 55 years old | Diagnosis: ${defaultDx} | Extension: ${defaultExt}`

  const onImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        const s = parseScenarioImport(parsed)
        if (!s) return
        const unique: ScenarioCardModel = {
          ...s,
          id: `imported-${Date.now()}`,
          primaryLaunch: !!s.primaryLaunch,
        }
        setScenarios((prev) => {
          const base = unique.primaryLaunch ? prev.map((x) => ({ ...x, primaryLaunch: false })) : prev
          return [...base, unique]
        })
        setCardExpanded((x) => ({ ...x, [unique.id]: true }))
        setCardChecked((x) => ({ ...x, [unique.id]: true }))
        setSelectedId(unique.id)
        setGenerated(true)
      } catch {
        /* invalid file */
      }
    }
    reader.readAsText(file)
  }

  const deleteScenario = (id: string): boolean => {
    if (!window.confirm("Remove this scenario from your list?")) return false
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
    setMoreOpenId(null)
    return true
  }

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/live-mode/status`)
      .then((res) => res.json())
      .then((d: { openai_configured?: boolean }) => {
        if (!cancelled) setOpenaiReady(!!d.openai_configured)
      })
      .catch(() => {
        if (!cancelled) setOpenaiReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (profileRef.current && !profileRef.current.contains(t)) setProfileOpen(false)
    }
    document.addEventListener("click", onDoc)
    return () => document.removeEventListener("click", onDoc)
  }, [])

  useEffect(() => {
    if (!moreOpenId) return
    const close = (e: MouseEvent) => {
      const root = document.getElementById(`live-more-root-${moreOpenId}`)
      if (root && !root.contains(e.target as Node)) setMoreOpenId(null)
    }
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [moreOpenId])

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as Record<string, unknown>
      const ver = d.v
      const scen = d.scenarios
      if (!Array.isArray(scen) || scen.length === 0) return
      const parsed = scen
        .map((s) => parseScenarioImport(s))
        .filter((x): x is ScenarioCardModel => x != null)
      if (parsed.length === 0) return
      setScenarios(parsed)

      const spec = d.specialty
      if (typeof spec === "string") {
        if ((SPECIALTIES as readonly string[]).includes(spec)) {
          setSpecialty(spec as (typeof SPECIALTIES)[number])
        } else {
          setSpecialty("Other (custom)")
          setSpecialtyCustom(spec)
        }
      }

      if (typeof d.clinicalInput === "string") setClinicalInput(d.clinicalInput)
      if (d.focus && typeof d.focus === "object") {
        setFocus((f) => ({ ...f, ...(d.focus as Record<string, boolean>) }))
      }
      if (ver === 2) {
        if (typeof d.customEthicalTags === "string") setCustomEthicalTags(d.customEthicalTags)
        if (typeof d.scenarioCount === "number" && d.scenarioCount >= 1 && d.scenarioCount <= 5) {
          setScenarioCount(Math.floor(d.scenarioCount))
        }
        if (d.difficulty === "intro" || d.difficulty === "standard" || d.difficulty === "advanced") {
          setDifficulty(d.difficulty)
        }
        if (typeof d.learnerLevel === "string") setLearnerLevel(d.learnerLevel)
        if (typeof d.patientTone === "string") setPatientTone(d.patientTone)
        if (d.simulationPacing === "briefing" || d.simulationPacing === "standard" || d.simulationPacing === "slow_deep") {
          setSimulationPacing(d.simulationPacing)
        }
        if (typeof d.localeOrSetting === "string") setLocaleOrSetting(d.localeOrSetting)
        if (typeof d.customInstructions === "string") setCustomInstructions(d.customInstructions)
        if (typeof d.temperature === "number" && d.temperature >= 0.35 && d.temperature <= 1.15) {
          setTemperature(d.temperature)
        }
        if (typeof d.advancedOpen === "boolean") setAdvancedOpen(d.advancedOpen)
        const sb = parseSessionBrief(d.sessionBrief)
        if (sb) setSessionBrief(sb)
        if (typeof d.specialtyCustom === "string") setSpecialtyCustom(d.specialtyCustom)
      }

      if (typeof d.generated === "boolean") setGenerated(d.generated)
      if (typeof d.selectedId === "string" && parsed.some((s) => s.id === d.selectedId)) {
        setSelectedId(d.selectedId)
      }
    } catch {
      /* ignore corrupt storage */
    } finally {
      setStorageReady(true)
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try {
      const payload: PersistedLiveMode = {
        v: 2,
        scenarios,
        specialty,
        specialtyCustom,
        clinicalInput,
        focus,
        customEthicalTags,
        scenarioCount,
        difficulty,
        learnerLevel,
        patientTone,
        simulationPacing,
        localeOrSetting,
        customInstructions,
        temperature,
        sessionBrief,
        advancedOpen,
        generated,
        selectedId,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* quota */
    }
  }, [
    storageReady,
    scenarios,
    specialty,
    specialtyCustom,
    clinicalInput,
    focus,
    customEthicalTags,
    scenarioCount,
    difficulty,
    learnerLevel,
    patientTone,
    simulationPacing,
    localeOrSetting,
    customInstructions,
    temperature,
    sessionBrief,
    advancedOpen,
    generated,
    selectedId,
  ])

  useEffect(() => {
    setCardExpanded((prev) => {
      let changed = false
      const next = { ...prev }
      for (const s of scenarios) {
        if (next[s.id] === undefined) {
          next[s.id] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
    setCardChecked((prev) => {
      let changed = false
      const next = { ...prev }
      for (const s of scenarios) {
        if (next[s.id] === undefined) {
          next[s.id] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [scenarios])

  const toggleFocus = (k: string) => setFocus((f) => ({ ...f, [k]: !f[k] }))

  const duplicateScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id)
    if (!s) return
    const copy: ScenarioCardModel = {
      ...s,
      id: `${s.id}-copy-${Date.now()}`,
      name: `${s.name} (copy)`,
      primaryLaunch: false,
    }
    setScenarios((prev) => [...prev, copy])
    setMoreOpenId(null)
  }

  const exportScenarioJson = (id: string) => {
    const s = scenarios.find((x) => x.id === id)
    if (!s) return
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `ethicare-scenario-${s.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMoreOpenId(null)
  }

  const bottomSelect = () => {
    if (!generated) {
      handleGenerate()
      return
    }
    if (!selectedId) {
      setSelectedId(scenarios[0]?.id ?? null)
      return
    }
    const idx = scenarios.findIndex((s) => s.id === selectedId)
    const next = scenarios[(idx + 1) % scenarios.length]
    setSelectedId(next?.id ?? null)
  }

  return (
    <div className="h-[100dvh] flex overflow-hidden text-[#1B2B3A]" style={{ background: PAGE_BG }}>
      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside
        className="w-[238px] shrink-0 flex flex-col py-5 px-3 text-white/92"
        style={{
          background: `linear-gradient(180deg, ${NAVY_TOP} 0%, ${NAVY_BOT} 100%)`,
          boxShadow: "4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        <div className="flex items-center gap-3 px-2 mb-8">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)" }}
          >
            <EthicareLogoMark className="w-8 h-8" />
          </div>
          <span className="font-extrabold text-[15px] tracking-wide">ETHICARE</span>
        </div>

        <nav className="flex flex-col gap-0.5 text-[13px] font-semibold">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-white/55 hover:bg-white/5 hover:text-white/90 transition-colors"
          >
            <LayoutDashboard className="w-[18px] h-[18px] shrink-0 opacity-90" />
            Dashboard
          </Link>

          <div
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-white relative overflow-hidden"
            style={{
              background: TEAL_DIM,
              boxShadow: "inset 0 0 0 1px rgba(78,205,196,0.35), 0 0 24px rgba(42,157,143,0.25)",
            }}
          >
            <span
              className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full"
              style={{ background: "#4ECDC4" }}
            />
            <Cloud className="w-[18px] h-[18px] shrink-0 ml-1" style={{ color: "#7EDCD4" }} />
            Live Mode
          </div>

          <button
            type="button"
            onClick={() => setStructOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 w-full text-left text-white/55 hover:bg-white/5 hover:text-white/90 transition-colors"
          >
            <BookMarked className="w-[18px] h-[18px] shrink-0 opacity-90" />
            <span className="flex-1">Structured Scenarios</span>
            <ChevronRight
              className={`w-4 h-4 transition-transform shrink-0 ${structOpen ? "rotate-90" : ""}`}
            />
          </button>
          {structOpen && (
            <div className="ml-4 pl-3 border-l border-white/15 flex flex-col gap-0.5 mb-1">
              <Link href="/detective" className="py-1.5 text-[12px] text-white/65 hover:text-white">
                Detective mode
              </Link>
              <Link href="/cases" className="py-1.5 text-[12px] text-white/65 hover:text-white">
                Browse cases
              </Link>
            </div>
          )}

          <Link
            href="/cases"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-white/55 hover:bg-white/5 hover:text-white/90 transition-colors"
          >
            <Library className="w-[18px] h-[18px] shrink-0 opacity-90" />
            Case Library
          </Link>

          <button
            type="button"
            onClick={() => setAnalyticsOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 w-full text-left text-white/55 hover:bg-white/5 hover:text-white/90 transition-colors"
          >
            <BarChart3 className="w-[18px] h-[18px] shrink-0 opacity-90" />
            <span className="flex-1">Analytics</span>
            <ChevronRight
              className={`w-4 h-4 transition-transform shrink-0 ${analyticsOpen ? "rotate-90" : ""}`}
            />
          </button>
          {analyticsOpen && (
            <div className="ml-4 pl-3 border-l border-white/15 flex flex-col gap-0.5 mb-1">
              <Link href="/settings" className="py-1.5 text-[12px] text-white/65 hover:text-white">
                Session settings
              </Link>
              <span className="py-1.5 text-[12px] text-white/40">Reports (coming soon)</span>
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6 px-1">
          <div
            className="rounded-xl p-3.5 text-[11px] leading-relaxed"
            style={{
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="font-bold text-white/95 mb-1.5 text-[12px] line-clamp-2">
              {sessionBrief?.sessionTitle ?? "Live session"}
            </div>
            <div className="text-white/85 text-[11px] leading-snug line-clamp-2">
              {selectedScenario
                ? `${selectedScenario.name}, ${selectedScenario.age} · ${selectedScenario.diagnosis ?? "Clinical vignette"}`
                : `${clinicalInput.slice(0, 96)}${clinicalInput.length > 96 ? "…" : ""}`}
            </div>
            {(sessionBrief?.clinicalContextBullets?.[0] ?? selectedScenario?.extension) && (
              <div className="text-white/50 mt-1.5 text-[10px] leading-snug line-clamp-3 italic">
                {sessionBrief?.clinicalContextBullets?.[0] ?? selectedScenario?.extension}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header
          className="relative shrink-0 h-12 px-4 flex items-center border-b border-[#D5DDE6]"
          style={{ background: "#F0F3F7" }}
        >
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#64748B] hover:text-[#2A9D8F] shrink-0 w-[72px]"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
          <h2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[12px] sm:text-[13px] font-semibold text-[#475569] tracking-tight px-2 max-w-[min(100vw-12rem,36rem)]">
            Interactive Ethical Simulation Platform
          </h2>

          <div className="ml-auto shrink-0">
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-black/[0.04] transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: `linear-gradient(135deg, ${TEAL}, #1f7a70)` }}
                >
                  AT
                </div>
                <span className="hidden sm:inline text-[12px] font-semibold text-[#334155] max-w-[120px] truncate">
                  Dr. Allen Thomson
                </span>
                <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${profileOpen ? "rotate-180" : ""}`} />
              </button>
              {profileOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 py-1 rounded-xl border border-[#E2E8F0] bg-white shadow-lg z-50 text-[12px]"
                  style={{ boxShadow: "0 12px 40px rgba(15,23,42,0.12)" }}
                >
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 px-3 py-2 text-[#334155] hover:bg-[#F8FAFC]"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Settings
                  </Link>
                  <Link
                    href="/cases"
                    className="flex items-center gap-2 px-3 py-2 text-[#334155] hover:bg-[#F8FAFC]"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Library className="w-3.5 h-3.5" />
                    Case library
                  </Link>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-2 w-full text-left text-[#64748B] hover:bg-[#F8FAFC]"
                    onClick={() => {
                      setProfileOpen(false)
                      router.push("/")
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Exit to menu
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 px-4 py-5 lg:px-8 lg:py-6">
          <div className="max-w-[1280px] mx-auto space-y-5 pb-4">
            {/* Instructor card */}
            <section
              className="bg-white border border-[#DEE5ED] p-5 lg:p-6"
              style={{ borderRadius: CARD_RADIUS, boxShadow: "0 4px 24px rgba(15, 40, 60, 0.06)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
                <div>
                  <h1 className="text-lg lg:text-xl font-extrabold text-[#0F172A] tracking-tight">
                    Instructor-Customized Simulation
                  </h1>
                  <p className="text-[13px] text-[#64748B] mt-1 max-w-2xl">
                    Steer difficulty, learner level, pacing, and tone — then let the model propose parallel patients with
                    opening lines, stakeholder maps, optional twists, and debrief hooks.
                  </p>
                  {openaiReady === false && (
                    <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 max-w-2xl">
                      OpenAI is not configured on the API. Add{" "}
                      <code className="text-[11px] bg-amber-100/80 px-1 rounded">OPENAI_API_KEY</code> to{" "}
                      <code className="text-[11px] bg-amber-100/80 px-1 rounded">backend/.env</code> (see{" "}
                      <code className="text-[11px] bg-amber-100/80 px-1 rounded">backend/env.example</code>
                      ), restart FastAPI, then use <strong>GENERATE SCENARIOS</strong>.
                    </p>
                  )}
                  {generateError && (
                    <div className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 max-w-2xl space-y-2">
                      <p>{generateError}</p>
                      <button
                        type="button"
                        onClick={loadDemoScenarios}
                        className="text-[11px] font-bold underline decoration-red-400 hover:text-red-950"
                      >
                        Use offline demo trio instead
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center gap-1.5 text-[12px] font-bold text-[#64748B] px-2 py-1 rounded-lg"
                    title="Connected participants (demo)"
                  >
                    <Users className="w-4 h-4" style={{ color: TEAL }} />
                    28
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="p-2 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] disabled:opacity-50"
                    title="Regenerate AI scenario options"
                  >
                    <Zap className="w-4 h-4" style={{ color: "#F4A261" }} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNewScenario}
                    className="text-white text-[11px] font-extrabold uppercase tracking-wide px-4 py-2.5 rounded-lg hover:brightness-105 transition-all"
                    style={{ background: TEAL, boxShadow: "0 4px 14px rgba(42,157,143,0.35)" }}
                  >
                    + NEW SCENARIO
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
                <div className="lg:col-span-7 space-y-5">
                  <div>
                    <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Specialty</div>
                    <div className="flex flex-wrap gap-2">
                      {SPECIALTIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setSpecialty(s)
                            if (s !== "Other (custom)") setSpecialtyCustom("")
                          }}
                          className="px-3 py-2 rounded-lg text-[11px] sm:text-[12px] font-bold border transition-all"
                          style={
                            specialty === s
                              ? {
                                  background: TEAL,
                                  color: "#fff",
                                  borderColor: TEAL,
                                  boxShadow: "0 2px 8px rgba(42,157,143,0.3)",
                                }
                              : {
                                  background: "#F8FAFC",
                                  color: "#64748B",
                                  borderColor: "#E2E8F0",
                                }
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {specialty === "Other (custom)" && (
                      <input
                        type="text"
                        value={specialtyCustom}
                        onChange={(e) => setSpecialtyCustom(e.target.value)}
                        placeholder="e.g. Aeromedical transport, prison medicine, humanitarian field hospital…"
                        className="mt-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[13px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]/25 focus:border-[#2A9D8F]"
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Ethical focus</div>
                      <button
                        type="button"
                        onClick={() => setFocus(Object.fromEntries(ETHICAL_FOCUS.map((k) => [k, true])))}
                        className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[#E8F4F2] text-[#2A9D8F]"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocus(Object.fromEntries(ETHICAL_FOCUS.map((k) => [k, false])))}
                        className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#64748B]"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                      {ETHICAL_FOCUS.map((label) => (
                        <label
                          key={label}
                          className="flex items-start gap-2.5 text-[12px] text-[#334155] cursor-pointer select-none leading-snug"
                        >
                          <input
                            type="checkbox"
                            checked={!!focus[label]}
                            onChange={() => toggleFocus(label)}
                            className="mt-0.5 w-4 h-4 rounded border-[#CBD5E1] shrink-0"
                            style={{ accentColor: TEAL }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block mb-2">
                      Extra ethical tags{" "}
                      <span className="font-normal normal-case text-[#94A3B8]">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={customEthicalTags}
                      onChange={(e) => setCustomEthicalTags(e.target.value)}
                      placeholder="e.g. dual loyalty, undocumented status, futility, faith refusal…"
                      className="w-full rounded-lg border border-[#E2E8F0] bg-[#F4F7FA] px-3 py-2.5 text-[13px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]/25 focus:border-[#2A9D8F]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Clinical vignette</div>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById("live-clinical-input") as HTMLTextAreaElement | null
                          el?.focus()
                          el?.select()
                        }}
                        className="p-1.5 rounded-md text-[#94A3B8] hover:text-[#2A9D8F] hover:bg-[#E8F4F2]"
                        aria-label="Focus vignette"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      id="live-clinical-input"
                      rows={5}
                      value={clinicalInput}
                      onChange={(e) => setClinicalInput(e.target.value)}
                      className="w-full min-h-[120px] rounded-lg border border-[#E2E8F0] bg-[#F4F7FA] px-3 py-2.5 text-[13px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]/25 focus:border-[#2A9D8F] resize-y"
                      placeholder="Paste a strip-style summary, H&P fragment, or teaching objective — the model builds scenario cards from this seed."
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    className="flex items-center gap-2 w-full sm:w-auto px-3 py-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[12px] font-bold text-[#334155] hover:bg-[#F1F5F9]"
                  >
                    <SlidersHorizontal className="w-4 h-4 shrink-0" style={{ color: TEAL }} />
                    Session craft &amp; AI tuning
                    <ChevronDown className={`w-4 h-4 ml-auto sm:ml-1 transition-transform shrink-0 ${advancedOpen ? "rotate-180" : ""}`} />
                  </button>

                  {advancedOpen && (
                    <div
                      className="rounded-xl border border-[#E2E8F0] bg-[#FAFBFC] p-4 space-y-4"
                      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block text-[12px]">
                          <span className="font-bold text-[#64748B]">Parallel scenario cards</span>
                          <input
                            type="range"
                            min={1}
                            max={5}
                            value={scenarioCount}
                            onChange={(e) => setScenarioCount(Number(e.target.value))}
                            className="w-full mt-2 accent-[#2A9D8F]"
                          />
                          <div className="text-[11px] text-[#64748B] mt-1">
                            Generate <strong>{scenarioCount}</strong> distinct patient option{scenarioCount === 1 ? "" : "s"}
                          </div>
                        </label>
                        <label className="block text-[12px]">
                          <span className="font-bold text-[#64748B]">Creativity (temperature)</span>
                          <input
                            type="range"
                            min={0.35}
                            max={1.15}
                            step={0.05}
                            value={temperature}
                            onChange={(e) => setTemperature(Number(e.target.value))}
                            className="w-full mt-2 accent-[#F4A261]"
                          />
                          <div className="text-[11px] text-[#64748B] mt-1">
                            Current <strong>{temperature.toFixed(2)}</strong> — higher = more divergent patients
                          </div>
                        </label>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Difficulty</div>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ["intro", "Intro"],
                              ["standard", "Standard"],
                              ["advanced", "Advanced"],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setDifficulty(val)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase border transition-all"
                              style={
                                difficulty === val
                                  ? { background: TEAL, color: "#fff", borderColor: TEAL }
                                  : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" }
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-[12px]">
                          <span className="font-bold text-[#64748B]">Learner level</span>
                          <select
                            value={learnerLevel}
                            onChange={(e) => setLearnerLevel(e.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-2 text-[13px] text-[#334155]"
                          >
                            {LEARNER_LEVELS.map((L) => (
                              <option key={L} value={L}>
                                {L}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[12px]">
                          <span className="font-bold text-[#64748B]">Patient affect</span>
                          <select
                            value={patientTone}
                            onChange={(e) => setPatientTone(e.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-2 text-[13px] text-[#334155]"
                          >
                            {PATIENT_TONES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Pacing</div>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ["briefing", "Briefing"],
                              ["standard", "Standard"],
                              ["slow_deep", "Slow / deep"],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSimulationPacing(val)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase border transition-all"
                              style={
                                simulationPacing === val
                                  ? { background: "#1f7a70", color: "#fff", borderColor: "#1f7a70" }
                                  : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" }
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block text-[12px]">
                        <span className="font-bold text-[#64748B]">Locale / site / cultural context</span>
                        <input
                          type="text"
                          value={localeOrSetting}
                          onChange={(e) => setLocaleOrSetting(e.target.value)}
                          placeholder="Optional — e.g. rural clinic, university hospital, diaspora family norms…"
                          className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[13px]"
                        />
                      </label>

                      <label className="block text-[12px]">
                        <span className="font-bold text-[#64748B] flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-[#94A3B8]" />
                          Instructor steer (private to the model)
                        </span>
                        <textarea
                          rows={3}
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          placeholder="Must-cover topics, tone to avoid, assessment focus, or 'do not mention X'…"
                          className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[13px] resize-y"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: TEAL }} />
                    <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">AI session brief</div>
                  </div>
                  <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 min-h-[200px] space-y-3">
                    {sessionBrief?.facilitatorNote && (
                      <p className="text-[12px] text-[#475569] leading-relaxed border-b border-[#E2E8F0] pb-3">
                        {sessionBrief.facilitatorNote}
                      </p>
                    )}
                    {sessionBrief && sessionBrief.clinicalContextBullets.length > 0 ? (
                      <ul className="text-[13px] text-[#475569] space-y-2">
                        {sessionBrief.clinicalContextBullets.map((line, i) => (
                          <li key={i} className="flex gap-2 leading-snug">
                            <span style={{ color: TEAL }}>•</span>
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-[#94A3B8] leading-relaxed">
                        Run <span className="font-semibold text-[#64748B]">Generate scenarios</span> to fill this panel
                        with a session title, shared clinical bullets, and a facilitator note. Each card then gets
                        dialogue openers, stakeholders, optional twists, and debrief probes.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 mt-8 pt-5 border-t border-[#EEF2F6]">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-6 py-2.5 rounded-lg text-[12px] font-extrabold uppercase tracking-wide text-white disabled:opacity-60"
                  style={{ background: TEAL, boxShadow: "0 4px 16px rgba(42,157,143,0.3)" }}
                >
                  {generating ? "GENERATING…" : "GENERATE SCENARIOS"}
                </button>
                <button
                  type="button"
                  onClick={() => launchSimulation(null)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[12px] font-extrabold uppercase tracking-wide border border-[#D1D9E2] bg-[#EEF2F6] text-[#475569] hover:bg-[#E2E8F0]"
                >
                  <User className="w-4 h-4" />
                  LAUNCH
                </button>
              </div>
            </section>

            {/* AI scenarios */}
            <section>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onImportJsonFile}
              />
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-[15px] font-extrabold text-[#0F172A] mb-0.5">
                    AI Generates Structured Scenarios
                  </h2>
                  <p className="text-[12px] text-[#64748B]">
                    System produces structured options — or add your own. Your list is saved in this browser.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={openAddScenario}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#D1D9E2] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    <Plus className="w-3.5 h-3.5" style={{ color: TEAL }} />
                    Add custom
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#D1D9E2] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#64748B]" />
                    Import JSON
                  </button>
                </div>
              </div>

              {!generated ? (
                <div
                  className="bg-white/80 border border-dashed border-[#CBD5E1] rounded-xl py-16 px-6 text-center text-[13px] text-[#64748B]"
                >
                  Run <span className="font-bold" style={{ color: TEAL }}>GENERATE SCENARIOS</span> for the demo trio,
                  or use <span className="font-semibold text-[#334155]">Add custom</span> /{" "}
                  <span className="font-semibold text-[#334155]">Import JSON</span> to start your own list.
                </div>
              ) : scenarios.length === 0 ? (
                <div className="bg-white border border-[#E2E8F0] rounded-xl py-14 px-6 text-center text-[13px] text-[#64748B]">
                  No scenarios left.{" "}
                  <button type="button" className="font-bold underline" style={{ color: TEAL }} onClick={openAddScenario}>
                    Add a custom scenario
                  </button>{" "}
                  or <span className="font-semibold">+ NEW SCENARIO</span> to restore the defaults.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {scenarios.map((c) => {
                    const sel = selectedId === c.id
                    const expanded = cardExpanded[c.id] !== false
                    return (
                      <article
                        key={c.id}
                        className="bg-white border flex flex-col min-h-[320px]"
                        style={{
                          borderRadius: CARD_RADIUS,
                          borderColor: sel ? TEAL : "#DEE5ED",
                          boxShadow: sel ? `0 0 0 2px ${TEAL_DIM}, 0 8px 28px rgba(15,40,60,0.08)` : "0 4px 20px rgba(15,40,60,0.05)",
                        }}
                      >
                        <div className="p-4 border-b border-[#F1F5F9]">
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={!!cardChecked[c.id]}
                              onChange={() => setCardChecked((x) => ({ ...x, [c.id]: !x[c.id] }))}
                              className="mt-1 w-4 h-4 rounded border-[#CBD5E1]"
                              style={{ accentColor: TEAL }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-extrabold text-[#0F172A] text-[14px]">
                                {c.name}, {c.age}
                              </div>
                              <div className="text-[11px] text-[#94A3B8] mt-0.5">{c.breadcrumb}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCardExpanded((x) => ({ ...x, [c.id]: !expanded }))}
                              className="p-1 rounded-md text-[#94A3B8] hover:bg-[#F8FAFC]"
                              aria-label={expanded ? "Collapse" : "Expand"}
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="p-4 flex-1 flex flex-col gap-4 text-[12px] text-[#475569]">
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-[#334155] mb-2">
                                <Check className="w-3.5 h-3.5" style={{ color: TEAL }} />
                                Patient Profile
                              </div>
                              <ul className="space-y-1.5 pl-1">
                                {c.patientProfileBullets.map((b, i) => (
                                  <li key={i} className="flex gap-2 leading-snug">
                                    <span className="text-[#CBD5E1]">•</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-[#334155] mb-2">
                                <Check className="w-3.5 h-3.5" style={{ color: TEAL }} />
                                Psychological State
                              </div>
                              <ul className="space-y-1.5 pl-1">
                                {c.psychBullets.map((b, i) => (
                                  <li key={i} className="flex gap-2 leading-snug">
                                    <span className="text-[#CBD5E1]">•</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {c.openingLine ? (
                              <div
                                className="rounded-lg p-3 border"
                                style={{ background: "rgba(42,157,143,0.06)", borderColor: "rgba(42,157,143,0.25)" }}
                              >
                                <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#0F766E] mb-1.5 flex items-center gap-1.5">
                                  <Mic className="w-3.5 h-3.5 shrink-0" />
                                  Opening line
                                </div>
                                <p className="text-[12px] text-[#134E4A] leading-snug italic">
                                  “{c.openingLine}”
                                </p>
                              </div>
                            ) : null}

                            {c.communicationBarrier ? (
                              <div className="text-[11px] text-[#92400E] bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                                <span className="font-bold">Communication: </span>
                                {c.communicationBarrier}
                              </div>
                            ) : null}

                            {c.stakeholders && c.stakeholders.length > 0 ? (
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-[#334155] mb-2">
                                  <Users className="w-3.5 h-3.5" style={{ color: TEAL }} />
                                  Stakeholders and systems
                                </div>
                                <ul className="space-y-1 pl-1 text-[11px] text-[#475569]">
                                  {c.stakeholders.map((st, i) => (
                                    <li key={i} className="flex gap-2 leading-snug">
                                      <span className="text-[#CBD5E1]">•</span>
                                      {st}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {c.possibleTwist ? (
                              <div className="text-[11px] text-[#6B21A8] bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
                                <span className="font-bold">Possible twist: </span>
                                {c.possibleTwist}
                              </div>
                            ) : null}

                            {c.debriefHooks && c.debriefHooks.length > 0 ? (
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-[#334155] mb-2">
                                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                                  Debrief hooks
                                </div>
                                <ul className="space-y-1 pl-1 text-[11px] text-[#475569]">
                                  {c.debriefHooks.map((h, i) => (
                                    <li key={i} className="flex gap-2 leading-snug">
                                      <span className="text-amber-400">→</span>
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className="mt-auto p-4 pt-0 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            className="flex-1 min-w-[72px] py-2 rounded-lg text-[11px] font-extrabold uppercase border transition-colors"
                            style={
                              sel
                                ? { background: TEAL, color: "#fff", borderColor: TEAL }
                                : { background: "#fff", color: "#334155", borderColor: "#E2E8F0" }
                            }
                          >
                            SELECT
                          </button>
                          <button
                            type="button"
                            onClick={() => openModify(c.id)}
                            className="flex-1 min-w-[72px] py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#E2E8F0] text-[#475569] bg-[#F8FAFC] hover:bg-[#F1F5F9]"
                          >
                            MODIFY
                          </button>
                          {c.primaryLaunch ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(c.id)
                                launchSimulation(c.id)
                              }}
                              className="flex-1 min-w-[72px] py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#D1D9E2] text-[#475569] bg-[#EEF2F6] hover:bg-[#E2E8F0]"
                            >
                              LAUNCH
                            </button>
                          ) : (
                            <div id={`live-more-root-${c.id}`} className="relative flex-1 min-w-[40px]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMoreOpenId((id) => (id === c.id ? null : c.id))
                                }}
                                className="w-full py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
                              >
                                <MoreHorizontal className="w-4 h-4 mx-auto" />
                              </button>
                              {moreOpenId === c.id && (
                                <div
                                  className="absolute bottom-full mb-1 right-0 w-44 py-1 rounded-lg border border-[#E2E8F0] bg-white shadow-lg z-40 text-left"
                                  style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.1)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#F8FAFC]"
                                    onClick={() => duplicateScenario(c.id)}
                                  >
                                    Duplicate card
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#F8FAFC]"
                                    onClick={() => exportScenarioJson(c.id)}
                                  >
                                    Export JSON
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-[11px] text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                                    onClick={() => deleteScenario(c.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete card
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </main>

        {/* Bottom simulation bar */}
        <footer
          className="shrink-0 flex flex-wrap items-center gap-3 px-4 lg:px-8 py-3 border-t border-[#D5DDE6] bg-white"
          style={{ boxShadow: "0 -4px 20px rgba(15,40,60,0.04)" }}
        >
          <div className="flex-1 min-w-[200px] text-[12px] font-medium text-[#334155] leading-snug">
            <span className="text-[#64748B] font-bold uppercase text-[10px] tracking-wider mr-2">Simulation Case</span>
            {bottomSummary}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={bottomSelect}
              className="px-5 py-2 rounded-lg text-[11px] font-extrabold uppercase text-white min-w-[88px]"
              style={{ background: TEAL }}
            >
              SELECT
            </button>
            <button
              type="button"
              onClick={() => {
                const id = selectedId ?? scenarios[0]?.id
                if (id) openModify(id)
                else if (generated) openAddScenario()
              }}
              disabled={!generated}
              className="px-5 py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#D1D9E2] bg-[#F1F5F9] text-[#475569] min-w-[88px] disabled:opacity-45"
            >
              MODIFY
            </button>
            <button
              type="button"
              onClick={() => launchSimulation(selectedId)}
              className="flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-extrabold uppercase border border-[#D1D9E2] bg-[#E8ECF1] text-[#475569] min-w-[88px]"
            >
              <User className="w-3.5 h-3.5" />
              LAUNCH
            </button>
          </div>
        </footer>
      </div>

      {/* Modify modal */}
      {modifyTargetId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div
            className="bg-white rounded-xl w-full max-w-lg border border-[#E2E8F0] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
            role="dialog"
            aria-labelledby="modify-title"
          >
            <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between">
              <h3 id="modify-title" className="font-extrabold text-[#0F172A]">
                Modify scenario
              </h3>
              <button
                type="button"
                onClick={() => setModifyTargetId(null)}
                className="text-[12px] font-semibold text-[#64748B] hover:text-[#0F172A]"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Name</span>
                  <input
                    value={modifyForm.name}
                    onChange={(e) => setModifyForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Age</span>
                  <input
                    type="number"
                    min={18}
                    max={120}
                    value={modifyForm.age}
                    onChange={(e) => setModifyForm((f) => ({ ...f, age: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Breadcrumb</span>
                <input
                  value={modifyForm.breadcrumb}
                  onChange={(e) => setModifyForm((f) => ({ ...f, breadcrumb: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Patient profile (one line per bullet)</span>
                <textarea
                  rows={3}
                  value={modifyForm.profileLines}
                  onChange={(e) => setModifyForm((f) => ({ ...f, profileLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Psychological / ethical themes (one per line)</span>
                <textarea
                  rows={3}
                  value={modifyForm.psychLines}
                  onChange={(e) => setModifyForm((f) => ({ ...f, psychLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Diagnosis (bottom bar)</span>
                  <input
                    value={modifyForm.diagnosis}
                    onChange={(e) => setModifyForm((f) => ({ ...f, diagnosis: e.target.value }))}
                    placeholder="e.g. Invasive breast carcinoma"
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Extension (bottom bar)</span>
                  <input
                    value={modifyForm.extension}
                    onChange={(e) => setModifyForm((f) => ({ ...f, extension: e.target.value }))}
                    placeholder="e.g. Hepatic and bone metastases"
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Opening line (in-character)</span>
                <textarea
                  rows={2}
                  value={modifyForm.openingLine}
                  onChange={(e) => setModifyForm((f) => ({ ...f, openingLine: e.target.value }))}
                  placeholder="First line the patient might volunteer…"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Stakeholders (one per line)</span>
                <textarea
                  rows={2}
                  value={modifyForm.stakeholdersLines}
                  onChange={(e) => setModifyForm((f) => ({ ...f, stakeholdersLines: e.target.value }))}
                  placeholder="Partner, employer, insurer…"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Possible mid-sim twist</span>
                <input
                  value={modifyForm.possibleTwist}
                  onChange={(e) => setModifyForm((f) => ({ ...f, possibleTwist: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Debrief hooks (one per line)</span>
                <textarea
                  rows={2}
                  value={modifyForm.debriefHooksLines}
                  onChange={(e) => setModifyForm((f) => ({ ...f, debriefHooksLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Communication barrier</span>
                <input
                  value={modifyForm.communicationBarrier}
                  onChange={(e) => setModifyForm((f) => ({ ...f, communicationBarrier: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] text-[#334155]">
                <input
                  type="checkbox"
                  checked={modifyForm.primaryLaunch}
                  onChange={(e) => setModifyForm((f) => ({ ...f, primaryLaunch: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#CBD5E1]"
                  style={{ accentColor: TEAL }}
                />
                Show <span className="font-bold">LAUNCH</span> on this card (only one card should use this)
              </label>
            </div>
            <div className="px-5 py-4 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (modifyTargetId && deleteScenario(modifyTargetId)) setModifyTargetId(null)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete scenario
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModifyTargetId(null)}
                  className="px-4 py-2 rounded-lg text-[12px] font-bold text-[#64748B] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveModify}
                  className="px-4 py-2 rounded-lg text-[12px] font-extrabold text-white"
                  style={{ background: TEAL }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add custom scenario */}
      {addOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div
            className="bg-white rounded-xl w-full max-w-md border border-[#E2E8F0] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-labelledby="add-scenario-title"
          >
            <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between">
              <h3 id="add-scenario-title" className="font-extrabold text-[#0F172A]">
                Add custom scenario
              </h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-[12px] font-semibold text-[#64748B] hover:text-[#0F172A]"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Name</span>
                  <input
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Youssef"
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Age</span>
                  <input
                    type="number"
                    min={18}
                    max={120}
                    value={addForm.age}
                    onChange={(e) => setAddForm((f) => ({ ...f, age: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Breadcrumb</span>
                <input
                  value={addForm.breadcrumb}
                  onChange={(e) => setAddForm((f) => ({ ...f, breadcrumb: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Patient profile (one line per bullet)</span>
                <textarea
                  rows={3}
                  value={addForm.profileLines}
                  onChange={(e) => setAddForm((f) => ({ ...f, profileLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Psychological / ethical themes (one per line)</span>
                <textarea
                  rows={3}
                  value={addForm.psychLines}
                  onChange={(e) => setAddForm((f) => ({ ...f, psychLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Diagnosis (optional)</span>
                  <input
                    value={addForm.diagnosis}
                    onChange={(e) => setAddForm((f) => ({ ...f, diagnosis: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-[#64748B]">Extension (optional)</span>
                  <input
                    value={addForm.extension}
                    onChange={(e) => setAddForm((f) => ({ ...f, extension: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Opening line (optional)</span>
                <textarea
                  rows={2}
                  value={addForm.openingLine}
                  onChange={(e) => setAddForm((f) => ({ ...f, openingLine: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Stakeholders (one per line)</span>
                <textarea
                  rows={2}
                  value={addForm.stakeholdersLines}
                  onChange={(e) => setAddForm((f) => ({ ...f, stakeholdersLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Possible twist</span>
                <input
                  value={addForm.possibleTwist}
                  onChange={(e) => setAddForm((f) => ({ ...f, possibleTwist: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Debrief hooks (one per line)</span>
                <textarea
                  rows={2}
                  value={addForm.debriefHooksLines}
                  onChange={(e) => setAddForm((f) => ({ ...f, debriefHooksLines: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 font-mono text-[12px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#64748B]">Communication barrier</span>
                <input
                  value={addForm.communicationBarrier}
                  onChange={(e) => setAddForm((f) => ({ ...f, communicationBarrier: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] text-[#334155]">
                <input
                  type="checkbox"
                  checked={addForm.primaryLaunch}
                  onChange={(e) => setAddForm((f) => ({ ...f, primaryLaunch: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#CBD5E1]"
                  style={{ accentColor: TEAL }}
                />
                This card shows <span className="font-bold">LAUNCH</span> (clears it from other cards)
              </label>
            </div>
            <div className="px-5 py-4 border-t border-[#F1F5F9] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 rounded-lg text-[12px] font-bold text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAddScenario}
                className="px-4 py-2 rounded-lg text-[12px] font-extrabold text-white"
                style={{ background: TEAL }}
              >
                Add to list
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
