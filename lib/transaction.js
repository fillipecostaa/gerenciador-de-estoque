import { setTimeout as delay } from 'node:timers/promises';

// MongoDB aborta um dos escritores quando há conflito no mesmo documento.
// Reexecutar a transação inteira faz as validações usarem o saldo mais recente.
export async function withTransactionRetry(prisma, callback, attempts = 6) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error.code !== 'P2034' || attempt >= attempts - 1) throw error;
      await delay(15 * 2 ** attempt + Math.floor(Math.random() * 20));
    }
  }
}
