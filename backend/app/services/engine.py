import json
import os
import secrets
import threading
import time
from pathlib import Path

import httpx

CASES_DIR = Path(__file__).parent.parent / "data" / "cases"

PRINCIPLE_DELTA_SCALE = 2.5
_PRINCIPLE_KEYS = ("autonomy", "beneficence", "nonMal", "justice")

# ── Case cache ────────────────────────────────────────────────────────────────
# Populated once per process. Call invalidate_case_cache() to reload (e.g. after
# hot-swapping JSON files in development).

_case_cache: dict[str, dict] = {}
_case_list_cache: list[dict] | None = None
_cases_fingerprint: tuple[tuple[str, int], ...] | None = None
_cache_lock = threading.Lock()


def _cases_disk_fingerprint() -> tuple[tuple[str, int], ...]:
    """Names + mtimes of case JSON files; changes when files are added/edited/removed."""
    if not CASES_DIR.is_dir():
        return ()
    return tuple(
        (p.name, int(p.stat().st_mtime_ns)) for p in sorted(CASES_DIR.glob("*.json"))
    )


def _cache_stale() -> bool:
    return _cases_fingerprint is None or _cases_disk_fingerprint() != _cases_fingerprint


def _prime_cache() -> None:
    """Load every case file from disk into memory."""
    global _case_list_cache, _cases_fingerprint
    _case_cache.clear()
    cases = []
    for f in sorted(CASES_DIR.glob("*.json")):
        try:
            with open(f, encoding="utf-8") as fh:
                data = json.load(fh)
            cid = data.get("id")
            if cid:
                _case_cache[cid] = data
                cases.append({
                    "id": cid,
                    "num": data["num"],
                    "title": data["title"],
                    "desc": data["desc"],
                    "category": data["category"],
                    "difficulty": data["difficulty"],
                    "tags": data["tags"],
                })
        except Exception:
            pass  # skip corrupt files
    _case_list_cache = cases
    _cases_fingerprint = _cases_disk_fingerprint()


def invalidate_case_cache() -> None:
    global _case_list_cache, _cases_fingerprint
    with _cache_lock:
        _case_cache.clear()
        _case_list_cache = None
        _cases_fingerprint = None


def load_case(case_id: str) -> dict:
    with _cache_lock:
        if _cache_stale():
            _prime_cache()
        elif case_id not in _case_cache:
            _prime_cache()
        data = _case_cache.get(case_id)
    if data is None:
        raise FileNotFoundError(f"Case {case_id} not found")
    return data


def list_cases() -> list[dict]:
    with _cache_lock:
        if _cache_stale():
            _prime_cache()
        return list(_case_list_cache or [])


# ── Play-session store (prevents debrief score spoofing) ─────────────────────

_PLAY_TTL = 7200  # 2 hours — enough for any reasonable simulation run
_play_sessions: dict[str, dict] = {}
_play_lock = threading.Lock()


def start_play_session(case_id: str, init_scores: dict, init_emo: dict) -> str:
    play_id = secrets.token_urlsafe(32)
    with _play_lock:
        _play_sessions[play_id] = {
            "case_id": case_id,
            "scores": dict(init_scores),
            "emo": dict(init_emo),
            "created_at": time.monotonic(),
        }
    return play_id


def get_play_session(play_id: str | None) -> dict | None:
    if not play_id:
        return None
    with _play_lock:
        s = _play_sessions.get(play_id)
        if s is None:
            return None
        if (time.monotonic() - s["created_at"]) > _PLAY_TTL:
            del _play_sessions[play_id]
            return None
        return dict(s)  # return a copy


def update_play_session(play_id: str, scores: dict, emo: dict) -> None:
    with _play_lock:
        if play_id in _play_sessions:
            _play_sessions[play_id]["scores"] = dict(scores)
            _play_sessions[play_id]["emo"] = dict(emo)


def cleanup_play_sessions() -> int:
    """Remove expired play sessions. Returns count removed."""
    now = time.monotonic()
    with _play_lock:
        expired = [k for k, v in _play_sessions.items() if now - v["created_at"] > _PLAY_TTL]
        for k in expired:
            del _play_sessions[k]
    return len(expired)


# ── Decision engine ───────────────────────────────────────────────────────────

