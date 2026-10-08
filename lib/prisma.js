import { PrismaClient } from '@prisma/client';

// Evita incluir trechos do código e argumentos da consulta nas mensagens de erro.
export const prisma = new PrismaClient({ errorFormat: 'minimal' });
export default prisma;
