import { createHandler } from '../server/handler.js';
import { connectPostgres } from '../server/postgres.js';
import { initializeDatabase } from '../server/schema.js';

let database;

async function openDatabase() {
  const connection = connectPostgres();
  try {
    await initializeDatabase(connection);
    return connection;
  } catch (error) {
    await connection.close().catch(() => {});
    throw error;
  }
}

export default createHandler({
  getDb: () => database ??= openDatabase().catch((error) => {
    database = undefined;
    throw error;
  })
});
