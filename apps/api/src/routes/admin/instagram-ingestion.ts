import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { parseAndNormalizeInstagramInput } from '@vayaplan/shared';
import { requireAdminAuth } from '../../middleware/auth';
import type { AdminUser } from '@vayaplan/types';
import {
  runInstagramIngestion,
  isExecutionLocked,
  isExecutionLockedAsync,
} from '../../services/bar-instagram-import/instagram-ingestion-service';

export const adminInstagramIngestionRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

// Todas las rutas requieren autenticación de administrador
adminInstagramIngestionRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/instagram-ingestion-sources
 * Lista todas las fuentes de ingesta configuradas con datos del venue asociado
 */
adminInstagramIngestionRoutes.get('/instagram-ingestion-sources', async (c) => {
  const sql = `
    SELECT 
      s.id,
      s.venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.address AS venue_address,
      s.instagram_username,
      s.instagram_profile_url,
      s.is_active,
      s.posts_per_run,
      s.include_reels,
      s.last_ingested_at,
      s.last_run_id,
      s.last_status,
      s.last_error,
      s.created_by,
      s.created_at,
      s.updated_at
    FROM instagram_ingestion_sources s
    JOIN venues v ON s.venue_id = v.id
    ORDER BY s.id ASC;
  `;

  const result = await query(sql);
  const lock = await isExecutionLockedAsync();

  return c.json({
    sources: result.rows,
    total: result.rows.length,
    isLocked: lock.locked,
    lockStartedAt: lock.startedAt,
    currentExecution: lock.lockInfo,
  });
});

/**
 * POST /api/v1/admin/instagram-ingestion-sources
 * Añade un venue existente a la configuración de ingesta de Instagram
 */
adminInstagramIngestionRoutes.post('/instagram-ingestion-sources', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición JSON no válido' }, 400);
  }

  const venueId = parseInt(body.venue_id, 10);
  const rawIg = body.instagram_input || body.instagram_username || body.instagram_profile_url || '';
  const parsedIg = parseAndNormalizeInstagramInput(rawIg);
  if (!parsedIg.isValid) {
    return c.json({ error: 'invalid_username', message: parsedIg.error || 'El usuario de Instagram es obligatorio y debe tener un formato válido.' }, 400);
  }
  const username = parsedIg.username!;
  const profileUrl = parsedIg.canonicalUrl!;
  const postsPerRun = body.posts_per_run !== undefined ? parseInt(body.posts_per_run, 10) : 5;
  const includeReels = body.include_reels !== undefined ? Boolean(body.include_reels) : true;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;

  // Validaciones
  if (!venueId || isNaN(venueId)) {
    return c.json({ error: 'missing_venue', message: 'Debe seleccionar un venue existente del catálogo.' }, 400);
  }

  if (isNaN(postsPerRun) || postsPerRun < 1 || postsPerRun > 20) {
    return c.json({ error: 'invalid_posts_per_run', message: 'El número de posts por ejecución debe estar comprendido entre 1 y 20.' }, 400);
  }

  // 1. Verificar que el venue existe en el catálogo (estricto: no se crean venues)
  const venueRes = await query(`SELECT id, name, is_active FROM venues WHERE id = $1;`, [venueId]);
  if (venueRes.rows.length === 0) {
    return c.json({ error: 'venue_not_found', message: `El venue con ID ${venueId} no existe en el catálogo.` }, 400);
  }

  // 2. Verificar duplicado de venue
  const dupVenue = await query(`SELECT id FROM instagram_ingestion_sources WHERE venue_id = $1;`, [venueId]);
  if (dupVenue.rows.length > 0) {
    return c.json({ error: 'duplicate_venue', message: `El venue "${venueRes.rows[0].name}" ya tiene una fuente de ingesta configurada.` }, 409);
  }

  // 3. Verificar duplicado de username
  const dupUser = await query(`SELECT id FROM instagram_ingestion_sources WHERE LOWER(instagram_username) = $1;`, [username]);
  if (dupUser.rows.length > 0) {
    return c.json({ error: 'duplicate_username', message: `El perfil de Instagram @${username} ya está asociado a otra fuente de ingesta.` }, 409);
  }

  const userEmail = c.get('user')?.email || 'admin@vayaplan.com';

  const insertSql = `
    INSERT INTO instagram_ingestion_sources (
      venue_id,
      instagram_username,
      instagram_profile_url,
      is_active,
      posts_per_run,
      include_reels,
      last_status,
      created_by,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'never_run', $7, NOW(), NOW())
    RETURNING *;
  `;

  try {
    const insertRes = await query(insertSql, [
      venueId,
      username,
      profileUrl,
      isActive,
      postsPerRun,
      includeReels,
      userEmail,
    ]);

    return c.json({
      success: true,
      message: `Fuente de ingesta configurada exitosamente para "${venueRes.rows[0].name}" (@${username}).`,
      source: insertRes.rows[0],
    }, 201);
  } catch (err: any) {
    if (err?.code === '23505') {
      if (err.constraint === 'uq_ingestion_venue') {
        return c.json({ error: 'duplicate_venue', message: `El venue "${venueRes.rows[0].name}" ya tiene una fuente de ingesta configurada.` }, 409);
      }
      if (err.constraint === 'uq_ingestion_username') {
        return c.json({ error: 'duplicate_username', message: `El perfil de Instagram @${username} ya está asociado a otra fuente de ingesta.` }, 409);
      }
      return c.json({ error: 'conflict', message: 'Conflicto de unicidad en la configuración de la fuente.' }, 409);
    }
    throw err;
  }
});

