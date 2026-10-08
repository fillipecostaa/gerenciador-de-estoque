import { prismaErrorDetails } from './prisma-diagnostics.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.statusCode = status;
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (process.env.PRISMA_DEBUG_ERRORS === '1' && process.env.NODE_ENV !== 'production'
      && /^P\d{4}$/.test(error.code || '')) {
    console.error('[Prisma]', JSON.stringify(prismaErrorDetails(error), null, 2));
  }
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Envie um JSON válido.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'A solicitação é muito grande.' });
  if (error.code === 'P2002') return res.status(409).json({ message: 'Este registro já existe.' });
  if (error.code === 'P2025') return res.status(404).json({ message: 'Registro não encontrado.' });
  if (['P2034', 'P2028'].includes(error.code)) return res.status(409).json({ message: 'Outro usuário alterou os dados. Atualize a página e tente novamente.' });
  if (error.code === 'P2031') return res.status(503).json({ message: 'O banco precisa de um replica set para registrar transações.' });
  if (['P1001', 'P1002', 'P1017'].includes(error.code)) return res.status(503).json({ message: 'Banco de dados indisponível. Tente novamente em instantes.' });
  // Não enviar mensagens do driver: podem conter consultas e dados sensíveis.
  console.error('Falha na solicitação:', error.code || error.name || 'UnknownError');
  return res.status(500).json({ message: 'Não foi possível concluir a operação. Tente novamente.' });
}
