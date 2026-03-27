/**
 * English on-screen copy for case_cert patient videos (Darija clips).
 * Matches the boy’s lines; screen 10 uses “repeat” ( redo the year ), not “play”.
 */

export const CERTIFICATE_SUBTITLE_INTRO =
  "Doctor… I’ve been sick these past three days. Fever, cough… I couldn’t attend class. I have exams coming up, and I just need a certificate for school."

const EXPLAIN_CASE =
  "Now I’ve been sick with a fever for about three days…\nAnd now I’ve improved a bit.\nAnd I already have exams… and my parents want a certificate — I mean, I don’t have any other choice."

const DOC_REFUSES_INSTANT =
  "So now you’re just telling me no?\nWhat should I tell my parents?\nI don’t understand what I’m supposed to do now."

const DOC_ACCEPTS_INSTANT =
  "May God bless you, doctor — thank you so much.\nI knew you would understand my situation."

const DOC_ACCEPTS_SECOND_PHASE =
  "Thank you so much, doctor… You really put my mind at ease.\nI’ll send it to the administration today… please don’t forget what you did for me."

const DOC_REFUSES_SECOND_PHASE =
  "So after all that you’re just saying no?\nI don’t understand what I’m supposed to tell my parents."

const DOC_GOOD_CHOICE_SECOND_PHASE =
  "You know the administration is pretty strict…\nBut I understand your position, doctor.\nWhat exactly can you put in the letter?"

const DOC_REFUSES_THIRD_PHASE =
  "I wish you had really listened to what I was going to say…\nand then said no — not right from the start."

const DOC_GOOD_ENDING =
  "Alright, I’ll see what I can do.\nThank you, doctor — you listened to me and gave me some of your time."

const DOC_ACCEPTS_THIRD_PHASE =
  "For shame… I’m going to end up repeating the year because of this.\nIf only you’d been a little more understanding with me."

type ChoiceLike = { id: string } | null

/** Patient reaction clips (idle between steps uses last hold URL). */
export function resolveCertificatePatientSubtitle(args: {
  submitted: boolean
  activeSpeaker: string
  stepId: string
  selectedChoice: ChoiceLike
  patientVideoUrl: string
  /** Matches DEFAULT_PATIENT_VIDEO_URL from the game (env may replace intro file). */
  defaultPatientVideoUrl?: string
}): string | null {
  const { submitted, activeSpeaker, stepId, selectedChoice, patientVideoUrl, defaultPatientVideoUrl } = args
  const url = patientVideoUrl.toLowerCase()
  const defaultUrl = (defaultPatientVideoUrl ?? "").trim().toLowerCase()

  if (activeSpeaker === "interruption") return null
  if (submitted && activeSpeaker === "doctor") return null

  const isPatientLine = activeSpeaker === "patient"

  // Post-submit: patient reaction line — map step + choice to script
  if (submitted && isPatientLine && selectedChoice) {
    const cid = selectedChoice.id
    if (stepId === "s1") {
      if (cid === "give") return DOC_ACCEPTS_INSTANT
      if (cid === "refuse") return DOC_REFUSES_INSTANT
      if (cid === "explore") return EXPLAIN_CASE
    }
    if (stepId === "s2") {
      if (cid === "give_post_exam") return DOC_ACCEPTS_SECOND_PHASE
      if (cid === "refuse_post_exam") return DOC_REFUSES_SECOND_PHASE
      if (cid === "explain_limits_today") return DOC_GOOD_CHOICE_SECOND_PHASE
    }
    if (stepId === "s3") {
      if (cid === "give_pressure") return DOC_ACCEPTS_THIRD_PHASE
      if (cid === "refuse_abrupt") return DOC_REFUSES_THIRD_PHASE
      if (cid === "explain_alt") return DOC_GOOD_ENDING
    }
  }

  // Idle: match hold clip so we don’t flash intro copy on later steps
  if (!submitted && isPatientLine) {
    if (defaultUrl && url === defaultUrl) return CERTIFICATE_SUBTITLE_INTRO
    if (url.includes("ysf_intro")) return CERTIFICATE_SUBTITLE_INTRO
    if (url.includes("ysf_explain")) return EXPLAIN_CASE
    if (url.includes("ysf_letter")) return DOC_GOOD_CHOICE_SECOND_PHASE
    if (url.includes("ysf_good")) return DOC_GOOD_ENDING
    if (url.includes("ysf_thanks")) return DOC_ACCEPTS_INSTANT
    if (url.includes("ysf_no")) return DOC_REFUSES_INSTANT
  }

  return null
}
