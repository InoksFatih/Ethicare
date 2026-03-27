"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Server, ExternalLink } from "lucide-react"

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const LIVE_PRESENTATION_DEFAULT_KEY = "ethicare-live-presentation-default"

export default function SettingsPage() {
  const [presentationDefault, setPresentationDefault] = useState(false)

  useEffect(() => {
    try {
      setPresentationDefault(localStorage.getItem(LIVE_PRESENTATION_DEFAULT_KEY) === "1")
    } catch {
      /* ignore */
    }
  }, [])

  const setPresentationAndPersist = (value: boolean) => {
    setPresentationDefault(value)
    try {
      localStorage.setItem(LIVE_PRESENTATION_DEFAULT_KEY, value ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 50%, #E8F0F6 100%)" }}
    >
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-4"
        style={{ background: "rgba(27, 107, 125, 0.95)", backdropFilter: "blur(12px)" }}
      >
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </Link>
        <div>
          <h1 className="text-white font-extrabold text-base">Settings</h1>
          <p className="text-white/50 text-xs">Environment & links</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(27,107,125,0.12)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-[#1B6B7D]" />
            <h2 className="font-extrabold text-sm text-[#1B3A4D]">API base URL</h2>
          </div>
          <p className="text-xs text-[#64748B] mb-2">
            Set <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded">NEXT_PUBLIC_API_URL</code> in{" "}
            <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded">.env.local</code> to point the app at your FastAPI
            backend.
          </p>
          <p className="text-sm font-mono text-[#1B3A4D] break-all bg-[#F8FAFC] rounded-lg px-3 py-2 border border-[#E2E8F0]">
            {CONFIGURED_API_URL}
          </p>
          <p className="text-[11px] text-[#64748B] mt-2 leading-snug">
            For public join links (QR) on phones using 4G or another Wi‑Fi, deploy the frontend on{" "}
            <strong className="text-[#334155]">https</strong> and point{" "}
            <code className="bg-[#F1F5F9] px-1 rounded">NEXT_PUBLIC_API_URL</code> /{" "}
            <code className="bg-[#F1F5F9] px-1 rounded">NEXT_PUBLIC_WS_URL</code> at your{" "}
            <strong className="text-[#334155]">public</strong> API (https + wss). This app upgrades insecure remote
            URLs when the page is served over HTTPS so browsers do not block mixed content.
          </p>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(27,107,125,0.12)",
          }}
        >
          <h2 className="font-extrabold text-sm text-[#1B3A4D] mb-3">Quick links</h2>
          <div className="flex flex-col gap-2">
            <Link
              href="/cases"
              className="flex items-center gap-2 text-sm font-semibold text-[#1B6B7D] hover:underline"
            >
              Case library <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </Link>
            <Link
              href="/classroom"
              className="flex items-center gap-2 text-sm font-semibold text-[#1B6B7D] hover:underline"
            >
              Instructor classroom <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </Link>
            <Link
              href="/live-mode"
              className="flex items-center gap-2 text-sm font-semibold text-[#1B6B7D] hover:underline"
            >
              Live Mode designer (spec UI) <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </Link>
          </div>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(27,107,125,0.12)",
          }}
        >
          <h2 className="font-extrabold text-sm text-[#1B3A4D] mb-3">Live session appearance</h2>
          <label className="flex items-center justify-between gap-4 text-sm font-semibold text-[#1B3A4D]">
            <span>Presentation mode by default</span>
            <input
              type="checkbox"
              checked={presentationDefault}
              onChange={(e) => setPresentationAndPersist(e.target.checked)}
              className="w-5 h-5 rounded border border-[#E2E8F0]"
              style={{ accentColor: "#1B6B7D" }}
            />
          </label>
          <p className="text-xs text-[#64748B] mt-2">
            Shows the QR + stats first and hides the smaller response feed on the live instructor page.
          </p>
        </div>
      </div>
    </div>
  )
}
