"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, PlayCircle, ChevronRight, Users, BookOpen, FlaskConical, ArrowLeft, Radio } from "lucide-react"
import { getPublicApiBase } from "@/lib/public-runtime"

type CaseSummary = {
  id: string
  num?: string | number
  title: string
  desc: string
  category?: string
  difficulty?: string
  tags?: string[]
}

function difficultyBadge(difficulty: string | undefined) {
  const d = (difficulty ?? "").toLowerCase()
  if (d.includes("hard")) return { label: "Hard", diffColor: "#EF4444", diffBg: "#FEF2F2" }
  if (d.includes("easy")) return { label: "Easy", diffColor: "#22C55E", diffBg: "#F0FDF4" }
  if (d.includes("medium")) return { label: "Medium", diffColor: "#F59E0B", diffBg: "#FFFBEB" }
  return { label: difficulty || "Case", diffColor: "#64748B", diffBg: "#F1F5F9" }
}

function accentForCase(c: CaseSummary) {
  const cat = (c.category ?? "").toLowerCase()
  const isResearch = cat.includes("research") || c.id.toLowerCase().includes("research")
  return {
    accent: isResearch ? "#2A6DF5" : "#1B6B7D",
    icon: isResearch ? FlaskConical : BookOpen,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClassroomIndex() {
  const router  = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [cases,    setCases]    = useState<CaseSummary[] | null>(null)
  const [loadingCases, setLoadingCases] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadCases() {
      setLoadingCases(true)
      try {
        const r = await fetch(`${getPublicApiBase()}/cases/`)
        if (!r.ok) throw new Error(`Failed to load cases (${r.status})`)
        const data = (await r.json()) as CaseSummary[]
        if (!cancelled) setCases(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) {
          setCases([])
          setError(e instanceof Error ? e.message : "Failed to load cases")
        }
      } finally {
        if (!cancelled) setLoadingCases(false)
      }
    }
    loadCases()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleCases = useMemo(() => {
    const list = cases ?? []
    // Prefer classroom-first ordering if numbers exist, otherwise stable.
    return [...list].sort((a, b) => String(a.num ?? "").localeCompare(String(b.num ?? "")) || a.title.localeCompare(b.title))
  }, [cases])

  const startSession = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${getPublicApiBase()}/classroom/sessions?case_id=${selected}`, {
        method: "POST",
      })
      if (!r.ok) throw new Error(`Server error ${r.status}`)
      const data = await r.json()
      router.push(`/classroom/${data.session_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session")
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{ background: "linear-gradient(160deg, #0D3D4A 0%, #1B6B7D 100%)" }}
    >
      {/* Header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-extrabold text-2xl tracking-tight">Classroom Mode</span>
        </div>
        <p className="text-white/60 text-sm max-w-md">
          Select a case to run as a live session. Students join via QR code on their phones and submit real-time responses.
        </p>
      </div>

      {/* Case picker */}
      <div className="flex flex-col gap-4 w-full max-w-xl mb-8">
        {loadingCases && (
          <div
            className="rounded-2xl p-5 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.1)" }}
          >
            <Loader2 className="w-5 h-5 animate-spin text-white/60" />
            <span className="text-white/60 text-sm font-semibold">Loading cases…</span>
          </div>
        )}

        {!loadingCases && visibleCases.length === 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.1)" }}
          >
            <p className="text-white font-bold text-sm mb-1">No cases available</p>
            <p className="text-white/60 text-xs">
              Add JSON files to <span className="font-mono">backend/app/data/cases</span> and restart the API.
            </p>
          </div>
        )}

        {visibleCases.map(c => {
          const isSelected = selected === c.id
          const { accent, icon } = accentForCase(c)
          const Icon = icon
          const badge = difficultyBadge(c.difficulty)

          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="text-left rounded-2xl p-5 transition-all"
              style={{
                background: isSelected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)",
                border: isSelected ? "2px solid rgba(255,255,255,0.4)" : "2px solid rgba(255,255,255,0.1)",
                boxShadow: isSelected ? "0 0 0 4px rgba(255,255,255,0.08)" : "none",
                transform: isSelected ? "scale(1.01)" : "scale(1)",
              }}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: isSelected ? accent : "rgba(255,255,255,0.1)" }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-extrabold text-base">{c.title}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: badge.diffBg, color: badge.diffColor }}
                    >{badge.label}</span>
                  </div>

                  <p className="text-white/60 text-xs leading-relaxed mb-2">{c.desc}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                    >
                      {c.category ?? "Case"}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                    >
                      {Array.isArray(c.tags) ? `${c.tags.slice(0, 3).join(" · ")}${c.tags.length > 3 ? " …" : ""}` : "Ethics simulation"}
                    </span>
                  </div>
                </div>

                {/* Selection indicator */}
                <div
                  className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all"
                  style={{
                    borderColor: isSelected ? "white" : "rgba(255,255,255,0.3)",
                    background: isSelected ? "white" : "transparent",
                  }}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-sm w-full max-w-xl"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}
        >
          {error}
        </div>
      )}

      {/* Launch button */}
      <button
        onClick={startSession}
        disabled={!selected || loading}
        className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl"
        style={{
          background: selected && !loading ? "#F7A35C" : "rgba(255,255,255,0.15)",
          color: selected && !loading ? "white" : "rgba(255,255,255,0.4)",
          cursor: selected && !loading ? "pointer" : "not-allowed",
        }}
      >
        {loading
          ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating session…</>
          : <><PlayCircle className="w-5 h-5" /> Launch Session<ChevronRight className="w-4 h-4" /></>
        }
      </button>

      {!selected && (
        <p className="text-white/30 text-xs mt-3">Select a case above to continue</p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
        <Link
          href="/live-mode"
          className="flex items-center gap-2 text-[#58D8C8] hover:text-[#7AE8DC] transition-colors"
        >
          <Radio className="w-4 h-4" />
          Live Mode
        </Link>
      </div>
    </div>
  )
}