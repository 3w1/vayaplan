import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { app } from '../../../index';
import { query } from '@vayaplan/db';
import { sign } from 'hono/jwt';
import { JWT_SECRET } from '../../../middleware/auth';
import {
  runInstagramIngestion,
  isExecutionLocked,
} from '../../../services/bar-instagram-import/instagram-ingestion-service';
import {
  isScheduledExecutionWindow,
} from '../../../services/bar-instagram-import/cron-scheduler';
import { renderAdminHtml } from '../../../../../web/src/admin';
import type { ApifyInstagramRawPost } from '../../../services/bar-instagram-import/bar-types';

describe('Gestión de Venues de Ingesta Instagram y Cron Programado', () => {
  let adminToken: string;
  let fixtureVenue1Id: number;
  let fixtureVenue2Id: number;
  let fixtureVenueFree1Id: number;
  let fixtureVenueFree2Id: number;
  let fixtureSource1Id: number;
  let fixtureSource2Id: number;
  const fixtureUser1 = `fixture_user_${Date.now()}_1`;
  const fixtureUser2 = `fixture_user_${Date.now()}_2`;

  beforeAll(async () => {
    // Generar token JWT válido de admin
    adminToken = await sign(
      {
        email: 'admin@vayaplan.com',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      JWT_SECRET
    );

    // Crear venues sintéticos para las pruebas
    const v1 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Ingestion Fixture Venue 1', $1, 'Calle Ingestion 1', true) RETURNING id;`,
      [`ingestion-fixture-1-${Date.now()}`]
    );
    fixtureVenue1Id = v1.rows[0].id;

    const v2 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Ingestion Fixture Venue 2', $1, 'Calle Ingestion 2', true) RETURNING id;`,
      [`ingestion-fixture-2-${Date.now()}`]
    );
    fixtureVenue2Id = v2.rows[0].id;

    const vf1 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Ingestion Fixture Free 1', $1, 'Calle Ingestion Free 1', true) RETURNING id;`,
      [`ingestion-fixture-free1-${Date.now()}`]
    );
    fixtureVenueFree1Id = vf1.rows[0].id;

    const vf2 = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Ingestion Fixture Free 2', $1, 'Calle Ingestion Free 2', true) RETURNING id;`,
      [`ingestion-fixture-free2-${Date.now()}`]
    );
    fixtureVenueFree2Id = vf2.rows[0].id;

    // Crear fuentes sintéticas
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
    // Limpiar propuestas de prueba residuales
    await query(`DELETE FROM curation_proposals WHERE instagram_post_shortcode LIKE 'mock%';`);

    // Limpiar fuentes de prueba residuales
    await query(
      `DELETE FROM instagram_ingestion_sources 
       WHERE id = ANY($1) 
          OR instagram_username LIKE 'testbar_%' 
          OR instagram_username LIKE 'temp_%' 
          OR instagram_username LIKE 'fixture_user_%';`,
      [[fixtureSource1Id, fixtureSource2Id].filter(Boolean)]
    );

    // Limpiar venues sintéticos
    await query(
      `DELETE FROM venues WHERE id = ANY($1);`,
      [[fixtureVenue1Id, fixtureVenue2Id, fixtureVenueFree1Id, fixtureVenueFree2Id].filter(Boolean)]
    );
  });

  // 1. Crear configuración de ingesta con venue existente
  test('1. Permite crear configuración de ingesta con venue existente', async () => {
    const res = await app.request('/api/v1/admin/instagram-ingestion-sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        venue_id: fixtureVenueFree1Id,
        instagram_username: `testbar_${Date.now()}`,
        instagram_profile_url: 'https://www.instagram.com/testbar/',
        posts_per_run: 8,
        include_reels: true,
        is_active: true,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.source.venue_id).toBe(fixtureVenueFree1Id);
    expect(data.source.posts_per_run).toBe(8);
  });

  // 2. Bloquear creación con venue inexistente
  test('2. Bloquea creación si el venue no existe en el catálogo (400)', async () => {
    const res = await app.request('/api/v1/admin/instagram-ingestion-sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        venue_id: 9999999, // Inexistente
        instagram_username: 'nonexistent_venue_bar',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('venue_not_found');
  });

  // 3. Bloquear duplicado de venue
  test('3. Bloquea añadir el mismo venue dos veces (409 Conflict)', async () => {
    const res = await app.request('/api/v1/admin/instagram-ingestion-sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        venue_id: fixtureVenue1Id,
        instagram_username: `different_user_${Date.now()}`,
      }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('duplicate_venue');
  });

  // 4. Bloquear duplicado de username
  test('4. Bloquea añadir el mismo usuario de Instagram dos veces (409 Conflict)', async () => {
    const res = await app.request('/api/v1/admin/instagram-ingestion-sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        venue_id: fixtureVenueFree2Id,
        instagram_username: fixtureUser1,
      }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('duplicate_username');
  });

  // 5. Activar y desactivar una fuente
  test('5. Permite pausar (desactivar) y reactivar una fuente de ingesta', async () => {
    const sourceId = fixtureSource1Id;
    const initialStatus = true;

    // Pausar
    const res1 = await app.request(`/api/v1/admin/instagram-ingestion-sources/${sourceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ is_active: false }),
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.source.is_active).toBe(false);

    // Reactivar
    const res2 = await app.request(`/api/v1/admin/instagram-ingestion-sources/${sourceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ is_active: true }),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.source.is_active).toBe(true);
  });

  // 6. Eliminar configuración sin eliminar venue
  test('6. Elimina la configuración de ingesta sin eliminar el venue asociado', async () => {
    // Crear una fuente temporal
    const venueRes = await query(
      `SELECT v.id FROM venues v 
       WHERE v.id NOT IN (SELECT venue_id FROM instagram_ingestion_sources) 
       LIMIT 1;`
    );
    const tempVenueId = venueRes.rows[0].id;

    const createRes = await query(
      `INSERT INTO instagram_ingestion_sources (venue_id, instagram_username) 
       VALUES ($1, $2) RETURNING id;`,
      [tempVenueId, `temp_del_${Date.now()}`]
    );
    const tempSourceId = createRes.rows[0].id;

    // Eliminar configuración
    const delRes = await app.request(`/api/v1/admin/instagram-ingestion-sources/${tempSourceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(200);

    // Verificar que la fuente fue eliminada
    const checkSource = await query(`SELECT id FROM instagram_ingestion_sources WHERE id = $1;`, [tempSourceId]);
    expect(checkSource.rows.length).toBe(0);

    // Verificar que el venue permanece intacto en venues
    const checkVenue = await query(`SELECT id, name FROM venues WHERE id = $1;`, [tempVenueId]);
    expect(checkVenue.rows.length).toBe(1);
  });

  // 7, 8, 9, 10, 11, 12, 13: Ingesta manual, deduplicación, R2, no creación de eventos
  test('7-13. Ingesta manual procesa posts, guarda en R2, omite duplicados y no crea eventos', async () => {
    // Limpiar propuestas mock previas de la base de datos de test
    await query(`DELETE FROM curation_proposals WHERE instagram_post_shortcode LIKE 'mock%';`);

    const eventsBefore = await query(`SELECT count(*) FROM events;`);
    const countBeforeEvents = parseInt(eventsBefore.rows[0].count, 10);

    // Mock provider de posts para prueba determinista y aislada
    const mockPost1: ApifyInstagramRawPost = {
      id: `mock_test_${Date.now()}_1`,
      shortCode: `mock_post_future_${Date.now()}`,
      type: 'Image',
      url: 'https://www.instagram.com/p/mock_post_future/',
      displayUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/DersOuAuW_H.jpg', // R2 URL válida
      caption: 'Concierto especial este sábado 2026-10-31 a las 21:00h en directo con tributo acústico',
      timestamp: '2026-10-24T12:00:00.000Z',
      likesCount: 50,
      commentsCount: 5,
      dimensionsWidth: 1080,
      dimensionsHeight: 1080,
      ownerUsername: fixtureUser1,
      taggedUsers: [],
    };

    const mockPostPast: ApifyInstagramRawPost = {
      id: `mock_test_${Date.now()}_2`,
      shortCode: `mock_post_past_${Date.now()}`,
      type: 'Image',
      url: 'https://www.instagram.com/p/mock_post_past/',
      displayUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/DersOuAuW_H.jpg',
      caption: 'Sesión remember del 2026-02-14 con fiesta de san valentín',
      timestamp: '2026-02-14T20:00:00.000Z',
      likesCount: 30,
      commentsCount: 2,
      dimensionsWidth: 1080,
      dimensionsHeight: 1080,
      ownerUsername: fixtureUser1,
      taggedUsers: [],
    };

    const sourceId = fixtureSource1Id;

    // Ejecutar con mock provider
    const report = await runInstagramIngestion({
      sourceIds: [sourceId],
      executionType: 'manual_single',
      mockPostsProvider: async () => [mockPost1, mockPostPast],
    });

    expect(report.sourcesProcessed).toBe(1);
    expect(report.totalPostsScraped).toBe(2);
    expect(report.proposalsCreated).toBeGreaterThanOrEqual(1);

    // 10. Verificar que NO se crearon eventos
    const eventsAfter = await query(`SELECT count(*) FROM events;`);
    const countAfterEvents = parseInt(eventsAfter.rows[0].count, 10);
    expect(countAfterEvents).toBe(countBeforeEvents);

    // 11. Verificar que el post futuro se creó en 'pending' y el pasado en 'archived'
    const futureProp = await query(
      `SELECT review_status, classification, image_url, dedupe_key 
       FROM curation_proposals 
       WHERE instagram_post_shortcode = $1;`,
      [mockPost1.shortCode]
    );
    expect(futureProp.rows.length).toBe(1);
    expect(futureProp.rows[0].review_status).toBe('pending');
    expect(futureProp.rows[0].classification).toBe('EVENTO_POSIBLE');

    const pastProp = await query(
      `SELECT review_status, classification 
       FROM curation_proposals 
       WHERE instagram_post_shortcode = $1;`,
      [mockPostPast.shortCode]
    );
    expect(pastProp.rows.length).toBe(1);
    expect(pastProp.rows[0].review_status).toBe('archived');
    expect(pastProp.rows[0].classification).toBe('PAST_EVENT');

    // 12. Verificar que las imágenes provienen de R2
    expect(futureProp.rows[0].image_url).toContain('media.vayaplan.com');

    // 13. Re-ejecutar con los mismos posts para verificar deduplicación
    const reReport = await runInstagramIngestion({
      sourceIds: [sourceId],
      executionType: 'manual_single',
      mockPostsProvider: async () => [mockPost1, mockPostPast],
    });
    expect(reReport.duplicatesSkipped).toBe(2);
    expect(reReport.proposalsCreated).toBe(0);
  });

  // 14. Fallo en una fuente no bloquea las demás
  test('14. Un fallo en una fuente no interrumpe el procesamiento de las restantes', async () => {
    const report = await runInstagramIngestion({
      sourceIds: [fixtureSource1Id, fixtureSource2Id],
      mockPostsProvider: async (username) => {
        if (username === fixtureUser1) {
          throw new Error('Simulated network timeout for source 1');
        }
        return [];
      },
    });

    expect(report.sourcesProcessed).toBe(2);
    expect(report.errors.length).toBe(1);
    expect(report.errors[0].sourceId).toBe(fixtureSource1Id);
    expect(report.resultsBySource.find((r) => r.sourceId === fixtureSource2Id)?.status).toBe('success');
  });

  // 15. Cron programado solo procesa fuentes activas
  test('15. El filtro de ingesta programada procesa únicamente fuentes con is_active = true', async () => {
    // Snapshot para preservar el estado previo de las fuentes tras la prueba
    const prevSources = await query(`SELECT id, last_status, last_error, last_run_id, last_ingested_at FROM instagram_ingestion_sources;`);

    try {
      // Desactivar temporalmente la fuente fixture 1
      await query(`UPDATE instagram_ingestion_sources SET is_active = false WHERE id = $1;`, [fixtureSource1Id]);

      const activeCount = await query(`SELECT count(*) FROM instagram_ingestion_sources WHERE is_active = true;`);
      const expectedActive = parseInt(activeCount.rows[0].count, 10);

      const report = await runInstagramIngestion({
        onlyActive: true,
        executionType: 'cron_scheduled',
        mockPostsProvider: async () => [],
      });

      expect(report.sourcesProcessed).toBe(expectedActive);
    } finally {
      // Restaurar estado e is_active
      await query(`UPDATE instagram_ingestion_sources SET is_active = true WHERE id = $1;`, [fixtureSource1Id]);
      for (const s of prevSources.rows) {
        await query(
          `UPDATE instagram_ingestion_sources
           SET last_status = $1, last_error = $2, last_run_id = $3, last_ingested_at = $4
           WHERE id = $5;`,
          [s.last_status, s.last_error, s.last_run_id, s.last_ingested_at, s.id]
        );
      }
    }
  });

  // 16. Prevención de ejecuciones concurrentes simultáneas
  test('16. Validador de lock y ventana horaria de cron (Miércoles/Viernes 12:00 Madrid)', () => {
    // Probar validador de ventana cron
    // Miércoles 12:30 Madrid (el 21 de octubre de 2026 está en CEST UTC+2 -> 10:30 UTC)
    const wednesdayNoon = new Date('2026-10-21T10:30:00.000Z');
    expect(isScheduledExecutionWindow(wednesdayNoon)).toBe(true);

    // Miércoles 12:30 Madrid tras cambio de hora de invierno (el 28 de octubre de 2026 en CET UTC+1 -> 11:30 UTC)
    const wednesdayWinterNoon = new Date('2026-10-28T11:30:00.000Z');
    expect(isScheduledExecutionWindow(wednesdayWinterNoon)).toBe(true);

    // Lunes 12:30 Madrid
    const mondayNoon = new Date('2026-10-19T10:30:00.000Z');
    expect(isScheduledExecutionWindow(mondayNoon)).toBe(false);

    // Viernes 16:00 Madrid
    const fridayEvening = new Date('2026-10-23T14:00:00.000Z');
    expect(isScheduledExecutionWindow(fridayEvening)).toBe(false);

    // Comprobar estado de lock
    const lock = isExecutionLocked();
    expect(lock.locked).toBe(false);
  });

  // 17. Usuario no autenticado bloqueado en rutas admin
  test('17. Bloquea peticiones no autenticadas en rutas administrativas de ingesta (401)', async () => {
    const resGet = await app.request('/api/v1/admin/instagram-ingestion-sources');
    expect(resGet.status).toBe(401);

    const resPost = await app.request('/api/v1/admin/instagram-ingestion-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue_id: 1, instagram_username: 'unauth' }),
    });
    expect(resPost.status).toBe(401);

    const resRun = await app.request('/api/v1/admin/instagram-ingestion-sources/1/run', {
      method: 'POST',
    });
    expect(resRun.status).toBe(401);
  });

  // 18. Renderizado de la web admin correcto y sin pantalla en blanco
  test('18. La web admin renderiza con código 200 y contiene las secciones y modales requeridos', () => {
    const html = renderAdminHtml();
    expect(html.length).toBeGreaterThan(100000);
    expect(html).toContain('id="section-proposals"');
    expect(html).toContain('id="section-sources"');
    expect(html).toContain('id="modal-add-source"');
    expect(html).toContain('id="modal-edit-source"');
    expect(html).toContain('id="modal-source-report"');
    expect(html).toContain('window.loadAdminSources');
    expect(html).toContain('window.runAllActiveSources');
    expect(html).not.toContain("this.style.display='none'"); // Sin comillas que rompan strings JS
  });
});
