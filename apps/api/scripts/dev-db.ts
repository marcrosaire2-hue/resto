/**
 * MongoDB local pour le développement, sans Docker : un replica set d'un nœud (requis pour les transactions),
 * données persistées dans apps/api/.dev-db. En production, utiliser MongoDB Atlas ou infra/docker-compose.yml.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const dbPath = resolve(__dirname, '../.dev-db');
  mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: 27017, dbPath }],
  });
  console.log(`MongoDB (replica set rs0) prêt : mongodb://127.0.0.1:27017/plateforme?replicaSet=rs0`);
  console.log(`Données : ${dbPath} — Ctrl+C pour arrêter.`);
  const stop = async () => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
