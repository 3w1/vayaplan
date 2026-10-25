import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

// 1. Forzar explícitamente la base de pruebas aislada vayaplan_test antes de importar la app o @vayaplan/db
const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';
process.env.DATABASE_URL = rawTestDbUrl.trim();

import { query } from '@vayaplan/db';
import {
  runInstagramIngestion,
  fetchPostsFromApify,
  resolveApifyMaxTotalChargeUsd,
  APIFY_MIN_CHARGE_USD,
  APIFY_DEFAULT_COST_PER_POST_USD,
} from '../instagram-ingestion-service';
import { runControlledSalvajeCli } from '../run-salvaje-ingestion';
import type { ApifyInstagramRawPost } from '../bar-types';

describe('Ingestion Overrides & Safety Hardening (Entorno Aislado: vayaplan_test)', () => {
  const TEST_VENUE_ID = 99981;
  const TEST_SOURCE_ID = 99981;
  let app: any;
  let adminToken: string;

  beforeAll(async () => {
    const apiIndex = await import('../../../index');
    app = apiIndex.app;
    const authModule = await import('../../../middleware/auth');
    const jwtModule = await import('hono/jwt');

    // Generar token JWT de administrador para pruebas de rutas HTTP
    adminToken = await jwtModule.sign(
      { email: 'editor@vayaplan.com', role: 'admin' },
      authModule.JWT_SECRET,
      'HS256'
    );

    // Crear venue sintético efímero en la base de test aislada
    await query(`
      INSERT INTO venues (id, city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES ($1, 1, 'Fixture Venue Overrides', 'fixture-venue-overrides', 'C. Test 1', 42.0, -4.5, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [TEST_VENUE_ID]);

    // Crear fuente sintética con configuración base: 5 posts, include_reels = true
    await query(`
      INSERT INTO instagram_ingestion_sources (
        id, venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, last_status, created_at, updated_at
      ) VALUES (
        $1, $2, 'test_override_user', 'https://instagram.com/test_override_user/', true, 5, true, 'never_run', NOW(), NOW()
      ) ON CONFLICT (id) DO UPDATE SET
        posts_per_run = 5,
        include_reels = true,
        last_status = 'never_run',
        last_error = NULL;
    `, [TEST_SOURCE_ID, TEST_VENUE_ID]);
  });

  afterAll(async () => {
    // Limpieza estricta de datos sintéticos
    await query(`DELETE FROM curation_proposals WHERE instagram_username = 'test_override_user';`);
    await query(`DELETE FROM events WHERE venue_id = $1;`, [TEST_VENUE_ID]);
    await query(`DELETE FROM instagram_ingestion_sources WHERE id = $1;`, [TEST_SOURCE_ID]);
    await query(`DELETE FROM venues WHERE id = $1;`, [TEST_VENUE_ID]);
    await query(`DELETE FROM instagram_ingestion_locks WHERE lock_key = 'global_instagram_ingestion' AND locked_by LIKE 'ig_run_%';`);
  });

  it('1. Pasa limit=3 e includeReels=false al extractor respetando el override temporal', async () => {
    let capturedLimit = 0;
    let capturedIncludeReels: boolean | undefined = undefined;

    const mockProvider = async (username: string, limit: number, includeReels?: boolean): Promise<ApifyInstagramRawPost[]> => {
      capturedLimit = limit;
      capturedIncludeReels = includeReels;
      return [
        {
          id: 'post_ov_1',
          shortCode: 'post_ov_1',
          type: 'Image',
          url: 'https://instagram.com/p/post_ov_1/',
          caption: 'Concierto acústico 2026-11-20 a las 21:00 en Palencia',
          timestamp: '2026-11-10T12:00:00.000Z',
          displayUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/DersOuAuW_H.jpg',
        },
        {
          id: 'post_ov_2_reel',
          shortCode: 'post_ov_2_reel',
          type: 'Video',
          videoUrl: 'https://instagram.com/reel/post_ov_2/',
          caption: 'Reel de noche de fiesta',
          timestamp: '2026-11-10T13:00:00.000Z',
          displayUrl: 'https://media.vayaplan.com/test2.jpg',
        },
      ];
    };

    const report = await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      executionType: 'manual_single',
      overridePostsLimit: 3,
      overrideIncludeReels: false,
      mockPostsProvider: mockProvider,
    });

    // Verificaciones del reporte
    expect(capturedLimit).toBe(3);
    expect(capturedIncludeReels).toBe(false);
    expect(report.sourcesProcessed).toBe(1);
    expect(report.totalPostsScraped).toBe(2);
    // Trazabilidad: 1 reel descartado localmente porque includeReels=false
    expect(report.videosSkipped).toBe(1);
    expect(report.resultsBySource[0].videosSkipped).toBe(1);
    expect(report.proposalsCreated).toBe(1);

    // Verificar en BD que la configuración persistente NO ha cambiado
    const sourceCheck = await query(
      `SELECT posts_per_run, include_reels, last_status, last_run_id, last_ingested_at
       FROM instagram_ingestion_sources WHERE id = $1;`,
      [TEST_SOURCE_ID]
    );

    expect(sourceCheck.rows.length).toBe(1);
    const row = sourceCheck.rows[0];
    expect(row.posts_per_run).toBe(5); // Conservado en 5
    expect(row.include_reels).toBe(true); // Conservado en true
    expect(row.last_status).toBe('success');
    expect(row.last_run_id).toContain('ig_run_');
    expect(row.last_ingested_at).not.toBeNull();
  });

  it('2. Sin override, utiliza la configuración persistente de la fuente (5 posts y Reels habilitados)', async () => {
    let capturedLimit = 0;
    let capturedIncludeReels: boolean | undefined = undefined;

    const mockProvider = async (username: string, limit: number, includeReels?: boolean): Promise<ApifyInstagramRawPost[]> => {
      capturedLimit = limit;
      capturedIncludeReels = includeReels;
      return [];
    };

    await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      executionType: 'manual_single',
      mockPostsProvider: mockProvider,
    });

    expect(capturedLimit).toBe(5);
    expect(capturedIncludeReels).toBe(true);
  });

  it('3. Rechaza parámetros inválidos a nivel servicio y ruta HTTP (HTTP 400)', async () => {
    // Servicio: overridePostsLimit menor a 1
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overridePostsLimit: 0,
      })
    ).rejects.toThrow('overridePostsLimit debe ser un número entero entre 1 y 20.');

    // Servicio: overridePostsLimit mayor a 20
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overridePostsLimit: 25,
      })
    ).rejects.toThrow('overridePostsLimit debe ser un número entero entre 1 y 20.');

    // Servicio: overridePostsLimit no entero
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overridePostsLimit: 3.5,
      })
    ).rejects.toThrow('overridePostsLimit debe ser un número entero entre 1 y 20.');

    // Servicio: overrideIncludeReels no booleano
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overrideIncludeReels: 'true' as any,
      })
    ).rejects.toThrow('overrideIncludeReels debe ser un booleano');

    // Servicio: overrideMaxTotalChargeUsd < 0.005
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overrideMaxTotalChargeUsd: 0.001,
      })
    ).rejects.toThrow('overrideMaxTotalChargeUsd debe ser un número finito >= 0.005 USD');

    // Servicio: overrideMaxTotalChargeUsd = Infinity
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overrideMaxTotalChargeUsd: Infinity,
      })
    ).rejects.toThrow('overrideMaxTotalChargeUsd debe ser un número finito');

    // Servicio: overrideMaxTotalChargeUsd = -Infinity
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overrideMaxTotalChargeUsd: -Infinity,
      })
    ).rejects.toThrow('overrideMaxTotalChargeUsd debe ser un número finito');

    // Servicio: overrideMaxTotalChargeUsd = NaN
    await expect(
      runInstagramIngestion({
        sourceIds: [TEST_SOURCE_ID],
        overrideMaxTotalChargeUsd: NaN,
      })
    ).rejects.toThrow('overrideMaxTotalChargeUsd debe ser un número finito');

    // Ruta HTTP: POST /api/v1/admin/instagram-ingestion-sources/:id/run con límite inválido
    const resLimitInvalid = await app.request(`/api/v1/admin/instagram-ingestion-sources/${TEST_SOURCE_ID}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ override_posts_limit: 0 }),
    });
    expect(resLimitInvalid.status).toBe(400);
    const bodyLimit = await resLimitInvalid.json();
    expect(bodyLimit.error).toBe('invalid_override_posts_limit');

    // Ruta HTTP: con override_include_reels no booleano
    const resReelsInvalid = await app.request(`/api/v1/admin/instagram-ingestion-sources/${TEST_SOURCE_ID}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ override_include_reels: 'no' }),
    });
    expect(resReelsInvalid.status).toBe(400);
    const bodyReels = await resReelsInvalid.json();
    expect(bodyReels.error).toBe('invalid_override_include_reels');
  });

  it('4. Construye exactamente el payload a Apify con resultsLimit=3 y sin includeReels', async () => {
    const origFetch = globalThis.fetch;
    let interceptedUrl = '';
    let interceptedBody: any = null;

    process.env.ALLOW_REAL_APIFY_IN_TESTS = 'true';
    process.env.APIFY_TOKEN = 'test_mock_token_123';

    try {
      globalThis.fetch = (async (url: any, init: any) => {
        interceptedUrl = String(url);
        if (init?.body) {
          interceptedBody = JSON.parse(init.body);
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await fetchPostsFromApify('salvajepalencia', 3, false);

      expect(interceptedUrl).toContain('https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items');
      expect(interceptedUrl).toContain('token=test_mock_token_123');
      // maxTotalChargeUsd dinámico para limit=3: 3 * 0.003 = 0.009 USD
      expect(interceptedUrl).toContain('maxTotalChargeUsd=0.009');
      // Body contiene únicamente campos válidos del actor apify/instagram-post-scraper
      expect(interceptedBody).toEqual({
        username: ['salvajepalencia'],
        resultsLimit: 3,
        skipPinnedPosts: false,
      });
      // Verificación estricta: includeReels NO está presente en el body
      expect(interceptedBody.includeReels).toBeUndefined();
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.ALLOW_REAL_APIFY_IN_TESTS;
      delete process.env.APIFY_TOKEN;
    }
  });

  it('5. Descarte local de vídeos/Reels antes de clasificación, persistencia y trazabilidad sin compensación', async () => {
    let callCount = 0;

    const mockProvider = async (username: string, limit: number, includeReels?: boolean): Promise<ApifyInstagramRawPost[]> => {
      callCount++;
      return [
        {
          id: 'post_sidecar_ok',
          shortCode: 'post_sidecar_ok',
          type: 'Sidecar',
          url: 'https://instagram.com/p/post_sidecar_ok/',
          caption: 'Tardeo especial 2026-11-21 a las 19:00',
          timestamp: '2026-11-10T12:00:00.000Z',
          displayUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/DersOuAuW_H.jpg',
        },
        {
          id: 'post_video_reel_dropped_1',
          shortCode: 'post_video_reel_dropped_1',
          type: 'Video',
          videoUrl: 'https://instagram.com/reel/post_video_reel_dropped_1/',
          caption: 'Reel descartado 1',
          timestamp: '2026-11-10T14:00:00.000Z',
          displayUrl: 'https://media.vayaplan.com/test3.jpg',
        },
        {
          id: 'post_video_reel_dropped_2',
          shortCode: 'post_video_reel_dropped_2',
          type: 'Video',
          videoUrl: 'https://instagram.com/reel/post_video_reel_dropped_2/',
          caption: 'Reel descartado 2',
          timestamp: '2026-11-10T15:00:00.000Z',
          displayUrl: 'https://media.vayaplan.com/test4.jpg',
        },
      ];
    };

    const report = await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      executionType: 'manual_single',
      overridePostsLimit: 3,
      overrideIncludeReels: false,
      mockPostsProvider: mockProvider,
    });

    // Sin peticiones compensatorias: el extractor solo fue invocado una vez
    expect(callCount).toBe(1);
    expect(report.totalPostsScraped).toBe(3);
    // Trazabilidad de descartes: 2 vídeos descartados
    expect(report.videosSkipped).toBe(2);
    expect(report.resultsBySource[0].videosSkipped).toBe(2);
    // Solo el sidecar pasó a propuesta; los 2 vídeos fueron descartados
    expect(report.proposalsCreated).toBe(1);

    // Verificar que en base de datos NO existe ninguna propuesta con los shortcodes de los vídeos descartados
    const checkDb1 = await query(
      `SELECT id FROM curation_proposals WHERE instagram_post_shortcode = 'post_video_reel_dropped_1';`
    );
    expect(checkDb1.rows.length).toBe(0);

    const checkDb2 = await query(
      `SELECT id FROM curation_proposals WHERE instagram_post_shortcode = 'post_video_reel_dropped_2';`
    );
    expect(checkDb2.rows.length).toBe(0);
  });

  it('6. Política de control de gasto: cálculo dinámico, límites mínimos y rechazo de valores inválidos (blindaje contra Infinity)', () => {
    // 1. Límite mínimo de Apify respetado (0.005)
    expect(APIFY_MIN_CHARGE_USD).toBe(0.005);
    expect(resolveApifyMaxTotalChargeUsd(1)).toBe(0.005); // 1 * 0.003 = 0.003 -> clamped to 0.005

    // 2. Cálculo defensivo según número de posts
    expect(resolveApifyMaxTotalChargeUsd(3)).toBe(0.009); // 3 * 0.003 = 0.009
    expect(resolveApifyMaxTotalChargeUsd(5)).toBe(0.015); // 5 * 0.003 = 0.015
    expect(resolveApifyMaxTotalChargeUsd(20)).toBe(0.06);  // 20 * 0.003 = 0.06

    // 3. Override explícito válido
    expect(resolveApifyMaxTotalChargeUsd(3, 0.005)).toBe(0.005);
    expect(resolveApifyMaxTotalChargeUsd(3, 0.01)).toBe(0.01);
    expect(resolveApifyMaxTotalChargeUsd(5, 0.02)).toBe(0.02);

    // 4. Rechazo de override explícito inválido (< 0.005, NaN, Infinity, -Infinity)
    expect(() => resolveApifyMaxTotalChargeUsd(3, 0.001)).toThrow('overrideMaxTotalChargeUsd inválido');
    expect(() => resolveApifyMaxTotalChargeUsd(3, 0.004)).toThrow('overrideMaxTotalChargeUsd inválido');
    expect(() => resolveApifyMaxTotalChargeUsd(3, NaN)).toThrow('overrideMaxTotalChargeUsd inválido');
    expect(() => resolveApifyMaxTotalChargeUsd(3, Infinity)).toThrow('overrideMaxTotalChargeUsd inválido');
    expect(() => resolveApifyMaxTotalChargeUsd(3, -Infinity)).toThrow('overrideMaxTotalChargeUsd inválido');

    // 5. Variable de entorno APIFY_MAX_TOTAL_CHARGE_USD
    process.env.APIFY_MAX_TOTAL_CHARGE_USD = '0.02';
    expect(resolveApifyMaxTotalChargeUsd(3)).toBe(0.02);

    process.env.APIFY_MAX_TOTAL_CHARGE_USD = '0.001'; // Inválido (< 0.005)
    expect(() => resolveApifyMaxTotalChargeUsd(3)).toThrow('APIFY_MAX_TOTAL_CHARGE_USD inválida');

    process.env.APIFY_MAX_TOTAL_CHARGE_USD = 'Infinity'; // Inválido
    expect(() => resolveApifyMaxTotalChargeUsd(3)).toThrow('APIFY_MAX_TOTAL_CHARGE_USD inválida');

    process.env.APIFY_MAX_TOTAL_CHARGE_USD = '-Infinity'; // Inválido
    expect(() => resolveApifyMaxTotalChargeUsd(3)).toThrow('APIFY_MAX_TOTAL_CHARGE_USD inválida');

    process.env.APIFY_MAX_TOTAL_CHARGE_USD = 'NaN'; // Inválido
    expect(() => resolveApifyMaxTotalChargeUsd(3)).toThrow('APIFY_MAX_TOTAL_CHARGE_USD inválida');

    // Cadena vacía o espacios debe usar el cálculo dinámico
    process.env.APIFY_MAX_TOTAL_CHARGE_USD = '   ';
    expect(resolveApifyMaxTotalChargeUsd(3)).toBe(0.009);

    // Variable no definida debe usar el cálculo dinámico
    delete process.env.APIFY_MAX_TOTAL_CHARGE_USD;
    expect(resolveApifyMaxTotalChargeUsd(3)).toBe(0.009);
  });

  it('7. Timeout local: socket abortado, estado error en BD, sin reintentos automáticos y lock liberado', async () => {
    const mockTimeoutProvider = async () => {
      const err: any = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const report = await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      executionType: 'manual_single',
      mockPostsProvider: mockTimeoutProvider,
    });

    expect(report.errors.length).toBe(1);
    expect(report.resultsBySource[0].status).toBe('error');
    expect(report.resultsBySource[0].error).toContain('Timeout local');

    // Verificar en BD que last_status quedó como 'error'
    const sourceCheck = await query(
      `SELECT last_status, last_error FROM instagram_ingestion_sources WHERE id = $1;`,
      [TEST_SOURCE_ID]
    );
    expect(sourceCheck.rows[0].last_status).toBe('error');
    expect(sourceCheck.rows[0].last_error).toContain('Timeout local');

    // Verificar que el lock persistente fue debidamente liberado en PostgreSQL
    const lockCheck = await query(
      `SELECT released_at FROM instagram_ingestion_locks WHERE lock_key = 'global_instagram_ingestion';`
    );
    expect(lockCheck.rows.length).toBeGreaterThan(0);
    expect(lockCheck.rows[0].released_at).not.toBeNull();
  });

  it('8. Deduplicación: no inserta propuestas duplicadas para el mismo shortcode', async () => {
    const mockDuplicateProvider = async (): Promise<ApifyInstagramRawPost[]> => [
      {
        id: 'post_dedupe_1',
        shortCode: 'post_dedupe_1',
        type: 'Image',
        url: 'https://instagram.com/p/post_dedupe_1/',
        caption: 'Concierto repetido 2026-11-25 a las 20:00',
        timestamp: '2026-11-10T12:00:00.000Z',
        displayUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/DersOuAuW_H.jpg',
      },
    ];

    // Primera pasada: crea la propuesta
    const report1 = await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      mockPostsProvider: mockDuplicateProvider,
    });
    expect(report1.proposalsCreated).toBe(1);

    // Segunda pasada: detecta duplicado y lo omite
    const report2 = await runInstagramIngestion({
      sourceIds: [TEST_SOURCE_ID],
      mockPostsProvider: mockDuplicateProvider,
    });
    expect(report2.proposalsCreated).toBe(0);
    expect(report2.duplicatesSkipped).toBe(1);
  });

  it('9. Garantía de catálogo: cero creación y cero publicación de eventos', async () => {
    // Verificar que no se ha insertado ningún evento en la tabla 'events' durante la ingesta
    const eventsRes = await query(`SELECT COUNT(*) as count FROM events WHERE venue_id = $1;`, [TEST_VENUE_ID]);
    expect(Number(eventsRes.rows[0].count)).toBe(0);
  });

  it('10. Bloqueo de llamadas reales a Apify y validación defensiva de username', async () => {
    // Si username está vacío o solo contiene espacios, debe fallar antes de Apify sin consumir cuota
    await expect(fetchPostsFromApify('', 3, false)).rejects.toThrow('username de Instagram requerido y no válido');
    await expect(fetchPostsFromApify('   ', 3, false)).rejects.toThrow('username de Instagram requerido y no válido');

    // Si se invoca fetchPostsFromApify sin mockPostsProvider ni bypass explícito de seguridad, debe lanzar excepción
    await expect(fetchPostsFromApify('salvajepalencia', 3, false)).rejects.toThrow(
      '[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments.'
    );
  });

  it('11. Herramienta de auditoría CLI (run-salvaje-ingestion.ts) requiere flag explícito --execute', async () => {
    let stdoutCaptured = '';
    const origLog = console.log;
    console.log = (...args: any[]) => {
      stdoutCaptured += args.join(' ') + '\n';
    };

    try {
      // Invocación sin argumentos: no ejecuta ingesta
      await runControlledSalvajeCli([]);
      expect(stdoutCaptured).toContain('[ADVERTENCIA]');
      expect(stdoutCaptured).toContain('--execute');
    } finally {
      console.log = origLog;
    }
  });
});
