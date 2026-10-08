export function createDashboardController(service) {
  return { summary: async (req, res) => res.json(await service.summary(req.user)) };
}
