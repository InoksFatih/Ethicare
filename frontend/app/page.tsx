"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BookOpen, Gamepad2, Settings, LogOut, ChevronRight, Radio, ArrowRight } from "lucide-react"

const MENU_ITEMS = [
  {
    id: "cases",
    label: "Start Case",
    sub: "Browse the case library",
    icon: BookOpen,
    href: "/cases",
    accent: "#58D8C8",
    glow: "rgba(88, 216, 200, 0.4)",
    accentDim: "rgba(88, 216, 200, 0.12)",
  },
  {
    id: "live-mode",
    label: "Live Mode",
    sub: "Instructor scenario designer",
    icon: Radio,
    href: "/live-mode",
    accent: "#6B9FE8",
    glow: "rgba(107, 159, 232, 0.4)",
    accentDim: "rgba(107, 159, 232, 0.12)",
  },
  {
    id: "detective",
    label: "Detective Mode",
    sub: "Investigate ethical dilemmas",
    icon: Gamepad2,
    href: "/detective",
    accent: "#F7A35C",
    glow: "rgba(247, 163, 92, 0.4)",
    accentDim: "rgba(247, 163, 92, 0.12)",
  },
  {
    id: "settings",
    label: "Settings",
    sub: "Preferences & account",
    icon: Settings,
    href: "/settings",
    accent: "#9CA3AF",
    glow: "rgba(156, 163, 175, 0.3)",
    accentDim: "rgba(156, 163, 175, 0.08)",
  },
  {
    id: "quit",
    label: "Leave",
    sub: "Back or open case library",
    icon: LogOut,
    href: "/",
    accent: "#9CA3AF",
    glow: "rgba(156, 163, 175, 0.3)",
    accentDim: "rgba(156, 163, 175, 0.08)",
  },
]

const WORDMARK_SRC = "/media/Logowithname.png"

const WELCOME_EXIT_MS = 480
const MENU_STAGGER_DELAY_MS = 60

const PARTICLE_SEEDS = [
  { left: "8%", top: "18%", delay: "0s", dx: "14px", dy: "-22px" },
  { left: "88%", top: "22%", delay: "0.4s", dx: "-18px", dy: "16px" },
  { left: "14%", top: "72%", delay: "0.8s", dx: "20px", dy: "-12px" },
  { left: "92%", top: "68%", delay: "1.1s", dx: "-10px", dy: "-24px" },
  { left: "22%", top: "38%", delay: "0.2s", dx: "8px", dy: "20px" },
  { left: "78%", top: "44%", delay: "0.65s", dx: "-16px", dy: "-8px" },
  { left: "6%", top: "48%", delay: "1.3s", dx: "22px", dy: "10px" },
  { left: "94%", top: "12%", delay: "0.15s", dx: "-12px", dy: "18px" },
  { left: "44%", top: "8%", delay: "0.95s", dx: "6px", dy: "14px" },
  { left: "52%", top: "88%", delay: "0.55s", dx: "-8px", dy: "-20px" },
]

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduce(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return reduce
}

