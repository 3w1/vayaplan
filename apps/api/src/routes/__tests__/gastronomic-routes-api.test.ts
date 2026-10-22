import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

const rawTestDbUrl = process.env.TEST_DATABASE_URL;
if (!rawTestDbUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
}

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../index');
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

describe('API Pública — Rutas Gastronómicas (GET /api/v1/cities/:citySlug/routes y /:routeSlug)', () => {
  let activeVenueId1: number;
  let activeVenueId2: number;
  let activeVenueId3: number;
  let inactiveVenueId: number;

  let validPublishedRouteId: number;
  let seasonalPublishedRouteId: number;
  let draftRouteId: number;
  let archivedRouteId: number;
  let insufficientRouteId: number;

  const createdVenueIds: number[] = [];
  const createdRouteIds: number[] = [];

  beforeAll(async () => {
    // 1. Crear venues de prueba en Palencia (city_id = 1)
    const v1 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar La Mejillonera Api Test', 'bar-la-mejillonera-api-test', 'C/ Mayor 10', 42.0095, -4.5320, true, now(), now())
      RETURNING id;
    `);
    activeVenueId1 = v1.rows[0].id;
    createdVenueIds.push(activeVenueId1);

    const v2 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Cervecería La Alcoholera Api Test', 'cerveceria-la-alcoholera-api-test', 'Plaza Mayor 4', 42.0101, -4.5315, true, now(), now())
      RETURNING id;
    `);
    activeVenueId2 = v2.rows[0].id;
    createdVenueIds.push(activeVenueId2);

    const v3 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar Babel Api Test', 'bar-babel-api-test', 'C/ Don Sancho 8', 42.0080, -4.5310, true, now(), now())
      RETURNING id;
    `);
    activeVenueId3 = v3.rows[0].id;
    createdVenueIds.push(activeVenueId3);

    const vInactive = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Mesón El Diezmo Cerrado Api Test', 'meson-el-diezmo-cerrado-api-test', 'C/ Don Sancho 12', 42.0088, -4.5332, false, now(), now())
      RETURNING id;
    `);
    inactiveVenueId = vInactive.rows[0].id;
    createdVenueIds.push(inactiveVenueId);

    // 2. Ruta 1: Publicada, permanente (start_date=null, end_date=null), con 2 participantes activos, 1 participante inactivo y 1 venue inactivo
    const rValid = await testPool.query(`
      INSERT INTO gastronomic_routes (
        city_id, title, slug, summary, description, category, status, start_date, end_date, badge_label, approximate_price_cents
      ) VALUES (
        1, 'Ruta de las Bravas Palentinas', 'ruta-bravas-palencia', 'Selección de las mejores bravas de la ciudad',
        'Descripción detallada de la ruta de bravas', 'bravas', 'published', NULL, NULL, 'Recomendada', 350
      ) RETURNING id;
    `);
    validPublishedRouteId = rValid.rows[0].id;
    createdRouteIds.push(validPublishedRouteId);

    // Participante 1: activo, con precio y foto
    await testPool.query(`
      INSERT INTO gastronomic_route_participants (
        route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, dish_image_url, is_optional, is_active
      ) VALUES (
        $1, $2, 1, 'Bravas Tradicionales', 'Salsa especial casera', 350, 'https://cdn.vayaplan.com/bravas1.webp', false, true
      );
    `, [validPublishedRouteId, activeVenueId1]);

    // Participante 2: activo, sin precio y sin foto
    await testPool.query(`
      INSERT INTO gastronomic_route_participants (
        route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, dish_image_url, is_optional, is_active
      ) VALUES (
        $1, $2, 2, 'Bravas de la Alcoholera', 'Bravas picantes', NULL, NULL, false, true
      );
    `, [validPublishedRouteId, activeVenueId2]);

    // Participante 3: inactivo (is_active = false) con venue activo (no debe contar)
    await testPool.query(`
      INSERT INTO gastronomic_route_participants (
        route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, is_optional, is_active
      ) VALUES (
        $1, $2, 3, 'Tapa Desactivada Temporalmente', 'No disponible', 400, false, false
      );
    `, [validPublishedRouteId, activeVenueId3]);

    // Participante 4: activo pero con local inactivo en censo (venue_is_active = false, no debe contar)
    await testPool.query(`
      INSERT INTO gastronomic_route_participants (
        route_id, venue_id, display_order, dish_name, dish_description, dish_price_cents, is_optional, is_active
      ) VALUES (
        $1, $2, 4, 'Tapa de Local Cerrado', 'Local inactivo', 500, false, true
      );
    `, [validPublishedRouteId, inactiveVenueId]);

    // 3. Ruta 2: Publicada, estacional/temporal (start_date='2026-11-01', end_date='2026-11-30')
    const rSeasonal = await testPool.query(`
      INSERT INTO gastronomic_routes (
        city_id, title, slug, summary, category, status, start_date, end_date, badge_label, approximate_price_cents
      ) VALUES (
        1, 'Ruta de Otoño y Puchero', 'ruta-otono-puchero', 'Platos de cuchara y puchero palentino',
        'puchero', 'published', '2026-11-01', '2026-11-30', 'Temporada', 1200
      ) RETURNING id;
    `);
    seasonalPublishedRouteId = rSeasonal.rows[0].id;
    createdRouteIds.push(seasonalPublishedRouteId);

    await testPool.query(`
      INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
      VALUES ($1, $2, 1, 'Alubias de Saldaña', true), ($1, $3, 2, 'Sopa Castellana', true);
    `, [seasonalPublishedRouteId, activeVenueId1, activeVenueId2]);

    // 4. Ruta 3: Borrador ('draft') con 2 participantes válidos
    const rDraft = await testPool.query(`
      INSERT INTO gastronomic_routes (
        city_id, title, slug, summary, category, status
      ) VALUES (
        1, 'Ruta en Borrador', 'ruta-borrador-test', 'Resumen borrador', 'tapas', 'draft'
      ) RETURNING id;
    `);
    draftRouteId = rDraft.rows[0].id;
    createdRouteIds.push(draftRouteId);

    await testPool.query(`
      INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
      VALUES ($1, $2, 1, 'Tapa Borrador 1', true), ($1, $3, 2, 'Tapa Borrador 2', true);
    `, [draftRouteId, activeVenueId1, activeVenueId2]);

    // 5. Ruta 4: Archivada ('archived') con 2 participantes válidos
    const rArchived = await testPool.query(`
      INSERT INTO gastronomic_routes (
        city_id, title, slug, summary, category, status
      ) VALUES (
        1, 'Ruta Archivada', 'ruta-archivada-test', 'Resumen archivada', 'tapas', 'archived'
      ) RETURNING id;
    `);
    archivedRouteId = rArchived.rows[0].id;
    createdRouteIds.push(archivedRouteId);

    await testPool.query(`
      INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
      VALUES ($1, $2, 1, 'Tapa Archivada 1', true), ($1, $3, 2, 'Tapa Archivada 2', true);
    `, [archivedRouteId, activeVenueId1, activeVenueId2]);

    // 6. Ruta 5: Publicada pero con solo 1 participante válido (insuficiente para ser visible)
    const rInsufficient = await testPool.query(`
      INSERT INTO gastronomic_routes (
        city_id, title, slug, summary, category, status
      ) VALUES (
        1, 'Ruta Un Solo Participante', 'ruta-un-solo-participante', 'Insuficiente', 'tapas', 'published'
      ) RETURNING id;
    `);
    insufficientRouteId = rInsufficient.rows[0].id;
    createdRouteIds.push(insufficientRouteId);

    await testPool.query(`
      INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
      VALUES ($1, $2, 1, 'Única Tapa Válida', true);
    `, [insufficientRouteId, activeVenueId1]);
  });

  afterAll(async () => {
    if (createdRouteIds.length > 0) {
      await testPool.query(`DELETE FROM gastronomic_routes WHERE id = ANY($1::int[])`, [createdRouteIds]);
    }
    if (createdVenueIds.length > 0) {
      await testPool.query(`DELETE FROM venues WHERE id = ANY($1::int[])`, [createdVenueIds]);
    }
    await testPool.end();
  });

  describe('1. Listado Público (GET /api/v1/cities/:citySlug/routes)', () => {
    test('Devuelve 200 y lista únicamente las rutas publicadas con al menos 2 participantes válidos', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.city).toBeDefined();
      expect(json.city.slug).toBe('palencia');
      expect(json.city.name).toBe('Palencia');
      expect(Array.isArray(json.routes)).toBe(true);

      const slugs = json.routes.map((r: any) => r.slug);
      // Incluye las dos publicadas válidas
      expect(slugs).toContain('ruta-bravas-palencia');
      expect(slugs).toContain('ruta-otono-puchero');

      // Excluye borrador y archivada
      expect(slugs).not.toContain('ruta-borrador-test');
      expect(slugs).not.toContain('ruta-archivada-test');

      // Excluye ruta con solo 1 participante válido
      expect(slugs).not.toContain('ruta-un-solo-participante');
    });

    test('El conteo participants_count solo cuenta participantes activos con venue activo', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes');
      expect(res.status).toBe(200);

      const json = await res.json();
      const bravasRoute = json.routes.find((r: any) => r.slug === 'ruta-bravas-palencia');
      expect(bravasRoute).toBeDefined();

      // Tenía 4 participantes en BD, pero 1 con is_active=false y 1 con venue_is_active=false
      // El conteo público debe ser exactamente 2
      expect(bravasRoute.participants_count).toBe(2);
    });

    test('is_permanent se calcula adecuadamente para rutas permanentes y de temporada', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes');
      const json = await res.json();

      const bravas = json.routes.find((r: any) => r.slug === 'ruta-bravas-palencia');
      expect(bravas.is_permanent).toBe(true);
      expect(bravas.start_date).toBeNull();
      expect(bravas.end_date).toBeNull();

      const otono = json.routes.find((r: any) => r.slug === 'ruta-otono-puchero');
      expect(otono.is_permanent).toBe(false);
      expect(otono.start_date).toBe('2026-11-01');
      expect(otono.end_date).toBe('2026-11-30');
    });

    test('No expone display_order en el listado público', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes');
      const json = await res.json();

      for (const route of json.routes) {
        expect(route.display_order).toBeUndefined();
        expect(Object.keys(route)).not.toContain('display_order');
      }
    });

    test('Devuelve 404 city_not_found para ciudad inexistente o inactiva', async () => {
      const res = await app.request('/api/v1/cities/ciudad-fantasma-inexistente/routes');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('city_not_found');
    });
  });

  describe('2. Detalle Público (GET /api/v1/cities/:citySlug/routes/:routeSlug)', () => {
    test('Devuelve 200 con la información completa de la ruta y sus participantes activos', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-bravas-palencia');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.route).toBeDefined();
      expect(json.route.slug).toBe('ruta-bravas-palencia');
      expect(json.route.title).toBe('Ruta de las Bravas Palentinas');
      expect(json.route.category).toBe('bravas');
      expect(json.route.status).toBe('published');
      expect(json.route.is_permanent).toBe(true);
      expect(json.route.approximate_price_cents).toBe(350);

      // Participantes
      expect(Array.isArray(json.route.participants)).toBe(true);
      expect(json.route.participants.length).toBe(2);

      // Participante 1: con precio formateado y foto
      const p1 = json.route.participants[0];
      expect(p1.dish.name).toBe('Bravas Tradicionales');
      expect(p1.dish.price_cents).toBe(350);
      expect(p1.dish.price_label).toBe('3,50 €');
      expect(p1.dish.image_url).toBe('https://cdn.vayaplan.com/bravas1.webp');
      expect(p1.venue.name).toBe('Bar La Mejillonera Api Test');
      expect(p1.venue.address).toBe('C/ Mayor 10');
      expect(p1.venue.google_maps_url).toContain('https://www.google.com/maps/search/?api=1&query=42.0095,-4.532');

      // Participante 2: sin precio y sin foto
      const p2 = json.route.participants[1];
      expect(p2.dish.name).toBe('Bravas de la Alcoholera');
      expect(p2.dish.price_cents).toBeNull();
      expect(p2.dish.price_label).toBeNull();
      expect(p2.dish.image_url).toBeNull();
      expect(p2.venue.name).toBe('Cervecería La Alcoholera Api Test');

      // Participantes inactivos (p3 y p4) no deben aparecer
      const dishNames = json.route.participants.map((p: any) => p.dish.name);
      expect(dishNames).not.toContain('Tapa Desactivada Temporalmente');
      expect(dishNames).not.toContain('Tapa de Local Cerrado');
    });

    test('No expone display_order, orden de visita ni datos de itinerario en la respuesta', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-bravas-palencia');
      const json = await res.json();

      expect((json.route as any).display_order).toBeUndefined();
      expect((json.route as any).itinerary).toBeUndefined();
      expect((json.route as any).estimated_duration_min).toBeUndefined();
      expect((json.route as any).distance_km).toBeUndefined();

      for (const p of json.route.participants) {
        expect((p as any).display_order).toBeUndefined();
        expect((p as any).stop_number).toBeUndefined();
        expect((p as any).visit_order).toBeUndefined();
      }
    });

    test('Devuelve 404 para ruta en estado borrador (draft)', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-borrador-test');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('route_not_found');
    });

    test('Devuelve 404 para ruta archivada (archived)', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-archivada-test');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('route_not_found');
    });

    test('Devuelve 404 para ruta con menos de 2 participantes válidos', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-un-solo-participante');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('route_not_found');
    });

    test('Devuelve 404 para slug de ruta inexistente en la ciudad', async () => {
      const res = await app.request('/api/v1/cities/palencia/routes/ruta-que-no-existe');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('route_not_found');
    });

    test('Devuelve 404 para ciudad inexistente', async () => {
      const res = await app.request('/api/v1/cities/otra-ciudad/routes/ruta-bravas-palencia');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('city_not_found');
    });
  });
});
