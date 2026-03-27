"""
Generate Live Mode patient scenario cards via OpenAI (JSON mode).
Requires OPENAI_API_KEY. Optional: OPENAI_MODEL (default gpt-4o-mini).
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import httpx


def openai_key() -> str:
    """Read at call time so .env is respected even if this module imported early."""
    return os.environ.get("OPENAI_API_KEY", "").strip()


def openai_model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()


def openai_base() -> str:
    return os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")


def _as_str_list(v: Any, min_len: int = 1) -> list[str]:
    if isinstance(v, list):
        out = [str(x).strip() for x in v if str(x).strip()]
        return out if len(out) >= min_len else []
    if isinstance(v, str) and v.strip():
        parts = [p.strip() for p in re.split(r"[\n•\-–]+", v) if p.strip()]
        return parts if parts else [v.strip()]
    return []


def _normalize_brief(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "sessionTitle": None,
            "clinicalContextBullets": [],
            "facilitatorNote": None,
        }
    title = raw.get("session_title") or raw.get("sessionTitle")
    title_s = str(title).strip()[:200] if title else None
    bullets = _as_str_list(raw.get("clinical_context_bullets"), min_len=0)
    if len(bullets) < 2:
        bullets = _as_str_list(raw.get("clinicalContextBullets"), min_len=0)
    note = raw.get("facilitator_note") or raw.get("facilitatorNote")
    note_s = str(note).strip()[:1200] if note else None
    return {
        "sessionTitle": title_s or None,
        "clinicalContextBullets": bullets[:10],
        "facilitatorNote": note_s or None,
    }


def _normalize_one(raw: dict[str, Any], index: int, total: int) -> dict[str, Any]:
    name = str(raw.get("name") or f"Patient {index + 1}").strip()[:80]
    try:
        age = int(raw.get("age", 45))
    except (TypeError, ValueError):
        age = 45
    age = max(0, min(110, age))
    breadcrumb = str(raw.get("breadcrumb") or "").strip()[:120]
    if not breadcrumb:
        breadcrumb = "Clinical ethics › Scenario"

    bullets = _as_str_list(raw.get("patient_profile_bullets"), min_len=0)
    if len(bullets) < 2:
        extra = _as_str_list(raw.get("patient_profile"), min_len=0)
        bullets = (bullets + extra)[:6]
    if len(bullets) < 2:
        bullets = [
            "Clinical situation aligned with the instructor vignette.",
            "Further details should be explored in the simulated encounter.",
        ]

    psych = _as_str_list(raw.get("psych_bullets"), min_len=0)
    if len(psych) < 2:
        psych = _as_str_list(raw.get("psychological_state"), min_len=0)
    if len(psych) < 2:
        psych = [
            "Emotional and value-laden dimensions relevant to consent and communication.",
            "Ethical tensions suitable for structured debrief.",
        ]

    diagnosis = raw.get("diagnosis")
    extension = raw.get("extension")
    dx = str(diagnosis).strip()[:200] if diagnosis else None
    ext = str(extension).strip()[:200] if extension else None

    sid = str(raw.get("id") or "").strip()
    if not sid or not sid.startswith("ai-"):
        sid = f"ai-{uuid.uuid4().hex[:12]}"

    opening = raw.get("opening_line") or raw.get("openingLine")
    opening_s = str(opening).strip()[:500] if opening else None

    stakeholders = _as_str_list(raw.get("stakeholders"), min_len=0)[:8]
    twist_raw = raw.get("possible_twist") or raw.get("possibleTwist")
    twist_s = str(twist_raw).strip()[:400] if twist_raw else None

    hooks = _as_str_list(raw.get("instructor_debrief_hook"), min_len=0)
    if len(hooks) < 1:
        hooks = _as_str_list(raw.get("debrief_hooks"), min_len=0)
    if len(hooks) < 1:
        hooks = _as_str_list(raw.get("debriefHooks"), min_len=0)

    barrier = raw.get("communication_barrier") or raw.get("communicationBarrier")
    barrier_s = str(barrier).strip()[:200] if barrier else None

    return {
        "id": sid,
        "name": name,
        "age": age,
        "breadcrumb": breadcrumb,
        "patientProfileBullets": bullets[:8],
        "psychBullets": psych[:8],
        "primaryLaunch": index == total - 1,
        "diagnosis": dx or None,
        "extension": ext or None,
        "openingLine": opening_s or None,
        "stakeholders": stakeholders,
        "possibleTwist": twist_s or None,
        "debriefHooks": hooks[:6],
        "communicationBarrier": barrier_s or None,
    }


def _specialty_constraints_line(specialty: str) -> str:
    s = (specialty or "").strip().lower()
    if "pediatr" in s or "paediatr" in s:
        return (
            "Specialty constraint (hard): Pediatrics means the patient is a child/adolescent. "
            "Set age between 0 and 17 inclusive. Do NOT output adult ages."
        )
    return "Specialty constraint: keep demographics coherent with the specialty and seed."


def _apply_specialty_constraints(specialty: str, scenario: dict[str, Any]) -> dict[str, Any]:
    s = (specialty or "").strip().lower()
    if "pediatr" in s or "paediatr" in s:
        # Enforce pediatrics age < 18 even if the model ignored instructions.
        try:
            age = int(scenario.get("age", 12))
        except (TypeError, ValueError):
            age = 12

        if age >= 18:
            # Clamp down deterministically; prefer 16/17 if model gave "young adult".
            age = 17
        age = max(0, min(17, age))
        scenario["age"] = age

        # Ensure at least one bullet reflects pediatric context (guardian/school) so it reads logically.
        bullets = scenario.get("patientProfileBullets")
        if isinstance(bullets, list):
            joined = " ".join(str(b).lower() for b in bullets if isinstance(b, str))
            if not any(k in joined for k in ["parent", "guardian", "school", "pediatric", "paediatric", "teen", "child", "adolescent"]):
                scenario["patientProfileBullets"] = (["Involves a parent/guardian dynamic appropriate for a pediatric encounter."] + bullets)[:8]

    return scenario


async def generate_live_scenarios(
    clinical_input: str,
    specialty: str,
    ethical_focus: list[str],
    *,
    custom_ethical_tags: list[str] | None = None,
    scenario_count: int = 3,
    difficulty: str = "standard",
    learner_level: str = "Medical students and residents",
    patient_tone: str = "varied",
    simulation_pacing: str = "standard",
    locale_or_setting: str | None = None,
    custom_instructions: str | None = None,
    creative_seed: str | None = None,
    temperature: float = 0.65,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    key = openai_key()
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env (see backend/env.example)."
        )

    n = max(1, min(5, int(scenario_count)))
    tags = [str(t).strip() for t in (custom_ethical_tags or []) if str(t).strip()]
    foci_parts = list(ethical_focus)
    foci_parts.extend(tags)
    foci = ", ".join(foci_parts) if foci_parts else "General clinical ethics (autonomy, consent, truth-telling)"

    pacing_hints = {
        "briefing": "Tight vignettes; each scenario should be quick to grasp in under 90 seconds.",
        "standard": "Balanced depth: enough nuance for a 12–20 minute encounter.",
        "slow_deep": "Rich subtext; allow moral ambiguity and layered family/system dynamics.",
    }
    pacing_line = pacing_hints.get(simulation_pacing, pacing_hints["standard"])

    diff_hints = {
        "intro": "Avoid rare syndromes; foreground clear communication ethics and consent basics.",
        "standard": "Typical ward/clinic complexity appropriate for graduate medical education.",
        "advanced": "Nuanced capacity, conflicting obligations, scarce resources, or dual loyalty.",
    }
    diff_line = diff_hints.get(difficulty, diff_hints["standard"])

    locale_line = (
        f"Setting / locale hint: {locale_or_setting}"
        if locale_or_setting
        else "Infer setting from the instructor seed if obvious; otherwise keep site-type generic."
    )
    custom_block = (
        f"\nInstructor-only directives (honor closely): {custom_instructions}"
        if custom_instructions
        else ""
    )
    seed_block = (
        f"\nCreativity nonce (use to diversify duplicates): {creative_seed}"
        if creative_seed
        else ""
    )

    json_skeleton_scenario = """    {{
      "name": "First name only",
      "age": 54,
      "breadcrumb": "Short path e.g. __SPEC__ › thematic label",
      "patient_profile_bullets": ["bullet 1", "bullet 2"],
      "psych_bullets": ["psychological / ethical theme bullet", "another"],
      "diagnosis": "short phrase for session footer",
      "extension": "short phrase (extent, comorbidity, or social context)",
      "opening_line": "One vivid in-character sentence the patient might say to open the encounter.",
      "stakeholders": ["people or systems affected besides the patient — 2 to 4 entries"],
      "possible_twist": "Optional believable mid-sim complication the facilitator may inject.",
      "instructor_debrief_hook": ["What to watch for in debrief", "Another probing question"],
      "communication_barrier": "e.g. language barrier, low health literacy, hearing loss — or null if none"
    }}"""

    user_prompt = f"""You are designing options for EthiCare, a medical ethics simulation for instructors.

