import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateRoutePublication,
  VALID_GASTRONOMIC_ROUTE_CATEGORIES,
  GASTRONOMIC_ROUTE_CATEGORY_LABELS,
  type RouteParticipantPublicationCandidate,
} from '@vayaplan/shared';
import type {
  GastronomicRoute,
  GastronomicRouteParticipant,
  PublicRouteParticipantItem,
  SingleGastronomicRouteResponseContract,
  VenueSummary,
} from '@vayaplan/types';

const rawTestDbUrl = process.env.TEST_DATABASE_URL;
if (!rawTestDbUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
}

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

const migrationSqlPath = path.resolve(__dirname, '../../../../../infra/migrations/012_gastronomic_routes.sql');
const rollbackSqlPath = path.resolve(__dirname, '../../../../../infra/migrations/rollback_012_gastronomic_routes.sql');

const migrationSql = fs.readFileSync(migrationSqlPath, 'utf-8');
const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf-8');

describe('Fase 1 — Rutas Gastronómicas: Modelo de Datos, Restricciones y Validación', () => {
  let venueId1: number;
  let venueId2: number;
  let venueId3: number;
  const createdRouteIds: number[] = [];
  const createdVenueIds: number[] = [];

  beforeAll(async () => {
    // Asegurar esquema 012 aplicado
    await testPool.query(migrationSql);

    // Crear locales de prueba en Palencia (city_id = 1)
    const v1 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar La Mejillonera Test', 'bar-la-mejillonera-test', 'C/ Mayor 10', 42.0095, -4.5320, true, now(), now())
      RETURNING id;
    `);
    venueId1 = v1.rows[0].id;
    createdVenueIds.push(venueId1);

    const v2 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Cervecería La Alcoholera Test', 'cerveceria-la-alcoholera-test', 'Plaza Mayor 4', 42.0101, -4.5315, true, now(), now())
      RETURNING id;
    `);
    venueId2 = v2.rows[0].id;
    createdVenueIds.push(venueId2);

    const v3 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Mesón El Diezmo Test', 'meson-el-diezmo-test', 'C/ Don Sancho 12', 42.0088, -4.5332, false, now(), now())
      RETURNING id;
    `);
    venueId3 = v3.rows[0].id; // venue inactivo para pruebas de publicación
    createdVenueIds.push(venueId3);
  });

  afterAll(async () => {
    // Limpieza de datos creados en pruebas
    if (createdRouteIds.length > 0) {
      await testPool.query(`DELETE FROM gastronomic_routes WHERE id = ANY($1::int[])`, [createdRouteIds]);
    }
    if (createdVenueIds.length > 0) {
      await testPool.query(`DELETE FROM venues WHERE id = ANY($1::int[])`, [createdVenueIds]);
    }
    await testPool.end();
  });

  describe('1. Ciclo de Migración y Rollback DDL', () => {
    test('Aplica rollback_012_gastronomic_routes.sql y elimina tablas limpiamente sin tocar cities ni venues', async () => {
      // Ejecutar rollback
      await testPool.query(rollbackSql);

      const tableCheck = await testPool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('gastronomic_routes', 'gastronomic_route_participants');
      `);
      expect(tableCheck.rows.length).toBe(0);

      // Confirmar que cities y venues siguen existiendo
      const baseTables = await testPool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('cities', 'venues');
      `);
      expect(baseTables.rows.length).toBe(2);

      // Re-aplicar migración 012 para continuar los tests
      await testPool.query(migrationSql);

      const reCheck = await testPool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('gastronomic_routes', 'gastronomic_route_participants')
        ORDER BY table_name;
      `);
      expect(reCheck.rows.length).toBe(2);
    });

    test('Verifica existencia y tipos de columnas en gastronomic_routes', async () => {
      const cols = await testPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gastronomic_routes'
        ORDER BY ordinal_position;
      `);
      const colMap = new Map(cols.rows.map((r: any) => [r.column_name, r]));

      expect(colMap.has('id')).toBe(true);
      expect(colMap.has('city_id')).toBe(true);
      expect(colMap.has('title')).toBe(true);
      expect(colMap.has('slug')).toBe(true);
      expect(colMap.has('summary')).toBe(true);
      expect(colMap.has('description')).toBe(true);
      expect(colMap.has('category')).toBe(true);
      expect(colMap.has('status')).toBe(true);
      expect(colMap.has('start_date')).toBe(true);
      expect(colMap.has('end_date')).toBe(true);
      expect(colMap.has('image_url')).toBe(true);
      expect(colMap.has('image_thumb_url')).toBe(true);
      expect(colMap.has('badge_label')).toBe(true);
      expect(colMap.has('approximate_price_cents')).toBe(true);

      // Comprobar que NO existen columnas de itinerario
      expect(colMap.has('estimated_duration_min')).toBe(false);
      expect(colMap.has('itinerary')).toBe(false);
      expect(colMap.has('distance_km')).toBe(false);
    });

    test('Verifica existencia de columna is_active y constraints en gastronomic_route_participants', async () => {
      const cols = await testPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gastronomic_route_participants'
        ORDER BY ordinal_position;
      `);
      const colMap = new Map(cols.rows.map((r: any) => [r.column_name, r]));

      expect(colMap.has('id')).toBe(true);
      expect(colMap.has('route_id')).toBe(true);
      expect(colMap.has('venue_id')).toBe(true);
      expect(colMap.has('display_order')).toBe(true);
      expect(colMap.has('dish_name')).toBe(true);
      expect(colMap.has('dish_description')).toBe(true);
      expect(colMap.has('dish_price_cents')).toBe(true);
      expect(colMap.has('dish_image_url')).toBe(true);
      expect(colMap.has('is_optional')).toBe(true);
      expect(colMap.has('is_active')).toBe(true);
      expect(colMap.get('is_active').is_nullable).toBe('NO');
      expect(colMap.get('dish_image_url').is_nullable).toBe('YES'); // Opcional
    });
  });

  describe('2. Restricciones y Reglas de Integridad en gastronomic_routes', () => {
    test('Unicidad de slug por ciudad (uq_gastronomic_routes_city_slug)', async () => {
      const res1 = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta de las Bravas Palentinas', 'ruta-bravas-palencia-test', 'Las mejores bravas', 'bravas', 'draft')
        RETURNING id;
      `);
      createdRouteIds.push(res1.rows[0].id);

      // Intento de duplicar slug en la misma ciudad debe fallar con código 23505 (unique_violation)
      let duplicateError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
          VALUES (1, 'Otra Ruta de Bravas', 'ruta-bravas-palencia-test', 'Resumen duplicado', 'bravas', 'draft');
        `);
      } catch (err) {
        duplicateError = err;
      }
      expect(duplicateError).not.toBeNull();
      expect(duplicateError.code).toBe('23505');
    });

    test('Restricción CHECK de estado (chk_gastronomic_routes_status)', async () => {
      let statusError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
          VALUES (1, 'Ruta Estado Invalido', 'ruta-estado-invalido-test', 'Resumen', 'tapas', 'invalid_status');
        `);
      } catch (err) {
        statusError = err;
      }
      expect(statusError).not.toBeNull();
      expect(statusError.code).toBe('23514'); // check_violation
    });

    test('Restricción CHECK de categoría cerrada (chk_gastronomic_routes_category)', async () => {
      let categoryError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
          VALUES (1, 'Ruta Categoria Invalida', 'ruta-cat-invalida-test', 'Resumen', 'fast_food', 'draft');
        `);
      } catch (err) {
        categoryError = err;
      }
      expect(categoryError).not.toBeNull();
      expect(categoryError.code).toBe('23514'); // check_violation

      // Categorías válidas deben permitirse todas
      for (const cat of ['tapas', 'bravas', 'puchero', 'reposteria', 'vino', 'general']) {
        const catRes = await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
          VALUES (1, 'Ruta Cat ${cat}', 'ruta-cat-${cat}-test', 'Resumen', $1, 'draft')
          RETURNING id;
        `, [cat]);
        createdRouteIds.push(catRes.rows[0].id);
      }
    });

    test('Restricción CHECK de fechas coherentes (chk_gastronomic_routes_dates)', async () => {
      // Rutas permanentes (start_date y end_date null) son válidas
      const permRes = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status, start_date, end_date)
        VALUES (1, 'Ruta Permanente', 'ruta-permanente-test', 'Todo el año', 'general', 'draft', NULL, NULL)
        RETURNING id;
      `);
      createdRouteIds.push(permRes.rows[0].id);

      // Rutas temporales con end_date >= start_date son válidas
      const tempRes = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status, start_date, end_date)
        VALUES (1, 'Ruta Otonal', 'ruta-otonal-test', 'Temporada', 'puchero', 'draft', '2026-11-01', '2026-11-30')
        RETURNING id;
      `);
      createdRouteIds.push(tempRes.rows[0].id);

      // Rutas con end_date anterior a start_date deben ser rechazadas
      let datesError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status, start_date, end_date)
          VALUES (1, 'Ruta Fechas Invertidas', 'ruta-fechas-inv-test', 'Invalida', 'tapas', 'draft', '2026-12-01', '2026-11-01');
        `);
      } catch (err) {
        datesError = err;
      }
      expect(datesError).not.toBeNull();
      expect(datesError.code).toBe('23514'); // check_violation
    });

    test('Restricción CHECK de precio orientativo positivo (chk_gastronomic_routes_price)', async () => {
      let priceError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status, approximate_price_cents)
          VALUES (1, 'Ruta Precio Negativo', 'ruta-precio-neg-test', 'Invalida', 'tapas', 'draft', -50);
        `);
      } catch (err) {
        priceError = err;
      }
      expect(priceError).not.toBeNull();
      expect(priceError.code).toBe('23514');
    });
  });

  describe('3. Restricciones y Reglas en gastronomic_route_participants', () => {
    let testRouteId: number;

    beforeAll(async () => {
      const r = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Participantes Test', 'ruta-participantes-test', 'Pruebas de participantes', 'tapas', 'draft')
        RETURNING id;
      `);
      testRouteId = r.rows[0].id;
      createdRouteIds.push(testRouteId);
    });

    test('Inserción de participantes con propuesta concreta y foto opcional', async () => {
      // Participante 1: con foto de tapa
      const p1 = await testPool.query(`
        INSERT INTO gastronomic_route_participants (
          route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, dish_image_url, is_active
        ) VALUES (
          $1, $2, 1, 'Bravas Clásicas de la Mejillonera', 'Salsa brava tradicional receta secreta', 350, 'https://cdn.vayaplan.com/dishes/bravas.webp', true
        ) RETURNING id, is_active;
      `, [testRouteId, venueId1]);
      expect(p1.rows[0].id).toBeGreaterThan(0);
      expect(p1.rows[0].is_active).toBe(true);

      // Participante 2: sin foto de tapa (dish_image_url NULL) y sin precio
      const p2 = await testPool.query(`
        INSERT INTO gastronomic_route_participants (
          route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, dish_image_url, is_active
        ) VALUES (
          $1, $2, 2, 'Tosta de Cecina y Foie', 'Pan rústico con cecina de Palencia', NULL, NULL, true
        ) RETURNING id, dish_image_url;
      `, [testRouteId, venueId2]);
      expect(p2.rows[0].id).toBeGreaterThan(0);
      expect(p2.rows[0].dish_image_url).toBeNull();
    });

    test('Unicidad de venue en la misma ruta (uq_route_participant_venue)', async () => {
      let duplicateVenueError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_route_participants (
            route_id, venue_id, display_order, dish_name, is_active
          ) VALUES ($1, $2, 3, 'Segunda tapa en el mismo bar', true);
        `, [testRouteId, venueId1]);
      } catch (err) {
        duplicateVenueError = err;
      }
      expect(duplicateVenueError).not.toBeNull();
      expect(duplicateVenueError.code).toBe('23505');
    });

    test('Permite que el mismo venue participe en otra ruta distinta con propuesta diferente', async () => {
      const otherRoute = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Diferente Misma Ciudad', 'ruta-dif-test', 'Resumen', 'vino', 'draft')
        RETURNING id;
      `);
      createdRouteIds.push(otherRoute.rows[0].id);

      const pOther = await testPool.query(`
        INSERT INTO gastronomic_route_participants (
          route_id, venue_id, display_order, dish_name, dish_description, is_active
        ) VALUES ($1, $2, 1, 'Maridaje Ribera del Duero y Tapa', 'Propuesta para otra ruta', true)
        RETURNING id;
      `, [otherRoute.rows[0].id, venueId1]);
      expect(pOther.rows[0].id).toBeGreaterThan(0);
    });

    test('Unicidad de display_order en la misma ruta (uq_route_participant_display_order)', async () => {
      let duplicateOrderError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_route_participants (
            route_id, venue_id, display_order, dish_name, is_active
          ) VALUES ($1, $2, 1, 'Conflicto de orden', true);
        `, [testRouteId, venueId3]);
      } catch (err) {
        duplicateOrderError = err;
      }
      expect(duplicateOrderError).not.toBeNull();
      expect(duplicateOrderError.code).toBe('23505');
    });

    test('Restricción CHECK de display_order > 0 (chk_route_participant_display_order)', async () => {
      let orderZeroError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_route_participants (
            route_id, venue_id, display_order, dish_name, is_active
          ) VALUES ($1, $2, 0, 'Orden cero', true);
        `, [testRouteId, venueId3]);
      } catch (err) {
        orderZeroError = err;
      }
      expect(orderZeroError).not.toBeNull();
      expect(orderZeroError.code).toBe('23514');
    });

    test('Restricción CHECK de dish_price_cents >= 0 (chk_route_participant_dish_price)', async () => {
      let dishPriceError: any = null;
      try {
        await testPool.query(`
          INSERT INTO gastronomic_route_participants (
            route_id, venue_id, display_order, dish_name, dish_price_cents, is_active
          ) VALUES ($1, $2, 10, 'Tapa precio negativo', -200, true);
        `, [testRouteId, venueId3]);
      } catch (err) {
        dishPriceError = err;
      }
      expect(dishPriceError).not.toBeNull();
      expect(dishPriceError.code).toBe('23514');
    });

    test('Integridad referencial: ON DELETE RESTRICT impide borrar venue participante', async () => {
      let deleteVenueError: any = null;
      try {
        await testPool.query(`DELETE FROM venues WHERE id = $1`, [venueId1]);
      } catch (err) {
        deleteVenueError = err;
      }
      expect(deleteVenueError).not.toBeNull();
      expect(deleteVenueError.code).toBe('23503'); // foreign_key_violation
    });

    test('Integridad referencial: ON DELETE CASCADE elimina participantes al borrar ruta', async () => {
      // Crear ruta temporal con participante
      const tempR = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Borrado Cascada', 'ruta-borrado-cascada-test', 'Temp', 'tapas', 'draft')
        RETURNING id;
      `);
      const tempRouteId = tempR.rows[0].id;

      await testPool.query(`
        INSERT INTO gastronomic_route_participants (
          route_id, venue_id, display_order, dish_name, is_active
        ) VALUES ($1, $2, 1, 'Tapa efímera', true);
      `, [tempRouteId, venueId3]);

      // Borrar la ruta
      await testPool.query(`DELETE FROM gastronomic_routes WHERE id = $1`, [tempRouteId]);

      // Comprobar que los participantes fueron borrados
      const parts = await testPool.query(`
        SELECT count(*) FROM gastronomic_route_participants WHERE route_id = $1;
      `, [tempRouteId]);
      expect(Number(parts.rows[0].count)).toBe(0);

      // Comprobar que el venue sigue existiendo intacto
      const vCheck = await testPool.query(`SELECT id FROM venues WHERE id = $1`, [venueId3]);
      expect(vCheck.rows.length).toBe(1);
    });
  });

  describe('4. Regla de Negocio: validateRoutePublication', () => {
    test('Permite publicación si hay al menos 2 locales participantes activos (con venue activo)', () => {
      const candidates: RouteParticipantPublicationCandidate[] = [
        { is_active: true, venue_is_active: true },
        { is_active: true, venue_is_active: true },
      ];
      const result = validateRoutePublication(candidates);
      expect(result.canPublish).toBe(true);
      expect(result.activeParticipantsCount).toBe(2);
      expect(result.reason).toBeUndefined();
    });

    test('Permite publicación con más de 2 participantes activos, ignorando inactivos', () => {
      const candidates: RouteParticipantPublicationCandidate[] = [
        { is_active: true, venue_is_active: true },
        { is_active: false, venue_is_active: true }, // participante inactivo
        { is_active: true, venue_is_active: false }, // venue inactivo en el censo
        { is_active: true, venue_is_active: true },
        { is_active: true, venue_is_active: true },
      ];
      const result = validateRoutePublication(candidates);
      expect(result.canPublish).toBe(true);
      expect(result.activeParticipantsCount).toBe(3);
    });

    test('Rechaza publicación con 0 participantes', () => {
      const result = validateRoutePublication([]);
      expect(result.canPublish).toBe(false);
      expect(result.activeParticipantsCount).toBe(0);
      expect(result.reason).toContain('al menos 2 locales participantes activos');
    });

    test('Rechaza publicación con exactamente 1 participante activo', () => {
      const candidates: RouteParticipantPublicationCandidate[] = [
        { is_active: true, venue_is_active: true },
      ];
      const result = validateRoutePublication(candidates);
      expect(result.canPublish).toBe(false);
      expect(result.activeParticipantsCount).toBe(1);
      expect(result.reason).toContain('al menos 2 locales participantes activos');
    });

    test('Rechaza si hay 2 participantes pero uno tiene is_active = false', () => {
      const candidates: RouteParticipantPublicationCandidate[] = [
        { is_active: true, venue_is_active: true },
        { is_active: false, venue_is_active: true },
      ];
      const result = validateRoutePublication(candidates);
      expect(result.canPublish).toBe(false);
      expect(result.activeParticipantsCount).toBe(1);
    });

    test('Rechaza si hay 2 participantes pero el venue de uno de ellos tiene venue_is_active = false', () => {
      const candidates: RouteParticipantPublicationCandidate[] = [
        { is_active: true, venue_is_active: true },
        { is_active: true, venue_is_active: false },
      ];
      const result = validateRoutePublication(candidates);
      expect(result.canPublish).toBe(false);
      expect(result.activeParticipantsCount).toBe(1);
    });
  });

  describe('5. Catálogo de Categorías y Verificación de Contratos', () => {
    test('VALID_GASTRONOMIC_ROUTE_CATEGORIES coincide exactamente con la lista cerrada aprobada', () => {
      expect(VALID_GASTRONOMIC_ROUTE_CATEGORIES).toEqual([
        'tapas',
        'bravas',
        'puchero',
        'reposteria',
        'vino',
        'general',
      ]);
    });

    test('GASTRONOMIC_ROUTE_CATEGORY_LABELS contiene etiquetas legibles en español para todas las categorías', () => {
      for (const cat of VALID_GASTRONOMIC_ROUTE_CATEGORIES) {
        expect(GASTRONOMIC_ROUTE_CATEGORY_LABELS[cat]).toBeDefined();
        expect(typeof GASTRONOMIC_ROUTE_CATEGORY_LABELS[cat]).toBe('string');
        expect(GASTRONOMIC_ROUTE_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
      }
    });

    test('VenueSummary incluye address opcional y conserva compatibilidad hacia atrás', () => {
      const venueWithAddress: VenueSummary = {
        id: 1,
        name: 'Bar La Mejillonera',
        slug: 'bar-la-mejillonera',
        address: 'C/ Mayor 10',
        latitude: 42.0095,
        longitude: -4.5320,
        google_maps_url: 'https://maps.google.com/?q=42.0095,-4.5320',
      };
      expect(venueWithAddress.address).toBe('C/ Mayor 10');

      const venueWithoutAddress: VenueSummary = {
        id: 2,
        name: 'Local Sin Dirección',
        slug: 'local-sin-direccion',
        latitude: null,
        longitude: null,
        google_maps_url: null,
      };
      expect(venueWithoutAddress.address).toBeUndefined();
    });

    test('Contratos públicos (PublicRouteParticipantItem y SingleGastronomicRouteResponseContract) no exponen display_order', () => {
      const publicParticipant: PublicRouteParticipantItem = {
        id: 1,
        dish: {
          name: 'Patatas Bravas',
          description: 'Salsa brava tradicional',
          price_cents: 350,
          price_label: '3,50 €',
          image_url: null,
        },
        venue: {
          id: 1,
          name: 'Bar La Mejillonera',
          slug: 'bar-la-mejillonera',
          address: 'C/ Mayor 10',
          latitude: 42.0095,
          longitude: -4.5320,
          google_maps_url: null,
        },
        is_optional: false,
      };

      // Confirmar que no hay propiedad display_order en el contrato público
      const keys = Object.keys(publicParticipant);
      expect(keys.includes('display_order')).toBe(false);

      const publicResponse: SingleGastronomicRouteResponseContract = {
        route: {
          id: 10,
          title: 'Ruta de las Bravas',
          slug: 'ruta-de-las-bravas',
          summary: 'Las mejores de Palencia',
          description: null,
          category: 'bravas',
          status: 'published',
          badge_label: 'Popular',
          start_date: null,
          end_date: null,
          is_permanent: true,
          approximate_price_cents: 800,
          image_url: null,
          image_thumb_url: null,
          city: {
            slug: 'palencia',
            name: 'Palencia',
          },
          participants: [publicParticipant],
        },
      };

      expect(publicResponse.route.participants[0].id).toBe(1);
      expect((publicResponse.route as any).display_order).toBeUndefined();
    });
  });
});
