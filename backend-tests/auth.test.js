import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError, errorHandler } from '../lib/errors.js';
import { createAuthService } from '../services/auth.service.js';
import { createUsersService } from '../services/users.service.js';
import { createAuth, requireRole } from '../middlewares/auth.js';
import { createPublicRoutes } from '../routes/public.js';
import { createAccountRoutes } from '../routes/account.js';
import { createUserRoutes } from '../routes/users.js';

const secret = 'test-only-jwt-key-not-used-outside-tests';
const adminId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const secondAdminId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const userId = 'cccccccccccccccccccccccc';
const passwordHash = await bcrypt.hash('senha123', 4);
const user = (id = userId, role = 'USER', overrides = {}) => ({
  id, name: 'Pessoa de teste', email: `${id}@example.com`, password: passwordHash,
  role, active: true, tokenVersion: 0, ...overrides,
});
const credentials = { name: ' Ana ', email: ' Ana@example.com ', password: 'senha123' };
const status = (expected) => (error) => error instanceof HttpError && error.status === expected;
const sign = (person, extra = {}, options = {}) => jwt.sign({
  id: person.id, tokenVersion: person.tokenVersion, ...extra,
}, secret, { expiresIn: '1h', algorithm: 'HS256', ...options });

function mockPrisma(initial = [], { concurrent = false } = {}) {
  let rows = structuredClone(initial);
  let revision = 0;
  let arrivals = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const trace = [];
  const matches = (person, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((condition) => Object.entries(condition).some(([field, rule]) => person[field].toLowerCase().includes(rule.contains.toLowerCase())));
    return person[key] === value;
  });
  function client(getRows) {
    return {
      user: {
        async findUnique({ where }) {
          trace.push('find');
          return structuredClone(getRows().find((person) => matches(person, where)) || null);
        },
        async count({ where = {} } = {}) {
          trace.push('count');
          return getRows().filter((person) => matches(person, where)).length;
        },
        async findMany({ where = {}, skip = 0, take = 100 } = {}) {
          return structuredClone(getRows().filter((person) => matches(person, where)).slice(skip, skip + take));
        },
        async create({ data }) {
          trace.push('create');
          if (getRows().some((person) => person.email === data.email)) throw { code: 'P2002' };
          const person = { id: randomBytes(12).toString('hex'), ...data };
          getRows().push(person);
          return structuredClone(person);
        },
        async update({ where, data }) {
          trace.push('update');
          const person = getRows().find((entry) => matches(entry, where));
          if (!person) throw { code: 'P2025' };
          for (const [key, value] of Object.entries(data)) {
            person[key] = key === 'tokenVersion' ? person[key] + value.increment : value;
          }
          return structuredClone(person);
        },
      },
      systemState: {
        async upsert(args) {
          assert.deepEqual(args, {
            where: { id: 'admin-guard' }, create: { id: 'admin-guard', version: 1 },
            update: { version: { increment: 1 } },
          });
          trace.push('lock');
          if (concurrent && arrivals < 2) {
            arrivals += 1;
            if (arrivals === 2) release();
            await gate;
          }
        },
      },
    };
  }
  return {
    ...client(() => rows),
    trace,
    rows: () => structuredClone(rows),
    async $transaction(callback) {
      const startingRevision = revision;
      const snapshot = structuredClone(rows);
      const result = await callback(client(() => snapshot));
      if (startingRevision !== revision) throw { code: 'P2034' };
      revision += 1;
      rows = snapshot;
      return result;
    },
  };
}

async function authenticate(prisma, token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  let error;
  await createAuth({ prisma, jwtSecret: secret })(req, {}, (nextError) => { error = nextError; });
  return { req, error };
}

test('cadastro limita campos, fixa USER e não expõe hash nem tokenVersion', async () => {
  const prisma = mockPrisma();
  const service = createAuthService({ prisma, jwtSecret: secret });
  for (const key of ['admin', 'active', 'id', 'userId', 'tokenVersion']) {
    await assert.rejects(service.register({ ...credentials, [key]: 'ADMIN' }), status(400));
  }
  assert.equal(prisma.rows().length, 0);
  const result = await service.register({ ...credentials, role: 'ADMIN' });
  assert.deepEqual(Object.keys(result).sort(), ['active', 'email', 'id', 'name', 'role']);
  assert.equal(result.name, 'Ana');
  assert.equal(result.email, 'Ana@example.com');
  assert.equal(result.role, 'USER');
  assert.equal(result.active, true);
  assert.equal(await bcrypt.compare('senha123', prisma.rows()[0].password), true);
  assert.equal(prisma.rows()[0].tokenVersion, 0);
  assert.deepEqual(prisma.trace, ['find', 'create']);
});

