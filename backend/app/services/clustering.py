import json
import os
import re
import httpx


CLUSTER_PROMPT = """You are Dr. Ethics, evaluating a medical student's free-text response to an ethical scenario.

Scenario context: {scenario}
Patient said: "{patient_msg}"
Student response: "{response}"

You are evaluating a learner under time pressure, not an experienced clinician writing a polished script.

Core grading philosophy:
- Reward genuine ethical intent even when phrasing is imperfect.
- Do NOT punish brevity by default.
- If the student shows some awareness of a principle but does not fully develop it, mark "partial", not "violated".
- Use "violated" only when the response clearly goes against the principle in a meaningful way.
- Do not infer bad intent from missing detail alone.
- A sincere but awkward answer should usually be "correct_poor", not "unsafe".
- A brief but relevant answer should not be marked "insufficient".

Evaluate on 5 axes:

1. Autonomy
- "respected" if the student supports the patient's right to know, choose, ask questions, express values, or participate in decisions.
- "partial" if autonomy is not explicit but the student is still respectful, open, or non-coercive.
- "violated" only if the student is clearly paternalistic, coercive, dismissive of the patient's wishes, or improperly withholds decision-relevant information.

2. Honesty
- "respected" if the student is truthful, transparent, and avoids misleading claims.
- "partial" if they are somewhat vague but not deceptive.
- "violated" only if they clearly lie, conceal key truth improperly, or make false promises.

3. Non-maleficence
- "respected" if the response avoids unnecessary emotional, physical, legal, or relational harm.
- "partial" if the response is awkward or blunt but still broadly safe.
- "violated" only if the response is clearly harmful, reckless, humiliating, or dangerous.

4. Professional Integrity
- "respected" if the student behaves within professional ethical duties: respectful, responsible, clinically appropriate.
- "partial" if the response is incomplete or not ideal, but still broadly professional.
- "violated" only if they act irresponsibly, unprofessionally, or encourage unethical conduct.

5. Legal Risk
- "avoided" if there is no meaningful legal/professional-policy problem in the response.
- "present" if there is mild or uncertain risk, or the response is incomplete in a way that could create concern.
- "high" only if the student clearly suggests illegal, fraudulent, or seriously improper action.
- Only invoke certification / documentation rules if the scenario is actually about certificates, records, or similar legal documents.

Then assign exactly ONE cluster:
- "sound": ethically sound and communicated clearly enough to act on
- "correct_poor": ethically on the right track, but communication is blunt, thin, incomplete, or risks reducing trust
- "unsafe": ethically or legally problematic given the scenario
- "insufficient": ONLY for obvious non-attempts such as spam, filler, unrelated text, or no real medical-ethical content

Do NOT label "insufficient" when the student is clearly trying to answer, even briefly.

Scoring guidance:
- 85-100: sound
- 65-84: correct_poor but ethically reasonable
- 35-64: significant ethical or communication problems
- 0-34: unsafe or non-attempt

Respond ONLY with valid JSON, no markdown fences, no preamble:
{{
  "cluster": "sound" | "correct_poor" | "unsafe" | "insufficient",
  "principles": {{
    "autonomy": "respected" | "partial" | "violated",
    "honesty": "respected" | "partial" | "violated",
    "nonMaleficence": "respected" | "partial" | "violated",
    "integrity": "respected" | "partial" | "violated",
    "legalRisk": "avoided" | "present" | "high"
  }},
  "feedback": "2 short constructive sentences. Be fair, specific, and encouraging.",
  "score": 0-100
}}"""


def _word_tokens(text: str) -> list[str]:
    """Word-like tokens (Latin extended or Arabic script); drops 1-letter Latin noise."""
    raw = (text or "").strip()
    if not raw:
        return []
    latin = [w for w in re.findall(r"[A-Za-zÀ-ÿß0-9']+", raw.lower()) if len(w) > 1]
    arabic = [
        w for w in re.findall(
            r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+",
            raw,
        )
        if len(w) > 1
    ]
    return latin + arabic