/**
 * PATCH /api/v1/admin/instagram-ingestion-sources/:id
 * Modifica parámetros de configuración (username, url, posts_per_run, include_reels, is_active)
 */
adminInstagramIngestionRoutes.patch('/instagram-ingestion-sources/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID no válido' }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición JSON no válido' }, 400);
  }

  const currentRes = await query(`SELECT * FROM instagram_ingestion_sources WHERE id = $1;`, [id]);
  if (currentRes.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Fuente de ingesta no encontrada.' }, 404);
  }
  const current = currentRes.rows[0];

  let username = current.instagram_username;
  let profileUrl = current.instagram_profile_url;
  if (body.instagram_input !== undefined || body.instagram_username !== undefined || body.instagram_profile_url !== undefined) {
    const rawIg = body.instagram_input || body.instagram_username || body.instagram_profile_url || '';
    const parsedIg = parseAndNormalizeInstagramInput(rawIg);
    if (!parsedIg.isValid) {
      return c.json({ error: 'invalid_username', message: parsedIg.error || 'El usuario de Instagram no es válido.' }, 400);
    }
    username = parsedIg.username!;
    profileUrl = parsedIg.canonicalUrl!;
  }
  const postsPerRun = body.posts_per_run !== undefined
    ? parseInt(body.posts_per_run, 10)
    : current.posts_per_run;
  const includeReels = body.include_reels !== undefined
    ? Boolean(body.include_reels)
    : current.include_reels;
  const isActive = body.is_active !== undefined
    ? Boolean(body.is_active)
    : current.is_active;

  if (isNaN(postsPerRun) || postsPerRun < 1 || postsPerRun > 20) {
    return c.json({ error: 'invalid_posts_per_run', message: 'El número de posts por ejecución debe estar comprendido entre 1 y 20.' }, 400);
  }

  // Si cambia de username, verificar unicidad
  if (username !== current.instagram_username) {
    const dupUser = await query(`SELECT id FROM instagram_ingestion_sources WHERE LOWER(instagram_username) = $1 AND id != $2;`, [username, id]);
    if (dupUser.rows.length > 0) {
      return c.json({ error: 'duplicate_username', message: `El perfil @${username} ya está en uso por otra fuente.` }, 409);
    }
  }

  const updateSql = `
    UPDATE instagram_ingestion_sources
    SET 
      instagram_username = $1,
      instagram_profile_url = $2,
      posts_per_run = $3,
      include_reels = $4,
      is_active = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING *;
  `;

  try {
    const updateRes = await query(updateSql, [
      username,
      profileUrl,
      postsPerRun,
      includeReels,
      isActive,
      id,
    ]);

    return c.json({
      success: true,
      message: 'Fuente de ingesta actualizada.',
      source: updateRes.rows[0],
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      return c.json({ error: 'duplicate_username', message: `El perfil @${username} ya está en uso por otra fuente.` }, 409);
    }
    throw err;
  }
});

/**
 * DELETE /api/v1/admin/instagram-ingestion-sources/:id
 * Elimina exclusivamente la configuración de ingesta (nunca el venue ni sus eventos)
 */
