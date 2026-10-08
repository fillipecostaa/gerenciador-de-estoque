import { test, expect } from '@playwright/test';
import { mockSession } from './helpers.js';

test.beforeEach(async ({ page }) => {
  // Nenhum teste pode enviar credenciais ao banco real.
  await mockSession(page);
});

async function fillRegistration(page, email = 'nova@example.com') {
  await page.getByLabel('Nome', { exact: true }).fill('Nova Pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha123');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha123');
}

async function allowRender(page) {
  // Espera a resposta processada chegar ao React antes das verificações negativas.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

test('sair encerra a sessão anterior e permite cadastrar uma nova conta', async ({ page }) => {
  await page.route('**/api/login', (route) => route.fulfill({ json: 'jwt-conta-anterior' }));
  await page.route('**/api/cadastro', (route) => route.fulfill({
    status: 201,
    json: { id: 'nova-conta', name: 'Nova Pessoa', email: 'nova@example.com' },
  }));

  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('anterior@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha123');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/login');

  await page.getByRole('link', { name: 'Cadastre-se' }).click();
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Criar minha conta' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toContainText('Conta criada com sucesso!');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('nova@example.com');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Entrar na minha conta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);
});

test('resposta de login abandonado não cria uma sessão em outra página', async ({ page }) => {
  let pendingRoute;
  const intercepted = new Promise((resolve) => { pendingRoute = resolve; });
  await page.route('**/api/login', (route) => pendingRoute(route));

  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('anterior@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha123');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  const route = await intercepted;
  await page.getByRole('link', { name: 'Cadastre-se' }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toBeVisible();

  const received = page.waitForResponse('**/api/login');
  await route.fulfill({ json: 'jwt-resposta-atrasada' });
  await (await received).finished();
  await allowRender(page);
  await expect(page).toHaveURL('/cadastro');
  await page.getByRole('link', { name: 'Entre na sua conta', exact: true }).click();

  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Entrar na minha conta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);
});

test('resposta de cadastro abandonado não redireciona o novo formulário', async ({ page }) => {
  let pendingRoute;
  const intercepted = new Promise((resolve) => { pendingRoute = resolve; });
  await page.route('**/api/cadastro', (route) => pendingRoute(route));

  await page.goto('/cadastro');
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  const route = await intercepted;
  await page.getByRole('link', { name: 'Entre na sua conta', exact: true }).click();
  await page.getByRole('link', { name: 'Cadastre-se' }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('');

  const received = page.waitForResponse('**/api/cadastro');
  await route.fulfill({
    status: 201,
    json: { id: 'nova-conta', name: 'Nova Pessoa', email: 'nova@example.com' },
  });
  await (await received).finished();
  await allowRender(page);

  await expect(page).toHaveURL('/cadastro');
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Criar minha conta' })).toBeEnabled();
});
