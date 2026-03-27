"use client"

import React from 'react'
import { Pencil, Plus, FlaskConical, ArrowRight } from 'lucide-react'

const EMO_COLORS: Record<string, string> = {
  fear: '#FF7B7B',
  trust: '#5EE6A8',
  pain: '#F7A35C'
}

interface Emotions {
  fear?: number
  trust?: number
  pain?: number
}

interface DrEthicsPanelProps {
  emo?: Emotions
  notes?: string
  onNoteChange?: (value: string) => void
  onComplication?: () => void
  /** False when the loaded case defines no scripted complications. */
  complicationsAvailable?: boolean
  onLabResults?: () => void
  onDebrief?: () => void
  onNextStep?: () => void
  /** Mirrors decision panel: only advance after the current step choice is submitted and feedback is shown. */
  canAdvance?: boolean
}

export default function DrEthicsPanel({
  emo = {},
  notes = '',
  onNoteChange = () => {},
  onComplication = () => {},
  complicationsAvailable = true,
  onLabResults = () => {},
  onNextStep = () => {},
  canAdvance = false,
}: DrEthicsPanelProps) {
  const safeEmo = {
    fear: emo?.fear ?? 0,
    trust: emo?.trust ?? 0,
    pain: emo?.pain ?? 0
  }

  return (
    <>
      {/* Patient State */}
      <div className="bg-white rounded-3xl p-5 shadow-lg border border-[var(--ethicare-teal)]/10">
        <div className="text-xs font-extrabold tracking-wider uppercase text-[#5C7483] mb-3">
          Patient State
        </div>

        <div className="flex flex-col gap-2.5">
          {(Object.entries(safeEmo) as [keyof typeof EMO_COLORS, number][]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[#475569] w-11 shrink-0 capitalize">
                {k}
              </span>
              <div className="flex-1 min-w-0 h-2.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${v}%`,
                    backgroundColor: EMO_COLORS[k]
                  }}
                />
              </div>
              <span
                className="text-sm font-bold w-8 text-right tabular-nums shrink-0"
                style={{ color: EMO_COLORS[k] }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-3xl p-5 shadow-lg border border-[var(--ethicare-teal)]/10">
        <div className="flex items-center gap-2 mb-3">
          <Pencil className="w-4 h-4 text-[#5C7483]" />
          <span className="text-xs font-extrabold tracking-wider uppercase text-[#5C7483]">
            Notes
          </span>
        </div>

        <textarea
          value={notes}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Add private note..."
          rows={3}
          className="w-full border border-[#E5E7EB] rounded-2xl px-3 py-2.5 text-sm text-[#1B3A4D] resize-none bg-[#F8FAFC] focus:outline-none focus:border-[var(--ethicare-teal)] focus:ring-1 focus:ring-[var(--ethicare-teal)]/20 placeholder:text-[#9CA3AF] transition-colors"
        />
      </div>

      {/* Instructor Panel */}
      <div className="bg-white rounded-3xl p-5 shadow-lg border border-[var(--ethicare-teal)]/10">
        <div className="text-xs font-extrabold tracking-wider uppercase text-[#5C7483] mb-3">
          Instructor Panel
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onComplication}
            disabled={!complicationsAvailable}
            title={
              complicationsAvailable
                ? undefined
                : "This case has no scripted complications in the library"
            }
            className={`w-full px-3 py-2.5 rounded-2xl border border-[#E5E7EB] text-[13px] font-semibold text-[#1B3A4D] flex items-center gap-2 transition-colors ${
              complicationsAvailable
                ? "bg-white hover:bg-[#F8FAFC]"
                : "bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed"
            }`}
          >
            <Plus className="w-4 h-4 text-[var(--ethicare-autonomy)]" />
            Add Complication
          </button>
          
          <button
            onClick={onLabResults}
            className="w-full px-3 py-2.5 rounded-2xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] text-[13px] font-semibold text-[#1B3A4D] flex items-center gap-2 transition-colors"
          >
            <FlaskConical className="w-4 h-4 text-[var(--ethicare-orange)]" />
            Reveal Lab Results
          </button>
        </div>
      </div>

      {/* Next Step — same flow as main “Next Step” / debrief; disabled until decision is submitted */}
      <button
        type="button"
        onClick={() => {
          if (canAdvance) onNextStep()
        }}
        disabled={!canAdvance}
        className={`w-full py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
          canAdvance
            ? "bg-gradient-to-r from-[var(--ethicare-orange)] to-[var(--ethicare-orange-dark)] shadow-orange-200/50 hover:shadow-xl"
            : "bg-[#CBD5E1] cursor-not-allowed shadow-none"
        }`}
      >
        Next Step
        <ArrowRight className="w-4 h-4" />
      </button>
    </>
  )
}
