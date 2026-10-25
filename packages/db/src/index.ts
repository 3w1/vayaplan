import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import {
  assertTestDatabaseAllowed,
  isTestExecution,
  isMutationQuery,
  isAuthorizedTestDatabase,
  extractDatabaseName,
} from './safety-guard';

export {
  assertTestDatabaseAllowed,
  isTestExecution,
  isMutationQuery,
  isAuthorizedTestDatabase,
  extractDatabaseName,
};

// Retornar columnas tipo DATE (OID 1082) como string 'YYYY-MM-DD' sin conversión a Date local
types.setTypeParser(1082, (val: string) => val);

let poolInstance: Pool | null = null;
let currentPoolConnectionString = '';

/**
 * Obtiene o inicializa la instancia singleton del Pool de PostgreSQL
 */
export function getDbPool(): Pool {
  if (!poolInstance) {
    const isProduction = (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const isTest = isTestExecution();
    const testDbUrl = process.env.TEST_DATABASE_URL?.trim();
    const dbUrl = process.env.DATABASE_URL?.trim();

    let connectionString = testDbUrl || dbUrl;

    if (isTest) {
      if (!connectionString) {
        throw new Error(
          '[DATABASE_SAFETY_GUARD] Aborted: Explicit test database configuration is missing. In test mode, you must explicitly set TEST_DATABASE_URL or a DATABASE_URL pointing to an authorized test database (e.g. "vayaplan_test").'
        );
      }
      // Protección estricta: bloquea la inicialización si se intenta conectar a producción en tests
      assertTestDatabaseAllowed(connectionString);
    } else {
      if (isProduction && !connectionString) {
        throw new Error('DATABASE_URL is required in production');
      }

      if (!connectionString) {
        connectionString = `postgresql://${process.env.POSTGRES_USER || 'vayaplan_user'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'vayaplan'}`;
      }
    }

    currentPoolConnectionString = connectionString;

    poolInstance = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 15),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    poolInstance.on('error', (err: Error) => {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Error inesperado en cliente inactivo del pool de PostgreSQL',
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      }));
    });
  }

  return poolInstance;
}

/**
 * Ejecuta una consulta SQL parametrizada
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getDbPool();
  if (isTestExecution() && isMutationQuery(text)) {
    assertTestDatabaseAllowed(currentPoolConnectionString);
  }
  return pool.query<T>(text, params);
}

/**
 * Adquiere un cliente dedicado del pool (para transacciones manuales)
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getDbPool();
  if (isTestExecution()) {
    assertTestDatabaseAllowed(currentPoolConnectionString);
  }
  return pool.connect();
}

/**
 * Comprueba el estado de la conexión a la base de datos
 */
export async function checkConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  serverTime?: string;
  error?: string;
}> {
  const start = performance.now();
  try {
    const result = await query<{ server_time: string }>('SELECT now() AS server_time;');
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      ok: true,
      latencyMs,
      serverTime: result.rows[0]?.server_time,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      latencyMs,
      error: errorMsg,
    };
  }
}

/**
 * Cierra ordenadamente el pool de conexiones
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    currentPoolConnectionString = '';
  }
}
