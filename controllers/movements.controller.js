export function createMovementController({ service }) {
  return {
    async list(req, res) {
      res.status(200).json(await service.list(req.query, req.user))
    },
    async create(req, res) {
      res.status(201).json(await service.create(req.body, req.user))
    },
  }
}
