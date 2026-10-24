import { Hono } from 'hono';
import { query, getClient } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import {
  VALID_EVENT_CATEGORIES,
  isValidDateString,
  normalizePrice,
} from '@vayaplan/shared';
import type { AdminUser } from '@vayaplan/types';
import {
  SALA_INFINITY_VENUE_ID,
  contrastProposalWithTaquilla,
  fetchSalaInfinityTaquillaEvents,
  type TaquillaEventMetadata,
} from '../../services/bar-instagram-import/taquilla-contrast';

let cachedTaquillaEvents: TaquillaEventMetadata[] | null = null;
let lastTaquillaFetch = 0;
const TAQUILLA_CACHE_TTL = 5 * 60 * 1000; // 5 minutos de caché en memoria

export async function getCachedTaquillaEvents(): Promise<TaquillaEventMetadata[]> {
  const now = Date.now();
  if (cachedTaquillaEvents && now - lastTaquillaFetch < TAQUILLA_CACHE_TTL) {
    return cachedTaquillaEvents;
  }
  const events = await fetchSalaInfinityTaquillaEvents();
  if (events.length > 0) {
    cachedTaquillaEvents = events;
    lastTaquillaFetch = now;
  }
  return events;
}

export const adminProposalsRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

// Todas las rutas de propuestas requieren autenticación administrativa
adminProposalsRoutes.use('*', requireAdminAuth);

/**
 * Validador para asegurar que la URL de imagen pertenece a Cloudflare R2
 * y no a una CDN externa/efímera de Instagram.
 */
export function isValidR2ImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (
    clean.includes('cdninstagram.com') ||
    clean.includes('fbcdn.net') ||
    clean.includes('instagram.com') ||
    clean.includes('threads.net')
  ) {
    return false;
  }
  return (
    clean.startsWith('https://media.vayaplan.com/') ||
    clean.startsWith('http://media.vayaplan.com/') ||
    clean.startsWith('https://vayaplan-media') ||
    clean.includes('.r2.dev') ||
    clean.startsWith('bars/')
  );
}

/**
 * Extrae la clave normalizada del objeto R2 a partir de una URL (pública, prefirmada o clave relativa).
 */
export function extractR2Key(urlOrKey: string): string {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const trimmed = urlOrKey.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\/+/, '');
  } catch {
    return trimmed.replace(/^\/+/, '').split('?')[0];
  }
}

/**
 * Valida que la URL de imagen coincida exactamente con la r2_key (u objeto subyacente) de la propuesta.
 */
export function validateImageMatchesProposalR2(
  imageUrl: string,
  proposalR2Key?: string | null,
  proposalImageUrl?: string | null
): boolean {
  if (!imageUrl) return false;

  const targetKey = extractR2Key(imageUrl);
  if (!targetKey) return false;

  const expectedKey = proposalR2Key
    ? extractR2Key(proposalR2Key)
    : proposalImageUrl
    ? extractR2Key(proposalImageUrl)
    : '';

  if (!expectedKey) return false;

  return decodeURIComponent(targetKey) === decodeURIComponent(expectedKey);
}

/**
 * GET /api/v1/admin/proposals
 * Lista propuestas con filtros y ordenación estricta:
 * 1. proposed_date ASC
 * 2. confidence DESC (ALTA > MEDIA > BAJA)
 * 3. created_at DESC
 */
