import asyncio
import time
import uuid
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket

# Sessions expire after 8 hours of inactivity to prevent unbounded memory growth.
SESSION_TTL = 8 * 3600

VALID_PHASES = frozenset({"waiting", "responding", "reviewing", "feedback", "debrief"})


def _norm_sid(session_id: str) -> str:
    """URLs may use any casing; session keys are always uppercase 8-char ids."""
    return (session_id or "").strip().upper()


class SessionManager:
    """
    Manages live classroom sessions.

    Concurrency notes
    -----------------
    FastAPI/uvicorn runs in a single asyncio event loop.  Context switches happen
    only at `await` points, so mutating a plain Python dict is safe between awaits.
    However, *iterating* `student_wss` while another coroutine could add/remove
    from it during the awaited `send_json` is a real hazard.  We therefore
    snapshot the set before every broadcast and use per-session asyncio.Lock
    objects to serialise mutations.
    """

    def __init__(self) -> None:
        self.sessions: Dict[str, dict] = {}
        self._locks: Dict[str, asyncio.Lock] = {}

    def _lock(self, session_id: str) -> asyncio.Lock:
        session_id = _norm_sid(session_id)
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]

    # ── Session lifecycle ────────────────────────────────────────────────────

    def create_session(
        self,
        case_id: str,
        *,
        case_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        session_id = str(uuid.uuid4())[:8].upper()
        self.sessions[session_id] = {
            "case_id":      case_id,
            "case_data":    case_data,
            "current_step": "s1",
            "phase":        "waiting",
            "instructor_ws": None,
            "student_wss":  set(),
            "responses":    [],
            "last_active":  time.monotonic(),
        }
        return session_id

    def get_session(self, session_id: str) -> Optional[dict]:
        sid = _norm_sid(session_id)
        s = self.sessions.get(sid)
        if s:
            s["last_active"] = time.monotonic()
        return s

    def session_exists(self, session_id: str) -> bool:
        return _norm_sid(session_id) in self.sessions

    def cleanup_expired(self) -> int:
        """Remove sessions idle longer than SESSION_TTL.  Returns count removed."""
        now = time.monotonic()
        expired = [
            sid
            for sid, s in self.sessions.items()
            if (now - s.get("last_active", 0)) > SESSION_TTL
        ]
        for sid in expired:
            # Best-effort: close sockets before dropping references.
            s = self.sessions.pop(sid, {})
            self._locks.pop(sid, None)
            ws = s.get("instructor_ws")
            if ws:
                asyncio.ensure_future(ws.close())
            for student_ws in list(s.get("student_wss", set())):
                asyncio.ensure_future(student_ws.close())
        return len(expired)

    # ── Connections ──────────────────────────────────────────────────────────

    async def connect_instructor(self, session_id: str, ws: WebSocket) -> None:
        session_id = _norm_sid(session_id)
        await ws.accept()
        async with self._lock(session_id):
            self.sessions[session_id]["instructor_ws"] = ws
            self.sessions[session_id]["last_active"] = time.monotonic()

    async def connect_student(
        self, session_id: str, ws: WebSocket, student_id: str
    ) -> None:
        session_id = _norm_sid(session_id)
        await ws.accept()
        session = self.sessions[session_id]

        async with self._lock(session_id):
            session["student_wss"].add(ws)
            session["last_active"] = time.monotonic()

        # Sync late-joiners with current state *before* notifying the instructor,
        # so the student count the instructor sees is always accurate.
        await ws.send_json({
            "type":          "session_state",
            "phase":         session["phase"],
            "current_step":  session["current_step"],
            "student_count": len(session["student_wss"]),
        })

    def disconnect_student(self, session_id: str, ws: WebSocket) -> None:
        session_id = _norm_sid(session_id)
        if session_id in self.sessions:
            self.sessions[session_id]["student_wss"].discard(ws)

    def disconnect_instructor(self, session_id: str) -> None:
        session_id = _norm_sid(session_id)
        if session_id in self.sessions:
            self.sessions[session_id]["instructor_ws"] = None

    # ── Messaging ────────────────────────────────────────────────────────────

    async def broadcast_to_students(self, session_id: str, message: dict) -> None:
        """
        Deliver a message to every connected student.
        Takes a snapshot of the connection set before iterating to prevent
        concurrent modification during the awaited sends.
        """
        session_id = _norm_sid(session_id)
        async with self._lock(session_id):
            snapshot: Set[WebSocket] = set(self.sessions[session_id]["student_wss"])

        dead: Set[WebSocket] = set()
        for ws in snapshot:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)

        if dead:
            async with self._lock(session_id):
                self.sessions[session_id]["student_wss"] -= dead

    async def send_to_instructor(self, session_id: str, message: dict) -> None:
        session_id = _norm_sid(session_id)
        ws = self.sessions[session_id].get("instructor_ws")
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self.sessions[session_id]["instructor_ws"] = None

    # ── Response tracking ────────────────────────────────────────────────────

    def add_response(self, session_id: str, response: dict) -> None:
        session_id = _norm_sid(session_id)
        self.sessions[session_id]["responses"].append(response)

    def get_responses_for_step(self, session_id: str, step_id: str) -> list:
        session_id = _norm_sid(session_id)
        return [
            r for r in self.sessions[session_id]["responses"]
            if r["step_id"] == step_id
        ]

    def get_all_responses(self, session_id: str) -> list:
        session_id = _norm_sid(session_id)
        return self.sessions[session_id]["responses"]

    def student_already_responded(
        self, session_id: str, student_id: str, step_id: str
    ) -> bool:
        session_id = _norm_sid(session_id)
        return any(
            r["student_id"] == student_id and r["step_id"] == step_id
            for r in self.sessions[session_id]["responses"]
        )

    def clear_responses(
        self, session_id: str, step_id: Optional[str] = None
    ) -> None:
        session_id = _norm_sid(session_id)
        if step_id:
            self.sessions[session_id]["responses"] = [
                r for r in self.sessions[session_id]["responses"]
                if r.get("step_id") != step_id
            ]
        else:
            self.sessions[session_id]["responses"] = []

    # ── Phase control ────────────────────────────────────────────────────────

    def set_phase(
        self,
        session_id: str,
        phase: str,
        step_id: Optional[str] = None,
    ) -> None:
        session_id = _norm_sid(session_id)
        # Silently ignore unknown phase strings to prevent garbage propagation.
        if phase not in VALID_PHASES:
            return
        self.sessions[session_id]["phase"] = phase
        if step_id:
            self.sessions[session_id]["current_step"] = step_id

    # ── Stats ────────────────────────────────────────────────────────────────

    def get_student_count(self, session_id: str) -> int:
        session_id = _norm_sid(session_id)
        return len(self.sessions[session_id]["student_wss"])


# Singleton — imported by routes
session_manager = SessionManager()