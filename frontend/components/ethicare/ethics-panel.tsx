"use client"

import React, { useEffect, useState } from "react"

const SCORE_COLORS: Record<string, string> = {
  autonomy: "#58D8C8",
  beneficence: "#5EE6A8",
  nonMal: "#F7A35C",
  justice: "#6B9FE8",
}

const SCORE_NAMES: Record<string, string> = {
  autonomy: "Autonomy",
  beneficence: "Beneficence",
  nonMal: "Non-maleficence",
  justice: "Justice",
}

interface Scores {
  autonomy: number
  beneficence: number
  nonMal: number
  justice: number
}

function RadarChart({
  scores,
  emphasis,
}: {
  scores: Scores
  emphasis: boolean
}) {
  const cx = 100
  const cy = 100
  const r = 60

  const axes = [
    { k: "autonomy" as keyof Scores, a: -90, label: "Autonomy" },
    { k: "nonMal" as keyof Scores, a: 0, label: "Non-maleficence" },
    { k: "justice" as keyof Scores, a: 90, label: "Justice" },
    { k: "beneficence" as keyof Scores, a: 180, label: "Beneficence" },
  ]

  const rad = (d: number) => (d * Math.PI) / 180

  const pt = (s: number, a: number) => {
    const d = (Math.min(100, Math.max(0, s)) / 100) * r
    return {
      x: cx + d * Math.cos(rad(a)),
      y: cy + d * Math.sin(rad(a)),
    }
  }

  const dpts = axes.map((a) => pt(scores[a.k], a.a))
  const poly = dpts.map((p) => `${p.x},${p.y}`).join(" ")

  const labelPos = (a: number, offset: number = 90) => pt(offset, a)

  return (
    <div
      className={`flex justify-center transition-[filter,transform] duration-300 ${
        emphasis ? "scale-[1.04] drop-shadow-[0_0_18px_rgba(88,216,200,0.45)]" : ""
      }`}
    >
      <svg viewBox="0 0 200 200" className="w-full max-w-[220px]">
        {[25, 50, 75, 100].map((l) => {
          const ps = axes.map((a) => pt(l, a.a))
          return (
            <polygon
              key={l}
              points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgba(27, 107, 125, 0.15)"
              strokeWidth="1"
            />
          )
        })}

        {axes.map((a) => {
          const e = pt(100, a.a)
          return (
            <line
              key={a.k}
              x1={cx}
              y1={cy}
              x2={e.x}
              y2={e.y}
              stroke="rgba(27, 107, 125, 0.2)"
              strokeWidth="1"
            />
          )
        })}

        <polygon
          points={poly}
          fill="rgba(88, 216, 200, 0.25)"
          stroke="#58D8C8"
          strokeWidth={emphasis ? 3 : 2}
          className="transition-all duration-500"
        />

        {dpts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={emphasis ? 7 : 6}
            fill={SCORE_COLORS[axes[i].k]}
            stroke="white"
            strokeWidth="2"
            className="transition-all duration-500"
          />
        ))}

        {axes.map((a) => {
          const lp = labelPos(a.a, 115)
          return (
            <text
              key={a.k}
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fill="#5C7483"
              fontWeight="600"
              className="font-sans"
            >
              {a.label.length > 12 ? a.label.split("-")[1] || a.label.slice(0, 10) : a.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

interface EthicsPanelProps {
  scores: Scores
  /** Increment after each successful decision to pulse bars that moved. */
  principleFlashTick?: number
  /** Snapshot of last score_delta from the API (which axes changed). */
  lastPrincipleDelta?: Record<string, number> | null
}

export default function EthicsPanel({
  scores,
  principleFlashTick = 0,
  lastPrincipleDelta = null,
}: EthicsPanelProps) {
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (principleFlashTick === 0) return
    const keys = new Set(
      Object.entries(lastPrincipleDelta ?? {})
        .filter(([, v]) => v !== 0)
        .map(([k]) => k)
    )
    setFlashKeys(keys)
    const t = setTimeout(() => setFlashKeys(new Set()), 2200)
    return () => clearTimeout(t)
  }, [principleFlashTick, lastPrincipleDelta])

  const anyFlash = flashKeys.size > 0

  return (
    <div
      className={`rounded-3xl p-5 shadow-lg border transition-shadow duration-300 ${
        anyFlash
          ? "bg-white border-[var(--ethicare-teal)]/40 shadow-[0_0_28px_rgba(27,107,125,0.18)]"
          : "bg-white border-[var(--ethicare-teal)]/10"
      }`}
    >
      <div className="text-xs font-extrabold tracking-wider uppercase text-[#5C7483] mb-1">
        Ethical Principles
      </div>
      <p className="text-[11px] text-[#64748B] leading-relaxed mb-4">
        After each choice, watch this panel — shifts show how your run is trending. Full picture at debrief.
      </p>

      <div className="mb-5">
        <RadarChart scores={scores} emphasis={anyFlash} />
      </div>

      <div className="flex flex-col gap-3">
        {(Object.entries(scores) as [keyof Scores, number][]).map(([k, v]) => {
          const on = flashKeys.has(k)
          const col = SCORE_COLORS[k]
          return (
            <div
              key={k}
              className={`flex items-center gap-2.5 rounded-xl px-0.5 py-1 -mx-0.5 transition-all duration-300 ${
                on ? "animate-pulse" : ""
              }`}
              style={
                on
                  ? {
                      boxShadow: `0 0 0 2px ${col}55, 0 0 16px ${col}44`,
                    }
                  : undefined
              }
            >
              <span className="text-[12px] font-semibold text-[#475569] w-[7.25rem] shrink-0 leading-tight">
                {SCORE_NAMES[k]}
              </span>
              <div className="flex-1 min-w-0 h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${v}%`,
                    backgroundColor: col,
                  }}
                />
              </div>
              <span className="text-sm font-bold w-9 text-right tabular-nums shrink-0" style={{ color: col }}>
                {v}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
