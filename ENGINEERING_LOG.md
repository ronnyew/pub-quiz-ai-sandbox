# Engineering Log

## 2026-11-24 — Taproom landing page and health check

1. **What changed.** `GET /` now serves a self-contained dark-mode landing page (title, tagline, static server-online badge, disabled Phase 2 start button). `GET /health` returns `{ status: "ok", version: "0.1.0" }`. The Express app is exported and only listens when `index.js` is the process entry point. `index.test.js` covers both routes via Node's built-in test runner.
2. **Why.** The page is the Phase 1 shell for the quiz. Markup and CSS live in `index.js` so there is no frontend build. The health JSON is a cheap probe for Cloud Run. Listening only as main lets tests import the app without binding port 8080.
3. **Security and cost.** No secrets, no user input, and no database or LLM calls. The badge is static HTML with no client polling or WebSockets, so the service can still scale to zero.

## 2026-11-25 — Neon Tokyo six-slice roadmap

1. **What changed.** Added `specs/roadmap.md`. It audits the PRD against the Cloud Run, anti-cheat, and auth rules, then splits the MVP into six vertical slices with target files, Stitch screens, and `npm test` done-checks.
2. **Why.** Gate 1 needs a build order that a later slice can implement without re-deciding hosting, live sync, or where answer keys live. The PRD’s Firebase Hosting, WebRTC, and Cloud Functions grading conflict with Express on Cloud Run and the `game_room_secrets` split, so the roadmap records which side wins.
3. **Security and cost.** No application code, routes, or credentials. The plan forbids server polling and WebSockets, keeps `correctAnswerId` off public room documents, and reads admin allow-lists from the environment.

## 2026-11-25 — Drop DaisyUI from the player frontend

1. **What changed.** Player styling is now Tailwind CSS v4 plus `public/styles/neon-tokyo.css` extracted from the Stitch HTML. DaisyUI is removed from `core-architecture.mdc`, `ui-design-system.mdc`, the review-and-plan skill, `CLAUDE.md`, and `.cursorrules`. `specs/roadmap.md` Slice 1 builds that stylesheet, and Slice 6’s match drawer uses the Stitch Tailwind overlay.
2. **Why.** The Stitch exports already define `.cyber-grid`, `.neon-glow-pink`, `.neon-glow-cyan`, and the Sora / Space Grotesk / Inter tokens. A second component library would restyle those screens away from the approved mocks.
3. **Security and cost.** Documentation only. The stylesheet is a static file with no runtime polling. No secrets were added.

## 2026-11-25 — Roadmap tracks the repaired question schema

1. **What changed.** `specs/roadmap.md` now treats PRD §5.2 as valid JSON. `Question.sourceCitations` is `{ title, link }[]`. Slice 1’s done-check covers both wordmark targets (`/` logged out, `/dashboard` logged in) and dedicated `/terms` and `/privacy` pages. Active client payloads omit citations along with the answer key.
2. **Why.** The spec sample was repaired, so the roadmap no longer describes a broken comma and curly quotes. Citations can name the correct answer, so they stay on `game_room_secrets` until the round closes.
3. **Security and cost.** Planning text only. No new routes, credentials, or server loops.

## 2026-11-25 — Gate 1 approved

1. **What changed.** `specs/roadmap.md` status is Gate 1 approved. No application code was added.
2. **Why.** The six-slice plan, Tailwind-only player stylesheet, auth-aware wordmark, `/terms` and `/privacy` pages, and the repaired §5.2 question schema are the build contract.
3. **Security and cost.** No routes, secrets, or runtime behavior changed. Slices still start only when requested, one at a time.

## 2026-11-25 — Slice 1: Neon Tokyo shell, navigation, and legal pages

1. **What changed.** Replaced the warm taproom landing with the Neon Tokyo player shell: `public/styles/neon-tokyo.css` (Stitch tokens, `@theme`, CRT matrix, cyber-grid), shared layout in `lib/player-layout.js`, gateway and legal renderers in `lib/player-pages.js`, JSON bodies in `content/legal/`, routes `GET /`, `/terms`, `/privacy`, static `public/`, and tests in `index.test.js` plus `test/shell.test.js`. `GET /health` is unchanged.
2. **Why.** Slice 1 is the visual and routing foundation before auth and game data. Legal copy lives in JSON for a future admin editor; the layout branches the `PUB QUIZ` wordmark on a `signedIn` flag for Slice 3. Pages load Tailwind v4 browser and the shared stylesheet only—no DaisyUI.
3. **Security and cost.** No credentials, databases, or background timers. Legal and page text is server-escaped. Static CSS and HTML responses keep Cloud Run scale-to-zero friendly.

## 2026-11-25 — Slice 1 content store (Markdown legal + static_copy)

1. **What changed.** Consolidated gateway hero copy and legal bodies into `content/site-content.json` (`static_copy`, `footer_links` with Markdown). Added `lib/content-store.js` (`marked`, `sanitize-html`, Neon Tokyo typography classes). Footer links and static-content sidebar menu are generated from `footer_links`; routes register per link in `index.js`. Removed `content/legal/*.json`. Tests: `test/content-store.test.js` plus expanded `test/shell.test.js`. Documented in `specs/roadmap.md` and `.cursor/rules/ui-design-system.mdc`.
2. **Why.** One admin-ready schema for future Firestore sync; Markdown lets legal pages preview all typography safely without template edits.
3. **Security and cost.** HTML sanitization strips scripts and unsafe URLs; only `http`, `https`, and `mailto` links survive. No extra runtime loops; content is read from disk once per process.

