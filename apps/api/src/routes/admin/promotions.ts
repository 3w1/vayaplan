import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import { isValidDateString } from '@vayaplan/shared';
import type { Promotion, PromotionStatus } from '@vayaplan/types';

export const adminPromotionsRoutes = new Hono();

// Proteger todas las rutas administrativas de promociones con autenticación JWT
adminPromotionsRoutes.use('*', requireAdminAuth);

/**
 * Función auxiliar para formatear la fecha editorial a YYYY-MM-DD
 */
function toDateString(d: unknown): string {
  if (typeof d === 'string') {
    return d.includes('T') ? d.split('T')[0] : d;
  }
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d);
}

/**
 * Genera el texto del informe en formato listo para WhatsApp según el Playbook GTM
 * Denomina los valores únicos estrictamente como "sesiones únicas"
 */
function buildWhatsAppReportText(data: {
  venue_name: string;
  event_title: string;
  editorial_date: string;
  promo_impressions: number;
  promo_unique_impressions: number;
  promo_map_clicks: number;
  promo_unique_map_clicks: number;
  promo_booking_clicks: number;
  promo_ticket_clicks: number;
  promo_whatsapp_clicks: number;
  promo_profile_clicks: number;
  promo_channel_views: number;
  promo_qr_scans: number;
  promo_total_actions: number;
  promo_unique_action_sessions: number;
  event_total_impressions: number;
  event_total_actions: number;
}): string {
  const reservationAndTickets = data.promo_booking_clicks + data.promo_ticket_clicks;
  const webAndSocial = data.promo_profile_clicks;
  const directWhatsapp = data.promo_whatsapp_clicks;
  const channelAndQr = data.promo_channel_views + data.promo_qr_scans;

  return `Hola ${data.venue_name}, así ha rendido la promoción de vuestro evento "${data.event_title}" en VayaPlan (${data.editorial_date}):

• Visualizaciones de la tarjeta: ${data.promo_impressions} (${data.promo_unique_impressions} sesiones únicas)
• Clics en "Cómo llegar": ${data.promo_map_clicks} (${data.promo_unique_map_clicks} sesiones únicas)
• Clics en reserva / entradas: ${reservationAndTickets}
• Clics directos a WhatsApp del local: ${directWhatsapp}
• Clics a perfil / web / redes: ${webAndSocial}
• Alcance canal / QR atribuidos: ${channelAndQr}
• Total de interacciones de la promoción: ${data.promo_total_actions} (${data.promo_unique_action_sessions} sesiones únicas)

[Métricas acumuladas del evento completo: ${data.event_total_impressions} visualizaciones y ${data.event_total_actions} interacciones totales]

Estos son datos de interacción registrados en la plataforma. Los recuentos únicos corresponden a sesiones anónimas distintas (sesiones únicas), no una garantía de asistencia ni aforo. No se infiere asistencia ni ventas.

Gracias por confiar en VayaPlan. Si queréis asegurar una posición destacada para vuestro próximo evento, podemos activarlo por 19 €.`;
}

/**
 * GET /api/v1/admin/promotions
 * Lista promociones con filtros opcionales (status, city_id, editorial_date)
 */
