import pg from 'pg';

export function connectPostgres(env = process.env) {
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  if (!connectionString) throw new Error('Configure DATABASE_URL for the registry.');
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 8000 });
  pool.on('error', (error) => console.error('Schooldesk database connection error', error.code));
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(run) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await run(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}
