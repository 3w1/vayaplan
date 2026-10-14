import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import { generateAccommodationQrCardSvg, generateQrSvg } from '../../services/qr';
import type { QrSourceItem } from '@vayaplan/types';

export const adminQrRoutes = new Hono();

adminQrRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/qr-sources
 * Listado de todos los alojamientos y fuentes QR con su métrica de escaneos
 */
adminQrRoutes.get('/qr-sources', async (c) => {
  const sql = `
    SELECT 
      qs.id,
      qs.city_id,
      qs.accommodation_name,
      qs.accommodation_type,
      qs.qr_code,
      qs.is_active,
      qs.created_at,
      COUNT(em.id) AS total_scans
    FROM qr_sources qs
    LEFT JOIN event_metrics em ON em.metric_type = 'qr_scan' AND (em.metadata->>'qr_code' = qs.qr_code)
    GROUP BY qs.id
    ORDER BY qs.created_at DESC;
  `;

  const result = await query(sql);
  const qrSources: QrSourceItem[] = result.rows.map((row) => ({
    id: Number(row.id),
    city_id: Number(row.city_id),
    accommodation_name: row.accommodation_name,
    accommodation_type: row.accommodation_type,
    qr_code: row.qr_code,
    is_active: Boolean(row.is_active),
    created_at: new Date(row.created_at).toISOString(),
    total_scans: Number(row.total_scans || 0),
  }));

  return c.json({ total: qrSources.length, qr_sources: qrSources });
});

/**
 * POST /api/v1/admin/qr-sources
 * Registrar un nuevo alojamiento para captación turística con código QR
 */
adminQrRoutes.post('/qr-sources', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const accommodationName = body.accommodation_name?.trim();
  const accommodationType = body.accommodation_type?.trim() || 'hotel'; // hotel, apartamento, hostal, casa_rural
  const customQrCode = body.qr_code?.trim()?.toLowerCase()?.replace(/[^a-z0-9_-]/g, '-');

  if (!accommodationName || accommodationName.length < 3) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre del alojamiento es obligatorio.' }, 400);
  }

  // Generar código QR único si no se suministró uno manual
  const qrCode = customQrCode || `palencia-${accommodationName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 24)}-${Date.now().toString(36)}`;

  const insertSql = `
    INSERT INTO qr_sources (
      city_id, accommodation_name, accommodation_type, qr_code, is_active, created_at
    )
    VALUES ($1, $2, $3, $4, true, now())
    RETURNING id, qr_code, accommodation_name;
  `;

  try {
    const result = await query(insertSql, [cityId, accommodationName, accommodationType, qrCode]);
    return c.json({ status: 'ok', qr_source: result.rows[0] }, 201);
  } catch (err: any) {
    return c.json({ error: 'db_error', message: err?.message || 'Error al guardar fuente QR.' }, 500);
  }
});

/**
 * GET /api/v1/admin/qr-sources/:id/svg
 * Descarga o visualiza la tarjeta imprimible SVG del código QR para el alojamiento
 */
adminQrRoutes.get('/qr-sources/:id/svg', async (c) => {
  const id = Number(c.req.param('id'));
  const format = c.req.query('format') || 'card'; // 'card' o 'raw'

  const result = await query(
    `SELECT id, accommodation_name, qr_code FROM qr_sources WHERE id = $1 LIMIT 1;`,
    [id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Fuente QR no encontrada.' }, 404);
  }

  const row = result.rows[0];
  const targetUrl = `https://vayaplan.com/qr/${row.qr_code}`;

  let svgContent: string;
  if (format === 'raw') {
    svgContent = await generateQrSvg(targetUrl);
  } else {
    svgContent = await generateAccommodationQrCardSvg(row.accommodation_name, row.qr_code, targetUrl);
  }

  return new Response(svgContent, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `inline; filename="vayaplan-qr-${row.qr_code}.svg"`,
      'Cache-Control': 'no-cache',
    },
  });
});
