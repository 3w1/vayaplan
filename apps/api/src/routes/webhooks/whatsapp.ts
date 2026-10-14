import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { getCurrentDateInTimezone, isValidDateString } from '@vayaplan/shared';
import type { EventCategory } from '@vayaplan/types';

export const whatsappWebhookRoutes = new Hono();

const WHATSAPP_VERIFY_TOKEN =
  process.env.WHATSAPP_WEBHOOK_SECRET || 'vayaplan_whatsapp_verify_token_2026';

/**
 * Deduce de forma heurística una categoría a partir del texto del mensaje
 */
function inferCategory(text: string): EventCategory {
  const lower = text.toLowerCase();
  if (lower.includes('dj') || lower.includes('tardeo') || lower.includes('sesión') || lower.includes('sesion')) {
    return 'dj_tardeo';
  }
  if (lower.includes('concierto') || lower.includes('directo') || lower.includes('acústico') || lower.includes('acustico') || lower.includes('banda') || lower.includes('rock')) {
    return 'musica_directo';
  }
  if (lower.includes('monólogo') || lower.includes('monologo') || lower.includes('comedia') || lower.includes('stand up')) {
    return 'monologo';
  }
  if (lower.includes('cine') || lower.includes('película') || lower.includes('pelicula') || lower.includes('proyección')) {
    return 'cine';
  }
  if (lower.includes('teatro') || lower.includes('obra')) {
    return 'teatro';
  }
  if (lower.includes('exposición') || lower.includes('exposicion') || lower.includes('galería') || lower.includes('cuadros')) {
    return 'exposicion';
  }
  return 'cultura';
}

/**
 * GET /api/v1/webhooks/whatsapp
 * Verificación del Webhook de WhatsApp Business en Meta for Developers
 */
whatsappWebhookRoutes.get('/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        source: 'whatsapp_webhook',
        message: 'Webhook de WhatsApp verificado exitosamente por Meta.',
      })
    );
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'whatsapp_webhook',
      message: 'Intento de verificación de webhook fallido (token incorrecto).',
    })
  );

  return c.json({ error: 'forbidden', message: 'Token de verificación inválido.' }, 403);
});

/**
 * POST /api/v1/webhooks/whatsapp
 * Recepción de eventos desde WhatsApp Business (Meta Cloud API o simulación directa)
 * Crea SIEMPRE un borrador en estado 'tentative', NUNCA publica automáticamente.
 */
whatsappWebhookRoutes.post('/whatsapp', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición no es JSON.' }, 400);
  }

  let messageText = '';
  let senderNumber = '';
  let imageUrl: string | null = null;
  let customVenueId: number | null = null;

  // 1. Parsing de formato oficial Meta WhatsApp Cloud API
  if (body?.entry && Array.isArray(body.entry)) {
    try {
      const entry = body.entry[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (message) {
        senderNumber = message.from || '';
        if (message.type === 'text') {
          messageText = message.text?.body || '';
        } else if (message.type === 'image') {
          messageText = message.image?.caption || 'Cartel recibido por WhatsApp';
          imageUrl = message.image?.id ? `https://media.vayaplan.com/incoming-wa/${message.image.id}.webp` : null;
        }
      }
    } catch (e) {}
  }

  // 2. Fallback para simulación directa o testing
  if (!messageText && body.text) {
    messageText = String(body.text).trim();
    senderNumber = String(body.sender || body.from || '+34600000000').trim();
    imageUrl = body.image_url ? String(body.image_url).trim() : null;
    if (body.venue_id) customVenueId = Number(body.venue_id);
  }

  if (!messageText) {
    // Si Meta envía acknowledgments (statuses de entrega, etc.), responder 200 OK sin error
    return c.json({ status: 'ignored', message: 'Notificación sin mensaje procesable.' });
  }

  // 3. Resolución del local (venue)
  let venueId = 9999; // Local de contingencia por defecto
  if (customVenueId && customVenueId > 0) {
    venueId = customVenueId;
  } else if (senderNumber) {
    const cleanNumber = senderNumber.replace(/[^0-9]/g, '');
    const venueCheck = await query(
      `SELECT id FROM venues WHERE whatsapp_contact LIKE '%' || $1 || '%' AND is_active = true LIMIT 1;`,
      [cleanNumber.slice(-9)]
    );
    if (venueCheck.rows.length > 0) {
      venueId = Number(venueCheck.rows[0].id);
    }
  }

  // 4. Determinar título y categoría inferida
  const lines = messageText.split('\n').map((l) => l.trim()).filter(Boolean);
  const titleCandidate = lines[0] || 'Evento recibido por WhatsApp';
  const title = titleCandidate.length > 100 ? titleCandidate.slice(0, 97) + '...' : titleCandidate;
  const category = inferCategory(messageText);

  // 5. Determinar fecha objetivo (próximo fin de semana o hoy)
  const today = getCurrentDateInTimezone('Europe/Madrid');
  const editorialDate = today;
  const startTime = `${editorialDate}T22:30:00.000Z`;

  const dedupeKey = `wa-${venueId}-${Date.now()}`;
  const sourceUrl = senderNumber ? `https://wa.me/${senderNumber.replace(/[^0-9]/g, '')}` : null;

  // 6. Insertar evento SIEMPRE como 'tentative' (regla estricta anti-publicación automática)
  const insertSql = `
    INSERT INTO events (
      city_id, venue_id, title, description, category,
      start_time, editorial_date, price_cents, is_free,
      image_url, source_type, source_url, dedupe_key,
      status, created_at, updated_at
    )
    VALUES (
      1, $1, $2, $3, $4,
      $5, $6, 0, true,
      $7, 'whatsapp', $8, $9,
      'tentative', now(), now()
    )
    RETURNING id, title, status, venue_id;
  `;

  const insertResult = await query(insertSql, [
    venueId,
    title,
    messageText,
    category,
    startTime,
    editorialDate,
    imageUrl,
    sourceUrl,
    dedupeKey,
  ]);

  const createdDraft = insertResult.rows[0];

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'whatsapp_webhook',
      message: `Borrador tentativo creado desde WhatsApp: Evento #${createdDraft.id} ("${createdDraft.title}")`,
      eventId: createdDraft.id,
      venueId: createdDraft.venue_id,
      status: createdDraft.status,
    })
  );

  return c.json(
    {
      status: 'ok',
      message: 'Borrador registrado como tentative pendiente de revisión.',
      draft: createdDraft,
    },
    201
  );
});