## 2026-11-25 — Content separation governance (CLAUDE, core-architecture, evaluate-slice)

1. **What changed.** Documented the site-content store contract in `CLAUDE.md`, `.cursor/rules/core-architecture.mdc`, and added a Content Separation audit step to `.cursor/skills/evaluate-slice/SKILL.md`.
2. **Why.** Agents and `/evaluate-slice` auditors must enforce one path for static/legal copy (`content/site-content.json` → `lib/content-store.js` → sanitized HTML) so Admin Firestore swap stays safe.
3. **Security and cost.** Documentation only; reinforces XSS sanitization and keeps templates free of editable prose.

## 2026-11-25 — Static-content & gateway Stitch fidelity

1. **What changed.** Legal pages now render document `h1` (split headline + cyan accent), leading paragraph, and `date_label` above Markdown body; sidebar, breadcrumb, and article chrome match `static_content/code.html` hex tokens. Gateway uses vertically centered main, green `Pub Quiz` hero chip, and homepage card corners. `footer_links` gained `headline_primary`, `headline_accent`, and `date_label` in `site-content.json`.
2. **Why.** Slice 1 visuals should match approved Stitch mocks; headline and date stay in the content store, not templates.
3. **Security and cost.** No new routes or timers; still content-store driven.

## 2026-11-25 — Fix Neon Tokyo web fonts on player pages

1. **What changed.** Added `@import "tailwindcss"` to `neon-tokyo.css`, explicit `.font-headline` / `.font-body` / `.font-label` stacks (Space Grotesk + monospace for labels), default Inter on `body`, and load order: stylesheet before `@tailwindcss/browser@4`.
2. **Why.** Without Tailwind v4 import, `font-*` utilities never registered so the browser fell back to Tailwind’s system sans stack despite Google Fonts loading.
3. **Security and cost.** Static CSS only; no runtime cost change.

## 2026-11-25 — Static content cyan list bullets from Markdown

1. **What changed.** Markdown `ul`/`li` in `renderMarkdownContent` get `static-content-ul` / `static-content-li` classes, li bodies wrap in `div.text-sm`, and `neon-tokyo.css` applies the Stitch panel, flex rows, and `::before` cyan glow bullets; `strong` labels match prototype headline uppercase styling.
2. **Why.** Legal copy stays plain Markdown; presentation matches `static_content/code.html` without authors hand-writing HTML.
3. **Security and cost.** Post-sanitize wrapper only adds trusted markup; no new network or timers.

## 2026-11-25 — CMS slug allow-list and link sanitization hardening

1. **What changed.** `content-store` validates `footer_links[].path` with `CONTENT_SLUG_REGEX`, rejects reserved slugs, blocks `//` anchor hrefs, and strips author `class` before typography transforms. `index.js`, `player-layout.js`, and `player-pages.js` call `validateFooterLinkPath` when building routes and hrefs. Regression tests in `test/shell.test.js`. Governance updates in `CLAUDE.md`, `.cursorrules`, `core-architecture.mdc`, `evaluate-slice`.
2. **Why.** Evaluator WARNING: prevent double-slash hrefs, protocol-relative links, and unvalidated CMS slugs colliding with `/health`, `/api`, etc.
3. **Security and cost.** Fail-fast on invalid site JSON at load; no extra I/O or background work.

## 2026-11-25 — Remove regex HTML list rewriting; nested list DOM

1. **What changed.** Deleted `enhanceStaticContentLists` from `content-store.js`. List styling now uses `transformTags` utility classes plus `.content-markdown` CSS (top-level panel, nested `ul`/`ol` indent, cyan `::before` bullets, `::marker` on ordered lists). Regression tests for balanced nested Markdown lists in `test/content-store.test.js` and `test/shell.test.js`. **No regex HTML rewriting** rule added to `CLAUDE.md`, `.cursorrules`, `core-architecture.mdc`, `evaluate-slice`.
2. **Why.** Regex post-processing broke valid nested `<ul><li><ul>` trees; sanitization output must stay structurally intact.
3. **Security and cost.** No change to slug/link rules; slightly simpler render path.

## 2026-11-25 — Slice 2: topic packs and balanced sampling

1. **What changed.** Added an in-memory `db.js` Map store, `data/seed.js` (6 host-screen pack titles and 23 questions across easy, medium, and hard), and `buildDeck` in `lib/sample-deck.js`. `GET /api/topic-packs` returns pack metadata only. Tests live in `test/db.test.js` and `test/sample-deck.test.js`.
2. **Why.** The dealer has to exist before rooms. Pack quotas are floor division, with the remainder given to the earliest packs in host order. The default mix uses largest-remainder on 2/5, 2/5, and 1/5 so the 40/40/20 split stays exact in integer math. Round-robin interleave keeps a pack from sitting next to itself while another selected pack still has cards. Callers get a client deck without answer keys and a secret deck that keeps them.
3. **Security and cost.** No Firestore client and no credentials; `NODE_ENV=test` never touches GCP. Pack ids are allow-listed before a read. The pack route rejects `limit` above 24, and question reads cap at 500. No server timers or WebSockets.

## 2026-11-25 — Slice 2 evaluator hardening (anti-cheat seed, catalog parity)

