import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { resetAttributionColumnCache, hasEventAttributionColumns } from '../../services/image-storage';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });
process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../index');

describe('Pruebas de Cierre: Atribución y Procedencia de Imágenes en Eventos', () => {
  let venueId: number;
  let eventWithCreditId: number;
  let eventWithoutCreditId: number;
  let targetDate = '2026-11-20';

  beforeAll(async () => {
    // Limpiar caché inicial
    resetAttributionColumnCache();

    // Crear recinto sintético
    const vRes = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
      VALUES (1, 'Teatro de Prueba Atribución', 'teatro-prueba-atribucion', 'Calle Mayor 1', true, now(), now())
      RETURNING id;
    `);
    venueId = vRes.rows[0].id;
  });

  afterAll(async () => {
    try {
      if (venueId) {
        await testPool.query('DELETE FROM events WHERE venue_id = $1', [venueId]);
        await testPool.query('DELETE FROM venues WHERE id = $1', [venueId]);
      }
      await testPool.end();
    } catch (_) {}
  });

  describe('1. Vía con base sin migración (fallback graceful)', () => {
    beforeAll(async () => {
      resetAttributionColumnCache();
      // Insertar evento en esquema base (sin columnas de atribución)
      const eRes = await testPool.query(`
        INSERT INTO events (
          city_id, venue_id, title, category, start_time, editorial_date, status, source_type, image_url, created_at, updated_at
        ) VALUES (
          1, $1, 'Evento Sin Migración', 'cultura', '2026-11-20T19:30:00Z', $2, 'published', 'web', 'https://media.vayaplan.com/events/test-detail.webp', now(), now()
        ) RETURNING id;
      `, [venueId, targetDate]);
      eventWithoutCreditId = eRes.rows[0].id;
    });

    test('la detección de columnas reporta false y no bloquea las consultas', async () => {
      const hasCols = await hasEventAttributionColumns((sql, params) => testPool.query(sql, params));
      expect(hasCols).toBe(false);
    });

    test('GET /api/v1/cities/palencia/events responde 200 con image_attribution: null', async () => {
      const res = await app.request(`/api/v1/cities/palencia/events?date=${targetDate}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const ev = data.events.find((e: any) => e.id === eventWithoutCreditId);
      expect(ev).toBeDefined();
      expect(ev.image_attribution).toBeNull();
    });

    test('GET /api/v1/events/:id responde 200 con image_attribution: null', async () => {
      const res = await app.request(`/api/v1/events/${eventWithoutCreditId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event).toBeDefined();
      expect(data.event.id).toBe(eventWithoutCreditId);
      expect(data.event.image_attribution).toBeNull();
    });

    test('GET /api/v1/cities/palencia/weekend responde 200 con image_attribution: null', async () => {
      // Viernes 20 de noviembre de 2026
      const res = await app.request(`/api/v1/cities/palencia/weekend?start=${targetDate}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.days).toBeDefined();
      const friday = data.days.find((d: any) => d.editorial_date === targetDate);
      expect(friday).toBeDefined();
      const ev = friday.events.find((e: any) => e.id === eventWithoutCreditId);
      expect(ev).toBeDefined();
      expect(ev.image_attribution).toBeNull();
    });
  });

  describe('2. Detección dinámica y activación de columnas', () => {
    test('aplicar columnas en la BD permite detectar su presencia inmediatamente sin reiniciar proceso', async () => {
      // Simular la migración añadiendo las 5 columnas en vayaplan_test
      await testPool.query(`
        ALTER TABLE events
          ADD COLUMN IF NOT EXISTS image_source_url TEXT NULL,
          ADD COLUMN IF NOT EXISTS image_source_title VARCHAR(150) NULL,
          ADD COLUMN IF NOT EXISTS image_author VARCHAR(150) NULL,
          ADD COLUMN IF NOT EXISTS image_license VARCHAR(50) NULL,
          ADD COLUMN IF NOT EXISTS image_license_url TEXT NULL;
      `);

      // Verificar que hasEventAttributionColumns detecta true de inmediato
      const hasCols = await hasEventAttributionColumns((sql, params) => testPool.query(sql, params));
      expect(hasCols).toBe(true);
    });
  });

  describe('3. Vía con base migrada y datos de atribución', () => {
    beforeAll(async () => {
      resetAttributionColumnCache();

      // Crear evento sintético con procedencia completa (simulando Teatro Principal)
      const eRes = await testPool.query(`
        INSERT INTO events (
          city_id, venue_id, title, category, start_time, editorial_date, status, source_type, image_url,
          image_source_url, image_source_title, image_author, created_at, updated_at
        ) VALUES (
          1, $1, 'El Paraíso de los Negros Test', 'cultura', '2026-11-20T20:30:00Z', $2, 'published', 'scraper',
          'https://media.vayaplan.com/events/cb14efbe-1d77-4835-a912-b0162d116d51-detail.webp',
          'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
          'web del Teatro Principal de Palencia',
          NULL,
          now(), now()
        ) RETURNING id;
      `, [venueId, targetDate]);
      eventWithCreditId = eRes.rows[0].id;
    });

    afterAll(async () => {
      // Revertir columnas añadidas para dejar la BD de test en su estado base
      try {
        await testPool.query(`
          ALTER TABLE events
            DROP COLUMN IF EXISTS image_source_url,
            DROP COLUMN IF EXISTS image_source_title,
            DROP COLUMN IF EXISTS image_author,
            DROP COLUMN IF EXISTS image_license,
            DROP COLUMN IF EXISTS image_license_url;
        `);
        resetAttributionColumnCache();
      } catch (_) {}
    });

    test('GET /api/v1/cities/palencia/events serializa image_attribution en agenda diaria', async () => {
      const res = await app.request(`/api/v1/cities/palencia/events?date=${targetDate}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const ev = data.events.find((e: any) => e.id === eventWithCreditId);
      expect(ev).toBeDefined();
      expect(ev.image_attribution).toEqual({
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
        license: null,
        license_url: null,
      });
    });

    test('GET /api/v1/events/:id serializa image_attribution en ficha individual', async () => {
      const res = await app.request(`/api/v1/events/${eventWithCreditId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event).toBeDefined();
      expect(data.event.image_attribution).toEqual({
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
        license: null,
        license_url: null,
      });
    });

    test('GET /api/v1/cities/palencia/weekend serializa image_attribution en fin de semana', async () => {
      const res = await app.request(`/api/v1/cities/palencia/weekend?start=${targetDate}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const friday = data.days.find((d: any) => d.editorial_date === targetDate);
      expect(friday).toBeDefined();
      const ev = friday.events.find((e: any) => e.id === eventWithCreditId);
      expect(ev).toBeDefined();
      expect(ev.image_attribution).toEqual({
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
        license: null,
        license_url: null,
      });
    });

    test('evento sin procedencia en base migrada serializa image_attribution: null sin bloques vacíos', async () => {
      const res = await app.request(`/api/v1/events/${eventWithoutCreditId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event.image_attribution).toBeNull();
    });
  });
});
