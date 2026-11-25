# Neon Tokyo MVP Roadmap

**Status:** Gate 1 approved (2026-11-25)  
**Source of truth for build order:** this file. Product intent comes from `specs/prd-neon-tokyo.md`. When the PRD and the architecture rules disagree, the resolutions in §1 win.  
**Build one slice at a time, in order, only when that slice is requested.**

Each slice is one vertical cut: tests, server behavior, and the Neon Tokyo screen that proves it. Implement slices in order. A later slice may call modules from an earlier slice. It must not redesign them.

`npm test` is `node --test`. It already runs `index.test.js` and will pick up `test/**/*.test.js`. Every slice’s done-check is a green `npm test`, including the assertions listed for that slice. New tests go in `test/` first (see `.cursor/skills/build-slice/SKILL.md`). Slice 1 also rewrites the current landing assertions in `index.test.js`, which still expect the warm “AI Taproom Quiz” page.

After a slice is built, stop. Certification is `/evaluate-slice` in a fresh chat. Do not commit a slice in the same chat that wrote it.

---

## 1. Architecture audit (PRD vs repo rules)

The repo today is an Express app (`index.js`) with `GET /` (warm taproom landing) and `GET /health`. There is no Firestore client, no `db.js`, no `auth.js`, and no `design/admin/`. Stitch exports live under `design/player/`. Those HTML files load the Tailwind CDN play script and an inline `tailwind.config`. The player contract is Tailwind CSS v4 via `@tailwindcss/browser@4` only, plus one shared stylesheet. DaisyUI is not part of the player frontend.

| Topic | PRD | Rule that wins | Plan |
| --- | --- | --- | --- |
| Host | Firebase Hosting / Cloudflare (§5.1) | Cloud Run, Node 24, Express | Keep `Dockerfile` and `node index.js`. No new host. |
| Live sync | Firestore listeners or WebRTC (§5.1); FR-06 “live” grid | No server polling loops and no persistent WebSockets (Cloud Run must scale to zero) | Request/response only. Lobby and gameplay refresh with a client `fetch` while the document is visible, cleared on `visibilitychange` and on leaving the page. No `setInterval` on the server. No WebSocket upgrade. |
| Grading | Cloud Functions hold `correctAnswerId` until the timer ends (§5.3) | Express grades from `game_room_secrets/{roomId}` | Public `game_rooms/{roomId}` never stores `correctAnswerId`, `explanation`, or `sourceCitations`. |
| Auth UI this MVP | Google, SMS, Apple via FirebaseUI (FR-01) | `auth.js` must be able to name Google, SMS, Apple, and Anonymous Guest; secrets stay in env | Slice 3 ships **Google + Anonymous Guest** on the player screens. `auth.js` reads the full provider list from env. SMS and Apple stay off unless those env flags are set. No provider keys in the repo. |
| Admin SSO | Future admin portal, Google Workspace, env-configured (§7) | `ADMIN_ALLOWED_DOMAIN` and `ADMIN_EMAILS` from `process.env` | Slice 3 reads and tests that config only. No `/admin` UI. `design/admin/` does not exist. |
| Legal pages | FR-12 disclosures | Dedicated `/terms` and `/privacy` pages, never a modal. Content must be editable later by an admin | Markdown-enabled pages in `content/site-content.json`, rendered via `lib/content-store.js` (`marked` + `sanitize-html`) with the static-content sidebar template. |
| Canvas color | PRD `#050811`; `DESIGN.md` and Stitch pages use `#0a0a12` | UI rule lists both | `[data-theme="taproom"]` in `public/styles/neon-tokyo.css` sets `--canvas: #050811` and `--canvas-deep: #0a0a12`. Page background is `--canvas` with `.cyber-grid` on top. Cards use `#0c101c` and Stitch `surface-container` `#141422`. Accents stay `#ff2d78`, `#00ffcc`, `#9d4edd`, `#ffe04a`. |
| Player CSS | Stitch inlines Tailwind config and a `<style>` block per screen | Pure Tailwind. No DaisyUI on player pages | One file, `public/styles/neon-tokyo.css`, holds the extracted classes and tokens. Pages load `@tailwindcss/browser@4` and that stylesheet. They do not load `daisyui` or a second Tailwind config script. |
| Sound, particles | PRD Sprint 4 | Out of scope for these six slices | Do not add audio or celebration effects. |
| Question schema (§5.2) | Valid sample. `sourceCitations` is `[{ title, link }]` on `Question`. §5.3 sends only `questionText` and `options` during an active question | Same field list. Citations stay with the answer key until the round closes | Store `sourceCitations` on the question and on `game_room_secrets`. Active payloads omit them. The post-round payload may return them with `explanation`. |

