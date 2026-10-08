import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/errors.js';
import { SAFE_USER_SELECT, safeUser } from '../services/auth.service.js';

const unauthenticated = () => new HttpError(401, 'Sua sessão expirou. Entre novamente.');

export function createAuth({ prisma, jwtSecret }) {
  return async function authenticate(req, res, next) {
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) return next(unauthenticated());

    let payload;
    try {
      payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload !== 'object' || typeof payload.id !== 'string' || !/^[a-f\d]{24}$/i.test(payload.id)
          || !Number.isSafeInteger(payload.tokenVersion) || payload.tokenVersion < 0
          || !Number.isSafeInteger(payload.exp)) {
        return next(unauthenticated());
      }
    } catch {
      return next(unauthenticated());
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { ...SAFE_USER_SELECT, tokenVersion: true },
      });
      if (!user || !user.active || !['ADMIN', 'USER'].includes(user.role)
          || user.tokenVersion !== payload.tokenVersion) {
        return next(unauthenticated());
      }
      req.user = safeUser(user);
      req.userId = user.id;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.active) return next(unauthenticated());
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Você não tem permissão para realizar esta ação.'));
    }
    return next();
  };
}