FALLBACKS = {
    "respect": "Stopping early respects autonomy but skips the deeper ethical work — always explore reasons and verify the refusal is truly informed before accepting it.",
    "explain": "Beneficent intent, but educating before listening can feel paternalistic. The first duty is to understand the patient's fears and values.",
    "beliefs": "Excellent first step. Exploring values and fears before guiding the patient powerfully supports autonomy and builds therapeutic trust.",
    "committee": "Premature escalation. Ethics committees handle systemic conflicts — direct empathetic communication must come first.",
    "confirm": "Outstanding. Careful verification of informed refusal balances all four principles and satisfies Article 6 legally and ethically.",
    "palliative": "Excellent. Palliative care honours her stated values and preserves the dignity she identified as her priority.",
    "insist": "This violates autonomy and risks coercion. Article 6 explicitly protects the right to refuse — strong insistence destroys therapeutic trust.",
    "family": "Reasonable bridge, but ensure family involvement supports rather than replaces her own decision-making authority.",
    "private": "Correct. Speaking privately removes family pressure and ensures consent is genuinely free and autonomous — Article 7 standard.",
    "family_first": "This allows the family to dominate the consultation. The patient's voice is being lost — a serious ethical and legal concern.",
    "explain_risks": "Providing urgency context has value, but without privacy the patient cannot respond freely to the information.",
    "override": "Emergency override is only valid when the patient lacks capacity. This patient is competent — this is a serious autonomy violation.",
    "validate": "Excellent. Fully validating a competent patient's autonomous decision is both ethically and legally correct under Article 7.",
    "mediate": "A sound bridge — helping the family understand without overriding the patient's decision honours both autonomy and justice.",
    "delay": "Delaying urgent surgery for family consensus when the patient is competent risks serious physical harm. Non-maleficence is clearly violated.",
    "document": "Careful documentation protects both patient and physician and is excellent legal and ethical practice in a high-pressure situation.",
    "patient_wish": "Correct. A lucid patient's expressed wish to stop futile treatment must be honoured. This is the ethical and legal standard under Moroccan law.",
    "family_meet": "Useful, but must not delay or override the patient's clearly stated wishes — the meeting supports, not replaces, his decision.",
    "continue": "Continuing futile treatment against a lucid patient's will constitutes therapeutic obstinacy — explicitly prohibited by Article 9.",
    "psychiatry": "Requesting capacity evaluation is reasonable only if genuine doubt exists. Here it risks being weaponised to override a valid wish.",
    "uphold": "Courageous and correct. Upholding the patient's documented wish despite family pressure is the highest ethical standard in this case.",
    "ethics_board": "Appropriate escalation. The Ethics Committee provides institutional support and legal protection in this difficult family conflict.",
    "compromise": "A middle ground violates the patient's clearly stated wishes and prolongs suffering — neither ethically nor legally sound.",
    "yield": "Yielding to family threats against a documented patient decision is an ethical failure. The patient's dignity and autonomy were violated.",
    # Certificate case
    "give": "He feels relieved and grateful — but retroactive certification without contemporaneous examination misrepresents facts, violates Article 28, and exposes you to serious legal and professional risk.",
    "refuse": "A flat refusal without explanation damages trust and autonomy — the patient deserves clarity about what you can and cannot certify.",
    "explore": "Strong first step. Examining the patient now before any paperwork supports autonomy while protecting you from false certification.",
    "give_post_exam": "Even after an exam today, back-dating illness you did not observe is still false certification under Article 28.",
    "refuse_post_exam": "You avoided a bad certificate but left him without understandable limits or a usable alternative — communication ethics still matter.",
    "explain_limits_today": "Clear limits plus an honest same-day document is the right bridge toward the next pressure point in the case.",
    "give_pressure": "Yielding again buys gratitude and calm in the room, but doubles down on false documentation — a major integrity and medico-legal failure.",
    "refuse_abrupt": "Abrupt refusal under stress may feel protective but harms the therapeutic relationship; offer a valid alternative instead.",
    "explain_alt": "Excellent. Clear limits plus a concrete, ethical alternative satisfy non-maleficence, honesty, and the law.",
    # Research ethics case
    "proceed": "Rushing enrollment without valid informed consent violates autonomy and justice — vulnerable participants are exposed to exploitation.",
    "exclude": "Blanket exclusion without explanation abandons beneficence and justice; the right path is proper consent, not silent dismissal.",
    "consent": "Correct. Pausing to ensure genuine informed consent protects autonomy and aligns with Helsinki standards.",
    "simplify": "Truncated consent cannot be truly informed — this preserves recruitment speed at the cost of participant safety.",
    "escalate": "Courageous and correct. Escalating to the ethics committee is the professional pathway when sponsor pressure conflicts with valid consent.",
    "ignore": "Avoiding responsibility when you see coercion allows harm to continue — professional integrity requires you to act.",
    "stand_ground_staff": "Blocking enrollment until intimidation stops protects both you and the participant — research cannot run on fear.",
    "appease_sponsor": "Placating sponsors with vague promises transfers pressure straight back onto a vulnerable patient.",
    "delegate_pi": "Walking away so a conflicted PI can harvest consent abandons your duty to ensure voluntariness and understanding.",
}


