export function createProductController(service, movements) {
  return {
    list: async (req, res) => res.json(await service.list(req.query)),
    categories: async (req, res) => res.json(await service.categories()),
    get: async (req, res) => res.json(await service.get(req.params.id)),
    create: async (req, res) => res.status(201).json(await service.create(req.body, req.user)),
    update: async (req, res) => res.json(await service.update(req.params.id, req.body, req.user)),
    adjust: async (req, res) => res.status(201).json(await movements.adjust(req.params.id, req.body, req.user)),
  };
}