**Security bar for every slice:** validate and escape `handle`, `roomId`, search text, and pack ids before HTML or database writes. No API keys in source. Tests run with `NODE_ENV=test` and the in-memory `db.js` mock so `npm test` needs no GCP credentials.

**Cost bar for every slice:** no background timers in the Node process, no unbounded `collection.get()` without a `limit`, no client connection held open by the server.

---

## 2. Shared contracts

### 2.1 Theme

`<html data-theme="taproom" class="dark">` on every player page. Express serves `public/` so the stylesheet URL is `/styles/neon-tokyo.css`.

`public/styles/neon-tokyo.css` is the only custom player stylesheet. Slice 1 extracts it from the Stitch `<style>` blocks and `tailwind.config` objects. Later slices link this file. They do not add DaisyUI, `btn` / `card` / `badge` / `modal` / `table` component classes, or a per-page Tailwind config.

Copy these rules verbatim from `design/player/*/code.html`:

- `.cyber-grid` — 40px grid, `rgba(255, 45, 120, 0.05)` columns and `rgba(0, 255, 204, 0.04)` rows
- `.neon-glow-pink` — `box-shadow: 0 0 25px rgba(255, 45, 120, 0.4), inset 0 0 15px rgba(255, 45, 120, 0.2)`
- `.neon-glow-cyan` — `box-shadow: 0 0 25px rgba(0, 255, 204, 0.35), inset 0 0 10px rgba(0, 255, 204, 0.15)`
- `.wave-bar` and `@keyframes soundwave` from the gameplay, waiting-room, and game-over exports
- `.row-arrow` from the dashboard export
- `.neon-border-pink`, `.neon-border-cyan`, and `.hud-bracket` from `design/player/neon_tokyo_visual_design_tokens_card/code.html`

Also include:

- `.crt-matrix`, using the token-card body background: `#050811` base, two neon radial glows, and a 32px slate line grid. Decorative CSS only. No script loop.
- `[data-theme="taproom"]` variables: `--canvas: #050811`, `--canvas-deep: #0a0a12`, `--surface: #0c101c`, `--surface-elevated: #141422`, `--primary: #ff2d78`, `--secondary: #00ffcc`, `--tertiary: #9d4edd`, `--tertiary-warm: #ffe04a`, `--border: #1e293b`.
- A Tailwind v4 `@theme` block so Stitch utility names resolve without an inline config: `--color-primary: #ff2d78`, `--color-secondary: #00ffcc`, `--color-tertiary: #ffe04a`, `--color-background: #0a0a12`, `--color-surface: #0f0f1a`, `--color-surface-container: #141422`, `--font-headline` and `--font-display` = Sora, `--font-body` = Inter, `--font-label` = Space Grotesk.

Google Fonts stylesheet (Sora, Inter, Space Grotesk, Material Symbols) is linked from the layout, matching the player exports. Layouts use the same Tailwind utilities as the Stitch markup and work at 390px and 1440px.

### 2.2 Chrome

Header: screen title left; room PIN and headcount right when a room exists; neon divider under the bar. The `PUB QUIZ` wordmark is a link:

- no session → `href="/"`
- session → `href="/dashboard"`

Footer, three columns on desktop and stacked on mobile:

- `PUB QUIZ`
- `TERMS & CONDITIONS` → `/terms`
- `PRIVACY POLICY` → `/privacy`
- `© 2024 / ONLINE`

Stitch footers use `href="#"`. Implementation must not.

### 2.3 Data split

| Store | Holds | Never holds |
| --- | --- | --- |
| `topic_packs`, `questions` | Pack metadata and full questions, including keys and `sourceCitations` | — (server only) |
| `game_rooms/{roomId}` | Status, pack ids, public question text, options `{id,text}`, players, scores, timer window | `correctAnswerId`, `explanation`, `sourceCitations` |
| `game_room_secrets/{roomId}` | Answer key, explanation, `sourceCitations`, per-question open/close timestamps | — (server only) |
| `content/site-content.json` | `footer_links` (legal Markdown bodies) and `static_copy` (gateway/footer UI strings) | Secrets |

`db.js` is the only module that touches Firestore. When `NODE_ENV=test`, it uses a `Map` mock with the same function names.

### 2.4 Sampling (PRD §5.3, made testable)

