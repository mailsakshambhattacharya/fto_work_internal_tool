import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'schooldesk-local-api',
    async configureServer(server) {
      const env = { ...loadEnv(mode, process.cwd(), ''), NODE_ENV: 'development' };
      const { createHandler } = await import('./server/handler.js');
      const hasDatabase = Boolean(env.DATABASE_URL || env.POSTGRES_URL);
      const localAccess = !hasDatabase && !env.APP_PASSWORD && !env.APP_SESSION_SECRET;
      const dataPath = resolve(env.SCHOOLDESK_LOCAL_DATA || '.data/local');
      let database;
      const getDb = () => database ??= (hasDatabase
        ? import('./server/postgres.js').then(({ connectPostgres }) => connectPostgres(env))
        : import('./server/local.js').then(({ connectLocal }) => connectLocal(dataPath)));
      const handler = createHandler({ getDb, env: localAccess ? { ...env, ALLOW_EXTERNAL_AI: 'false' } : env, localAccess });
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/api/registry') return void handler(req, res);
        next();
      });
      server.httpServer?.once('close', () => { void database?.then((db) => db.close()).catch(() => {}); });
    }
  }]
}));
