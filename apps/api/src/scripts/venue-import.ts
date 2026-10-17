#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import {
  deduplicateAndNormalize,
  classifyCandidates,
  buildManifest,
  manifestToCsv,
  manifestToMarkdownTable,
  applyManifest,
  rollbackBatch,
  generateFileSha256,
  type ImportManifest,
  type RawScraperItem,
} from '../services/venue-import';

export function redactDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/[^:]+:([^@]+)@/, '://***:***@');
  }
}

export function resolveDbUrl(explicitArg?: string): string | null {
  // Precedencia: 1. Parámetro CLI --db-url, 2. Variable VENUE_IMPORT_DATABASE_URL
  if (explicitArg && explicitArg.trim().length > 0) {
    return explicitArg.trim();
  }
  if (process.env.VENUE_IMPORT_DATABASE_URL && process.env.VENUE_IMPORT_DATABASE_URL.trim().length > 0) {
    return process.env.VENUE_IMPORT_DATABASE_URL.trim();
  }
  return null;
}

export function createDbPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

async function handlePrepare(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      input: { type: 'string', short: 'i' },
      city: { type: 'string', short: 'c', default: 'palencia' },
      'output-dir': { type: 'string', short: 'o', default: 'docs/import-review' },
      'db-url': { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  });

  const inputPath = values.input as string | undefined;
  if (!inputPath) {
    console.error('Error: se requiere --input <ruta-al-json>');
    process.exit(1);
  }

  const resolvedInput = resolve(process.cwd(), inputPath);
  if (!existsSync(resolvedInput)) {
    console.error(`Error: Archivo de entrada no encontrado en: ${resolvedInput}`);
    process.exit(1);
  }

  const targetCitySlug = ((values.city as string) || 'palencia').toLowerCase().trim();
  const outputDir = resolve(process.cwd(), (values['output-dir'] as string) || 'docs/import-review');

  console.log(`[PREPARE] Leyendo dataset desde: ${resolvedInput}`);
  const rawContent = readFileSync(resolvedInput, 'utf-8');
  let rawJson: any;
  try {
    rawJson = JSON.parse(rawContent);
  } catch (err: any) {
    console.error(`Error: Formato JSON inválido en ${resolvedInput}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rawJson)) {
    console.error(`Error: Se esperaba un array de establecimientos en el JSON.`);
    process.exit(1);
  }

  const fileHash = generateFileSha256(rawContent);
  console.log(`[PREPARE] SHA-256 del archivo: ${fileHash}`);
  console.log(`[PREPARE] Registros brutos encontrados: ${rawJson.length}`);

  // Normalization and deduplication
  const dedupResult = deduplicateAndNormalize(rawJson as RawScraperItem[], targetCitySlug);
  console.log(`[PREPARE] Candidatos únicos consolidados: ${dedupResult.candidates.length}`);
  console.log(`[PREPARE] Filas duplicadas absorbidas: ${dedupResult.repeatedRowsAbsorbed}`);

  if (dedupResult.defects.length > 0) {
    console.warn(`[PREPARE] Registros defectuosos detectados: ${dedupResult.defects.length}`);
    for (const d of dedupResult.defects) {
      console.warn(`  - Fila ${d.row}: ${d.reason}`);
    }
  }

  // Database comparison if db is available
  let pool: Pool | undefined;
  let targetCityId: number | undefined;
  const dbUrl = resolveDbUrl(values['db-url'] as string | undefined);

  if (dbUrl) {
    console.log(`[PREPARE] Destino de BD: ${redactDbUrl(dbUrl)}`);
    try {
      pool = createDbPool(dbUrl);
      const cityRes = await pool.query('SELECT id, slug FROM cities WHERE LOWER(slug) = $1', [
        targetCitySlug,
      ]);
      if (cityRes.rowCount && cityRes.rowCount > 0) {
        targetCityId = cityRes.rows[0].id;
        console.log(`[PREPARE] Conectado a BD. Ciudad "${targetCitySlug}" identificada con ID ${targetCityId}.`);
      } else {
        console.warn(`[PREPARE] Aviso: Ciudad "${targetCitySlug}" no encontrada en la BD.`);
      }
    } catch (err: any) {
      console.warn(`[PREPARE] Aviso: No se pudo conectar a BD (${err.message}). Clasificación sin verificación de censo.`);
      pool = undefined;
    }
  } else {
    console.log('[PREPARE] Sin conexión a BD configurada (--db-url o VENUE_IMPORT_DATABASE_URL no especificados).');
    console.log('[PREPARE] Candidatos no contrastados contra el censo se clasificarán como PENDIENTE_COMPARACION.');
  }

  // Classification
  await classifyCandidates(dedupResult.candidates, {
    targetCitySlug,
    targetCityId,
    db: pool,
  });

  if (pool) {
    await pool.end();
  }

  // Build Manifest
  const manifest = buildManifest(
    inputPath,
    rawContent,
    targetCitySlug,
    dedupResult.candidates,
    rawJson.length,
    dedupResult.repeatedRowsAbsorbed
  );

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const manifestJsonPath = resolve(outputDir, 'manifest.json');
  const manifestCsvPath = resolve(outputDir, 'manifest.csv');
  const manifestMdPath = resolve(outputDir, 'manifest.md');

  writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2), 'utf-8');
  writeFileSync(manifestCsvPath, manifestToCsv(manifest), 'utf-8');
  writeFileSync(
    manifestMdPath,
    `# Manifiesto de Importación - ${manifest.citySlug.toUpperCase()}\n\n` +
      `- **Batch UUID**: \`${manifest.batchUuid}\`\n` +
      `- **Archivo fuente**: \`${manifest.sourceFile}\`\n` +
      `- **Hash SHA-256**: \`${manifest.sourceFileHash}\`\n` +
      `- **Fecha**: ${manifest.generatedAt}\n` +
      `- **Registros brutos**: ${manifest.totalRawRecords}\n` +
      `- **Candidatos únicos**: ${manifest.totalConsolidatedCandidates}\n` +
      `- **Filas repetidas absorbidas**: ${manifest.repeatedRowsAbsorbed}\n\n` +
      `### Resumen por Clasificación\n\n` +
      Object.entries(manifest.summaryByClassification)
        .map(([k, v]) => `- **${k}**: ${v}`)
        .join('\n') +
      `\n\n### Tabla de Candidatos\n\n` +
      manifestToMarkdownTable(manifest) +
      '\n',
    'utf-8'
  );

  console.log(`\n[PREPARE] ✅ Manifiesto generado con éxito en:`);
  console.log(`  - JSON: ${manifestJsonPath}`);
  console.log(`  - CSV:  ${manifestCsvPath}`);
  console.log(`  - MD:   ${manifestMdPath}`);
  console.log(`\nResumen de clasificaciones:`);
  for (const [k, v] of Object.entries(manifest.summaryByClassification)) {
    console.log(`  ${k}: ${v}`);
  }
}

