import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { prismaErrorDetails } from '../lib/prisma-diagnostics.js';

if (!process.env.DATABASE_URL) {
  console.error('Configure DATABASE_URL no .env antes de verificar a conexão.');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient({ errorFormat: 'minimal' });
  try {
    // Consulta somente leitura: $connect sozinho não confirma que é possível consultar.
    await prisma.user.findFirst({ select: { id: true } });
    console.log('MongoDB acessível: consulta Prisma à coleção User concluída. Nenhum dado foi alterado.');
  } catch (error) {
    console.error('Falha em prisma.user.findFirst({ select: { id: true } }):');
    console.error(JSON.stringify(prismaErrorDetails(error), null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
