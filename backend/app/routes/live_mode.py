import os

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    LiveModeGenerateRequest,
    LiveModeGenerateResponse,
    LiveSessionBriefSchema,
    LiveModeCreateClassroomSessionRequest,
    LiveModeCreateClassroomSessionResponse,
)
from app.services import live_scenarios_openai as lso
from app.services.session_manager import session_manager

router = APIRouter(prefix="/live-mode", tags=["live-mode"])


@router.get("/status")
def live_mode_status():
    """Whether OpenAI is configured (no key sent to client)."""
    configured = bool(lso.openai_key())
    anthropic = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    return {
        "openai_configured": configured,
        "model": lso.openai_model() if configured else None,
        "classroom_response_evaluator": (
            "openai" if configured else "anthropic" if anthropic else "mock"
        ),
    }


@router.post("/generate-scenarios", response_model=LiveModeGenerateResponse)
async def generate_scenarios(body: LiveModeGenerateRequest):
    try:
        session_brief, scenarios = await lso.generate_live_scenarios(
            clinical_input=body.clinical_input.strip(),
            specialty=body.specialty.strip(),
            ethical_focus=body.ethical_focus,
            custom_ethical_tags=body.custom_ethical_tags,
            scenario_count=body.scenario_count,
            difficulty=body.difficulty,
            learner_level=body.learner_level.strip(),
            patient_tone=body.patient_tone.strip(),
            simulation_pacing=body.simulation_pacing,
            locale_or_setting=(body.locale_or_setting.strip() if body.locale_or_setting else None),
            custom_instructions=(body.custom_instructions.strip() if body.custom_instructions else None),
            creative_seed=(body.creative_seed.strip() if body.creative_seed else None),
            temperature=body.temperature,
        )
    except RuntimeError as e:
        msg = str(e)
        if "OPENAI_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Generation failed: {e!s}") from e

    return LiveModeGenerateResponse(
        sessionBrief=LiveSessionBriefSchema(**session_brief),
        scenarios=scenarios,
    )


@router.post("/create-classroom-session", response_model=LiveModeCreateClassroomSessionResponse)
def create_classroom_session_from_live_mode(body: LiveModeCreateClassroomSessionRequest):
    """
    Create a realtime Classroom session using the selected Live Mode scenario as step context.
    This lets instructors run QR participation + clustering on a custom scenario (instead of a library case).
    """
    s = body.scenario
    brief = body.session_brief

    # "Case" object shaped to satisfy the Classroom UI screens (intro/decisions/typing/qr/stats)
    # while keeping the realtime participation prompt on step s1.
    opening = s.openingLine or "You enter the room. The patient looks at you, waiting for your guidance."
    dx = s.diagnosis or s.breadcrumb
    focus_hint = ", ".join((body.ethical_focus or [])[:3])
    ideal = (
        f"First, I want to make sure I understand what matters most to you right now. "
        f"Can you tell me what you’re hoping for—and what you’re most worried about? "
        f"Then we can go through options together in a way that fits your values."
    )

    def choice(id: str, label: str, risk: str, optimal: bool = False):
        return {"id": id, "label": label, "risk": risk, "optimal": optimal}

    case_data = {
        "id": f"live_{s.id}",
        "num": "LIVE",
        "title": (brief.sessionTitle if brief and brief.sessionTitle else f"Live session — {body.specialty}"),
        "desc": body.clinical_input,
        "category": "Live Mode",
        "difficulty": "Custom",
        "tags": list(dict.fromkeys([body.specialty, *(body.ethical_focus or [])]))[:8],
        "patient": {
            "name": s.name,
            "age": s.age,
            "condition": dx,
        },
        "law": {
            "country": "Live session",
            "article": "Facilitator prompt",
            "text": brief.facilitatorNote if brief and brief.facilitatorNote else "Respond to the scenario with ethical clarity and good communication.",
        },
        "steps": [
            {
                "id": "s1",
                "msg": opening,
                "q": "What’s your first move?",
                "hint": f"Anchor to the patient’s values, check understanding, and set a collaborative tone.{(' Focus: ' + focus_hint) if focus_hint else ''}",
                "idealResponse": ideal,
                "choices": [
                    choice("empathize_open", "Acknowledge emotion + ask an open question to surface values", "low", True),
                    choice("direct_reco", "Jump straight to a recommendation without checking understanding", "medium", False),
                    choice("deflect", "Avoid the topic / defer without a plan", "high", False),
                ],
            }
            ,
            {
                "id": "s2",
                "msg": "The conversation continues. The patient asks: “What would you do if you were me?”",
                "q": "How do you respond now?",
                "hint": "Offer guidance without overriding autonomy; be transparent about uncertainty and options.",
                "idealResponse": (
                    "I can share what I’d consider and why, but I want to make sure the decision fits you. "
                    "Let’s review the options, what we know, what we don’t, and then we can decide together."
                ),
                "choices": [
                    choice("shared", "Give a recommendation framed as shared decision-making", "low", True),
                    choice("paternalistic", "Tell them the decision you’ve already made for them", "high", False),
                    choice("no_help", "Refuse to offer any guidance at all", "medium", False),
                ],
            },
        ],
        "debrief": {
            "principles": [
                {"key": "autonomy", "label": "Autonomy", "verdict": "supported"},
                {"key": "honesty", "label": "Honesty", "verdict": "maintained"},
                {"key": "nonMal", "label": "Non-maleficence", "verdict": "harm reduced"},
            ],
            "summary": "This live session is a facilitator-driven scenario. Use the QR step to collect responses and review how the group balanced clarity, empathy, and autonomy.",
            "riskMatrix": {
                "give": {"label": "Risky response pattern", "consequence": ""},
                "correct": {"label": "Safer response pattern", "consequence": ""},
            },
            "points": [
                "Start with empathy and a clear agenda: what we’ll cover and why.",
                "Elicit values before recommending.",
                "Use teach-back and avoid coercive language.",
            ],
        },
    }

    session_id = session_manager.create_session(case_id=case_data["id"], case_data=case_data)
    return LiveModeCreateClassroomSessionResponse(
        session_id=session_id,
        join_url=f"/join/{session_id}",
        qr_data=f"/join/{session_id}",
        case_id=case_data["id"],
    )


@router.post("/create-live-session", response_model=LiveModeCreateClassroomSessionResponse)
def create_live_session_from_live_mode(body: LiveModeCreateClassroomSessionRequest):
    """
    Same payload as create-classroom-session, but intended for the dedicated Live Session instructor UI.
    (Uses the same realtime session manager + websockets under the hood.)
    """
    return create_classroom_session_from_live_mode(body)