Instructor specialty: {specialty}
Clinical / scenario seed (verbatim from instructor): {clinical_input}
Ethical focus areas and themes to weave in: {foci}
Audience / learner level: {learner_level}
Difficulty tier: {difficulty} — {diff_line}
Patient affect guidance: {patient_tone} (if "varied", use different affect across the {n} scenarios)
Pacing: {pacing_line}
{locale_line}
{custom_block}{seed_block}

{_specialty_constraints_line(specialty)}

First, write a concise **session_brief** for the instructor. Then produce exactly **{n}** distinct fictional patient scenarios suitable for role-play (vary names, ages, personalities, and clinical angles while staying consistent with the seed).

Return a single JSON object with this exact structure (no markdown, no code fences):
{{
  "session_brief": {{
    "session_title": "Short compelling title for this live session",
    "clinical_context_bullets": ["3 to 5 bullets summarizing shared clinical context inferred from the seed"],
    "facilitator_note": "One short paragraph: how to run the room, tone, and what success looks like."
  }},
  "scenarios": [
{json_skeleton_scenario.replace("__SPEC__", specialty)}
  ]
}}

Rules:
- Exactly {n} objects in "scenarios".
- patient_profile_bullets: 2–4 strings, clinically grounded, not graphic gore.
- psych_bullets: 2–4 strings linking emotion/coping to the ethical focus areas.
- opening_line must be dialogue-backed (no stage directions).
- Names must be diverse; do not use real public figures.
- possible_twist should be optional faculty spice — never humiliating or exploitative.
- If the seed implies a region, you may reflect appropriate cultural context without inventing specific statute numbers unless widely known (e.g. informed consent).
- communication_barrier may be null.
- If specialty is Pediatrics: patient age MUST be between 0 and 17 inclusive, and the scenario must read like pediatrics (guardian/school/family dynamics as appropriate).
- JSON only."""

    url = f"{openai_base()}/chat/completions"
    payload = {
        "model": openai_model(),
        "temperature": max(0.35, min(1.15, float(temperature))),
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You write only valid JSON objects for a medical ethics education API. "
                    "No markdown, no commentary outside JSON."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        r = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if r.status_code >= 400:
            try:
                err_body = r.json()
                msg = err_body.get("error", {}).get("message", r.text)
            except Exception:
                msg = r.text or r.reason_phrase
            raise RuntimeError(f"OpenAI API error ({r.status_code}): {msg[:500]}")

        data = r.json()

    try:
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Could not parse model response as JSON: {e}") from e

    brief = _normalize_brief(parsed.get("session_brief"))

    scenarios = parsed.get("scenarios")
    if not isinstance(scenarios, list):
        raise RuntimeError('Response missing "scenarios" array')

    if len(scenarios) < n:
        raise RuntimeError(f"Expected {n} scenarios, got {len(scenarios)}")

    trimmed = scenarios[:n]
    out: list[dict[str, Any]] = []
    for i, raw in enumerate(trimmed):
        if not isinstance(raw, dict):
            raise RuntimeError(f"Scenario {i} is not an object")
        normalized = _normalize_one(raw, i, n)
        out.append(_apply_specialty_constraints(specialty, normalized))

    if len(brief["clinicalContextBullets"]) < 2:
        brief["clinicalContextBullets"] = [
            "Scenarios align with the instructor vignette above.",
            "Use scenario cards for patient-specific nuance and AI hooks.",
        ]

    return brief, out
