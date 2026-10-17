import type { Pool, PoolClient } from 'pg';
import type { RollbackResult } from './types';

export interface RollbackOptions {
  rollback: boolean;
  reason?: string;
}

export async function rollbackBatch(
  batchUuid: string,
  db: Pool | PoolClient,
  options: RollbackOptions
): Promise<RollbackResult> {
  const isDryRun = !options.rollback;
  const reasonText = options.reason || 'Reversión manual autorizada por operador';

  const result: RollbackResult = {
    batchUuid,
    dryRun: isDryRun,
    status: 'NOT_FOUND',
    deletedVenueIds: [],
    deletedExternalIds: [],
    blockingReasons: [],
    message: '',
  };

  let client: PoolClient;
  let shouldRelease = false;

  if ('connect' in db && typeof (db as Pool).connect === 'function') {
    client = await (db as Pool).connect();
    shouldRelease = true;
  } else {
    client = db as PoolClient;
  }

  try {
    // 1. Locate batch
    const batchRes = await client.query(
      `SELECT id, batch_uuid, city_id, status, created_venue_ids, applied_at
       FROM venue_import_batches
       WHERE batch_uuid = $1`,
      [batchUuid]
    );

    if (batchRes.rowCount === 0) {
      result.status = 'NOT_FOUND';
      result.message = `Lote con UUID ${batchUuid} no encontrado en venue_import_batches.`;
      return result;
    }

    const batch = batchRes.rows[0];
    if (batch.status === 'rolled_back') {
      result.status = 'BLOCKED';
      result.blockingReasons.push(`El lote ${batchUuid} ya se encuentra revertido.`);
      result.message = 'Operación denegada: lote ya revertido anteriormente.';
      return result;
    }

    const venueIds: number[] = batch.created_venue_ids || [];
    if (venueIds.length === 0) {
      result.status = 'ROLLED_BACK';
      result.message = 'El lote no contiene locales creados; nada que revertir.';
      return result;
    }

    // 2. Inspect relations
    const blockingReasons: string[] = [];

    // Check events
    const eventsRes = await client.query(
      `SELECT venue_id, COUNT(*) AS count
       FROM events
       WHERE venue_id = ANY($1)
       GROUP BY venue_id`,
      [venueIds]
    );
    for (const row of eventsRes.rows) {
      blockingReasons.push(
        `El local ID ${row.venue_id} tiene ${row.count} evento(s) asociado(s) en la tabla events.`
      );
    }

    // Check promotions
    const promoRes = await client.query(
      `SELECT venue_id, COUNT(*) AS count
       FROM promotions
       WHERE venue_id = ANY($1)
       GROUP BY venue_id`,
      [venueIds]
    );
    for (const row of promoRes.rows) {
      blockingReasons.push(
        `El local ID ${row.venue_id} tiene ${row.count} promoción(es) asociada(s) en la tabla promotions.`
      );
    }

    // Check recurrences
    const recurRes = await client.query(
      `SELECT venue_id, COUNT(*) AS count
       FROM recurrences
       WHERE venue_id = ANY($1)
       GROUP BY venue_id`,
      [venueIds]
    );
    for (const row of recurRes.rows) {
      blockingReasons.push(
        `El local ID ${row.venue_id} tiene ${row.count} recurrencia(s) asociada(s) en la tabla recurrences.`
      );
    }

    // Check places
    const placesRes = await client.query(
      `SELECT venue_id, COUNT(*) AS count
       FROM places
       WHERE venue_id = ANY($1)
       GROUP BY venue_id`,
      [venueIds]
    );
    for (const row of placesRes.rows) {
      blockingReasons.push(
        `El local ID ${row.venue_id} está referenciado en la tabla places (${row.count} registro(s)).`
      );
    }

    // Check manual modification since applied_at (+ 2s buffer for clock skew)
    const modRes = await client.query(
      `SELECT id, name, updated_at
       FROM venues
       WHERE id = ANY($1) AND updated_at > ($2::timestamptz + interval '2 seconds')`,
      [venueIds, batch.applied_at]
    );
    for (const row of modRes.rows) {
      blockingReasons.push(
        `El local ID ${row.id} ("${row.name}") fue modificado con posterioridad a la importación (${row.updated_at}).`
      );
    }

    if (blockingReasons.length > 0) {
      result.status = 'BLOCKED';
      result.blockingReasons = blockingReasons;
      result.message = `Rollback bloqueado: se encontraron ${blockingReasons.length} relaciones o modificaciones posteriores.`;
      return result;
    }

    // 3. Dry-run vs Real execution
    if (isDryRun) {
      result.status = 'ROLLED_BACK';
      result.deletedVenueIds = venueIds;
      result.message = `Simulación de rollback exitosa: se eliminarían ${venueIds.length} locales sin dependencias activas. Ningún cambio persistido.`;
      return result;
    }

    // Real transactional rollback
    await client.query('BEGIN');

    // Delete external IDs linked to this batch
    const delExtRes = await client.query(
      `DELETE FROM venue_external_ids
       WHERE batch_id = $1 OR venue_id = ANY($2)
       RETURNING id`,
      [batch.id, venueIds]
    );
    const deletedExtIds = delExtRes.rows.map((r) => r.id);

    // Delete venues
    const delVenuesRes = await client.query(
      `DELETE FROM venues
       WHERE id = ANY($1)
       RETURNING id`,
      [venueIds]
    );
    const deletedVIds = delVenuesRes.rows.map((r) => r.id);

    // Update batch status
    await client.query(
      `UPDATE venue_import_batches
       SET status = 'rolled_back',
           rolled_back_at = now(),
           rollback_reason = $1
       WHERE id = $2`,
      [reasonText, batch.id]
    );

    await client.query('COMMIT');

    result.status = 'ROLLED_BACK';
    result.deletedVenueIds = deletedVIds;
    result.deletedExternalIds = deletedExtIds;
    result.message = `Rollback completado con éxito: ${deletedVIds.length} locales y ${deletedExtIds.length} identificadores externos eliminados limpiamente.`;
    return result;
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    result.status = 'BLOCKED';
    result.blockingReasons.push(err.message || String(err));
    result.message = `Error durante el rollback: ${err.message || String(err)}`;
    return result;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}
