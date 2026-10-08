import { createUsersService } from '../services/users.service.js';

export function createUsersController(dependencies) {
  const service = createUsersService(dependencies);
  return {
    list: async (req, res) => res.json(await service.listUsers(req.query)),
    update: async (req, res) => res.json(await service.updateUser(req.user, req.params.id, req.body)),
  };
}
