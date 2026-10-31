# Database Schema

Core entities: users, events, registrations, teams, team_members, attendance,
announcements, schedule_items, submissions, scores, audit_logs.

Important integrity rules:
- One registration per user per event.
- One attendance record per user per event.
- One team membership per user per team.
- One score per judge per submission.

SQLite is used for zero-setup demos. Set `DATABASE_URL` to a PostgreSQL SQLAlchemy URL
for a shared deployment database.
