from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional


class LiveSessionBriefSchema(BaseModel):
    """AI-generated session framing for instructors."""
    sessionTitle: Optional[str] = None
    clinicalContextBullets: list[str] = Field(default_factory=list)
    facilitatorNote: Optional[str] = None


class LiveScenarioCardSchema(BaseModel):
    """One AI-generated option for Live Mode."""
    id: str
    name: str
    # Age constraints are specialty-dependent (e.g., Pediatrics must be < 18),
    # so we allow minors here and enforce logic in generation normalization.
    age: int = Field(ge=0, le=110)
    breadcrumb: str
    patientProfileBullets: list[str]
    psychBullets: list[str]
    primaryLaunch: bool
    diagnosis: Optional[str] = None
    extension: Optional[str] = None
    openingLine: Optional[str] = None
    stakeholders: list[str] = Field(default_factory=list)
    possibleTwist: Optional[str] = None
    debriefHooks: list[str] = Field(default_factory=list)
    communicationBarrier: Optional[str] = None


class LiveModeGenerateRequest(BaseModel):
    clinical_input: str = Field(..., min_length=3, max_length=8000)
    specialty: str = Field(..., min_length=1, max_length=120)
    ethical_focus: list[str] = Field(default_factory=list)
    custom_ethical_tags: list[str] = Field(default_factory=list)
    scenario_count: int = Field(3, ge=1, le=5)
    difficulty: Literal["intro", "standard", "advanced"] = "standard"
    learner_level: str = Field("Medical students and residents", min_length=1, max_length=200)
    patient_tone: str = Field("varied", min_length=1, max_length=120)
    simulation_pacing: Literal["briefing", "standard", "slow_deep"] = "standard"
    locale_or_setting: Optional[str] = Field(None, max_length=200)
    custom_instructions: Optional[str] = Field(None, max_length=3000)
    creative_seed: Optional[str] = Field(None, max_length=500)
    temperature: float = Field(0.65, ge=0.35, le=1.15)


class LiveModeGenerateResponse(BaseModel):
    sessionBrief: LiveSessionBriefSchema = Field(default_factory=LiveSessionBriefSchema)
    scenarios: list[LiveScenarioCardSchema]


class LiveModeCreateClassroomSessionRequest(BaseModel):
    """Create a realtime classroom session from a Live Mode-selected scenario."""
    specialty: str = Field(..., min_length=1, max_length=120)
    clinical_input: str = Field(..., min_length=3, max_length=8000)
    ethical_focus: list[str] = Field(default_factory=list)
    session_brief: Optional[LiveSessionBriefSchema] = None
    scenario: LiveScenarioCardSchema


class LiveModeCreateClassroomSessionResponse(BaseModel):
    session_id: str
    join_url: str
    qr_data: str
    case_id: str


class StartCaseResponse(BaseModel):
    """
    Returned when a player starts a case.
    play_id is an opaque token used to track scores server-side so the debrief
    endpoint cannot be called with fabricated scores.
    """
    play_id: str


class PrincipleAnalysisRow(BaseModel):
    key: str
    label: str
    verdict: str


class DecisionRequest(BaseModel):
    """
    play_id is optional for backward-compatibility with clients that don't call /start.
    When absent, the server falls back to client-supplied scores (legacy behaviour).
    """
    play_id: Optional[str] = Field(None, max_length=64, description="Token from POST /start")
    step_id: str = Field(..., min_length=1, max_length=32)
    choice_id: str = Field(..., min_length=1, max_length=64)
    current_scores: dict[str, int] = Field(
        default_factory=dict,
        description="Legacy fallback when play_id is absent.",
    )
    current_emo: dict[str, int] = Field(default_factory=dict)

    @field_validator("current_scores", "current_emo", mode="before")
    @classmethod
    def clamp_dict_values(cls, v: object) -> dict:
        """Reject out-of-range values rather than letting them propagate silently."""
        if not isinstance(v, dict):
            return {}
        return {
            k: max(0, min(100, int(val)))
            for k, val in v.items()
            if isinstance(val, (int, float))
        }


class DecisionResponse(BaseModel):
    patient_reaction: str
    dr_ethics_feedback: str
    score_delta: dict[str, int]
    emo_delta: dict[str, int]
    updated_scores: dict[str, int]
    updated_emo: dict[str, int]
    next_step_id: Optional[str]
    is_final: bool
    ending_key: Optional[str] = Field(default=None)


class DebriefResponse(BaseModel):
    final_scores: dict[str, int]
    average_score: int
    grade: str
    summary: str
    learning_points: list[str]
    principles_analysis: Optional[list[PrincipleAnalysisRow]] = None
    outcome_narrative: Optional[str] = None