adminInstagramIngestionRoutes.delete('/instagram-ingestion-sources/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID no válido' }, 400);
  }

  const result = await query(
    `DELETE FROM instagram_ingestion_sources WHERE id = $1 RETURNING id, venue_id, instagram_username;`,
    [id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Fuente de ingesta no encontrada.' }, 404);
  }

  return c.json({
    success: true,
    message: `Configuración de ingesta para @${result.rows[0].instagram_username} eliminada correctamente. El venue no ha sido modificado.`,
  });
});

/**
 * POST /api/v1/admin/instagram-ingestion-sources/:id/run
 * Ejecuta la ingesta manual para una única fuente
 */
adminInstagramIngestionRoutes.post('/instagram-ingestion-sources/:id/run', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'invalid_id', message: 'ID no válido' }, 400);
  }

  const check = await query(`SELECT id FROM instagram_ingestion_sources WHERE id = $1;`, [id]);
  if (check.rows.length === 0) {
    return c.json({ error: 'not_found', message: 'Fuente de ingesta no encontrada.' }, 404);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const overridePostsLimit = typeof body?.override_posts_limit === 'number'
    ? Math.min(Math.max(Math.floor(body.override_posts_limit), 1), 20)
    : undefined;
  const overrideIncludeReels = typeof body?.override_include_reels === 'boolean'
    ? body.override_include_reels
    : undefined;

  try {
    const report = await runInstagramIngestion({
      sourceIds: [id],
      executionType: 'manual_single',
      overridePostsLimit,
      overrideIncludeReels,
    });

    return c.json({
      success: true,
      message: `Ingesta manual completada para fuente #${id}.`,
      report,
    });
  } catch (err: any) {
    if (err.status === 409 || err.statusCode === 409 || err.message?.includes('ejecución de ingesta en curso')) {
      return c.json({
        error: 'execution_locked',
        message: err.message,
        locked: true,
        currentExecution: err.lockInfo || {
          status: 'running',
          startedAt: new Date().toISOString(),
          sources: [id],
        },
      }, 409);
    }
    return c.json({ error: 'ingestion_failed', message: err.message }, 500);
  }
});

/**
 * POST /api/v1/admin/instagram-ingestion-sources/run-selected
 * Ejecuta la ingesta manual sobre una lista de IDs seleccionados
 */
adminInstagramIngestionRoutes.post('/instagram-ingestion-sources/run-selected', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición JSON no válido' }, 400);
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((x: any) => parseInt(x, 10)).filter((n: number) => !isNaN(n))
    : [];

  if (ids.length === 0) {
    return c.json({ error: 'no_sources_selected', message: 'Debe seleccionar al menos una fuente para ejecutar.' }, 400);
  }

  try {
    const report = await runInstagramIngestion({
      sourceIds: ids,
      executionType: 'manual_selected',
    });

    return c.json({
      success: true,
      message: `Ingesta manual completada para ${report.sourcesProcessed} fuentes seleccionadas.`,
      report,
    });
  } catch (err: any) {
    if (err.status === 409 || err.statusCode === 409 || err.message?.includes('ejecución de ingesta en curso')) {
      return c.json({
        error: 'execution_locked',
        message: err.message,
        locked: true,
        currentExecution: err.lockInfo || {
          status: 'running',
          startedAt: new Date().toISOString(),
          sources: ids,
        },
      }, 409);
    }
    return c.json({ error: 'ingestion_failed', message: err.message }, 500);
  }
});

/**
 * POST /api/v1/admin/instagram-ingestion-sources/run-all-active
 * Ejecuta la ingesta manual sobre todas las fuentes con is_active = true
 */
adminInstagramIngestionRoutes.post('/instagram-ingestion-sources/run-all-active', async (c) => {
  try {
    const report = await runInstagramIngestion({
      onlyActive: true,
      executionType: 'manual_all',
    });

    return c.json({
      success: true,
      message: `Ingesta manual completada para todas las fuentes activas (${report.sourcesProcessed} procesadas).`,
      report,
    });
  } catch (err: any) {
    if (err.status === 409 || err.statusCode === 409 || err.message?.includes('ejecución de ingesta en curso')) {
      return c.json({
        error: 'execution_locked',
        message: err.message,
        locked: true,
        currentExecution: err.lockInfo || {
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      }, 409);
    }
    return c.json({ error: 'ingestion_failed', message: err.message }, 500);
  }
});