1. **What changed.** Seed rows use author-chosen `correctLetter` placements (not `(index - 1) % 4`). `buildDeck` shuffles each question’s options and remaps `correctAnswerId`. Craft Beer pack label is `FUN`; `world_history_01`, `music_80s_90s_01`, and `video_game_lore_01` each have six questions (2× EASY/MEDIUM/HARD). Tests cover suffix unpredictability, deck shuffle, per-pack depth, and 10-question single-pack deals. Governance in `CLAUDE.md`, `core-architecture.mdc`, and `evaluate-slice`.
2. **Why.** Evaluator warnings: public `questionId` suffixes must not leak answer slots, and every catalog pack must satisfy default 40/40/20 deals up to 10 questions while matching the host-screen Craft Beer badge.
3. **Security and cost.** Presentation shuffle is O(1) per dealt question with injectable RNG; no extra I/O or background work.

## 2026-11-25 — Slice 3: auth and screen-name setup

1. **What changed.** Added `auth.js` (HMAC session cookies, `validateHandle`, `getAuthProviders`, `getAdminPolicy`, Firebase client config from env), gateway FirebaseUI mount with Google + anonymous guest, `GET/POST /onboarding/handle`, `POST /api/handle`, `POST /api/auth/session`, `GET /dashboard` placeholder, and CMS copy for auth/onboarding/dashboard. Tests in `test/auth.test.js` and `test/handle.test.js`.
2. **Why.** Identity and handle rules must be enforced server-side before rooms. Sessions are signed with `SESSION_SECRET` (fail closed in production). Tests drive auth with fake identities under `NODE_ENV=test`; production verifies Firebase `idToken` via Identity Toolkit lookup. Admin allow-lists stay env-only with no hardcoded domains.
3. **Security and cost.** Handles are validated with `^[A-Za-z0-9]{3,18}$` and escaped before HTML echo or JSON response. No API keys in repo; no server polling or timers. Token verification is request-scoped `fetch` only when a client posts an `idToken`.

## 2026-11-25 — Slice 3 gateway auth fidelity (homepage tabs + Firebase Auth SDK)

1. **What changed.** Replaced FirebaseUI widget with a Stitch-aligned tabbed gateway (`Federated / SSO` vs `Email & Password`), custom Neon Tokyo inputs (`.pq-auth-input`, `#13131f` / `#f0f0f8`), and `public/scripts/gateway-auth.js` for Google, anonymous guest, email/password, passwordless email link, and phone SMS flows. `getAuthProviders` now exposes `email`, `emailLink`, and `phone`, default-on when Firebase env is set (`AUTH_ENABLE_EMAIL` / `AUTH_ENABLE_PHONE` can disable). CMS labels extended in `site-content.json`; tests expanded in `test/auth.test.js`.
2. **Why.** Homepage Stitch is the visual contract; Material/FirebaseUI white inputs broke fidelity. A single client script keeps styling owned by `neon-tokyo.css` while still exchanging verified `idToken`s at `POST /api/auth/session` with redirect hints to handle onboarding or dashboard.
3. **Security and cost.** Session providers are allow-listed server-side; email-link completion stays on `/` with server-set cookies only after token lookup. reCAPTCHA loads on demand for phone only. No new background work or persistent connections.

## 2026-11-25 — Slice 3 passwordless email link + crimson auth alerts

1. **What changed.** Email tab is **Email Link** only (single field + **Send Magic Sign-In Link**); password, forgot-password, and create-account UI removed. Crimson `role="alert"` banner for errors; cyan success banner for link-sent confirmation. `getAuthProviders` emits `emailLink` only; `password` rejected in test sessions; Firebase `password` provider ids map to `emailLink` after token lookup. Cross-device link completion uses `#pq-email-confirm-wrap`.
2. **Why.** MVP auth is federated + magic link + phone + guest—no password credentials on the gateway. Styled alerts keep Firebase/session errors inside the Stitch card without `innerHTML`.
3. **Security and cost.** No password provider in session allow-list; magic-link URL pinned to `origin + '/'`. Alerts use `textContent` only.

## 2026-11-25 — Slice 3 per-provider auth toggles and 3-tab gateway

1. **What changed.** `getAuthProviders()` reads `AUTH_ENABLE_GOOGLE`, `AUTH_ENABLE_EMAIL`, `AUTH_ENABLE_PHONE`, and `AUTH_ENABLE_ANONYMOUS` (default on; `"0"`/`"false"` off). Gateway auth card uses up to three tabs (**Sign In**, **Email**, **Phone**) with conditional panels and hidden tab bar when only one tab remains. `POST /api/auth/session` returns **403** for disabled providers. Client `gateway-auth.js` switches `data-auth-panel` tabs.
2. **Why.** Ops can mirror Firebase Console enablement in env without template edits. Phone/SMS moves off the federated row into its own tab for clearer UX.
3. **Security and cost.** Provider gate runs before session minting; UI only renders enabled methods. No extra server polling.

## 2026-11-25 — Slice 3 phone tab progressive SMS disclosure

1. **What changed.** Phone tab uses primary **Send SMS Code**, hides `#pq-sms-verify-step` until `signInWithPhoneNumber` succeeds, then focuses the code field with primary **Verify** and **Change Phone Number**. `#pq-recaptcha` is zero-size until a challenge renders; client uses invisible `RecaptchaVerifier` with fallback. Tests assert initial HTML shape.
2. **Why.** Matches email-tab CTA hierarchy and keeps the card clean before SMS is dispatched.
3. **Security and cost.** reCAPTCHA still required for phone auth; no layout shift until Google injects a challenge.

## 2026-11-25 — Slice 3 zero-PII handle persistence

