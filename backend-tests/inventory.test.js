import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { MongoClient } from "mongodb"
import { MongoMemoryReplSet } from "mongodb-memory-server"
import { createMovementService } from "../services/movements.service.js"

let replicaSet
let prisma
let service
let admin
let operator
let otherOperator

before(async () => {
  // Always use an isolated replica set: never import the application's DB client
  // or fall back to DATABASE_URL, even when a local MongoDB is available.
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } })
  const url = replicaSet.getUri("inventory_tests")
  const mongo = new MongoClient(url)
  try {
    await mongo.connect()
    const db = mongo.db()
    await Promise.all(["User", "Product", "Movement"].map((name) => db.createCollection(name)))
    await db.collection("User").createIndex({ email: 1 }, { unique: true })
  } finally {
    await mongo.close()
  }
  prisma = new PrismaClient({ datasources: { db: { url } } })
  await prisma.$connect()
  service = createMovementService({ prisma })
}, { timeout: 900_000 })

after(async () => {
  await prisma?.$disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await prisma.movement.deleteMany()
  await prisma.product.deleteMany()
  await prisma.user.deleteMany()
  const actors = await Promise.all([
    ["admin", "ADMIN"], ["operator", "USER"], ["other", "USER"],
  ].map(([name, role]) => prisma.user.create({
    data: { name, email: `${name}@inventory.test`, password: "not-used-by-these-tests", role, active: true },
  })))
  ;[admin, operator, otherOperator] = actors
})

function product(stock = 0, extras = {}) {
  return prisma.product.create({
    data: { name: "Teclado", description: "Teclado de teste", category: "Periféricos", priceCents: 15990, stock, minStock: 2, active: true, ...extras },
  })
}

function movement(productId, type, quantity, reason = "Movimentação de teste") {
  return { productId, type, quantity, reason }
}

function status(expected) {
  return (error) => {
    assert.equal(error.status, expected)
    return true
  }
}

test("entry and withdrawal keep audit snapshots and stock in sync", async () => {
  const item = await product(5)
  const incoming = await service.create(movement(item.id, "IN", 3), operator)
  assert.equal(incoming.type, "IN")
  assert.equal(incoming.delta, 3)
  assert.equal(incoming.stockBefore, 5)
  assert.equal(incoming.stockAfter, 8)
  assert.equal(incoming.productName, item.name)
  assert.equal(incoming.userName, operator.name)
  assert.equal(incoming.userId, operator.id)

  const outgoing = await service.create(movement(item.id, "OUT", 8), admin)
  assert.equal(outgoing.delta, -8)
  assert.equal(outgoing.stockBefore, 8)
  assert.equal(outgoing.stockAfter, 0)
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 0)
  assert.equal(await prisma.movement.count(), 2)

  await prisma.product.update({ where: { id: item.id }, data: { name: "Novo nome" } })
  await prisma.user.update({ where: { id: operator.id }, data: { name: "Outro nome" } })
  const history = await service.list({}, admin)
  const saved = history.data.find((entry) => entry.id === incoming.id)
  assert.equal(saved.productName, "Teclado")
  assert.equal(saved.userName, "operator")
})

test("concurrent withdrawals cannot oversell or leave a rejected audit record", async () => {
  const item = await product(5)
  const outcomes = await Promise.allSettled([
    service.create(movement(item.id, "OUT", 4), operator),
    service.create(movement(item.id, "OUT", 4), otherOperator),
  ])
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1)
  const rejected = outcomes.find((result) => result.status === "rejected")
  assert.equal(rejected.reason.status, 409)
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 1)
  const records = await prisma.movement.findMany()
  assert.equal(records.length, 1)
  assert.equal(records[0].stockBefore, 5)
  assert.equal(records[0].stockAfter, 1)
})

test("parallel entries do not lose increments and audit balances form a chain", async () => {
  const item = await product()
  await Promise.all(Array.from({ length: 4 }, () => service.create(movement(item.id, "IN", 3), operator)))
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 12)
  const records = await prisma.movement.findMany({ orderBy: { stockBefore: "asc" } })
  assert.deepEqual(records.map(({ stockBefore, stockAfter }) => [stockBefore, stockAfter]), [[0, 3], [3, 6], [6, 9], [9, 12]])
})

test("failure to insert audit rolls the stock update back in a real transaction", async () => {
  const item = await product(9)
  const brokenService = createMovementService({
    prisma: {
      $transaction(callback, options) {
        return prisma.$transaction((tx) => callback(new Proxy(tx, {
          get(target, property) {
            if (property === "movement") return { create: async () => { throw new Error("simulated audit failure") } }
            return Reflect.get(target, property)
          },
        })), options)
      },
    },
  })
  await assert.rejects(brokenService.create(movement(item.id, "OUT", 4), operator), /simulated audit failure/)
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 9)
  assert.equal(await prisma.movement.count(), 0)
})

test("insufficient stock and overflow leave stock and audit untouched", async () => {
  const empty = await product()
  const full = await product(1_000_000_000)
  await assert.rejects(service.create(movement(empty.id, "OUT", 1), operator), status(409))
  await assert.rejects(service.create(movement(full.id, "IN", 1), operator), status(409))
  assert.equal((await prisma.product.findUnique({ where: { id: empty.id } })).stock, 0)
  assert.equal((await prisma.product.findUnique({ where: { id: full.id } })).stock, 1_000_000_000)
  assert.equal(await prisma.movement.count(), 0)
})

