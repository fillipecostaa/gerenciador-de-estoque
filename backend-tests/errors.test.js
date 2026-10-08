import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../lib/errors.js';
import { prismaErrorDetails } from '../lib/prisma-diagnostics.js';

test('diagnóstico preserva a causa Prisma e oculta URI, hash e campos secretos', () => {
  const uri = 'mongodb+srv://example:private-password@cluster.example.test/db';
  const details = prismaErrorDetails({
    code: 'P2010',
    message: `Server selection timeout: ${uri}`,
    meta: {
      code: 'unknown', message: 'received fatal alert: InternalError',
      password: 'private-password', nested: [{ authorization: 'Bearer private-token' }],
      hash: `$2b$10$${'a'.repeat(53)}`,
    },
  });
  assert.equal(details.code, 'P2010');
  assert.equal(details.meta.message, 'received fatal alert: InternalError');
  const serialized = JSON.stringify(details);
  for (const sensitive of [uri, 'private-password', 'private-token', '$2b$10$']) {
    assert.equal(serialized.includes(sensitive), false);
  }
});

test('detalhes Prisma ficam só no terminal quando diagnóstico temporário está habilitado', (t) => {
  const original = { debug: process.env.PRISMA_DEBUG_ERRORS, mode: process.env.NODE_ENV };
  t.after(() => {
    for (const [key, value] of [['PRISMA_DEBUG_ERRORS', original.debug], ['NODE_ENV', original.mode]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const log = t.mock.method(console, 'error', () => {});
  const error = Object.assign(new Error('received fatal alert: InternalError'), {
    code: 'P2010', meta: { modelName: 'User', code: 'unknown' },
  });
  for (const [debug, mode, expectedDetails] of [['0', 'development', false], ['1', 'development', true], ['1', 'production', false]]) {
    process.env.PRISMA_DEBUG_ERRORS = debug;
    process.env.NODE_ENV = mode;
    log.mock.resetCalls();
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    errorHandler(error, {}, response, () => assert.fail('A resposta deveria ser concluída.'));
    assert.equal(response.code, 500);
    assert.equal(JSON.stringify(response.body).includes('InternalError'), false);
    const details = log.mock.calls.find((call) => call.arguments[0] === '[Prisma]');
    assert.equal(Boolean(details), expectedDetails);
    if (details) assert.deepEqual(JSON.parse(details.arguments[1]), {
      code: error.code, message: error.message, meta: error.meta,
    });
  }
});
