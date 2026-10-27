import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  computeEditorialLabel,
  formatPriceLabel,
  getCurrentDateInTimezone,
  isValidDateString,
  resolveGoogleMapsUrl,
  serializePlaceItem,
} from '@vayaplan/shared';
import type {
  City,
  PlaceItem,
  PublicEventItem,
  RecurrenceItem,
  WeekendDayAgenda,
  WeekendResponseContract,
} from '@vayaplan/types';
import { hasImageVariantsColumns } from '../services/image-storage';

export const weekendRoutes = new Hono();

const SPANISH_DAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

/**
 * Calcula la fecha (YYYY-MM-DD) del viernes correspondiente al fin de semana
 * Si la fecha base es viernes (5), sábado (6) o domingo (0), se toma ese fin de semana.
 * Si es de lunes a jueves, se toma el viernes más próximo.
 */
function resolveWeekendStartFriday(baseDateStr: string): string {
  const [year, month, day] = baseDateStr.split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = baseDate.getUTCDay();

  let daysToFriday = 0;
  if (dayOfWeek === 5) {
    daysToFriday = 0;
  } else if (dayOfWeek === 6) {
    daysToFriday = -1;
  } else if (dayOfWeek === 0) {
    daysToFriday = -2;
  } else {
    // 1 (Lunes) -> +4, 2 (Martes) -> +3, 3 (Miércoles) -> +2, 4 (Jueves) -> +1
    daysToFriday = 5 - dayOfWeek;
  }

  const friday = new Date(baseDate.getTime() + daysToFriday * 24 * 60 * 60 * 1000);
  return friday.toISOString().split('T')[0];
}

/**
 * Añade N días a una fecha en formato YYYY-MM-DD
 */
function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().split('T')[0];
}

/**
 * GET /api/v1/cities/:citySlug/weekend?start=YYYY-MM-DD
 * Consulta los eventos, recurrencias y planes del fin de semana (viernes, sábado y domingo)
 */