adminProposalsRoutes.get('/proposals', async (c) => {
  const reviewStatus = c.req.query('review_status');
  const venueId = c.req.query('venue_id');
  const date = c.req.query('date');
  const category = c.req.query('category');
  const confidence = c.req.query('confidence');
  const classification = c.req.query('classification');
  const priceStatus = c.req.query('price_status');

  const conditions: string[] = [];
  const params: any[] = [];

  if (reviewStatus) {
    params.push(reviewStatus);
    conditions.push(`p.review_status = $${params.length}`);
  }

  if (venueId) {
    const vId = parseInt(venueId, 10);
    if (!isNaN(vId)) {
      params.push(vId);
      conditions.push(`p.venue_id = $${params.length}`);
    }
  }

  if (date && isValidDateString(date)) {
    params.push(date);
    conditions.push(`p.proposed_date = $${params.length}`);
  }

  if (category) {
    params.push(category);
    conditions.push(`p.category = $${params.length}`);
  }

  if (confidence) {
    params.push(confidence.toUpperCase());
    conditions.push(`p.confidence = $${params.length}`);
  }

  if (classification) {
    params.push(classification);
    conditions.push(`p.classification = $${params.length}`);
  }

  if (priceStatus) {
    params.push(priceStatus);
    conditions.push(`p.price_status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      p.id,
      p.title,
      p.proposed_date,
      p.proposed_time,
      p.proposed_end_date,
      p.proposed_end_time,
      p.venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.address AS venue_address,
      p.category,
      p.price,
      p.price_status,
      p.price_note,
      p.price_source,
      p.price_checked_at,
      p.caption,
      p.source_url,
      p.source_type,
      p.instagram_username,
      p.instagram_post_shortcode,
      p.r2_key,
      p.image_url,
      p.image_width,
      p.image_height,
      p.image_content_type,
      p.image_size_bytes,
      p.confidence,
      p.dedupe_key,
      p.classification,
      p.review_status,
      p.requires_manual_review,
      p.reviewed_by,
      p.reviewed_at,
      p.rejection_reason,
      p.created_event_id,
      p.matched_event_id,
      p.match_level,
      p.match_reasons,
      me.title AS matched_event_title,
      me.status AS matched_event_status,
      me.editorial_date AS matched_event_date,
      p.created_at,
      p.updated_at
    FROM curation_proposals p
    LEFT JOIN venues v ON p.venue_id = v.id
    LEFT JOIN events me ON p.matched_event_id = me.id
    ${whereClause}
    ORDER BY 
      p.proposed_date ASC NULLS LAST,
      CASE p.confidence 
        WHEN 'ALTA' THEN 1 
        WHEN 'MEDIA' THEN 2 
        WHEN 'BAJA' THEN 3 
        ELSE 4 
      END ASC,
      p.created_at DESC;
  `;

  const result = await query(sql, params);
  const rows = result.rows;

  // Contraste con Taquilla.com para Sala Infinity: solo se ejecuta bajo demanda explícita
  // para evitar sobrecargar o ralentizar la carga general de la bandeja de curación
  const includeTaquilla = c.req.query('include_taquilla') === 'true';
  if (includeTaquilla) {
    const hasInfinity = rows.some((r) => r.venue_id === SALA_INFINITY_VENUE_ID);
    if (hasInfinity) {
      try {
        const taquillaEvents = await getCachedTaquillaEvents();
        for (const p of rows) {
          if (p.venue_id === SALA_INFINITY_VENUE_ID) {
            p.taquilla_contrast = contrastProposalWithTaquilla(
              {
                venueId: p.venue_id,
                title: p.title,
                proposedDate: p.proposed_date,
                proposedTime: p.proposed_time,
                price: p.price,
                caption: p.caption,
              },
              taquillaEvents
            );
          }
        }
      } catch {
        // Degradar graciosamente sin bloquear la consulta administrativa
      }
    }
  }

  return c.json({
    proposals: rows,
    total: rows.length,
  });
});

/**
 * GET /api/v1/admin/proposals/:id
 * Detalle individual de una propuesta
 */
adminProposalsRoutes.get('/proposals/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  const sql = `
    SELECT 
      p.*,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.address AS venue_address
    FROM curation_proposals p
    LEFT JOIN venues v ON p.venue_id = v.id
    WHERE p.id = $1;
  `;

  const result = await query(sql, [id]);
  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }

  const proposal = result.rows[0];
  if (proposal.venue_id === SALA_INFINITY_VENUE_ID) {
    try {
      const taquillaEvents = await getCachedTaquillaEvents();
      proposal.taquilla_contrast = contrastProposalWithTaquilla(
        {
          venueId: proposal.venue_id,
          title: proposal.title,
          proposedDate: proposal.proposed_date,
          proposedTime: proposal.proposed_time,
          price: proposal.price,
          caption: proposal.caption,
        },
        taquillaEvents
      );
    } catch {
      // Degradar graciosamente
    }
  }

  return c.json({ proposal });
});

/**
 * GET /api/v1/admin/proposals/:id/taquilla-contrast
 * Devuelve el contraste editorial específico para una propuesta frente a Taquilla.com
 */
adminProposalsRoutes.get('/proposals/:id/taquilla-contrast', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  const res = await query(`SELECT * FROM curation_proposals WHERE id = $1;`, [id]);
  if (res.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }
  const prop = res.rows[0];

  if (prop.venue_id !== SALA_INFINITY_VENUE_ID) {
    return c.json({
      isApplicableVenue: false,
      message: 'La fuente de contraste Taquilla.com está asociada exclusivamente al venue Sala Infinity (ID 10052).',
    });
  }

  const taquillaEvents = await getCachedTaquillaEvents();
  const contrast = contrastProposalWithTaquilla(
    {
      venueId: prop.venue_id,
      title: prop.title,
      proposedDate: prop.proposed_date,
      proposedTime: prop.proposed_time,
      price: prop.price,
      caption: prop.caption,
    },
    taquillaEvents
  );

  return c.json({
    proposalId: id,
    contrast,
  });
});

/**
 * POST /api/v1/admin/proposals/:id/approve
 * Aprueba una propuesta y crea un evento en estado DRAFT (nunca publicado)
 */
adminProposalsRoutes.post('/proposals/:id/approve', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  const propRes = await query(`SELECT * FROM curation_proposals WHERE id = $1;`, [id]);
  if (propRes.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }
  const proposal = propRes.rows[0];

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  // Regla editorial: El contenido clasificado como CONTENIDO_VENUE no puede convertirse en evento
  if (proposal.classification === 'CONTENIDO_VENUE') {
    return c.json({
      error: 'cannot_approve_venue_content',
      message: 'El contenido clasificado como CONTENIDO_VENUE no puede aprobarse como evento de agenda. Puede conservarse o archivarse como material del local.',
    }, 400);
  }

  const effectiveTitle = (body.title || proposal.title || '').trim();
  const effectiveDate = (body.proposed_date || proposal.proposed_date || '').trim();
  const effectiveTime =
    body.proposed_time !== undefined
      ? body.proposed_time
      : proposal.proposed_time;
  const effectiveVenueId =
    body.venue_id !== undefined ? parseInt(body.venue_id, 10) : proposal.venue_id;
  const effectiveCategory = (body.category || proposal.category || 'dj_tardeo').trim();

  // Soporte de eventos continuos / exposiciones
  const isContinuous =
    proposal.classification === 'EVENTO_CONTINUO' ||
    body.is_continuous === true ||
    (body.proposed_end_date && body.proposed_end_date !== effectiveDate) ||
    (body.end_date && body.end_date !== effectiveDate);

  const effectiveEndDate = (
    body.end_date ||
    body.proposed_end_date ||
    proposal.proposed_end_date ||
    null
  );

  if (effectiveEndDate && !isValidDateString(effectiveEndDate)) {
    return c.json({ error: 'invalid_end_date', message: 'La fecha de fin debe ser válida (YYYY-MM-DD).' }, 400);
  }
  if (effectiveEndDate && effectiveEndDate < effectiveDate) {
    return c.json({ error: 'invalid_end_date_range', message: 'La fecha de fin no puede ser anterior a la fecha de inicio.' }, 400);
  }

  // Normalización defensiva de estado de precio y céntimos
  let effectivePriceStatus: any = body.price_status || proposal.price_status || 'UNKNOWN';
  let effectivePriceCents: number | null = null;
  let isFree = false;

  if (effectivePriceStatus === 'FREE') {
    effectivePriceCents = 0;
    isFree = true;
  } else if (effectivePriceStatus === 'CHECK_BOX_OFFICE' || effectivePriceStatus === 'NOT_INFORMED') {
    effectivePriceCents = null;
    isFree = false;
  } else if (effectivePriceStatus === 'CONFIRMED') {
    try {
      const rawPriceInput =
        body.price !== undefined
          ? body.price
          : body.price_cents !== undefined
          ? (Number(body.price_cents) / 100).toFixed(2)
          : proposal.price !== null
          ? proposal.price
          : '0';
      const norm = normalizePrice(rawPriceInput);
      effectivePriceCents = norm.priceCents;
      isFree = norm.priceCents === 0;
      if (isFree) {
        effectivePriceStatus = 'FREE';
      }
    } catch (priceErr: any) {
      return c.json({
        error: 'invalid_price',
        message: `Precio inválido: ${priceErr.message}`,
      }, 400);
    }
  } else {
    // UNKNOWN o sin estado previo
    if (body.price !== undefined || body.price_cents !== undefined || (proposal.price !== null && proposal.price !== undefined)) {
      try {
        const rawPriceInput =
          body.price !== undefined
            ? body.price
            : body.price_cents !== undefined
            ? (Number(body.price_cents) / 100).toFixed(2)
            : proposal.price !== null
            ? proposal.price
            : '0';
        const norm = normalizePrice(rawPriceInput);
        effectivePriceCents = norm.priceCents;
        isFree = norm.priceCents === 0;
        effectivePriceStatus = norm.priceCents > 0 ? 'CONFIRMED' : 'UNKNOWN';
      } catch {
        effectivePriceCents = null;
        effectivePriceStatus = 'UNKNOWN';
      }
    }
  }

  const effectivePriceNote = body.price_note !== undefined ? body.price_note : (proposal.price_note || null);
  const effectiveImageUrl = (body.image_url || proposal.image_url || '').trim();
  const effectiveDescription = (body.description || proposal.caption || '').trim();

  // Validaciones obligatorias
  // 1. Título, fecha y venue
  if (!effectiveTitle) {
    return c.json({ error: 'missing_title', message: 'El título del evento es obligatorio para aprobar la propuesta.' }, 400);
  }
  if (!effectiveDate || !isValidDateString(effectiveDate)) {
    return c.json({ error: 'missing_date', message: 'La fecha del evento debe ser válida (YYYY-MM-DD).' }, 400);
  }
  if (!effectiveVenueId || isNaN(effectiveVenueId)) {
    return c.json({ error: 'missing_venue', message: 'El local (venue) es obligatorio para aprobar la propuesta.' }, 400);
  }

  // 2. Verificar que el venue existe en el catálogo
  const venueCheck = await query(`SELECT id, name FROM venues WHERE id = $1 AND is_active = true;`, [effectiveVenueId]);
  if (venueCheck.rows.length === 0) {
    return c.json({ error: 'venue_not_found', message: `El venue con ID ${effectiveVenueId} no existe o no está activo.` }, 400);
  }

  // 3. Validar hora según tipo de evento (puntual vs continuo)
  let timeStatus = 'confirmed';
  let startTimeIso: string | null = null;
  let scheduleText: string | null = null;

  if (isContinuous) {
    timeStatus = 'continuous';
    startTimeIso = null;
    if (body.schedule_text) {
      scheduleText = String(body.schedule_text).trim();
    } else if (body.start_time || effectiveTime) {
      const st = (body.start_time || effectiveTime).trim();
      const et = (body.end_time || body.proposed_end_time || proposal.proposed_end_time || '').trim();
      scheduleText = et ? `${st} - ${et}` : `${st}h`;
    }
  } else {
    // Evento puntual: hora obligatoria (HH:mm) para crear el borrador
    if (!effectiveTime || typeof effectiveTime !== 'string' || effectiveTime.trim() === '') {
      return c.json({
        error: 'missing_time',
        message: 'La hora del evento es obligatoria para poder aprobar el borrador. Añada una hora válida (HH:mm).',
      }, 400);
    }

    const timeMatch = effectiveTime.trim().match(/^([012]?\d):([0-5]\d)(?::[0-5]\d)?$/);
    if (!timeMatch) {
      return c.json({ error: 'invalid_time', message: 'El formato de hora debe ser HH:mm (ej: 22:30).' }, 400);
    }
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2].padStart(2, '0');
    timeStatus = 'confirmed';
    startTimeIso = `${effectiveDate}T${hh}:${mm}:00+02:00`;
    scheduleText = `${hh}:${mm}h`;
  }

  // 4. Validar que la imagen provenga de Cloudflare R2
  if (!isValidR2ImageUrl(effectiveImageUrl)) {
    return c.json({
      error: 'invalid_image_source',
      message: 'La imagen debe estar alojada en Cloudflare R2 (media.vayaplan.com). No se permiten URLs de CDN de Instagram.',
    }, 400);
  }

  // 4.b Validar que la imagen corresponde exactamente a la r2_key de la propuesta
  if (!validateImageMatchesProposalR2(effectiveImageUrl, proposal.r2_key, proposal.image_url)) {
    return c.json({
      error: 'image_mismatch',
      message: 'La imagen no corresponde a la propuesta.',
    }, 422);
  }

  // 5. Validar deduplicación
  const normTitle = effectiveTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const dedupeKey = proposal.dedupe_key || `instagram#${effectiveVenueId}#${effectiveDate}#${effectiveTime || 'sin-hora'}#${normTitle}`;

  // Comprobar colisión por dedupe_key o por venue + fecha + título
  const dupCheck = await query(
    `SELECT id, title, editorial_date, status, venue_id
     FROM events
     WHERE (dedupe_key = $1 OR (venue_id = $2 AND editorial_date = $3 AND LOWER(TRIM(title)) = LOWER(TRIM($4))))
     LIMIT 1;`,
    [dedupeKey, effectiveVenueId, effectiveDate, effectiveTitle]
  );

  if (dupCheck.rows.length > 0) {
    const dup = dupCheck.rows[0];
    return c.json(
      {
        error: 'duplicate_event',
        message: `Ya existe un evento idéntico en el catálogo (ID ${dup.id}, "${dup.title}", estado: ${dup.status}). No se creará duplicado.`,
        existingEvent: {
          id: dup.id,
          title: dup.title,
          editorial_date: dup.editorial_date,
          status: dup.status,
          venue_id: dup.venue_id,
        },
      },
      409
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Crear evento en estado STRICTLY DRAFT
    const insertEventSql = `
      INSERT INTO events (
        city_id,
        venue_id,
        title,
        description,
        category,
        start_time,
        time_status,
        schedule_text,
        editorial_date,
        end_date,
        price_cents,
        price_status,
        price_note,
        price_source,
        price_checked_at,
        is_free,
        image_url,
        source_type,
        source_url,
        dedupe_key,
        status,
        verified_by,
        verified_at,
        created_at,
        updated_at
      ) VALUES (
        1,
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        NOW(),
        $14,
        $15,
        $16,
        $17,
        $18,
        'draft',
        $19,
        NOW(),
        NOW(),
        NOW()
      ) RETURNING *;
    `;

    const userEmail = c.get('user')?.email || 'admin@vayaplan.com';
    const eventRes = await client.query(insertEventSql, [
      effectiveVenueId,
      effectiveTitle,
      effectiveDescription,
      effectiveCategory,
      startTimeIso,
      timeStatus,
      scheduleText,
      effectiveDate,
      effectiveEndDate,
      effectivePriceCents,
      effectivePriceStatus,
      effectivePriceNote,
      proposal.source_type || 'curation_proposal',
      isFree,
      effectiveImageUrl,
      proposal.source_type || 'instagram',
      proposal.source_url,
      dedupeKey,
      userEmail,
    ]);
    const createdEvent = eventRes.rows[0];

    // Actualizar propuesta en curation_proposals
    const updatePropSql = `
      UPDATE curation_proposals
      SET 
        title = $1,
        proposed_date = $2,
        proposed_time = $3,
        proposed_end_date = $4,
        venue_id = $5,
        category = $6,
        price = $7,
        price_status = $8,
        price_note = $9,
        image_url = $10,
        review_status = 'approved_draft',
        requires_manual_review = false,
        reviewed_by = $11,
        reviewed_at = NOW(),
        created_event_id = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING *;
    `;

    const propUpdateRes = await client.query(updatePropSql, [
      effectiveTitle,
      effectiveDate,
      effectiveTime || null,
      effectiveEndDate,
      effectiveVenueId,
      effectiveCategory,
      effectivePriceCents !== null ? Number((effectivePriceCents / 100).toFixed(2)) : (isFree ? 0 : null),
      effectivePriceStatus,
      effectivePriceNote,
      effectiveImageUrl,
      userEmail,
      createdEvent.id,
      id,
    ]);

    await client.query('COMMIT');

    return c.json({
      success: true,
      message: `Propuesta aprobada con éxito. Se ha creado el evento borrador ID ${createdEvent.id}.`,
      proposal: propUpdateRes.rows[0],
      createdEvent: {
        id: createdEvent.id,
        title: createdEvent.title,
        status: createdEvent.status, // 'draft'
        editorial_date: createdEvent.editorial_date,
        start_time: createdEvent.start_time,
        time_status: createdEvent.time_status,
        venue_id: createdEvent.venue_id,
        category: createdEvent.category,
        image_url: createdEvent.image_url,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error al aprobar propuesta:', err);
    return c.json({ error: 'internal_error', message: err.message }, 500);
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/proposals/:id/reject
 * Rechaza una propuesta con motivo obligatorio (no crea evento)
 */
adminProposalsRoutes.post('/proposals/:id/reject', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const reason = (body.rejection_reason || body.reason || '').trim();
  if (!reason) {
    return c.json({
      error: 'missing_rejection_reason',
      message: 'Es obligatorio indicar un motivo de rechazo.',
    }, 400);
  }

  const userEmail = c.get('user')?.email || 'admin@vayaplan.com';
  const result = await query(
    `UPDATE curation_proposals
     SET 
       review_status = 'rejected',
       requires_manual_review = false,
       rejection_reason = $1,
       reviewed_by = $2,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $3
     RETURNING *;`,
    [reason, userEmail, id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }

  return c.json({
    success: true,
    message: 'Propuesta rechazada.',
    proposal: result.rows[0],
  });
});

/**
 * POST /api/v1/admin/proposals/:id/archive
 * Archiva una propuesta (no crea evento)
 */
adminProposalsRoutes.post('/proposals/:id/archive', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  const userEmail = c.get('user')?.email || 'admin@vayaplan.com';
  const result = await query(
    `UPDATE curation_proposals
     SET 
       review_status = 'archived',
       requires_manual_review = false,
       reviewed_by = $1,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $2
     RETURNING *;`,
    [userEmail, id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }

  return c.json({
    success: true,
    message: 'Propuesta archivada.',
    proposal: result.rows[0],
  });
});

/**
 * POST /api/v1/admin/proposals/:id/promotion
 * Marca una propuesta como promoción comercial (no crea evento)
 */
adminProposalsRoutes.post('/proposals/:id/promotion', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  const userEmail = c.get('user')?.email || 'admin@vayaplan.com';
  const result = await query(
    `UPDATE curation_proposals
     SET 
       review_status = 'promotion',
       classification = 'PROMOCION',
       requires_manual_review = false,
       reviewed_by = $1,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $2
     RETURNING *;`,
    [userEmail, id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }

  return c.json({
    success: true,
    message: 'Propuesta clasificada como promoción comercial.',
    proposal: result.rows[0],
  });
});

/**
 * POST /api/v1/admin/proposals/:id/link-event
 * Vincula una propuesta (ej. DUPLICADO_POSIBLE) a un evento ya existente/publicado.
 * Requiere confirmación humana explícita.
 * NO crea ningún evento nuevo en el catálogo.
 */
adminProposalsRoutes.post('/proposals/:id/link-event', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo JSON inválido' }, 400);
  }

  const targetEventId = parseInt(body.target_event_id, 10);
  if (!targetEventId || isNaN(targetEventId)) {
    return c.json({
      error: 'missing_target_event',
      message: 'Debe especificar el ID del evento existente al que desea vincular la propuesta.',
    }, 400);
  }

  // Verificar que la propuesta existe
  const propRes = await query(`SELECT * FROM curation_proposals WHERE id = $1;`, [id]);
  if (propRes.rows.length === 0) {
    return c.json({ error: 'not_found', message: `Propuesta con ID ${id} no encontrada.` }, 404);
  }

  // Verificar que el evento destino existe
  const evRes = await query(`SELECT id, title, editorial_date, status, venue_id FROM events WHERE id = $1;`, [targetEventId]);
  if (evRes.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento con ID ${targetEventId} no existe en el catálogo.` }, 404);
  }
  const targetEvent = evRes.rows[0];

  const user = c.get('user');
  const userEmail = user?.email || 'admin@vayaplan.com';

  // Actualizar la propuesta vinculándola al evento existente sin crear duplicado
  const updateRes = await query(
    `UPDATE curation_proposals
     SET review_status = 'approved_draft',
         requires_manual_review = false,
         created_event_id = $1,
         matched_event_id = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *;`,
    [targetEventId, userEmail, id]
  );

  return c.json({
    success: true,
    message: `Propuesta #${id} vinculada exitosamente al evento existente #${targetEventId} ("${targetEvent.title}"). No se ha creado ningún evento duplicado.`,
    proposal: updateRes.rows[0],
    linkedEvent: targetEvent,
  });
});

/**
 * PATCH /api/v1/admin/proposals/:id
 * Edición previa de campos antes de la aprobación
 */
adminProposalsRoutes.patch('/proposals/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID de propuesta no válido' }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo JSON inválido' }, 400);
  }

  const fields: string[] = [];
  const params: any[] = [];

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return c.json({ error: 'empty_title', message: 'El título no puede estar vacío.' }, 400);
    params.push(t);
    fields.push(`title = $${params.length}`);
  }

  if (body.proposed_date !== undefined) {
    const d = body.proposed_date ? String(body.proposed_date).trim() : null;
    if (d && !isValidDateString(d)) {
      return c.json({ error: 'invalid_date', message: 'Formato de fecha inválido (YYYY-MM-DD).' }, 400);
    }
    params.push(d);
    fields.push(`proposed_date = $${params.length}`);
  }

  if (body.proposed_time !== undefined) {
    const tm = body.proposed_time ? String(body.proposed_time).trim() : null;
    if (tm && !/^([012]?\d):([0-5]\d)$/.test(tm)) {
      return c.json({ error: 'invalid_time', message: 'Formato de hora inválido (HH:mm).' }, 400);
    }
    params.push(tm);
    fields.push(`proposed_time = $${params.length}`);
  }

  if (body.proposed_end_date !== undefined) {
    const ed = body.proposed_end_date ? String(body.proposed_end_date).trim() : null;
    if (ed && !isValidDateString(ed)) {
      return c.json({ error: 'invalid_end_date', message: 'Formato de fecha de fin inválido (YYYY-MM-DD).' }, 400);
    }
    params.push(ed);
    fields.push(`proposed_end_date = $${params.length}`);
  }

  if (body.proposed_end_time !== undefined) {
    const etm = body.proposed_end_time ? String(body.proposed_end_time).trim() : null;
    if (etm && !/^([012]?\d):([0-5]\d)$/.test(etm)) {
      return c.json({ error: 'invalid_end_time', message: 'Formato de hora de fin inválido (HH:mm).' }, 400);
    }
    params.push(etm);
    fields.push(`proposed_end_time = $${params.length}`);
  }

  if (body.price_status !== undefined) {
    const ps = String(body.price_status).trim();
    const validStatuses = ['UNKNOWN', 'FREE', 'NOT_INFORMED', 'CHECK_BOX_OFFICE', 'CONFIRMED'];
    if (!validStatuses.includes(ps)) {
      return c.json({ error: 'invalid_price_status', message: `Estado de precio inválido: ${ps}` }, 400);
    }
    params.push(ps);
    fields.push(`price_status = $${params.length}`);
  }

  if (body.price_note !== undefined) {
    const pn = body.price_note !== null ? String(body.price_note).trim() : null;
    params.push(pn);
    fields.push(`price_note = $${params.length}`);
  }

  if (body.classification !== undefined) {
    const cls = String(body.classification).trim();
    params.push(cls);
    fields.push(`classification = $${params.length}`);
  }

  if (body.venue_id !== undefined) {
    const vId = body.venue_id !== null ? parseInt(body.venue_id, 10) : null;
    if (vId !== null) {
      const vExists = await query(`SELECT id FROM venues WHERE id = $1;`, [vId]);
      if (vExists.rows.length === 0) {
        return c.json({ error: 'venue_not_found', message: `Venue ID ${vId} no existe.` }, 400);
      }
    }
    params.push(vId);
    fields.push(`venue_id = $${params.length}`);
  }

  if (body.category !== undefined) {
    const cat = String(body.category).trim();
    params.push(cat);
    fields.push(`category = $${params.length}`);
  }

  if (body.price !== undefined || body.price_cents !== undefined) {
    if (body.price === null && body.price_cents === undefined) {
      params.push(null);
      fields.push(`price = $${params.length}`);
    } else {
      const rawVal =
        body.price !== undefined
          ? body.price
          : (Number(body.price_cents) / 100).toFixed(2);
      try {
        const norm = normalizePrice(rawVal);
        params.push(norm.amount);
        fields.push(`price = $${params.length}`);
      } catch (err: any) {
        return c.json({ error: 'invalid_price', message: `Precio inválido: ${err.message}` }, 400);
      }
    }
  }

  if (body.image_url !== undefined) {
    const img = String(body.image_url).trim();
    if (!isValidR2ImageUrl(img)) {
      return c.json({
        error: 'invalid_image_source',
        message: 'La imagen debe estar alojada en Cloudflare R2.',
      }, 400);
    }
    params.push(img);
    fields.push(`image_url = $${params.length}`);
  }

  if (fields.length === 0) {
    return c.json({ message: 'No hay campos que actualizar' });
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const sql = `
    UPDATE curation_proposals
    SET ${fields.join(', ')}
    WHERE id = $${params.length}
    RETURNING *;
  `;

  const result = await query(sql, params);
  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Propuesta no encontrada' }, 404);
  }

  return c.json({
    success: true,
    message: 'Propuesta editada con éxito.',
    proposal: result.rows[0],
  });
});
