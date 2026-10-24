import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { structuredLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRoutes } from './routes/health';
import { eventsRoutes } from './routes/events';
import { weekendRoutes } from './routes/weekend';
import { placesRoutes } from './routes/places';
import { singleEventRoutes } from './routes/single-event';
import { metricsRoutes } from './routes/metrics';
import { festivalsRoutes } from './routes/festivals';
import { activePromotionsRoutes } from './routes/active-promotions';
import { gastronomicRoutes } from './routes/gastronomic-routes';
import { adminAuthRoutes } from './routes/admin/auth';
import { adminEventsRoutes } from './routes/admin/events';
import { adminVenuesRoutes } from './routes/admin/venues';
import { adminRecurrencesRoutes } from './routes/admin/recurrences';
import { adminPlacesRoutes } from './routes/admin/places';
import { adminMetricsRoutes } from './routes/admin/metrics';
import { adminQrRoutes } from './routes/admin/qr';
import { adminPromotionsRoutes } from './routes/admin/promotions';
import { adminUploadsRoutes } from './routes/admin/uploads';
import { adminGastronomicRoutes } from './routes/admin/gastronomic-routes';
import { adminProposalsRoutes } from './routes/admin/proposals';
import { adminInstagramIngestionRoutes } from './routes/admin/instagram-ingestion';
import { internalInstagramIngestionRoutes } from './routes/internal/instagram-ingestion';
import { publicUploadsRoutes } from './routes/uploads';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp';
import { qrRedirectRoutes } from './routes/qr-redirect';
import { startExpirationWorker, stopExpirationWorker } from './services/expiration';
import { startInstagramIngestionCron, stopInstagramIngestionCron } from './services/bar-instagram-import/cron-scheduler';
import { closePool } from '@vayaplan/db';

export const app = new Hono();

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

// Rutas versión 1 de la API (Públicas)
app.route('/api/v1', eventsRoutes);
app.route('/api/v1', festivalsRoutes);
app.route('/api/v1', weekendRoutes);
app.route('/api/v1', placesRoutes);
app.route('/api/v1', singleEventRoutes);
app.route('/api/v1', metricsRoutes);
app.route('/api/v1', activePromotionsRoutes);
app.route('/api/v1', gastronomicRoutes);
app.route('/api/v1', publicUploadsRoutes);
app.route('/', publicUploadsRoutes);

// Webhook de WhatsApp Business
app.route('/api/v1/webhooks', whatsappWebhookRoutes);

// Resolución y registro de códigos QR (accesibles por /api/v1/qr y /qr)
app.route('/api/v1/qr', qrRedirectRoutes);
app.route('/qr', qrRedirectRoutes);

// Panel Administrativo y de Curación (Protegidos)
app.route('/api/v1/admin', adminAuthRoutes);
app.route('/api/v1/admin', adminEventsRoutes);
app.route('/api/v1/admin', adminVenuesRoutes);
app.route('/api/v1/admin', adminRecurrencesRoutes);
app.route('/api/v1/admin', adminPlacesRoutes);
app.route('/api/v1/admin', adminMetricsRoutes);
app.route('/api/v1/admin', adminQrRoutes);
app.route('/api/v1/admin', adminPromotionsRoutes);
app.route('/api/v1/admin', adminUploadsRoutes);
app.route('/api/v1/admin', adminGastronomicRoutes);
app.route('/api/v1/admin', adminProposalsRoutes);
app.route('/api/v1/admin', adminInstagramIngestionRoutes);
app.route('/api/v1/internal', internalInstagramIngestionRoutes);

// Iniciar worker de caducidad automática de eventos pasados
startExpirationWorker();

// Iniciar worker de cron de ingesta programada de Instagram (Miércoles y Viernes 12:00 Madrid)
startInstagramIngestionCron();

// Puerto de ejecución
const port = Number(process.env.PORT || 4000);
const hostname = process.env.HOST || '0.0.0.0';

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: `Servidor VayaPlan API iniciando en puerto ${port} (${hostname})`,
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
  hostname,
}));

// Manejo de apagado ordenado (graceful shutdown)
const gracefulShutdown = async (signal: string) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Señal ${signal} recibida, cerrando conexiones ordenadamente...`,
  }));
  stopExpirationWorker();
  stopInstagramIngestionCron();
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default {
  port,
  hostname,
  fetch: app.fetch,
};
