import { query } from '@vayaplan/db';

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Tarea periódica de expiración de eventos
 * Actualiza el estado de 'published' a 'outdated' para eventos cuya fecha/hora de celebración ya concluyó
 */
export async function runEventExpirationCheck(): Promise<number> {
  try {
    const sql = `
      UPDATE events
      SET status = 'outdated',
          updated_at = now()
      WHERE status = 'published'
        AND (
          (end_time IS NOT NULL AND end_time < now())
          OR (end_time IS NULL AND start_time < (now() - INTERVAL '4 hours'))
        )
      RETURNING id, title, start_time;
    `;

    const result = await query(sql);
    const count = result.rows.length;

    if (count > 0) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          worker: 'event_expiration',
          message: `Caducidad automática: ${count} eventos marcados como 'outdated'.`,
          expiredEventIds: result.rows.map((r) => r.id),
        })
      );
    }

    return count;
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        worker: 'event_expiration',
        message: 'Error al ejecutar tarea programada de caducidad de eventos',
        error: err?.message || String(err),
      })
    );
    return 0;
  }
}

/**
 * Inicia el cron/worker interno en memoria (ejecuta cada 10 minutos y al arrancar)
 */
export function startExpirationWorker(intervalMs: number = 600000): void {
  if (timer) return;

  // Ejecución inicial diferida 5 segundos tras el arranque
  setTimeout(() => {
    runEventExpirationCheck().catch(() => {});
  }, 5000);

  timer = setInterval(() => {
    runEventExpirationCheck().catch(() => {});
  }, intervalMs);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      worker: 'event_expiration',
      message: `Worker de caducidad iniciado con intervalo de ${intervalMs / 1000}s.`,
    })
  );
}

/**
 * Detiene el worker ordenadamente en el graceful shutdown
 */
export function stopExpirationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        worker: 'event_expiration',
        message: 'Worker de caducidad detenido correctamente.',
      })
    );
  }
}