test('cadastro valida tipos, nome, email e limite bcrypt em bytes UTF-8', async () => {
  const service = createAuthService({ prisma: mockPrisma(), jwtSecret: secret });
  for (const body of [null, [], 'text', {}, { ...credentials, email: 'invalid' },
    { ...credentials, password: {} }, { ...credentials, password: 'short' },
    { ...credentials, password: '😀'.repeat(19) }, { ...credentials, name: ' ' },
    { ...credentials, name: 5 }, { ...credentials, name: 'x'.repeat(121) }]) {
    await assert.rejects(service.register(body), status(400));
  }
  await service.register({ ...credentials, password: '😀'.repeat(18) });
});

test('cadastro retorna conflito para email duplicado', async () => {
  const prisma = mockPrisma([user(userId, 'USER', { email: 'Ana@example.com' })]);
  const service = createAuthService({ prisma, jwtSecret: secret });
  await assert.rejects(service.register(credentials), status(409));
  assert.deepEqual(prisma.trace, ['find']);
});

test('cadastros simultâneos do mesmo email preservam o conflito do índice único', async () => {
  const prisma = mockPrisma();
  const service = createAuthService({ prisma, jwtSecret: secret });
  const results = await Promise.allSettled([service.register(credentials), service.register(credentials)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(prisma.rows().length, 1);
});

test('cadastro preserva detalhes de erros do Prisma e não grava se a consulta falha', async () => {
  const failure = Object.assign(new Error('Server selection timeout'), { code: 'P2010', meta: { code: 'unknown' } });
  const prisma = { user: {
    findUnique: async () => { throw failure; },
    create: async () => assert.fail('Não deve gravar depois de falha na consulta.'),
  } };
  await assert.rejects(createAuthService({ prisma, jwtSecret: secret }).register(credentials), (error) => error === failure);
});

test('login assina HS256 com versão e aceita senha curta de conta antiga', async () => {
  const person = user(userId, 'USER', { email: 'Ana@example.com', password: await bcrypt.hash('old', 4), tokenVersion: 3 });
  const service = createAuthService({ prisma: mockPrisma([person]), jwtSecret: secret });
  const token = await service.login({ email: ' Ana@example.com ', password: 'old' });
  assert.equal(typeof token, 'string');
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], complete: true });
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.id, userId);
  assert.equal(decoded.payload.tokenVersion, 3);
  assert.equal(decoded.payload.exp - decoded.payload.iat, 7 * 24 * 60 * 60);
  assert.equal('role' in decoded.payload, false);
});

test('login usa o mesmo 401 para usuário inexistente, senha errada e conta inativa', async () => {
  const cases = [[], [user(userId, 'USER', { email: 'Ana@example.com' })], [user(userId, 'USER', { email: 'Ana@example.com', active: false })]];
  const messages = [];
  for (const rows of cases) {
    const service = createAuthService({ prisma: mockPrisma(rows), jwtSecret: secret });
    await assert.rejects(service.login({ email: 'Ana@example.com', password: 'errada' }), (error) => {
      messages.push(error.message);
      return status(401)(error);
    });
  }
  assert.equal(new Set(messages).size, 1);
});

test('middleware ignora perfil ADMIN no JWT e usa perfil atual do banco', async () => {
  const person = user();
  const { req, error } = await authenticate(mockPrisma([person]), sign(person, { role: 'ADMIN', active: true }));
  assert.equal(error, undefined);
  assert.equal(req.user.role, 'USER');
  assert.deepEqual(Object.keys(req.user).sort(), ['active', 'email', 'id', 'name', 'role']);
  let permissionError;
  requireRole('ADMIN')(req, {}, (value) => { permissionError = value; });
  assert.equal(permissionError.status, 403);
});

