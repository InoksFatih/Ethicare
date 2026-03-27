"use client"

import Link from "next/link"
import { ArrowLeft, Search, BookOpen, Radio } from "lucide-react"

export default function DetectivePage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)" }}
    >
      <header
        className="sticky top-0 z-10 px-6 py-4 flex flex-wrap items-center gap-3"
        style={{ background: "rgba(27, 107, 125, 0.95)", backdropFilter: "blur(12px)" }}
      >
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-extrabold text-base">Detective mode</h1>
          <p className="text-white/50 text-xs">Structured case playthrough</p>
        </div>
        <Link
          href="/live-mode"
          className="ml-auto flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white transition-colors hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
        >
          <Radio className="w-3.5 h-3.5 opacity-90" />
          <span className="hidden sm:inline">Live Mode</span>
        </Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-10">
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(27,107,125,0.12)",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
              <Search className="w-6 h-6 text-[#B45309]" />
            </div>
            <div>
              <h2 className="font-extrabold text-[#1B3A4D]">How it works</h2>
              <p className="text-xs text-[#64748B]">Use the case library and work step by step</p>
            </div>
          </div>
          <p className="text-sm text-[#5C7483] leading-relaxed mb-6">
            Detective mode is the same interactive simulation as <strong>Start case</strong>: pick a scenario, read
            the context, choose actions, and review Dr. Ethics feedback. There is no separate mini-game yet — this
            entry point sends you to the library so every button leads somewhere useful.
          </p>
          <Link
            href="/cases"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-shadow hover:shadow-xl"
            style={{ background: "linear-gradient(90deg, #F59E0B, #D97706)" }}
          >
            <BookOpen className="w-4 h-4" />
            Open case library
          </Link>
        </div>
      </div>
    </div>
  )
}
