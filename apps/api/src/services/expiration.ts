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
 * Tarea periódica de ciclo de vida de promociones
 * - Pasa de 'scheduled' a 'active' cuando starts_at <= now() < ends_at
 * - Pasa de 'active' o 'scheduled' a 'completed' cuando ends_at <= now()
 */
export async function runPromotionLifecycleCheck(): Promise<{ activated: number; completed: number }> {
  try {
    const activateSql = `
      UPDATE promotions
      SET status = 'active'
      WHERE status = 'scheduled'
        AND starts_at <= now()
        AND ends_at > now()
      RETURNING id;
    `;
    const activateResult = await query(activateSql);

    const completeSql = `
      UPDATE promotions
      SET status = 'completed'
      WHERE status IN ('active', 'scheduled')
        AND ends_at <= now()
      RETURNING id;
    `;
    const completeResult = await query(completeSql);

    const activated = activateResult.rows.length;
    const completed = completeResult.rows.length;

    if (activated > 0 || completed > 0) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          worker: 'promotion_lifecycle',
          message: `Ciclo de promociones: ${activated} activadas, ${completed} completadas.`,
          activatedIds: activateResult.rows.map((r) => r.id),
          completedIds: completeResult.rows.map((r) => r.id),
        })
      );
    }

    return { activated, completed };
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        worker: 'promotion_lifecycle',
        message: 'Error al ejecutar tarea programada de ciclo de vida de promociones',
        error: err?.message || String(err),
      })
    );
    return { activated: 0, completed: 0 };
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
    runPromotionLifecycleCheck().catch(() => {});
  }, 5000);

  timer = setInterval(() => {
    runEventExpirationCheck().catch(() => {});
    runPromotionLifecycleCheck().catch(() => {});
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