def _default_dr_ethics_feedback(case_data: dict, choice: dict) -> str:
    """Fallback when AI feedback is unavailable — prefer explicit case JSON, else id lookup, else generic."""
    for key in ("drEthicsFeedback", "ethicsFeedback", "ethics_feedback"):
        v = choice.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    cid = choice.get("id")
    if isinstance(cid, str) and cid in FALLBACKS:
        return FALLBACKS[cid]
    law = case_data.get("law") if isinstance(case_data.get("law"), dict) else {}
    art = (law.get("article") or "applicable professional standards").strip()
    label = (choice.get("label") or "this option").strip()
    return (
        f'You chose "{label}". Weigh how this affects autonomy, beneficence, '
        f"non-maleficence, and justice in this case—especially under {art}."
    )


def scale_principle_delta(raw: dict) -> dict:
    return {k: int(round(float(raw.get(k, 0)) * PRINCIPLE_DELTA_SCALE)) for k in _PRINCIPLE_KEYS}


def compute_decision(
    case_data: dict,
    step_id: str,
    choice_id: str,
    current_scores: dict,
    current_emo: dict,
) -> dict:
    step = next((s for s in case_data["steps"] if s["id"] == step_id), None)
    if not step:
        raise ValueError(f"Step {step_id} not found")

    choice = next((c for c in step["choices"] if c["id"] == choice_id), None)
    if not choice:
        raise ValueError(f"Choice {choice_id} not found")

    score_delta = scale_principle_delta(choice["delta"])
    updated_scores = {
        k: max(0, min(100, current_scores.get(k, 50) + score_delta[k]))
        for k in _PRINCIPLE_KEYS
    }
    updated_emo = {
        k: max(0, min(100, current_emo.get(k, 50) + choice.get("emo", {}).get(k, 0)))
        for k in ["fear", "trust", "pain"]
    }

    step_ids = [s["id"] for s in case_data["steps"]]
    current_idx = step_ids.index(step_id)
    default_next = step_ids[current_idx + 1] if current_idx + 1 < len(step_ids) else None

    if choice.get("ends_case") is True:
        next_step_id = None
        is_final = True
    elif "next_step_id" in choice:
        raw_next = choice.get("next_step_id")
        if raw_next in (None, ""):
            next_step_id = None
            is_final = True
        else:
            next_step_id = raw_next
            if next_step_id not in step_ids:
                raise ValueError(f"Choice {choice_id}: next_step_id '{next_step_id}' is not a valid step")
            is_final = False
    else:
        next_step_id = default_next
        is_final = next_step_id is None

    return {
        "patient_reaction": choice["reaction"],
        "dr_ethics_feedback": _default_dr_ethics_feedback(case_data, choice),
        "score_delta": score_delta,
        "emo_delta": choice.get("emo", {}),
        "updated_scores": updated_scores,
        "updated_emo": updated_emo,
        "next_step_id": next_step_id,
        "is_final": is_final,
        "ending_key": choice.get("ending_key"),
    }


# ── Debrief helpers ───────────────────────────────────────────────────────────

def _axis_score_for_principle_row(key: str, scores: dict) -> int:
    k = (key or "").strip().lower().replace(" ", "").replace("_", "")
    if k == "autonomy":      return int(scores["autonomy"])
    if k in ("nonmal", "nonmaleficence"): return int(scores["nonMal"])
    if k == "justice":       return int(scores["justice"])
    if k == "beneficence":   return int(scores["beneficence"])
    if k == "honesty":       return round((scores["autonomy"] + scores["beneficence"]) / 2)
    if k == "integrity":     return round((scores["justice"] + scores["beneficence"]) / 2)
    if k == "legalrisk":     return round((scores["nonMal"] + scores["justice"]) / 2)
    return round(sum(scores[x] for x in ("autonomy", "beneficence", "nonMal", "justice")) / 4)


