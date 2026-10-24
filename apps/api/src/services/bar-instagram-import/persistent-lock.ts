import { getClient, query } from '@vayaplan/db';

export interface LockInfo {
  status: 'running';
  lockKey: string;
  lockedBy: string;
  startedAt: string;
  expiresAt: string;
  executionDetails?: any;
  sources?: any[];
}

export interface LockAcquireResult {
  success: boolean;
  lockInfo?: LockInfo;
}

export const DEFAULT_LOCK_KEY = 'global_instagram_ingestion';
export const DEFAULT_LOCK_TTL_MINUTES = 15;

/**
 * Intenta adquirir un lock persistente en la base de datos de forma atómica.
 * Utiliza una transacción y SELECT ... FOR UPDATE para prevenir condiciones de carrera.
 */
export async function acquirePersistentLock(params: {
  lockKey?: string;
  lockedBy: string;
  ttlMinutes?: number;
  executionDetails?: any;
}): Promise<LockAcquireResult> {
  const lockKey = params.lockKey || DEFAULT_LOCK_KEY;
  const ttlMinutes = params.ttlMinutes || DEFAULT_LOCK_TTL_MINUTES;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Bloquear y leer la fila correspondiente a lockKey
    const checkSql = `
      SELECT id, lock_key, locked_by, locked_at, expires_at, released_at, execution_details
      FROM instagram_ingestion_locks
      WHERE lock_key = $1
      FOR UPDATE;
    `;
    const checkRes = await client.query(checkSql, [lockKey]);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    if (checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      const isReleased = existing.released_at !== null;
      const isExpired = new Date(existing.expires_at).getTime() <= now.getTime();

      // Si no ha sido liberado Y aún no ha expirado, el lock está ocupado
      if (!isReleased && !isExpired) {
        await client.query('ROLLBACK');
        return {
          success: false,
          lockInfo: {
            status: 'running',
            lockKey: existing.lock_key,
            lockedBy: existing.locked_by,
            startedAt: existing.locked_at ? new Date(existing.locked_at).toISOString() : now.toISOString(),
            expiresAt: existing.expires_at ? new Date(existing.expires_at).toISOString() : expiresAt.toISOString(),
            executionDetails: existing.execution_details,
            sources: existing.execution_details?.sources || existing.execution_details?.sourceIds || [],
          },
        };
      }

      // Si estaba liberado o había expirado, tomamos el lock actualizando la fila
      const updateSql = `
        UPDATE instagram_ingestion_locks
        SET 
          locked_by = $1,
          locked_at = $2,
          expires_at = $3,
          released_at = NULL,
          execution_details = $4
        WHERE lock_key = $5;
      `;
      await client.query(updateSql, [
        params.lockedBy,
        now.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(params.executionDetails || {}),
        lockKey,
      ]);
    } else {
      // Primera vez que se adquiere este lock: INSERT
      const insertSql = `
        INSERT INTO instagram_ingestion_locks (
          lock_key,
          locked_by,
          locked_at,
          expires_at,
          released_at,
          execution_details
        ) VALUES ($1, $2, $3, $4, NULL, $5);
      `;
      await client.query(insertSql, [
        lockKey,
        params.lockedBy,
        now.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(params.executionDetails || {}),
      ]);
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Libera el lock persistente marcando released_at con la fecha actual.
 */
export async function releasePersistentLock(
  lockKey: string = DEFAULT_LOCK_KEY,
  lockedBy?: string
): Promise<boolean> {
  const params: any[] = [lockKey];
  let sql = `
    UPDATE instagram_ingestion_locks
    SET released_at = NOW()
    WHERE lock_key = $1 AND released_at IS NULL
  `;
  if (lockedBy) {
    params.push(lockedBy);
    sql += ` AND locked_by = $2`;
  }
  sql += `;`;

  const res = await query(sql, params);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Consulta el estado actual del lock en la base de datos.
 */
export async function getPersistentLockStatus(lockKey: string = DEFAULT_LOCK_KEY): Promise<{
  locked: boolean;
  lockInfo?: LockInfo;
}> {
  const res = await query(
    `SELECT lock_key, locked_by, locked_at, expires_at, released_at, execution_details
     FROM instagram_ingestion_locks
     WHERE lock_key = $1;`,
    [lockKey]
  );

  if (res.rows.length === 0) {
    return { locked: false };
  }

  const row = res.rows[0];
  const now = new Date();
  const isReleased = row.released_at !== null;
  const isExpired = new Date(row.expires_at).getTime() <= now.getTime();

  if (!isReleased && !isExpired) {
    return {
      locked: true,
      lockInfo: {
        status: 'running',
        lockKey: row.lock_key,
        lockedBy: row.locked_by,
        startedAt: row.locked_at ? new Date(row.locked_at).toISOString() : '',
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '',
        executionDetails: row.execution_details,
        sources: row.execution_details?.sources || row.execution_details?.sourceIds || [],
      },
    };
  }

  return { locked: false };
}
