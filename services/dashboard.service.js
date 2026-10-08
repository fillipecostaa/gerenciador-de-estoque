import { productDto } from './products.service.js';

export function createDashboardService({ prisma }) {
  return {
    async summary(user) {
      // A visão do saldo é compartilhada; números e histórico de movimentos respeitam o usuário.
      const movementScope = user.role === 'ADMIN' ? {} : { userId: user.id };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const lowStockWhere = { active: true, stock: { lte: prisma.product.fields.minStock } };
      const [activeProducts, lowStockProducts, totals, movementsLast24h, recentMovements, lowStockItems] = await Promise.all([
        prisma.product.count({ where: { active: true } }),
        prisma.product.count({ where: lowStockWhere }),
        prisma.product.aggregateRaw({ pipeline: [
          { $match: { active: true } },
          { $group: { _id: null, totalUnits: { $sum: '$stock' }, totalValueCents: { $sum: { $multiply: ['$stock', '$priceCents'] } } } },
        ] }),
        prisma.movement.count({ where: { ...movementScope, createdAt: { gte: since } } }),
        prisma.movement.findMany({ where: movementScope, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6 }),
        prisma.product.findMany({ where: lowStockWhere, orderBy: [{ stock: 'asc' }, { id: 'asc' }], take: 5 }),
      ]);
      return {
        summary: { activeProducts, lowStockProducts, totalUnits: totals[0]?.totalUnits || 0, totalValue: (totals[0]?.totalValueCents || 0) / 100, movementsLast24h },
        recentMovements,
        lowStockItems: lowStockItems.map(productDto),
      };
    },
  };
}
