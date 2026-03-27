"use client"

import React from 'react'
import { Scale } from 'lucide-react'

interface Law {
  country: string
  article: string
  text: string
}

interface LawPanelProps {
  law: Law | null
}

export default function LawPanel({ law }: LawPanelProps) {
  if (!law) return null

  return (
    <div className="bg-white rounded-3xl p-5 shadow-lg border border-[var(--ethicare-blue)]/20">
      <div className="flex items-center gap-2 mb-3">
        <Scale className="w-4 h-4 text-[var(--ethicare-blue)] shrink-0" />
        <span className="text-xs font-extrabold tracking-wider uppercase text-[#5C7483]">
          Ethical reference
        </span>
      </div>
      <div className="text-[11px] font-semibold text-[#64748B] mb-1">{law.country}</div>

      <div className="text-[15px] font-extrabold text-[var(--ethicare-orange)] mb-2 leading-snug">
        {law.article}
      </div>

      <div className="text-[13px] text-[#475569] leading-relaxed border-l-2 border-[var(--ethicare-orange)] pl-3">
        &ldquo;{law.text}&rdquo;
      </div>
    </div>
  )
}
