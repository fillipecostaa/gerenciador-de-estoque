export const testUser = { id: '507f1f77bcf86cd799439011', name: 'Ana Silva', email: 'ana@example.com', role: 'USER', active: true };
export const testDashboard = { summary: { activeProducts: 1, lowStockProducts: 0, totalUnits: 12, totalValue: 239.88, movementsLast24h: 0 }, recentMovements: [], lowStockItems: [] };

export async function mockSession(page, user = testUser) {
  await page.route('**/api/**', route => route.abort());
  await page.route('**/api/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/api/dashboard', route => route.fulfill({ json: testDashboard }));
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }));
}

export async function authenticatedPage(page, role = 'USER') {
  const user = { ...testUser, role };
  await mockSession(page, user);
  await page.addInitScript(() => sessionStorage.setItem('gerenciamento.token', 'jwt-de-teste'));
  return user;
}