1. **What changed.** `db.js` adds `getUserProfile` / `saveUserProfile` storing only `{ uid, handle, provider, updatedAt }`. Tests use in-memory Map; local dev persists `.data/users.json` (gitignored); production uses Firestore `users/{uid}` when GCP env is set. `createPlayerSession` puts `isAdmin` boolean (from in-memory `isAdminEmail` at sign-in) and never email in `pq_session`. Sign-in restores saved handle and returns `redirectTo`; `GET /` redirects signed-in users by handle state.
2. **Why.** Returning players keep handles across restarts without persisting contact PII. Admin checks use the verified token email only during the request, then drop it.
3. **Security and cost.** Cookie and profile writes assert no `email`/`phoneNumber` keys. Firestore client loads lazily only when credentials/project env indicate production; tests never touch disk or GCP.

## 2026-11-25 — Slice 3 evaluator auth hardening

1. **What changed.** Removed anonymous guest sign-in (`getAuthProviders`, gateway HTML, `gateway-auth.js`). `identityFromIdToken` / `identityFromFirebaseLookup` in `auth.js` resolve provider from JWT `firebase.sign_in_provider` and `providerUserInfo`, reject empty linked providers and raw `password` / `anonymous` with **403**. `AUTH_ENABLE_APPLE` gates `apple.com`. `GET /dashboard` redirects users without a locked handle to `/onboarding/handle`. `pq_session` cookies gain `Secure` on HTTPS, production, or Cloud Run (`K_SERVICE`). `.dockerignore` excludes `.data/`. Added `test/auth-identity.test.js`.
2. **Why.** Prevents mis-labeled sessions from Firebase lookup, closes the handle-bypass on dashboard, aligns Apple with Firebase provider IDs, and keeps dev profile files out of container images.
3. **Security and cost.** Forbidden providers fail before cookie mint; session cookies are not sent over plain HTTP in deployed environments. No new background work.

## 2026-11-25 — Slice 3 magic-link provider resolution & phone opt-in

1. **What changed.** `resolveProviderFromFirebaseUser` maps Firebase `signInWithEmailLink` tokens (`sign_in_provider: password`, verified email, no `passwordHash`) to `emailLink` while raw password accounts stay forbidden. `AUTH_ENABLE_PHONE` now defaults off (opt-in via `1`/`true`). Phone tab includes CMS-sourced Google reCAPTCHA attribution links. Gateway `.pq-auth-input` fill/border tokens match Stitch homepage (`#0f0f1a` / white text).
2. **Why.** Magic-link players were rejected as `password`; SMS must not bill until ops explicitly enable phone auth; hidden reCAPTCHA badge requires visible policy links.
3. **Security and cost.** Unverified or password-hash accounts still fail closed with **403**; phone/SMS UI absent unless env enables it.

## 2026-11-25 — Slice 4 host room creation and real-time lobby

1. **What changed.** Added `lib/rooms.js` (game PIN reservation, `APP_BASE_URL`/`PUBLIC_BASE_URL` invite links as `/join?game=`, pack search/pagination, join/save lobby packs, `gamePin` public JSON), `game_rooms` storage in `db.js`, Stitch-aligned dashboard (`dashboard_with_match_modal` + `dashboard-match-modal.js`), host lobby at `GET /game/:gamePin` (no `/host` suffix), `GET /game` create-and-redirect, `POST /game/:gamePin/launch`, `GET /join?game=`, and `GET/POST /api/games`. User-facing copy uses **Game PIN** terminology. Client lobby sync polls `GET /api/games/:gamePin` only while the tab is visible.
2. **Why.** Hosts need a WAITING lobby with configurable invite URLs for local dev and production, a dashboard entry at `/game` (not a form POST to an API), and public payloads that never leak answer keys before Slice 5 deals cards.
3. **Security and cost.** `/dashboard` and `/game*` require session + locked handle; Firestore/path reads stay point lookups. Handles and pack titles are HTML-escaped in SSR. The Node process has no `setInterval`/`WebSocket`; browser polling clears on hide/unload.

## 2026-11-25 — Slice 4 lobby visual parity & host PLAYER GRID

1. **What changed.** Host/waiting views use `hideHeaderMeta` so Game PIN and player counts live only in the page hero. Host lobby matches Stitch gradients, cyan pin badges, slate card borders, topic card CSS/JS selection, launch CTA moved under invite (before PLAYER GRID), and high-contrast copy link styling. Documented host PLAYER GRID in `specs/roadmap.md` and `CLAUDE.md`.
2. **Why.** Removes duplicate chrome, aligns Start/Play screens with retro-arcade Stitch tokens, and keeps the host-side live roster as an explicit product extension.
3. **Security and cost.** No server changes; topic toggles remain plain form checkboxes posted on launch.

## 2026-11-25 — Slice 4 host lobby Stitch class parity

1. **What changed.** Host lobby panels, step badges, topic pills, pagination, and `#launch-game-btn` (`.pq-launch-btn`) now mirror `start_a_game_invite_players_retro_arcade_variant` via `neon-tokyo.css` and updated `renderHostLobbyPage` / `renderTopicPager`.
2. **Why.** Solid pink CTA, cyan/pink panel borders with corner brackets, and arcade pager styling match the approved Stitch reference without reintroducing the gradient launch button.
3. **Security and cost.** Presentation-only; PLAYER GRID layout unchanged under the launch CTA.

## 2026-11-25 — Dashboard hero rotated plaque removed

1. **What changed.** Removed the rotated pink border square from the dashboard hero (clashed with SIGN OUT on both sides).
2. **Why.** Product chrome on the right makes that Stitch-only decoration unusable without visual bugs; cyan top-left corner and hero border remain.
3. **Security and cost.** Presentation-only.

