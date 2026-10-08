import { HttpError } from './errors.js';

export function objectBody(body, allowedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Envie um objeto JSON válido.');
  if (Object.keys(body).some(key => !allowedKeys.includes(key))) throw new HttpError(400, 'A solicitação contém campos não permitidos.');
  return body;
}

export function text(value, label, { min = 1, max = 120 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}

export function integer(value, label, { min = 0, max = 1_000_000_000 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `${label} deve ser um número inteiro entre ${min} e ${max}.`);
  return value;
}

export function objectId(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, `${label} inválido.`);
  return value;
}

export function boolean(value, label) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${label} deve ser verdadeiro ou falso.`);
  return value;
}

export function queryBoolean(value, label) {
  if (value === undefined || value === 'all') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpError(400, `Filtro ${label} inválido.`);
}

export function pagination(query = {}) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, 'Paginação inválida.');
    return integer(Number(value), 'Paginação', { min: 1, max });
  };
  const page = parse(query.page, 1, 100000);
  const limit = parse(query.limit, 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}

export function priceInCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10_000_000) throw new HttpError(400, 'Informe um preço válido entre R$ 0 e R$ 10.000.000.');
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.000001) throw new HttpError(400, 'O preço deve ter no máximo duas casas decimais.');
  return cents;
}
