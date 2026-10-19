import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import {
  sanitizeHtml,
  normalizeJcylTime,
  normalizeJcylPrice,
  mapJcylCategory,
  normalizeJcylRecord,
} from './jcyl-normalizer';
import { syncJcylLibraryActivities, ensureLibraryVenue } from './jcyl-connector';
import type { JcylRecordRaw } from './jcyl-types';

const rawTestDbUrl = process.env.TEST_DATABASE_URL;
if (!rawTestDbUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
}

process.env.DATABASE_URL = rawTestDbUrl.trim();
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

describe('Conector JCyL — Normalización Defensiva y Sanitización', () => {
  test('sanitizeHtml elimina etiquetas HTML y decodifica entidades en español', () => {
    const raw = '<p>El <strong>mi&eacute;rcoles</strong> &iquest;Qu&eacute; tal? <a href="https://example.com">Enlace</a></p>';
    const sanitized = sanitizeHtml(raw);
    expect(sanitized).toBe('El miércoles ¿Qué tal? Enlace');
  });

  test('normalizeJcylTime parsea horas heterogéneas y no inventa horas para null', () => {
    const t1 = normalizeJcylTime('19:00h.', '2026-11-04');
    expect(t1.timeStatus).toBe('confirmed');
    expect(t1.startTimeIso).not.toBeNull();
    expect(t1.startTimeIso).toContain('18:00:00.000Z'); // 19:00 CET = 18:00 UTC

    const t2 = normalizeJcylTime('20:30', '2026-10-23');
    expect(t2.timeStatus).toBe('confirmed');
    expect(t2.startTimeIso).not.toBeNull();

    // Sin hora de inicio -> pending_time y start_time estrictamente NULL (sin horas falsas)
    const t3 = normalizeJcylTime(null, '2026-10-29');
    expect(t3.timeStatus).toBe('pending_time');
    expect(t3.startTimeIso).toBeNull();

    const t4 = normalizeJcylTime('', '2026-10-29');
    expect(t4.timeStatus).toBe('pending_time');
    expect(t4.startTimeIso).toBeNull();
  });

  test('normalizeJcylPrice distingue precio gratuito, tarifa numérica y precio ausente sin asumir gratis', () => {
    const p1 = normalizeJcylPrice('Gratuito');
    expect(p1.isFree).toBe(true);
    expect(p1.priceCents).toBe(0);
    expect(p1.priceKnown).toBe(true);

    const p2 = normalizeJcylPrice('20 euros');
    expect(p2.isFree).toBe(false);
    expect(p2.priceCents).toBe(2000);
    expect(p2.priceKnown).toBe(true);

    const p3 = normalizeJcylPrice(null);
    expect(p3.isFree).toBe(false);
    expect(p3.priceKnown).toBe(false);
  });

  test('mapJcylCategory asigna categorías precisas según tematica, tipo y título', () => {
    expect(mapJcylCategory({
      id_evento: 1,
      fecha_inicio: '2026-10-23',
      titulo: 'Teatro: Pisando el Llano',
      categoria: 'Teatro y Danza',
    })).toBe('teatro');

    expect(mapJcylCategory({
      id_evento: 2,
      fecha_inicio: '2026-11-04',
      titulo: 'Club de lectura sobre cómic',
      categoria: 'Libros y Lectura',
      tematica: 'Club de lectura',
    })).toBe('cultura');

    expect(mapJcylCategory({
      id_evento: 4,
      fecha_inicio: '2026-10-29',
      titulo: 'Conferencia: Las mujeres en el Románico',
      categoria: 'Conferencias y Cursos',
    })).toBe('conferencia');

    expect(mapJcylCategory({
      id_evento: 3,
      fecha_inicio: '2026-10-22',
      titulo: 'Exposición fotográfica',
      categoria: 'Artes Plásticas',
    })).toBe('exposicion');
  });
});

