"use client"

import React from "react"

interface Message {
  role: "patient" | "doctor" | "interruption"
  text: string
  time: string
  /** For live instructor complications (third-channel dialogue). */
  interruptionLabel?: string
}

interface ChatPanelProps {
  message: Message | null
  patientName: string
  /** Label for trainee / clinician bubble (e.g. "Student doctor" for research cases). */
  clinicianLabel?: string
  /** Use "rtl" only when the patient line is in Arabic/script RTL. */
  patientTextDir?: "ltr" | "rtl"
}

export default function ChatPanel({
  message,
  patientName,
  clinicianLabel = "Doctor",
  patientTextDir = "ltr",
}: ChatPanelProps) {
  if (!message) return null

  const isPatient = message.role === "patient"
  const isInterruption = message.role === "interruption"

  return (
    <div className="relative z-30 w-full">
      <div
        className={`pointer-events-auto rounded-2xl border px-4 py-2.5 shadow-xl backdrop-blur-md transition-shadow duration-300 ${
          isInterruption ? "ring-2 ring-[var(--ethicare-orange)]/60" : ""
        }`}
        style={{
          background: isInterruption
            ? "linear-gradient(145deg, rgba(60,25,8,0.92), rgba(25,18,30,0.94))"
            : "rgba(10, 22, 30, 0.5)",
          borderColor: isInterruption ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.12)",
          boxShadow: isInterruption
            ? "0 18px 34px rgba(180,80,20,0.3), 0 0 0 1px rgba(245,158,11,0.2)"
            : "0 12px 26px rgba(0,0,0,0.22)",
        }}
      >
        {isInterruption ? (
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white"
              style={{
                background: "linear-gradient(90deg, rgba(245,158,11,0.95), rgba(217,119,6,0.9))",
              }}
            >
              {message.interruptionLabel ?? "Live interruption"}
            </div>

            <div className="text-[10px] font-semibold text-white/50">{message.time}</div>
          </div>
        ) : null}

        {isInterruption ? (
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ethicare-orange)] mb-1.5 text-center">
            Instructor complication
          </p>
        ) : null}

        <p
          className={`text-center text-[14px] sm:text-[15px] font-semibold leading-[1.35] text-white ${
            isPatient ? "tracking-[0.01em]" : ""
          } ${isInterruption ? "text-[13px] sm:text-[14px] leading-[1.45]" : ""}`}
          dir={isPatient ? patientTextDir : "ltr"}
          lang={isPatient && patientTextDir === "rtl" ? "ar" : "en"}
        >
          {message.text}
        </p>
      </div>
    </div>
  )
}