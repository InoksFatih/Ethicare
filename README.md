# EthiCare — Medical Ethics Training Simulator

A scenario-based training tool for healthcare students. Play as a doctor, navigate ethical dilemmas with real patients, and receive live AI feedback from **Dr. Ethics**.

---

## Project Structure

```text
ethicare/
├─ backend/                                FastAPI API + live classroom/session backend
│  ├─ app/
│  │  ├─ main.py                           App entrypoint + CORS + health
│  │  ├─ models/
│  │  │  └─ schemas.py                     Pydantic request/response models
│  │  ├─ routes/
│  │  │  ├─ cases.py                       Case gameplay endpoints
│  │  │  ├─ classroom.py                   Instructor/student websocket + stats routes
│  │  │  └─ live_mode.py                   Live-mode scenario generation/session routes
│  │  ├─ services/
│  │  │  ├─ engine.py                      Core case engine + AI feedback integration
│  │  │  ├─ clustering.py                  Free-text evaluation + clustering/statistics
│  │  │  ├─ live_scenarios_openai.py       Scenario generation helper
│  │  │  └─ session_manager.py             In-memory classroom session lifecycle
│  │  └─ data/cases/                       Case JSON files
│  │     ├─ case_03.json
│  │     ├─ case_07.json
│  │     ├─ case_12.json
│  │     ├─ case_cert.json
│  │     └─ case_research.json
│  ├─ Dockerfile
│  ├─ requirements.txt
│  └─ env.example
│
├─ frontend/                               Next.js 16 app router UI
│  ├─ app/
│  │  ├─ page.tsx                          Home
│  │  ├─ cases/page.tsx                    Case list
│  │  ├─ game/page.tsx                     Main game mode
│  │  ├─ detective/page.tsx                Detective mode
│  │  ├─ classroom/page.tsx                Classroom landing
│  │  ├─ classroom/[sessionId]/page.tsx    Instructor classroom session view
│  │  ├─ join/[sessionId]/page.tsx         Student join page (QR target)
│  │  ├─ live-mode/page.tsx                Live-mode setup/generation
│  │  ├─ live-session/[sessionId]/page.tsx Live instructor control room
│  │  ├─ settings/page.tsx                 App settings
│  │  └─ media/[file]/route.ts             Media file route
│  ├─ components/
│  │  ├─ ethicare/                         Domain UI components
│  │  └─ theme-provider.tsx
│  ├─ hooks/
│  │  └─ useClassroomSocket.ts             Shared classroom websocket client
│  ├─ lib/                                 Utility and analysis helpers
│  ├─ media/ + public/media/               Video/image assets
│  ├─ Dockerfile
│  └─ package.json
│
├─ render.yaml                             Render blueprint for frontend/backend
├─ LICENSE
└─ README.md
```

---

## Included Cases

| # | Title | Principles | Law |
|---|-------|-----------|-----|
| 03 | Refusal of Chemotherapy | Autonomy, Beneficence | Article 6 |
| 07 | Informed Consent Under Pressure | Autonomy, Justice | Article 7 |
| 12 | End-of-Life Decision | All four | Article 4 & 9 |
| 20 (`case_cert`) | Medical Certificate Request | Integrity, Non-maleficence, Justice | Article 28 |
| 27 (`case_research`) | Fast Recruitment | Informed Consent, Vulnerable Groups, Justice | Helsinki Article 20 |

---

## Quick Start

### 1 — Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Optional: enable live AI feedback
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### 2 — Frontend

```bash
cd frontend
pnpm install
pnpm dev
# → http://localhost:3000
```

