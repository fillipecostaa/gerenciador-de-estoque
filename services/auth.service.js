import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/errors.js';
import { withTransactionRetry } from '../lib/transaction.js';

export const SAFE_USER_SELECT = {
  id: true, name: true, email: true, role: true, active: true,
};

export function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

function validateBody(body, registration, { ignoreRole = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Envie os dados em um objeto JSON.');
  }
  const allowed = registration ? ['name', 'email', 'password'] : ['email', 'password'];
  if (Object.keys(body).some((key) => !allowed.includes(key) && !(ignoreRole && key === 'role'))) {
    throw new HttpError(400, 'O formulário contém campos não permitidos.');
  }
  if (typeof body.email !== 'string' || body.email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    throw new HttpError(400, 'Informe um e-mail válido.');
  }
  if (typeof body.password !== 'string' || !body.password.length) {
    throw new HttpError(400, 'Informe sua senha.');
  }
  if (registration && Array.from(body.password).length < 6) {
    throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
  if (Buffer.byteLength(body.password, 'utf8') > 72) {
    throw new HttpError(400, 'A senha deve ter no máximo 72 bytes. Use uma senha mais curta.');
  }
  if (registration && (typeof body.name !== 'string' || !body.name.trim()
      || body.name.trim().length > 120)) {
    throw new HttpError(400, 'Informe um nome com até 120 caracteres.');
  }
  return {
    ...(registration && { name: body.name.trim() }),
    email: body.email.trim(),
    password: body.password,
  };
}

export async function lockAdminGuard(transaction) {
  await transaction.systemState.upsert({
    where: { id: 'admin-guard' },
    create: { id: 'admin-guard', version: 1 },
    update: { version: { increment: 1 } },
  });
}

export function createAuthService({ prisma, jwtSecret }) {
  return {
    async register(body) {
      // O perfil recebido no cadastro público é descartado; somente o servidor o define.
      const { name, email, password } = validateBody(body, true, { ignoreRole: true });
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new HttpError(409, 'Este e-mail já está cadastrado.');
      }
      const hash = await bcrypt.hash(password, 10);
      try {
        const user = await prisma.user.create({
          data: { name, email, password: hash, role: 'USER', active: true, tokenVersion: 0 },
          select: SAFE_USER_SELECT,
        });
        return safeUser(user);
      } catch (error) {
        // O índice único também protege dois cadastros simultâneos do mesmo e-mail.
        if (error?.code === 'P2002') throw new HttpError(409, 'Este e-mail já está cadastrado.');
        throw error;
      }
    },

    async login(body) {
      const { email, password } = validateBody(body, false);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.active || typeof user.password !== 'string'
          || !(await bcrypt.compare(password, user.password))) {
        throw new HttpError(401, 'E-mail ou senha incorretos.');
      }
      if (typeof jwtSecret !== 'string' || !jwtSecret.trim()) {
        throw new HttpError(503, 'Autenticação indisponível. Tente novamente mais tarde.');
      }
      return jwt.sign({ id: user.id, tokenVersion: user.tokenVersion }, jwtSecret, {
        algorithm: 'HS256', expiresIn: '7d',
      });
    },

    async logout(userId) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
          select: { id: true },
        });
      } catch (error) {
        if (error?.code === 'P2025') throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
        throw error;
      }
    },

    async createFirstAdmin(body) {
      const { name, email, password } = validateBody(body, true);
      const hash = await bcrypt.hash(password, 10);
      try {
        return await withTransactionRetry(prisma, async (transaction) => {
          await lockAdminGuard(transaction);
          if (await transaction.user.count({ where: { role: 'ADMIN' } })) {
            throw new HttpError(409, 'Já existe um administrador. Use uma conta administradora para gerenciar usuários.');
          }
          if (await transaction.user.findUnique({ where: { email }, select: { id: true } })) {
            throw new HttpError(409, 'Este e-mail já está cadastrado. A conta existente não será promovida.');
          }
          const user = await transaction.user.create({
            data: { name, email, password: hash, role: 'ADMIN', active: true, tokenVersion: 0 },
            select: SAFE_USER_SELECT,
          });
          return safeUser(user);
        });
      } catch (error) {
        if (error?.code === 'P2002') {
          throw new HttpError(409, 'O administrador ou o e-mail já foi cadastrado. Tente entrar na conta existente.');
        }
        throw error;
      }
    },
  };
}
