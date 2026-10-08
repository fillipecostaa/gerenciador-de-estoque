import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';

const jwtSecret = 'segredo-exclusivo-dos-testes-isolados-de-cadastro';
const password = 'SenhaCadastro#123';
let replicaSet;
let prisma;
let server;
let origin;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.6' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  // O único destino permitido é a réplica recém-criada. Não importar lib/prisma
  // nem usar DATABASE_URL como alternativa, mesmo se houver um banco disponível.
  const databaseName = `registration_${randomUUID().replaceAll('-', '')}`;
  const url = replicaSet.getUri(databaseName);
  assert.match(url, /^mongodb:\/\/127\.0\.0\.1:\d+\//);
  const mongo = new MongoClient(url);
  try {
    await mongo.connect();
    const db = mongo.db(databaseName);
    await Promise.all(['User', 'Product', 'Movement', 'SystemState'].map(name => db.createCollection(name)));
    await db.collection('User').createIndex({ email: 1 }, { unique: true });
  } finally {
    await mongo.close();
  }

  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const app = createApp({ prisma, jwtSecret, serveFrontend: false });
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120_000 });

after(async () => {
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  } finally {
    try {
      await prisma?.$disconnect();
    } finally {
      await replicaSet?.stop();
    }
  }
});

beforeEach(async () => {
  await prisma.movement.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemState.deleteMany();
});

async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
}

function registration(email, extras = {}) {
  return { name: 'Marina Teste', email, password, ...extras };
}

async function registeredSession(email) {
  const account = await request('/api/cadastro', { method: 'POST', body: registration(email) });
  assert.equal(account.status, 201, 'O cadastro deve ser concluído antes de testar as permissões.');
  const login = await request('/api/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  return { user: account.body, token: login.body };
}

test('cadastro ignora ADMIN recebido, grava USER com hash e permite entrar na conta', async () => {
  const email = 'cadastro@registration.test';
  const result = await request('/api/cadastro', {
    method: 'POST',
    body: registration(` ${email} `, { name: ' Marina Teste ', role: 'ADMIN' }),
  });
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body).sort(), ['active', 'email', 'id', 'name', 'role']);
  assert.equal(result.body.name, 'Marina Teste');
  assert.equal(result.body.email, email);
  assert.equal(result.body.role, 'USER');
  assert.equal(result.body.active, true);

  const saved = await prisma.user.findUnique({ where: { email } });
  assert.equal(saved.id, result.body.id);
  assert.equal(saved.role, 'USER');
  assert.equal(saved.active, true);
  assert.equal(saved.tokenVersion, 0);
  assert.notEqual(saved.password, password);
  assert.match(saved.password, /^\$2[aby]\$/);
  assert.equal(await bcrypt.compare(password, saved.password), true);
  assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 0);

  const login = await request('/api/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  assert.equal(typeof login.body, 'string');
  const claims = jwt.verify(login.body, jwtSecret, { algorithms: ['HS256'] });
  assert.equal(claims.id, saved.id);
  assert.equal(claims.tokenVersion, 0);
  assert.ok(claims.exp > Math.floor(Date.now() / 1000));

  const profile = await request('/api/auth/me', { token: login.body });
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.body, result.body);

  for (const path of ['/api/produtos', '/api/dashboard', '/api/movimentacoes']) {
    const response = await request(path, { token: login.body });
    assert.equal(response.status, 200, `A conta USER deve acessar ${path}.`);
  }
  const wrongPassword = await request('/api/login', { method: 'POST', body: { email, password: 'SenhaIncorreta' } });
  assert.equal(wrongPassword.status, 401);
});

test('a rota original /cadastro também ignora o perfil enviado e não cria administradores', async () => {
  const email = 'rota-original@registration.test';
  const result = await request('/cadastro', {
    method: 'POST', body: registration(email, { role: 'ADMIN' }),
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.role, 'USER');
  assert.equal((await prisma.user.findUnique({ where: { email } })).role, 'USER');
  const login = await request('/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  assert.equal((await request('/api/auth/me', { token: login.body })).status, 200);
});

test('e-mail duplicado retorna 409 sem substituir a conta ou a senha existentes', async () => {
  const email = 'duplicado@registration.test';
  const first = await request('/api/cadastro', { method: 'POST', body: registration(email) });
  assert.equal(first.status, 201);
  const duplicate = await request('/api/cadastro', {
    method: 'POST', body: registration(email, { name: 'Outro nome', password: 'OutraSenha#456', role: 'ADMIN' }),
  });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.message, /e-mail.*cadastrado/i);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  const saved = await prisma.user.findUnique({ where: { email } });
  assert.equal(saved.id, first.body.id);
  assert.equal(saved.name, 'Marina Teste');
  assert.equal(saved.role, 'USER');
  assert.equal(await bcrypt.compare(password, saved.password), true);
  assert.equal(await bcrypt.compare('OutraSenha#456', saved.password), false);
});

test('cadastros simultâneos do mesmo e-mail criam uma única conta e retornam 201 e 409', async () => {
  const email = 'concorrente@registration.test';
  const responses = await Promise.all([
    request('/api/cadastro', { method: 'POST', body: registration(email, { role: 'ADMIN' }) }),
    request('/api/cadastro', { method: 'POST', body: registration(email, { role: 'ADMIN' }) }),
  ]);
  assert.deepEqual(responses.map(result => result.status).sort(), [201, 409]);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  const saved = await prisma.user.findUnique({ where: { email } });
  assert.equal(saved.role, 'USER');
  assert.equal(await bcrypt.compare(password, saved.password), true);
});

test('USER recebe 403 para usuários e mutações administrativas, sem alterar os dados', async () => {
  const { user, token } = await registeredSession('permissoes@registration.test');
  const product = await prisma.product.create({
    data: { name: 'Produto protegido', category: 'Teste', priceCents: 1500, stock: 5, minStock: 1 },
  });
  const attempts = [
    ['/api/usuarios', {}],
    ['/api/listar-usuarios', {}],
    ['/listar-usuarios', {}],
    ['/api/produtos', { method: 'POST', body: { name: 'Produto negado', category: 'Teste', price: 10, minStock: 0 } }],
    [`/api/produtos/${product.id}`, { method: 'PATCH', body: { name: 'Alteração negada' } }],
    [`/api/produtos/${product.id}/ajuste`, { method: 'POST', body: { stock: 0, reason: 'Ajuste não autorizado' } }],
    [`/api/usuarios/${user.id}`, { method: 'PATCH', body: { role: 'ADMIN' } }],
  ];
  for (const [path, options] of attempts) {
    const response = await request(path, { ...options, token });
    assert.equal(response.status, 403, `${options.method || 'GET'} ${path} deve exigir ADMIN.`);
    assert.equal(typeof response.body.message, 'string');
  }
  assert.equal(await prisma.product.count(), 1);
  const unchanged = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(unchanged.name, 'Produto protegido');
  assert.equal(unchanged.stock, 5);
  assert.equal(await prisma.movement.count(), 0);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).role, 'USER');
});

test('rotas de negócio exigem token e retornam 401 antes de consultar ou alterar dados', async () => {
  for (const path of ['/api/auth/me', '/api/produtos', '/api/dashboard', '/api/movimentacoes', '/api/usuarios']) {
    const response = await request(path);
    assert.equal(response.status, 401, `A rota ${path} não pode aceitar uma sessão ausente.`);
  }
  const mutation = await request('/api/produtos', {
    method: 'POST', body: { name: 'Sem sessão', category: 'Teste', price: 10, minStock: 0 },
  });
  assert.equal(mutation.status, 401);
  assert.equal(await prisma.product.count(), 0);
});