> **No backend?** The frontend includes all case data as a local fallback. It works fully offline — AI feedback will use static responses instead of calling the API.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/cases` | List all cases |
| `GET` | `/cases/{id}` | Get full case data |
| `POST` | `/cases/{id}/decision` | Submit a decision, get feedback + score updates |
| `GET` | `/cases/{id}/debrief` | Get debrief report for final scores |
| `GET` | `/health` | Health check |

### POST /cases/{id}/decision — Request Body

```json
{
  "step_id": "s1",
  "choice_id": "beliefs",
  "current_scores": { "autonomy": 50, "beneficence": 50, "nonMal": 50, "justice": 50 },
  "current_emo": { "fear": 75, "trust": 45, "pain": 60 }
}
```

### Response

```json
{
  "patient_reaction": "Bghit nmout b'karama...",
  "dr_ethics_feedback": "Excellent first step. Exploring values...",
  "score_delta": { "autonomy": 8, "beneficence": 4, "nonMal": 3, "justice": 0 },
  "emo_delta": { "fear": -15, "trust": 20, "pain": 0 },
  "updated_scores": { "autonomy": 58, "beneficence": 54, "nonMal": 53, "justice": 50 },
  "updated_emo": { "fear": 60, "trust": 65, "pain": 60 },
  "next_step_id": "s2",
  "is_final": false
}
```

---

## Scoring System

Each decision modifies the four principle scores (0–100):

| Score | Grade |
|-------|-------|
| ≥ 75 | Excellent ethical judgment |
| ≥ 60 | Good ethical reasoning |
| ≥ 45 | Needs deeper reflection |
| < 45 | Review core principles |

---

## Adding a New Case

1. Create `backend/app/data/cases/case_XX_your_title.json`
2. Follow the structure of any existing case file
3. Restart the backend — it auto-discovers all JSON files in the `cases/` folder
4. Optional: if you maintain curated case cards in the frontend UI, add metadata in `frontend/app/cases/page.tsx`

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Enables OpenAI scenario/evaluation features | Recommended |
| `OPENAI_MODEL` | OpenAI model override (default set in backend config) | Optional |
| `ANTHROPIC_API_KEY` | Enables live Dr. Ethics AI feedback | Optional |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins for backend CORS | Required in production |

Without the key, the engine uses high-quality static fallback responses for every choice.

---

## Ownership and License

This project is proprietary software.

- Copyright owner: **Mohammed El Fatih Douhamd**
- License: see `LICENSE` (All Rights Reserved)
- No one may copy, redistribute, modify, or reuse this code without prior written permission.

---

## Security: API Keys and Secret Safety

Never commit secrets to git. Keep real keys only in local env files or hosting platform secrets.

### Local files

- `backend/.env` contains real local secrets and is ignored by git.
- `backend/env.example` must contain placeholders only (never real keys).

### Key rotation (if a key was exposed)

If a key appears in git history, screenshots, logs, or chat, rotate immediately:

1. Create a new key in the provider dashboard.
2. Update `backend/.env` with the new key.
3. Revoke/delete the old key.

Do this for both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` when relevant.

### If GitHub blocks push with secret scanning (GH013)

1. Remove secret files from tracking (`backend/.env` must be ignored).
2. Rewrite commits that contained the secret.
3. Re-commit clean history.
4. Push again.
5. Rotate leaked keys even after cleanup.

---

## Production URL Variables (for public QR links)

Set these in your deployed frontend service:

- `NEXT_PUBLIC_API_URL=https://<your-backend-domain>`
- `NEXT_PUBLIC_WS_URL=wss://<your-backend-domain>`
- `NEXT_PUBLIC_PUBLIC_JOIN_BASE_URL=https://<your-frontend-domain>`

Set this in backend:

- `CORS_ORIGINS=https://<your-frontend-domain>`

With these values, QR codes point to a public join URL usable by anyone.

Phones on **4G or another Wi‑Fi** still work as long as both URLs are **public** (not `localhost`). The frontend is served over **HTTPS**, so API calls use **https://** and websockets use **wss://**. If you forget and set `http://` / `ws://` for a remote host, the browser build upgrades those to **https://** / **wss://** when the page is loaded over HTTPS (see `frontend/lib/public-runtime.ts`).

---

## Deploying on Railway (monorepo)

If Railway shows **“Railpack could not determine how to build the app”** and lists only `backend/`, `frontend/`, `README.md` at the repo root, the service is building from the **wrong directory**. At the monorepo root there is no `package.json` or `requirements.txt`, so auto-detect fails.

Do this:

1. Create **two** services in one Railway project (e.g. `ethicare-backend`, `ethicare-frontend`).
2. For each service, open **Settings → Root Directory**:
   - Backend: `backend`
   - Frontend: `frontend`
3. Connect the **same GitHub repo** to both services.
4. Each folder already has a **`Dockerfile`** and a **`railway.json`** that sets `"builder": "DOCKERFILE"` so Railway builds via Docker instead of guessing with Railpack at the wrong root.
5. Generate a **public domain** for each service. Set variables (see **Production URL Variables** above), using your real `*.up.railway.app` URLs: `NEXT_PUBLIC_*` on the frontend, `CORS_ORIGINS` + `OPENAI_API_KEY` on the backend.
6. Redeploy the frontend after changing `NEXT_PUBLIC_*`.

Official guide: [Deploying a monorepo to Railway](https://docs.railway.com/guides/deploying-a-monorepo).

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: FastAPI, Pydantic v2, httpx, uvicorn
- **AI**: OpenAI (primary) with Anthropic + offline fallback paths
- **Data**: JSON case files — no database required for the demo

---

## 8-Day Demo Roadmap

| Day | Task |
|-----|------|
| 1 | ✅ Backend scaffold + 3 case JSONs + API test |
| 2 | ✅ React component shell |
| 3 | Connect frontend → backend (axios) |
| 4 | ✅ Decision flow + score updates + Dr. Ethics |
| 5 | ✅ Debrief screen + replay flow |
| 6 | Design polish + case selection |
| 7 | Bug fixes + presentation rehearsal |
| 8 | Final screenshots + demo prep |
