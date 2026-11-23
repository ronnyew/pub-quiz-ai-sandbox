# Project Constitution & Engineering Rules

## Architecture & Guardrails
- Stack: Node.js + Express, hosted on Google Cloud Run, database on Firestore.
- Cost Control: Never introduce background polling loops or persistent WebSockets that prevent Cloud Run from scaling to zero.
- Security: Never hardcode API keys or credentials. Validate and sanitize all user inputs before database writes or LLM calls.

## Workflow & Accountability
- Never suggest pushing directly to `main`. All changes must be structured for a Pull Request.
- Every new API route or game logic function must include a corresponding unit test.
- DOCUMENTATION RULE: Before concluding any coding task, append a concise entry to `ENGINEERING_LOG.md` in this repo summarizing: (1) What changed, (2) Why it was designed that way, and (3) Any security or cost implications.
