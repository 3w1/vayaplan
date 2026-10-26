import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Pool } from 'pg';
import sharp from 'sharp';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();
process.env.MOCK_R2 = 'true';

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');
const {
  setTestPostFetcherOverride,
  setTestImageFetcherOverride,
  SINGLE_POST_APIFY_BUDGET_USD,
  isPrivateOrReservedIp,
  isSafeImageUrl,
  downloadAndUploadPostImageToR2,
} = await import('../../../services/bar-instagram-import/single-post-importer');
const { DEFAULT_LOCK_KEY, acquirePersistentLock, releasePersistentLock, getPersistentLockStatus } = await import(
  '../../../services/bar-instagram-import/persistent-lock'
);

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdProposalIds: number[] = [];
let testVenueId: number;
let validImageBuffer: Buffer;

beforeAll(async () => {
  adminToken = await sign(
    { email: 'curator@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  // Crear venue de prueba
  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'Bar Prueba Importación', 'bar-prueba-importacion', 'Calle San Juan 5, Palencia', 'bar_musical', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  // Generar un buffer JPEG válido usando sharp para los tests de imagen
  validImageBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 120, g: 60, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  setTestPostFetcherOverride(null);
  setTestImageFetcherOverride(null);

  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]);`,
      [createdProposalIds]
    );
  }
  await testPool.query(`DELETE FROM curation_proposals WHERE instagram_post_shortcode LIKE 'TEST_%';`);
  await testPool.query(`DELETE FROM venues WHERE id = $1;`, [testVenueId]);
  await testPool.query(`DELETE FROM instagram_ingestion_locks WHERE lock_key = $1;`, [DEFAULT_LOCK_KEY]);
  await testPool.end();
});

beforeEach(async () => {
  // Asegurar que el lock global está libre antes de cada prueba
  await releasePersistentLock(DEFAULT_LOCK_KEY);
  // Configurar fetcher de imagen mock por defecto que devuelve una imagen JPEG válida
  setTestImageFetcherOverride(async () => validImageBuffer);
});

describe('POST /api/v1/admin/proposals/import-instagram-post — Importación Puntual de Instagram', () => {
  test('1. Requiere autenticación de administrador (401)', async () => {
    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/TEST_12345/' }),
    });
    expect(res.status).toBe(401);
  });

  test('2. Validación defensiva de entrada: cuerpo no objeto o URL faltante devuelve 400', async () => {
    const badBodies = [
      null,
      'string',
      [1, 2, 3],
      {},
      { url: '' },
      { url: 12345 },
      { url: 'https://www.instagram.com/p/TEST_123/', venue_id: 'no-es-numero' },
    ];

    for (const b of badBodies) {
      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(b),
      });
      expect(res.status).toBe(400);
    }
  });

  test('3. Rechaza URLs no soportadas (stories, perfiles, dominios ajenos, SSRF) con 400', async () => {
    const invalidUrls = [
      'https://www.instagram.com/stories/bar_salvaje/123456789/',
      'https://www.instagram.com/salvajepalencia/',
      'https://evil-instagram.com/p/TEST_12345/',
      'http://127.0.0.1/p/TEST_12345/',
      'https://www.instagram.com/explore/tags/palencia/',
      'https://www.instagram.com/p/TEST_12345/extra/path/',
    ];

    for (const url of invalidUrls) {
      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    }
  });

  test('4. Venue inexistente devuelve 400 sin consumir Apify ni crear locks', async () => {
    let apifyCalled = false;
    setTestPostFetcherOverride(async () => {
      apifyCalled = true;
      return [];
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_NO_VENUE/',
        venue_id: 9999999, // No existe
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('venue_not_found');
    expect(apifyCalled).toBe(false);

    // Verificar que el lock global permanece libre
    const lockStatus = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
    expect(lockStatus.locked).toBe(false);
  });

  test('5. Importación exitosa con venue asignado: clasifica, sube a R2 y crea propuesta pending (201)', async () => {
    const shortcode = 'TEST_SUCCESS_01';
    let passedChargeLimit = 0;

    setTestPostFetcherOverride(async (canonicalUrl, chargeLimit) => {
      passedChargeLimit = chargeLimit;
      return [
        {
          id: shortcode,
          shortCode: shortcode,
          url: canonicalUrl,
          displayUrl: 'https://cdn.instagram.com/v/test_pic_01.jpg',
          caption: 'Este viernes 31 de octubre gran concierto de Rock en directo a las 22:30h. Entrada 5€ en taquilla.',
          timestamp: '2026-10-25T18:00:00.000Z',
          ownerUsername: 'bar_rock_palencia',
        },
      ];
    });

    const initialEvents = await testPool.query('SELECT count(*) as count FROM events;');

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.instagram.com/p/${shortcode}/?igsh=tracking123`,
        venue_id: testVenueId,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.alreadyExisted).toBe(false);
    expect(data.proposal).toBeDefined();
    expect(data.proposal.instagram_post_shortcode).toBe(shortcode);
    expect(data.proposal.source_url).toBe(`https://www.instagram.com/p/${shortcode}/`);
    expect(data.proposal.venue_id).toBe(testVenueId);
    expect(data.proposal.review_status).toBe('pending');
    expect(data.proposal.requires_manual_review).toBe(true);
    expect(data.proposal.proposed_date).toBe('2026-10-31');
    expect(data.proposal.proposed_time).toBe('22:30');
    expect(data.proposal.classification).toBe('EVENTO_POSIBLE');
    expect(data.proposal.image_url).toContain(`bars/bar-prueba-importacion/${shortcode}.jpg`);

    createdProposalIds.push(data.proposal.id);

    // Verifica que el presupuesto enviado es exactamente el mínimo defensivo de Apify (0.005 USD)
    expect(passedChargeLimit).toBe(SINGLE_POST_APIFY_BUDGET_USD);

    // Cero escrituras en la tabla events
    const postEvents = await testPool.query('SELECT count(*) as count FROM events;');
    expect(Number(postEvents.rows[0].count)).toBe(Number(initialEvents.rows[0].count));

    // El lock global debe haber quedado liberado en finally
    const lockStatus = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
    expect(lockStatus.locked).toBe(false);
  });

  test('6. Importación exitosa con venue_id = NULL: crea propuesta sin local asignado (201)', async () => {
    const shortcode = 'TEST_SUCCESS_NO_VENUE';

    setTestPostFetcherOverride(async (canonicalUrl) => {
      return [
        {
          id: shortcode,
          shortCode: shortcode,
          url: canonicalUrl,
          displayUrl: 'https://cdn.instagram.com/v/test_pic_no_venue.jpg',
          caption: 'Fiesta temática especial el sábado 1 de noviembre a las 23:00. Entrada libre.',
          timestamp: '2026-10-25T19:00:00.000Z',
          ownerUsername: 'colectivo_musical',
        },
      ];
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.instagram.com/p/${shortcode}/`,
        venue_id: null,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.proposal.venue_id).toBeNull();
    expect(data.proposal.review_status).toBe('pending');
    expect(data.proposal.image_url).toContain(`bars/standalone/${shortcode}.jpg`);

    createdProposalIds.push(data.proposal.id);

    // Comprobar que en base de datos venue_id es efectivamente NULL
    const dbRow = await testPool.query('SELECT venue_id FROM curation_proposals WHERE id = $1;', [data.proposal.id]);
    expect(dbRow.rows[0].venue_id).toBeNull();
  });

  test('7. Deduplicación pre-Apify: proposals en pending, archived y approved_draft devuelven 200 sin alterar su estado', async () => {
    const statuses = ['pending', 'archived', 'approved_draft'];

    for (const status of statuses) {
      const shortcode = `TEST_DEDUP_STATUS_${status.toUpperCase()}`;

      const insertPre = await testPool.query(`
        INSERT INTO curation_proposals (
          title, venue_id, source_url, source_type, instagram_post_shortcode,
          image_url, confidence, classification, review_status, requires_manual_review
        ) VALUES (
          'Propuesta Existente ${status}', $1, 'https://www.instagram.com/p/${shortcode}/', 'instagram', '${shortcode}',
          'https://r2.vayaplan.com/bars/test.jpg', 'ALTA', 'EVENTO_POSIBLE', '${status}', true
        ) RETURNING id, review_status;
      `, [testVenueId]);

      const existingId = insertPre.rows[0].id;
      createdProposalIds.push(existingId);

      let apifyCalled = false;
      setTestPostFetcherOverride(async () => {
        apifyCalled = true;
        return [];
      });

      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.instagram.com/p/${shortcode}/`,
          venue_id: testVenueId,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.alreadyExisted).toBe(true);
      expect(data.recordType).toBe('proposal');
      expect(data.proposal.id).toBe(existingId);
      expect(data.proposal.review_status).toBe(status); // Estado original preservado
      expect(apifyCalled).toBe(false);

      // Confirmar en BD que el estado no fue modificado
      const checkDb = await testPool.query('SELECT review_status FROM curation_proposals WHERE id = $1;', [existingId]);
      expect(checkDb.rows[0].review_status).toBe(status);
    }
  });

  test('8. Deduplicación cruzada: post importado sin venue y reintentado con venue produce la misma identidad y no duplica', async () => {
    const shortcode = 'TEST_DEDUP_CROSS_VENUE';

    // 1. Insertar propuesta previa sin venue (venue_id = NULL)
    const insertPre = await testPool.query(`
      INSERT INTO curation_proposals (
        title, venue_id, source_url, source_type, instagram_post_shortcode,
        image_url, confidence, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Sin Venue Original', NULL, 'https://www.instagram.com/p/${shortcode}/', 'instagram', '${shortcode}',
        'https://r2.vayaplan.com/bars/test.jpg', 'ALTA', 'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;
    `);

    const existingId = insertPre.rows[0].id;
    createdProposalIds.push(existingId);

    // 2. Intentar importar de nuevo ahora asignándole un venue
    let apifyCalled = false;
    setTestPostFetcherOverride(async () => {
      apifyCalled = true;
      return [];
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.instagram.com/p/${shortcode}/`,
        venue_id: testVenueId,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.alreadyExisted).toBe(true);
    expect(data.proposal.id).toBe(existingId);
    expect(apifyCalled).toBe(false);

    // Verificar que solo existe exactamente una fila para este shortcode en BD
    const countRes = await testPool.query(
      `SELECT count(*) FROM curation_proposals WHERE instagram_post_shortcode = $1;`,
      [shortcode]
    );
    expect(Number(countRes.rows[0].count)).toBe(1);
  });

  test('9. Deduplicación con eventos: evento existente con source_url coincidente devuelve 200 con recordType: event', async () => {
    const shortcode = 'TEST_DEDUP_EVENT_MATCH';
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    // 1. Crear evento en events con source_url correspondiente al post
    const eventInsert = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, start_time, editorial_date, is_free,
        source_type, source_url, status
      ) VALUES (
        1, $1, 'Concierto Ya Creado en Eventos', 'musica', '2026-11-05 21:00:00+01', '2026-11-05', true,
        'instagram', $2, 'published'
      ) RETURNING id;
    `, [testVenueId, canonicalUrl]);

    const existingEventId = eventInsert.rows[0].id;

    try {
      let apifyCalled = false;
      setTestPostFetcherOverride(async () => {
        apifyCalled = true;
        return [];
      });

      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: canonicalUrl }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.alreadyExisted).toBe(true);
      expect(data.recordType).toBe('event');
      expect(data.event.id).toBe(existingEventId);
      expect(apifyCalled).toBe(false);
    } finally {
      await testPool.query('DELETE FROM events WHERE id = $1;', [existingEventId]);
    }
  });

  test('10. Coordinación atómica con lock global: si la ingesta global está activa, responde 409 ingestion_in_progress sin llamar a Apify', async () => {
    // 1. Simular que la ingesta periódica o manual adquirió el lock global
    const lock = await acquirePersistentLock({
      lockKey: DEFAULT_LOCK_KEY,
      lockedBy: 'cron_worker_active_session',
      ttlMinutes: 5,
    });
    expect(lock.success).toBe(true);

    try {
      let apifyCalled = false;
      setTestPostFetcherOverride(async () => {
        apifyCalled = true;
        return [];
      });

      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://www.instagram.com/p/TEST_CONCURRENT_LOCK/',
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('ingestion_in_progress');
      expect(apifyCalled).toBe(false);
    } finally {
      await releasePersistentLock(DEFAULT_LOCK_KEY, 'cron_worker_active_session');
    }
  });

  test('11. Propiedad del lock persistente: releasePersistentLock no libera un lock perteneciente a otra ejecución', async () => {
    const realLockedBy = 'session_legitima_01';
    const fakeLockedBy = 'session_intrusa_02';

    const lock = await acquirePersistentLock({
      lockKey: DEFAULT_LOCK_KEY,
      lockedBy: realLockedBy,
      ttlMinutes: 2,
    });
    expect(lock.success).toBe(true);

    try {
      // Intentar liberar con id equivocado
      const releasedFake = await releasePersistentLock(DEFAULT_LOCK_KEY, fakeLockedBy);
      expect(releasedFake).toBe(false);

      // Verificar que el lock sigue ocupado
      const statusAfter = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
      expect(statusAfter.locked).toBe(true);
      expect(statusAfter.lockInfo?.lockedBy).toBe(realLockedBy);
    } finally {
      await releasePersistentLock(DEFAULT_LOCK_KEY, realLockedBy);
    }
  });

  test('12. Respuestas inesperadas del proveedor: dataset vacío (422) y discordancia de shortcode (422)', async () => {
    // 1. Dataset vacío (post privado / no encontrado)
    setTestPostFetcherOverride(async () => []);

    const resEmpty = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_PRIVATE_POST/',
      }),
    });

    expect(resEmpty.status).toBe(422);
    const dataEmpty = await resEmpty.json();
    expect(dataEmpty.error).toBe('post_not_found');

    // 2. Shortcode devuelto distinto del solicitado
    setTestPostFetcherOverride(async () => [
      {
        id: 'OTHER_SHORTCODE_999',
        shortCode: 'OTHER_SHORTCODE_999',
        displayUrl: 'https://cdn.instagram.com/pic.jpg',
      },
    ]);

    const resMismatch = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_REQUESTED_CODE/',
      }),
    });

    expect(resMismatch.status).toBe(422);
    const dataMismatch = await resMismatch.json();
    expect(dataMismatch.error).toBe('shortcode_mismatch');
  });

  test('13. Múltiples publicaciones devueltas por el proveedor son rechazadas por seguridad (422)', async () => {
    setTestPostFetcherOverride(async () => [
      { id: 'CODE_1', shortCode: 'CODE_1', displayUrl: 'https://cdn.instagram.com/1.jpg' },
      { id: 'CODE_2', shortCode: 'CODE_2', displayUrl: 'https://cdn.instagram.com/2.jpg' },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/CODE_1/',
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('unexpected_multiple_results');
  });

  test('14. Timeout de Apify controlado: devuelve 504 con apify_timeout y libera el lock global', async () => {
    setTestPostFetcherOverride(async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_TIMEOUT/',
      }),
    });

    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toBe('apify_timeout');
    expect(data.message).toContain('Tiempo de espera agotado');

    // Confirmar que el lock quedó liberado en finally
    const lockStatus = await getPersistentLockStatus(DEFAULT_LOCK_KEY);
    expect(lockStatus.locked).toBe(false);
  });

  test('15. Protección anti-SSRF y validación de IPs privadas en imágenes (isPrivateOrReservedIp / isSafeImageUrl)', () => {
    // IPv4 privadas y loopback
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.20.0.1')).toBe(true);

    // IPv6 privadas y especiales
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);

    // IPv4 mapeada en IPv6
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);

    // IPs públicas válidas
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('104.20.23.154')).toBe(false);
    expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false);

    // URLs seguras vs inseguras
    expect(isSafeImageUrl('https://cdn.instagram.com/pic.jpg')).toBe(true);
    expect(isSafeImageUrl('http://127.0.0.1/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeImageUrl('http://user:pass@example.com/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('https://example.com:8080/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('ftp://example.com/pic.jpg')).toBe(false);
  });

  test('16. Descarga de imagen: rechaza formatos no permitidos (p. ej. SVG) con 502', async () => {
    // Simular que el scraper devolvió un buffer SVG (no admitido para cartel)
    setTestImageFetcherOverride(async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'));

    setTestPostFetcherOverride(async (url) => [
      {
        id: 'TEST_SVG',
        shortCode: 'TEST_SVG',
        url,
        displayUrl: 'https://cdn.instagram.com/pic.svg',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_SVG/',
      }),
    });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('image_upload_failed');
    expect(data.message).toContain('Formato de imagen no permitido');
  });

  test('17. Descarga de imagen: rechaza archivos corruptos con 502', async () => {
    // Buffer binario corrupto que no es imagen
    setTestImageFetcherOverride(async () => Buffer.from('ESTO_NO_ES_UNA_IMAGEN_VALIDA_CORRUPTO_TOTAL'));

    setTestPostFetcherOverride(async (url) => [
      {
        id: 'TEST_CORRUPT',
        shortCode: 'TEST_CORRUPT',
        url,
        displayUrl: 'https://cdn.instagram.com/pic.jpg',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_CORRUPT/',
      }),
    });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('image_upload_failed');
    expect(data.message).toContain('Archivo de imagen corrupto o inválido');
  });

  test('18. Normalización con Sharp: transcodifica a JPEG progresivo, aplana canal alfa y escala dentro de 1440x1440', async () => {
    // Crear imagen PNG con transparencia
    const pngWithAlpha = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 4,
        background: { r: 50, g: 100, b: 200, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const mockPost = {
      id: 'TEST_NORM_01',
      shortCode: 'TEST_NORM_01',
      displayUrl: 'https://cdn.instagram.com/transparent.png',
      caption: 'Test normalización',
    };

    const result = await downloadAndUploadPostImageToR2(
      mockPost as any,
      'test-venue',
      async () => pngWithAlpha
    );

    expect(result.contentType).toBe('image/jpeg');
    expect(result.width).toBeLessThanOrEqual(1440);
    expect(result.height).toBeLessThanOrEqual(1440);
    expect(result.r2Key).toBe('bars/test-venue/TEST_NORM_01.jpg');

    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.finalUrl).toContain('bars/test-venue/TEST_NORM_01.jpg');
  });

  test('19. Soporte de Reels (/reel/): extrae caption y miniatura sin procesar audio', async () => {
    const shortcode = 'TEST_REEL_01';

    setTestPostFetcherOverride(async (url) => [
      {
        id: shortcode,
        shortCode: shortcode,
        type: 'Video',
        url,
        displayUrl: 'https://cdn.instagram.com/v/reel_thumb.jpg',
        caption: 'Tardeo este sábado 25 de octubre con DJ Residente a partir de las 18:00h en Terraza. ¡No te lo pierdas!',
        timestamp: '2026-10-25T14:00:00.000Z',
        ownerUsername: 'bar_tardeo',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.instagram.com/reel/${shortcode}/`,
        venue_id: testVenueId,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.proposal.source_url).toBe(`https://www.instagram.com/reel/${shortcode}/`);
    expect(data.proposal.proposed_date).toBe('2026-10-25');
    expect(data.proposal.proposed_time).toBe('18:00');
    expect(data.proposal.classification).toBe('EVENTO_POSIBLE');

    createdProposalIds.push(data.proposal.id);
  });
});