adminPromotionsRoutes.get('/promotions', async (c) => {
  const statusFilter = c.req.query('status')?.trim();
  const cityIdFilter = c.req.query('city_id')?.trim();
  const dateFilter = c.req.query('editorial_date')?.trim();

  const queryParams: any[] = [];
  let sql = `
    SELECT 
      p.id,
      p.city_id,
      c.name AS city_name,
      c.slug AS city_slug,
      p.event_id,
      e.title AS event_title,
      e.status AS event_status,
      e.start_time AS event_start_time,
      p.venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      p.editorial_date,
      p.starts_at,
      p.ends_at,
      p.price_cents,
      p.status,
      p.created_at
    FROM promotions p
    INNER JOIN cities c ON p.city_id = c.id
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON p.venue_id = v.id
    WHERE 1=1
  `;

  if (statusFilter) {
    queryParams.push(statusFilter);
    sql += ` AND p.status = $${queryParams.length}`;
  }

  if (cityIdFilter && !Number.isNaN(Number(cityIdFilter))) {
    queryParams.push(Number(cityIdFilter));
    sql += ` AND p.city_id = $${queryParams.length}`;
  }

  if (dateFilter && isValidDateString(dateFilter)) {
    queryParams.push(dateFilter);
    sql += ` AND p.editorial_date = $${queryParams.length}`;
  }

  sql += `
    ORDER BY 
      CASE WHEN p.status = 'active' THEN 0 WHEN p.status = 'scheduled' THEN 1 ELSE 2 END ASC,
      p.editorial_date DESC,
      p.created_at DESC;
  `;

  const result = await query(sql, queryParams);

  const promotions = result.rows.map((row) => ({
    id: Number(row.id),
    city_id: Number(row.city_id),
    city_name: row.city_name,
    city_slug: row.city_slug,
    event_id: Number(row.event_id),
    event_title: row.event_title,
    event_status: row.event_status,
    event_start_time: new Date(row.event_start_time).toISOString(),
    venue_id: Number(row.venue_id),
    venue_name: row.venue_name,
    venue_slug: row.venue_slug,
    editorial_date: toDateString(row.editorial_date),
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    price_cents: Number(row.price_cents),
    status: row.status as PromotionStatus,
    created_at: new Date(row.created_at).toISOString(),
  }));

  return c.json({
    promotions,
    total: promotions.length,
  });
});

/**
 * POST /api/v1/admin/promotions
 * Crea una nueva promoción:
 * - Deriva city_id y venue_id directamente del evento seleccionado
 * - Valida la coherencia de editorial_date (debe coincidir con la del evento)
 * - Rechaza fechas inválidas, ends_at <= starts_at y precios negativos
 * - Protege la escasez comercial (tanto 'active' como 'scheduled' reservan el día)
 */