test("admin adjustment records the target balance and rejects a zero change", async () => {
  const item = await product(9)
  const result = await service.adjust(item.id, { stock: 2, reason: "Contagem física conferida" }, admin)
  assert.equal(result.type, "ADJUSTMENT")
  assert.equal(result.quantity, 7)
  assert.equal(result.delta, -7)
  assert.equal(result.stockBefore, 9)
  assert.equal(result.stockAfter, 2)
  await assert.rejects(service.adjust(item.id, { stock: 2, reason: "Sem mudança de saldo" }, admin), status(400))
  assert.equal(await prisma.movement.count(), 1)
})

test("non-admin and stale admin permissions cannot authorize adjustments", async () => {
  const item = await product(9)
  await assert.rejects(service.adjust(item.id, { stock: 4, reason: "Ajuste não autorizado" }, operator), status(403))
  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } })
  await assert.rejects(service.adjust(item.id, { stock: 4, reason: "Permissão já revogada" }, admin), status(403))
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 9)
  assert.equal(await prisma.movement.count(), 0)
})

test("inactive products and users cannot mutate inventory", async () => {
  const inactive = await product(5, { active: false })
  await assert.rejects(service.create(movement(inactive.id, "IN", 1), operator), status(409))
  await assert.rejects(service.adjust(inactive.id, { stock: 2, reason: "Contagem de inativo" }, admin), status(409))
  const active = await product(5)
  await prisma.user.update({ where: { id: operator.id }, data: { active: false } })
  await assert.rejects(service.create(movement(active.id, "OUT", 1), operator), status(403))
  assert.equal((await prisma.product.findUnique({ where: { id: active.id } })).stock, 5)
  assert.equal(await prisma.movement.count(), 0)
})

test("deactivation after the transaction reads a product prevents a stale movement", async () => {
  const item = await product(5)
  let deactivateOnce = true
  const racingService = createMovementService({
    prisma: {
      $transaction(callback, options) {
        return prisma.$transaction((tx) => callback(new Proxy(tx, {
          get(target, property) {
            if (property !== "product") return Reflect.get(target, property)
            return new Proxy(target.product, {
              get(model, method) {
                if (method !== "findUnique") return Reflect.get(model, method)
                return async (query) => {
                  const snapshot = await model.findUnique(query)
                  if (deactivateOnce) {
                    deactivateOnce = false
                    await prisma.product.update({ where: { id: item.id }, data: { active: false } })
                  }
                  return snapshot
                }
              },
            })
          },
        })), options)
      },
    },
  })
  await assert.rejects(racingService.create(movement(item.id, "OUT", 1), operator), status(409))
  const saved = await prisma.product.findUnique({ where: { id: item.id } })
  assert.equal(saved.active, false)
  assert.equal(saved.stock, 5)
  assert.equal(await prisma.movement.count(), 0)
})

test("request validation rejects forged actors, adjustments, and invalid quantities", async () => {
  const item = await product(5)
  for (const quantity of [0, -1, 1.5, "2", 1_000_000_001]) {
    await assert.rejects(service.create(movement(item.id, "IN", quantity), operator), status(400))
  }
  await assert.rejects(service.create({ ...movement(item.id, "IN", 2), userId: admin.id }, operator), status(400))
  await assert.rejects(service.create(movement(item.id, "ADJUSTMENT", 2), operator), status(400))
  await assert.rejects(service.create(movement(item.id, "IN", 2, "  "), operator), status(400))
  await assert.rejects(service.adjust(item.id, { stock: -1, reason: "Contagem conferida" }, admin), status(400))
  await assert.rejects(service.adjust(item.id, { stock: 1, reason: "abcd" }, admin), status(400))
  assert.equal((await prisma.product.findUnique({ where: { id: item.id } })).stock, 5)
  assert.equal(await prisma.movement.count(), 0)
})

test("USER history is scoped to its actor and cannot filter another user", async () => {
  const item = await product(5)
  await service.create(movement(item.id, "IN", 2), operator)
  await service.create(movement(item.id, "OUT", 1), otherOperator)
  const own = await service.list({}, operator)
  assert.equal(own.total, 1)
  assert.ok(own.data.every((entry) => entry.userId === operator.id))
  await assert.rejects(service.list({ userId: otherOperator.id }, operator), status(403))
  const all = await service.list({}, admin)
  assert.equal(all.total, 2)
  const filtered = await service.list({ userId: otherOperator.id }, admin)
  assert.equal(filtered.total, 1)
  assert.equal(filtered.data[0].userId, otherOperator.id)
})

test("history combines search, date, type, product and pagination filters", async () => {
  const item = await product(5)
  await service.create(movement(item.id, "IN", 3, "Compra conferida"), operator)
  await service.create(movement(item.id, "OUT", 1, "Venda entregue"), operator)
  await service.create(movement(item.id, "IN", 2, "Compra adicional"), operator)
  const day = new Date().toISOString().slice(0, 10)
  const filtered = await service.list({ productId: item.id, type: "IN", q: "compra", dateFrom: day, dateTo: day, page: "2", limit: "1" }, admin)
  assert.equal(filtered.total, 2)
  assert.equal(filtered.page, 2)
  assert.equal(filtered.limit, 1)
  assert.equal(filtered.data.length, 1)
  assert.equal(filtered.data[0].type, "IN")
  await assert.rejects(service.list({ dateFrom: "2026-02-30" }, admin), status(400))
  await assert.rejects(service.list({ dateFrom: "2026-03-01", dateTo: "2026-02-01" }, admin), status(400))
  await assert.rejects(service.list({ type: "UNKNOWN" }, admin), status(400))
})
