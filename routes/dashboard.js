import { Router } from 'express';
import { createDashboardController } from '../controllers/dashboard.controller.js';
import { createDashboardService } from '../services/dashboard.service.js';

export function createDashboardRoutes({ prisma }) {
  const router = Router();
  router.get('/', createDashboardController(createDashboardService({ prisma })).summary);
  return router;
}
