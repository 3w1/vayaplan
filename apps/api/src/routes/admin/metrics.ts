import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import type { EventMetricsSummary } from '@vayaplan/types';

export const adminMetricsRoutes = new Hono();

adminMetricsRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/metrics/events/:id
 * Devuelve el reporte agregado de rendimiento y conversiones para un evento concreto
 */
adminMetricsRoutes.get('/metrics/events/:id', async (c) => {
  const eventId = Number(c.req.param('id'));
  if (Number.isNaN(eventId) || eventId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de evento inválido.' }, 400);
  }

  // 1. Obtener datos del evento
  const eventResult = await query(
    `SELECT id, title, start_time, editorial_date, status
     FROM events
     WHERE id = $1
     LIMIT 1;`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${eventId} no encontrado.` }, 404);
  }

  const event = eventResult.rows[0];

  // 2. Consulta de agregación de métricas
  const metricsSql = `
    SELECT 
      COUNT(*) FILTER (WHERE metric_type = 'impression') AS total_impressions,
      COUNT(*) FILTER (WHERE metric_type = 'map_click') AS total_map_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'ticket_click') AS total_ticket_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'booking_click') AS total_booking_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'whatsapp_click') AS total_whatsapp_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'profile_click') AS total_profile_clicks,
      COUNT(DISTINCT session_hash) FILTER (WHERE session_hash IS NOT NULL) AS unique_sessions
    FROM event_metrics
    WHERE event_id = $1;
  `;

  const metricsResult = await query(metricsSql, [eventId]);
  const row = metricsResult.rows[0] || {};

  const summary: EventMetricsSummary = {
    event_id: eventId,
    title: event.title,
    total_impressions: Number(row.total_impressions || 0),
    total_map_clicks: Number(row.total_map_clicks || 0),
    total_ticket_clicks: Number(row.total_ticket_clicks || 0),
    total_booking_clicks: Number(row.total_booking_clicks || 0),
    total_whatsapp_clicks: Number(row.total_whatsapp_clicks || 0),
    total_profile_clicks: Number(row.total_profile_clicks || 0),
    unique_sessions: Number(row.unique_sessions || 0),
  };

  // 3. Desglose por canal
  const channelSql = `
    SELECT channel, metric_type, COUNT(*) AS count
    FROM event_metrics
    WHERE event_id = $1
    GROUP BY channel, metric_type
    ORDER BY count DESC;
  `;
  const channelResult = await query(channelSql, [eventId]);

  return c.json({
    event: {
      id: event.id,
      title: event.title,
      editorial_date: event.editorial_date,
      status: event.status,
    },
    summary,
    breakdown: channelResult.rows,
  });
});
