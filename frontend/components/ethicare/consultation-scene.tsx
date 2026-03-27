"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"

type Side = "patient" | "doctor"

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

/**
 * Consultation figures: SVG by default. For a HeyGen (or any) demo clip, set
 * `demoVideoUrl` + `demoVideoSide` (legacy) and point `NEXT_PUBLIC_ETHICARE_DEMO_AVATAR_VIDEO_URL` at your MP4/WebM
 * (e.g. exported from HeyGen, placed under `public/...` or a CDN URL).
 *
 * Prefer the side-specific props `doctorDemoVideoUrl` / `patientDemoVideoUrl` so the clip matches who is speaking.
 */
export default function ConsultationScene({
  doctorSpeaking,
  patientSpeaking,
  ambientTension = false,
  doctorDemoVideoUrl,
  patientDemoVideoUrl,
  doctorDemoVideoPoster,
  patientDemoVideoPoster,
  // Legacy single-clip mode (kept for backward compatibility).
  demoVideoUrl,
  demoVideoSide = "patient",
  demoVideoPoster,
  patientVideoInteractive,
  patientVideoPlaying,
  patientVideoMuted,
  patientVideoLoop,
  certificateSoloLayout,
  /** Remount patient <video> when this changes (same file, new beat — e.g. doctor → patient). */
  patientVideoMountKey,
}: {
  doctorSpeaking: boolean
  patientSpeaking: boolean
  /** Live complication: both figures soften; vignette suggests “something else is happening”. */
  ambientTension?: boolean
  /** Doctor figure demo clip (HeyGen export, etc.). Empty/unset keeps SVG scene for the doctor. */
  doctorDemoVideoUrl?: string | null
  /** Patient figure demo clip (HeyGen export, etc.). Empty/unset keeps SVG scene for the patient. */
  patientDemoVideoUrl?: string | null
  /** Optional poster images for faster first paint. */
  doctorDemoVideoPoster?: string | null
  patientDemoVideoPoster?: string | null

  /** Legacy: Single demo avatar clip (HeyGen export, etc.). Empty/unset keeps full SVG scene. */
  demoVideoUrl?: string | null
  /** Legacy: Which figure the demo video replaces. */
  demoVideoSide?: Side
  /** Legacy: Optional poster image URL for faster first paint. */
  demoVideoPoster?: string | null

  patientVideoInteractive?: boolean
  patientVideoPlaying?: boolean
  patientVideoMuted?: boolean
  patientVideoLoop?: boolean
  certificateSoloLayout?: boolean
  patientVideoMountKey?: string | null
}) {
  const reduceMotion = usePrefersReducedMotion()
  // We still read the preference, but keep avatars enabled for this simulation screen.
  void reduceMotion

  const resolvedDoctorVideoUrl =
    doctorDemoVideoUrl?.trim() ||
    (demoVideoUrl?.trim() && demoVideoSide === "doctor" ? demoVideoUrl : undefined)

  const resolvedPatientVideoUrl =
    patientDemoVideoUrl?.trim() ||
    (demoVideoUrl?.trim() && demoVideoSide === "patient" ? demoVideoUrl : undefined)

  const resolvedDoctorPoster =
    doctorDemoVideoPoster?.trim() ||
    (demoVideoPoster?.trim() && demoVideoSide === "doctor" ? demoVideoPoster : undefined)

  const resolvedPatientPoster =
    patientDemoVideoPoster?.trim() ||
    (demoVideoPoster?.trim() && demoVideoSide === "patient" ? demoVideoPoster : undefined)

  const [doctorVideoFailed, setDoctorVideoFailed] = useState(false)
  const [patientVideoFailed, setPatientVideoFailed] = useState(false)

  useEffect(() => setDoctorVideoFailed(false), [resolvedDoctorVideoUrl])
  useEffect(() => setPatientVideoFailed(false), [resolvedPatientVideoUrl])

  const onDoctorVideoError = useCallback(() => setDoctorVideoFailed(true), [])
  const onPatientVideoError = useCallback(() => setPatientVideoFailed(true), [])

  // Always show the avatar video when we have a clip, and use `patientSpeaking` / `doctorSpeaking`
  // to control opacity/scale (so you never see silhouettes during the decision UI).
  const showPatientVideo = Boolean(resolvedPatientVideoUrl?.trim()) && !patientVideoFailed
  const showDoctorVideo = Boolean(resolvedDoctorVideoUrl?.trim()) && !doctorVideoFailed
  const linkedSceneMode = showDoctorVideo && showPatientVideo
  const soloPatientMode = showPatientVideo && !showDoctorVideo
  const certSoloLayout = Boolean(certificateSoloLayout && soloPatientMode)

  const patientVideoRef = useRef<HTMLVideoElement | null>(null)
  const patientInteractive = Boolean(patientVideoInteractive && showPatientVideo)
  const patientVideoReactKey =
    patientVideoMountKey?.trim() || resolvedPatientVideoUrl || "patient-video"

  useEffect(() => {
    const el = patientVideoRef.current
    if (!el || !patientInteractive) return
    el.volume = 1
    if (patientVideoPlaying) {
      void el.play().catch(() => {
        /* autoplay policy / decode — caller may prime with user gesture */
      })
    } else {
      el.pause()
    }
  }, [patientInteractive, patientVideoPlaying, patientVideoReactKey])

  const onPatientVideoCanPlay = useCallback(() => {
    if (!patientInteractive || !patientVideoPlaying) return
    void patientVideoRef.current?.play().catch(() => {})
  }, [patientInteractive, patientVideoPlaying, patientVideoReactKey])

  // Parent reserves space above the UI bar; keep figures anchored in that band.
  const patientWrap = `${
    certSoloLayout
      ? "absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[min(92%,920px)] h-[100%] px-2 sm:px-4"
      : soloPatientMode
        ? "absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[66%] h-[100%]"
        : "absolute right-[2%] bottom-[6%] w-[44%] h-[98%]"
  } transition-all duration-500 flex items-end justify-center ${
    ambientTension
      ? "opacity-55 scale-[0.98]"
      : patientSpeaking
        ? "opacity-100 scale-100"
        : "opacity-70 scale-[0.985]"
  }`

  const doctorWrap = `absolute left-[3%] bottom-[6%] w-[42%] h-[98%] transition-all duration-500 flex items-end justify-center ${
    ambientTension
      ? "opacity-55 scale-[0.98]"
      : doctorSpeaking
        ? "opacity-100 scale-100"
        : "opacity-65 scale-[0.985]"
  }`

  return (
    <>
      {ambientTension ? (
        <div
          className="absolute inset-0 z-[5] pointer-events-none animate-pulse"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 50% 100%, rgba(180,60,20,0.22), transparent 55%), radial-gradient(circle at 50% 40%, rgba(245,158,11,0.08), transparent 45%)",
          }}
          aria-hidden
        />
      ) : null}

      {/* Clinician (left) */}
      <div className={doctorWrap} aria-hidden>
        {showDoctorVideo && resolvedDoctorVideoUrl ? (
          <div className="relative h-full w-full max-h-full flex items-end justify-center overflow-hidden">
            <video
              key={resolvedDoctorVideoUrl}
              className={`h-full max-h-full w-full max-w-[min(100%,min(520px,48vw))] object-contain object-bottom origin-bottom ${
                linkedSceneMode ? "scale-[1.24]" : "scale-[1.28]"
              }`}
              src={resolvedDoctorVideoUrl}
              poster={resolvedDoctorPoster ?? undefined}
              playsInline
              muted
              loop
              autoPlay
              onError={onDoctorVideoError}
            />
          </div>
        ) : null}
      </div>

      {/* Patient (right) */}
      <div className={patientWrap} aria-hidden>
        {showPatientVideo && resolvedPatientVideoUrl ? (
          <div className="relative h-full w-full max-h-full flex items-end justify-center overflow-hidden">
            <video
              ref={patientVideoRef}
              key={patientVideoReactKey}
              className={`h-full max-h-full w-full ${
                certSoloLayout
                  ? "max-w-full object-contain object-center object-bottom"
                  : soloPatientMode
                    ? "max-w-[min(100%,900px)] object-cover object-right-bottom"
                    : "max-w-[min(100%,min(580px,54vw))] object-contain object-bottom"
              } origin-bottom ${
                certSoloLayout
                  ? "scale-100 sm:scale-[1.03]"
                  : linkedSceneMode
                    ? "scale-[1.26]"
                    : soloPatientMode
                      ? "scale-[1.05]"
                      : "scale-[1.3]"
              }`}
              src={resolvedPatientVideoUrl}
              poster={resolvedPatientPoster ?? undefined}
              style={soloPatientMode && !certSoloLayout ? { clipPath: "inset(0% 0% 0% 34%)" } : undefined}
              playsInline
              muted={patientInteractive ? (patientVideoMuted ?? false) : true}
              loop={patientInteractive ? (patientVideoLoop ?? false) : true}
              autoPlay={!patientInteractive}
              onCanPlay={patientInteractive ? onPatientVideoCanPlay : undefined}
              onError={onPatientVideoError}
            />
          </div>
        ) : (
          <svg
            viewBox="0 0 240 440"
            className="h-full w-full max-h-full object-contain object-bottom drop-shadow-[0_12px_32px_rgba(15,45,58,0.18)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse cx="120" cy="88" rx="40" ry="46" fill="#E8C4A8" />
            <path
              d="M78 132 Q120 122 162 132 L175 220 L65 220 Z"
              fill="#E2E8F0"
              stroke="#CBD5E1"
              strokeWidth="2"
            />
            <path d="M65 220 L58 395 L182 395 L175 220" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="2" />
          </svg>
        )}
      </div>
    </>
  )
}