adminPromotionsRoutes.post('/promotions', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición JSON inválido.' }, 400);
  }

  const eventId = Number(body.event_id);
  if (!eventId || Number.isNaN(eventId) || eventId <= 0) {
    return c.json({ error: 'missing_field', message: 'El campo event_id es obligatorio.' }, 400);
  }

  // 1. Obtener y verificar existencia del evento
  const eventResult = await query(
    `SELECT e.id, e.city_id, e.venue_id, e.editorial_date, e.start_time, e.end_time, e.status, e.title,
            c.name AS city_name
     FROM events e
     INNER JOIN cities c ON e.city_id = c.id
     WHERE e.id = $1
     LIMIT 1;`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `El evento con ID ${eventId} no existe.` }, 404);
  }

  const event = eventResult.rows[0];
  const cityId = Number(event.city_id);
  const venueId = Number(event.venue_id);
  const eventEditorialDate = toDateString(event.editorial_date);

  // Validar que el evento esté publicado y no sea un borrador o cancelado
  if (event.status !== 'published') {
    return c.json(
      {
        error: 'invalid_event_status',
        message: `Solo se pueden promocionar eventos en estado publicado. El evento actual está en estado '${event.status}'.`,
        details: { event_id: eventId, status: event.status },
      },
      400
    );
  }

  // Validar que el evento tenga un local real asignado y no el local provisional de verificación (9999)
  if (venueId === 9999) {
    return c.json(
      {
        error: 'venue_not_assigned',
        message: 'No se puede promocionar un evento con Local por verificar (venue 9999). Debe asignarse un local censado antes de promocionarlo.',
        details: { event_id: eventId, venue_id: venueId },
      },
      400
    );
  }

  // 2. Validar coherencia de fecha editorial
  if (body.editorial_date) {
    const providedDate = String(body.editorial_date).trim();
    if (!isValidDateString(providedDate)) {
      return c.json({ error: 'invalid_date_format', message: 'La fecha editorial debe tener formato YYYY-MM-DD.' }, 400);
    }
    if (providedDate !== eventEditorialDate) {
      return c.json(
        {
          error: 'inconsistent_editorial_date',
          message: `La fecha editorial (${providedDate}) debe coincidir con la fecha editorial del evento (${eventEditorialDate}).`,
          details: {
            event_editorial_date: eventEditorialDate,
            provided_editorial_date: providedDate,
          },
        },
        400
      );
    }
  }
  const editorialDate = eventEditorialDate;

  // 3. Validar intervalo temporal starts_at y ends_at
  const rawStartsAt = body.starts_at || event.start_time;
  const rawEndsAt = body.ends_at || event.end_time || new Date(new Date(event.start_time).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const startsAtDate = new Date(rawStartsAt);
  const endsAtDate = new Date(rawEndsAt);

  if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime())) {
    return c.json({ error: 'invalid_date_format', message: 'starts_at y ends_at deben ser timestamps ISO válidos.' }, 400);
  }

  if (endsAtDate.getTime() <= startsAtDate.getTime()) {
    return c.json(
      {
        error: 'invalid_date_range',
        message: 'La fecha de fin (ends_at) debe ser estrictamente posterior a la fecha de inicio (starts_at).',
        details: {
          starts_at: startsAtDate.toISOString(),
          ends_at: endsAtDate.toISOString(),
        },
      },
      400
    );
  }

  // 4. Validar precio
  const priceCents = body.price_cents !== undefined ? Number(body.price_cents) : 1900;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return c.json(
      {
        error: 'invalid_price',
        message: 'El precio en céntimos debe ser un número entero mayor o igual a 0.',
        details: { price_cents: priceCents },
      },
      400
    );
  }

  // 5. Validar estado y reserva de escasez (active y scheduled reservan el espacio comercial)
  const status: PromotionStatus = body.status && ['active', 'scheduled', 'completed', 'cancelled', 'refunded'].includes(body.status)
    ? body.status
    : 'active';

  if (status === 'active' || status === 'scheduled') {
    const existingBooking = await query(
      `SELECT id, event_id, status FROM promotions 
       WHERE city_id = $1 AND editorial_date = $2 AND status IN ('active', 'scheduled')
       LIMIT 1;`,
      [cityId, editorialDate]
    );

    if (existingBooking.rows.length > 0) {
      return c.json(
        {
          error: 'promotion_limit_reached',
          message: `Ya existe una promoción ${existingBooking.rows[0].status === 'active' ? 'activa' : 'programada'} para ${event.city_name || 'la ciudad'} el ${editorialDate}`,
          details: {
            city_id: cityId,
            editorial_date: editorialDate,
            existing_promotion_id: existingBooking.rows[0].id,
            existing_status: existingBooking.rows[0].status,
          },
        },
        409
      );
    }
  }

  // 6. Inserción con captura de excepción del índice único
  try {
    const insertResult = await query<Promotion>(
      `INSERT INTO promotions (
        city_id, event_id, venue_id, editorial_date, starts_at, ends_at, price_cents, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      RETURNING *;`,
      [cityId, eventId, venueId, editorialDate, startsAtDate.toISOString(), endsAtDate.toISOString(), priceCents, status]
    );

    const createdPromo = insertResult.rows[0];

    return c.json(
      {
        status: 'ok',
        promotion: {
          id: Number(createdPromo.id),
          city_id: Number(createdPromo.city_id),
          event_id: Number(createdPromo.event_id),
          venue_id: Number(createdPromo.venue_id),
          editorial_date: toDateString(createdPromo.editorial_date),
          starts_at: new Date(createdPromo.starts_at).toISOString(),
          ends_at: new Date(createdPromo.ends_at).toISOString(),
          price_cents: Number(createdPromo.price_cents),
          status: createdPromo.status,
          created_at: new Date(createdPromo.created_at).toISOString(),
        },
      },
      201
    );
  } catch (err: any) {
    if (err?.code === '23505' || String(err?.message).includes('uq_promotions_city_editorial_date')) {
      return c.json(
        {
          error: 'promotion_limit_reached',
          message: `Ya existe una promoción reservada para ${event.city_name || 'la ciudad'} el ${editorialDate}`,
          details: {
            city_id: cityId,
            editorial_date: editorialDate,
          },
        },
        409
      );
    }
    throw err;
  }
});

/**
 * GET /api/v1/admin/promotions/:id
 * Detalle completo de una promoción
 */