## 2026-11-25 — Host launch form pack sync & lobby errors

1. **What changed.** Renamed launch form to `#launch-game-form` with detached submit via `form="launch-game-form"`, off-page hidden `topicPackIds`, and `host-topic-cards.js` syncing all selections into `#pq-launch-pack-hidden`. `POST /game/:gamePin/launch` re-renders the lobby with `role="alert"` Neon Tokyo banner on empty/invalid packs instead of plain text. Exported `assertPackIds` from `db.js` (was missing from `module.exports`, causing save to throw). Dashboard handle uses `.pq-dashboard-handle` pink glow; global interactive `cursor: pointer` rules in `neon-tokyo.css`.
2. **Why.** External launch button lost pack IDs across pagination and detachment; users saw raw `"Invalid pack selection"`. UX polish for pointer affordance and Stitch handle color.
3. **Security and cost.** Same POST validation via `assertPackIds`; no new background work. CMS copy for error strings only.

## 2026-11-25 — Slice 4 dashboard Stitch parity (`dashboard_with_match_modal`)

1. **What changed.** `renderDashboardPage` / match rows now mirror Stitch pink/cyan action cards, hero accents, history table ticks, outcome chevrons, and match modal corners; `neon-tokyo.css` adds `.pq-dashboard-signout`, join pin, and table hooks; `dashboard-match-modal.js` fills `modal-rounds`. `CLAUDE.md` and Slice 4 in `specs/roadmap.md` document mandatory hero **SIGN OUT**. Tests assert SIGN OUT, `/game` CTA, and `#489028` demo code.
2. **Why.** Dashboard was legibility-broken on the cyan join CTA and missed Stitch border/glow tokens; SIGN OUT is product auth chrome beyond the mock.
3. **Security and cost.** No new polling or routes; sign-out remains existing session POST. Presentation and client-only modal wiring only.

## 2026-11-25 — Slice 4 continuation (Firestore rooms, CSRF-safe create, evaluator fixes)

1. **What changed.** `db.js` persists `game_rooms/{roomId}` in Firestore when `shouldUseFirestore()` / `DATA_BACKEND=firestore` (with `.data/` local fallback for `DATA_BACKEND=local`), strips answer-key fields and PII on write, and uses transactions or in-process locks for concurrent joins. `GET /game` renders a setup shell; `POST /game` (dashboard + shell) creates rooms with `303` redirect. Added `/api/rooms` POST/GET aliases, CMS labels in `content/site-content.json`, dashboard hero cyan bracket, safe `dashboard-match-modal.js` badge DOM, and `room-lobby-sync.js` initial ping from `serverTimeMs`.
2. **Why.** Slice 4 evaluator flagged memory-only rooms, CSRF on `GET /game`, lost concurrent players, XSS in the modal, hardcoded table copy, and missing roadmap `/api/rooms` contract alongside `/game` + Game PIN invites.
3. **Security and cost.** No secrets in public room docs; room creation requires POST session. Firestore is point read/write per request (no background sync). Client lobby polling unchanged (4s, visible tab only).

## 2026-11-25 — Slice 4 evaluator warning fixes (spec sync, joins, CMS ping)

1. **What changed.** Added **Spec & Roadmap Synchronization** rule to `CLAUDE.md` and updated Slice 4 in `specs/roadmap.md` and FR-03/05/06 in `specs/prd-neon-tokyo.md` for `/game`, Game PIN, and `${APP_BASE_URL||origin||pubquiz.app}/join?game=`. `DATA_BACKEND=firestore` no longer blocks seeded `listTopicPacks`; joins dedupe inside `updateGameRoom`; `createWaitingGame` retries on `create()` collision; `buildInviteUrl` defaults to `https://pubquiz.app`; CMS `formatCopyTemplate` for dashboard history pager and lobby labels; `data-ping-template` + navigation timing in `room-lobby-sync.js`.
2. **Why.** Evaluator warnings on stale specs, topic-pack footgun, join/PIN races, hardcoded UI copy, and clock-skew ping text.
3. **Security and cost.** Atomic room writes prevent duplicate players; no new background work. Ping remains client-only display; Firestore/topic-pack split keeps seed reads in-process without extra queries.

## 2026-11-25 — Slice 5 live gameplay and server-graded timer

1. **What changed.** Added `game_room_secrets/{roomId}` persistence in `db.js` (memory, local disk, Firestore) with `runGameRoomBundleTransaction` for atomic answer scoring. `lib/grade.js` grades on server timestamps; `lib/rooms.js` implements `launchActiveGame`, `submitGameAnswer`, `advanceGameQuestion`, and play-state projection. `POST /game/:gamePin/launch` now deals via `buildDeck`, sets `ACTIVE`, and redirects to `GET /game/:gamePin/play`. New APIs: `GET /api/games/:pin/question`, `POST /api/games/:pin/answers` (and `/api/rooms` aliases), `POST .../advance`. Neon Tokyo gameplay UI from `design/player/gameplay/code.html` in `renderGameplayPage` with copy in `content/site-content.json` and client sync in `public/scripts/gameplay-sync.js` (rAF timer, visibility-aware fetch). Waiting lobby auto-navigates when status becomes `ACTIVE`.
2. **Why.** Slice 5 requires answer keys and timer windows only in secrets, one graded submission per player per question, idempotent post-close advance, and FR-07–FR-09 HUD without server timers or WebSockets.
3. **Security and cost.** Public `game_rooms` store `dealQuestions` without keys; active JSON omits explanations/citations until after `closesAt`. Bundle transactions prevent double answers under concurrency. Client polling follows the Slice 4 visible-tab pattern; no background server loops.

