"use client"

import React, { useEffect, useState } from "react"
import { Check, Heart, HelpCircle, Users, ArrowRight } from "lucide-react"

const CHOICE_ICONS: Record<string, React.ReactNode> = {
  respect: <Check className="w-4 h-4 text-[var(--ethicare-teal)]" />,
  explain: <Heart className="w-4 h-4 text-[var(--ethicare-orange)]" />,
  ask: <HelpCircle className="w-4 h-4 text-[#8D9AA5]" />,
  committee: <Users className="w-4 h-4 text-[var(--ethicare-orange)]" />,
  beliefs: <HelpCircle className="w-4 h-4 text-[#8D9AA5]" />,
  confirm: <Check className="w-4 h-4 text-[var(--ethicare-teal)]" />,
  palliative: <Heart className="w-4 h-4 text-[var(--ethicare-orange)]" />,
  family: <Users className="w-4 h-4 text-[var(--ethicare-orange)]" />,
  insist: <Heart className="w-4 h-4 text-[var(--ethicare-orange)]" />,
}

function TypeWriter({ text, speed = 15 }: { text: string; speed?: number }) {
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

  return <span>{shown}</span>
}

interface Choice {
  id: string
  icon: string
  label: string
  sub: string
}

interface Step {
  q: string
  hint: string
  choices: Choice[]
  idealResponse?: string
}

interface Feedback {
  text: string
  delta: Record<string, number>
}

interface DecisionCardsProps {
  step: Step | null
  selected: string | null
  onSelect: (id: string) => void
  submitted: boolean
  feedback: Feedback | null
  evaluating?: boolean
  onSubmit: () => void
  onNext: () => void
  isFinal: boolean
}

function renderChoiceIcon(choice: Choice) {
  if (CHOICE_ICONS[choice.id]) return CHOICE_ICONS[choice.id]
  if (CHOICE_ICONS[choice.icon]) return CHOICE_ICONS[choice.icon]

  if (choice.icon && choice.icon.length <= 3) {
    return <span className="text-lg leading-none">{choice.icon}</span>
  }

  return <div className="w-4 h-4 rounded-full bg-[var(--ethicare-teal)]/10" />
}

export default function DecisionCards({
  step,
  selected,
  onSelect,
  submitted,
  feedback,
  evaluating = false,
  onSubmit,
  onNext,
  isFinal,
}: DecisionCardsProps) {
  if (!step) return null

  const n = step.choices.length
  const gridCols =
    n <= 2
      ? "grid-cols-2"
      : n === 3
        ? "grid-cols-3"
        : n === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3"

  return (
    <div
      className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 border shadow-lg max-h-[min(52vh,420px)] overflow-y-auto overscroll-contain"
      style={{
        background: "linear-gradient(180deg, rgba(24,82,102,0.94), rgba(20,71,89,0.97))",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 12px 32px rgba(8, 33, 43, 0.2)",
      }}
    >
      {!submitted ? (
        <>
          <h3 className="text-base sm:text-[17px] font-extrabold text-center text-white mb-0.5 leading-snug">
            {step.q}
          </h3>
          <p className="text-xs text-white/65 text-center mb-3 leading-snug px-1">{step.hint}</p>

          <div className={`grid ${gridCols} gap-2 mb-3`}>
            {step.choices.map((c) => {
              const isSelected = selected === c.id

              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`relative p-3 rounded-xl text-center transition-all duration-200 border ${
                    isSelected
                      ? "bg-[#FFF7EF] border-[var(--ethicare-orange)] shadow-md scale-[1.01]"
                      : "bg-white/95 border-white/40 hover:border-[var(--ethicare-orange)]/35"
                  }`}
                >
                  <div className="flex justify-center mb-1.5">{renderChoiceIcon(c)}</div>

                  <div
                    className={`text-[13px] leading-tight font-bold mb-0.5 ${
                      isSelected ? "text-[var(--ethicare-orange)]" : "text-[#1B3A4D]"
                    }`}
                  >
                    {c.label}
                  </div>

                  <div className="text-[10px] text-[#8D9AA5] font-medium leading-snug line-clamp-2">{c.sub}</div>
                </button>
              )
            })}
          </div>

          <button
            onClick={onSubmit}
            disabled={!selected}
            className={`mx-auto w-full max-w-[260px] py-2.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              selected
                ? "bg-white text-[#184F61] shadow-md hover:shadow-lg"
                : "bg-white/20 text-white/40 cursor-not-allowed"
            }`}
          >
            Submit Decision
            <ArrowRight className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          {evaluating && !feedback ? (
            <div className="mb-3 rounded-xl bg-white/90 border border-white/60 px-3 py-4 text-center text-xs text-[#64748B]">
              Dr. Ethics is reviewing your decision…
            </div>
          ) : null}

          {feedback && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--ethicare-orange)] to-[#E8923C] flex items-center justify-center shadow-sm shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                    <rect x="5" y="6" width="14" height="12" rx="2" fill="#1B6B7D" />
                    <circle cx="9" cy="11" r="1.5" fill="white" />
                    <circle cx="15" cy="11" r="1.5" fill="white" />
                    <rect x="9" y="14" width="6" height="1" rx="0.5" fill="#58D8C8" />
                  </svg>
                </div>

                <span className="text-[10px] font-extrabold text-[var(--ethicare-orange)] tracking-wide uppercase">
                  Dr. Ethics Feedback
                </span>
              </div>

              <div className="bg-white/92 border border-white/60 rounded-xl p-3 text-xs text-[#1B3A4D] leading-relaxed mb-1 shadow-md">
                <TypeWriter text={feedback.text} />
              </div>
              <p className="text-center text-[10px] text-white/55 leading-snug">
                Principle shifts highlight on the right — full picture at debrief.
              </p>
            </div>
          )}

          <button
            onClick={onNext}
            disabled={evaluating || !feedback}
            className={`mx-auto w-full max-w-[260px] py-2.5 rounded-full text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 ${
              evaluating || !feedback
                ? "bg-white/40 text-white/50 cursor-not-allowed"
                : "bg-white text-[#184F61] hover:shadow-lg"
            }`}
          >
            {isFinal ? "View Debrief" : "Next Step"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}