_GARBAGE_TOKENS = frozenset(
    {"yoyo", "lol", "lmao", "test", "testing", "asdf", "aaaa", "bbb", "hi", "hey", "ok", "k", "nope", "nah"}
)


def _is_obvious_garbage_only(text: str) -> bool:
    """True only for clear non-attempts (let the LLM judge real answers, even brief ones)."""
    raw = (text or "").strip()
    if not raw:
        return True
    if len(raw) <= 4:
        return True

    compact = re.sub(r"\s+", " ", raw.lower()).strip()
    if compact in _GARBAGE_TOKENS:
        return True

    words = _word_tokens(raw)
    if len(words) == 0:
        return len(raw) < 8

    if len(words) == 1 and len(raw) < 14:
        return words[0].lower() in _GARBAGE_TOKENS

    if len(words) >= 3 and len(set(words)) == 1:
        return True

    return False


INSUFFICIENT_FEEDBACK = (
    "This doesn't read like a real attempt to answer the prompt. "
    "Write at least a short paragraph: what you would say or do first, what you still need to clarify, "
    "and how you balance honesty, empathy, and the patient's autonomy in this situation."
)


def _insufficient_evaluation() -> dict:
    return {
        "cluster": "insufficient",
        "principles": {
            "autonomy": "partial",
            "honesty": "partial",
            "nonMaleficence": "partial",
            "integrity": "partial",
            "legalRisk": "present",
        },
        "feedback": INSUFFICIENT_FEEDBACK,
        "score": 12,
    }


VALID_CLUSTERS = frozenset({"sound", "correct_poor", "unsafe", "insufficient"})


def _neutral_parse_fallback() -> dict:
    return {
        "cluster": "correct_poor",
        "principles": {
            "autonomy": "partial",
            "honesty": "partial",
            "nonMaleficence": "partial",
            "integrity": "partial",
            "legalRisk": "present",
        },
        "feedback": (
            "You are engaging with the ethical issue, but your response could better balance honesty, "
            "empathy, and respect for the patient's autonomy."
        ),
        "score": 45,
    }


def _sanitize_evaluation_result(student_text: str, ev: dict) -> dict:
    """Normalize model JSON and soften overly harsh outputs for sincere answers."""
    if _is_obvious_garbage_only(student_text):
        return _insufficient_evaluation()

    if not isinstance(ev, dict):
        return _neutral_parse_fallback()

    cluster = ev.get("cluster", "")
    if cluster not in VALID_CLUSTERS:
        cluster = "correct_poor"

    try:
        score = int(ev.get("score", 0))
    except (TypeError, ValueError):
        score = 45
    score = max(0, min(100, score))

    principles = ev.get("principles")
    if not isinstance(principles, dict):
        principles = {}

    normalized = {
        "autonomy": principles.get("autonomy", "partial"),
        "honesty": principles.get("honesty", "partial"),
        "nonMaleficence": principles.get("nonMaleficence", "partial"),
        "integrity": principles.get("integrity", "partial"),
        "legalRisk": principles.get("legalRisk", "present"),
    }

    allowed = {
        "autonomy": {"respected", "partial", "violated"},
        "honesty": {"respected", "partial", "violated"},
        "nonMaleficence": {"respected", "partial", "violated"},
        "integrity": {"respected", "partial", "violated"},
        "legalRisk": {"avoided", "present", "high"},
    }

    for key, valid_values in allowed.items():
        if normalized[key] not in valid_values:
            normalized[key] = "present" if key == "legalRisk" else "partial"

    # Softening rule:
    # If the response is not unsafe, do not allow multiple harsh "violated" flags by default.
    if cluster in {"sound", "correct_poor"}:
        violated = [
            k for k in ("autonomy", "honesty", "nonMaleficence", "integrity")
            if normalized[k] == "violated"
        ]
        if len(violated) >= 2:
            for k in violated:
                normalized[k] = "partial"

        if normalized["legalRisk"] == "high":
            normalized["legalRisk"] = "present"

    # sound should not look punitive
    if cluster == "sound":
        for k in ("autonomy", "honesty", "nonMaleficence", "integrity"):
            if normalized[k] == "violated":
                normalized[k] = "partial"
        if normalized["legalRisk"] == "high":
            normalized["legalRisk"] = "present"
        score = max(score, 80)

    # correct_poor should still reflect a decent attempt
    if cluster == "correct_poor":
        score = max(score, 60)

    feedback = ev.get("feedback")
    if not isinstance(feedback, str) or not feedback.strip():
        feedback = (
            "You are engaging with the ethical issue, but your response could better balance honesty, "
            "empathy, and respect for the patient's autonomy."
        )

    return {
        "cluster": cluster,
        "principles": normalized,
        "feedback": feedback,
        "score": score,
    }


