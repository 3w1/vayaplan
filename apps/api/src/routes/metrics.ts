import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import type { MetricChannel, MetricCreateResponse, MetricType } from '@vayaplan/types';

export const metricsRoutes = new Hono();

const ALLOWED_METRIC_TYPES = new Set<MetricType>([
  'impression',
  'map_click',
  'booking_click',
  'ticket_click',
  'profile_click',
  'whatsapp_click',
  'qr_scan',
  'channel_view',
]);

const ALLOWED_CHANNELS = new Set<MetricChannel>([
  'web',
  'whatsapp_channel',
  'qr_hotel',
  'instagram',
  'tiktok',
  'telegram',
]);

/**
 * POST /api/v1/metrics
 * Registra una métrica de interacción o conversión (impresión, clic en mapa, reserva, entradas, WhatsApp)
 */
metricsRoutes.post('/metrics', async (c) => {
  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'invalid_json',
        message: 'El cuerpo de la petición debe ser un objeto JSON válido.',
      },
      400
    );
  }

  const eventId = Number(body.event_id);
  const metricType = body.metric_type as MetricType;
  const channel = (body.channel || 'web') as MetricChannel;
  const rawPromotionId = body.promotion_id;
  const sessionHash = typeof body.session_hash === 'string' ? body.session_hash.trim().slice(0, 64) : null;
  const metadata = body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata) : null;

  // 1. Validar event_id
  if (!body.event_id || Number.isNaN(eventId) || !Number.isInteger(eventId) || eventId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo event_id es obligatorio y debe ser un número entero positivo.',
      },
      400
    );
  }

  // 2. Validar metric_type
  if (!metricType || !ALLOWED_METRIC_TYPES.has(metricType)) {
    return c.json(
      {
        error: 'invalid_metric_type',
        message: `El campo metric_type '${metricType}' no es válido. Valores permitidos: ${Array.from(ALLOWED_METRIC_TYPES).join(', ')}.`,
      },
      400
    );
  }

  // 3. Validar channel
  if (!channel || !ALLOWED_CHANNELS.has(channel)) {
    return c.json(
      {
        error: 'invalid_channel',
        message: `El campo channel '${channel}' no es válido. Valores permitidos: ${Array.from(ALLOWED_CHANNELS).join(', ')}.`,
      },
      400
    );
  }

  // 4. Validar promotion_id si viene informado
  let promotionId: number | null = null;
  if (rawPromotionId !== undefined && rawPromotionId !== null) {
    const parsedPromotionId = Number(rawPromotionId);
    if (!Number.isNaN(parsedPromotionId) && Number.isInteger(parsedPromotionId) && parsedPromotionId > 0) {
      promotionId = parsedPromotionId;
    }
  }

  // 5. Verificar que el evento existe
  const eventCheck = await query(
    `SELECT id FROM events WHERE id = $1 LIMIT 1;`,
    [eventId]
  );

  if (eventCheck.rows.length === 0) {
    return c.json(
      {
        error: 'event_not_found',
        message: `El evento con ID ${eventId} no existe en la base de datos.`,
      },
      404
    );
  }

  // 6. Verificar promoción si se proporcionó
  if (promotionId !== null) {
    const promoCheck = await query(
      `SELECT id FROM promotions WHERE id = $1 LIMIT 1;`,
      [promotionId]
    );
    if (promoCheck.rows.length === 0) {
      promotionId = null;
    }
  }

  // 7. Insertar métrica en base de datos
  const insertSql = `
    INSERT INTO event_metrics (
      event_id,
      promotion_id,
      metric_type,
      channel,
      session_hash,
      occurred_at,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, now(), $6)
    RETURNING id;
  `;

  const insertResult = await query(insertSql, [
    eventId,
    promotionId,
    metricType,
    channel,
    sessionHash,
    metadata,
  ]);

  const metricId = Number(insertResult.rows[0].id);

  const response: MetricCreateResponse = {
    status: 'ok',
    metric_id: metricId,
  };

  return c.json(response, 201);
});
