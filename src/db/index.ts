import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const isPostgresConfigured = (): boolean => {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
};

export const isPostgresRequired = (): boolean => {
  return process.env.REQUIRE_POSTGRES === 'true';
};

export function resolvePostgresSslConfig(): PoolConfig['ssl'] {
  if (process.env.SQL_SSL !== 'true') {
    return undefined;
  }
  return {
    rejectUnauthorized: process.env.SQL_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export const createPool = (): Pool => {
  if (!global._postgresPool) {
    const parsedPort = process.env.SQL_PORT ? Number.parseInt(process.env.SQL_PORT, 10) : 5432;
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: Number.isFinite(parsedPort) ? parsedPort : 5432,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: resolvePostgresSslConfig(),
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const closePool = async (): Promise<void> => {
  if (global._postgresPool) {
    const poolToClose = global._postgresPool;
    global._postgresPool = undefined;
    await poolToClose.end();
  }
};

const pool = createPool();

export const db = drizzle(pool, { schema });
