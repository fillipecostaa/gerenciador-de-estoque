import { HttpError } from "../lib/errors.js"
import { withTransactionRetry } from "../lib/transaction.js"
import { integer, objectBody, objectId, pagination, text } from "../lib/validation.js"

const MAX_STOCK = 1_000_000_000
const MOVEMENT_TYPES = ["IN", "OUT", "ADJUSTMENT"]
const movementSelect = {
  id: true,
  productId: true,
  userId: true,
  type: true,
  quantity: true,
  delta: true,
  reason: true,
  stockBefore: true,
  stockAfter: true,
  productName: true,
  userName: true,
  createdAt: true,
}

function requireUser(user) {
  if (!user?.id) throw new HttpError(401, "Entre na sua conta para continuar.")
  if (!user.active) throw new HttpError(403, "Sua conta está inativa.")
  if (!["USER", "ADMIN"].includes(user.role)) throw new HttpError(403, "Acesso não permitido.")
  return user
}

function requireAdmin(user) {
  requireUser(user)
  if (user.role !== "ADMIN") throw new HttpError(403, "Apenas administradores podem ajustar o estoque.")
}

function dateFilter(value, label, endOfDay = false) {
  const input = text(value, label, { min: 1, max: 40 })
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input)
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(input)
  if (!dateOnly && !timestamp) throw new HttpError(400, `${label} deve ser uma data válida no formato ISO.`)

  const date = new Date(dateOnly ? `${input}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : input)
  // Date normalizes dates such as February 30, so validate the calendar day separately.
  const calendarDay = new Date(`${input.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== input.slice(0, 10)) {
    throw new HttpError(400, `${label} deve ser uma data válida.`)
  }
  return date
}

async function currentUser(tx, user, adminOnly = false) {
  const actor = await tx.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, role: true, active: true },
  })
  requireUser(actor)
  if (adminOnly) requireAdmin(actor)
  return actor
}

async function activeProduct(tx, productId) {
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product) throw new HttpError(404, "Produto não encontrado.")
  if (!product.active) throw new HttpError(409, "Produtos inativos não podem receber movimentações.")
  return product
}

async function updateStockAndRecord(tx, product, actor, { type, quantity, delta, reason }) {
  const stockAfter = product.stock + delta
  if (!Number.isSafeInteger(stockAfter) || stockAfter < 0) {
    throw new HttpError(409, "Estoque insuficiente para esta saída.")
  }
  if (stockAfter > MAX_STOCK) throw new HttpError(409, "A movimentação excede o limite de estoque permitido.")

  // The conditional write locks this product within the transaction. MongoDB
  // aborts a competing stale transaction; withTransactionRetry then rereads it.
  const updated = await tx.product.updateMany({
    where: { id: product.id, active: true, stock: product.stock },
    data: { stock: stockAfter },
  })
  if (updated.count !== 1) throw new HttpError(409, "O estoque foi alterado. Atualize os dados e tente novamente.")

  return tx.movement.create({
    data: {
      productId: product.id,
      userId: actor.id,
      type,
      quantity,
      delta,
      reason,
      stockBefore: product.stock,
      stockAfter,
      productName: product.name,
      userName: actor.name,
    },
    select: movementSelect,
  })
}

export function createMovementService({ prisma }) {
  return {
    async list(query = {}, user) {
      requireUser(user)
      objectBody(query, ["page", "limit", "type", "productId", "dateFrom", "dateTo", "q", "userId"])
      const { page, limit, skip } = pagination(query)
      const where = user.role === "ADMIN" ? {} : { userId: user.id }

      if (query.userId !== undefined) {
        if (user.role !== "ADMIN") throw new HttpError(403, "Apenas administradores podem filtrar por usuário.")
        where.userId = objectId(query.userId, "Usuário")
      }
      if (query.productId !== undefined) where.productId = objectId(query.productId, "Produto")
      if (query.type !== undefined) {
        if (!MOVEMENT_TYPES.includes(query.type)) throw new HttpError(400, "Tipo de movimentação inválido.")
        where.type = query.type
      }
      if (query.q !== undefined) {
        const search = text(query.q, "Busca", { min: 1, max: 120 })
        where.OR = ["productName", "userName", "reason"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } }))
      }
      if (query.dateFrom !== undefined || query.dateTo !== undefined) {
        const gte = query.dateFrom === undefined ? undefined : dateFilter(query.dateFrom, "Data inicial")
        const lte = query.dateTo === undefined ? undefined : dateFilter(query.dateTo, "Data final", true)
        if (gte && lte && gte > lte) throw new HttpError(400, "A data inicial não pode ser posterior à data final.")
        where.createdAt = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
      }

      const [data, total] = await prisma.$transaction([
        prisma.movement.findMany({ where, select: movementSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: limit }),
        prisma.movement.count({ where }),
      ])
      return { data, total, page, limit }
    },

    async create(body, user) {
      requireUser(user)
      objectBody(body, ["productId", "type", "quantity", "reason"])
      const productId = objectId(body.productId, "Produto")
      if (!["IN", "OUT"].includes(body.type)) throw new HttpError(400, "Informe uma entrada (IN) ou saída (OUT).")
      const quantity = integer(body.quantity, "Quantidade", { min: 1, max: MAX_STOCK })
      const reason = text(body.reason, "Motivo", { min: 3, max: 500 })
      const type = body.type
      const delta = type === "IN" ? quantity : -quantity

      return withTransactionRetry(prisma, async (tx) => {
        const actor = await currentUser(tx, user)
        const product = await activeProduct(tx, productId)
        return updateStockAndRecord(tx, product, actor, { type, quantity, delta, reason })
      })
    },

    async adjust(productId, body, user) {
      requireAdmin(user)
      const id = objectId(productId, "Produto")
      objectBody(body, ["stock", "reason"])
      const stock = integer(body.stock, "Estoque", { min: 0, max: MAX_STOCK })
      const reason = text(body.reason, "Justificativa", { min: 5, max: 500 })

      return withTransactionRetry(prisma, async (tx) => {
        const actor = await currentUser(tx, user, true)
        const product = await activeProduct(tx, id)
        const delta = stock - product.stock
        if (delta === 0) throw new HttpError(400, "Informe um estoque diferente do saldo atual.")
        return updateStockAndRecord(tx, product, actor, { type: "ADJUSTMENT", quantity: Math.abs(delta), delta, reason })
      })
    },
  }
}