weekendRoutes.get('/cities/:citySlug/weekend', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const startParam = c.req.query('start')?.trim();

  if (!citySlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El parámetro de ciudad es obligatorio.',
      },
      400
    );
  }

  // 1. Verificar existencia y estado de la ciudad
  const cityResult = await query<City>(
    `SELECT id, name, slug, timezone, is_active 
     FROM cities 
     WHERE slug = $1 AND is_active = true 
     LIMIT 1;`,
    [citySlug]
  );

  if (cityResult.rows.length === 0) {
    return c.json(
      {
        error: 'city_not_found',
        message: `La ciudad '${citySlug}' no fue encontrada o está inactiva.`,
      },
      404
    );
  }

  const city = cityResult.rows[0];

  // 2. Determinar la fecha de inicio del fin de semana (viernes)
  let startFriday: string;
  if (startParam) {
    if (!isValidDateString(startParam)) {
      return c.json(
        {
          error: 'invalid_date_format',
          message: 'El formato de fecha de inicio no es válido. Debe ser YYYY-MM-DD.',
        },
        400
      );
    }
    startFriday = startParam;
  } else {
    const todayInTz = getCurrentDateInTimezone(city.timezone);
    startFriday = resolveWeekendStartFriday(todayInTz);
  }

  const saturdayDate = addDays(startFriday, 1);
  const sundayDate = addDays(startFriday, 2);
  const targetDates = [startFriday, saturdayDate, sundayDate];

  const hasVariants = await hasImageVariantsColumns();
  const variantsEventCols = hasVariants
    ? 'e.image_thumb_url,'
    : 'NULL::text AS image_thumb_url,';

  // 3. Consultar los eventos para los tres días del fin de semana
  const eventsSql = `
    SELECT 
      e.id,
      e.title,
      e.description,
      e.category,
      COALESCE(e.time_status, 'confirmed') AS time_status,
      e.start_time,
      e.end_time,
      e.editorial_date,
      e.end_date,
      e.schedule_text,
      e.approximate_schedule,
      e.price_cents,
      e.price_status,
      e.price_note,
      e.price_source,
      e.price_checked_at,
      e.is_free,
      e.image_url,
      ${variantsEventCols}
      e.source_type,
      e.source_url,
      e.status,
      e.verified_at,
      v.id AS venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.latitude AS venue_latitude,
      v.longitude AS venue_longitude,
      v.google_maps_url AS venue_google_maps_url,
      v.whatsapp_contact AS venue_whatsapp_contact,
      p.id AS promotion_id,
      p.price_cents AS promotion_price_cents,
      p.status AS promotion_status
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id 
      AND p.city_id = e.city_id
      AND p.status IN ('active', 'scheduled')
      AND p.starts_at <= now()
      AND p.ends_at > now()
    WHERE e.city_id = $1 
      AND (
        (e.end_date IS NULL AND e.editorial_date = ANY($2::date[])) OR
        (e.end_date IS NOT NULL AND e.editorial_date <= $3 AND e.end_date >= $4)
      )
      AND e.status IN ('published', 'cancelled')
    ORDER BY 
      e.editorial_date ASC,
      (CASE WHEN p.id IS NOT NULL THEN 0 ELSE 1 END) ASC,
      (CASE WHEN COALESCE(e.time_status, 'confirmed') = 'confirmed' THEN 0 ELSE 1 END) ASC,
      e.start_time ASC;
  `;

  const eventsResult = await query(eventsSql, [city.id, targetDates, sundayDate, startFriday]);

  // Agrupar eventos por fecha editorial
  const eventsByDate = new Map<string, PublicEventItem[]>();
  for (const date of targetDates) {
    eventsByDate.set(date, []);
  }

  for (const row of eventsResult.rows) {
    const timeStatus = (row.time_status || 'confirmed') as any;
    const startTimeIso = (row.start_time && timeStatus === 'confirmed')
      ? new Date(row.start_time).toISOString()
      : null;
    const endTimeIso = row.end_time ? new Date(row.end_time).toISOString() : null;
    const editorialDateStr = typeof row.editorial_date === 'string'
      ? row.editorial_date
      : new Date(row.editorial_date).toISOString().split('T')[0];
    const endDateStr = row.end_date
      ? (typeof row.end_date === 'string' ? row.end_date : new Date(row.end_date).toISOString().split('T')[0])
      : null;

    const mapsUrl = resolveGoogleMapsUrl(
      row.venue_google_maps_url,
      row.venue_latitude,
      row.venue_longitude
    );

    const hasOfficialChannel = (row.source_type === 'web' && row.source_url) || false;
    const priceLabel = formatPriceLabel(
      row.price_cents !== null && row.price_cents !== undefined ? Number(row.price_cents) : null,
      row.is_free,
      row.price_status,
      Boolean(hasOfficialChannel)
    );

    const eventItem: PublicEventItem = {
      id: Number(row.id),
      title: row.title,
      description: row.description || null,
      category: row.category,
      time_status: timeStatus,
      start_time: startTimeIso,
      end_time: endTimeIso,
      editorial_date: editorialDateStr,
      editorial_label: computeEditorialLabel(editorialDateStr, startTimeIso),
      end_date: endDateStr,
      schedule_text: row.schedule_text || null,
      approximate_schedule: row.approximate_schedule || null,
      price: {
        amount_cents: row.price_cents !== null && row.price_cents !== undefined ? Number(row.price_cents) : null,
        is_free: row.price_status === 'FREE' || (row.price_cents === 0 && row.price_status !== 'UNKNOWN' && row.price_status !== 'NOT_INFORMED' && row.price_status !== 'CHECK_BOX_OFFICE'),
        status: (row.price_status || 'UNKNOWN') as any,
        note: row.price_note || null,
        label: priceLabel,
      },
      status: row.status,
      venue: {
        id: Number(row.venue_id),
        name: row.venue_name,
        slug: row.venue_slug,
        latitude: row.venue_latitude !== null ? Number(row.venue_latitude) : null,
        longitude: row.venue_longitude !== null ? Number(row.venue_longitude) : null,
        google_maps_url: mapsUrl,
      },
      image_url: row.image_url,
      image_thumb_url: row.image_thumb_url || row.image_url,
      actions: {
        maps_url: mapsUrl,
        booking_url: null,
        tickets_url: row.source_type === 'web' ? row.source_url : null,
        whatsapp_url: null,
      },
      verification: {
        source: row.source_type,
        verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      },
      promotion: row.promotion_id
        ? {
            id: Number(row.promotion_id),
            price_cents: Number(row.promotion_price_cents),
            status: row.promotion_status,
          }
        : null,
      festival: null,
      festivals: [],
    };

    if (endDateStr && editorialDateStr !== endDateStr) {
      for (const date of targetDates) {
        if (date >= editorialDateStr && date <= endDateStr) {
          eventsByDate.get(date)?.push(eventItem);
        }
      }
    } else {
      const targetList = eventsByDate.get(editorialDateStr);
      if (targetList) {
        targetList.push(eventItem);
      }
    }
  }

  // 3.1. Consultar relaciones N:M con festivales activos para los eventos del fin de semana
  const allWeekendEvents: PublicEventItem[] = [];
  for (const list of eventsByDate.values()) {
    allWeekendEvents.push(...list);
  }

  if (allWeekendEvents.length > 0) {
    try {
      const eventIds = allWeekendEvents.map((e) => e.id);
      const festRes = await query(
        `SELECT ef.event_id, f.id, f.name, f.edition, f.slug, f.official_url
         FROM event_festivals ef
         INNER JOIN festivals f ON ef.festival_id = f.id
         WHERE ef.event_id = ANY($1::int[]) AND f.is_active = true
         ORDER BY f.name ASC`,
        [eventIds]
      );
      const festMap = new Map<number, any[]>();
      for (const f of festRes.rows) {
        const eid = Number(f.event_id);
        if (!festMap.has(eid)) festMap.set(eid, []);
        festMap.get(eid)!.push({
          id: Number(f.id),
          name: f.name,
          edition: f.edition || null,
          slug: f.slug,
          official_url: f.official_url || null,
        });
      }
      for (const ev of allWeekendEvents) {
        const linked = festMap.get(ev.id);
        if (linked && linked.length > 0) {
          ev.festivals = linked;
          // ev.festival representa la primera entrada según el orden alfabético definido (f.name ASC)
          // como fallback compatible para consumidores legados, no un festival principal editorial.
          ev.festival = linked[0];
        }
      }
    } catch (err: any) {
      console.error('[GET /weekend] Error al consultar relaciones event_festivals:', {
        message: err?.message,
        code: err?.code,
        eventCount: allWeekendEvents.length,
      });
    }
  }

  // 4. Consultar recurrencias para cada día del fin de semana
  const daysAgenda: WeekendDayAgenda[] = [];

  for (const date of targetDates) {
    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay();
    const dayLabel = SPANISH_DAY_LABELS[dayOfWeek] || 'Día';

    const recurrencesSql = `
      SELECT 
        r.id,
        r.title,
        r.category,
        r.day_of_week,
        r.start_time,
        r.end_time,
        r.price_cents,
        r.is_free,
        v.id AS venue_id,
        v.name AS venue_name
      FROM recurrences r
      INNER JOIN venues v ON r.venue_id = v.id
      WHERE r.city_id = $1 
        AND r.is_active = true
        AND r.day_of_week = EXTRACT(DOW FROM $2::date)
        AND NOT EXISTS (
          SELECT 1 FROM recurrence_exceptions re
          WHERE re.recurrence_id = r.id 
            AND re.exception_date = $2::date
            AND re.status = 'cancelled'
        )
      ORDER BY r.start_time ASC;
    `;

    const recurrencesResult = await query(recurrencesSql, [city.id, date]);

    const recurrences: RecurrenceItem[] = recurrencesResult.rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      category: row.category,
      day_of_week: Number(row.day_of_week),
      start_time: String(row.start_time),
      end_time: row.end_time ? String(row.end_time) : null,
      venue_id: Number(row.venue_id),
      venue_name: row.venue_name,
      is_free: Boolean(row.is_free),
      price_cents: Number(row.price_cents),
    }));

    daysAgenda.push({
      editorial_date: date,
      editorial_label: dayLabel,
      events: eventsByDate.get(date) || [],
      recurrences,
    });
  }

  // 5. Consultar lugares permanentes (places) activos
  const placesSql = `
    SELECT 
      p.id,
      p.name,
      p.slug,
      p.category,
      p.highlight_text,
      p.description,
      p.opening_hours_text,
      p.price_text,
      p.latitude,
      p.longitude,
      p.google_maps_url,
      p.image_url,
      p.image_author,
      p.image_source_url,
      p.image_license,
      p.image_license_url,
      p.image_modifications
    FROM places p
    WHERE p.city_id = $1 AND p.is_active = true
    ORDER BY p.name ASC;
  `;

  const placesResult = await query(placesSql, [city.id]);

  const places: PlaceItem[] = placesResult.rows.map(serializePlaceItem);

  // 6. Construir contrato de respuesta de fin de semana
  const response: WeekendResponseContract = {
    city: {
      slug: city.slug,
      name: city.name,
    },
    start: startFriday,
    days: daysAgenda,
    places,
  };

  return c.json(response);
});