`buildDeck({ topicPackIds, questionCount, difficulty, rng })`:

1. `perPack = Math.floor(questionCount / topicPackIds.length)`. Remainder `questionCount % n` is given one extra question each to the first remainder packs, in the host’s pack order.
2. Default difficulty mix inside each pack quota: 40% easy, 40% medium, 20% hard (largest remainder method). An explicit host filter (`EASY` | `MEDIUM` | `HARD`) uses only that rating.
3. Interleave round-robin across packs so two questions from the same pack are not adjacent when another pack still has cards. `rng` is injectable. Tests pass a seeded function. Production uses `Math.random`.
4. The object returned to clients drops `correctAnswerId`, `explanation`, and `sourceCitations`. The secret copy keeps all three. `sourceCitations` is the PRD §5.2 array of `{ title, link }`.

### 2.5 Normalized entities

- **TopicPack:** `topicPackId`, `title`, `slug`, `description`, `category`, `icon`, `totalQuestions`, `difficultyRating`, `isFeatured`
- **Question:** `questionId`, `topicPackId`, `category`, `tags`, `difficultyRating` (`EASY`|`MEDIUM`|`HARD`), `basePoints`, `questionText`, `options[{id,text}]`, `correctAnswerId`, `explanation`, `sourceCitations[{title,link}]` (PRD §5.2)
- **GameRoom (public):** `roomId` (6 digits), `hostUserId`, `status` (`WAITING`|`ACTIVE`|`COMPLETED`), `topicPackIds`, `questionCount`, `timeLimitPerQuestion` (30), `currentQuestionIndex`, `players[{userId,handle}]`, `createdAt`
- **PlayerResponse:** `roomId`, `questionId`, `userId`, `selectedAnswerId`, `isCorrect`, `latencyMs`, `pointsAwarded`, `timestamp` (server clock)

---

## 3. Slices

### Slice 1 — Neon Tokyo shell, navigation, and legal pages

**Goal.** Replace the warm taproom landing with the Neon Tokyo shell, HUD chrome, and FR-12 pages. No accounts and no game data yet.

**In scope.** `public/styles/neon-tokyo.css` as specified in §2.1, CRT dot-matrix and cyber-grid canvas, header and footer, and the auth-aware `PUB QUIZ` wordmark: `href="/"` when logged out and `href="/dashboard"` when logged in. Slice 1 owns that branch in the shared layout and tests both flags. `GET /` itself is logged out, because accounts arrive in Slice 3. Gateway page at `/` follows the homepage Stitch (visual only: guest PIN field and host entry can be present and inert). `/terms` and `/privacy` are dedicated static-content pages (FR-12), never a modal, modeled on `design/player/static_content/code.html` with the left-hand `footer_links` sidebar menu. All static and legal copy lives in `content/site-content.json` (`static_copy` + Markdown `footer_links` entries). `lib/content-store.js` loads that file (admin-portal–ready schema), renders Markdown with `marked` and `sanitize-html`, and applies Neon Tokyo typography classes. Legal copy states telemetry (latency, ephemeral match data), sub-processors (FirebaseUI, Cloud Firestore), and the rights checklist (erasure, portability, zero monetization). Each player page loads `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` and `/styles/neon-tokyo.css`, and does not load DaisyUI.

**Out of scope.** FirebaseUI, handle validation, real PIN reservation, lobby, gameplay.

**Target files.**

- `index.js` — static `public/`, routes `/` and each `footer_links[].path`; shared layout renderer; keep `/health`
- `public/styles/neon-tokyo.css` — extracted Stitch classes, `@theme` tokens, `[data-theme="taproom"]`
- `content/site-content.json` — `static_copy` and `footer_links` Markdown bodies
- `lib/content-store.js` — load, sanitize, and render site content
- `index.test.js` — replace warm-theme assertions; keep the health check
- `test/shell.test.js` and `test/content-store.test.js`

**Stitch reference.**

