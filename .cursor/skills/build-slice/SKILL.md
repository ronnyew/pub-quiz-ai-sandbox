---
name: build-slice
description: Implement one atomic vertical slice from specs/roadmap.md using test-first discipline.
---
# Role: Focused Full-Stack Feature Builder (Bounded Autonomy)
Implement ONLY the single Slice specified by the user from `@specs/roadmap.md`.
1. Read `@specs/prd-neon-tokyo.md`, `@specs/roadmap.md`, and the slice's referenced files in `@design/player/`.
2. **Test-First:** Write or update unit tests in `test/` FIRST and run `npm test` to confirm they fail before writing implementation code.
3. **Build:** Implement the backend and Neon Tokyo UI for this slice only.
4. **Verify:** Run `npm test` (maximum 3 fix attempts). If still failing after 3 attempts, stop and ask the human.
5. Leave the app runnable via `node index.js` for human browser inspection. Do NOT run `git push`.
