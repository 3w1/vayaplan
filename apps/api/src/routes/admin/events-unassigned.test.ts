import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ==============================================================================
// 1. AISLAMIENTO ESTRICTO Y VERIFICACIÓN PREVIA DE CONEXIÓN
// ==============================================================================

// Exigir variable de conexión de pruebas explícita (prohibido fallback a DATABASE_URL)
const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.EVENTS_UNASSIGNED_TEST_DB_URL ||
  process.env.VENUE_IMPORT_TEST_DB_URL;

if (!rawTestDbUrl || rawTestDbUrl.trim().length === 0) {
  console.error(
    'Error de configuración: Se requiere una variable de conexión de pruebas explícita ' +
      '(TEST_DATABASE_URL, EVENTS_UNASSIGNED_TEST_DB_URL o VENUE_IMPORT_TEST_DB_URL).\n' +
      'No se permite el uso implícito de DATABASE_URL.'
  );
  process.exit(1);
}

// Parsear la URL y aplicar la salvaguarda de seguridad al nombre de la base de datos (pathname)
let parsedUrl: URL;
try {
  parsedUrl = new URL(rawTestDbUrl.trim());
} catch {
  console.error('Error de configuración: La URL de conexión de pruebas tiene un formato inválido.');
  process.exit(1);
}

const dbName = parsedUrl.pathname.replace(/^\//, '');
if (!dbName.includes('test') && !dbName.includes('synthetic')) {
  console.error(
    `Error de seguridad preventiva: La base de datos objetivo ('${dbName}') debe contener 'test' o 'synthetic'. ` +
      'Ejecución abortada para proteger entornos no sintéticos.'
  );
  process.exit(1);
}

// Configurar el entorno ANTES de importar módulos que puedan inicializar conexiones
process.env.DATABASE_URL = rawTestDbUrl.trim();

// Importar dinámicamente módulos de aplicación una vez fijado el entorno
const { app } = await import('../../index');
const { JWT_SECRET } = await import('../../middleware/auth');
const { sign } = await import('hono/jwt');
const { matchVenue, ingestCulturalAgenda } = await import('../../services/ingestion');
const { getDbPool } = await import('@vayaplan/db');

// Garantizar que aplicación y pool de aserciones usan exactamente la misma BD sintética
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });
const appPool = getDbPool();

const testClient = await testPool.connect();
const testDbCurrent = (await testClient.query('SELECT current_database()')).rows[0].current_database;
testClient.release();

const appClient = await appPool.connect();
const appDbCurrent = (await appClient.query('SELECT current_database()')).rows[0].current_database;
appClient.release();

if (testDbCurrent !== appDbCurrent || testDbCurrent !== dbName) {
  console.error(
    `Error de aislamiento: El pool de aserciones ('${testDbCurrent}') y el de la aplicación ('${appDbCurrent}') ` +
      `no coinciden con la base de datos sintética esperada ('${dbName}').`
  );
  await testPool.end();
  process.exit(1);
}

// Rutas absolutas a los archivos SQL reales
const ddlFilePath = resolve(__dirname, '../../../../../infra/migrations/007_events_nullable_venue.sql');
const dmlFilePath = resolve(__dirname, '../../../../../infra/scripts/transition_9999_to_null.sql');

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
    await testPool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
  }

  // Garantizar que el fixture 9999 existe en la base de datos sintética para otras suites
  await testPool.query(`
    INSERT INTO venues (id, city_id, name, slug, address, is_active, zone, category, created_at, updated_at)
    VALUES (9999, 1, 'Local por verificar (Borrador WhatsApp)', 'local-por-verificar-borrador', 'Dirección provisional por confirmar', true, 'otros', 'general', now(), now())
    ON CONFLICT (id) DO NOTHING;
  `);

  await testPool.end();
});

// ==============================================================================
// 2. PRUEBAS DE SCRIPTS REALES (DDL Y DML)
// ==============================================================================

