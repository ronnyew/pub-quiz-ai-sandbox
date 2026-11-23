const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('<h1>Pub Quiz AI Sandbox</h1><p>Phase 1 Pipeline Verified &amp; Secure.</p>');
});

app.listen(port, () => console.log(`Listening on port ${port}`));
