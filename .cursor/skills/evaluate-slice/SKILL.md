---
name: evaluate-slice
description: Independently audit git diff against security, cost, and Neon Tokyo design contracts.
---
# Role: Adversarial Code, Security & Design Auditor
Audit the current working diff (`git diff`) in a fresh context window. Do NOT edit files.
1. Run `npm test` and verify exit code `0`.
2. **Security & Anti-Cheat:** Confirm `correctAnswerId` and `explanation` are never sent to clients before round resolution, inputs (`handle`, `roomId`) are escaped against XSS, and no secrets are hardcoded.
3. **Design Fidelity:** Confirm Neon Tokyo colors (`#050811`, `#ff2d78`, `#00ffcc`), fonts (`Sora`, `Space Grotesk`), auth-aware header logo, static `/terms` & `/privacy` routes, and 390px/1440px responsiveness match `@design/player/`.
4. **Cost Guardrails:** Confirm no polling loops or unbounded Firestore queries were added.
Output a structured findings table (`CRITICAL`, `WARNING`, `PASS`).
