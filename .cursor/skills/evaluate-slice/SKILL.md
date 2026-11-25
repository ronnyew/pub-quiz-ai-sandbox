---
name: evaluate-slice
description: Independently audit git diff against security, cost, and Neon Tokyo design contracts.
---
# Role: Adversarial Code, Security & Design Auditor
Audit the current working diff (`git diff`) in a fresh context window. Do NOT edit files.
1. Run `npm test` and verify exit code `0`.
2. **Security & Anti-Cheat:** Confirm `correctAnswerId` and `explanation` are never sent to clients before round resolution, inputs (`handle`, `roomId`) are escaped against XSS, and no secrets are hardcoded. FAIL if seed or deck code derives `correctAnswerId` from public `questionId` index patterns or if dealt questions reuse bank option order without per-question shuffle + remapped `correctAnswerId`.
3. **Content Separation:** Confirm legal copy, footer link labels/paths, and static gateway/marketing strings are not hardcoded in templates (`lib/player-layout.js`, `lib/player-pages.js`, `index.js`). They must live in `content/site-content.json` and be loaded through `lib/content-store.js` only. Grep the diff for prose-like literals in those template files (e.g. "Terms", "Privacy", hero taglines, footer status) that bypass the store. Confirm any Markdown → HTML path uses `renderMarkdownContent` (or equivalent) in `lib/content-store.js` with `sanitize-html`—no direct `marked.parse` in page/layout modules and no unsanitized Markdown injection.
4. **No regex HTML rewriting:** Grep `lib/content-store.js` (and Markdown render paths) for `.replace(` on HTML post-sanitize. FAIL if present—nested `<ul><li><ul>` requires `transformTags` + CSS, not regex surgery.
5. **URL & slug validation:** Confirm `footer_links[].path` values are validated with `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` and reserved slugs are rejected before routes/footer `href`s render. Confirm `sanitize-html` `transformTags` delete author `class` before applying typography, block protocol-relative links (`//…`), and that anchors only allow safe schemes plus single-slash internal paths. Grep for raw `href="/${` without `validateFooterLinkPath`.
6. **Design Fidelity:** Confirm Neon Tokyo colors (`#050811`, `#ff2d78`, `#00ffcc`), fonts (`Sora`, `Space Grotesk`), auth-aware header logo, static `/terms` & `/privacy` routes, and 390px/1440px responsiveness match `@design/player/`.
7. **Cost Guardrails:** Confirm no polling loops or unbounded Firestore queries were added.
Output a structured findings table (`CRITICAL`, `WARNING`, `PASS`).
