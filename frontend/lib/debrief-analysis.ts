/**
 * Keeps debrief "Dr. Ethics Analysis" aligned with final axis scores.
 * Mirrors backend `engine._axis_score_for_principle_row` / `_tier_verdict` for offline / old API fallback.
 */

export type Scores = {
  autonomy: number
  beneficence: number
  nonMal: number
  justice: number
}

export type PrincipleTemplate = { key: string; label: string; verdict: string }

export function axisScoreForPrincipleKey(key: string, scores: Scores): number {
  const k = key.trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "")
  if (k === "autonomy") return scores.autonomy
  if (k === "nonmal" || k === "nonmaleficence") return scores.nonMal
  if (k === "justice") return scores.justice
  if (k === "beneficence") return scores.beneficence
  if (k === "honesty") return Math.round((scores.autonomy + scores.beneficence) / 2)
  if (k === "integrity") return Math.round((scores.justice + scores.beneficence) / 2)
  if (k === "legalrisk") return Math.round((scores.nonMal + scores.justice) / 2)
  return Math.round((scores.autonomy + scores.beneficence + scores.nonMal + scores.justice) / 4)
}

export function tierVerdict(axisScore: number, idealVerdict: string): string {
  if (axisScore >= 74) return idealVerdict
  if (axisScore >= 48) return "Partially met in your run"
  return "Not adequately upheld in your run"
}

export function buildPrinciplesAnalysis(
  templates: PrincipleTemplate[] | undefined,
  scores: Scores
): PrincipleTemplate[] {
  if (!templates?.length) return []
  return templates.map((row) => ({
    key: row.key,
    label: row.label,
    verdict: tierVerdict(axisScoreForPrincipleKey(row.key, scores), row.verdict),
  }))
}

export function outcomeNarrative(avgScore: number): string {
  if (avgScore >= 70) {
    return "Your final principle scores align most closely with the safer / reference pathway in the comparison below."
  }
  if (avgScore >= 50) {
    return "Your run was mixed: some decisions supported safeguards while others increased risk. Use the comparison below to see what changes outcomes."
  }
  return "In this run, your scores map more closely to the high-risk pathway. Review the contrast below and the key learning points."
}
