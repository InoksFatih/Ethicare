"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Search,
  Tag,
  Zap,
  Clock,
  ChevronRight,
  AlertCircle,
  Radio,
  Menu,
  X,
  Home,
  BookOpen,
  Gamepad2,
  Settings,
  LayoutGrid,
} from 'lucide-react'
import { getPublicApiBase } from '@/lib/public-runtime'

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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

type ThemeGroup = {
  category: string
  count: number
  categoryColor: string
  categoryBg: string
}

function buildThemeGroups(cases: CaseSummary[]): ThemeGroup[] {
  const map = new Map<string, { count: number; categoryColor: string; categoryBg: string }>()
  for (const c of cases) {
    const key = c.category?.trim() || 'Other'
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        count: 1,
        categoryColor: c.categoryColor ?? '#1B6B7D',
        categoryBg: c.categoryBg ?? '#E8F4F6',
      })
    } else {
      cur.count += 1
    }
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => a.category.localeCompare(b.category))
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

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/cases', label: 'Case Library', icon: BookOpen },
  { href: '/live-mode', label: 'Live Mode', icon: Radio },
  { href: '/detective', label: 'Detective Mode', icon: Gamepad2 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

export default function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadCases() {
      try {
        setLoading(true)
        setError(null)

        const r = await fetch(`${getPublicApiBase()}/cases/`)
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

  const themes = useMemo(() => buildThemeGroups(cases), [cases])

  const filtered = cases.filter(c => {
    if (selectedTheme) {
      const cat = c.category?.trim() || 'Other'
      if (cat !== selectedTheme) return false
    }
    if (!query) return true
    const q = query.toLowerCase()
    return (
      c.title.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.desc.toLowerCase().includes(q) ||
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
        className="sticky top-0 z-20 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-2 sm:gap-3"
        style={{
          background: 'rgba(27, 107, 125, 0.95)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 text-white"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
          aria-expanded={menuOpen}
          aria-label="Open menu"
        >
          {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <div className="min-w-0 flex-1 basis-[140px]">
          <h1 className="text-white font-extrabold text-base leading-tight">Case Library</h1>
          <p className="text-white/50 text-xs">
            {loading ? 'Loading…' : `${cases.length} cases · ${themes.length} themes`}
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
          className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 w-full sm:w-auto sm:min-w-[200px]"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <Search className="w-3.5 h-3.5 text-white/50 shrink-0" />
          <input
            type="text"
            placeholder="Search cases…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="bg-transparent text-white text-xs placeholder-white/40 outline-none flex-1 min-w-0"
          />
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/25 sm:bg-black/15"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="fixed left-0 top-0 z-40 h-full w-[min(280px,88vw)] shadow-2xl flex flex-col py-14 px-4 gap-1 animate-in slide-in-from-left duration-200"
            style={{
              background: 'linear-gradient(180deg, #134e5e 0%, #0d3d4a 100%)',
              borderRight: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 px-3 mb-2">Navigate</p>
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/95 hover:bg-white/10 transition-colors"
              >
                <Icon className="w-4 h-4 opacity-80" />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {!loading && !error && themes.length > 0 && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <LayoutGrid className="w-4 h-4 text-[#1B6B7D]" />
                <h2 className="text-sm font-extrabold text-[#1B3A4D]">Browse by theme</h2>
              </div>
              <p className="text-xs text-[#5C7483] mb-3">
                Choose a theme to show only cases in that category. Use &ldquo;All themes&rdquo; to reset.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTheme(null)}
                  className="text-left rounded-2xl p-4 transition-all duration-200 border-2"
                  style={{
                    background: selectedTheme === null ? 'rgba(27, 107, 125, 0.12)' : 'rgba(255,255,255,0.85)',
                    borderColor: selectedTheme === null ? '#1B6B7D' : 'rgba(27,107,125,0.12)',
                    boxShadow: selectedTheme === null ? '0 4px 20px rgba(27,107,125,0.12)' : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-sm text-[#1B3A4D]">All themes</span>
                    <span
                      className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full"
                      style={{ background: '#E8F4F6', color: '#1B6B7D' }}
                    >
                      {cases.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5C7483] mt-1">Every case in the library</p>
                </button>
                {themes.map(t => (
                  <button
                    key={t.category}
                    type="button"
                    onClick={() => setSelectedTheme(t.category)}
                    className="text-left rounded-2xl p-4 transition-all duration-200 border-2"
                    style={{
                      background:
                        selectedTheme === t.category ? `${t.categoryBg}ee` : 'rgba(255,255,255,0.85)',
                      borderColor:
                        selectedTheme === t.category ? t.categoryColor : 'rgba(27,107,125,0.12)',
                      boxShadow:
                        selectedTheme === t.category
                          ? `0 4px 20px ${t.categoryColor}22`
                          : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-extrabold text-sm leading-snug"
                        style={{ color: t.categoryColor }}
                      >
                        {t.category}
                      </span>
                      <span
                        className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: t.categoryBg, color: t.categoryColor }}
                      >
                        {t.count}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#5C7483] mt-1">
                      {t.count === 1 ? '1 case' : `${t.count} cases`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mb-6 flex-wrap items-center">
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

              {(query || selectedTheme) && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold sm:ml-auto"
                  style={{ background: '#E8F4F6', color: '#1B6B7D' }}
                >
                  <Tag className="w-3 h-3" />
                  {filtered.length} shown
                </div>
              )}
            </div>
          </>
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
              <code className="bg-gray-100 px-1 rounded">{CONFIGURED_API_URL}</code>
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
            <p className="font-semibold">
              {selectedTheme
                ? `No cases in “${selectedTheme}”${query ? ' match your search' : ''}`
                : `No cases match “${query}”`}
            </p>
            {selectedTheme && (
              <button
                type="button"
                onClick={() => setSelectedTheme(null)}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: '#1B6B7D' }}
              >
                Show all themes
              </button>
            )}
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