## 2026-11-25 — Launch player merge, local rollback, REVEAL without explanation

1. **What changed.** `runGameRoomLaunchTransaction` merges `players` and zeroed `scores` from the transactional `WAITING` snapshot so late joiners survive launch; local persistence restores the prior `WAITING` room on disk/memory if secrets write fails after the room write. `REVEAL` play payloads expose `correctAnswerId`, grading fields, and `scores` but not `explanation`. Slice 2 roadmap done-checks and PRD §5.3 synced to pure-shuffle dealing.
2. **Why.** Slice 5 audit warnings on launch races and stale Slice 2 spec bullets; product still hides explanations between questions while allowing score feedback after close.
3. **Security and cost.** Explanations remain server-only; no extra Firestore reads beyond the launch transaction.

## 2026-11-25 — Full-deck launch and no in-round answer reveal

1. **What changed.** `resolveLaunchQuestionCount` deals every question across selected topic packs (max 100) when launch omits `questionCount`, so three 10-question packs yield a 30-question game. Removed client reveal panel and stopped attaching `reveal` / grading fields to `GET/POST` play payloads—players keep a locked selection until advance.
2. **Why.** Host expectation is pack count × questions per pack; product pacing avoids showing explanations or correct answers between questions while server-side grading stays in `game_room_secrets`.
3. **Security and cost.** Same anti-cheat split; `listQuestionsByPackIds` scales with Firestore pool size (still capped at read/deal limits).

## 2026-11-25 — Slice 5 evaluator remediation (anti-cheat, atomic launch, no difficulty)

1. **What changed.** `roundPhase` (`OPEN` vs `REVEAL`) redacts `isCorrect`, `pointsAwarded`, and answer keys from `POST/GET` play APIs until the round closes; `buildRevealPayload` runs in REVEAL. `runGameRoomLaunchTransaction` atomically writes `game_rooms` + `game_room_secrets` while `WAITING`. `GET …/question` and host-only `POST …/advance` enforce room membership. `buildDeck` now pools, shuffles, and slices questions (no difficulty/tags); seed packs hold 10 questions each. Gameplay HUD templates come from `data-*` CMS attrs; host-only client advance; specs (`roadmap`, `prd`, `CLAUDE.md`) synced to minimalist play UI.
2. **Why.** Close Slice 5 evaluator CRITICAL/WARNING findings without leaking grading early or leaving mismatched launch writes; remove obsolete difficulty-mix product surface.
3. **Security and cost.** Early answerers cannot infer correct letters from API payloads; concurrent launch cannot fork secrets; no new server loops—same visibility-gated client refresh.

## 2026-11-25 — Gameplay auto-advance, join unavailable UX

1. **What changed.** Removed host “next question” control. Server `advanceGameQuestion` advances when the timer expires or every player has answered; play-state exposes `allPlayersAnswered` and reveal after all answer. Client `gameplay-sync.js` rebuilds options and question chrome on question change, schedules advance 3s after all-answer or immediately after timer expiry, and toggles a solid green dot when ready. Join failures for missing/completed games render `renderJoinUnavailablePage` (ROUND CLOSED layout) with `join_unavailable` copy in `site-content.json`. Renamed HUD label to **AWAITING ANSWERS**.
2. **Why.** Match multiplayer/solo pacing rules without manual host clicks; fix stale A/B/C/D tiles after auto-advance; replace plain-text join errors with branded CMS-driven messaging.
3. **Security and cost.** Advance still server-gated (all answered or timer). No new polling loops on the server; client uses existing visibility-aware refresh.

## 2026-11-25 — Gameplay HUD polish and mid-game join

1. **What changed.** Timer ring turns orange ≤10s and red ≤5s. Play-state API no longer sends reveal/explanation during round transitions; client skips answer reveal. Removed category/tag row from gameplay. `joinActiveGame` lets new players enter `ACTIVE` rooms on `/join` and land on the live question/timer. Answer errors use Neon Tokyo `pq-auth-alert-error` banners with copy from `site-content.json` (`answer_error_generic`, `answer_error_already_answered`, `answer_error_network`); no `window.alert`.
2. **Why.** Match product pacing and anti-cheat UX; fix mid-game invite flow; keep messaging CMS-driven.
3. **Security and cost.** Answer keys remain server-only; late join only appends handle to public room doc.

## 2026-11-25 — Gameplay HUD timer and question badge styling

1. **What changed.** Timer ring only changes stroke/glow (`#00ffcc` → `#9d4edd` at ≤10s → `#ff2d78` at ≤5s); numeric countdown and “s” suffix stay white/cyan. Removed `+N PTS` above the timer. Question badge matches Stitch: `self-start` pink pill, `text-xs` hotel_class icon.
2. **Why.** Product feedback to align with `design/player/gameplay/code.html` without distracting digit color shifts.
3. **Security and cost.** Presentation-only.

## 2026-11-26 — Dashboard match modal Stitch layout

1. **What changed.** Dashboard breakdown modal matches `dashboard_with_match_modal` two-column layout: green border, cyan top-left + pink top-right/bottom-left corner accents, green total score and red rank telemetry, questions column with cyan pager, leaderboard column (10 per page) with pink pager and YOU badge. Metrics refresh from breakdown API; CMS strings for leaderboard chrome.
2. **Why.** FR-11 drawer parity with Stitch export and parity with standalone breakdown styling.
3. **Security and cost.** Client fetches existing membership-gated breakdown JSON on row open only.

