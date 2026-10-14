import { Hono } from 'hono';
import { query } from '@vayaplan/db';

export const qrRedirectRoutes = new Hono();

async function recordQrScanMetric(qrCode: string, sessionHash?: string | null): Promise<boolean> {
  try {
    const qrResult = await query(
      `SELECT id, accommodation_name, is_active FROM qr_sources WHERE qr_code = $1 LIMIT 1;`,
      [qrCode]
    );

    const accommodationName = qrResult.rows.length > 0 ? qrResult.rows[0].accommodation_name : 'Alojamiento no registrado';
    const sourceId = qrResult.rows.length > 0 ? qrResult.rows[0].id : null;

    const metadata = JSON.stringify({
      qr_code: qrCode,
      accommodation_name: accommodationName,
      source_id: sourceId,
    });

    const insertSql = `
      INSERT INTO event_metrics (
        event_id, promotion_id, metric_type, channel,
        session_hash, occurred_at, metadata
      )
      VALUES (
        NULL, NULL, 'qr_scan', 'qr_hotel',
        $1, now(), $2
      );
    `;

    await query(insertSql, [sessionHash || null, metadata]);
    return true;
  } catch (err: any) {
    console.error('Error registrando métrica qr_scan:', err?.message || err);
    return false;
  }
}

/**
 * GET /qr/:qrCode y GET /api/v1/qr/:qrCode
 * Registra el escaneo y redirige (302) a la home con el parámetro origin=qr_hotel
 */
qrRedirectRoutes.get('/:qrCode', async (c) => {
  const qrCode = c.req.param('qrCode')?.trim();
  const sessionHash = c.req.query('session_hash') || null;

  if (qrCode) {
    await recordQrScanMetric(qrCode, sessionHash);
  }

  // Redirigir siempre a la agenda de Palencia filtrada para el turista
  return c.redirect('https://vayaplan.com/?origin=qr_hotel', 302);
});

/**
 * POST /api/v1/qr/:qrCode
 * Endpoint invocado internamente por el servidor web para registrar el escaneo
 */
qrRedirectRoutes.post('/:qrCode', async (c) => {
  const qrCode = c.req.param('qrCode')?.trim();
  let body: any = null;
  try {
    body = await c.req.json();
  } catch {}

  const sessionHash = body?.session_hash || c.req.query('session_hash') || null;

  if (qrCode) {
    await recordQrScanMetric(qrCode, sessionHash);
  }

  return c.json({ status: 'ok', qr_code: qrCode, recorded: true });
});