adminPromotionsRoutes.get('/promotions/:id', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de promoción inválido.' }, 400);
  }

  const result = await query(
    `SELECT 
      p.*,
      c.name AS city_name,
      c.slug AS city_slug,
      e.title AS event_title,
      e.category AS event_category,
      e.status AS event_status,
      e.start_time AS event_start_time,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.address AS venue_address
    FROM promotions p
    INNER JOIN cities c ON p.city_id = c.id
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON p.venue_id = v.id
    WHERE p.id = $1
    LIMIT 1;`,
    [promoId]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'promotion_not_found', message: `Promoción ${promoId} no encontrada.` }, 404);
  }

  const row = result.rows[0];
  return c.json({
    promotion: {
      id: Number(row.id),
      city_id: Number(row.city_id),
      city_name: row.city_name,
      city_slug: row.city_slug,
      event_id: Number(row.event_id),
      event_title: row.event_title,
      event_category: row.event_category,
      event_status: row.event_status,
      event_start_time: new Date(row.event_start_time).toISOString(),
      venue_id: Number(row.venue_id),
      venue_name: row.venue_name,
      venue_slug: row.venue_slug,
      venue_address: row.venue_address,
      editorial_date: toDateString(row.editorial_date),
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      price_cents: Number(row.price_cents),
      status: row.status as PromotionStatus,
      created_at: new Date(row.created_at).toISOString(),
    },
  });
});

/**
 * PATCH /api/v1/admin/promotions/:id
 * Modifica precio, fechas o estado de una promoción
 */
adminPromotionsRoutes.patch('/promotions/:id', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de promoción inválido.' }, 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición JSON inválido.' }, 400);
  }

  // Obtener promoción existente y su evento asociado
  const existing = await query<Promotion>(`SELECT * FROM promotions WHERE id = $1 LIMIT 1;`, [promoId]);
  if (existing.rows.length === 0) {
    return c.json({ error: 'promotion_not_found', message: `Promoción ${promoId} no encontrada.` }, 404);
  }

  const current = existing.rows[0];

  // Validar precio si se proporciona
  let newPriceCents = current.price_cents;
  if (body.price_cents !== undefined) {
    newPriceCents = Number(body.price_cents);
    if (!Number.isInteger(newPriceCents) || newPriceCents < 0) {
      return c.json({ error: 'invalid_price', message: 'El precio debe ser un número entero mayor o igual a 0.' }, 400);
    }
  }

  // Validar fechas de inicio y fin si se proporcionan
  const newStartsAt = body.starts_at ? new Date(body.starts_at) : new Date(current.starts_at);
  const newEndsAt = body.ends_at ? new Date(body.ends_at) : new Date(current.ends_at);

  if (Number.isNaN(newStartsAt.getTime()) || Number.isNaN(newEndsAt.getTime())) {
    return c.json({ error: 'invalid_date_format', message: 'starts_at y ends_at deben ser timestamps ISO válidos.' }, 400);
  }

  if (newEndsAt.getTime() <= newStartsAt.getTime()) {
    return c.json(
      {
        error: 'invalid_date_range',
        message: 'La fecha de fin (ends_at) debe ser estrictamente posterior a la fecha de inicio (starts_at).',
        details: {
          starts_at: newStartsAt.toISOString(),
          ends_at: newEndsAt.toISOString(),
        },
      },
      400
    );
  }

  const newStatus: PromotionStatus = body.status !== undefined ? body.status : current.status;
  const newEditorialDate = toDateString(current.editorial_date);

  // Si pasa a 'active' o 'scheduled', comprobar si existe otra promoción en ese estado
  if (newStatus === 'active' || newStatus === 'scheduled') {
    const conflictResult = await query(
      `SELECT id, status FROM promotions 
       WHERE city_id = $1 AND editorial_date = $2 AND status IN ('active', 'scheduled') AND id != $3
       LIMIT 1;`,
      [current.city_id, newEditorialDate, promoId]
    );

    if (conflictResult.rows.length > 0) {
      return c.json(
        {
          error: 'promotion_limit_reached',
          message: `Ya existe otra promoción ${conflictResult.rows[0].status === 'active' ? 'activa' : 'programada'} para esta ciudad el ${newEditorialDate}`,
          details: {
            city_id: current.city_id,
            editorial_date: newEditorialDate,
          },
        },
        409
      );
    }
  }

  try {
    const updateResult = await query<Promotion>(
      `UPDATE promotions
       SET editorial_date = $1,
           starts_at = $2,
           ends_at = $3,
           price_cents = $4,
           status = $5
       WHERE id = $6
       RETURNING *;`,
      [newEditorialDate, newStartsAt.toISOString(), newEndsAt.toISOString(), newPriceCents, newStatus, promoId]
    );

    const updated = updateResult.rows[0];
    return c.json({
      status: 'ok',
      promotion: {
        id: Number(updated.id),
        city_id: Number(updated.city_id),
        event_id: Number(updated.event_id),
        venue_id: Number(updated.venue_id),
        editorial_date: toDateString(updated.editorial_date),
        starts_at: new Date(updated.starts_at).toISOString(),
        ends_at: new Date(updated.ends_at).toISOString(),
        price_cents: Number(updated.price_cents),
        status: updated.status,
        created_at: new Date(updated.created_at).toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.code === '23505' || String(err?.message).includes('uq_promotions_city_editorial_date')) {
      return c.json(
        {
          error: 'promotion_limit_reached',
          message: `Ya existe una promoción activa o programada para esta ciudad el ${newEditorialDate}`,
          details: {
            city_id: current.city_id,
            editorial_date: newEditorialDate,
          },
        },
        409
      );
    }
    throw err;
  }
});

