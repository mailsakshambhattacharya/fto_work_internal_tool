import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { schema } from './schema.js';

export async function connectLocal(path) {
  await mkdir(dirname(path), { recursive: true });
  const db = new PGlite(path);
  await db.exec(schema);
  return db;
}
