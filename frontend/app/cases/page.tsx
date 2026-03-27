"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, Tag, Zap, Clock, ChevronRight, AlertCircle, Radio } from 'lucide-react'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface CaseSummary {
  id: string
  num: string
  title: string
  desc: string
  category: string
  categoryColor?: string
  categoryBg?: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  diffColor?: string
  tags: string[]
}

const DIFF_STYLES: Record<string, { bg: string; text: string }> = {
  Easy: { bg: '#DCFCE7', text: '#166534' },
  Medium: { bg: '#FEF9C3', text: '#854D0E' },
  Hard: { bg: '#FEE2E2', text: '#991B1B' },
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(27,107,125,0.1)' }}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

function CaseCard({ c }: { c: CaseSummary }) {
  const diff = DIFF_STYLES[c.difficulty] ?? DIFF_STYLES.Medium

  return (
    <Link href={`/game?case=${encodeURIComponent(c.id)}`} className="block group">
      <div
        className="rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
        style={{
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(27,107,125,0.1)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-lg"
            style={{ background: c.categoryBg ?? '#E8F4F6', color: c.categoryColor ?? '#1B6B7D' }}
          >
            {c.num}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-extrabold text-sm text-[#1B3A4D] truncate">
                {c.title}
              </h3>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: diff.bg, color: diff.text }}
              >
                {c.difficulty}
              </span>
            </div>

            <p className="text-xs text-[#5C7483] mb-3 line-clamp-2 leading-relaxed">
              {c.desc}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: c.categoryBg ?? '#E8F4F6',
                  color: c.categoryColor ?? '#1B6B7D',
                }}
              >
                {c.category}
              </span>

              {c.tags?.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <ChevronRight
            className="w-4 h-4 shrink-0 mt-1 transition-transform duration-200 group-hover:translate-x-0.5"
            style={{ color: '#CBD5E1' }}
          />
        </div>
      </div>
    </Link>
  )
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadCases() {
      try {
        setLoading(true)
        setError(null)

        const r = await fetch(`${BASE}/cases/`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)

        const data = await r.json()
        if (!cancelled) setCases(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load cases')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCases()

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = cases.filter(c => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      c.title.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    )
  })

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #D4E8EC 0%, #E8F4F6 50%, #F0F8FA 100%)',
      }}
    >
      <header
        className="sticky top-0 z-20 px-6 py-4 flex flex-wrap items-center gap-3 sm:gap-4"
        style={{
          background: 'rgba(27, 107, 125, 0.95)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </Link>

        <div className="min-w-0 flex-1 sm:flex-none">
          <h1 className="text-white font-extrabold text-base leading-tight">Case Library</h1>
          <p className="text-white/50 text-xs">
            {loading ? 'Loading…' : `${cases.length} cases available`}
          </p>
        </div>

        <Link
          href="/live-mode"
          className="ml-auto sm:ml-0 flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white transition-colors hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <Radio className="w-3.5 h-3.5 opacity-90" />
          <span className="hidden sm:inline">Live Mode</span>
          <span className="sm:hidden">Live</span>
        </Link>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <Search className="w-3.5 h-3.5 text-white/50" />
          <input
            type="text"
            placeholder="Search cases…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="bg-transparent text-white text-xs placeholder-white/40 outline-none w-36"
          />
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6">
        {!loading && !error && (
          <div className="flex gap-3 mb-6 flex-wrap">
            {[
              { icon: Zap, label: `${cases.filter(c => c.difficulty === 'Easy').length} Easy`, color: '#166534', bg: '#DCFCE7' },
              { icon: Clock, label: `${cases.filter(c => c.difficulty === 'Medium').length} Medium`, color: '#854D0E', bg: '#FEF9C3' },
              { icon: AlertCircle, label: `${cases.filter(c => c.difficulty === 'Hard').length} Hard`, color: '#991B1B', bg: '#FEE2E2' },
            ].map(({ icon: Icon, label, color, bg }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: bg, color }}
              >
                <Icon className="w-3 h-3" />
                {label}
              </div>
            ))}

            {query && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ml-auto"
                style={{ background: '#E8F4F6', color: '#1B6B7D' }}
              >
                <Tag className="w-3 h-3" />
                {filtered.length} results
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #FCA5A5' }}
          >
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="font-bold text-[#1B3A4D] mb-1">Backend unreachable</p>
            <p className="text-xs text-[#5C7483] mb-4">
              Make sure FastAPI is running at{' '}
              <code className="bg-gray-100 px-1 rounded">{BASE}</code>
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: '#1B6B7D' }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-12 text-[#5C7483]">
            <Tag className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No cases match &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map(c => <CaseCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}