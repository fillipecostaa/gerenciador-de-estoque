import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

export function createPublicRoutes(dependencies) {
  const router = Router();
  const controller = createAuthController(dependencies);
  router.post('/cadastro', controller.register);
  router.post('/login', controller.login);
  return router;
}