## 2026-11-26 — Match breakdown response log styling and pager

1. **What changed.** Breakdown rows use green correct / red incorrect answer treatment, hide verified text when correct, and show time without a SPEED label. Metric totals use green (`total score`, question numbers, positive PTS) and red rank. Pagination reuses `.pq-pager-btn` chevron + numbered pages on `GET /rooms/:pin/breakdown`; dashboard modal log matches the same row rules and numbered pager buttons.
2. **Why.** Align the standalone breakdown with Neon Tokyo pagination and make scan-at-a-glance outcomes obvious.
3. **Security and cost.** Presentation-only.

## 2026-11-26 — Penalty scoring for wrong answers

1. **What changed.** `gradeAnswer` adds `basePoints` for correct on-time answers, subtracts `basePoints` for wrong on-time answers, and awards 0 for late or unanswered questions. `db.js` validation allows negative `pointsAwarded` and room `scores`. Breakdown UI shows signed point deltas (`+10` / `-10`). Tests and Slice 5 roadmap done-check updated.
2. **Why.** Product rule: incorrect picks cost points; skips and late locks do not.
3. **Security and cost.** Server-side grading unchanged; cumulative scores may go negative and are stored as integers.

## 2026-11-26 — Game-over podium row links to breakdown

1. **What changed.** The signed-in player’s row on `GET /rooms/:pin/results` is a link to `/rooms/:pin/breakdown?user=`. Podium rows no longer show Best Streak or match XP labels (correct count and avg speed remain). Specs (`roadmap`, `prd`, `CLAUDE.md`) and `test/results.test.js` updated.
2. **Why.** Players open per-question telemetry from the game-over screen without extra chrome; streak/XP stay available in breakdown API metrics where needed.
3. **Security and cost.** Same membership-gated breakdown route; presentation-only change on the podium.

## 2026-11-26 — Join invite auth redirect (one-shot intent cookie)

1. **What changed.** Unsigned visitors to `GET /join?game=` get a signed HttpOnly `pq_join_intent` cookie and redirect to `/?join=<pin>`. After `POST /api/auth/session`, `redirectTo` targets `/join?game=` (returning users) or `/onboarding/handle` (new users). Handle submit and authenticated `/join` consume the cookie once and complete the join; later visits route to dashboard as before.
2. **Why.** Invite links must survive login/onboarding without persisting a permanent “always join” redirect.
3. **Security and cost.** HMAC-signed pin + 15-minute TTL; no extra polling; cookie cleared after successful join.

## 2026-11-26 — Slice 6 evaluator: breakdown lock, cached summaries, bounded history queries

1. **What changed.** Breakdown API/page return 409/403 until `COMPLETED`; `buildMatchBreakdown` strips grading fields when incomplete. `playerIds` derived on every room write; `playerSummaries` computed at game end in `advanceGameQuestion`. `listGameRoomsForUser` defaults to `status: 'COMPLETED'` with Firestore `array-contains` + `.limit()` query. Dashboard history reads cached summaries only (no N+1 `game_room_secrets`). CMS-driven modal copy and `results.game_pin_label` → GAME PIN; CLAUDE.md persistence guardrails added.
2. **Why.** Close evaluator CRITICAL/WARNING findings: no early answer leaks, no dashboard secret fan-out, production-scalable match history.
3. **Security and cost.** Fewer secret reads on `/dashboard`; indexed bounded Firestore queries; breakdown still on-demand per match.

## 2026-11-26 — Breakdown page centered Return home CTA

1. **What changed.** Match breakdown footer link uses `breakdown.return_home_label` from CMS (“Return home”), centered layout, and `pq-dashboard-start-cta` primary styling; removed unused `close_label`.
2. **Why.** Align exit action with Neon Tokyo primary buttons and editable copy.
3. **Security and cost.** Presentation-only.

## 2026-11-26 — Remove modal “Open full recap” link

1. **What changed.** Dropped `OPEN FULL RECAP` anchor and `modal-full-breakdown` wiring from dashboard match modal; full breakdown remains on `GET /rooms/:pin/breakdown` via history/outcomes flows.
2. **Why.** Product choice to keep telemetry inside the overlay only.
3. **Security and cost.** None.

## 2026-11-26 — Match modal green border and corner accents

1. **What changed.** `pq-match-modal` in `neon-tokyo.css` sets explicit cyan border and glow; four `pq-match-modal-corner--*` brackets (TL/BR cyan, TR/BL pink) replace Tailwind `border-secondary` / `border-primary` on the dashboard breakdown overlay.
2. **Why.** Stitch `dashboard_with_match_modal` chrome was invisible when Tailwind browser codegen skipped theme color utilities on modal markup.
3. **Security and cost.** CSS-only; no runtime change.

## 2026-11-26 — Leaderboard YOU row CSS (modal + recap)

1. **What changed.** Added `pq-leaderboard-row--you` and tier classes in `neon-tokyo.css` so current-player rows get pink fill, border, rank, and PTS without relying on Tailwind `primary/*` utilities (modal rows are JS-built and were missing CDN-scanned styles).
2. **Why.** Match Stitch `dashboard_with_match_modal` red accent for the signed-in row on dashboard modal and full breakdown.
3. **Security and cost.** Presentation-only; no API or polling change.

## 2026-11-26 — Breakdown two-column leaderboard and modal Stitch colors

