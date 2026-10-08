import { Router } from 'express';
import { requireRole } from '../middlewares/auth.js';
import { createUsersController } from '../controllers/users.controller.js';

// Montar depois de createAuth, sob /api/usuarios.
export function createUserRoutes(dependencies) {
  const router = Router();
  const controller = createUsersController(dependencies);
  router.use(requireRole('ADMIN'));
  router.get('/', controller.list);
  router.patch('/:id', controller.update);
  return router;
}
