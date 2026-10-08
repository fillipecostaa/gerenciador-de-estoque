import { Router } from "express"
import { createMovementController } from "../controllers/movements.controller.js"
import { createMovementService } from "../services/movements.service.js"

export function createMovementRoutes({ prisma }) {
  const router = Router()
  const controller = createMovementController({ service: createMovementService({ prisma }) })
  router.get("/", controller.list)
  router.post("/", controller.create)
  return router
}