/**
 * POST /api/v1/admin/promotions/:id/cancel
 * Cancela una promoción, liberando inmediatamente el hueco de reserva
 */
adminPromotionsRoutes.post('/promotions/:id/cancel', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de promoción inválido.' }, 400);
  }

  // Verificar estado actual: solo se puede cancelar una promoción activa o programada
  const existing = await query<Promotion>(`SELECT id, status FROM promotions WHERE id = $1 LIMIT 1;`, [promoId]);
  if (existing.rows.length === 0) {
    return c.json({ error: 'promotion_not_found', message: `Promoción ${promoId} no encontrada.` }, 404);
  }

  const currentStatus = existing.rows[0].status;
  if (currentStatus !== 'active' && currentStatus !== 'scheduled') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: `No se puede cancelar una promoción en estado '${currentStatus}'. Solo se pueden cancelar promociones en estado 'active' o 'scheduled'.`,
        details: { id: promoId, current_status: currentStatus },
      },
      400
    );
  }

  const result = await query<Promotion>(
    `UPDATE promotions
     SET status = 'cancelled'
     WHERE id = $1
     RETURNING *;`,
    [promoId]
  );

  const promo = result.rows[0];
  return c.json({
    status: 'ok',
    message: 'Promoción cancelada con éxito. El espacio ha quedado libre.',
    promotion: {
      id: Number(promo.id),
      city_id: Number(promo.city_id),
      event_id: Number(promo.event_id),
      venue_id: Number(promo.venue_id),
      editorial_date: toDateString(promo.editorial_date),
      starts_at: new Date(promo.starts_at).toISOString(),
      ends_at: new Date(promo.ends_at).toISOString(),
      price_cents: Number(promo.price_cents),
      status: promo.status,
      created_at: new Date(promo.created_at).toISOString(),
    },
  });
});

/**
 * POST /api/v1/admin/promotions/:id/refund
 * Marca la promoción como reembolsada, liberando inmediatamente el hueco de reserva
 */
adminPromotionsRoutes.post('/promotions/:id/refund', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de promoción inválido.' }, 400);
  }

  // Verificar estado actual: solo se puede reembolsar una promoción activa o programada
  const existing = await query<Promotion>(`SELECT id, status FROM promotions WHERE id = $1 LIMIT 1;`, [promoId]);
  if (existing.rows.length === 0) {
    return c.json({ error: 'promotion_not_found', message: `Promoción ${promoId} no encontrada.` }, 404);
  }

  const currentStatus = existing.rows[0].status;
  if (currentStatus !== 'active' && currentStatus !== 'scheduled') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: `No se puede reembolsar una promoción en estado '${currentStatus}'. Solo se pueden reembolsar promociones en estado 'active' o 'scheduled'.`,
        details: { id: promoId, current_status: currentStatus },
      },
      400
    );
  }

  const result = await query<Promotion>(
    `UPDATE promotions
     SET status = 'refunded'
     WHERE id = $1
     RETURNING *;`,
    [promoId]
  );

  const promo = result.rows[0];
  return c.json({
    status: 'ok',
    message: 'Promoción marcada como reembolsada. El espacio ha quedado libre.',
    promotion: {
      id: Number(promo.id),
      city_id: Number(promo.city_id),
      event_id: Number(promo.event_id),
      venue_id: Number(promo.venue_id),
      editorial_date: toDateString(promo.editorial_date),
      starts_at: new Date(promo.starts_at).toISOString(),
      ends_at: new Date(promo.ends_at).toISOString(),
      price_cents: Number(promo.price_cents),
      status: promo.status,
      created_at: new Date(promo.created_at).toISOString(),
    },
  });
});