- `design/player/neon_tokyo/DESIGN.md`
- `design/player/neon_tokyo_visual_design_tokens_card/code.html` and `screen.png`
- `design/player/homepage/code.html` and `screen.png`
- `design/player/static_content/code.html` and `screen.png` (privacy). Terms uses that same template with the terms document title and body.

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- `GET /health` is still `200` `{ status: "ok", version: "0.1.0" }`
- `GET /styles/neon-tokyo.css` is `200` `text/css` and contains `.cyber-grid`, `.neon-glow-pink`, `.neon-glow-cyan`, `#ff2d78`, `#00ffcc`, `Sora`, `Space Grotesk`, and `Inter`
- `GET /` is `200` `text/html`, contains `data-theme="taproom"`, `href="/styles/neon-tokyo.css"`, `@tailwindcss/browser@4`, a `cyber-grid` class, and `href="/terms"` plus `href="/privacy"`
- That HTML does not contain `daisyui` or `cdn.tailwindcss.com`
- Logged-out layout wordmark `href` is `/`; the same layout with the signed-in flag sets the wordmark `href` to `/dashboard`
- `GET /terms` and `GET /privacy` are `200` HTML documents that use the static-content template (stylesheet, `data-theme="taproom"`, `cyber-grid`, left-hand sidebar from `footer_links`). They are not a modal on `/`. Markdown renders styled `h1`–`h3`, `p`, `ul`, `ol`, `li`, and `a` tags; scripts are stripped. Footer links match `footer_links`. `/privacy` mentions FirebaseUI, Cloud Firestore, erasure, portability, and zero monetization
- Response HTML contains no `setInterval` and the server source under test starts no timer

---

### Slice 2 — Topic packs and balanced sampling engine

**Goal.** Seed packs and questions, and ship the §5.3 dealer as a pure function with tests. No room UI yet.

**In scope.** `db.js` mock + seed of at least 4 packs and 12 questions spanning easy, medium, and hard (enough to prove quotas and interleave). `buildDeck` per §2.4. A read-only `GET /api/topic-packs` returns pack metadata only (no questions, no answer keys), with `limit` capped at 24.

**Out of scope.** Host selector UI, room documents, scoring.

**Target files.**

- `db.js`
- `data/seed.js`
- `lib/sample-deck.js`
- `index.js` — mount `GET /api/topic-packs` only
- `test/db.test.js`
- `test/sample-deck.test.js`

**Stitch reference.** None for a screen. Pack titles and the “6 per page / 24 topics” copy that Slice 4 will show are previewed in `design/player/start_a_game_invite_players_retro_arcade_variant/code.html` (`Showing` pager and pack cards). Seed titles should be usable by that screen later. Token context: `design/player/neon_tokyo/DESIGN.md`.

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- With `NODE_ENV=test`, seeding and reads do not require GCP credentials
- `buildDeck` for 3 packs and `questionCount` 10 yields counts `4,3,3` in pack-id order (floor division plus remainder to the earliest packs)
- Default mix inside a large quota is 40/40/20 within one question of the ideal, using the largest-remainder rule
- An explicit `HARD` filter returns only `HARD`
- Interleave never places the same `topicPackId` in two adjacent slots when another selected pack still has unused questions
- The client deck objects have `questionText` and `options` and do not have `correctAnswerId`, `explanation`, or `sourceCitations`
- `GET /api/topic-packs` omits question bodies and rejects a `limit` above 24

---

### Slice 3 — Auth and screen-name setup

**Goal.** Identity goes through `auth.js`. A player can continue with Google or as a guest, then lock a 3–18 character handle. Admin allow-lists are env-only.

**In scope.**

- FirebaseUI on the gateway for **Google** and **Anonymous Guest**. Provider config function also accepts phone and Apple when `AUTH_ENABLE_PHONE` / `AUTH_ENABLE_APPLE` are `true`. Tests do not call Google. They drive `auth.js` with a fake verified identity `{ uid, provider, email }`.
- Handle rules (FR-02): length 3–18, charset `^[A-Za-z0-9]+$`, preview is server-rendered on `POST` (no client-only trust), action label `Lock In Handle & Enter Lobby`.
- Session cookie. Signing secret is `SESSION_SECRET` from the environment. Tests set a dummy value in the test process. Missing secret outside `NODE_ENV=test` fails closed.
- `getAdminPolicy()` reads `ADMIN_ALLOWED_DOMAIN` and `ADMIN_EMAILS` only from `process.env`. Empty means nobody is an admin. No domain string in source.
- Authenticated `PUB QUIZ` wordmark points at `/dashboard`. `/dashboard` in this slice is a signed-in placeholder (handle + sign-out) so the link is not a 404. Slice 6 replaces the body.
- `POST /api/handle` escapes the handle before it is stored or echoed.

**Out of scope.** Admin pages, SMS/Apple buttons in the default UI, room creation.

**Target files.**

- `auth.js`
- `index.js` — gateway auth mount, `GET/POST` handle flow, `GET /dashboard` placeholder, session-aware wordmark
- `test/auth.test.js`
- `test/handle.test.js`

