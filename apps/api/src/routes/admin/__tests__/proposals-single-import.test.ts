import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Pool } from 'pg';
import sharp from 'sharp';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');
const {
  setTestPostFetcherOverride,
  setTestImageFetcherOverride,
  SINGLE_POST_APIFY_BUDGET_USD,
} = await import('../../../services/bar-instagram-import/single-post-importer');
const { acquirePersistentLock, releasePersistentLock } = await import(
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
  await testPool.query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'single_post_%';`);
  await testPool.end();
});

beforeEach(() => {
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

  test('7. Deduplicación pre-Apify: si el post ya existe, devuelve 200 con alreadyExisted y 0 llamadas al scraper', async () => {
    const shortcode = 'TEST_DEDUP_EXISTING';

    // 1. Insertar propuesta previa
    const insertPre = await testPool.query(`
      INSERT INTO curation_proposals (
        title, venue_id, source_url, source_type, instagram_post_shortcode,
        image_url, confidence, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Existente', $1, 'https://www.instagram.com/p/${shortcode}/', 'instagram', '${shortcode}',
        'https://r2.vayaplan.com/bars/test.jpg', 'ALTA', 'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;
    `, [testVenueId]);

    const existingId = insertPre.rows[0].id;
    createdProposalIds.push(existingId);

    // 2. Intentar importar de nuevo
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
    expect(apifyCalled).toBe(false); // Cero llamadas remotas
  });

  test('8. Concurrencia: bloquea segunda petición simultánea sobre el mismo shortcode (409 import_in_progress)', async () => {
    const shortcode = 'TEST_CONCURRENT_LOCK';
    const lockKey = `single_post_${shortcode}`;

    // Simular que otra petición adquirió el lock persistente
    const lock = await acquirePersistentLock({
      lockKey,
      lockedBy: 'test_session_active',
      ttlMinutes: 2,
    });
    expect(lock.success).toBe(true);

    try {
      const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.instagram.com/p/${shortcode}/`,
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('import_in_progress');
    } finally {
      await releasePersistentLock(lockKey);
    }
  });

  test('9. Respuestas inesperadas del proveedor: dataset vacío (422) y discordancia de shortcode (422)', async () => {
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

  test('10. Múltiples publicaciones devueltas por el proveedor son rechazadas por seguridad (422)', async () => {
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

  test('11. Protección anti-SSRF en URL de imagen: rechaza IPs privadas o localhost (502)', async () => {
    setTestPostFetcherOverride(async (url) => [
      {
        id: 'TEST_SSRF',
        shortCode: 'TEST_SSRF',
        url,
        displayUrl: 'http://169.254.169.254/latest/meta-data/', // AWS metadata SSRF attempt
        caption: 'Post malicioso',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/p/TEST_SSRF/',
      }),
    });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('image_upload_failed');
  });

  test('12. Soporte de Reels (/reel/): extrae caption y miniatura sin procesar audio', async () => {
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
