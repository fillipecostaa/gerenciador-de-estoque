import { test, expect } from '@playwright/test';
import { mockSession } from './helpers.js';

test.beforeEach(async ({ page }) => { await mockSession(page); });

test('cadastro envia os campos esperados e redireciona para login', async ({ page }) => {
  let requestBody;
  await page.route('**/api/cadastro', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 'test-id', name: 'Ana Silva', email: 'ana@example.com' } });
  });
  await page.goto('/cadastro');
  await page.getByLabel('Nome', { exact: true }).fill('  Ana Silva  ');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toHaveText('Conta criada com sucesso! Agora é só entrar.');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('ana@example.com');
  expect(requestBody).toEqual({ name: 'Ana Silva', email: 'ana@example.com', password: 'senha-de-teste' });
});

test('senhas diferentes não enviam cadastro e erro de duplicidade aparece', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/cadastro', async (route) => {
    requests += 1;
    await route.fulfill({ status: 409, json: { error: 'Este e-mail já está cadastrado.' } });
  });
  await page.goto('/cadastro');
  await page.getByLabel('Nome', { exact: true }).fill('Ana');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('outra-senha');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByText('As senhas precisam ser iguais.')).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel('Confirmar senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('alert')).toHaveText('Este e-mail já está cadastrado.');
  expect(requests).toBe(1);
});

test('login aceita JWT em string e permite sair sem guardar senha', async ({ page }) => {
  await page.route('**/api/login', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: 'ana@example.com', password: 'senha-de-teste' });
    await route.fulfill({ status: 200, json: 'jwt-de-teste' });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
});

test('login mostra erro da API e permite tentar novamente', async ({ page }) => {
  await page.route('**/api/login', (route) => route.fulfill({ status: 401, json: { error: 'E-mail ou senha incorretos.' } }));
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
  await expect(page.getByRole('button', { name: 'Entrar na minha conta' })).toBeEnabled();
});

test('falha de conexão é informada sem deixar o formulário bloqueado', async ({ page }) => {
  await page.route('**/api/login', (route) => route.abort('connectionrefused'));
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível conectar ao servidor.');
  await expect(page.getByRole('button', { name: 'Entrar na minha conta' })).toBeEnabled();
});

test('envio em andamento bloqueia um segundo envio', async ({ page }) => {
  let completeRequest;
  const gate = new Promise((resolve) => { completeRequest = resolve; });
  let requests = 0;
  await page.route('**/api/login', async (route) => {
    requests += 1;
    await gate;
    await route.fulfill({ status: 200, json: 'jwt-de-teste' });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('button', { name: 'Aguarde…' })).toBeDisabled();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeDisabled();
  completeRequest();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('cadastro funciona em tela pequena e navega para login', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/cadastro');
  await expect(page.getByRole('button', { name: 'Criar minha conta' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Entre na sua conta', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('button', { name: 'Entrar na minha conta' })).toBeVisible();
});