**Stitch reference.**

- `design/player/homepage/code.html` and `screen.png` (gateway, FR-01)
- `design/player/onboarding_first_time_user/code.html` and `screen.png` (handle lock-in, FR-02)
- Chrome still matches Slice 1 and `design/player/static_content/code.html` footer links (real routes, not `#`)

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- Handles of length 2, length 19, and any value with a space or symbol are rejected; `Neo7` is accepted
- HTML echo of a handle containing `<` is escaped (defense in depth even though the charset forbids it)
- With a fake session, `GET /` (or the signed-in layout partial) renders the wordmark `href="/dashboard"`; without a session it stays `/`
- `getAdminPolicy()` matches the env vars under test and the source of `auth.js` does not contain a hardcoded email domain
- Default provider list is Google + anonymous; phone and Apple appear only when their env flags are `true`
- `/privacy` and `/terms` from Slice 1 still return 200

---

### Slice 4 — Host room creation and real-time lobby

**Goal.** A signed-in host reserves a 6-digit room, picks packs, copies an invite URL, and sees a lobby grid. Joiners wait on the holding screen.

**In scope.**

- `POST /api/rooms` creates `WAITING` room, 6-digit PIN, retry on collision (bounded, max 5 attempts).
- Host page: search with clear, 6 packs per page, pager text `Showing {start}–{end} of {total} Topics`, multi-select checkboxes (FR-04).
- Invite field value `https://pubquiz.app/join?room={pin}` with a copy control (FR-05). The primary button label is `LAUNCH & START GAME NOW`. In this slice the button stores the selected pack ids and stays on the lobby; Slice 5 performs the deal and status flip to `ACTIVE`.
- `GET /join?game=` validates the Game PIN, requires a handle, then adds the player and renders the waiting room (FR-06): player grid, PIN badge, headcount. Radar graphic is CSS. Ping text is a single server timestamp delta from that response, not a poller on the server.
- **Host lobby `PLAYER GRID` (product extension):** The host screen at `GET /game/:gamePin` includes a live **PLAYER GRID** card beneath the launch CTA in the right column. This is intentional beyond the base Stitch mock and must be preserved in later slices and `/evaluate-slice` checks.
- **Dashboard `SIGN OUT` (product extension):** `GET /dashboard` matches `design/player/dashboard_with_match_modal/code.html` for neon hero, pink/cyan action cards, Game PIN join, and match history/modal. The hero **SIGN OUT** control (`POST /api/auth/signout`, `.pq-dashboard-signout`) is required product chrome not present in the Stitch export and must stay through Slice 6+ unless the PRD changes.
- Game PIN and player headcount appear in the **page hero** only—not duplicated in the global top header wordmark bar (wordmark-only chrome).
- Client script may `fetch` `GET /api/rooms/:pin` on an interval only while `document.visibilityState === 'visible'`, and must clear it on hide and page unload. Server route is a plain GET with a point read of one room.
- Public room JSON has no secret fields.

**Out of scope.** Dealing questions, timer, scoring, podium.

**Target files.**

- `lib/rooms.js`
- `db.js` — `game_rooms` point reads and creates
- `index.js` — host page, join page, room JSON
- `test/rooms.test.js`

**Stitch reference.**

- `design/player/dashboard_with_match_modal/code.html` and `screen.png` (signed-in dashboard, match modal)
- `design/player/start_a_game_invite_players_retro_arcade_variant/code.html` and `screen.png` (FR-03–FR-05)
- `design/player/waiting_room/code.html` and `screen.png` (FR-06)

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- New PINs match `/^\d{6}$/` and a forced collision returns the next free PIN within 5 tries
- Pack search is case-insensitive, page size is 6, and the pager string matches `Showing 1–6 of N Topics` for a seed larger than 6
- Invite string is exactly `https://pubquiz.app/join?room=` plus the PIN
- A handle or pack title containing HTML is escaped in the lobby HTML
- `GET /api/rooms/:pin` body has `players` and `status` and does not contain `correctAnswerId`, `explanation`, or `sourceCitations`
- Server room module and route file contain no `setInterval`, `setTimeout` loop, or `WebSocket`

---

### Slice 5 — Live gameplay and server-graded timer

**Goal.** Launch deals a deck, the HUD runs a 30s countdown, players lock A/B/C/D, and the server scores from secrets using its own clock.

**In scope.**

