# HACKOS — Hackathon Operations System

A runnable full-stack starter for managing hackathon events, registrations, teams, check-ins,
announcements, schedules, submissions, judging, results, and audit history.

## Stack
- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy
- Database: SQLite by default (easy local demo); PostgreSQL-ready via `DATABASE_URL`
- Authentication: JWT bearer tokens with role-based checks
- QR: unique participant check-in codes (QR image endpoint included)
- Offline check-in: browser local queue + sync endpoint

## Requirements
- Python 3.10+
- Node.js 18+

## Run on Windows

### 1. Backend
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Backend: http://127.0.0.1:8000  
API docs: http://127.0.0.1:8000/docs

On first start, the app creates the database and seeds demo accounts:
- Organizer: `organizer@hackos.local` / `HackOS@123`
- Judge: `judge@hackos.local` / `HackOS@123`
- Participant: `participant@hackos.local` / `HackOS@123`

Change demo passwords and `SECRET_KEY` before exposing the app publicly.

### 2. Frontend (new terminal)
```powershell
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## Included workflows
- Login and role-aware navigation
- Organizer overview and event creation
- Participant registration and listing
- Team creation
- Attendance check-in by participant code; offline queue with later sync
- Announcements and schedule entries
- Project submissions
- Rubric-based score capture and leaderboard
- Audit log records
- CSV report export

## Notes
This is a hackathon-ready MVP foundation, not a security-audited production service.
For production, add HTTPS, email verification, password reset, refresh-token rotation,
rate limiting, object storage, backups, stronger device attestation for offline scans,
and formal privacy/retention controls. Offline QR scans are queued locally and validated
when synced; they cannot guarantee real-time revocation while disconnected.


## Updated modules
- Participant team membership: team leaders can add an already-registered participant by email; event membership and team-size limits are checked.
- Attendance: staff can enter a pass code, use browser QR scanning where `BarcodeDetector` is supported, and queue check-ins locally while offline. Queued check-ins are sent to `/api/attendance/sync` when the browser reconnects.
- Participant pass: participants can display their event QR pass from the Events page.
- Schedule: organizers can publish schedule items from the Schedule page.
- Participant submission listing is restricted to the participant's own teams.

## Clean setup
1. Create a Python virtual environment and install `backend/requirements.txt`.
2. Copy `backend/.env.example` to `backend/.env` and replace both secret values with private random values.
3. Start the API from `backend`: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
4. Install frontend dependencies in `frontend` with `npm install`, then run `npm run dev`.
5. Open the Vite URL printed in the terminal. API docs are at `http://127.0.0.1:8000/docs`.

The camera scanner requires browser camera permission and a secure context (localhost is allowed). If the browser does not support `BarcodeDetector`, use the manual participant-code field. Offline check-ins are stored in that browser's local storage until a sync succeeds. This is a student-project prototype; test all roles and workflows before using it at a live event.