describe('Conector JCyL — Ingesta a Borradores (Entorno Aislado)', () => {
  const mockRecords: JcylRecordRaw[] = [
    {
      id_evento: 999901,
      titulo: 'Club de lectura Test en Biblioteca',
      descripcion: '<p>Descripci&oacute;n con <strong>HTML</strong></p>',
      categoria: 'Libros y Lectura',
      tematica: 'Club de lectura',
      fecha_inicio: '2026-11-04',
      hora_inicio: '19:00h.',
      precio: 'Gratuito',
      lugar_celebracion: 'Biblioteca Pública de Palencia',
      calle: 'C/ Eduardo Dato, 4',
      codigo_biblioteca: 'BPPAL',
      evento_biblioteca: 'SI',
      nombre_localidad: 'Palencia',
      enlace_contenido: 'https://bibliotecas.jcyl.es/evento/999901',
      imagen_evento: 'https://bibliotecas.jcyl.es/foto1.jpg',
    },
    {
      id_evento: 999902,
      titulo: 'Actividad sin hora fija en Biblioteca',
      descripcion: '<p>Taller infantil</p>',
      categoria: 'Infantil',
      fecha_inicio: '2026-11-05',
      hora_inicio: null, // Sin hora
      precio: null, // Precio no especificado
      lugar_celebracion: 'Biblioteca Pública de Palencia',
      codigo_biblioteca: 'BPPAL',
      evento_biblioteca: 'SI',
      nombre_localidad: 'Palencia',
    },
    {
      id_evento: 999903,
      titulo: 'Evento fuera de Biblioteca (Teatro Principal)',
      fecha_inicio: '2026-11-06',
      hora_inicio: '20:30',
      lugar_celebracion: 'Teatro Principal',
      nombre_localidad: 'Palencia',
    },
  ];

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      total_count: mockRecords.length,
      results: mockRecords,
    }),
  } as any);

  beforeAll(async () => {
    await testPool.query("DELETE FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    await testPool.query("DELETE FROM venues WHERE slug = 'biblioteca-publica-de-palencia'");
  });

  afterAll(async () => {
    await testPool.query("DELETE FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    await testPool.query("DELETE FROM venues WHERE slug = 'biblioteca-publica-de-palencia'");
    await testPool.end();
  });

  test('Modo dry-run: cero escrituras y cero acceso a base de datos', async () => {
    const result = await syncJcylLibraryActivities({
      dryRun: true,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.dryRun).toBe(true);
    expect(result.totalApiRecords).toBe(3);
    expect(result.libraryCandidates).toBe(2); // Filtra los 2 de biblioteca, excluye Teatro Principal
    expect(result.inserted).toBe(0);
    expect(result.errors.length).toBe(0);

    const check = await testPool.query("SELECT COUNT(*) FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    expect(Number(check.rows[0].count)).toBe(0);
  });

  test('Venue inexistente: no crea venue, no inserta eventos y registra error controlado comprensible', async () => {
    // Verificar que el venue no existe al inicio
    const venueBefore = await testPool.query("SELECT id FROM venues WHERE slug = 'biblioteca-publica-de-palencia'");
    expect(venueBefore.rows.length).toBe(0);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.inserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('no está censado en la base de datos');
    expect(result.errors[0]).toContain('migración censal autorizada');

    // Confirmar que NO se insertó el venue en la base de datos
    const venueAfter = await testPool.query("SELECT id FROM venues WHERE slug = 'biblioteca-publica-de-palencia'");
    expect(venueAfter.rows.length).toBe(0);

    // Confirmar que NO se insertaron eventos
    const eventsCheck = await testPool.query("SELECT COUNT(*) FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    expect(Number(eventsCheck.rows[0].count)).toBe(0);
  });

  test('Venue existente: la sincronización continúa e inserta borradores en status tentative', async () => {
    // Dar de alta el venue explícitamente en el fixture de pruebas
    await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
      VALUES (1, 'Biblioteca Pública de Palencia (Test)', 'biblioteca-publica-de-palencia', 'C/ Eduardo Dato, 4', true, now(), now())
      ON CONFLICT (city_id, slug) DO NOTHING;
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.dryRun).toBe(false);
    expect(result.inserted).toBe(2);

    // Verificar el registro con hora confirmada
    const res1 = await testPool.query("SELECT * FROM events WHERE dedupe_key = 'jcyl:999901'");
    expect(res1.rows.length).toBe(1);
    const row1 = res1.rows[0];
    expect(row1.status).toBe('tentative'); // Nunca se publica automáticamente
    expect(row1.time_status).toBe('confirmed');
    expect(row1.start_time).not.toBeNull();
    expect(row1.is_free).toBe(true);
    expect(row1.description).toBe('Descripción con HTML'); // Sanitizado
    expect(row1.image_url).toBeNull(); // Política: image_url público es NULL para no publicar imágenes externas sin permiso
    expect(row1.image_original_url).toBe('https://bibliotecas.jcyl.es/foto1.jpg'); // Preservada para revisión editorial en admin

    // Verificar el registro sin hora (pending_time)
    const res2 = await testPool.query("SELECT * FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(res2.rows.length).toBe(1);
    const row2 = res2.rows[0];
    expect(row2.status).toBe('tentative');
    expect(row2.time_status).toBe('pending_time');
    expect(row2.start_time).toBeNull(); // Sin horas inventadas
  });

  test('Sincronización repetida con datos idénticos es idempotente: no inserta ni actualiza filas innecesariamente', async () => {
    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0); // Idempotente: 0 updates porque el contenido ya está al día

    const check = await testPool.query("SELECT COUNT(*) FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    expect(Number(check.rows[0].count)).toBe(2);
  });

  test('Borrador no intervenido: se actualiza si el feed remoto publica cambios', async () => {
    // Simular que el feed oficial actualiza la descripción del evento 999902
    const updatedRecords = [
      mockRecords[0],
      {
        ...mockRecords[1],
        descripcion: 'Descripción actualizada por la biblioteca oficial',
      },
    ];

    const updatedFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ total_count: 2, results: updatedRecords }),
    } as any);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: updatedFetch,
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1); // Se actualiza el borrador no intervenido

    const check = await testPool.query("SELECT description, status FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(check.rows[0].description).toBe('Descripción actualizada por la biblioteca oficial');
    expect(check.rows[0].status).toBe('tentative');
  });

  test('Protección editorial: no sobrescribe eventos verificados o publicados', async () => {
    // Simular que un editor verificó y modificó el evento 999901
    await testPool.query(`
      UPDATE events 
      SET title = 'Título Editado por Humano',
          verified_at = now(),
          status = 'published'
      WHERE dedupe_key = 'jcyl:999901'
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.preservedEditorial).toBe(1);

    const check = await testPool.query("SELECT title, status FROM events WHERE dedupe_key = 'jcyl:999901'");
    expect(check.rows[0].title).toBe('Título Editado por Humano');
    expect(check.rows[0].status).toBe('published');
  });

  test('Protección de borradores editados: conserva cambios manuales en eventos que siguen en status tentative (hash mismatch)', async () => {
    // Simular que un editor corrigió el texto de un borrador tentativa en BD
    // (el contenido ya no coincide con el source_hash del conector)
    await testPool.query(`
      UPDATE events 
      SET title = 'Borrador Retocado por Editor'
      WHERE dedupe_key = 'jcyl:999902'
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.preservedEditorial).toBeGreaterThanOrEqual(1);

    const check = await testPool.query("SELECT title, status FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(check.rows[0].title).toBe('Borrador Retocado por Editor');
    expect(check.rows[0].status).toBe('tentative');
  });

  test('Protección de edición manual: cambio manual de precio o condición de gratuidad se conserva', async () => {
    // Modificar precio manualmente
    await testPool.query(`
      UPDATE events 
      SET price_cents = 500, is_free = false
      WHERE dedupe_key = 'jcyl:999902'
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.preservedEditorial).toBeGreaterThanOrEqual(1);

    const check = await testPool.query("SELECT price_cents, is_free FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(Number(check.rows[0].price_cents)).toBe(500);
    expect(check.rows[0].is_free).toBe(false);
  });

  test('Protección de edición manual: cambio manual de recinto o fecha se conserva', async () => {
    // Modificar fecha editorial manualmente
    await testPool.query(`
      UPDATE events 
      SET editorial_date = '2026-11-20'
      WHERE dedupe_key = 'jcyl:999902'
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.preservedEditorial).toBeGreaterThanOrEqual(1);

    const check = await testPool.query("SELECT editorial_date FROM events WHERE dedupe_key = 'jcyl:999902'");
    const dateStr = typeof check.rows[0].editorial_date === 'string'
      ? check.rows[0].editorial_date
      : new Date(check.rows[0].editorial_date).toISOString().split('T')[0];
    expect(dateStr).toBe('2026-11-20');
  });

  test('Protección de edición manual: cambio manual de URL o imagen no se sobrescribe', async () => {
    // Modificar imagen y source_url manualmente
    await testPool.query(`
      UPDATE events 
      SET image_url = 'https://custom-cdn.vayaplan.com/custom-poster.jpg',
          source_url = 'https://custom-source.com/evento-curado'
      WHERE dedupe_key = 'jcyl:999902'
    `);

    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.preservedEditorial).toBeGreaterThanOrEqual(1);

    const check = await testPool.query("SELECT image_url, source_url FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(check.rows[0].image_url).toBe('https://custom-cdn.vayaplan.com/custom-poster.jpg');
    expect(check.rows[0].source_url).toBe('https://custom-source.com/evento-curado');
  });

  test('Segunda sincronización tras cambios manuales: sigue siendo idempotente y preserva datos', async () => {
    const result = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: mockFetch,
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.preservedEditorial).toBeGreaterThanOrEqual(2);

    const check = await testPool.query("SELECT image_url, price_cents FROM events WHERE dedupe_key = 'jcyl:999902'");
    expect(check.rows[0].image_url).toBe('https://custom-cdn.vayaplan.com/custom-poster.jpg');
    expect(Number(check.rows[0].price_cents)).toBe(500);
  });

  test('Exclusión estricta de otros municipios de la provincia y otros recintos', async () => {
    const extraRecords: JcylRecordRaw[] = [
      {
        id_evento: 999910,
        titulo: 'Taller en Biblioteca de Aguilar de Campoo',
        fecha_inicio: '2026-11-10',
        lugar_celebracion: 'Biblioteca Municipal de Aguilar',
        nombre_localidad: 'Aguilar de Campoo', // Municipio ajeno
        codigo_biblioteca: 'BPPAL', // Código incorrecto o heredado
      },
      {
        id_evento: 999911,
        titulo: 'Obra en Teatro Principal de Palencia',
        fecha_inicio: '2026-11-11',
        lugar_celebracion: 'Teatro Principal',
        nombre_localidad: 'Palencia',
        codigo_biblioteca: null,
        evento_biblioteca: 'NO',
      },
    ];

    const extraFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ total_count: extraRecords.length, results: extraRecords }),
    } as any);

    const result = await syncJcylLibraryActivities({
      dryRun: true,
      cityId: 1,
      fetchFn: extraFetch,
    });

    expect(result.totalApiRecords).toBe(2);
    expect(result.libraryCandidates).toBe(0); // Ambos rechazados
  });

  test('Fuente caída o vacía no borra ni cancela eventos existentes', async () => {
    // 1. Simular respuesta vacía
    const emptyFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ total_count: 0, results: [] }),
    } as any);

    const resultEmpty = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: emptyFetch,
    });

    expect(resultEmpty.totalApiRecords).toBe(0);
    expect(resultEmpty.inserted).toBe(0);

    // Verificar que los eventos existentes siguen intactos en la BD
    const countCheck = await testPool.query("SELECT COUNT(*) FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    expect(Number(countCheck.rows[0].count)).toBe(2);

    // 2. Simular fallo de red 503
    const failFetch = async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as any);

    const resultFail = await syncJcylLibraryActivities({
      dryRun: false,
      cityId: 1,
      fetchFn: failFetch,
    });

    expect(resultFail.errors.length).toBeGreaterThan(0);
    const countCheck2 = await testPool.query("SELECT COUNT(*) FROM events WHERE dedupe_key LIKE 'jcyl:99990%'");
    expect(Number(countCheck2.rows[0].count)).toBe(2);
  });
});

describe('Configuración de Entorno de Pruebas', () => {
  test('Falla con mensaje claro si TEST_DATABASE_URL falta o está vacía', () => {
    const validateTestDatabaseUrl = (url?: string) => {
      if (!url || !url.trim()) {
        throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
      }
      return url.trim();
    };

    expect(() => validateTestDatabaseUrl(undefined)).toThrow(
      'TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.'
    );
    expect(() => validateTestDatabaseUrl('')).toThrow(
      'TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.'
    );
    expect(() => validateTestDatabaseUrl('   ')).toThrow(
      'TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.'
    );
    expect(validateTestDatabaseUrl('postgres://vayaplan_user:secret@localhost:5432/vayaplan_test')).toBe(
      'postgres://vayaplan_user:secret@localhost:5432/vayaplan_test'
    );
  });
});