1. **What changed.** Dashboard modal uses explicit green game PIN (`#00ffcc`), green questions icon, red leaderboard icon, and red YOU row highlight at any rank. Full recap (`GET /rooms/:pin/breakdown`) mirrors modal two-column layout with paginated leaderboard (`lbPage`, 10 per page) alongside question log pagination; `buildMatchBreakdown` exposes `leaderboardEntries` slice.
2. **Why.** FR-11 parity with `dashboard_with_match_modal` and visible self-row without requiring first place.
3. **Security and cost.** Same membership-gated routes; SSR pagination only—no extra polling.

## 2026-11-26 — Host auto-advance delay when all answered

1. **What changed.** Gameplay `data-advance-delay-ms` reduced from 3000 to 500 so the host client schedules `POST …/advance` half a second after `allPlayersAnswered` (timer-expired advance unchanged).
2. **Why.** Faster pace between questions when everyone has locked in early.
3. **Security and cost.** Client-only timing; host must still call advance; no new polling.

## 2026-11-26 — Slice 6 podium, dashboard history, and match breakdown

1. **What changed.** Added `lib/results.js` for leaderboard ranking (score, then avg latency, then `userId`), per-player telemetry (XP, streak, accuracy), and paginated breakdown rows (5 per page). `GET /rooms/:pin/results` renders FR-10 game-over podium; `GET /rooms/:pin/breakdown` and `GET /api/games/:pin/breakdown` expose metrics and response logs with verified answers only when `status === COMPLETED`. Dashboard loads real match history via `listGameRoomsForUser` and opens the Tailwind breakdown overlay with API pagination. Gameplay redirects to results when complete.
2. **Why.** Slice 6 completes post-game telemetry and replaces the dashboard demo row with stored matches while keeping answer keys in `game_room_secrets` until the room finishes.
3. **Security and cost.** Breakdown APIs require room membership; `correctAnswerId`, `explanation`, and `sourceCitations` are omitted for non-`COMPLETED` rooms. No background jobs or new polling—dashboard modal fetches on demand.

## 2026-11-26 — Firestore dashboard index, breakdown guard, index fallback

1. **What changed.** Added root `firestore.indexes.json` for `game_rooms` (`playerIds` ARRAY_CONTAINS, `status` ASC, `createdAt` DESC). `listGameRoomsForUser` catches Firestore `FAILED_PRECONDITION` (missing/building index) and returns `[]` with a console warning instead of failing `GET /dashboard`. `buildMatchBreakdown` (`lib/results.js`) throws `BreakdownNotCompleteError` when the room is absent or not `COMPLETED`. Unit tests cover both behaviors.
2. **Why.** Deployed Firestore needs an explicit composite index for bounded match history; dashboard must stay usable while the index provisions. Defense-in-depth so grading fields cannot be assembled for in-progress rooms if a caller skips route guards.
3. **Security and cost.** Incomplete games never expose breakdown grading at the helper layer; index errors degrade to an empty history list (no 500 storm). No extra reads or polling.

## 2026-11-26 — CI deploy syncs Firestore indexes

1. **What changed.** Minimal `firebase.json` points at `firestore.indexes.json`. `.github/workflows/deploy.yml` runs `npx firebase-tools deploy --only firestore:indexes` after GCP auth and before Cloud Run image build. CLAUDE.md and workflow comments document `roles/datastore.indexAdmin` (or `roles/firebase.admin`) on `github-deployer@`.
2. **Why.** Dashboard bounded queries need the composite index in production; syncing on every main deploy keeps GCP in step with repo definitions.
3. **Security and cost.** Index deploy uses existing Workload Identity credentials; no new secrets. One-time index builds may lag deploy—`listGameRoomsForUser` already falls back to `[]` while indexes build.

## 2026-11-26 — CodeQL hardening (auth taint, rate limit, ReDoS, DOM-XSS)

1. **What changed.** Renamed `resolveEmailCredentialProvider` (Firebase email credential metadata only; no raw secrets). Session/join MAC helpers consolidated in `computeSessionIntegrityMac`. In-memory sliding-window rate limiter (`lib/rate-limit.js`, 120/min per IP) on `/api/auth`, `/api/handle`, `/onboarding/handle`, and `/api/games|rooms/*` (skipped in test). `stripTrailingSlashes` replaces trailing-slash regex in `lib/rooms.js`. Design Stitch mocks use safe DOM APIs for dynamic badge/chip text; auth-identity test uses strict provider equality.
2. **Why.** Satisfy CodeQL alerts without changing product auth (still HMAC session cookies, provider gate unchanged).
3. **Security and cost.** Bounded rate-limit map (10k keys, periodic cleanup); no new dependencies. `setInterval` only when not in test and limiter runs in production.

## 2026-11-26 — Rate limit: trust proxy, per-user keys, read/write tiers

1. **What changed.** `app.set('trust proxy', 1)`; session binds `req.user.uid` for limiter keying (`user:` prefix). Game APIs use separate buckets: GET/HEAD 300/min, mutations 60/min; other sensitive routes stay 120/min. Keys use `req.ip` only when unsigned (no `X-Forwarded-For` parsing). Tests pass `enabled: true` to exercise buckets in `NODE_ENV=test`.
2. **Why.** Pub Wi-Fi players share one NAT IP but must not share one quota; Cloud Run must not trust client-spoofed forwarded headers.
3. **Security and cost.** In-memory tiers only; still no polling loops. Unauthenticated abuse still capped per trust-proxy IP.
