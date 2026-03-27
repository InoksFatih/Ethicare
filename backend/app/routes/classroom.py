import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.services import engine
from app.services.clustering import compute_statistics, evaluate_response
from app.services.session_manager import VALID_PHASES, session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/classroom", tags=["classroom"])

MAX_RESPONSE_TEXT = 2000  # characters; rejects megabyte-sized payloads before AI eval


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.post("/sessions")
def create_session(
    case_id: str = Query(..., description="The case ID to run in this session"),
):
    try:
        engine.load_case(case_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    session_id = session_manager.create_session(case_id)
    return {
        "session_id": session_id,
        "join_url":   f"/join/{session_id}",
        "qr_data":    f"/join/{session_id}",
        "case_id":    case_id,
    }


@router.get("/sessions/{session_id}")
def get_session_info(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id":     session_id,
        "case_id":        session["case_id"],
        "case_data":      session.get("case_data"),
        "phase":          session["phase"],
        "current_step":   session["current_step"],
        "student_count":  session_manager.get_student_count(session_id),
        "response_count": len(session["responses"]),
    }


@router.get("/sessions/{session_id}/stats")
def get_session_stats(
    session_id: str,
    step_id: str = Query(default="s1"),
):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    responses = session_manager.get_responses_for_step(session_id, step_id)
    return compute_statistics(responses)


@router.get("/sessions/{session_id}/responses")
def get_clustered_responses(
    session_id: str,
    step_id: str = Query(default="s1"),
):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    responses = session_manager.get_responses_for_step(session_id, step_id)
    clusters: dict = {"sound": [], "correct_poor": [], "unsafe": [], "insufficient": []}
    for i, r in enumerate(responses):
        key = r.get("cluster") or "unsafe"
        if key not in clusters:
            key = "insufficient"
        clusters[key].append({
            "id":       i + 1,
            "text":     r["text"],
            "score":    r["score"],
            "feedback": r["feedback"],
        })

    return {"step_id": step_id, "total": len(responses), "clusters": clusters}


@router.post("/sessions/{session_id}/reset")
async def reset_session_responses(
    session_id: str,
    step_id: str = Query(default="s1"),
):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_manager.clear_responses(session_id, step_id=step_id)

    await session_manager.broadcast_to_students(session_id, {
        "type":    "phase_change",
        "phase":   session["phase"],
        "step_id": session["current_step"],
    })

    stats = compute_statistics(
        session_manager.get_responses_for_step(session_id, step_id)
    )
    await session_manager.send_to_instructor(session_id, {
        "type":    "stats_update",
        "step_id": step_id,
        "stats":   stats,
    })

    return {"ok": True, "step_id": step_id}


# ── WebSocket: Instructor ─────────────────────────────────────────────────────

@router.websocket("/ws/instructor/{session_id}")
async def instructor_websocket(websocket: WebSocket, session_id: str):
    """
    Instructor WebSocket channel.

    Incoming:
      { "type": "set_phase",      "phase": "...", "step_id": "..." }
      { "type": "request_stats",  "step_id": "..." }
      { "type": "ping" }

    Outgoing:
      { "type": "response_received", "count": N, "stats": {...} }
      { "type": "student_joined",     "student_count": N }
      { "type": "student_left",       "student_count": N }
      { "type": "stats_update",       "stats": {...} }
      { "type": "pong" }
    """
    if not session_manager.session_exists(session_id):
        await websocket.close(code=4004, reason="Session not found")
        return

    await session_manager.connect_instructor(session_id, websocket)

    try:
        while True:
            # ── Safe JSON receive ──────────────────────────────────────────
            try:
                raw = await websocket.receive_json()
            except Exception:
                # Malformed frame or disconnect — let the outer except handle disconnect.
                break

            if not isinstance(raw, dict):
                continue  # ignore non-object messages

            event = raw.get("type")

            if event == "set_phase":
                new_phase = raw.get("phase", "")
                step_id   = raw.get("step_id")

                if new_phase not in VALID_PHASES:
                    continue  # silently ignore unknown phases

                session_manager.set_phase(session_id, new_phase, step_id)
                await session_manager.broadcast_to_students(session_id, {
                    "type":    "phase_change",
                    "phase":   new_phase,
                    "step_id": session_manager.get_session(session_id)["current_step"],
                })

            elif event == "request_stats":
                sid = raw.get(
                    "step_id",
                    session_manager.get_session(session_id)["current_step"],
                )
                responses = session_manager.get_responses_for_step(session_id, sid)
                stats = compute_statistics(responses)
                await websocket.send_json({
                    "type":    "stats_update",
                    "step_id": sid,
                    "stats":   stats,
                })

            elif event == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Instructor WS error for session %s: %s", session_id, exc)
    finally:
        session_manager.disconnect_instructor(session_id)


# ── WebSocket: Student ────────────────────────────────────────────────────────

@router.websocket("/ws/student/{session_id}/{student_id}")
async def student_websocket(
    websocket: WebSocket,
    session_id: str,
    student_id: str,
):
    """
    Student WebSocket channel.

    Incoming:
      { "type": "submit_response", "step_id": "s1", "text": "..." }
      { "type": "ping" }

    Outgoing:
      { "type": "session_state",      "phase": "...", "current_step": "..." }
      { "type": "phase_change",       "phase": "...", "step_id": "..." }
      { "type": "response_evaluated", "cluster": "...", "feedback": "...", "principles": {...}, "score": N }
      { "type": "already_responded" }
      { "type": "pong" }
    """
    if not session_manager.session_exists(session_id):
        await websocket.close(code=4004, reason="Session not found")
        return

    # connect_student sends session_state first, then we notify the instructor.
    await session_manager.connect_student(session_id, websocket, student_id)
    await session_manager.send_to_instructor(session_id, {
        "type":          "student_joined",
        "student_count": session_manager.get_student_count(session_id),
    })

    # Load case data once for this connection lifetime.
    session = session_manager.get_session(session_id)
    case_data = session.get("case_data")
    if not case_data:
        try:
            case_data = engine.load_case(session["case_id"])
        except FileNotFoundError:
            await websocket.close(code=4005, reason="Case not found")
            return

    try:
        while True:
            # ── Safe JSON receive ──────────────────────────────────────────
            try:
                raw = await websocket.receive_json()
            except Exception:
                break

            if not isinstance(raw, dict):
                continue

            event = raw.get("type")

            if event == "submit_response":
                step_id = raw.get("step_id", "s1")
                text    = (raw.get("text") or "").strip()

                if not text:
                    continue

                sess = session_manager.get_session(session_id)
                if sess and sess.get("phase") != "responding":
                    await websocket.send_json({
                        "type":    "error",
                        "message": (
                            "Collection is not open right now. "
                            "Wait until the instructor starts live collection (you should see “Your turn”)."
                        ),
                    })
                    continue

                # ── Guard: reject oversized payloads before hitting the AI ──
                if len(text) > MAX_RESPONSE_TEXT:
                    await websocket.send_json({
                        "type":    "error",
                        "message": f"Response too long (max {MAX_RESPONSE_TEXT} characters).",
                    })
                    continue

                # ── Guard: prevent duplicate submission ────────────────────
                if session_manager.student_already_responded(session_id, student_id, step_id):
                    await websocket.send_json({"type": "already_responded"})
                    continue

                step = next(
                    (s for s in case_data.get("steps", []) if s["id"] == step_id),
                    None,
                )
                # Rich context so Dr. Ethics (LLM + offline mock) matches the actual case,
                # not a default “medical certificate” vignette.
                title = (case_data.get("title") or "Medical ethics scenario").strip()
                desc  = (case_data.get("desc") or "").strip()
                law   = case_data.get("law") if isinstance(case_data.get("law"), dict) else {}
                law_bit = ""
                if law:
                    art = (law.get("article") or "").strip()
                    txt = (law.get("text") or "").strip()
                    if art and txt:
                        law_bit = f"{art}: {txt[:280]}"
                    elif art:
                        law_bit = art
                    elif txt:
                        law_bit = txt[:320]
                category = (case_data.get("category") or "").strip()
                parts = [title]
                if desc:
                    parts.append(desc)
                if category:
                    parts.append(f"Category: {category}")
                if law_bit:
                    parts.append(f"Legal / ethics anchor: {law_bit}")
                scenario    = "\n".join(parts)[:4000]
                patient_msg = step["msg"] if step else ""

                evaluation = await evaluate_response(scenario, patient_msg, text)

                response_obj = {
                    "student_id": student_id,
                    "step_id":    step_id,
                    "text":       text,
                    "cluster":    evaluation["cluster"],
                    "principles": evaluation["principles"],
                    "feedback":   evaluation["feedback"],
                    "score":      evaluation["score"],
                }
                session_manager.add_response(session_id, response_obj)

                await websocket.send_json({
                    "type":       "response_evaluated",
                    "cluster":    evaluation["cluster"],
                    "feedback":   evaluation["feedback"],
                    "principles": evaluation["principles"],
                    "score":      evaluation["score"],
                })

                all_responses = session_manager.get_responses_for_step(session_id, step_id)
                stats = compute_statistics(all_responses)
                await session_manager.send_to_instructor(session_id, {
                    "type":    "response_received",
                    "step_id": step_id,
                    "count":   len(all_responses),
                    "stats":   stats,
                })

            elif event == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Student WS error for session %s / student %s: %s", session_id, student_id, exc)
    finally:
        session_manager.disconnect_student(session_id, websocket)
        await session_manager.send_to_instructor(session_id, {
            "type":          "student_left",
            "student_count": session_manager.get_student_count(session_id),
        })