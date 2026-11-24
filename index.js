const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

const landingPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The AI Taproom Quiz</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #12110f;
      --card: #1c1a17;
      --text: #f4efe6;
      --muted: #b7aa98;
      --accent: #e0a15a;
      --badge: #2a3a2c;
      --badge-text: #b7e0bc;
      --line: #3a342c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
    }
    main {
      width: min(32rem, calc(100% - 2rem));
      padding: 2.5rem 2rem;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 1rem;
      text-align: center;
    }
    p.badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1.5rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      background: var(--badge);
      color: var(--badge-text);
      font-family: system-ui, sans-serif;
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p.badge::before {
      content: "";
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: #6dce78;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 2.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    p.tagline {
      margin: 0 0 2rem;
      color: var(--muted);
      font-size: 1.1rem;
      line-height: 1.5;
    }
    button {
      font-family: system-ui, sans-serif;
      font-size: 1rem;
      padding: 0.75rem 1.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <main>
    <p class="badge">Server online</p>
    <h1>The AI Taproom Quiz</h1>
    <p class="tagline">An AI-hosted pub quiz for the bar. Rounds, questions, and scoring arrive in the next pour.</p>
    <button type="button" disabled>Start Quiz (Coming in Phase 2)</button>
  </main>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.type('html').send(landingPage);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`Listening on port ${port}`));
}

module.exports = app;
