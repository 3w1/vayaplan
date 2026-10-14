import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { structuredLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRoutes } from './routes/health';
import { eventsRoutes } from './routes/events';
import { closePool } from '@vayaplan/db';

const app = new Hono();

// Middleware global de logs estructurados
app.use('*', structuredLogger);

// CORS configurado para entorno web y PWA
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Permitir localhost, 127.0.0.1 y dominios vayaplan.com
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vayaplan.com')) {
        return origin || '*';
      }
      return 'https://vayaplan.com';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposeHeaders: ['x-request-id'],
    maxAge: 86400,
  })
);

// Manejadores centralizados
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Rutas de salud y monitoreo
app.route('/api', healthRoutes);

// Rutas versión 1 de la API
app.route('/api/v1', eventsRoutes);

// Puerto de ejecución
const port = Number(process.env.PORT || 4000);

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: `Servidor VayaPlan API iniciando en puerto ${port}`,
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
}));

// Manejo de apagado ordenado (graceful shutdown)
const gracefulShutdown = async (signal: string) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Señal ${signal} recibida, cerrando conexiones ordenadamente...`,
  }));
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default {
  port,
  fetch: app.fetch,
};