describe('1. Ejecución de Scripts Reales (DDL 007 y DML de Transición)', () => {
  test('Script DDL 007 real expande el esquema y añade constraint de publicación', async () => {
    const ddlContent = readFileSync(ddlFilePath, 'utf-8');
    expect(ddlContent.length).toBeGreaterThan(0);

    // Ejecutar el archivo SQL real
    await testPool.query(ddlContent);

    // Comprobar que events.venue_id es nullable en information_schema
    const colRes = await testPool.query<{ is_nullable: string }>(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'venue_id';`
    );
    expect(colRes.rows.length).toBe(1);
    expect(colRes.rows[0].is_nullable).toBe('YES');

    // Comprobar que existe la constraint chk_events_published_venue_not_null
    const conRes = await testPool.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conname = 'chk_events_published_venue_not_null';`
    );
    expect(conRes.rows.length).toBe(1);
  });

  test('Script DDL 007 real aborta atómicamente si existe un evento published con venue_id = 9999', async () => {
    const ddlContent = readFileSync(ddlFilePath, 'utf-8');
    let pubId: number | null = null;
    let ctrlId: number | null = null;

    try {
      // Insertar temporalmente evento publicado conflictivo y evento tentativo de control
      const insPub = await testPool.query<{ id: number }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 9999, 'Test Conflict Published 9999', 'cultura', '2026-11-25T12:00:00Z', '2026-11-25', 'published', 'manual')
         RETURNING id;`
      );
      pubId = insPub.rows[0].id;

      const insCtrl = await testPool.query<{ id: number }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 9999, 'Test Control Tentative 9999', 'cultura', '2026-11-25T13:00:00Z', '2026-11-25', 'tentative', 'manual')
         RETURNING id;`
      );
      ctrlId = insCtrl.rows[0].id;

      // Ejecutar el script DDL real en una transacción
      let errorCaught = false;
      try {
        await testPool.query(ddlContent);
      } catch (err: any) {
        errorCaught = true;
        expect(err.message).toContain('Migración 007 abortada');
      }
      expect(errorCaught).toBe(true);

      // Comprobar que no hubo cambios parciales: el control conserva venue_id = 9999
      const ctrlCheck = await testPool.query<{ venue_id: number }>(
        `SELECT venue_id FROM events WHERE id = $1;`,
        [ctrlId]
      );
      expect(ctrlCheck.rows[0].venue_id).toBe(9999);
    } finally {
      // Limpieza garantizada incluso ante fallo de aserción
      const idsToDelete = [pubId, ctrlId].filter((id): id is number => id !== null);
      if (idsToDelete.length > 0) {
        await testPool.query(`DELETE FROM events WHERE id = ANY($1);`, [idsToDelete]);
      }
    }
  });

  test('Script DML de transición real transiciona solo venue_id preservando created_at y updated_at', async () => {
    const dmlContent = readFileSync(dmlFilePath, 'utf-8');
    expect(dmlContent.length).toBeGreaterThan(0);

    const states = ['tentative', 'cancelled', 'archived', 'duplicate', 'outdated'];
    const insertedEvents: Array<{
      id: number;
      status: string;
      title: string;
      created_at: string;
      updated_at: string;
    }> = [];

    try {
      // Insertar eventos con fechas históricas fijas conocidas
      for (const st of states) {
        const insRes = await testPool.query<{
          id: number;
          status: string;
          title: string;
          created_at: string;
          updated_at: string;
        }>(
          `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type, created_at, updated_at)
           VALUES (1, 9999, 'Transicion Test ${st}', 'cultura', '2026-11-26T10:00:00Z', '2026-11-26', $1, 'manual', '2026-01-10 10:00:00+00', '2026-01-11 12:00:00+00')
           RETURNING id, status, title, created_at, updated_at;`,
          [st]
        );
        insertedEvents.push(insRes.rows[0]);
      }

      // Verificar estado inicial del trigger antes de ejecutar DML
      const preTrg = await testPool.query<{ tgenabled: string }>(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;`
      );
      expect(preTrg.rows[0].tgenabled).toBe('O');

      // Ejecutar el script DML real
      await testPool.query(dmlContent);

      // Verificar que tras el script DML el trigger permanece habilitado ('O')
      const postTrg = await testPool.query<{ tgenabled: string }>(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;`
      );
      expect(postTrg.rows[0].tgenabled).toBe('O');

      // Comprobar cada registro: venue_id pasó a NULL pero created_at y updated_at están intactos
      for (const original of insertedEvents) {
        const checkRes = await testPool.query<{
          venue_id: number | null;
          status: string;
          title: string;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT venue_id, status, title, created_at, updated_at
           FROM events
           WHERE id = $1;`,
          [original.id]
        );

        const current = checkRes.rows[0];
        expect(current.venue_id).toBeNull();
        expect(current.status).toBe(original.status);
        expect(current.title).toBe(original.title);
        expect(new Date(current.created_at).toISOString()).toBe(new Date(original.created_at).toISOString());
        expect(new Date(current.updated_at).toISOString()).toBe(new Date(original.updated_at).toISOString());
      }
    } finally {
      const ids = insertedEvents.map((e) => e.id);
      if (ids.length > 0) {
        await testPool.query(`DELETE FROM events WHERE id = ANY($1);`, [ids]);
      }
    }
  });

  test('Verificación de atomicidad del trigger: fallo forzado tras DISABLE revierte datos y restaura trigger', async () => {
    let testEventId: number | null = null;
    try {
      const insRes = await testPool.query<{ id: number; created_at: string; updated_at: string }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type, created_at, updated_at)
         VALUES (1, 9999, 'Test Trigger Rollback', 'cultura', '2026-11-26T10:00:00Z', '2026-11-26', 'tentative', 'manual', '2026-01-10 10:00:00+00', '2026-01-10 10:00:00+00')
         RETURNING id, created_at, updated_at;`
      );
      testEventId = insRes.rows[0].id;
      const initialUpdatedAt = insRes.rows[0].updated_at;

      // Forzar transacción que desactiva el trigger y luego aborta con fallo
      await expect(
        (async () => {
          const client = await testPool.connect();
          try {
            await client.query('BEGIN');
            await client.query('ALTER TABLE events DISABLE TRIGGER trg_events_updated_at');

            // Verificar que dentro de la transacción tgenabled es 'D'
            const innerTrg = await client.query<{ tgenabled: string }>(
              `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;`
            );
            expect(innerTrg.rows[0].tgenabled).toBe('D');

            // Modificar el registro
            await client.query('UPDATE events SET venue_id = NULL WHERE id = $1', [testEventId]);

            // Provocar fallo intencionado para forzar rollback
            await client.query(`SELECT 1 / 0;`);
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        })()
      ).rejects.toThrow();

      // Verificar que fuera de la transacción fallida, el trigger sigue habilitado ('O')
      const outerTrg = await testPool.query<{ tgenabled: string }>(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;`
      );
      expect(outerTrg.rows[0].tgenabled).toBe('O');

      // Verificar que los datos no cambiaron (rollback efectivo)
      const evCheck = await testPool.query<{ venue_id: number; updated_at: string }>(
        `SELECT venue_id, updated_at FROM events WHERE id = $1`,
        [testEventId]
      );
      expect(evCheck.rows[0].venue_id).toBe(9999);
      expect(new Date(evCheck.rows[0].updated_at).toISOString()).toBe(new Date(initialUpdatedAt).toISOString());
    } finally {
      if (testEventId) {
        await testPool.query(`DELETE FROM events WHERE id = $1;`, [testEventId]);
      }
    }
  });

  test('Actualización normal posterior sigue ejecutando el trigger trg_events_updated_at', async () => {
    let testEventId: number | null = null;
    try {
      const insRes = await testPool.query<{ id: number; updated_at: string }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type, created_at, updated_at)
         VALUES (1, 9999, 'Test Trigger Normal Execution', 'cultura', '2026-11-26T10:00:00Z', '2026-11-26', 'tentative', 'manual', '2026-01-10 10:00:00+00', '2026-01-10 10:00:00+00')
         RETURNING id, updated_at;`
      );
      testEventId = insRes.rows[0].id;
      const originalUpdatedAt = new Date(insRes.rows[0].updated_at).getTime();

      // Esperar breve instante para garantizar avance de now()
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Actualización normal sin manipular triggers
      const updRes = await testPool.query<{ updated_at: string }>(
        `UPDATE events SET title = 'Titulo Modificado' WHERE id = $1 RETURNING updated_at;`,
        [testEventId]
      );

      const newUpdatedAt = new Date(updRes.rows[0].updated_at).getTime();
      expect(newUpdatedAt).toBeGreaterThan(originalUpdatedAt);
    } finally {
      if (testEventId) {
        await testPool.query(`DELETE FROM events WHERE id = $1;`, [testEventId]);
      }
    }
  });

  test('Comprobación de DELETE /venues/9999 con y sin dependencias', async () => {
    let tempEventId: number | null = null;
    try {
      // 1. Asignar dependencia temporal a 9999
      const insRes = await testPool.query<{ id: number }>(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 9999, 'Dependencia Temporal para 9999', 'cultura', now(), CURRENT_DATE, 'tentative', 'manual')
         RETURNING id;`
      );
      tempEventId = insRes.rows[0].id;

      // 2. Con dependencia activa: DELETE debe responder 409 Conflict
      const resBlocked = await app.request('/api/v1/admin/venues/9999', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resBlocked.status).toBe(409);
      const blockedData = await resBlocked.json();
      expect(blockedData.error).toBe('venue_has_dependencies');
      expect(blockedData.dependencies.length).toBeGreaterThan(0);

      // 3. Retirar la dependencia temporal
      await testPool.query(`DELETE FROM events WHERE id = $1;`, [tempEventId]);
      tempEventId = null;

      // 4. Sin dependencias: DELETE /venues/9999 debe autorizarse y ejecutarse (200 OK)
      const resDel = await app.request('/api/v1/admin/venues/9999', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(resDel.status).toBe(200);
      const delData = await resDel.json();
      expect(delData.status).toBe('ok');
      expect(delData.deleted_venue.id).toBe(9999);

      // Confirmar eliminación en base de datos
      const checkVenue = await testPool.query(`SELECT id FROM venues WHERE id = 9999;`);
      expect(checkVenue.rows.length).toBe(0);
    } finally {
      if (tempEventId) {
        await testPool.query(`DELETE FROM events WHERE id = $1;`, [tempEventId]);
      }
      // Restaurar el fixture 9999 en el entorno sintético para las demás suites
      await testPool.query(`
        INSERT INTO venues (id, city_id, name, slug, address, is_active, zone, category, created_at, updated_at)
        VALUES (9999, 1, 'Local por verificar (Borrador WhatsApp)', 'local-por-verificar-borrador', 'Dirección provisional por confirmar', true, 'otros', 'general', now(), now())
        ON CONFLICT (id) DO NOTHING;
      `);
    }
  });
});

// ==============================================================================
// 3. PRUEBAS DE FLUJO DE NEGOCIO Y ENDPOINTS
// ==============================================================================

describe('2. Flujo de Eventos sin Local Asignado (Ingesta, Curación y Publicación)', () => {
  test('matchVenue retorna null para texto desconocido y nunca asigna 9999', () => {
    const venuesCatalog = [
      { id: 1, name: 'Teatro Principal de Palencia', slug: 'teatro-principal' },
      { id: 2, name: 'Bar Universonoro', slug: 'universonoro' },
      { id: 9999, name: 'Local por verificar', slug: 'local-por-verificar-borrador' },
    ];

    expect(matchVenue('Plaza Inexistente de las Flores 99', venuesCatalog)).toBeNull();
    expect(matchVenue(null, venuesCatalog)).toBeNull();
    expect(matchVenue('', venuesCatalog)).toBeNull();
    expect(matchVenue('Local por verificar', venuesCatalog)).toBeNull();
    expect(matchVenue('Teatro Principal', venuesCatalog)).toBe(1);
  });

  test('Ingesta cultural sin coincidencia genera evento con venue_id = null y dedupe_key coherente', async () => {
    const originalFetch = globalThis.fetch;
    const syntheticId = `test-synth-${Date.now()}`;
    const syntheticTitle = `Concierto Desconocido ${syntheticId}`;

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

      const dbRes = await testPool.query<{ venue_id: number | null; dedupe_key: string; status: string }>(
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

    const dbRes = await testPool.query<{ venue_id: number | null }>(
      `SELECT venue_id FROM events WHERE id = $1`,
      [data.event_id]
    );
    expect(dbRes.rows[0].venue_id).toBeNull();
  });

  test('GET /api/v1/admin/events con venue_id=unassigned lista borradores con venue_id = null', async () => {
    const res = await app.request('/api/v1/admin/events?status=tentative&venue_id=unassigned', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);

    for (const ev of data.events) {
      expect(ev.venue_id === null || ev.venue_id === 9999).toBe(true);
      expect(ev.status).toBe('tentative');
    }
  });

  test('POST /api/v1/admin/events/:id/publish rechaza evento sin local con 400 venue_not_assigned', async () => {
    const insRes = await testPool.query<{ id: number }>(
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

    const checkRes = await testPool.query<{ status: string }>(
      `SELECT status FROM events WHERE id = $1`,
      [eventId]
    );
    expect(checkRes.rows[0].status).toBe('tentative');
  });

  test('PATCH /api/v1/admin/events/:id bloquea publicar evento sin local con 400', async () => {
    const insRes = await testPool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Para Probar PATCH Published', 'cultura', '2026-11-24T18:00:00Z', '2026-11-24', 'tentative', 'manual')
       RETURNING id;`
    );
    const eventId = insRes.rows[0].id;
    createdEventIds.push(eventId);

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
  });

  test('Inserción SQL directa de status published con venue_id = NULL es rechazada por constraint', async () => {
    let errorCaught = false;
    try {
      await testPool.query(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, NULL, 'Direct SQL Violation', 'cultura', now(), CURRENT_DATE, 'published', 'manual');`
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toContain('chk_events_published_venue_not_null');
    }
    expect(errorCaught).toBe(true);
  });

  test('Inserción con status NULL es rechazada por el esquema y la constraint', async () => {
    let errorCaught = false;
    try {
      await testPool.query(
        `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
         VALUES (1, 1, 'Status Null Test', 'cultura', now(), CURRENT_DATE, NULL, 'manual');`
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toContain('violates not-null constraint');
    }
    expect(errorCaught).toBe(true);
  });

  test('Asignación de local mediante PATCH a un borrador permite su publicación posterior', async () => {
    const venueRes = await testPool.query<{ id: number }>(
      `SELECT id FROM venues WHERE is_active = true AND id != 9999 LIMIT 1;`
    );
    expect(venueRes.rows.length).toBeGreaterThan(0);
    const validVenueId = venueRes.rows[0].id;

    const insRes = await testPool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Para Asignar y Publicar', 'teatro', '2026-11-23T20:30:00Z', '2026-11-23', 'tentative', 'manual')
       RETURNING id;`
    );
    const eventId = insRes.rows[0].id;
    createdEventIds.push(eventId);

    const resPre = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resPre.status).toBe(400);

    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ venue_id: validVenueId }),
    });
    expect(patchRes.status).toBe(200);

    const publishRes = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(publishRes.status).toBe(200);
    const pubData = await publishRes.json();
    expect(pubData.status).toBe('ok');
    expect(pubData.event.status).toBe('published');

    const dbCheck = await testPool.query<{ status: string; venue_id: number }>(
      `SELECT status, venue_id FROM events WHERE id = $1`,
      [eventId]
    );
    expect(dbCheck.rows[0].status).toBe('published');
    expect(dbCheck.rows[0].venue_id).toBe(validVenueId);
  });

  test('GET /api/v1/cities/palencia/events no expone borradores ni eventos sin local', async () => {
    const targetDate = '2026-11-27';
    const insRes = await testPool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, NULL, 'Borrador Oculto Publico', 'cultura', '${targetDate}T20:00:00Z', '${targetDate}', 'tentative', 'manual')
       RETURNING id;`
    );
    createdEventIds.push(insRes.rows[0].id);

    const res = await app.request(`/api/v1/cities/palencia/events?date=${targetDate}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);

    for (const ev of data.events) {
      expect(ev.id).not.toBe(insRes.rows[0].id);
      expect(ev.status).toBe('published');
      expect(ev.venue.id).toBeGreaterThan(0);
    }
  });
});
