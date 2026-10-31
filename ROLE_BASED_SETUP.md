# HACKOS role-based update

## Roles
- Organizer: creates events, staff accounts, tasks, announcements; sees operations and audit logs.
- Judge: reviews submissions and records rubric scores.
- Mentor: sees team/project progress and assigned tasks.
- Participant: creates an account, registers for events, creates a team and submits projects.
- Volunteer: participant directory and event check-in.

## Important access rule
Public registration always creates a participant account. Organizer, judge, mentor and volunteer access is assigned by an organizer; users cannot promote themselves by choosing a privileged role on the public sign-up form.

## First-time setup
1. Stop the backend with Ctrl+C.
2. Open `backend/.env` (create it by copying `.env.example`).
3. Set `HACKOS_BOOTSTRAP_KEY` to a long private value. Also replace `SECRET_KEY` with a long random value.
4. Start backend from the backend directory:
   `python -m uvicorn app.main:app --reload`
5. Open the frontend and choose **First-time organizer setup**. Enter the same bootstrap key, your organizer name, email and password (10+ characters).
6. The bootstrap endpoint closes after the first organizer account is created.
7. Sign in as organizer. Use **Staff & Tasks** to create mentor/judge/volunteer accounts and assign tasks.

## Start frontend
From `frontend`:
`npm install`
`npm run dev`
Open `http://localhost:5173`.

## Database note
The update adds a `tasks` table automatically. It does not delete your existing database or old demo rows. New accounts are created through sign-up/staff setup. Existing data is preserved.

## API
Open `http://127.0.0.1:8000/docs`.

This is a hackathon prototype. Before a real public deployment, use HTTPS, a production database, secure secret management, email verification/password reset, rate limiting, backups, and a formal role invitation process.
