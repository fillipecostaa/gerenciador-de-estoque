import { createAuthService, safeUser } from '../services/auth.service.js';

export function createAuthController(dependencies) {
  const service = createAuthService(dependencies);
  return {
    register: async (req, res) => res.status(201).json(await service.register(req.body)),
    login: async (req, res) => res.json(await service.login(req.body)),
    me: (req, res) => res.json(safeUser(req.user)),
    logout: async (req, res) => {
      await service.logout(req.user.id);
      res.status(204).end();
    },
  };
}
