# Project Constitution & Engineering Rules

## Architecture & Guardrails
- Stack: Node.js + Express, hosted on Google Cloud Run, database on Firestore.
- Player frontend: Tailwind CSS only, plus `public/styles/neon-tokyo.css` extracted from `design/player/*/code.html` (`.cyber-grid`, `.neon-glow-pink`, `.neon-glow-cyan`, Stitch color tokens, `Sora`, `Space Grotesk`, `Inter`). Do not add DaisyUI to the Neon Tokyo player UI.
- Cost Control: Never introduce background polling loops or persistent WebSockets that prevent Cloud Run from scaling to zero.
- Security: Never hardcode API keys or credentials. Validate and sanitize all user inputs before database writes or LLM calls.
- **Content separation:** Never hardcode legal copy, footer links, or static marketing/UI strings inside HTML templates (`lib/player-layout.js`, `lib/player-pages.js`, `index.js`, or similar). Store all such copy in `content/site-content.json` and read it only through `lib/content-store.js` (the abstraction future Admin Portal can swap to Firestore without changing routes or templates). All Markdown rendered for pages MUST pass through `lib/content-store.js` and `sanitize-html` before injection into templates.
- **No regex HTML rewriting:** Never use regular expressions to parse or rewrite HTML strings after `sanitize-html` (nested `<ul>` / `<li>` trees break easily). Apply CMS Markdown styling only via `sanitize-html` `transformTags` and CSS selectors (e.g. `.content-markdown ul`).
- **URL & slug validation:** All CMS/user-defined `footer_links[].path` values MUST match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` and MUST NOT use reserved slugs (`admin`, `api`, `health`, `dashboard`). Validate in `lib/content-store.js` before routes or `href="/${slug}"` rendering. Sanitized Markdown links MUST block `javascript:` / `data:` schemes (via `sanitize-html`), strip protocol-relative URLs (`//...`), allow only `http://`, `https://`, `mailto:`, or single-slash internal paths (`/…` not `//…`), and MUST strip author-supplied `class` values in `transformTags` before applying typography—never merge CMS classes with Neon Tokyo classes.

## Workflow & Accountability
- Never suggest pushing directly to `main`. All changes must be structured for a Pull Request.
- Every new API route or game logic function must include a corresponding unit test.
- DOCUMENTATION RULE: Before concluding any coding task, append a concise entry to `ENGINEERING_LOG.md` in this repo summarizing: (1) What changed, (2) Why it was designed that way, and (3) Any security or cost implications.
