import { test, expect } from '@playwright/test';
import { authenticatedPage, testUser } from './helpers.js';

const product = { id: '507f1f77bcf86cd799439012', name: 'Teclado', description: 'Teclado USB', category: 'Periféricos', price: 19.99, stock: 12, minStock: 3, active: true, lowStock: false };

async function productsApi(page, handleWrite) {
  await page.route('**/api/produtos**', async route => {
    if (route.request().method() !== 'GET') return handleWrite ? handleWrite(route) : route.abort();
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/categorias') ? ['Periféricos'] : { data: [product], total: 1, page: 1, limit: 20 } });
  });
}

test('USER consulta produtos e não acessa a página administrativa', async ({ page }) => {
  await authenticatedPage(page);
  await productsApi(page);
  let userRequests = 0;
  await page.route('**/api/usuarios**', route => { userRequests++; return route.abort(); });
  await page.goto('/produtos');
  await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Teclado USB/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cadastrar produto', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar Teclado' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Usuários', exact: true })).toHaveCount(0);
  await page.goto('/usuarios');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(userRequests).toBe(0);
});

test('ADMIN cadastra produto sem enviar saldo e confirma desativação', async ({ page }) => {
  await authenticatedPage(page, 'ADMIN');
  const requests = [];
  await productsApi(page, route => {
    requests.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: product });
  });
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Cadastrar produto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do produto').fill('Mouse');
  await dialog.getByLabel('Categoria', { exact: true }).fill('Periféricos');
  await dialog.getByLabel('Preço (R$)', { exact: true }).fill('25.50');
  await dialog.getByLabel('Estoque mínimo').fill('4');
  await dialog.getByLabel('Descrição').fill('Mouse USB');
  await dialog.getByRole('button', { name: 'Cadastrar produto', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[0]).toEqual({ method: 'POST', body: { name: 'Mouse', category: 'Periféricos', description: 'Mouse USB', price: 25.5, minStock: 4 } });
  await page.getByRole('button', { name: 'Desativar Teclado' }).click();
  expect(requests).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Confirmar desativação' }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[1]).toEqual({ method: 'PATCH', body: { active: false } });
});

test('ADMIN gerencia perfil com confirmação e protege a própria conta', async ({ page }) => {
  const admin = await authenticatedPage(page, 'ADMIN');
  const other = { ...testUser, id: '507f1f77bcf86cd799439099', name: 'Bruno', email: 'bruno@example.com' };
  const updates = [];
  await page.route('**/api/usuarios**', route => {
    if (route.request().method() === 'PATCH') {
      updates.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...other, ...updates.at(-1) } });
    }
    return route.fulfill({ json: { data: [admin, other], total: 2, page: 1, limit: 20 } });
  });
  await page.goto('/usuarios');
  await expect(page.getByRole('button', { name: `Desativar ${admin.name}` })).toBeDisabled();
  await page.getByRole('button', { name: `Editar ${admin.name}` }).click();
  await expect(page.getByRole('dialog').getByLabel('Perfil', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Bruno' }).click();
  await page.getByRole('dialog').getByLabel('Perfil', { exact: true }).selectOption('ADMIN');
  await page.getByRole('button', { name: 'Revisar alteração' }).click();
  expect(updates).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar alteração', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(updates).toEqual([{ role: 'ADMIN' }]);
});

test('movimentações carregam, enviam apenas campos permitidos e exibem erro de saldo', async ({ page }) => {
  await authenticatedPage(page);
  await productsApi(page);
  let body;
  await page.route('**/api/movimentacoes**', route => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: { message: 'Estoque insuficiente para esta saída.' } });
    }
    return route.fulfill({ json: { data: [], total: 0, page: 1, limit: 20 } });
  });
  await page.goto('/movimentacoes');
  await expect(page.getByRole('heading', { name: 'Movimentações', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar movimentação', exact: true }).click();
  await page.getByRole('button', { name: /Teclado.*Estoque/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tipo', { exact: true }).selectOption('OUT');
  await dialog.getByLabel('Quantidade').fill('20');
  await dialog.getByLabel('Motivo', { exact: true }).fill('Saída para entrega');
  await dialog.getByRole('button', { name: 'Revisar movimentação' }).click();
  expect(body).toBeUndefined();
  await dialog.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Estoque insuficiente para esta saída.');
  expect(body).toEqual({ productId: product.id, type: 'OUT', quantity: 20, reason: 'Saída para entrega' });
});

test('rota de produtos é utilizável em celular e permite repetir uma consulta que falhou', async ({ page }) => {
  await authenticatedPage(page);
  await page.setViewportSize({ width: 375, height: 812 });
  let unavailable = true;
  await page.route('**/api/produtos**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/categorias')) return route.fulfill({ json: [] });
    return unavailable ? route.fulfill({ status: 503, json: { message: 'Serviço indisponível.' } }) : route.fulfill({ json: { data: [product], total: 1, page: 1, limit: 20 } });
  });
  await page.goto('/produtos');
  await expect(page.getByRole('alert')).toHaveText('Serviço indisponível.');
  unavailable = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Teclado USB/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