/**
 * GET /api/v1/admin/promotions/:id/report
 * Informe post-evento:
 * - Separa nítidamente métricas atribuibles a la promoción (promotion_metrics)
 *   de las métricas acumuladas generales del evento (event_total_metrics)
 * - Restringe las métricas de la promoción a starts_at <= occurred_at < ends_at
 * - No atribuye escaneos de QR a la promoción salvo vinculación explícita (promotion_id)
 * - Denomina los recuentos únicos estrictamente como "sesiones únicas"
 */
adminPromotionsRoutes.get('/promotions/:id/report', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de promoción inválido.' }, 400);
  }

  const format = c.req.query('format')?.toLowerCase();

  // 1. Obtener datos de la promoción, evento y local
  const promoResult = await query(
    `SELECT 
      p.id AS promotion_id,
      p.event_id,
      e.title AS event_title,
      v.name AS venue_name,
      p.editorial_date,
      p.starts_at,
      p.ends_at,
      p.price_cents,
      p.status
    FROM promotions p
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON p.venue_id = v.id
    WHERE p.id = $1
    LIMIT 1;`,
    [promoId]
  );

  if (promoResult.rows.length === 0) {
    return c.json({ error: 'promotion_not_found', message: `Promoción ${promoId} no encontrada.` }, 404);
  }

  const promo = promoResult.rows[0];

  // 2. Métricas atribuibles directamente a la promoción:
  // - promotion_id = $1
  // - occurred_at dentro de la ventana de la promoción (starts_at <= occurred_at < ends_at)
  // - Escaneos de QR de alojamientos solo se cuentan si están explícitamente atribuidos a la promoción
  const promoMetricsSql = `
    SELECT 
      COUNT(*) FILTER (WHERE metric_type = 'impression') AS impressions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'impression' AND session_hash IS NOT NULL) AS unique_impressions,
      COUNT(*) FILTER (WHERE metric_type = 'map_click') AS map_clicks,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'map_click' AND session_hash IS NOT NULL) AS unique_map_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'booking_click') AS booking_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'ticket_click') AS ticket_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'whatsapp_click') AS whatsapp_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'profile_click') AS profile_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'channel_view') AS channel_views,
      COUNT(*) FILTER (WHERE metric_type = 'qr_scan') AS qr_scans,
      COUNT(*) FILTER (WHERE metric_type != 'impression') AS total_actions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type != 'impression' AND session_hash IS NOT NULL) AS unique_action_sessions
    FROM event_metrics
    WHERE promotion_id = $1
      AND occurred_at >= $2
      AND occurred_at < $3;
  `;

  const promoMetricsResult = await query(promoMetricsSql, [promoId, promo.starts_at, promo.ends_at]);
  const pm = promoMetricsResult.rows[0] || {};

  // 3. Métricas acumuladas generales del evento (todas las interacciones orgánicas y promocionales)
  const eventMetricsSql = `
    SELECT 
      COUNT(*) FILTER (WHERE metric_type = 'impression') AS impressions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'impression' AND session_hash IS NOT NULL) AS unique_impressions,
      COUNT(*) FILTER (WHERE metric_type = 'map_click') AS map_clicks,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'map_click' AND session_hash IS NOT NULL) AS unique_map_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'booking_click') AS booking_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'ticket_click') AS ticket_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'whatsapp_click') AS whatsapp_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'profile_click') AS profile_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'channel_view') AS channel_views,
      COUNT(*) FILTER (WHERE metric_type = 'qr_scan') AS qr_scans,
      COUNT(*) FILTER (WHERE metric_type != 'impression') AS total_actions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type != 'impression' AND session_hash IS NOT NULL) AS unique_action_sessions
    FROM event_metrics
    WHERE event_id = $1;
  `;

  const eventMetricsResult = await query(eventMetricsSql, [promo.event_id]);
  const em = eventMetricsResult.rows[0] || {};

  const editorialDateStr = toDateString(promo.editorial_date);
  const generated_at = new Date().toISOString();

  // Valores atribuidos a la promoción
  const promo_impressions = Number(pm.impressions || 0);
  const promo_unique_impressions = Number(pm.unique_impressions || 0);
  const promo_map_clicks = Number(pm.map_clicks || 0);
  const promo_unique_map_clicks = Number(pm.unique_map_clicks || 0);
  const promo_booking_clicks = Number(pm.booking_clicks || 0);
  const promo_ticket_clicks = Number(pm.ticket_clicks || 0);
  const promo_whatsapp_clicks = Number(pm.whatsapp_clicks || 0);
  const promo_profile_clicks = Number(pm.profile_clicks || 0);
  const promo_channel_views = Number(pm.channel_views || 0);
  const promo_qr_scans = Number(pm.qr_scans || 0);
  const promo_total_actions = Number(pm.total_actions || 0);
  const promo_unique_action_sessions = Number(pm.unique_action_sessions || 0);

  // Valores acumulados del evento
  const event_total_impressions = Number(em.impressions || 0);
  const event_total_actions = Number(em.total_actions || 0);

  const whatsappText = buildWhatsAppReportText({
    venue_name: promo.venue_name,
    event_title: promo.event_title,
    editorial_date: editorialDateStr,
    promo_impressions,
    promo_unique_impressions,
    promo_map_clicks,
    promo_unique_map_clicks,
    promo_booking_clicks,
    promo_ticket_clicks,
    promo_whatsapp_clicks,
    promo_profile_clicks,
    promo_channel_views,
    promo_qr_scans,
    promo_total_actions,
    promo_unique_action_sessions,
    event_total_impressions,
    event_total_actions,
  });

  if (format === 'text') {
    return c.text(whatsappText, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }

  return c.json({
    promotion_id: Number(promo.promotion_id),
    event_id: Number(promo.event_id),
    event_title: promo.event_title,
    venue_name: promo.venue_name,
    editorial_date: editorialDateStr,
    starts_at: new Date(promo.starts_at).toISOString(),
    ends_at: new Date(promo.ends_at).toISOString(),
    price_cents: Number(promo.price_cents),
    status: promo.status as PromotionStatus,
    generated_at,
    // Métricas directamente atribuibles a la promoción
    promotion_metrics: {
      impressions: promo_impressions,
      unique_impressions_sessions: promo_unique_impressions,
      map_clicks: promo_map_clicks,
      unique_map_clicks_sessions: promo_unique_map_clicks,
      booking_clicks: promo_booking_clicks,
      ticket_clicks: promo_ticket_clicks,
      whatsapp_clicks: promo_whatsapp_clicks,
      profile_clicks: promo_profile_clicks,
      channel_views: promo_channel_views,
      qr_scans: promo_qr_scans,
      total_actions: promo_total_actions,
      unique_action_sessions: promo_unique_action_sessions,
    },
    // Métricas generales acumuladas del evento
    event_overall_metrics: {
      impressions: event_total_impressions,
      unique_impressions_sessions: Number(em.unique_impressions || 0),
      map_clicks: Number(em.map_clicks || 0),
      unique_map_clicks_sessions: Number(em.unique_map_clicks || 0),
      booking_clicks: Number(em.booking_clicks || 0),
      ticket_clicks: Number(em.ticket_clicks || 0),
      whatsapp_clicks: Number(em.whatsapp_clicks || 0),
      profile_clicks: Number(em.profile_clicks || 0),
      channel_views: Number(em.channel_views || 0),
      qr_scans: Number(em.qr_scans || 0),
      total_actions: event_total_actions,
      unique_action_sessions: Number(em.unique_action_sessions || 0),
    },
    // Claves directas requeridas para compatibilidad estricta con el contrato del Sprint 4
    impressions: promo_impressions,
    unique_impressions: promo_unique_impressions,
    map_clicks: promo_map_clicks,
    unique_map_clicks: promo_unique_map_clicks,
    booking_clicks: promo_booking_clicks,
    ticket_clicks: promo_ticket_clicks,
    whatsapp_clicks: promo_whatsapp_clicks,
    profile_clicks: promo_profile_clicks,
    channel_views: promo_channel_views,
    qr_scans: promo_qr_scans,
    total_actions: promo_total_actions,
    whatsapp_text: whatsappText,
  });
});

