const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('./index');

function request(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          server.close(() => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        });
      }).on('error', (err) => {
        server.close(() => reject(err));
      });
    });
  });
}

test('GET /health returns ok status and version', async () => {
  const res = await request('/health');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok', version: '0.1.0' });
});

test('GET / serves Neon Tokyo gateway (not legacy taproom)', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.doesNotMatch(res.body, /The AI Taproom Quiz/);
  assert.match(res.body, /data-theme="taproom"/);
  assert.match(res.body, /Pub Quiz/i);
});