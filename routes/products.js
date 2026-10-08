import { Router } from 'express';
import { requireRole } from '../middlewares/auth.js';
import { createProductService } from '../services/products.service.js';
import { createMovementService } from '../services/movements.service.js';
import { createProductController } from '../controllers/products.controller.js';

export function createProductRoutes({ prisma }) {
  const router = Router();
  const controller = createProductController(createProductService({ prisma }), createMovementService({ prisma }));
  router.get('/', controller.list);
  router.get('/categorias', controller.categories);
  router.get('/:id', controller.get);
  router.post('/', requireRole('ADMIN'), controller.create);
  router.patch('/:id', requireRole('ADMIN'), controller.update);
  router.post('/:id/ajuste', requireRole('ADMIN'), controller.adjust);
  return router;
}