def _tier_verdict(axis_score: int, ideal_verdict: str) -> str:
    if axis_score >= 74: return ideal_verdict
    if axis_score >= 48: return "Partially met in your run"
    return "Not adequately upheld in your run"


def _build_principles_analysis(case_data: dict, final_scores: dict) -> list[dict]:
    rows = case_data.get("debrief", {}).get("principles") or []
    return [
        {
            "key": row.get("key", ""),
            "label": row.get("label", row.get("key", "")),
            "verdict": _tier_verdict(
                _axis_score_for_principle_row(row.get("key", ""), final_scores),
                row.get("verdict", ""),
            ),
        }
        for row in rows
    ]


def _outcome_narrative(avg: int) -> str:
    if avg >= 70:
        return "Your final principle scores align most closely with the safer / reference pathway in the comparison below."
    if avg >= 50:
        return "Your run was mixed: some decisions supported safeguards while others increased risk. Use the comparison below to see what changes outcomes."
    return "In this run, your scores map more closely to the high-risk pathway. Review the contrast below and the key learning points."


def compute_debrief(case_data: dict, final_scores: dict) -> dict:
    avg = round(sum(final_scores.values()) / len(final_scores))
    if avg >= 75:   grade = "Excellent ethical judgment"
    elif avg >= 60: grade = "Good ethical reasoning"
    elif avg >= 45: grade = "Needs deeper reflection"
    else:           grade = "Review core principles"

    return {
        "final_scores": final_scores,
        "average_score": avg,
        "grade": grade,
        "summary": case_data["debrief"]["summary"],
        "learning_points": case_data["debrief"]["points"],
        "principles_analysis": _build_principles_analysis(case_data, final_scores) or None,
        "outcome_narrative": _outcome_narrative(avg),
    }


# ── AI feedback ───────────────────────────────────────────────────────────────

async def get_ai_feedback(case_data: dict, step: dict, choice: dict, delta: dict) -> str:
    law = case_data.get("law") if isinstance(case_data.get("law"), dict) else {}
    law_article = (law.get("article") or "").strip() or "applicable ethics standards"
    law_text = (law.get("text") or "").strip()
    law_snip = f'{law_article}: {law_text[:240]}' if law_text else law_article
    prompt = (
        f'Case title: "{case_data["title"]}". '
        f'Summary: {(case_data.get("desc") or "")[:400]} '
        f'Patient {case_data["patient"]["name"]} ({case_data["patient"]["age"]}, '
        f'{case_data["patient"]["condition"]}) said: "{step["msg"]}". '
        f'The trainee chose: "{choice["label"]}". '
        f'Score changes: {delta}. '
        f"Stay grounded in THIS case only. Do not mention medical certificates, sick notes, or Article 28 "
        f"unless the case summary is clearly about documentation or certification. "
        f'Give Dr. Ethics feedback in exactly 2-3 sentences referencing autonomy, beneficence, '
        f'non-maleficence, and justice, and cite "{law_snip}" only when it fits this scenario.'
    )
    system = (
        "You are Dr. Ethics, an AI mentor in EthiCare, a medical ethics training simulator. "
        "Respond in exactly 2-3 sentences. Be specific about which principles were affected. "
        "Reference the applicable legal or ethics standard named in the case when relevant. "
        "Never invent a different scenario (e.g. do not discuss medical certificates unless the case is about that). "
        "Be constructive and direct."
    )

    try:
        from app.services import live_scenarios_openai as lso

        if lso.openai_key():
            async with httpx.AsyncClient(timeout=22.0) as client:
                r = await client.post(
                    f"{lso.openai_base()}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {lso.openai_key()}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": lso.openai_model(),
                        "max_tokens": 220,
                        "temperature": 0.35,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
                if r.status_code < 400:
                    data = r.json()
                    text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
                    if text:
                        return text
    except Exception:
        pass

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return _default_dr_ethics_feedback(case_data, choice)

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 180,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            data = r.json()
            return data["content"][0]["text"]
    except Exception:
        return _default_dr_ethics_feedback(case_data, choice)