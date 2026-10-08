import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicRoutes } from './routes/public.js';
import { createAccountRoutes } from './routes/account.js';
import { createProductRoutes } from './routes/products.js';
import { createMovementRoutes } from './routes/movements.js';
import { createUserRoutes } from './routes/users.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createAuth, requireRole } from './middlewares/auth.js';
import { createUsersService } from './services/users.service.js';
import { errorHandler } from './lib/errors.js';

export function createApp({ prisma, jwtSecret, serveFrontend = true }) {
  if (!prisma || !jwtSecret) throw new Error('Configure DATABASE_URL e JWT_SECRET antes de iniciar.');
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const auth = createAuth({ prisma, jwtSecret });
  app.use('/api', createPublicRoutes({ prisma, jwtSecret }));
  // Esta barreira protege todas as rotas de negócio, inclusive métodos não implementados.
  app.use('/api', auth);
  app.use('/api/auth', createAccountRoutes({ prisma }));
  app.use('/api/produtos', createProductRoutes({ prisma }));
  app.use('/api/movimentacoes', createMovementRoutes({ prisma }));
  app.use('/api/usuarios', createUserRoutes({ prisma }));
  app.use('/api/dashboard', createDashboardRoutes({ prisma }));
  const listUsers = async (req, res) => res.json(await createUsersService({ prisma }).listUsers(req.query));
  app.get('/api/listar-usuarios', requireRole('ADMIN'), listUsers);
  app.use('/api', (req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));

  // Compatibilidade com o login original. A listagem antiga agora exige ADMIN.
  app.use('/', createPublicRoutes({ prisma, jwtSecret }));
  app.get('/listar-usuarios', auth, requireRole('ADMIN'), listUsers);
  if (serveFrontend) {
    const dist = fileURLToPath(new URL('./frontend/dist/', import.meta.url));
    const index = fileURLToPath(new URL('./frontend/dist/index.html', import.meta.url));
    app.use(express.static(dist));
    app.get(['/', '/login', '/cadastro', '/dashboard', '/produtos', '/movimentacoes', '/usuarios'], (req, res) => {
      if (!existsSync(index)) return res.status(503).type('text').send('Execute npm run dev e acesse http://localhost:5173, ou execute npm run build e npm start.');
      res.sendFile(index);
    });
  }
  app.use((req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  app.use(errorHandler);
  return app;
}