/**
 * GET /api/v1/admin/promotions/:id/report/text
 * Endpoint directo para descargar el informe en texto plano listo para WhatsApp
 */
adminPromotionsRoutes.get('/promotions/:id/report/text', async (c) => {
  const promoId = Number(c.req.param('id'));
  if (Number.isNaN(promoId) || promoId <= 0) {
    return c.text('ID de promoción inválido.', 400);
  }

  const promoResult = await query(
    `SELECT 
      p.id AS promotion_id,
      p.event_id,
      e.title AS event_title,
      v.name AS venue_name,
      p.editorial_date,
      p.starts_at,
      p.ends_at,
      p.price_cents,
      p.status
    FROM promotions p
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON p.venue_id = v.id
    WHERE p.id = $1
    LIMIT 1;`,
    [promoId]
  );

  if (promoResult.rows.length === 0) {
    return c.text(`Promoción ${promoId} no encontrada.`, 404);
  }

  const promo = promoResult.rows[0];

  const promoMetricsSql = `
    SELECT 
      COUNT(*) FILTER (WHERE metric_type = 'impression') AS impressions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'impression' AND session_hash IS NOT NULL) AS unique_impressions,
      COUNT(*) FILTER (WHERE metric_type = 'map_click') AS map_clicks,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type = 'map_click' AND session_hash IS NOT NULL) AS unique_map_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'booking_click') AS booking_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'ticket_click') AS ticket_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'whatsapp_click') AS whatsapp_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'profile_click') AS profile_clicks,
      COUNT(*) FILTER (WHERE metric_type = 'channel_view') AS channel_views,
      COUNT(*) FILTER (WHERE metric_type = 'qr_scan') AS qr_scans,
      COUNT(*) FILTER (WHERE metric_type != 'impression') AS total_actions,
      COUNT(DISTINCT session_hash) FILTER (WHERE metric_type != 'impression' AND session_hash IS NOT NULL) AS unique_action_sessions
    FROM event_metrics
    WHERE promotion_id = $1
      AND occurred_at >= $2
      AND occurred_at < $3;
  `;

  const promoMetricsResult = await query(promoMetricsSql, [promoId, promo.starts_at, promo.ends_at]);
  const pm = promoMetricsResult.rows[0] || {};

  const eventMetricsSql = `
    SELECT 
      COUNT(*) FILTER (WHERE metric_type = 'impression') AS impressions,
      COUNT(*) FILTER (WHERE metric_type != 'impression') AS total_actions
    FROM event_metrics
    WHERE event_id = $1;
  `;

  const eventMetricsResult = await query(eventMetricsSql, [promo.event_id]);
  const em = eventMetricsResult.rows[0] || {};

  const whatsappText = buildWhatsAppReportText({
    venue_name: promo.venue_name,
    event_title: promo.event_title,
    editorial_date: toDateString(promo.editorial_date),
    promo_impressions: Number(pm.impressions || 0),
    promo_unique_impressions: Number(pm.unique_impressions || 0),
    promo_map_clicks: Number(pm.map_clicks || 0),
    promo_unique_map_clicks: Number(pm.unique_map_clicks || 0),
    promo_booking_clicks: Number(pm.booking_clicks || 0),
    promo_ticket_clicks: Number(pm.ticket_clicks || 0),
    promo_whatsapp_clicks: Number(pm.whatsapp_clicks || 0),
    promo_profile_clicks: Number(pm.profile_clicks || 0),
    promo_channel_views: Number(pm.channel_views || 0),
    promo_qr_scans: Number(pm.qr_scans || 0),
    promo_total_actions: Number(pm.total_actions || 0),
    promo_unique_action_sessions: Number(pm.unique_action_sessions || 0),
    event_total_impressions: Number(em.impressions || 0),
    event_total_actions: Number(em.total_actions || 0),
  });

  return c.text(whatsappText, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
});
