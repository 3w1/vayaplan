import type { Pool, PoolClient } from 'pg';
import type { ImportManifest, ApplyResult, NormalizedCandidate } from './types';

export interface ApplyOptions {
  apply: boolean;
  citySlug?: string;
}

export async function applyManifest(
  manifest: ImportManifest,
  db: Pool | PoolClient,
  options: ApplyOptions
): Promise<ApplyResult> {
  const isDryRun = !options.apply;
  const targetCitySlug = (options.citySlug || manifest.citySlug).toLowerCase().trim();

  const result: ApplyResult = {
    batchUuid: manifest.batchUuid,
    citySlug: targetCitySlug,
    cityId: 0,
    dryRun: isDryRun,
    totalInManifest: manifest.candidates.length,
    approvedCount: 0,
    appliedCount: 0,
    createdVenueIds: [],
    warnings: [],
    errors: [],
  };

  // 1. Verify city
  const cityRes = await db.query('SELECT id, slug FROM cities WHERE LOWER(slug) = $1', [
    targetCitySlug,
  ]);
  if (cityRes.rowCount === 0) {
    result.errors.push(`Ciudad con slug "${targetCitySlug}" no existe en la base de datos.`);
    return result;
  }
  const cityId = cityRes.rows[0].id;
  result.cityId = cityId;

  if (manifest.citySlug.toLowerCase().trim() !== targetCitySlug) {
    result.errors.push(
      `Discrepancia de ciudad: manifiesto indica "${manifest.citySlug}" pero se solicitó "${targetCitySlug}".`
    );
    return result;
  }

  // 2. Filter approved candidates
  const approvedCandidates = manifest.candidates.filter((c) => c.approved === true);
  result.approvedCount = approvedCandidates.length;

  if (approvedCandidates.length === 0) {
    result.warnings.push('No hay ningún candidato marcado con "approved: true". Ninguna acción ejecutada.');
    return result;
  }

  // 3. Acquire client for transaction & concurrency lock
  let client: PoolClient;
  let shouldRelease = false;

  if ('connect' in db && typeof (db as Pool).connect === 'function') {
    client = await (db as Pool).connect();
    shouldRelease = true;
  } else {
    client = db as PoolClient;
  }

  try {
    await client.query('BEGIN');

    // Concurrency protection: advisory xact lock based on city_id (protects entire city from concurrent imports)
    const lockRes = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext('venue_import_' || $1::text)) AS locked`,
      [cityId]
    );
    if (!lockRes.rows[0]?.locked) {
      throw new Error(`Bloqueo de concurrencia activo: otra importación se está ejecutando para la ciudad ID ${cityId}.`);
    }

    // Check re-run protection: hash check
    const hashCheck = await client.query(
      `SELECT batch_uuid, applied_at FROM venue_import_batches WHERE source_file_hash = $1 AND status = 'applied'`,
      [manifest.sourceFileHash]
    );
    if (hashCheck.rowCount && hashCheck.rowCount > 0) {
      throw new Error(
        `Lote duplicado: el archivo (hash ${manifest.sourceFileHash}) ya fue aplicado con anterioridad en el lote ${hashCheck.rows[0].batch_uuid} (${hashCheck.rows[0].applied_at}). Reviértalo primero si desea reimportar.`
      );
    }

    // 4. Intra-manifest validation among approved candidates
    const seenCandidateIds = new Set<string>();
    const seenExternalIds = new Set<string>();
    const seenSlugs = new Set<string>();

    for (const cand of approvedCandidates) {
      // Classification check: only POSIBLE_ALTA can be approved
      if (cand.classification !== 'POSIBLE_ALTA') {
        throw new Error(
          `Candidato ${cand.candidateId} ("${cand.proposedName}") marcado como aprobado con clasificación no permitida "${cand.classification}". Solo se autoriza la importación de candidatos con clasificación POSIBLE_ALTA.`
        );
      }

      // Repeated candidateId within manifest
      if (seenCandidateIds.has(cand.candidateId)) {
        throw new Error(`Identificador de candidato repetido en el manifiesto: ${cand.candidateId}.`);
      }
      seenCandidateIds.add(cand.candidateId);

      // Repeated externalId within manifest
      const extKey = `google_maps:${cand.placeId}`;
      if (seenExternalIds.has(extKey)) {
        throw new Error(`Identificador externo repetido en el manifiesto: ${cand.placeId} (${cand.candidateId}).`);
      }
      seenExternalIds.add(extKey);

      // Repeated slug within manifest for the same city
      if (seenSlugs.has(cand.proposedSlug)) {
        throw new Error(`Slug "${cand.proposedSlug}" duplicado entre candidatos aprobados a insertar en el manifiesto.`);
      }
      seenSlugs.add(cand.proposedSlug);

      // City consistency check
      const candCity = (cand.cityOriginal || '').toLowerCase().trim();
      if (
        candCity &&
        candCity !== targetCitySlug &&
        !candCity.includes(targetCitySlug) &&
        !cand.addressOriginal.toLowerCase().includes(targetCitySlug)
      ) {
        throw new Error(
          `Inconsistencia de ciudad: el candidato ${cand.candidateId} pertenece a "${cand.cityOriginal}", pero el destino del manifiesto es "${targetCitySlug}".`
        );
      }
    }

    // 5. Pre-flight checks on DB state (revalidating against census)
    for (const cand of approvedCandidates) {
      // Protect venue 9999
      if (cand.matchingInternalId === 9999 || cand.proposedSlug === 'local-por-verificar-borrador') {
        throw new Error(`Violación de seguridad: intento de sobrescribir o vincular el local provisional 9999.`);
      }

      // Check placeId in external_ids
      const extCheck = await client.query(
        `SELECT venue_id FROM venue_external_ids WHERE provider = 'google_maps' AND external_id = $1`,
        [cand.placeId]
      );
      if (extCheck.rowCount && extCheck.rowCount > 0) {
        throw new Error(
          `Candidato ${cand.candidateId} ("${cand.proposedName}") ya existe en venue_external_ids con placeId ${cand.placeId} (venue_id: ${extCheck.rows[0].venue_id}).`
        );
      }

      // Check slug collision in venues
      const slugCheck = await client.query(
        `SELECT id, name FROM venues WHERE city_id = $1 AND slug = $2`,
        [cityId, cand.proposedSlug]
      );
      if (slugCheck.rowCount && slugCheck.rowCount > 0) {
        throw new Error(
          `Conflicto de slug: "${cand.proposedSlug}" para candidato ${cand.candidateId} ya existe en venues (id: ${slugCheck.rows[0].id}, "${slugCheck.rows[0].name}"). No se admiten sufijos automáticos sin revisión humana.`
        );
      }

      // Check name collision in venues
      const nameCheck = await client.query(
        `SELECT id, name FROM venues WHERE city_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
        [cityId, cand.proposedName]
      );
      if (nameCheck.rowCount && nameCheck.rowCount > 0) {
        throw new Error(
          `Conflicto con censo: "${cand.proposedName}" (${cand.candidateId}) coincide por nombre con el local existente ID ${nameCheck.rows[0].id} ("${nameCheck.rows[0].name}").`
        );
      }
    }

    // If dry run, we simulate and rollback
    if (isDryRun) {
      await client.query('ROLLBACK');
      result.warnings.push('Modo simulación (DRY-RUN). No se han persistido cambios en la base de datos.');
      result.appliedCount = approvedCandidates.length;
      return result;
    }

    // --- EXECUTE APPLICATION (WRITE) ---

    // 1. Create batch record
    const batchInsertRes = await client.query(
      `INSERT INTO venue_import_batches (
        batch_uuid, city_id, source_file_name, source_file_hash,
        status, total_candidates, applied_count, created_venue_ids,
        manifest_snapshot, applied_at
      ) VALUES ($1, $2, $3, $4, 'applied', $5, 0, '{}', $6, now())
      RETURNING id`,
      [
        manifest.batchUuid,
        cityId,
        manifest.sourceFile,
        manifest.sourceFileHash,
        manifest.candidates.length,
        JSON.stringify(manifest),
      ]
    );
    const batchDbId = batchInsertRes.rows[0].id;

    const createdIds: number[] = [];

    // 2. Insert each approved venue and external_id
    for (const cand of approvedCandidates) {
      const venueInsertRes = await client.query(
        `INSERT INTO venues (
          city_id, name, slug, address, latitude, longitude,
          google_maps_url, instagram_handle, website_url, is_active,
          zone, category, phone, whatsapp_contact
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, NULL
        ) RETURNING id`,
        [
          cityId,
          cand.proposedName,
          cand.proposedSlug,
          cand.addressOriginal || null,
          cand.latitude,
          cand.longitude,
          cand.googleMapsUrl || null,
          cand.instagramHandle || null,
          cand.websiteOwn || null,
          cand.isActive !== false,
          cand.proposedZone || null,
          cand.proposedCategory || 'general',
          cand.phoneUnformatted || cand.phoneOriginal || null,
        ]
      );

      const newVenueId = venueInsertRes.rows[0].id;
      createdIds.push(newVenueId);

      // Insert external_id mapping
      await client.query(
        `INSERT INTO venue_external_ids (
          venue_id, provider, external_id, batch_id
        ) VALUES ($1, 'google_maps', $2, $3)`,
        [newVenueId, cand.placeId, batchDbId]
      );
    }

    // 3. Update batch with created venue IDs and applied count
    await client.query(
      `UPDATE venue_import_batches
       SET created_venue_ids = $1, applied_count = $2
       WHERE id = $3`,
      [createdIds, createdIds.length, batchDbId]
    );

    await client.query('COMMIT');

    result.appliedCount = createdIds.length;
    result.createdVenueIds = createdIds;
    return result;
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    result.errors.push(err.message || String(err));
    return result;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}
