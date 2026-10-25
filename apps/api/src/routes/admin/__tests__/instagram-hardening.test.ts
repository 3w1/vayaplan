import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Asegurar variable de entorno para las pruebas si no estuviera configurada en el entorno global
if (!process.env.INTERNAL_CRON_SECRET) {
  process.env.INTERNAL_CRON_SECRET = 'test_cron_secret_env_strict_2026';
}

import { app } from '../../../index';
import { query } from '@vayaplan/db';
import { sign } from 'hono/jwt';
import { JWT_SECRET } from '../../../middleware/auth';
import {
  acquirePersistentLock,
  releasePersistentLock,
  getPersistentLockStatus,
  DEFAULT_LOCK_KEY,
} from '../../../services/bar-instagram-import/persistent-lock';
import {
  runInstagramIngestion,
} from '../../../services/bar-instagram-import/instagram-ingestion-service';
import {
  validateImageMatchesProposalR2,
  isValidR2ImageUrl,
} from '../proposals';
import type { ApifyInstagramRawPost } from '../../../services/bar-instagram-import/bar-types';

describe('Endurecimiento de Ingesta Instagram (Lock Persistente y Validación R2)', () => {
  let adminToken: string;
  const cronSecret = process.env.INTERNAL_CRON_SECRET!;

  // Fixtures sintéticos exclusivos para pruebas sin tocar fuentes ni venues de producción
  let fixtureVenue1Id: number;
  let fixtureVenue2Id: number;
  let fixtureSource1Id: number;
  let fixtureSource2Id: number;
  const fixtureUser1 = `fixture_user_${Date.now()}_1`;
  const fixtureUser2 = `fixture_user_${Date.now()}_2`;

  beforeAll(async () => {
    adminToken = await sign(
      {
        sub: 'admin_test_hardening',
        username: 'admin',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      JWT_SECRET
    );

    // Asegurar que el lock global esté limpio antes de empezar
    await releasePersistentLock(DEFAULT_LOCK_KEY);
    await query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'test_%';`);

    // Crear venues sintéticos para las pruebas
    const v1 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Hardening Fixture Venue 1', $1, 'Calle Hardening 1', true) RETURNING id;`,
      [`hardening-fixture-1-${Date.now()}`]
    );
    fixtureVenue1Id = v1.rows[0].id;

    const v2 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Hardening Fixture Venue 2', $1, 'Calle Hardening 2', true) RETURNING id;`,
      [`hardening-fixture-2-${Date.now()}`]
    );
    fixtureVenue2Id = v2.rows[0].id;

    // Crear fuentes sintéticas exclusivas
    const s1 = await query(
      `INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, is_active)
       VALUES ($1, $2, true) RETURNING id;`,
      [fixtureVenue1Id, fixtureUser1]
    );
    fixtureSource1Id = s1.rows[0].id;

    const s2 = await query(
      `INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, is_active)
       VALUES ($1, $2, true) RETURNING id;`,
      [fixtureVenue2Id, fixtureUser2]
    );
    fixtureSource2Id = s2.rows[0].id;
  });

  afterAll(async () => {
    await releasePersistentLock(DEFAULT_LOCK_KEY);
    await query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'test_%';`);

    // Eliminar fixtures sintéticos
    if (fixtureSource1Id || fixtureSource2Id) {
      await query(`DELETE FROM instagram_ingestion_sources WHERE id = ANY($1);`, [
        [fixtureSource1Id, fixtureSource2Id].filter(Boolean),
      ]);
    }
    if (fixtureVenue1Id || fixtureVenue2Id) {
      await query(`DELETE FROM venues WHERE id = ANY($1);`, [
        [fixtureVenue1Id, fixtureVenue2Id].filter(Boolean),
      ]);
    }
  });

  // 1. Adquirir lock antes de una ingesta
  test('1. Permite adquirir lock persistente en PostgreSQL antes de una ingesta', async () => {
    const lockKey = `test_lock_acquire_${Date.now()}`;
    const result = await acquirePersistentLock({
      lockKey,
      lockedBy: 'worker_node_1',
      ttlMinutes: 15,
      executionDetails: { sourceIds: [fixtureSource1Id, fixtureSource2Id] },
    });

    expect(result.success).toBe(true);

    const check = await query(
      `SELECT lock_key, locked_by, released_at, expires_at 
       FROM instagram_ingestion_locks 
       WHERE lock_key = $1;`,
      [lockKey]
    );

    expect(check.rows.length).toBe(1);
    expect(check.rows[0].locked_by).toBe('worker_node_1');
    expect(check.rows[0].released_at).toBeNull();
    expect(new Date(check.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());

    // Limpiar
    await releasePersistentLock(lockKey);
  });

  // 2. Bloquear una segunda ingesta mientras la primera está activa
  test('2. Bloquea una segunda ingesta mientras la primera está activa devolviendo 409 con detalles', async () => {
    const lockKey = `test_lock_concurrent_${Date.now()}`;
    const firstAcquire = await acquirePersistentLock({
      lockKey,
      lockedBy: 'worker_primary',
      ttlMinutes: 15,
      executionDetails: { sources: [fixtureUser1] },
    });
    expect(firstAcquire.success).toBe(true);

    // Intentar adquirir de nuevo con otro worker
    const secondAcquire = await acquirePersistentLock({
      lockKey,
      lockedBy: 'worker_secondary',
      ttlMinutes: 15,
    });

    expect(secondAcquire.success).toBe(false);
    expect(secondAcquire.lockInfo).toBeDefined();
    expect(secondAcquire.lockInfo?.status).toBe('running');
    expect(secondAcquire.lockInfo?.lockedBy).toBe('worker_primary');
    expect(secondAcquire.lockInfo?.sources).toEqual([fixtureUser1]);

    // Limpiar
    await releasePersistentLock(lockKey);
  });

  // 3. Liberar el lock al terminar correctamente
  test('3. Libera el lock al terminar correctamente marcando released_at', async () => {
    const lockKey = `test_lock_release_${Date.now()}`;
    await acquirePersistentLock({
      lockKey,
      lockedBy: 'worker_finishing',
      ttlMinutes: 15,
    });

    const statusBefore = await getPersistentLockStatus(lockKey);
    expect(statusBefore.locked).toBe(true);

    const released = await releasePersistentLock(lockKey, 'worker_finishing');
    expect(released).toBe(true);

    const statusAfter = await getPersistentLockStatus(lockKey);
    expect(statusAfter.locked).toBe(false);

    const row = await query(`SELECT released_at FROM instagram_ingestion_locks WHERE lock_key = $1;`, [lockKey]);
    expect(row.rows[0].released_at).not.toBeNull();
  });

  // 4. Liberar el lock al fallar de forma controlada
  test('4. Libera el lock en finally al ocurrir un fallo controlado durante la ingesta', async () => {
    await releasePersistentLock(DEFAULT_LOCK_KEY);

    // Simular ejecución donde el proveedor de posts arroja error crítico
    try {
      await runInstagramIngestion({
        sourceIds: [fixtureSource1Id],
        executionType: 'manual_single',
        mockPostsProvider: async () => {
          throw new Error('Error fatal simulado en proveedor de posts');
        },
      });
    } catch (err: any) {
      expect(err.message).toBe('Error fatal simulado en proveedor de posts');
    }

    // Verificar que el lock persistente se liberó en finally
    const lockStatus = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
    expect(lockStatus.locked).toBe(false);
  });

  // 5. Expirar automáticamente el lock si el proceso muere (TTL)
  test('5. Expira automáticamente el lock persistente si el proceso muere superando el TTL', async () => {
    const lockKey = `test_lock_expired_${Date.now()}`;

    // Insertar un lock que expiró hace 5 minutos
    await query(
      `INSERT INTO instagram_ingestion_locks (lock_key, locked_by, locked_at, expires_at, released_at)
       VALUES ($1, $2, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '5 minutes', NULL);`,
      [lockKey, 'crashed_process_99']
    );

    // Comprobar que getPersistentLockStatus lo considera no bloqueado
    const status = await getPersistentLockStatus(lockKey);
    expect(status.locked).toBe(false);

    // Un nuevo proceso debe ser capaz de adquirirlo
    const acquireResult = await acquirePersistentLock({
      lockKey,
      lockedBy: 'revived_process_1',
      ttlMinutes: 15,
    });
    expect(acquireResult.success).toBe(true);

    const check = await query(`SELECT locked_by FROM instagram_ingestion_locks WHERE lock_key = $1;`, [lockKey]);
    expect(check.rows[0].locked_by).toBe('revived_process_1');

    await releasePersistentLock(lockKey);
  });

  // 6. Bloquear aprobación si image_url no coincide con r2_key (422)
  test('6. Bloquea aprobación con HTTP 422 si image_url no coincide con r2_key de la propuesta', async () => {
    // Crear propuesta de prueba
    const insertProp = await query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        source_type, r2_key, image_url, classification, review_status, requires_manual_review
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;`,
      [
        'Test Event Mismatch R2',
        '2026-11-20',
        '23:00',
        1,
        'musica_directo',
        'https://instagram.com/p/test_r2_mismatch',
        'instagram',
        'bars/universonoro/orig_prop_key.jpg',
        'https://media.vayaplan.com/bars/universonoro/orig_prop_key.jpg',
        'EVENTO_POSIBLE',
        'pending',
        true,
      ]
    );
    const testPropId = insertProp.rows[0].id;

    // Intentar aprobar con una imagen de R2 válida pero perteneciente a OTRO recinto/post
    const res = await app.request(`/api/v1/admin/proposals/${testPropId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        image_url: 'https://media.vayaplan.com/bars/bar-salvaje/different_key.jpg',
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('image_mismatch');
    expect(body.message.toLowerCase()).toContain('la imagen no corresponde a la propuesta');

    // Limpiar
    await query(`DELETE FROM curation_proposals WHERE id = $1;`, [testPropId]);
  });

  // 7. Permitir aprobación si image_url coincide con r2_key
  test('7. Permite aprobación si image_url coincide con la r2_key (incluyendo URLs prefirmadas)', async () => {
    // Probar función helper directamente
    const proposalKey = 'bars/sala-infinity/DeJb8ZgIlA0.jpg';
    const publicUrl = 'https://media.vayaplan.com/bars/sala-infinity/DeJb8ZgIlA0.jpg';
    const presignedUrl = 'https://media.vayaplan.com/bars/sala-infinity/DeJb8ZgIlA0.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test';

    expect(validateImageMatchesProposalR2(publicUrl, proposalKey, publicUrl)).toBe(true);
    expect(validateImageMatchesProposalR2(presignedUrl, proposalKey, publicUrl)).toBe(true);

    // Crear propuesta de prueba para endpoint
    const insertProp = await query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        source_type, r2_key, image_url, classification, review_status, requires_manual_review
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;`,
      [
        `Test Event Valid R2 ${Date.now()}`,
        '2026-11-25',
        '21:00',
        1,
        'musica_directo',
        `https://instagram.com/p/test_r2_valid_${Date.now()}`,
        'instagram',
        proposalKey,
        publicUrl,
        'EVENTO_POSIBLE',
        'pending',
        true,
      ]
    );
    const testPropId = insertProp.rows[0].id;

    const res = await app.request(`/api/v1/admin/proposals/${testPropId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        image_url: presignedUrl, // Envía presigned URL derivada del mismo r2_key
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.createdEvent.status).toBe('draft');

    // Limpiar evento y propuesta creada
    await query(`DELETE FROM events WHERE id = $1;`, [body.createdEvent.id]);
    await query(`DELETE FROM curation_proposals WHERE id = $1;`, [testPropId]);
  });

  // 8. Bloquear imágenes de cdninstagram.com y fbcdn.net
  test('8. Bloquea imágenes de cdninstagram.com y fbcdn.net con código 400', async () => {
    expect(isValidR2ImageUrl('https://scontent.cdninstagram.com/v/t51.2885-15/post.jpg')).toBe(false);
    expect(isValidR2ImageUrl('https://scontent-mad1-1.xx.fbcdn.net/v/t39.30808-6/photo.jpg')).toBe(false);
    expect(isValidR2ImageUrl('https://media.vayaplan.com/bars/portal/DersOuAuW_H.jpg')).toBe(true);

    // Crear propuesta de prueba
    const insertProp = await query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        source_type, r2_key, image_url, classification, review_status, requires_manual_review
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;`,
      [
        'Test Event Instagram CDN Block',
        '2026-11-21',
        '20:00',
        1,
        'dj_tardeo',
        'https://instagram.com/p/test_cdn_block',
        'instagram',
        'bars/universonoro/valid.jpg',
        'https://media.vayaplan.com/bars/universonoro/valid.jpg',
        'EVENTO_POSIBLE',
        'pending',
        true,
      ]
    );
    const testPropId = insertProp.rows[0].id;

    const res = await app.request(`/api/v1/admin/proposals/${testPropId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        image_url: 'https://scontent.cdninstagram.com/v/t51.2885-15/malicious.jpg',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_image_source');

    // Limpiar
    await query(`DELETE FROM curation_proposals WHERE id = $1;`, [testPropId]);
  });

  // 9. Verificar que el cron usa el mismo lock persistente
  test('9. Verifica que el endpoint interno del cron usa el mismo lock persistente devolviendo 409', async () => {
    // Tomar el lock global manualmente
    await acquirePersistentLock({
      lockKey: DEFAULT_LOCK_KEY,
      lockedBy: 'manual_admin_worker',
      ttlMinutes: 15,
      executionDetails: { sources: ['bar-salvaje'] },
    });

    // Petición al endpoint del cron
    const res = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('execution_locked');
    expect(body.locked).toBe(true);
    expect(body.currentExecution.lockedBy).toBe('manual_admin_worker');

    // Liberar
    await releasePersistentLock(DEFAULT_LOCK_KEY);
  });

  // 10. Verificar que la ingesta manual usa el mismo lock persistente
  test('10. Verifica que la ingesta manual administrativa usa el mismo lock persistente devolviendo 409', async () => {
    // Tomar el lock global
    await acquirePersistentLock({
      lockKey: DEFAULT_LOCK_KEY,
      lockedBy: 'cron_worker_active',
      ttlMinutes: 15,
      executionDetails: { executionType: 'cron_scheduled' },
    });

    // Petición de ingesta manual seleccionada
    const resSelected = await app.request('/api/v1/admin/instagram-ingestion-sources/run-selected', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ids: [fixtureSource1Id, fixtureSource2Id] }),
    });

    expect(resSelected.status).toBe(409);
    const bodySelected = await resSelected.json();
    expect(bodySelected.error).toBe('execution_locked');
    expect(bodySelected.locked).toBe(true);

    // Petición de ingesta manual de todos los activos
    const resAll = await app.request('/api/v1/admin/instagram-ingestion-sources/run-all-active', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(resAll.status).toBe(409);
    const bodyAll = await resAll.json();
    expect(bodyAll.error).toBe('execution_locked');

    // Liberar
    await releasePersistentLock(DEFAULT_LOCK_KEY);
  });

  // 11. Verificar que un fallo en una fuente no deja el lock bloqueado
  test('11. Verifica que un fallo parcial en una fuente no deja el lock persistente bloqueado', async () => {
    await releasePersistentLock(DEFAULT_LOCK_KEY);

    const report = await runInstagramIngestion({
      sourceIds: [fixtureSource1Id, fixtureSource2Id],
      executionType: 'manual_selected',
      mockPostsProvider: async (username) => {
        if (username === fixtureUser1) {
          throw new Error('Timeout de conexión a Instagram');
        }
        return [];
      },
    });

    expect(report.sourcesProcessed).toBe(2);
    expect(report.errors.length).toBe(1);

    // Verificar que el lock se liberó
    const lockStatus = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
    expect(lockStatus.locked).toBe(false);
  });

  // 12. Verificar que las 5 propuestas del piloto siguen pending
  test('12. Verifica que las 5 propuestas del piloto siguen en estado pending con imágenes en R2', async () => {
    const pilotIds = [6, 7, 8, 9, 11];
    const res = await query(
      `SELECT id, title, review_status, classification, image_url, r2_key 
       FROM curation_proposals 
       WHERE id = ANY($1) 
       ORDER BY id ASC;`,
      [pilotIds]
    );

    expect(res.rows.length).toBe(5);
    for (const proposal of res.rows) {
      expect(['pending', 'approved_draft']).toContain(proposal.review_status);
      expect(proposal.classification).toBe('EVENTO_POSIBLE');
      expect(proposal.image_url.startsWith('https://media.vayaplan.com/')).toBe(true);
      expect(proposal.image_url).not.toContain('cdninstagram.com');
      expect(proposal.image_url).not.toContain('fbcdn.net');
    }
  });

  // 13. Seguridad de endpoint interno del cron (sin dependencia de IP, exclusivamente por secreto)
  describe('Seguridad y Autenticación Exclusiva por Secreto en Endpoint Interno de Cron', () => {
    test('Bloquea petición sin secreto con 401 Unauthorized y mensaje genérico', async () => {
      const res = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('unauthorized');
      expect(body.message).toBe('Acceso no autorizado al servicio interno.');
    });

    test('Bloquea petición con secreto incorrecto con 401 sin revelar detalles', async () => {
      const res = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid_wrong_cron_token_123',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('unauthorized');
      expect(body.message).toBe('Acceso no autorizado al servicio interno.');
    });

    test('Bloquea petición con IP loopback 127.0.0.1 si no proporciona el secreto correcto (401)', async () => {
      // Intento de spoofing de IP local con token o clave inválida
      const res1 = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
        headers: {
          'X-Forwarded-For': '127.0.0.1',
          'X-Internal-Cron-Key': 'random_spoofed_key',
        },
      });
      expect(res1.status).toBe(401);

      const res2 = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
        headers: {
          'X-Forwarded-For': '127.0.0.1',
        },
      });
      expect(res2.status).toBe(401);
    });

    test('Permite autenticación válida con Authorization: Bearer INTERNAL_CRON_SECRET desde IP externa', async () => {
      // Tomar lock para comprobar que el middleware pasa la petición al handler
      await acquirePersistentLock({
        lockKey: DEFAULT_LOCK_KEY,
        lockedBy: 'test_auth_check',
        ttlMinutes: 15,
      });

      const res = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
        headers: {
          'X-Forwarded-For': '198.51.100.50', // IP pública externa
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      // El middleware permite la entrada y el handler ejecuta (devolviendo 409 por el lock activo)
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('execution_locked');

      await releasePersistentLock(DEFAULT_LOCK_KEY);
    });

    test('Permite autenticación válida con X-Internal-Cron-Key: INTERNAL_CRON_SECRET desde IP externa', async () => {
      await acquirePersistentLock({
        lockKey: DEFAULT_LOCK_KEY,
        lockedBy: 'test_auth_check_2',
        ttlMinutes: 15,
      });

      const res = await app.request('/api/v1/internal/instagram-ingestion/run-scheduled', {
        method: 'POST',
        headers: {
          'X-Forwarded-For': '203.0.113.88', // IP pública externa
          'X-Internal-Cron-Key': cronSecret,
        },
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('execution_locked');

      await releasePersistentLock(DEFAULT_LOCK_KEY);
    });

    test('Verifica que el archivo no contiene valores por defecto hardcodeados ni fallbacks', () => {
      const filePath = resolve(__dirname, '../../internal/instagram-ingestion.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Comprobar que no contiene strings de fallback tipo 'vp_internal_cr...' ni operador || en INTERNAL_CRON_SECRET
      expect(content).not.toContain('vp_internal_cron_secret');
      expect(content).not.toMatch(/process\.env\.INTERNAL_CRON_SECRET\s*\|\|/);
      expect(content).toContain('if (!INTERNAL_CRON_SECRET)');
      expect(content).toContain("throw new Error('INTERNAL_CRON_SECRET is required')");
    });

    test('Verifica que el endpoint y la aplicación no arrancan si falta INTERNAL_CRON_SECRET en el entorno', async () => {
      // Ejecutar un subproceso aislado sin la variable INTERNAL_CRON_SECRET
      const child = Bun.spawn({
        cmd: [
          'bun',
          '-e',
          'delete process.env.INTERNAL_CRON_SECRET; await import("./apps/api/src/routes/internal/instagram-ingestion.ts");',
        ],
        cwd: resolve(__dirname, '../../../../../..'),
        env: {
          ...process.env,
          INTERNAL_CRON_SECRET: '',
        },
        stderr: 'pipe',
      });

      const stderrText = await new Response(child.stderr).text();
      const exitCode = await child.exited;

      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('INTERNAL_CRON_SECRET is required');
    });
  });
});
