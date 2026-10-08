import { HttpError } from '../lib/errors.js';
import { withTransactionRetry } from '../lib/transaction.js';
import { lockAdminGuard, SAFE_USER_SELECT, safeUser } from './auth.service.js';

function pageNumber(value, fallback, maximum, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new HttpError(400, `${label} inválido.`);
  }
  return Number(value);
}

function listOptions(query = {}) {
  if (Object.keys(query).some((key) => !['page', 'limit', 'q', 'role', 'active'].includes(key))) {
    throw new HttpError(400, 'Filtro de usuários não permitido.');
  }
  const page = pageNumber(query.page, 1, 1_000_000, 'Número da página');
  const limit = pageNumber(query.limit, 20, 100, 'Limite');
  const where = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.trim().length > 120) {
      throw new HttpError(400, 'A busca deve ter até 120 caracteres.');
    }
    if (query.q.trim()) {
      where.OR = ['name', 'email'].map((field) => ({ [field]: { contains: query.q.trim(), mode: 'insensitive' } }));
    }
  }
  if (query.role !== undefined) {
    if (!['ADMIN', 'USER'].includes(query.role)) throw new HttpError(400, 'Perfil inválido.');
    where.role = query.role;
  }
  if (query.active !== undefined) {
    if (!['true', 'false'].includes(query.active)) throw new HttpError(400, 'Status inválido.');
    where.active = query.active === 'true';
  }
  return { page, limit, where };
}

function updateData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
      || Object.keys(body).some((key) => !['name', 'role', 'active'].includes(key))) {
    throw new HttpError(400, 'Envie apenas nome, perfil ou status para atualizar o usuário.');
  }
  const data = {};
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) {
      throw new HttpError(400, 'Informe um nome com até 120 caracteres.');
    }
    data.name = body.name.trim();
  }
  if (Object.hasOwn(body, 'role')) {
    if (!['ADMIN', 'USER'].includes(body.role)) throw new HttpError(400, 'Perfil inválido.');
    data.role = body.role;
  }
  if (Object.hasOwn(body, 'active')) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'Status inválido.');
    data.active = body.active;
  }
  return data;
}

export function createUsersService({ prisma }) {
  return {
    async listUsers(query) {
      const { page, limit, where } = listOptions(query);
      const [data, total] = await Promise.all([
        prisma.user.findMany({
          where, skip: (page - 1) * limit, take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: SAFE_USER_SELECT,
        }),
        prisma.user.count({ where }),
      ]);
      return { data: data.map(safeUser), total, page, limit };
    },

    async updateUser(actor, userId, body) {
      if (!actor?.active || actor.role !== 'ADMIN') {
        throw new HttpError(403, 'Você não tem permissão para gerenciar usuários.');
      }
      if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) {
        throw new HttpError(400, 'Identificador de usuário inválido.');
      }
      const data = updateData(body);
      if (actor.id === userId && (data.active === false || data.role === 'USER')) {
        throw new HttpError(409, 'Você não pode desativar sua própria conta nem remover seu perfil de administrador.');
      }

      return withTransactionRetry(prisma, async (transaction) => {
        await lockAdminGuard(transaction);
        const currentActor = await transaction.user.findUnique({ where: { id: actor.id }, select: SAFE_USER_SELECT });
        if (!currentActor?.active || currentActor.role !== 'ADMIN') {
          throw new HttpError(403, 'Você não tem permissão para gerenciar usuários.');
        }
        const target = await transaction.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
        if (!target) throw new HttpError(404, 'Usuário não encontrado.');

        if (target.role === 'ADMIN' && target.active && (data.role === 'USER' || data.active === false)) {
          const activeAdmins = await transaction.user.count({ where: { role: 'ADMIN', active: true } });
          if (activeAdmins <= 1) throw new HttpError(409, 'O sistema precisa manter pelo menos um administrador ativo.');
        }
        const permissionsChanged = (data.role !== undefined && data.role !== target.role)
          || (data.active !== undefined && data.active !== target.active);
        const user = await transaction.user.update({
          where: { id: userId },
          data: { ...data, ...(permissionsChanged && { tokenVersion: { increment: 1 } }) },
          select: SAFE_USER_SELECT,
        });
        return safeUser(user);
      });
    },
  };
}
