import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

// Este router deve ser montado depois de createAuth, sob /api/auth.
export function createAccountRoutes(dependencies) {
  const router = Router();
  const controller = createAuthController(dependencies);
  router.get('/me', controller.me);
  router.post('/logout', controller.logout);
  return router;
}
