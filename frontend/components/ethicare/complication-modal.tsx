"use client"

import React, { useCallback, useEffect, useState } from "react"
import { X, Shuffle, Zap, Radio } from "lucide-react"

export type ComplicationCard = {
  id: string
  title: string
  tag: string
  /** Short premise for the instructor */
  premise: string
  /** What appears in the simulation chat as a live interruption */
  liveLine: string
  /** Badge label in the chat bubble */
  channelLabel: string
  fear: number
  trust: number
  pain: number
}

type Props = {
  open: boolean
  /** Scripted twists for the active case (from case JSON). */
  cards: ComplicationCard[]
  /** Shown under the title so instructors see scope. */
  caseTitle?: string
  onClose: () => void
  onInject: (card: ComplicationCard) => void
}

export default function ComplicationModal({ open, cards, caseTitle, onClose, onInject }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = cards.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (open) setSelectedId(null)
  }, [open])

  const randomPick = useCallback(() => {
    if (cards.length === 0) return
    const i = Math.floor(Math.random() * cards.length)
    setSelectedId(cards[i].id)
  }, [cards])

  if (!open) return null

  const hasCards = cards.length > 0

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-[rgba(8,25,35,0.55)] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complication-modal-title"
    >
      <div
        className="w-full max-w-3xl max-h-[min(92vh,880px)] overflow-hidden rounded-[28px] border border-white/20 shadow-2xl flex flex-col"
        style={{
          background: "linear-gradient(165deg, rgba(27,107,125,0.97) 0%, rgba(15,52,64,0.98) 100%)",
        }}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[var(--ethicare-orange)] mb-1">
              <Radio className="w-4 h-4 animate-pulse" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em]">Live intervention</span>
            </div>
            <h2 id="complication-modal-title" className="text-xl font-extrabold text-white tracking-tight">
              Inject a complication
            </h2>
            {caseTitle ? (
              <p className="text-xs text-white/45 mt-1 font-semibold tracking-tight">For this run: {caseTitle}</p>
            ) : null}
            <p className="text-sm text-white/55 mt-1 leading-relaxed max-w-xl">
              Each case ships with its own curveballs. Pick one to post a real-time interruption, nudge patient state,
              and log a line in your notes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {hasCards ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={randomPick}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/15 hover:bg-white/15 transition-colors disabled:opacity-35 disabled:pointer-events-none"
                  disabled={cards.length < 2}
                  title={cards.length < 2 ? "Only one complication in this case" : undefined}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Surprise draw
                </button>
                <span className="text-[11px] text-white/40">or tap a card</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {cards.map((card) => {
                  const isOn = selectedId === card.id
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedId(card.id)}
                      className={`text-left rounded-2xl p-4 border-2 transition-all duration-200 ${
                        isOn
                          ? "border-[var(--ethicare-orange)] bg-white/12 shadow-[0_0_24px_rgba(245,158,11,0.25)] scale-[1.02]"
                          : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-extrabold text-white leading-tight">{card.title}</span>
                        <span
                          className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: "rgba(245,158,11,0.2)", color: "#FCD34D" }}
                        >
                          {card.tag}
                        </span>
                      </div>
                      <p className="text-xs text-white/55 leading-relaxed">{card.premise}</p>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-white/50 leading-relaxed">
              This case has no scripted complications in the library yet. Add a{" "}
              <code className="text-white/70 text-xs">complications</code> array to its JSON on the server to enable
              this panel.
            </p>
          )}

          {selected ? (
            <div className="mt-5 rounded-2xl border border-[var(--ethicare-orange)]/40 bg-black/25 px-4 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--ethicare-orange)] mb-2">
                Preview — will appear in chat
              </p>
              <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{selected.liveLine}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-white/10 shrink-0 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white/70 border border-white/15 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onInject(selected)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              selected
                ? "bg-gradient-to-r from-[var(--ethicare-orange)] to-[var(--ethicare-orange-dark)] text-white shadow-lg shadow-orange-900/30 hover:shadow-xl"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            <Zap className="w-4 h-4" />
            Inject into simulation
          </button>
        </div>
      </div>
    </div>
  )
}