- Launch calls `buildDeck`, writes the public projection onto the room, writes keys and the question window (`openedAt`, `closesAt = openedAt + 30000`) to `game_room_secrets/{roomId}`, sets `ACTIVE`.
- Gameplay page (FR-07–FR-09): question text, topic, tags, point value, 30s ring driven by `closesAt` from the server (client clock is display-only), ready count, four targets `A` `B` `C` `D` with a locked neon-pink state after `POST /api/rooms/:pin/answers`.
- Grade on the server: correct and `receivedAt <= closesAt` awards `basePoints`; wrong or late awards 0. `latencyMs = receivedAt - openedAt`. One answer per player per question.
- Advance when the host requests the next question or when a player fetch sees `Date.now() > closesAt` and calls the existing advance route once. That route is idempotent. No in-process timer.
- Client payload for the open question never includes the key, the explanation, or `sourceCitations`. After `closesAt`, the response may include the correct option id, explanation, and citations for the question that just closed.

**Out of scope.** Final podium, XP, match drawer.

**Target files.**

- `lib/grade.js`
- `lib/rooms.js` — launch, current question, answer, advance
- `db.js` — secrets collection in the mock
- `index.js` — gameplay page and answer route
- `test/grade.test.js`
- `test/gameplay.test.js`

**Stitch reference.**

- `design/player/gameplay/code.html` and `screen.png`
- HUD chrome from Slice 1; PIN badge treatment as in that gameplay export (`2 / 4 READY` pattern)

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- After launch, `game_rooms` documents have options and no `correctAnswerId`, `explanation`, or `sourceCitations`; the matching secrets document has the key and the citations
- A correct answer inside the window scores `basePoints`; the same player’s second post is rejected; a correct answer after `closesAt` scores 0
- `latencyMs` uses the timestamps passed into `grade` (injected clock), not the client body
- The active-question HTTP body has `A`–`D` and no `explanation` or `sourceCitations`

---

### Slice 6 — Podium, leaderboard, and match breakdown drawer

**Goal.** When the room is `COMPLETED`, show the podium and a paginated per-question breakdown.

**In scope.**

- Completion flips status after the last question closes and grades.
- Podium (FR-10): rank by score descending, tie-break by lower average `latencyMs`, then `userId`. Champion card shows XP (sum of `pointsAwarded` for this match), correct count, average response seconds, and a streak (longest run of correct answers). `RETURN HOME →` links to `/dashboard`.
- Dashboard body replaces the Slice 3 placeholder: recent matches for this user. A row opens the breakdown drawer (FR-11) using the Tailwind overlay from `design/player/dashboard_with_match_modal/code.html` (including `.row-arrow`). The drawer is also a real document at `GET /rooms/:pin/breakdown?user=` so it is not an unlinked popup. Do not use a DaisyUI modal.
- Metric cards: total score, accuracy, average speed, rank. Response log pages 5 rows at a time and shows the player’s choice, the verified answer, and speed. Verified answers are readable only when `status === COMPLETED`.
- Pagination query `page` is an integer ≥ 1; out-of-range pages return an empty list, not a 500.

**Out of scope.** Admin editor, sound, cross-match lifetime XP beyond the fields computed from stored responses in this room.

**Target files.**

- `lib/results.js`
- `index.js` — `/rooms/:pin/results`, `/dashboard` match list, breakdown route
- `test/results.test.js`

**Stitch reference.**

- `design/player/game_over/code.html` and `screen.png` (FR-10)
- `design/player/dashboard_with_match_modal/code.html` and `screen.png` (FR-11)

**Executable done-check.** `npm test` exits 0, and the suite asserts all of the following:

- Ranking places a higher score first, and equal scores place the faster average latency first
- Streak and accuracy match a fixed response fixture
- Breakdown page size is 5; page 2 returns the next slice only
- A breakdown response for a `WAITING` or `ACTIVE` room does not include `correctAnswerId`, `explanation`, or `sourceCitations`. A `COMPLETED` breakdown may include all three
- Results HTML contains `RETURN HOME` linking to `/dashboard`
- Slice 1 legal routes and the Slice 5 secret split still pass

---

## 4. Explicitly later

- `/admin` and `[data-theme="admin"]` (no Stitch folder yet)
- SMS and Apple buttons turned on in production
- 8-bit audio and victory particles (PRD Sprint 4)
- A custom domain in front of Cloud Run (PRD §7). Invite URLs stay `https://pubquiz.app/join?room=` as in FR-05 until that domain exists.

---

## 5. Gate 1

Approved on 2026-11-25. Slice 1 may start when requested. Later slices stay blocked until the previous slice is in place.
