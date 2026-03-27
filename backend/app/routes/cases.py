from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    DecisionRequest,
    DecisionResponse,
    DebriefResponse,
    StartCaseResponse,
)
from app.services import engine

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("/")
def get_cases():
    return engine.list_cases()


@router.get("/{case_id}")
def get_case(case_id: str):
    try:
        return engine.load_case(case_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")


@router.post("/{case_id}/start", response_model=StartCaseResponse)
def start_case(case_id: str):
    """
    Begin a play session.  Returns an opaque play_id that the client must attach
    to every subsequent /decision call and to /debrief.  Scores are tracked
    server-side so the debrief cannot be called with fabricated values.
    """
    try:
        case_data = engine.load_case(case_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    play_id = engine.start_play_session(
        case_id=case_id,
        init_scores=case_data.get(
            "initScores",
            {"autonomy": 50, "beneficence": 50, "nonMal": 50, "justice": 50},
        ),
        init_emo=case_data.get(
            "initEmo",
            {"fear": 50, "trust": 50, "pain": 50},
        ),
    )
    return StartCaseResponse(play_id=play_id)


@router.post("/{case_id}/decision", response_model=DecisionResponse)
async def submit_decision(case_id: str, body: DecisionRequest):
    try:
        case_data = engine.load_case(case_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    # ── Resolve current scores ─────────────────────────────────────────────
    # Prefer server-side session (spoofing-resistant).  Fall back to
    # client-supplied values for legacy / offline callers.
    play_session = engine.get_play_session(body.play_id)

    if play_session and play_session["case_id"] == case_id:
        current_scores = play_session["scores"]
        current_emo    = play_session["emo"]
    else:
        # Legacy path: trust (but clamp) the client-submitted scores.
        _defaults_s = {"autonomy": 50, "beneficence": 50, "nonMal": 50, "justice": 50}
        _defaults_e = {"fear": 50, "trust": 50, "pain": 50}
        current_scores = {k: body.current_scores.get(k, v) for k, v in _defaults_s.items()}
        current_emo    = {k: body.current_emo.get(k, v) for k, v in _defaults_e.items()}

    try:
        result = engine.compute_decision(
            case_data,
            body.step_id,
            body.choice_id,
            current_scores,
            current_emo,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ── Persist updated scores in the play session ─────────────────────────
    if play_session and body.play_id:
        engine.update_play_session(
            body.play_id,
            result["updated_scores"],
            result["updated_emo"],
        )

    # ── Fetch AI feedback (with fallback) ──────────────────────────────────
    step   = next(s for s in case_data["steps"] if s["id"] == body.step_id)
    choice = next(c for c in step["choices"] if c["id"] == body.choice_id)
    result["dr_ethics_feedback"] = await engine.get_ai_feedback(
        case_data, step, choice, result["score_delta"]
    )

    return result


@router.get("/{case_id}/debrief", response_model=DebriefResponse)
def get_debrief(
    case_id: str,
    # Primary (secure) path: use server-tracked scores via play_id.
    play_id: Optional[str] = None,
    # Legacy fallback: accept raw scores if play_id is absent.
    # Values are clamped to [0,100] to prevent abuse.
    autonomy:    int = 50,
    beneficence: int = 50,
    nonMal:      int = 50,
    justice:     int = 50,
):
    try:
        case_data = engine.load_case(case_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    play_session = engine.get_play_session(play_id)

    if play_session and play_session["case_id"] == case_id:
        final_scores = play_session["scores"]
    else:
        # Legacy path: clamp all values so a crafted URL can't exceed [0,100].
        final_scores = {
            "autonomy":    max(0, min(100, autonomy)),
            "beneficence": max(0, min(100, beneficence)),
            "nonMal":      max(0, min(100, nonMal)),
            "justice":     max(0, min(100, justice)),
        }

    return engine.compute_debrief(case_data, final_scores)