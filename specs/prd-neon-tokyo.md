# Product Requirements Document (PRD) & Project Brief

**Project Name:** Pub Quiz — Neon Tokyo Arcade Edition  
**Document Type:** Product Requirements Document (PRD) & Technical Brief  
**Version:** 1.1.0  
**Target Platforms:** Responsive Web (Desktop 1440px+ & Mobile 390px Viewports)  
**Design System Reference:** `Neon Tokyo` (`DS_01` / Retro Arcade HUD)  
**Status:** Approved & Implemented across 8 Core Desktop & Mobile Screens

---

## 1. Executive Summary & Vision

### 1.1 Product Purpose
**Pub Quiz** is a synchronous, real-time multiplayer trivia platform designed to bring high-energy bar and pub trivia into both live venues and remote team sessions. Inspired by retro-futuristic arcade machines and cyberpunk aesthetics, the app blends competitive trivia with immediate telemetry, low-latency live synchronization, and tactile visual feedback.

### 1.2 The North Star: "Electric Nightscape"
- **High Energy, Zero Clutter:** Moody midnight backdrops (`#050811`) paired with focused neon accents (`#ff2d78` Pink, `#00ffcc` Cyan) channel an authentic Japanese arcade / HUD feel without compromising read-time speed or cognitive clarity.
- **Instant Gratification:** Players join with a 6-digit PIN or direct URL dispatch without mandatory heavyweight signups, jump straight into synchronized lobbies, and compete through fast-paced question bursts.

---

## 2. User Personas & Core Journeys

### 2.1 Personas
1. **The Game Host (Organizer / Quiz Master):**
   - Wants effortless room creation, multi-topic pack bundling (mixing Pop Culture, Tech, Craft Beer, etc.), player headcounts, and clear dispatch mechanisms (shareable URLs and 6-digit room PINs).
   - Needs instant control to launch rounds when ready (`Ready check`, waiting player counter).
2. **The Competitive Player:**
   - Joins quickly via mobile or desktop browser using Federated SSO or guest handle creation.
   - Requires rapid legibility under pressure (30s timer, bold multi-choice touch targets, instant lock-in feedback).
   - Values detailed telemetry post-game (accuracy %, response latency, round breakdown).

---

## 3. Feature Breakdown & Requirements

### 3.1 Authentication & Onboarding
- **FR-01 (Landing & Auth):**
  - Federated SSO (Google, Phone/SMS, Apple ID) integrated via FirebaseUI.
  - Seamless "Join as Guest" route with quick 6-digit Room PIN entry.
  - Persistent brand footer with legal documentation links.
- **FR-02 (Screen Name Setup):**
  - Prompted upon first sign-in or guest entry.
  - 3–18 character validation rule with alphanumeric support.
  - Real-time handle preview and "Lock In Handle & Enter Lobby" action.

### 3.2 Game Creation & Host Controls
- **FR-03 (Room PIN & Reservation):**
  - Real-time 6-digit Room PIN generator and reservation beacon (e.g., `# 8492`).
  - Active waiting competitor counter indicator next to the PIN reservation badge.
- **FR-04 (Multi-Topic Selection & Discovery):**
  - Integrated topic search bar with quick clear (`ESC`).
  - 6 topic packs displayed per view with interactive checkboxes allowing multi-pack selection.
  - Quiz engine dynamically samples and interleaves questions evenly across all selected topic packs.
  - HUD pagination component (`Showing 1–6 of 24 Topics`).
- **FR-05 (Invite Dispatch):**
  - Single-click URL copy dispatch field (`https://pubquiz.app/join?room=8492`).
  - High-visibility primary CTA: `LAUNCH & START GAME NOW 🚀`.

### 3.3 Synchronous Lobby & Waiting State
- **FR-06 (Waiting for Host):**
  - Dedicated holding state for players joining via shareable link.
  - Radar-style synchronized network scanner animation showing active terminal node connection.
  - Live ping latency telemetry (`18ms`, encrypted status).
  - Visual player grid showing connected peers and handle avatars.