async function handleApply(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      manifest: { type: 'string', short: 'm' },
      apply: { type: 'boolean', default: false },
      'db-url': { type: 'string' },
      city: { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  });

  const manifestPath = values.manifest as string | undefined;
  if (!manifestPath) {
    console.error('Error: se requiere --manifest <ruta-al-manifest.json>');
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), manifestPath);
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Archivo de manifiesto no encontrado en: ${resolvedPath}`);
    process.exit(1);
  }

  const manifest: ImportManifest = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
  const dbUrl = resolveDbUrl(values['db-url'] as string | undefined);
  if (!dbUrl) {
    console.error(
      'Error: Destino de base de datos obligatorio. Proporcione --db-url <url> o configure la variable VENUE_IMPORT_DATABASE_URL.'
    );
    process.exit(1);
  }

  const isRealApply = Boolean(values.apply);
  console.log(`[APPLY] Destino de BD: ${redactDbUrl(dbUrl)}`);
  console.log(`[APPLY] Modo: ${isRealApply ? 'APLICACIÓN REAL (--apply)' : 'SIMULACIÓN (DRY-RUN)'}`);

  const pool = createDbPool(dbUrl);

  try {
    const result = await applyManifest(manifest, pool, {
      apply: isRealApply,
      citySlug: values.city as string | undefined,
    });

    console.log(`\n--- RESULTADO DE LA EJECUCIÓN ---`);
    console.log(`Batch UUID:       ${result.batchUuid}`);
    console.log(`Ciudad:           ${result.citySlug} (ID: ${result.cityId})`);
    console.log(`Modo:             ${result.dryRun ? 'DRY-RUN (Simulación sin cambios)' : 'ESCRITURA REAL'}`);
    console.log(`Total candidatos: ${result.totalInManifest}`);
    console.log(`Aprobados:        ${result.approvedCount}`);
    console.log(`Aplicados:        ${result.appliedCount}`);

    if (result.createdVenueIds.length > 0) {
      console.log(`IDs creados:      ${result.createdVenueIds.join(', ')}`);
    }

    if (result.warnings.length > 0) {
      console.log(`Advertencias:`);
      result.warnings.forEach((w) => console.log(`  - ${w}`));
    }

    if (result.errors.length > 0) {
      console.error(`Errores:`);
      result.errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

async function handleRollback(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'batch-uuid': { type: 'string', short: 'b' },
      rollback: { type: 'boolean', default: false },
      reason: { type: 'string' },
      'db-url': { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  });

  const batchUuid = values['batch-uuid'] as string | undefined;
  if (!batchUuid) {
    console.error('Error: se requiere --batch-uuid <uuid>');
    process.exit(1);
  }

  const dbUrl = resolveDbUrl(values['db-url'] as string | undefined);
  if (!dbUrl) {
    console.error(
      'Error: Destino de base de datos obligatorio. Proporcione --db-url <url> o configure la variable VENUE_IMPORT_DATABASE_URL.'
    );
    process.exit(1);
  }

  const isRealRollback = Boolean(values.rollback);
  console.log(`[ROLLBACK] Destino de BD: ${redactDbUrl(dbUrl)}`);
  console.log(`[ROLLBACK] Modo: ${isRealRollback ? 'REVERSIÓN REAL (--rollback)' : 'SIMULACIÓN (DRY-RUN)'}`);

  const pool = createDbPool(dbUrl);

  try {
    const result = await rollbackBatch(batchUuid, pool, {
      rollback: isRealRollback,
      reason: values.reason as string | undefined,
    });

    console.log(`\n--- RESULTADO DEL ROLLBACK ---`);
    console.log(`Batch UUID:       ${result.batchUuid}`);
    console.log(`Estado:           ${result.status}`);
    console.log(`Modo:             ${result.dryRun ? 'DRY-RUN' : 'REVERSIÓN APLICADA'}`);
    console.log(`Mensaje:          ${result.message}`);

    if (result.deletedVenueIds.length > 0) {
      console.log(`Locales eliminados: ${result.deletedVenueIds.join(', ')}`);
    }

    if (result.blockingReasons.length > 0) {
      console.warn(`Motivos de bloqueo:`);
      result.blockingReasons.forEach((r) => console.warn(`  - ${r}`));
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (command === 'prepare') {
    await handlePrepare(commandArgs);
  } else if (command === 'apply') {
    await handleApply(commandArgs);
  } else if (command === 'rollback') {
    await handleRollback(commandArgs);
  } else {
    console.log(`Uso: bun run apps/api/src/scripts/venue-import.ts <comando> [opciones]

