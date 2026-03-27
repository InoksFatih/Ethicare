# EthiCare — Medical Ethics Training Simulator

A scenario-based training tool for healthcare students. Play as a doctor, navigate ethical dilemmas with real patients, and receive live AI feedback from **Dr. Ethics**.

---

## Project Structure

```
ethicare/
├─ backend/              FastAPI — scoring engine, case data, AI feedback
│  ├─ app/
│  │  ├─ main.py         App entry point + CORS
│  │  ├─ routes/cases.py REST endpoints
│  │  ├─ services/engine.py  Scoring logic + Anthropic API
│  │  ├─ models/schemas.py   Pydantic request/response models
│  │  └─ data/cases/     JSON case files (one per scenario)
│  └─ requirements.txt
│
├─ frontend/             React + Vite + plain CSS-in-JS
│  ├─ src/
│  │  ├─ components/     Sidebar, ChatPanel, DecisionCards, EthicsPanel, LawPanel, DrEthicsPanel
│  │  ├─ pages/          CasePlayer.jsx (main simulator)
│  │  ├─ data/           api.js (axios), cases.js (embedded fallback)
│  │  ├─ App.jsx         Case selection screen
│  │  └─ main.jsx        React entry point
│  └─ package.json
│
└─ README.md
```

---

## Included Cases

| # | Title | Principles | Law |
|---|-------|-----------|-----|
| 03 | Refusal of Chemotherapy | Autonomy, Beneficence | Article 6 |
| 07 | Informed Consent Under Pressure | Autonomy, Justice | Article 7 |
| 12 | End-of-Life Decision | All four | Article 4 & 9 |

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
npm install
npm run dev
# → http://localhost:5173
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
4. Add it to `frontend/src/data/cases.js` for offline fallback

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Enables live Dr. Ethics AI feedback | Optional |

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

---

## Tech Stack

- **Frontend**: React 18, Vite, Axios, plain CSS-in-JS (no Tailwind dependency needed)
- **Backend**: FastAPI, Pydantic v2, httpx, uvicorn
- **AI**: Anthropic Claude Sonnet (optional, with fallback)
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
