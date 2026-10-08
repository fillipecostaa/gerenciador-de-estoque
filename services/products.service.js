import { HttpError } from '../lib/errors.js';
import { boolean, objectBody, objectId, pagination, priceInCents, queryBoolean, text, integer } from '../lib/validation.js';

export function productDto(product) {
  const { priceCents, ...data } = product;
  return { ...data, price: priceCents / 100, lowStock: product.active && product.stock <= product.minStock };
}

export function createProductService({ prisma }) {
  const validate = (body, partial = false) => {
    objectBody(body, ['name', 'description', 'category', 'price', 'minStock', 'active']);
    if (partial && !Object.keys(body).length) throw new HttpError(400, 'Informe ao menos um campo para editar.');
    const data = {};
    if (!partial || body.name !== undefined) data.name = text(body.name, 'Nome', { max: 120 });
    if (!partial || body.category !== undefined) data.category = text(body.category, 'Categoria', { max: 80 });
    if (!partial || body.description !== undefined) data.description = text(body.description ?? '', 'Descrição', { min: 0, max: 1000 });
    if (!partial || body.price !== undefined) data.priceCents = priceInCents(body.price);
    if (!partial || body.minStock !== undefined) data.minStock = integer(body.minStock ?? 0, 'Estoque mínimo');
    if (body.active !== undefined) data.active = boolean(body.active, 'Status');
    return data;
  };
  const admin = user => { if (user.role !== 'ADMIN') throw new HttpError(403, 'Somente administradores podem gerenciar produtos.'); };

  return {
    async list(query = {}) {
      const { page, limit, skip } = pagination(query);
      const where = {};
      const active = queryBoolean(query.active, 'status');
      if (active !== undefined) where.active = active;
      if (query.q) {
        const q = text(query.q, 'Busca', { max: 120 });
        where.OR = ['name', 'description', 'category'].map(field => ({ [field]: { contains: q, mode: 'insensitive' } }));
      }
      if (query.category) where.category = text(query.category, 'Categoria', { max: 80 });
      const lowStock = queryBoolean(query.lowStock, 'estoque baixo');
      if (lowStock === true) {
        where.active = true;
        where.stock = { lte: prisma.product.fields.minStock };
      }
      if (lowStock === false) where.NOT = { active: true, stock: { lte: prisma.product.fields.minStock } };
      const [data, total] = await Promise.all([
        prisma.product.findMany({ where, skip, take: limit, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        prisma.product.count({ where }),
      ]);
      return { data: data.map(productDto), total, page, limit };
    },
    async categories() {
      const rows = await prisma.product.findMany({ select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
      return rows.map(row => row.category);
    },
    async get(id) {
      const product = await prisma.product.findUnique({ where: { id: objectId(id) } });
      if (!product) throw new HttpError(404, 'Produto não encontrado.');
      return productDto(product);
    },
    async create(body, user) {
      admin(user);
      return productDto(await prisma.product.create({ data: { ...validate(body), stock: 0 } }));
    },
    async update(id, body, user) {
      admin(user);
      return productDto(await prisma.product.update({ where: { id: objectId(id) }, data: validate(body, true) }));
    },
  };
}