Comandos disponibles:
  prepare   Lee el JSON, normaliza, deduplica, compara con censo y genera manifiesto.
            Opciones:
              --input, -i       Ruta al archivo JSON de entrada (Requerido)
              --city, -c        Slug de la ciudad (por defecto: palencia)
              --output-dir, -o  Directorio para manifiesto y reportes (por defecto: docs/import-review)
              --db-url          URL de base de datos para verificación contra censo (opcional)

  apply     Aplica los candidatos aprobados de un manifiesto en la base de datos.
            Opciones:
              --manifest, -m    Ruta al archivo manifest.json (Requerido)
              --apply           Aplica los cambios en BD de forma definitiva (por defecto: simulación)
              --city            Slug de la ciudad (opcional, debe coincidir con manifiesto)
              --db-url          URL de base de datos (Requerido si no existe VENUE_IMPORT_DATABASE_URL)

  rollback  Revierte una importación aplicada de forma segura y transaccional.
            Opciones:
              --batch-uuid, -b  UUID del lote a revertir (Requerido)
              --rollback        Ejecuta la reversión física (por defecto: simulación)
              --reason          Motivo de la reversión
              --db-url          URL de base de datos (Requerido si no existe VENUE_IMPORT_DATABASE_URL)

Configuración de conexión y precedencia:
  1. Flag explícito --db-url <url>
  2. Variable de entorno VENUE_IMPORT_DATABASE_URL
  (Sin valores por defecto ni fallbacks genéricos a producción).
`);
    process.exit(1);
  }
}

const isDirectRun = Boolean(
  process.argv[1] && (process.argv[1].endsWith('/venue-import.ts') || process.argv[1].endsWith('/venue-import.js') || process.argv[1].endsWith('venue-import.ts'))
);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`Error fatal: ${err.message || String(err)}`);
    process.exit(1);
  });
}
