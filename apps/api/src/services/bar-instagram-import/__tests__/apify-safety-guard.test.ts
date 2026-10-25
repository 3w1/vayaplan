import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { runInstagramIngestion } from '../instagram-ingestion-service';
import { query } from '@vayaplan/db';

describe('Apify Safety Guard — Test Isolation', () => {
  let fixtureVenueId: number;
  let fixtureSourceId: number;

  beforeAll(async () => {
    // Crear venue y fuente de prueba exclusiva
    const vRes = await query(
      `INSERT INTO venues (city_id, name, slug, address, is_active)
       VALUES (1, 'Apify Guard Fixture Venue', 'apify-guard-fixture', 'C. Test Guard', true)
       RETURNING id;`
    );
    fixtureVenueId = vRes.rows[0].id;

    const sRes = await query(
      `INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, is_active)
       VALUES ($1, 'apify_guard_fixture_user', true)
       RETURNING id;`,
      [fixtureVenueId]
    );
    fixtureSourceId = sRes.rows[0].id;
  });

  afterAll(async () => {
    if (fixtureSourceId) {
      await query(`DELETE FROM instagram_ingestion_sources WHERE id = $1;`, [fixtureSourceId]);
    }
    if (fixtureVenueId) {
      await query(`DELETE FROM venues WHERE id = $1;`, [fixtureVenueId]);
    }
  });

  test('Bloquea llamadas reales a la API de Apify en entorno de test si no se proporciona mockPostsProvider', async () => {
    // Al intentar ejecutar sin mockPostsProvider en entorno de test, debe saltar la protección antes de cualquier llamada HTTP
    const report = await runInstagramIngestion({
      sourceIds: [fixtureSourceId],
      executionType: 'manual_single',
      // No pasamos mockPostsProvider intencionadamente
    });

    expect(report.sourcesProcessed).toBe(1);
    expect(report.errors.length).toBe(1);
    expect(report.errors[0].error).toContain('[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments');
  });
});
