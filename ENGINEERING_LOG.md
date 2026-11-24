# Engineering Log

## 2026-11-24 — Taproom landing page and health check

1. **What changed.** `GET /` now serves a self-contained dark-mode landing page (title, tagline, static server-online badge, disabled Phase 2 start button). `GET /health` returns `{ status: "ok", version: "0.1.0" }`. The Express app is exported and only listens when `index.js` is the process entry point. `index.test.js` covers both routes via Node's built-in test runner.
2. **Why.** The page is the Phase 1 shell for the quiz. Markup and CSS live in `index.js` so there is no frontend build. The health JSON is a cheap probe for Cloud Run. Listening only as main lets tests import the app without binding port 8080.
3. **Security and cost.** No secrets, no user input, and no database or LLM calls. The badge is static HTML with no client polling or WebSockets, so the service can still scale to zero.
