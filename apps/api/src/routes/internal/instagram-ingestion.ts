import { Hono } from 'hono';
import { runInstagramIngestion } from '../../services/bar-instagram-import/instagram-ingestion-service';

export const internalInstagramIngestionRoutes = new Hono();

// Secreto interno estricto para protección del endpoint de cron (obtenido exclusivamente desde el entorno)
const INTERNAL_CRON_SECRET = process.env.INTERNAL_CRON_SECRET;

if (!INTERNAL_CRON_SECRET) {
  throw new Error('INTERNAL_CRON_SECRET is required');
}

/**
 * Middleware de seguridad para endpoints internos
 * Autenticación exclusiva mediante secreto interno (cabecera Bearer o X-Internal-Cron-Key)
 */
internalInstagramIngestionRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const cronKeyHeader = c.req.header('x-internal-cron-key') || '';

  if (token === INTERNAL_CRON_SECRET || cronKeyHeader === INTERNAL_CRON_SECRET) {
    return next();
  }

  return c.json(
    {
      error: 'unauthorized',
      message: 'Acceso no autorizado al servicio interno.',
    },
    401
  );
});

/**
 * POST /api/v1/internal/instagram-ingestion/run-scheduled
 * Endpoint llamado por cron para ejecutar la ingesta periódica de todas las fuentes activas
 */
internalInstagramIngestionRoutes.post('/instagram-ingestion/run-scheduled', async (c) => {
  try {
    const report = await runInstagramIngestion({
      onlyActive: true,
      executionType: 'cron_scheduled',
    });

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'instagram_cron_runner',
        message: 'Ejecución programada de ingesta de Instagram completada con éxito',
        executionId: report.executionId,
        sourcesProcessed: report.sourcesProcessed,
        proposalsCreated: report.proposalsCreated,
        durationMs: report.durationMs,
      })
    );

    return c.json({
      success: true,
      message: 'Ejecución programada de ingesta de Instagram finalizada correctamente.',
      report,
    });
  } catch (err: any) {
    if (err.status === 409 || err.statusCode === 409 || err.message?.includes('ejecución de ingesta en curso')) {
      return c.json({
        error: 'execution_locked',
        message: err.message,
        locked: true,
        currentExecution: err.lockInfo || {
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      }, 409);
    }

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'instagram_cron_runner',
        message: 'Fallo en la ejecución programada de ingesta de Instagram',
        error: err.message,
      })
    );

    return c.json({ error: 'cron_execution_failed', message: err.message }, 500);
  }
});
