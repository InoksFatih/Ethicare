"use client"

import React from 'react'
import { User, Brain, Scale, CheckSquare, MessageSquare } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Patient Interview', icon: User },
  { label: 'Dilemma', icon: Brain },
  { label: 'Decision', icon: Scale },
  { label: 'Consequences', icon: CheckSquare },
  { label: 'Debriefing', icon: MessageSquare }
]

interface CircProgressProps {
  pct: number
}

function CircProgress({ pct }: CircProgressProps) {
  const r = 34
  const c = 2 * Math.PI * r
  const off = c - (pct / 100) * c

  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="7"
      />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="7"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x="45"
        y="50"
        textAnchor="middle"
        fontSize="18"
        fontWeight="800"
        fill="white"
        fontFamily="inherit"
      >
        {pct}%
      </text>
    </svg>
  )
}

interface SidebarProps {
  caseData: {
    steps?: unknown[]
  }
  stepIdx: number
  submitted: boolean
  /** True when the current decision closed the case (no further steps). */
  simulationComplete?: boolean
  feedbackText?: string
  paused: boolean
  onTogglePause: () => void
}

export default function Sidebar({ 
  caseData, 
  stepIdx, 
  submitted, 
  simulationComplete = false,
  feedbackText, 
  paused,
  onTogglePause,
}: SidebarProps) {
  const total = caseData?.steps?.length || 1
  const progress = simulationComplete
    ? 100
    : Math.round(((stepIdx + (submitted ? 1 : 0)) / total) * 100)
  const navPhase = simulationComplete ? 4 : submitted ? 3 : stepIdx === 0 ? 1 : 2

  return (
    <aside className="flex flex-col gap-4 w-[220px] shrink-0">
      {/* Logo Card */}
      <div className="bg-[var(--ethicare-teal)] rounded-3xl p-4 shadow-lg">
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white text-lg font-bold">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L12 6M12 18L12 22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12L6 12M18 12L22 12M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </div>
          <div>
            <div className="text-white font-extrabold text-lg tracking-tight">
              EthiCare
            </div>
            <div className="text-white/50 text-xs leading-snug">
              Learn Medical Ethics by Living the Decision
            </div>
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <div className="bg-[var(--ethicare-teal)] rounded-3xl p-4 shadow-lg">
        <div className="text-white/60 text-[10px] font-bold tracking-widest uppercase text-center mb-2">
          Scenario Progress
        </div>
        <div className="flex justify-center mb-2">
          <CircProgress pct={progress} />
        </div>
        <div className="text-white/50 text-xs text-center">
          {simulationComplete
            ? "Run complete — open debrief"
            : `Step ${Math.min(stepIdx + 1, total)} of ${total}`}
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-[var(--ethicare-teal)] rounded-3xl p-3 shadow-lg flex flex-col gap-1">
        {NAV_ITEMS.map((item, i) => {
          const isActive = i === navPhase
          const isDone = i < navPhase
          const Icon = item.icon

          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                isActive 
                  ? 'bg-white/15 border border-white/20' 
                  : 'border border-transparent'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                  isActive
                    ? 'bg-[var(--ethicare-orange)] shadow-[0_0_12px_rgba(247,163,92,0.5)]'
                    : isDone
                      ? 'bg-[var(--ethicare-autonomy)]'
                      : 'bg-white/25'
                }`}
              />
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-white/50'}`} />
              <span
                className={`text-xs ${
                  isActive ? 'text-white font-semibold' : 'text-white/60 font-medium'
                }`}
              >
                {item.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Dr. Ethics AI Panel */}
      <div className="mt-auto bg-[var(--ethicare-teal)] rounded-3xl p-4 shadow-lg">
        <div className="text-center mb-3">
          <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-[var(--ethicare-orange)] to-[#E8923C] flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
              {/* Robot head */}
              <rect x="8" y="10" width="24" height="20" rx="4" fill="#1B6B7D"/>
              {/* Antenna */}
              <circle cx="20" cy="6" r="3" fill="#58D8C8"/>
              <rect x="19" y="6" width="2" height="6" fill="#58D8C8"/>
              {/* Eyes */}
              <circle cx="14" cy="18" r="3" fill="white"/>
              <circle cx="26" cy="18" r="3" fill="white"/>
              <circle cx="14" cy="18" r="1.5" fill="#1B3A4D"/>
              <circle cx="26" cy="18" r="1.5" fill="#1B3A4D"/>
              {/* Mouth */}
              <rect x="14" y="24" width="12" height="2" rx="1" fill="#58D8C8"/>
            </svg>
          </div>
          <div className="text-[var(--ethicare-orange)] text-[10px] font-extrabold tracking-wider uppercase">
            Dr. Ethics AI
          </div>
        </div>

        <div className="bg-white/10 border border-white/10 rounded-2xl p-3 text-white/80 text-[11px] leading-relaxed italic text-center mb-3">
          {feedbackText
            ? `"${feedbackText.slice(0, 100)}${feedbackText.length > 100 ? '...' : ''}"`
            : '"Every decision shapes trust, dignity, and care."'}
        </div>

        <button
          type="button"
          onClick={onTogglePause}
          className="w-full py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl text-white/80 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {paused ? (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume Simulation
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause Simulation
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
