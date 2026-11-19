import { connectPostgres } from '../server/postgres.js';
import { initializeDatabase } from '../server/schema.js';

const db = connectPostgres();
try {
  await initializeDatabase(db);
  console.log('Schooldesk database is ready.');
} finally {
  await db.close();
}