### 3.4 Live Gameplay Engine
- **FR-07 (HUD Timer & Synchrony):**
  - Prominent 30-second countdown display with circular sweep/progress ring.
  - Synchronized player ready status indicator (`2/4 READY`).
- **FR-08 (Question Presentation):**
  - High-contrast, wide container typography for immediate readability under time limits.
  - Topic category, tags, and difficulty point values (`+500 PTS`).
- **FR-09 (Answer Selection):**
  - 4 high-contrast multi-choice targets (`A`, `B`, `C`, `D`).
  - Tactile selection states with neon pink locked-in borders and badges.

### 3.5 Results, Leaderboards & Telemetry
- **FR-10 (Game Over & Podium):**
  - Highlighted #1 Champion card with victory telemetry (+450 XP, Personal Best).
  - Arcade leaderboard ranked descending by score, displaying correct question counts, average response delta, and critical streaks.
  - Primary navigation button: `RETURN HOME →`.
- **FR-11 (Match Breakdown Modal / Drawer):**
  - Accessible via match rows in the lobby dashboard or match recap.
  - Top-level metric cards: Total Score (e.g. 50/50), Accuracy (100%), Average Speed (1.8s), Rank (#1 of 18).
  - Question-by-question response log showing player's answer vs verified answer and speed of response.
  - Pagination for matches containing more than 5–10 rounds.

### 3.6 Compliance & Legal
- **FR-12 (Privacy Policy & GDPR):**
  - Transparent telemetry disclosures (latency metrics, ephemeral match data).
  - Clear breakdown of third-party sub-processors (FirebaseUI, Cloud Firestore).
  - Explicit user data rights checklist: Right to Erasure, Data Portability, Zero Monetization.

---

## 4. Design System & Frontend Architecture

### 4.1 Design System Tokens (`Neon Tokyo`)
- **Color Hierarchy:**
  - `Background / Canvas`: `#050811` (Deep Space Midnight with CRT dot-matrix overlay)
  - `Surface Containers`: `#0c101c` (Primary panels) & `#151b2d` (Elevated cards)
  - `Primary Accent`: `#ff2d78` (Neon Pink / Hot Magenta for CTAs and Selected states)
  - `Secondary Accent`: `#00ffcc` (Electric Cyan for telemetry, timers, and room PINs)
  - `Tertiary Accent`: `#9d4edd` (Arcade Purple for gradient transitions)
  - `Borders`: `#1e293b` base with 1px–2px glowing neon accents on interactive focus.
- **Typography:**
  - Headings: `Sora` (Weights: 800–900, tight tracking)
  - Telemetry & HUD metadata: `Space Grotesk` or Monospace uppercase with wide letter spacing
  - Body: `Sora` (Weights: 400–500, `#cbd5e1`)
- **Shapes & Elevation:**
  - Radius: `ROUND_FOUR` (4px – 8px) with full-pill badges (`rounded-full`).
  - Visual accents: Cyberpunk L-shaped corner reticles framing key containers.
  - Shadows: Layered neon drop-shadows with 15–20px blurs.

### 4.2 Standard Layout Chrome
- **Header:** Uppercase bold screen title on the left; Room PIN reservation tag (`# 8492`) and waiting headcount badge on the right, punctuated by a continuous neon divider rule.
- **Footer:** Standardized 3-column desktop bar / stacked mobile row:
  - Left: `PUB QUIZ` brand badge
  - Center: Legal navigation links (`TERMS & CONDITIONS`, `PRIVACY POLICY`)
  - Right: System protocol status (`© 2024 / ONLINE`).

---

## 5. Technical Architecture & Data Models

### 5.1 Tech Stack
- **Frontend:** Semantic HTML5, Tailwind CSS, Vanilla JavaScript micro-interactions.
- **Authentication:** FirebaseUI Auth (OAuth2 providers, SMS multi-factor).
- **Real-Time Data & Sync:** Cloud Firestore real-time listeners or WebRTC peer channels.
- **Hosting:** Firebase Hosting / Cloudflare Edge CDN.

### 5.2 Key Data Entities & Knowledge Base Schema

```json
{
  "GameRoom": {
    "roomId": "8492",
    "hostUserId": "user_abc123",
    "status": "WAITING | ACTIVE | COMPLETED",
    "topicPackIds": [
      "pop_culture_01",
      "craft_beer_01",
      "science_tech_01"
    ],
    "questionCount": 15,
    "timeLimitPerQuestion": 30,
    "generatedQuestionIds": ["q_craft_042", "q_pop_108", "q_tech_019"],
    "currentQuestionIndex": 2,
    "players": ["user_abc123", "user_def456"],
    "createdAt": 1729267200
  },

  "TopicPack": {
    "topicPackId": "45634",
    "title": "Craft Beer & Ales",
    "slug": "craft-beer-and-ales",
    "description": "Hops, malts, IPAs, brewing history & Bavarian purity laws",
    "category": "BREWERY",
    "icon": "beer_mug_neon",
    "totalQuestions": 48,
    "difficultyRating": "BALANCED",
    "isFeatured": true
  },

  "Question": {
    "questionId": "7656",
    "topicPackId": "45634",
    "category": "Bavarian History",
    "tags": ["beer", "history", "germany", "regulations"],
    "difficultyRating": "MEDIUM",
    "basePoints": 10,
    "questionText": "Which traditional German brewing purity law, enacted in 1516 in Bavaria, mandates that beer can only be brewed from water, barley, and hops?",
    "options": [
      { "id": "A", "text": "Reinheitsgebot" },
      { "id": "B", "text": "Oktoberfest-Gesetz-Geratz" },
      { "id": "C", "text": "Brauhaus-Statut" },
      { "id": "D", "text": "Malz-Erlass" }
    ],
    "correctAnswerId": "A",
    "explanation": "The Reinheitsgebot was adopted in Bavaria in 1516 by Duke Wilhelm IV, restricting brewing ingredients to water, barley, and hops (yeast was discovered later).",
    "sourceCitations": [
      {
        "title": "German Brewers Association Historical Codex",
        "link": "https://www.examplelink.com"
      }
    ]
  },

  "PlayerResponse": {
    "responseId": "resp_99812",
    "roomId": "8492",
    "questionId": "7656",
    "userId": "user_def456",
    "selectedAnswerId": "A",
    "isCorrect": true,
    "latencyMs": 1820,
    "pointsAwarded": 10,
    "timestamp": 1729267345
  }
}
```

### 5.3 Knowledge Base Querying & Sampling Algorithm
When a host launches a game with multiple `topicPackIds`:
1. **Even Sampling:** The engine computes `perPackCount = Math.floor(totalQuestionCount / topicPackIds.length)`.
2. **Diversity / Difficulty Balancing:** Questions are selected matching the host's difficulty filter (or a balanced mix of 40% Easy, 40% Medium, 20% Hard) using indexed Firestore queries (`topicPackId == id && difficultyRating in [...]`).
3. **Randomized Interleaving:** The composite question deck is shuffled so questions from different selected packs appear intermittently rather than back-to-back.
4. **Cheat Prevention:** Only `options` and `questionText` are sent to client sockets during an active question; `correctAnswerId` and `explanation` remain secured on backend Cloud Functions until the 30-second round timer resolves.

---

## 6. Project Roadmap & Next Steps

1. **Sprint 1 (Design Finalization & Asset Freeze):** Completed — 8 desktop screens, 8 mobile companion screens, and full Design Tokens spec card.
2. **Sprint 2 (Frontend Scaffold & Realtime State):** Implement the HTML/Tailwind templates and wire up live state bindings for timer countdowns and PIN dispatch.
3. **Sprint 3 (Backend & Firebase Integration):** Hook FirebaseUI auth flow, Firestore room document synchronization, multi-pack question bank generation, and automated scoring calculators.
4. **Sprint 4 (Sound Design & Juice):** Add 8-bit sound effects, buzzer audio triggers, and celebratory victory particle bursts.


## 7. Future considerations
1. **Admin portal** A secure admin portal will be required. This will need to be configured to use Google Workspace SSO for my org. This should be configurable in the environment variables so no keys or other authentication information is committed to repo.
2. **Live domain** Ultimately this should be able to be easily deployed to a live domain and hosting with appropriate security and cost considerations.



