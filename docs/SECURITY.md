# Security Notes

The app includes password hashing, JWT authentication, role checks, request validation,
and audit logging. It is a prototype, not a security-audited production deployment.

Before public deployment:
- Replace SECRET_KEY with a strong secret and never commit `.env`.
- Use HTTPS and secure deployment secrets.
- Add rate limits, email verification, password reset and token revocation.
- Review role permissions and event-level access rules.
- Validate and scan uploaded files before enabling uploads.
- Define data retention, consent, export and deletion workflows.
- Avoid collecting sensitive identifiers unless absolutely necessary.