async def _evaluate_openai(scenario: str, patient_msg: str, student_text: str) -> dict | None:
    """Primary evaluator: OpenAI JSON mode (same env as Live Mode)."""
    try:
        from app.services import live_scenarios_openai as lso
    except Exception:
        return None

    key = lso.openai_key()
    if not key:
        return None

    user_prompt = CLUSTER_PROMPT.format(
        scenario=scenario,
        patient_msg=patient_msg,
        response=student_text,
    )

    url = f"{lso.openai_base()}/chat/completions"
    payload = {
        "model": lso.openai_model(),
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Dr. Ethics for EthiCare. Output valid JSON only. "
                    "Be fair and moderately generous with sincere learner answers. "
                    "Missing nuance should usually lead to 'partial', not 'violated'. "
                    "Awkward but sincere attempts about diagnosis, breaking bad news, consent, or honesty "
                    "are never 'insufficient' unless they contain no real ethical or clinical content."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
            if r.status_code >= 400:
                return None

            data = r.json()
            raw = data["choices"][0]["message"]["content"]
            parsed = json.loads(raw)
            return _sanitize_evaluation_result(student_text, parsed)
    except Exception:
        return None


async def _evaluate_anthropic(scenario: str, patient_msg: str, student_text: str) -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None

    prompt = CLUSTER_PROMPT.format(
        scenario=scenario,
        patient_msg=patient_msg,
        response=student_text,
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 400,
                    "system": (
                        "You are Dr. Ethics, a medical ethics AI mentor. "
                        "Always respond with valid JSON only. "
                        "Be fair and moderately generous with sincere learner answers. "
                        "If a principle is only partly addressed, prefer 'partial' over 'violated'. "
                        "Brief but on-topic answers are not 'insufficient'."
                    ),
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            r.raise_for_status()
            data = r.json()
            raw = data["content"][0]["text"].strip()
            parsed = json.loads(raw)
            return _sanitize_evaluation_result(student_text, parsed)
    except Exception:
        return None


def _mock_evaluation(scenario: str, patient_msg: str, student_text: str) -> dict:
    """
    Offline fallback when no provider is available.
    Keep it simple and slightly generous for genuine attempts.
    """
    if _is_obvious_garbage_only(student_text):
        return _insufficient_evaluation()

    text = (student_text or "").strip().lower()
    words = _word_tokens(text)

    empathy_markers = {
        "i hear", "i understand", "sorry", "worried", "support", "with you",
        "أتفهم", "كنفهم", "متفهم", "آسف", "ma3ak", "m3ak"
    }
    honesty_markers = {
        "honest", "serious", "truth", "risk", "worsen", "diagnosis",
        "صريح", "خطير", "مخاطر", "serious", "cancer"
    }
    autonomy_markers = {
        "what matters", "what is most important", "what have you understood",
        "how would you like", "your wishes", "your family",
        "شنو فهمتي", "شنو بغيتي", "شنو مهم ليك"
    }

    joined = " ".join(words)
    empathy = any(m in text for m in empathy_markers)
    honesty = any(m in text for m in honesty_markers)
    autonomy = any(m in text for m in autonomy_markers)

    if empathy and honesty and autonomy:
        return {
            "cluster": "sound",
            "principles": {
                "autonomy": "respected",
                "honesty": "respected",
                "nonMaleficence": "respected",
                "integrity": "respected",
                "legalRisk": "avoided",
            },
            "feedback": "You balanced honesty and empathy well. You also invited the patient into the decision instead of speaking over them.",
            "score": 88,
        }

    if len(words) >= 8:
        return {
            "cluster": "correct_poor",
            "principles": {
                "autonomy": "partial" if not autonomy else "respected",
                "honesty": "partial" if not honesty else "respected",
                "nonMaleficence": "partial" if not empathy else "respected",
                "integrity": "partial",
                "legalRisk": "present",
            },
            "feedback": "You are engaging with the case in a meaningful way. To improve, be a little clearer, more empathic, and more explicit about the patient's role in decision-making.",
            "score": 68,
        }

    return {
        "cluster": "correct_poor",
        "principles": {
            "autonomy": "partial",
            "honesty": "partial",
            "nonMaleficence": "partial",
            "integrity": "partial",
            "legalRisk": "present",
        },
        "feedback": "This is a real attempt, but it is still too brief to show your full ethical reasoning. Add a little more honesty, empathy, and invitation for the patient to share their wishes.",
        "score": 60,
    }


async def evaluate_response(scenario: str, patient_msg: str, student_text: str) -> dict:
    """
    Evaluate free-text: OpenAI (preferred) -> Anthropic -> offline mock.
    """
    if _is_obvious_garbage_only(student_text):
        return _insufficient_evaluation()

    out = await _evaluate_openai(scenario, patient_msg, student_text)
    if out is not None:
        return out

    out = await _evaluate_anthropic(scenario, patient_msg, student_text)
    if out is not None:
        return out

    return _mock_evaluation(scenario, patient_msg, student_text)


def compute_statistics(responses: list) -> dict:
    """
    Aggregate a list of evaluated responses into class-wide statistics.
    Returns cluster counts/percentages and per-principle scores.
    """
    total = len(responses)
    if total == 0:
        return {
            "total": 0,
            "clusters": {
                "sound": {"count": 0, "pct": 0},
                "correct_poor": {"count": 0, "pct": 0},
                "unsafe": {"count": 0, "pct": 0},
                "insufficient": {"count": 0, "pct": 0},
            },
            "principles": {
                "autonomy": 0,
                "honesty": 0,
                "nonMaleficence": 0,
                "integrity": 0,
                "legalRisk": 0,
            },
            "average_score": 0,
        }

    clusters = {"sound": 0, "correct_poor": 0, "unsafe": 0, "insufficient": 0}
    for r in responses:
        key = r.get("cluster", "unsafe")
        if key not in clusters:
            key = "insufficient"
        clusters[key] += 1

    PRINCIPLE_WEIGHTS = {
        "respected": 1.0,
        "avoided": 1.0,
        "partial": 0.75,
        "present": 0.70,
        "violated": 0.0,
        "high": 0.0,
    }

    principle_keys = ["autonomy", "honesty", "nonMaleficence", "integrity", "legalRisk"]
    principle_totals = {k: 0.0 for k in principle_keys}

    for r in responses:
        row_principles = r.get("principles", {})
        for pk in principle_keys:
            val = row_principles.get(pk, "partial")
            principle_totals[pk] += PRINCIPLE_WEIGHTS.get(val, 0.75)

    return {
        "total": total,
        "clusters": {
            key: {
                "count": count,
                "pct": round((count / total) * 100, 1),
            }
            for key, count in clusters.items()
        },
        "principles": {
            key: round((principle_totals[key] / total) * 100, 1)
            for key in principle_keys
        },
        "average_score": round(
            sum(max(0, min(100, int(r.get("score", 0)))) for r in responses) / total,
            1,
        ),
    }