export default function StartMenu() {
  const router = useRouter()
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const reduceMotion = usePrefersReducedMotion()

  const [session, setSession] = useState<"welcome" | "main">("welcome")
  const [welcomeExiting, setWelcomeExiting] = useState(false)
  const [menusReady, setMenusReady] = useState(false)
  const [wordmarkFailed, setWordmarkFailed] = useState(false)

  useEffect(() => {
    if (session !== "main") {
      setMenusReady(false)
      return
    }
    const ms = reduceMotion ? 0 : MENU_STAGGER_DELAY_MS
    const t = window.setTimeout(() => setMenusReady(true), ms)
    return () => clearTimeout(t)
  }, [session, reduceMotion])

  const onWordmarkError = useCallback(() => setWordmarkFailed(true), [])

  const handleGetStarted = () => {
    if (reduceMotion) {
      setSession("main")
      return
    }
    setWelcomeExiting(true)
    window.setTimeout(() => {
      setSession("main")
      setWelcomeExiting(false)
    }, WELCOME_EXIT_MS)
  }

  const showDecor = !reduceMotion
  const menusIn = session === "main" && menusReady

  return (
    <div
      className="ethicare-home-root min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{
        background: "linear-gradient(160deg, #061820 0%, #0b3340 30%, #145f6e 62%, #0f4854 100%)",
      }}
    >
      {/* Background decorations */}
      {showDecor && (
        <>
          <div className="ethicare-splash-aurora" aria-hidden />
          <div className="ethicare-splash-grid" aria-hidden />
          {PARTICLE_SEEDS.map((p, i) => (
            <div
              key={i}
              className="ethicare-splash-particle"
              aria-hidden
              style={{ left: p.left, top: p.top, animationDelay: p.delay, "--dx": p.dx, "--dy": p.dy } as React.CSSProperties}
            />
          ))}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="ethicare-splash-ripple-ring"
              aria-hidden
              style={{ animationDelay: `${i * 1.1}s`, width: `min(${240 + i * 100}px, ${72 + i * 10}vw)` }}
            />
          ))}
        </>
      )}

      {/* Concentric rings — wrapper fades in; inner scale anim avoids inline transform vs keyframe fight */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        aria-hidden
        style={{
          opacity: session === "welcome" || session === "main" ? 1 : 0,
          transition: "opacity 1.2s ease",
        }}
      >
        {[460, 660, 880, 1100].map((size, i) => {
          const ringAnim =
            showDecor && (session === "welcome" || session === "main")
              ? ({
                  animationName: "ethicare-home-ring-drift",
                  animationDuration: `${12 + i * 2.5}s`,
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                  animationDelay: `${i * 0.85}s`,
                } as const)
              : { animationName: "none" }
          return (
            <div
              key={size}
              className="absolute rounded-full left-1/2 top-1/2"
              style={{
                width: size,
                height: size,
                marginLeft: -(size / 2),
                marginTop: -(size / 2),
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: 0.55,
                ...ringAnim,
              }}
            />
          )
        })}
      </div>

      {/* ── WELCOME SCREEN ── */}
      {session === "welcome" && (
        <div
          className="relative z-10 flex flex-col items-center justify-center w-full px-6 text-center"
          style={{
            opacity: welcomeExiting ? 0 : 1,
            transform: welcomeExiting ? "scale(0.92) translateY(-24px)" : "scale(1) translateY(0)",
            filter: welcomeExiting ? "blur(10px)" : "none",
            transition: "opacity 0.48s ease, transform 0.48s ease, filter 0.48s ease",
          }}
        >
          {/* Logo / wordmark hero */}
          <div
            className="mb-10"
            style={{
              animation: reduceMotion ? undefined : "ethicare-welcome-hero-in 1s cubic-bezier(0.22,1,0.36,1) both",
            }}
          >
            {!wordmarkFailed ? (
              <img
                src={WORDMARK_SRC}
                alt="EthiCare"
                width={580}
                height={220}
                decoding="async"
                onError={onWordmarkError}
                style={{
                  maxWidth: "min(92vw, 560px)",
                  maxHeight: "min(40vh, 280px)",
                  width: "100%",
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 20px 60px rgba(0,0,0,0.55))",
                }}
              />
            ) : (
              <div>
                <h1 style={{ fontSize: "clamp(3rem,10vw,5.5rem)", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
                  ETHI<span style={{ color: "#F59E0B" }}>CARE</span>
                </h1>
              </div>
            )}
          </div>

          {/* Taglines */}
          <p
            className="font-semibold"
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "clamp(0.95rem,2.5vw,1.15rem)",
              marginBottom: "0.4rem",
              animation: reduceMotion ? undefined : "ethicare-welcome-line-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.3s both",
            }}
          >
            Nurturing ethical thinking through simulation.
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: "clamp(0.8rem,2vw,0.95rem)",
              marginBottom: "2.8rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              animation: reduceMotion ? undefined : "ethicare-welcome-line-in 0.7s cubic-bezier(0.22,1,0.36,1) 0.44s both",
            }}
          >
            Medical Ethics Simulation Platform
          </p>

          {/* CTA button */}
          <button
            type="button"
            onClick={handleGetStarted}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "1rem 2.8rem",
              borderRadius: "9999px",
              background: "linear-gradient(135deg, #1a6b7c 0%, #28a0b2 50%, #58D8C8 100%)",
              border: "1px solid rgba(255,255,255,0.22)",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.01em",
              boxShadow: "0 8px 40px rgba(88,216,200,0.3), 0 2px 12px rgba(0,0,0,0.3)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              animation: reduceMotion ? undefined : "ethicare-welcome-cta-in 0.8s cubic-bezier(0.34,1.3,0.64,1) 0.55s both",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.04)"
              e.currentTarget.style.boxShadow = "0 12px 48px rgba(88,216,200,0.45), 0 2px 12px rgba(0,0,0,0.3)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)"
              e.currentTarget.style.boxShadow = "0 8px 40px rgba(88,216,200,0.3), 0 2px 12px rgba(0,0,0,0.3)"
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)" }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.04)" }}
          >
            Get Started
            <ArrowRight style={{ width: 18, height: 18 }} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── MAIN MENU ── */}
      {session === "main" && (
        <div
          className="relative z-10 flex w-full flex-col items-center px-3 py-6 sm:px-4 sm:py-8"
          style={{
            /* Do not max-width the whole column — it was capping the logo at 560px. */
            animation: reduceMotion ? undefined : "ethicare-main-reveal 0.65s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Wordmark: own max width so it isn’t limited by the nav column */}
          <div
            className="flex w-full flex-col items-center"
            style={{
              maxWidth: "min(96vw, 720px)",
              marginBottom: "2rem",
              animation: reduceMotion ? undefined : "ethicare-welcome-hero-in 0.85s cubic-bezier(0.22,1,0.36,1) 0.05s both",
            }}
          >
            {!wordmarkFailed ? (
              <img
                src={WORDMARK_SRC}
                alt="EthiCare"
                width={800}
                height={300}
                decoding="async"
                onError={onWordmarkError}
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  maxHeight: "min(46vh, 380px)",
                  objectFit: "contain",
                  filter: "drop-shadow(0 20px 56px rgba(0,0,0,0.55))",
                }}
              />
            ) : (
              <h1
                style={{
                  fontSize: "clamp(2.75rem, 12vw, 4.5rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#fff",
                  margin: 0,
                  textAlign: "center",
                  textShadow: "0 8px 32px rgba(0,0,0,0.45)",
                }}
              >
                ETHI<span style={{ color: "#F59E0B" }}>CARE</span>
              </h1>
            )}
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "clamp(0.8rem, 2.2vw, 1rem)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: "0.75rem",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Medical Ethics Simulation Platform
            </p>
          </div>

          {/* Menu: narrow column only; logo block above stays wider */}
          <nav
            className="flex w-full max-w-[480px] flex-col sm:max-w-[520px]"
            style={{ gap: "0.55rem", perspective: "800px", pointerEvents: menusIn ? "auto" : "none" }}
          >
            {MENU_ITEMS.map((item, i) => {
              const Icon = item.icon
              const isActive = activeIdx === i
              const isHref = item.id !== "quit"

              const card = (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.9rem",
                    padding: "0.85rem 1rem",
                    borderRadius: 16,
                    cursor: "pointer",
                    userSelect: "none",
                    background: isActive
                      ? `linear-gradient(135deg, rgba(255,255,255,0.13) 0%, ${item.accentDim} 100%)`
                      : "rgba(255,255,255,0.065)",
                    border: `1px solid ${isActive ? `rgba(255,255,255,0.2)` : "rgba(255,255,255,0.08)"}`,
                    borderLeft: `3px solid ${isActive ? item.accent : "transparent"}`,
                    boxShadow: isActive ? `0 4px 28px ${item.glow}, 0 1px 0 rgba(255,255,255,0.06) inset` : "none",
                    backdropFilter: "blur(12px)",
                    transition: "background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, transform 0.18s ease",
                    transform: isActive ? "translateX(3px)" : "translateX(0)",
                    opacity: menusIn ? 1 : 0,
                    animation: menusIn && !reduceMotion ? `ethicare-splash-menu-row 0.6s cubic-bezier(0.22,1,0.36,1) ${120 + i * 70}ms both` : undefined,
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}
                  onClick={() => {
                    if (item.id === "quit") {
                      if (typeof window !== "undefined" && window.history.length > 1) {
                        router.back()
                      } else {
                        router.push("/cases")
                      }
                    }
                  }}
                >
                  {/* Icon pill */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isActive ? item.accent : "rgba(255,255,255,0.08)",
                      transition: "background 0.22s ease",
                    }}
                  >
                    <Icon
                      style={{
                        width: 18,
                        height: 18,
                        color: isActive ? "#fff" : item.accent,
                        transition: "color 0.22s ease",
                      }}
                    />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: isActive ? "#fff" : "rgba(255,255,255,0.9)",
                        transition: "color 0.22s",
                        lineHeight: 1.25,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.38)",
                        transition: "color 0.22s",
                        marginTop: 2,
                      }}
                    >
                      {item.sub}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight
                    style={{
                      width: 15,
                      height: 15,
                      flexShrink: 0,
                      color: isActive ? item.accent : "rgba(255,255,255,0.2)",
                      transform: isActive ? "translateX(2px)" : "translateX(0)",
                      transition: "color 0.22s, transform 0.22s",
                    }}
                  />
                </div>
              )

              return isHref ? (
                <Link key={item.id} href={item.href} style={{ display: "block", textDecoration: "none" }}>
                  {card}
                </Link>
              ) : (
                <div key={item.id}>{card}</div>
              )
            })}
          </nav>

          {/* Footer */}
          <p
            style={{
              marginTop: "1.5rem",
              fontSize: "0.68rem",
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.04em",
              opacity: menusIn ? 1 : 0,
              transition: "opacity 0.6s ease 0.5s",
              textAlign: "center",
            }}
          >
            EthiCare v1.0 · Moroccan Medical Ethics · 50 Cases
          </p>
        </div>
      )}
    </div>
  )
}