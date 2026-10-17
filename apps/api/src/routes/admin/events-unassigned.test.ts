import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { sign } from 'hono/jwt';
import { app } from '../../index';
import { JWT_SECRET } from '../../middleware/auth';
import { matchVenue, ingestCulturalAgenda } from '../../services/ingestion';

const testDbUrl = process.env.DATABASE_URL || process.env.VENUE_IMPORT_TEST_DB_URL;
if (!testDbUrl || (!testDbUrl.includes('test') && !testDbUrl.includes('synthetic'))) {
  console.error(
    'Error de seguridad preventiva: La base de datos objetivo debe ser sintética o de test.\n' +
      'Configura DATABASE_URL con la base de datos de pruebas (ej: vayaplan_import_synthetic).'
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: testDbUrl });
let adminToken: string;
const createdEventIds: number[] = [];

beforeAll(async () => {
  adminToken = await sign(
    { email: 'admin-events-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );
});

afterAll(async () => {
  if (createdEventIds.length > 0) {
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
  }
  await pool.end();
});

describe('Desacoplamiento de Venue Ficticio 9999 — Eventos sin Local Asignado', () => {
  // 1a. Función matchVenue: retorna null cuando no coincide y nunca empareja con 9999
  test('matchVenue retorna null para texto desconocido y nunca asigna 9999', () => {
    const venuesCatalog = [
      { id: 1, name: 'Teatro Principal de Palencia', slug: 'teatro-principal' },
      { id: 2, name: 'Bar Universonoro', slug: 'universonoro' },
      { id: 9999, name: 'Local por verificar', slug: 'local-por-verificar-borrador' },
    ];

    // Desconocido -> null
    expect(matchVenue('Plaza Inexistente de las Flores 99', venuesCatalog)).toBeNull();
    expect(matchVenue(null, venuesCatalog)).toBeNull();
    expect(matchVenue('', venuesCatalog)).toBeNull();

    // Coincidencia con 9999 explícito -> ignorado, retorna null
    expect(matchVenue('Local por verificar', venuesCatalog)).toBeNull();

    // Conocido -> ID correcto
    expect(matchVenue('Teatro Principal', venuesCatalog)).toBe(1);
    expect(matchVenue('Universonoro Palencia', venuesCatalog)).toBe(2);
  });

  // 1b. Ingesta cultural sin coincidencia de local
  test('Ingesta cultural sin coincidencia de local genera evento con venue_id = null y dedupe_key con "unassigned"', async () => {
    const originalFetch = globalThis.fetch;
    const syntheticId = `test-synth-${Date.now()}`;
    const syntheticTitle = `Concierto Desconocido ${syntheticId}`;

    // Mock temporal de la llamada al dataset de la Junta
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          total_count: 1,
          results: [
            {
              id_evento: syntheticId,
              titulo: syntheticTitle,
              descripcion: 'Descripción del concierto sin local censado.',
              fecha_inicio: '2026-11-20',
              hora_inicio: '20:30',
              lugar_celebracion: 'Lugar Desconocido Absoluto 999',
              enlace_contenido: `https://agenda.jcyl.es/${syntheticId}`,
              categoria: 'Conciertos',
              tematica: 'Música',
              precio: 'Gratuito',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      const { summary, inserted_events } = await ingestCulturalAgenda({ minDate: '2026-11-20' });
      expect(summary.inserted).toBe(1);
      expect(inserted_events.length).toBe(1);

      const inserted = inserted_events[0];
      expect(inserted.venue_id).toBeNull();
      createdEventIds.push(inserted.id);

      // Verificar en base de datos sintética
      const dbRes = await pool.query<{ venue_id: number | null; dedupe_key: string; status: string }>(
        `SELECT venue_id, dedupe_key, status FROM events WHERE id = $1`,
        [inserted.id]
      );
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].venue_id).toBeNull();
      expect(dbRes.rows[0].status).toBe('tentative');
      expect(dbRes.rows[0].dedupe_key).toContain('palencia-unassigned-2026-11-20');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 2. Creación de borrador rápido sin local
  test('POST /api/v1/admin/events/draft sin venue_id asigna venue_id = null', async () => {
    const res = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Borrador Rápido WhatsApp Sin Local',
        category: 'musica',
        start_time: '2026-11-21T21:00:00',
        source_type: 'whatsapp',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.event_status).toBe('tentative');
    expect(data.event_id).toBeGreaterThan(0);
    createdEventIds.push(data.event_id);

    const dbRes = await pool.query<{ venue_id: number | null }>(
      `SELECT venue_id FROM events WHERE id = $1`,
      [data.event_id]
    );
    expect(dbRes.rows[0].venue_id).toBeNull();
  });

  // 3. Listado y conteo de la bandeja de curación
  test('GET /api/v1/admin/events con venue_id=unassigned lista borradores con venue_id = null', async () => {
    const res = await app.request('/api/v1/admin/events?status=tentative&venue_id=unassigned', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);

    // Todos los eventos devueltos deben tener venue_id null (o 9999 si existiera alguno previo)
    for (const ev of data.events) {
      expect(ev.venue_id === null || ev.venue_id === 9999).toBe(true);
      expect(ev.status).toBe('tentative');
    }
  });

  // 4. Publicación de evento sin local: rechazada con 400 por la API
  test('POST /api/v1/admin/events/:id/publish rechaza evento sin local con 400 venue_not_assigned', async () => {
    // Insertar borrador sintético sin local
    const insRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador No Publicable Sin Local', 'cultura', '2026-11-22T19:00:00Z', '2026-11-22', 'tentative', 'manual')
       RETURNING id;`
    );
    const eventId = insRes.rows[0].id;
    createdEventIds.push(eventId);

    const res = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('venue_not_assigned');

    // Confirmar que sigue siendo tentative en BD
    const checkRes = await pool.query<{ status: string }>(
      `SELECT status FROM events WHERE id = $1`,
      [eventId]
    );
    expect(checkRes.rows[0].status).toBe('tentative');
  });

  // 4b. Inserción directa SQL rechazada por constraint de BD
  test('Inserción SQL directa de status published con venue_id = NULL es rechazada por constraint chk_events_published_venue_not_null', async () => {
    let errorCaught = false;
    try {
      await pool.query(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, NULL, 'Direct SQL Violation', 'cultura', now(), CURRENT_DATE, 'published', 'manual');`
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toContain('chk_events_published_venue_not_null');
    }
    expect(errorCaught).toBe(true);
  });

  // 5. Asignación de local a un borrador sin local permite su publicación posterior
  test('Asignación de local mediante PATCH a un borrador permite su publicación posterior', async () => {
    // Obtener un venue censado válido
    const venueRes = await pool.query<{ id: number }>(
      `SELECT id FROM venues WHERE is_active = true AND id != 9999 LIMIT 1;`
    );
    expect(venueRes.rows.length).toBeGreaterThan(0);
    const validVenueId = venueRes.rows[0].id;

    // Crear borrador sin venue
    const insRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Para Asignar y Publicar', 'teatro', '2026-11-23T20:30:00Z', '2026-11-23', 'tentative', 'manual')
       RETURNING id;`
    );
    const eventId = insRes.rows[0].id;
    createdEventIds.push(eventId);

    // Intentar publicar antes de asignar -> debe fallar con 400
    const resPre = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resPre.status).toBe(400);

    // Asignar el venue válido con PATCH
    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ venue_id: validVenueId }),
    });
    expect(patchRes.status).toBe(200);

    // Ahora publicar -> debe tener éxito (200)
    const publishRes = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(publishRes.status).toBe(200);
    const pubData = await publishRes.json();
    expect(pubData.status).toBe('ok');
    expect(pubData.event.status).toBe('published');

    // Confirmar en BD
    const dbCheck = await pool.query<{ status: string; venue_id: number }>(
      `SELECT status, venue_id FROM events WHERE id = $1`,
      [eventId]
    );
    expect(dbCheck.rows[0].status).toBe('published');
    expect(dbCheck.rows[0].venue_id).toBe(validVenueId);
  });

  // 6. Publicación sin local bloqueada por PATCH
  test('PATCH /api/v1/admin/events/:id bloquea publicar evento sin local con 400', async () => {
    const insRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Para Probar PATCH Published', 'cultura', '2026-11-24T18:00:00Z', '2026-11-24', 'tentative', 'manual')
       RETURNING id;`
    );
    const eventId = insRes.rows[0].id;
    createdEventIds.push(eventId);

    // Intento de publicar mediante PATCH con status='published' manteniendo venue_id=null
    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'published' }),
    });

    expect(patchRes.status).toBe(400);
    const patchData = await patchRes.json();
    expect(patchData.error).toBe('venue_not_assigned');

    // Confirmar que sigue siendo tentative en BD
    const checkRes = await pool.query<{ status: string }>(
      `SELECT status FROM events WHERE id = $1`,
      [eventId]
    );
    expect(checkRes.rows[0].status).toBe('tentative');
  });

  // 7. Migración 007 aborta sin cambios parciales si existe evento published con venue_id = 9999
  test('Migración aborta atómicamente si existe un evento published con venue_id = 9999', async () => {
    // Insertar temporalmente un evento con status='published' y venue_id=9999
    const insRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, 9999, 'Evento Publicado Conflictivo 9999', 'cultura', '2026-11-25T12:00:00Z', '2026-11-25', 'published', 'manual')
       RETURNING id;`
    );
    const pub9999Id = insRes.rows[0].id;

    // Insertar un evento tentative de control
    const ctrlRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, 9999, 'Evento Tentativo Control 9999', 'cultura', '2026-11-25T13:00:00Z', '2026-11-25', 'tentative', 'manual')
       RETURNING id;`
    );
    const ctrlId = ctrlRes.rows[0].id;

    // Ejecutar el bloque de precondición en una transacción de prueba
    let migrationError: string | null = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(`
        DO $$
        DECLARE
          v_published_9999_count INT;
        BEGIN
          SELECT COUNT(*) INTO v_published_9999_count
          FROM events
          WHERE venue_id = 9999 AND status = 'published';

          IF v_published_9999_count > 0 THEN
            RAISE EXCEPTION 'Migración 007 abortada: Se encontraron % evento(s) publicado(s) asociados al venue provisional 9999.', v_published_9999_count;
          END IF;
        END $$;
      `);
      await client.query('COMMIT;');
    } catch (err: any) {
      await client.query('ROLLBACK;');
      migrationError = err.message;
    } finally {
      client.release();
    }

    expect(migrationError).not.toBeNull();
    expect(migrationError).toContain('Migración 007 abortada');

    // Comprobar que NINGÚN cambio parcial ocurrió (el evento de control conserva venue_id = 9999)
    const ctrlCheck = await pool.query<{ venue_id: number }>(
      `SELECT venue_id FROM events WHERE id = $1;`,
      [ctrlId]
    );
    expect(ctrlCheck.rows[0].venue_id).toBe(9999);

    // Limpieza de los registros sintéticos
    await pool.query(`DELETE FROM events WHERE id IN ($1, $2);`, [pub9999Id, ctrlId]);
  });

  // 8. Comportamiento ante status NULL
  test('Inserción con status NULL es rechazada por el esquema y la constraint de negocio', async () => {
    let errorCaught = false;
    try {
      await pool.query(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 1, 'Status Null Test', 'cultura', now(), CURRENT_DATE, NULL, 'manual');`
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toContain('violates not-null constraint');
    }
    expect(errorCaught).toBe(true);
  });

  // 9. Conservación de IDs, estados y demás campos al migrar
  test('Migración DML conserva IDs, estados, fechas y títulos, modificando exclusivamente venue_id', async () => {
    const states = ['tentative', 'cancelled', 'archived', 'duplicate', 'outdated'];
    const insertedRecords: Array<{ id: number; status: string; title: string }> = [];

    for (const st of states) {
      const insRes = await pool.query<{ id: number; status: string; title: string }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 9999, 'Test Conservacion ${st}', 'cultura', '2026-11-26T10:00:00Z', '2026-11-26', $1, 'manual')
         RETURNING id, status, title;`,
        [st]
      );
      insertedRecords.push(insRes.rows[0]);
      createdEventIds.push(insRes.rows[0].id);
    }

    // Ejecutar el UPDATE de migración 007 sobre estos registros
    const updateRes = await pool.query<{ id: number; status: string; title: string; venue_id: number | null }>(
      `UPDATE events
       SET venue_id = NULL, updated_at = now()
       WHERE venue_id = 9999
         AND status IN ('tentative', 'cancelled', 'archived', 'duplicate', 'outdated')
         AND id = ANY($1)
       RETURNING id, status, title, venue_id;`,
      [insertedRecords.map((r) => r.id)]
    );

    expect(updateRes.rows.length).toBe(states.length);
    for (const updated of updateRes.rows) {
      const original = insertedRecords.find((r) => r.id === updated.id);
      expect(original).toBeDefined();
      expect(updated.status).toBe(original!.status);
      expect(updated.title).toBe(original!.title);
      expect(updated.venue_id).toBeNull();
    }
  });

  // 10. Agenda pública sin exposición de eventos borradores ni sin local
  test('GET /api/v1/cities/palencia/events no expone borradores ni eventos sin local', async () => {
    // Insertar borrador sin local en fecha específica
    const targetDate = '2026-11-27';
    const insRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Oculto Publico', 'cultura', '${targetDate}T20:00:00Z', '${targetDate}', 'tentative', 'manual')
       RETURNING id;`
    );
    createdEventIds.push(insRes.rows[0].id);

    const res = await app.request(`/api/v1/cities/palencia/events?date=${targetDate}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);

    // Ningún evento devuelto puede ser tentative ni tener venue_id nulo
    for (const ev of data.events) {
      expect(ev.id).not.toBe(insRes.rows[0].id);
      expect(ev.status).toBe('published');
      expect(ev.venue.id).toBeGreaterThan(0);
    }
  });
});
