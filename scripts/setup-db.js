import 'dotenv/config';
import { MongoClient } from 'mongodb';

// Preparação aditiva: cria coleções/índices e preenche apenas campos ausentes.
// Nunca usa drop, reset, replace ou reescreve senhas e perfis existentes.
async function setup() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL no .env.');
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Use um MongoDB replica set ou Atlas: o estoque depende de transações.');
    const collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
    for (const name of ['User', 'Product', 'Movement', 'SystemState']) {
      if (!collections.has(name)) await db.createCollection(name);
    }
    const ensureIndex = async (collection, key, options = {}) => {
      const target = db.collection(collection);
      const existing = (await target.listIndexes().toArray()).find(index => JSON.stringify(index.key) === JSON.stringify(key));
      if (existing) {
        if (options.unique && !existing.unique) throw new Error(`O índice de ${collection} precisa ser único; revise os índices existentes antes de continuar.`);
        return;
      }
      await target.createIndex(key, options);
    };
    await ensureIndex('User', { email: 1 }, { unique: true });
    await ensureIndex('User', { role: 1, active: 1 });
    await ensureIndex('Product', { active: 1, category: 1 });
    await ensureIndex('Product', { name: 1 });
    await ensureIndex('Movement', { userId: 1, createdAt: 1 });
    await ensureIndex('Movement', { productId: 1, createdAt: 1 });
    await ensureIndex('Movement', { createdAt: 1 });
    const defaults = { role: 'USER', active: true, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() };
    for (const [field, value] of Object.entries(defaults)) {
      await db.collection('User').updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    }
    await db.collection('SystemState').updateOne({ _id: 'admin-guard' }, { $setOnInsert: { version: 0 } }, { upsert: true });
    console.log('Banco preparado. Contas existentes foram preservadas; contas sem perfil receberam USER.');
  } finally {
    await client.close();
  }
}

setup().catch(error => {
  // Erros do driver podem carregar host/credenciais. Não imprima a exceção completa.
  console.error(error.constructor === Error ? error.message : `Não foi possível preparar o banco (${error.code || error.name}). Verifique conexão e índices existentes.`);
  process.exitCode = 1;
});