test('middleware rejeita assinatura, algoritmo, expiração e claims inválidos antes do banco', async () => {
  const person = user();
  const prisma = { user: { findUnique() { assert.fail('Token inválido não deve consultar usuário.'); } } };
  const tokens = [undefined, 'invalid', jwt.sign({ id: userId, tokenVersion: 0 }, 'wrong-key', { expiresIn: '1h' }),
    sign(person, {}, { algorithm: 'HS384' }), sign(person, {}, { expiresIn: -1 }),
    sign(person, { id: [userId] }), sign(person, { id: 'invalid' }), sign(person, { tokenVersion: -1 }),
    sign(person, { tokenVersion: '0' }), jwt.sign({ id: userId, tokenVersion: 0 }, secret)];
  for (const token of tokens) assert.equal((await authenticate(prisma, token)).error.status, 401);
});

test('middleware rejeita usuário removido, inativo e versão revogada', async () => {
  const person = user();
  for (const rows of [[], [{ ...person, active: false }], [{ ...person, tokenVersion: 1 }]]) {
    assert.equal((await authenticate(mockPrisma(rows), sign(person))).error.status, 401);
  }
});

test('requireRole exige sessão ativa e ADMIN', () => {
  for (const [current, expected] of [[undefined, 401], [user(userId, 'ADMIN', { active: false }), 401], [user(), 403], [user(adminId, 'ADMIN'), undefined]]) {
    let error;
    requireRole('ADMIN')({ user: current }, {}, (value) => { error = value; });
    assert.equal(error?.status, expected);
  }
});

test('logout incrementa tokenVersion e invalida token previamente válido', async () => {
  const person = user();
  const prisma = mockPrisma([person]);
  const token = sign(person);
  assert.equal((await authenticate(prisma, token)).error, undefined);
  await createAuthService({ prisma, jwtSecret: secret }).logout(userId);
  assert.equal(prisma.rows()[0].tokenVersion, 1);
  assert.equal((await authenticate(prisma, token)).error.status, 401);
});

test('primeiro admin usa transação e lock antes de verificar ou criar', async () => {
  const prisma = mockPrisma();
  const result = await createAuthService({ prisma, jwtSecret: secret }).createFirstAdmin(credentials);
  assert.equal(result.role, 'ADMIN');
  assert.equal(result.active, true);
  assert.equal('password' in result, false);
  assert.equal(await bcrypt.compare('senha123', prisma.rows()[0].password), true);
  assert.deepEqual(prisma.trace.slice(0, 4), ['lock', 'count', 'find', 'create']);
});

test('bootstrap rejeita qualquer admin existente e nunca promove email local', async () => {
  for (const existing of [user(adminId, 'ADMIN', { active: false }), user(userId, 'USER', { email: 'Ana@example.com' })]) {
    const prisma = mockPrisma([existing]);
    await assert.rejects(createAuthService({ prisma, jwtSecret: secret }).createFirstAdmin(credentials), status(409));
    assert.deepEqual(prisma.rows(), [existing]);
    assert.equal(prisma.trace.includes('create'), false);
  }
});

