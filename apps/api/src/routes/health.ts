import { Hono } from 'hono';
import { checkConnection } from '@vayaplan/db';

export const healthRoutes = new Hono();

/**
 * Health check básico del servicio API
 */
healthRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
  });
});

/**
 * Health check con verificación real de conectividad a PostgreSQL
 */
healthRoutes.get('/health/db', async (c) => {
  const dbStatus = await checkConnection();

  if (!dbStatus.ok) {
    return c.json(
      {
        status: 'error',
        db: 'disconnected',
        message: dbStatus.error || 'No se pudo conectar a la base de datos',
      },
      503
    );
  }

  return c.json({
    status: 'ok',
    db: 'connected',
    timestamp: dbStatus.serverTime || new Date().toISOString(),
    database: process.env.POSTGRES_DB || 'vayaplan',
  });
});
