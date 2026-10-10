import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';

const productionOrigin = 'https://gerenciador-de-estoque-frontend-kbz.vercel.app';
const previewOrigin = 'https://gerenciador-de-estoque-frontend-kbzr-k4iiqj6-flp18.vercel.app';
let server;
let baseUrl;

before(async () => {
  const app = createApp({ prisma: {}, jwtSecret: 'cors-test-secret', serveFrontend: false });
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

async function preflight(origin) {
  return fetch(`${baseUrl}/api/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
}

test('preflight permite produção, preview e desenvolvimento local', async () => {
  for (const origin of [productionOrigin, previewOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']) {
    const response = await preflight(origin);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /Content-Type/i);
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/i);
  }
});

test('CORS não usa wildcard nem autoriza origens fora da allowlist', async () => {
  const response = await preflight('https://example.com');
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
