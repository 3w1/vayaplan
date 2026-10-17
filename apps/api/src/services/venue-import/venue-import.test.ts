import { Pool } from 'pg';
import {
  deduplicateAndNormalize,
  classifyCandidates,
  buildManifest,
  applyManifest,
  rollbackBatch,
  type ImportManifest,
  type RawScraperItem,
  type CandidateClassification,
} from './index';
import {
  redactDbUrl,
  resolveDbUrl,
} from '../../scripts/venue-import';

const rawTestDbUrl = process.env.VENUE_IMPORT_TEST_DB_URL;
if (!rawTestDbUrl || rawTestDbUrl.trim().length === 0) {
  console.error(
    'Error de configuración: Se requiere la variable de entorno VENUE_IMPORT_TEST_DB_URL para ejecutar la suite de pruebas.\n' +
      'Ejemplo:\n' +
      '  VENUE_IMPORT_TEST_DB_URL=postgresql://usuario:clave@host:5432/vayaplan_import_synthetic \\\n' +
      '  bun run apps/api/src/services/venue-import/venue-import.test.ts'
  );
  process.exit(1);
}
const TEST_DB_URL = rawTestDbUrl.trim();

async function runTestSuite() {
  console.log('========================================================');
  console.log('SUITE REPRODUCIBLE DE PRUEBAS DEL PIPELINE (21 ESCENARIOS)');
  console.log('BD objetivo:', redactDbUrl(TEST_DB_URL));
  console.log('========================================================\n');

  // Comprobación de seguridad preventiva (salvaguarda adicional, no garantía absoluta de aislamiento de red)
  try {
    const parsed = new URL(TEST_DB_URL);
    const dbName = parsed.pathname.replace(/^\//, '');
    if (!dbName.includes('test') && !dbName.includes('synthetic')) {
      console.error(
        `Error de seguridad preventiva: La base de datos objetivo "${dbName}" no contiene "test" ni "synthetic". ` +
          `Esta comprobación es una salvaguarda adicional para prevenir ejecuciones accidentales contra bases no autorizadas. Ejecución abortada.`
      );
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error al parsear URL de prueba: ${err.message}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: TEST_DB_URL });
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      testsFailed++;
    }
  }

  // Pre-test baseline count
  const preVenuesRes = await pool.query('SELECT COUNT(*) FROM venues');
  const initialVenuesCount = Number(preVenuesRes.rows[0].count);
  console.log(`Censo inicial en BD sintética: ${initialVenuesCount} locales.`);

  // Verify venue 9999 exists
  const venue9999Res = await pool.query('SELECT id, name, slug FROM venues WHERE id = 9999');
  assert(venue9999Res.rowCount === 1, 'Local provisional 9999 presente en BD inicial');

  // -------------------------------------------------------------
  // ESCENARIO 1: Configuración de conexión, precedencia y redacción
  // -------------------------------------------------------------
  console.log('\n--- Escenario 1: Conexión explícita obligatoria y redacción de secretos ---');
  const prevEnv = process.env.VENUE_IMPORT_DATABASE_URL;
  try {
    delete process.env.VENUE_IMPORT_DATABASE_URL;
    assert(resolveDbUrl(undefined) === null, 'Sin flag ni env var retorna null (falla antes de conectar)');

    // Fixture sintético simulado para verificar precedencia de variable de entorno (sin conexión real)
    process.env.VENUE_IMPORT_DATABASE_URL = 'postgresql://mock_env_user:mock_env_pass@localhost:5432/mock_env_db';
    assert(
      resolveDbUrl(undefined) === 'postgresql://mock_env_user:mock_env_pass@localhost:5432/mock_env_db',
      'VENUE_IMPORT_DATABASE_URL utilizado si no hay flag'
    );

    // Fixture sintético simulado para verificar precedencia de flag CLI (sin conexión real)
    assert(
      resolveDbUrl('postgresql://mock_cli_user:mock_cli_pass@localhost:5432/mock_cli_db') ===
        'postgresql://mock_cli_user:mock_cli_pass@localhost:5432/mock_cli_db',
      'Precedencia: flag --db-url prevalece sobre VENUE_IMPORT_DATABASE_URL'
    );

    // Fixture sintético simulado para verificar la ofuscación de contraseñas (sin conexión real)
    const secretUrl = 'postgresql://mock_user:MockSecretPassword123@mock-db-host:5432/mock_test_db';
    const redacted = redactDbUrl(secretUrl);
    assert(!redacted.includes('MockSecretPassword123'), 'Contraseña eliminada en redacción de URL');
    assert(redacted.includes('***'), 'Contraseña sustituida por máscara ***');
  } finally {
    if (prevEnv) process.env.VENUE_IMPORT_DATABASE_URL = prevEnv;
    else delete process.env.VENUE_IMPORT_DATABASE_URL;
  }

  // -------------------------------------------------------------
  // ESCENARIO 2: Prepare sin BD (candidatos quedan PENDIENTE_COMPARACION)
  // -------------------------------------------------------------
  console.log('\n--- Escenario 2: Prepare sin BD no presenta contrastados como POSIBLE_ALTA ---');
  const offlineItems: RawScraperItem[] = [
    {
      placeId: 'ChIJOFFLINE_01',
      title: 'Bar Sin Contrastar',
      city: 'Palencia',
      address: 'Calle Mayor 5',
    },
  ];
  const dedupOffline = deduplicateAndNormalize(offlineItems, 'palencia');
  await classifyCandidates(dedupOffline.candidates, { targetCitySlug: 'palencia' }); // sin db
  assert(
    dedupOffline.candidates[0].classification === 'PENDIENTE_COMPARACION',
    'Candidato sin contrastar contra BD queda clasificado como PENDIENTE_COMPARACION'
  );

  // -------------------------------------------------------------
  // ESCENARIO 3: JSON inválido y registros incompletos
  // -------------------------------------------------------------
  console.log('\n--- Escenario 3: Validación de JSON inválido y registros incompletos ---');
  const malformedItems: any[] = [
    null,
    { title: 'Local sin datos mínimos' },
    {
      placeId: 'ChIJTEST_VALID_01',
      title: 'Bar Válido 1',
      city: 'Palencia',
      address: 'Calle Mayor 1',
      latitude: 42.01,
      longitude: -4.53,
    },
  ];
  const dedupDefects = deduplicateAndNormalize(malformedItems as RawScraperItem[], 'palencia');
  assert(dedupDefects.defects.length === 1, 'Registro defectuoso detectado y registrado');
  assert(
    dedupDefects.candidates.some((c) => c.placeId === 'ChIJTEST_VALID_01'),
    'Candidato válido preservado pese a defectos en otros registros'
  );

  // -------------------------------------------------------------
  // ESCENARIO 4: Deduplicación y preservación de riqueza
  // -------------------------------------------------------------
  console.log('\n--- Escenario 4: Deduplicación y preservación de riqueza ---');
  const duplicateBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJDUP_TEST_01',
      title: 'Cervecería El Roble',
      city: 'Palencia',
      address: 'Calle Roble 5',
      searchString: 'Bares Palencia',
      openingHours: { lunes: '10:00 - 22:00', martes: '10:00 - 22:00' },
      reviewsCount: 150,
      phone: '+34 979 11 22 33',
    },
    {
      placeId: 'ChIJDUP_TEST_01',
      title: 'Cervecería El Roble',
      city: 'Palencia',
      address: 'Calle Roble 5',
      searchString: 'Cervecerías Palencia',
      openingHours: { lunes: '10:00 - 22:00' },
      reviewsCount: null,
      phone: '+34 979 11 22 33',
    },
  ];
  const dedupRichness = deduplicateAndNormalize(duplicateBatch, 'palencia');
  assert(dedupRichness.candidates.length === 1, 'Dos filas con mismo placeId consolidadas en 1 candidato');
  assert(dedupRichness.repeatedRowsAbsorbed === 1, '1 fila repetida absorbida');
  assert(dedupRichness.candidates[0].openingHoursCount === 2, 'Preserva versión más rica (2 días de horario)');
  assert(dedupRichness.candidates[0].conflicts.length > 0, 'Registra conflicto entre versiones parciales');
  assert(dedupRichness.candidates[0].originRows.length === 2, 'Preserva índices de ambas filas de origen');

  // -------------------------------------------------------------
  // ESCENARIO 5: Filtro geográfico (otra ciudad)
  // -------------------------------------------------------------
  console.log('\n--- Escenario 5: Filtro geográfico (otra ciudad) ---');
  const cityMismatchBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJFUENGIROLA_01',
      title: 'Taberna Costa del Sol',
      city: 'Fuengirola',
      address: 'Paseo Marítimo 12, Fuengirola',
    },
  ];
  const dedupCity = deduplicateAndNormalize(cityMismatchBatch, 'palencia');
  await classifyCandidates(dedupCity.candidates, { targetCitySlug: 'palencia', targetCityId: 1, db: pool });
  assert(dedupCity.candidates[0].classification === 'FUERA_DE_AMBITO', 'Establecimiento de otra ciudad clasificado como FUERA_DE_AMBITO');

  // -------------------------------------------------------------
  // ESCENARIO 6: Detección de ambigüedad intra-lote (portal y marca)
  // -------------------------------------------------------------
  console.log('\n--- Escenario 6: Detección de ambigüedad intra-lote (portal y marca) ---');
  const ambiguityBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJPORTAL_A',
      title: 'Café El Rincón',
      city: 'Palencia',
      address: 'Pl. Mayor, 15, Palencia',
    },
    {
      placeId: 'ChIJPORTAL_B',
      title: 'Bistró Moderno',
      city: 'Palencia',
      address: 'Pl. Mayor, 15, Palencia',
    },
    {
      placeId: 'ChIJBRAND_A',
      title: 'La Parrilla Hermanos Gómez',
      city: 'Palencia',
      address: 'Calle Mayor 10, Palencia',
    },
    {
      placeId: 'ChIJBRAND_B',
      title: 'Restaurante Hermanos Gómez',
      city: 'Palencia',
      address: 'Calle Mayor 12, Palencia',
    },
  ];
  const dedupAmbiguity = deduplicateAndNormalize(ambiguityBatch, 'palencia');
  await classifyCandidates(dedupAmbiguity.candidates, { targetCitySlug: 'palencia', targetCityId: 1, db: pool });
  const portalCandidates = dedupAmbiguity.candidates.filter((c) => c.addressOriginal.includes('Pl. Mayor, 15'));
  assert(
    portalCandidates.every((c) => c.classification === 'REVISAR_COINCIDENCIA'),
    'Negocios compartiendo portal clasificados como REVISAR_COINCIDENCIA'
  );
  const brandCandidates = dedupAmbiguity.candidates.filter((c) => c.proposedName.includes('Hermanos Gómez'));
  assert(
    brandCandidates.every((c) => c.classification === 'REVISAR_COINCIDENCIA'),
    'Negocios con misma marca comercial clasificados como REVISAR_COINCIDENCIA'
  );

  // -------------------------------------------------------------
  // ESCENARIO 7: Rechazo de approved: true en clasificaciones no permitidas
  // -------------------------------------------------------------
  console.log('\n--- Escenario 7: Rechazo de approved: true con estados no permitidos ---');
  const invalidStates: CandidateClassification[] = [
    'FUERA_DE_AMBITO',
    'REVISAR_COINCIDENCIA',
    'DATOS_INSUFICIENTES',
    'PENDIENTE_COMPARACION',
    'YA_EXISTENTE',
  ];

  for (const state of invalidStates) {
    const candidateInvalid = {
      ...dedupOffline.candidates[0],
      candidateId: `CAND_TEST_${state}`,
      classification: state,
      approved: true,
    };
    const manifestInvalid = buildManifest(
      'invalid_approval.json',
      JSON.stringify(offlineItems),
      'palencia',
      [candidateInvalid],
      1,
      0
    );
    const applyInvRes = await applyManifest(manifestInvalid, pool, { apply: true, citySlug: 'palencia' });
    assert(
      applyInvRes.errors.length > 0 && applyInvRes.errors[0].includes('clasificación no permitida'),
      `Rechaza lote si candidato aprobado tiene estado ${state}`
    );
    assert(applyInvRes.appliedCount === 0, `0 inserciones para estado ${state}`);
  }

  // -------------------------------------------------------------
  // ESCENARIO 8: Duplicados dentro del manifiesto (candidateId, externalId, slug)
  // -------------------------------------------------------------
  console.log('\n--- Escenario 8: Rechazo de duplicados dentro del propio manifiesto ---');
  // Duplicate candidateId
  const dupCandIdManifest = buildManifest(
    'dup_cand_id.json',
    '{}',
    'palencia',
    [
      { ...dedupOffline.candidates[0], candidateId: 'CAND-01', placeId: 'PID_A', proposedSlug: 'slug-a', classification: 'POSIBLE_ALTA', approved: true },
      { ...dedupOffline.candidates[0], candidateId: 'CAND-01', placeId: 'PID_B', proposedSlug: 'slug-b', classification: 'POSIBLE_ALTA', approved: true },
    ],
    2,
    0
  );
  const dupCandRes = await applyManifest(dupCandIdManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(dupCandRes.errors.some((e) => e.includes('candidato repetido')), 'Detecta candidateId repetido en manifiesto');

  // Duplicate externalId
  const dupExtIdManifest = buildManifest(
    'dup_ext_id.json',
    '{}',
    'palencia',
    [
      { ...dedupOffline.candidates[0], candidateId: 'CAND-01', placeId: 'PID_SAME', proposedSlug: 'slug-a', classification: 'POSIBLE_ALTA', approved: true },
      { ...dedupOffline.candidates[0], candidateId: 'CAND-02', placeId: 'PID_SAME', proposedSlug: 'slug-b', classification: 'POSIBLE_ALTA', approved: true },
    ],
    2,
    0
  );
  const dupExtRes = await applyManifest(dupExtIdManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(dupExtRes.errors.some((e) => e.includes('externo repetido')), 'Detecta placeId repetido en manifiesto');

  // Duplicate slug
  const dupSlugManifest = buildManifest(
    'dup_slug.json',
    '{}',
    'palencia',
    [
      { ...dedupOffline.candidates[0], candidateId: 'CAND-01', placeId: 'PID_A', proposedSlug: 'slug-same', classification: 'POSIBLE_ALTA', approved: true },
      { ...dedupOffline.candidates[0], candidateId: 'CAND-02', placeId: 'PID_B', proposedSlug: 'slug-same', classification: 'POSIBLE_ALTA', approved: true },
    ],
    2,
    0
  );
  const dupSlugRes = await applyManifest(dupSlugManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(dupSlugRes.errors.some((e) => e.includes('Slug') && e.includes('duplicado')), 'Detecta slug repetido en manifiesto');

  // -------------------------------------------------------------
  // ESCENARIO 9: Separación de redes y preservación de privacidad WhatsApp
  // -------------------------------------------------------------
  console.log('\n--- Escenario 9: Separación de redes y preservación de privacidad WhatsApp ---');
  const webBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJWEB_TEST_01',
      title: 'Bar Con Redes',
      city: 'Palencia',
      website: 'https://www.instagram.com/barconredes_palencia?igsh=123',
      phone: '+34 979 55 66 77',
      phoneUnformatted: '+34979556677',
    },
  ];
  const dedupWeb = deduplicateAndNormalize(webBatch, 'palencia');
  assert(dedupWeb.candidates[0].instagramHandle === 'barconredes_palencia', 'Instagram parseado a handle');
  assert(dedupWeb.candidates[0].websiteOwn === null, 'URL de Instagram no se almacena como web propia');
  assert(dedupWeb.candidates[0].phoneUnformatted === '+34979556677', 'Teléfono normalizado para venues.phone');

  // -------------------------------------------------------------
  // ESCENARIO 10: Cero escrituras en Prepare y Dry-run
  // -------------------------------------------------------------
  console.log('\n--- Escenario 10: Cero escrituras en Prepare y Dry-run ---');
  const manifestTest = buildManifest(
    'test_file.json',
    JSON.stringify(webBatch),
    'palencia',
    [{ ...dedupWeb.candidates[0], classification: 'POSIBLE_ALTA', approved: true }],
    1,
    0
  );

  const dryRunResult = await applyManifest(manifestTest, pool, { apply: false, citySlug: 'palencia' });
  assert(dryRunResult.dryRun === true, 'Modo simulación (dryRun) activo');
  assert(dryRunResult.createdVenueIds.length === 0, 'Cero IDs creados en simulación');

  const postDryRunVenuesRes = await pool.query('SELECT COUNT(*) FROM venues');
  assert(
    Number(postDryRunVenuesRes.rows[0].count) === initialVenuesCount,
    'Cero escrituras en venues tras dry-run'
  );

  // -------------------------------------------------------------
  // ESCENARIO 11: Solo se aplican candidatos explícitamente aprobados
  // -------------------------------------------------------------
  console.log('\n--- Escenario 11: Solo candidatos aprobados se aplican ---');
  const unapprovedManifest = buildManifest(
    'unapproved.json',
    JSON.stringify(webBatch),
    'palencia',
    [{ ...dedupWeb.candidates[0], classification: 'POSIBLE_ALTA', approved: false }],
    1,
    0
  );
  const unapprovedResult = await applyManifest(unapprovedManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(unapprovedResult.appliedCount === 0, 'Candidato con approved=false NO es aplicado');
  assert(unapprovedResult.warnings.length > 0, 'Emite advertencia por falta de aprobados');

  // -------------------------------------------------------------
  // ESCENARIO 12: Aplicación real de candidatos aprobados y persistencia
  // -------------------------------------------------------------
  console.log('\n--- Escenario 12: Aplicación transaccional con --apply ---');
  const approvedItem: RawScraperItem = {
    placeId: 'ChIJSYNTHETIC_APP_01',
    title: 'Bar Sintético Aprobado',
    city: 'Palencia',
    address: 'Plaza de San Lázaro 4, 34005 Palencia',
    latitude: 42.008,
    longitude: -4.532,
    phone: '+34 979 99 88 77',
    categoryName: 'Bar de tapas',
  };
  const dedupApproved = deduplicateAndNormalize([approvedItem], 'palencia');
  dedupApproved.candidates[0].classification = 'POSIBLE_ALTA';
  dedupApproved.candidates[0].approved = true;
  const realManifest = buildManifest(
    'synthetic_batch_01.json',
    JSON.stringify([approvedItem]),
    'palencia',
    dedupApproved.candidates,
    1,
    0
  );

  const realApplyResult = await applyManifest(realManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(realApplyResult.appliedCount === 1, '1 candidato aplicado con éxito');
  assert(realApplyResult.createdVenueIds.length === 1, 'Retorna el ID del nuevo local creado');

  const newVenueId = realApplyResult.createdVenueIds[0];
  const newVenueRow = await pool.query('SELECT * FROM venues WHERE id = $1', [newVenueId]);
  assert(newVenueRow.rowCount === 1, 'Local persistido en tabla venues');
  assert(newVenueRow.rows[0].whatsapp_contact === null, 'venues.whatsapp_contact es estrictamente NULL');
  assert(newVenueRow.rows[0].phone === '+34 979 99 88 77', 'venues.phone poblado correctamente');

  const extIdRow = await pool.query(
    'SELECT * FROM venue_external_ids WHERE provider = $1 AND external_id = $2',
    ['google_maps', 'ChIJSYNTHETIC_APP_01']
  );
  assert(extIdRow.rowCount === 1, 'Identificador externo registrado en venue_external_ids');
  assert(extIdRow.rows[0].venue_id === newVenueId, 'Identificador externo asociado al nuevo venue_id');

  const batchRow = await pool.query('SELECT * FROM venue_import_batches WHERE batch_uuid = $1', [
    realManifest.batchUuid,
  ]);
  assert(batchRow.rowCount === 1, 'Lote registrado en venue_import_batches');
  assert(batchRow.rows[0].status === 'applied', 'Estado del lote es "applied"');

  // -------------------------------------------------------------
  // ESCENARIO 13: Repetición del lote (protección contra re-run por hash)
  // -------------------------------------------------------------
  console.log('\n--- Escenario 13: Protección contra repetición de lote ---');
  const repeatResult = await applyManifest(realManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(repeatResult.errors.length > 0, 'Rechaza repetición del mismo lote (hash coincidente)');
  assert(repeatResult.appliedCount === 0, '0 locales duplicados');

  // -------------------------------------------------------------
  // ESCENARIO 14: Otro JSON con el mismo placeId
  // -------------------------------------------------------------
  console.log('\n--- Escenario 14: Detección de placeId existente en otro JSON ---');
  const anotherJsonItem: RawScraperItem = {
    placeId: 'ChIJSYNTHETIC_APP_01', // Mismo placeId ya importado
    title: 'Bar Sintético Nombre Modificado',
    city: 'Palencia',
    address: 'Plaza de San Lázaro 4',
  };
  const dedupAnother = deduplicateAndNormalize([anotherJsonItem], 'palencia');
  dedupAnother.candidates[0].classification = 'POSIBLE_ALTA';
  dedupAnother.candidates[0].approved = true;
  const anotherManifest = buildManifest(
    'another_file.json',
    JSON.stringify([anotherJsonItem]),
    'palencia',
    dedupAnother.candidates,
    1,
    0
  );
  const anotherResult = await applyManifest(anotherManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(anotherResult.errors.length > 0, 'Rechaza inserción por placeId ya registrado en venue_external_ids');

  // -------------------------------------------------------------
  // ESCENARIO 15: Conflicto de slug y aborto atómico
  // -------------------------------------------------------------
  console.log('\n--- Escenario 15: Conflicto de slug y aborto atómico ---');
  const slugCollisionBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJNEW_PLACE_VALID',
      title: 'Nuevo Bar Que Pasaría',
      city: 'Palencia',
      address: 'Calle Nueva 1',
    },
    {
      placeId: 'ChIJNEW_PLACE_COLLIDING',
      title: 'El Gatonegro', // Ya existe en BD con slug "el-gatonegro"
      city: 'Palencia',
      address: 'Calle San Juan 3',
    },
  ];
  const dedupCollision = deduplicateAndNormalize(slugCollisionBatch, 'palencia');
  dedupCollision.candidates.forEach((c) => {
    c.classification = 'POSIBLE_ALTA';
    c.approved = true;
  });
  const collisionManifest = buildManifest(
    'collision_file.json',
    JSON.stringify(slugCollisionBatch),
    'palencia',
    dedupCollision.candidates,
    2,
    0
  );
  const collisionResult = await applyManifest(collisionManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(collisionResult.errors.length > 0, 'Detecta colisión de slug con local existente');
  assert(collisionResult.appliedCount === 0, 'Ningún candidato insertado parcialmente (aborto atómico)');

  const checkPartial = await pool.query(
    'SELECT * FROM venue_external_ids WHERE external_id = $1',
    ['ChIJNEW_PLACE_VALID']
  );
  assert(checkPartial.rowCount === 0, 'Cero inserciones parciales tras error de colisión');

  // -------------------------------------------------------------
  // ESCENARIO 16: Conflicto de nombre en revalidación contra el censo
  // -------------------------------------------------------------
  console.log('\n--- Escenario 16: Conflicto de nombre contra censo en revalidación ---');
  const nameCollisionBatch: RawScraperItem[] = [
    {
      placeId: 'ChIJNAME_COLLIDE',
      title: 'El Gatonegro', // Mismo nombre en BD
      city: 'Palencia',
      address: 'Calle Falsa 123',
    },
  ];
  const dedupName = deduplicateAndNormalize(nameCollisionBatch, 'palencia');
  dedupName.candidates[0].proposedSlug = 'slug-diferente-pero-mismo-nombre';
  dedupName.candidates[0].classification = 'POSIBLE_ALTA';
  dedupName.candidates[0].approved = true;
  const nameManifest = buildManifest(
    'name_collide.json',
    '{}',
    'palencia',
    dedupName.candidates,
    1,
    0
  );
  const nameResult = await applyManifest(nameManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(nameResult.errors.some((e) => e.includes('Conflicto con censo') && e.includes('El Gatonegro')), 'Detecta coincidencia por nombre contra censo');

  // -------------------------------------------------------------
  // ESCENARIO 17: Protección del local provisional 9999
  // -------------------------------------------------------------
  console.log('\n--- Escenario 17: Inmunidad y protección del local provisional 9999 ---');
  const draftVenueAttack: RawScraperItem[] = [
    {
      placeId: 'ChIJATTACK_9999',
      title: 'Local por verificar (Borrador WhatsApp)',
      city: 'Palencia',
      address: 'Dirección Infiltrada',
    },
  ];
  const dedupDraft = deduplicateAndNormalize(draftVenueAttack, 'palencia');
  dedupDraft.candidates[0].classification = 'POSIBLE_ALTA';
  dedupDraft.candidates[0].approved = true;
  dedupDraft.candidates[0].matchingInternalId = 9999;
  const draftManifest = buildManifest(
    'attack_9999.json',
    JSON.stringify(draftVenueAttack),
    'palencia',
    dedupDraft.candidates,
    1,
    0
  );
  const draftResult = await applyManifest(draftManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(draftResult.errors.length > 0, 'Rechaza intento de sobrescribir local 9999');

  const check9999After = await pool.query('SELECT name FROM venues WHERE id = 9999');
  assert(
    check9999After.rows[0].name === 'Local por verificar (Borrador WhatsApp)',
    'Local 9999 intacto y protegido'
  );

  // -------------------------------------------------------------
  // ESCENARIO 18: Protección contra concurrencia
  // -------------------------------------------------------------
  console.log('\n--- Escenario 18: Bloqueo de concurrencia ---');
  const lockClient = await pool.connect();
  await lockClient.query('BEGIN');
  await lockClient.query(`SELECT pg_try_advisory_xact_lock(hashtext('venue_import_1'))`);

  const concurrentManifest = buildManifest(
    'concurrent.json',
    '{"content": "concurrent"}',
    'palencia',
    [
      {
        ...dedupApproved.candidates[0],
        placeId: 'ChIJCONCURRENT_99',
        proposedSlug: 'slug-concurrent-99',
        classification: 'POSIBLE_ALTA',
        approved: true,
      },
    ],
    1,
    0
  );

  const concurrentResult = await applyManifest(concurrentManifest, pool, { apply: true, citySlug: 'palencia' });
  assert(
    concurrentResult.errors.some((e) => e.includes('concurrencia')),
    'Segunda operación simultánea denegada por bloqueo de concurrencia'
  );

  await lockClient.query('ROLLBACK');
  lockClient.release();

  // -------------------------------------------------------------
  // ESCENARIO 19: Rollback bloqueado ante relaciones posteriores
  // -------------------------------------------------------------
  console.log('\n--- Escenario 19: Rollback bloqueado por relaciones activas ---');
  await pool.query(
    `INSERT INTO events (
      city_id, venue_id, title, category,
      editorial_date, start_time, source_type, status
    ) VALUES (
      1, $1, 'Concierto de Prueba Bloqueo', 'musica',
      CURRENT_DATE, now(), 'admin', 'published'
    )`,
    [newVenueId]
  );

  const blockedRollbackResult = await rollbackBatch(realManifest.batchUuid, pool, { rollback: true });
  assert(blockedRollbackResult.status === 'BLOCKED', 'Rollback denegado (BLOCKED) con eventos asociados');
  assert(blockedRollbackResult.blockingReasons.length > 0, 'Informa motivo del bloqueo (eventos asociados)');

  const checkVenueStillExists = await pool.query('SELECT id FROM venues WHERE id = $1', [newVenueId]);
  assert(checkVenueStillExists.rowCount === 1, 'Local conservado intacto tras bloqueo de rollback');

  await pool.query('DELETE FROM events WHERE venue_id = $1', [newVenueId]);

  // -------------------------------------------------------------
  // ESCENARIO 20: Rollback limpio exitoso
  // -------------------------------------------------------------
  console.log('\n--- Escenario 20: Rollback limpio exitoso ---');
  const dryRollbackResult = await rollbackBatch(realManifest.batchUuid, pool, { rollback: false });
  assert(dryRollbackResult.dryRun === true, 'Modo simulación en rollback por defecto');
  assert(dryRollbackResult.deletedVenueIds.includes(newVenueId), 'Identifica venue a eliminar en simulación');

  const realRollbackResult = await rollbackBatch(realManifest.batchUuid, pool, {
    rollback: true,
    reason: 'Prueba de rollback sintético completada',
  });
  assert(realRollbackResult.status === 'ROLLED_BACK', 'Rollback completado con éxito');
  assert(realRollbackResult.deletedVenueIds.includes(newVenueId), 'Venue ID devuelto como eliminado');

  const checkVenueDeleted = await pool.query('SELECT id FROM venues WHERE id = $1', [newVenueId]);
  assert(checkVenueDeleted.rowCount === 0, 'Local eliminado de tabla venues');

  const checkExtDeleted = await pool.query(
    'SELECT id FROM venue_external_ids WHERE external_id = $1',
    ['ChIJSYNTHETIC_APP_01']
  );
  assert(checkExtDeleted.rowCount === 0, 'Identificador externo eliminado de venue_external_ids');

  const checkBatchStatus = await pool.query(
    'SELECT status, rolled_back_at, rollback_reason FROM venue_import_batches WHERE batch_uuid = $1',
    [realManifest.batchUuid]
  );
  assert(checkBatchStatus.rows[0].status === 'rolled_back', 'Estado del lote actualizado a rolled_back');
  assert(checkBatchStatus.rows[0].rolled_back_at !== null, 'Fecha de rollback registrada');

  // -------------------------------------------------------------
  // ESCENARIO 21: Verificación de preservación final del censo
  // -------------------------------------------------------------
  console.log('\n--- Escenario 21: Integridad final del censo ---');
  const postAllVenuesRes = await pool.query('SELECT COUNT(*) FROM venues');
  const finalVenuesCount = Number(postAllVenuesRes.rows[0].count);
  assert(
    finalVenuesCount === initialVenuesCount,
    `Censo de locales restaurado al estado base (${finalVenuesCount} = ${initialVenuesCount})`
  );

  console.log('\n========================================================');
  console.log(`RESUMEN DE PRUEBAS SINTÉTICAS:`);
  console.log(`  PASADAS: ${testsPassed}`);
  console.log(`  FALLIDAS: ${testsFailed}`);
  console.log('========================================================\n');

  await pool.end();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Error no capturado en suite:', err);
  process.exit(1);
});
