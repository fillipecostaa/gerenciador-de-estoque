import 'dotenv/config';
import { createApp } from './app.js';
import prisma from './lib/prisma.js';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET?.trim()) {
  console.error('Defina DATABASE_URL e JWT_SECRET no arquivo .env. Consulte o README.');
  process.exitCode = 1;
} else {
  const app = createApp({ prisma, jwtSecret: process.env.JWT_SECRET });
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, () => console.log(`Gerenciamento disponível em http://localhost:${port}`));
  server.on('error', () => {
    console.error('Não foi possível iniciar o servidor. Verifique a porta configurada.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    }));
  }
}
