import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

// Retornar columnas tipo DATE (OID 1082) como string 'YYYY-MM-DD' sin conversión a Date local
types.setTypeParser(1082, (val: string) => val);

let poolInstance: Pool | null = null;

/**
 * Obtiene o inicializa la instancia singleton del Pool de PostgreSQL
 */
export function getDbPool(): Pool {
  if (!poolInstance) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'vayaplan_user'}:${process.env.POSTGRES_PASSWORD || 'cambia-esta-clave-segura'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'vayaplan'}`;

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
  return pool.query<T>(text, params);
}

/**
 * Adquiere un cliente dedicado del pool (para transacciones manuales)
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getDbPool();
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
  }
}