test('dois bootstraps concorrentes criam somente um primeiro admin', async () => {
  const prisma = mockPrisma([], { concurrent: true });
  const service = createAuthService({ prisma, jwtSecret: secret });
  const results = await Promise.allSettled([
    service.createFirstAdmin(credentials),
    service.createFirstAdmin({ ...credentials, email: 'second@example.com' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(prisma.rows().filter((person) => person.role === 'ADMIN').length, 1);
});

test('admin não pode desativar nem rebaixar a própria conta', async () => {
  const actor = user(adminId, 'ADMIN');
  const prisma = mockPrisma([actor]);
  const service = createUsersService({ prisma });
  for (const patch of [{ active: false }, { role: 'USER' }, { name: 'Novo', role: 'USER' }]) {
    await assert.rejects(service.updateUser(actor, actor.id, patch), status(409));
  }
  assert.equal(prisma.trace.length, 0);
});

test('patch usuários rejeita campos extras, tipos errados e identificadores inválidos', async () => {
  const actor = user(adminId, 'ADMIN');
  const service = createUsersService({ prisma: mockPrisma([actor, user()]) });
  for (const patch of [null, [], {}, { password: 'new' }, { email: 'other@example.com' },
    { role: 'ROOT' }, { active: 'false' }, { name: ' ' }, { tokenVersion: 0 }]) {
    await assert.rejects(service.updateUser(actor, userId, patch), status(400));
  }
  await assert.rejects(service.updateUser(actor, 'invalid', { name: 'Novo' }), status(400));
  await assert.rejects(service.updateUser(user(), adminId, { role: 'USER' }), status(403));
});

test('alteração de perfil/status revoga token e retorna apenas dados seguros', async () => {
  const actor = user(adminId, 'ADMIN');
  const prisma = mockPrisma([actor, user()]);
  const service = createUsersService({ prisma });
  const promoted = await service.updateUser(actor, userId, { role: 'ADMIN', name: '  Novo nome  ' });
  assert.equal(promoted.role, 'ADMIN');
  assert.equal(promoted.name, 'Novo nome');
  assert.equal('password' in promoted, false);
  assert.equal('tokenVersion' in promoted, false);
  assert.equal(prisma.rows().find((entry) => entry.id === userId).tokenVersion, 1);
  await service.updateUser(actor, userId, { active: false });
  assert.equal(prisma.rows().find((entry) => entry.id === userId).tokenVersion, 2);
});

test('transação revalida se autor ainda é ADMIN e bloqueia último admin ativo', async () => {
  const actor = user(adminId, 'ADMIN');
  const revokedPrisma = mockPrisma([{ ...actor, role: 'USER' }, user(secondAdminId, 'ADMIN')]);
  await assert.rejects(createUsersService({ prisma: revokedPrisma }).updateUser(actor, secondAdminId, { active: false }), status(403));
  const prisma = mockPrisma([actor, user(secondAdminId, 'ADMIN')]);
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = (callback) => originalTransaction(async (transaction) => {
    transaction.user.count = async () => 1;
    return callback(transaction);
  });
  await assert.rejects(createUsersService({ prisma }).updateUser(actor, secondAdminId, { active: false }), status(409));
  assert.equal(prisma.trace.includes('update'), false);
});

test('rebaixamentos concorrentes preservam pelo menos um admin ativo', async () => {
  const first = user(adminId, 'ADMIN');
  const second = user(secondAdminId, 'ADMIN');
  const prisma = mockPrisma([first, second], { concurrent: true });
  const service = createUsersService({ prisma });
  const results = await Promise.allSettled([
    service.updateUser(first, second.id, { role: 'USER' }),
    service.updateUser(second, first.id, { role: 'USER' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 403);
  assert.equal(prisma.rows().filter((person) => person.role === 'ADMIN' && person.active).length, 1);
});

test('listagem aplica paginação, busca, perfil e status sem expor hash', async () => {
  const prisma = mockPrisma([user(adminId, 'ADMIN'), user(userId, 'USER', { name: 'Ana', active: false }), user(secondAdminId, 'USER', { name: 'Ana 2', active: false })]);
  const result = await createUsersService({ prisma }).listUsers({ page: '2', limit: '1', q: ' ana ', role: 'USER', active: 'false' });
  assert.equal(result.total, 2);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 1);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, secondAdminId);
  assert.equal('password' in result.data[0], false);
  for (const query of [{ page: '0' }, { limit: '101' }, { page: '1.5' }, { active: '0' }, { role: 'ROOT' }, { q: [] }, { password: 'x' }]) {
    await assert.rejects(createUsersService({ prisma }).listUsers(query), status(400));
  }
});

test('rotas HTTP protegem usuários, retornam me e revogam sessão no logout', async (t) => {
  const person = user();
  const admin = user(adminId, 'ADMIN');
  const prisma = mockPrisma([person, admin]);
  const dependencies = { prisma, jwtSecret: secret };
  const app = express();
  app.use(express.json());
  app.use('/api', createPublicRoutes(dependencies));
  app.use('/api', createAuth(dependencies));
  app.use('/api/auth', createAccountRoutes(dependencies));
  app.use('/api/usuarios', createUserRoutes(dependencies));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, token, method = 'GET') => fetch(`${base}${path}`, {
    method, headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  assert.equal((await request('/usuarios')).status, 401);
  assert.equal((await request('/usuarios', sign(person, { role: 'ADMIN' }))).status, 403);
  const listing = await request('/usuarios', sign(admin));
  assert.equal(listing.status, 200);
  assert.equal(JSON.stringify(await listing.json()).includes('password'), false);
  const token = sign(person);
  const me = await request('/auth/me', token);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).role, 'USER');
  assert.equal((await request('/auth/logout', token, 'POST')).status, 204);
  assert.equal((await request('/auth/me', token)).status, 401);
});
