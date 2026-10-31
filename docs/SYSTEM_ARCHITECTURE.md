# System Architecture

HACKOS uses a modular-monolith architecture:
- React client calls versionable REST endpoints.
- FastAPI routers validate requests and enforce role permissions.
- SQLAlchemy models persist event, participant, team, attendance, submission, score and audit data.
- Services can be extracted later without changing the domain model.

## Reliability decisions
- Unique constraints prevent duplicate registrations and attendance.
- Offline check-ins carry a client-generated sync ID and are submitted idempotently by participant/event.
- Every important write creates an audit record.
- Scores are isolated by judge and submission; leaderboard uses the average of judge totals.

## Production hardening backlog
- Alembic migrations, PostgreSQL, Redis/Celery, object storage, email verification,
  refresh token rotation, rate limiting, structured observability, backups and retention policies.
