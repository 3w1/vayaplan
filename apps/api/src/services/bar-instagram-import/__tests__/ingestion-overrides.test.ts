import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { query } from '@vayaplan/db';
import { runInstagramIngestion, fetchPostsFromApify } from '../instagram-ingestion-service';
import type { ApifyInstagramRawPost } from '../bar-types';

describe('Ingestion Overrides — Controlled Verification of Salvaje', () => {
  const TEST_VENUE_ID = 99981;
  const TEST_SOURCE_ID = 99981;

  beforeAll(async () => {
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
        last_status = 'never_run';
    `, [TEST_SOURCE_ID, TEST_VENUE_ID]);
  });

  afterAll(async () => {
    // Limpieza estricta de datos sintéticos
    await query(`DELETE FROM curation_proposals WHERE instagram_username = 'test_override_user';`);
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
    // El reel debió ser descartado porque includeReels=false
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

  it('3. Construye exactamente el payload a Apify con resultsLimit=3 e includeReels=false', async () => {
    const origFetch = globalThis.fetch;
    let interceptedUrl = '';
    let interceptedBody: any = null;

    // Permitir temporalmente simular llamada Apify en test runner
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
      expect(interceptedUrl).toContain('maxTotalChargeUsd=0.01');
      expect(interceptedBody).toEqual({
        username: ['salvajepalencia'],
        resultsLimit: 3,
        skipPinnedPosts: false,
      });
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.ALLOW_REAL_APIFY_IN_TESTS;
      delete process.env.APIFY_TOKEN;
    }
  });
});
