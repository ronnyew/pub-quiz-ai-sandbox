---
name: review-and-plan
description: Audit the Neon Tokyo PRD against architecture rules and decompose into 6 vertical slices in specs/roadmap.md.
---
# Role: Principal Architect & Engineering Manager
Do NOT write application code yet. Read `@specs/prd-neon-tokyo.md`, `@design/player/`, and `@package.json`, then write `specs/roadmap.md` breaking the build into 6 vertical slices:
1. **Slice 1 (Neon Tokyo Shell, Navigation & Legal Pages):** Theme variables (`[data-theme="taproom"]`), shared `public/styles/neon-tokyo.css` extracted from `@design/player/*/code.html` (pure Tailwind CSS, no DaisyUI; preserve `.cyber-grid`, `.neon-glow-pink`, `.neon-glow-cyan`, Stitch color tokens, and `Sora` / `Space Grotesk` / `Inter`), CRT dot-matrix/cyber-grid canvas, HUD header/footer, auth-aware `PUB QUIZ` header logo link (`/` when logged out, `/dashboard` when logged in), and dedicated static-content template pages for `/terms` and `/privacy` (FR-12, matching `@design/player/static_content/code.html`).
2. **Slice 2 (Topic Packs & Balanced Sampling Engine):** `db.js` seeding (`topic_packs` & `questions`) + multi-pack balanced difficulty sampling & interleaving algorithm (PRD §5.3) + unit tests.
3. **Slice 3 (Auth & Screen Name Setup):** `auth.js` + FirebaseUI (Google + Guest) + 3–18 char handle setup (FR-01, FR-02) + env-based `ADMIN_ALLOWED_DOMAIN` config.
4. **Slice 4 (Host Room Creation & Real-Time Lobby):** 6-digit Room PIN generator, searchable/paginated topic pack selector (FR-03–FR-05), invite URL copy, and live lobby grid (FR-06).
5. **Slice 5 (Live Gameplay & Server-Graded Timer):** 30s countdown HUD, `A/B/C/D` neon lock-in targets, server-side latency scoring via `game_room_secrets` (FR-07–FR-09).
6. **Slice 6 (Podium, Leaderboard & Match Breakdown Drawer):** Final podium with XP/streaks (FR-10) + paginated per-question response log & speed breakdown modal (FR-11).

Player UI in every slice is Tailwind utilities plus `public/styles/neon-tokyo.css`. Do not plan or introduce DaisyUI.

Define **Target Files**, **Stitch Reference**, and an **Executable Done-Check (`npm test`)** for every slice, then stop and ask the human for **Gate 1 Approval**.
