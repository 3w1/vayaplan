/**
 * VayaPlan — Herramienta Puntual de Auditoría: Ingesta Unitaria Controlada de Bar Salvaje (Fuente ID 1)
 *
 * NOTA DE SEGURIDAD:
 * Este script es una herramienta auxiliar puntual de auditoría para ejecutar una única ingesta real
 * controlada reutilizando el pipeline principal (runInstagramIngestion) con overrides temporales.
 *
 * Protecciones:
 * 1. Guard de módulo (import.meta.main): Nunca se ejecuta accidentalmente al importarlo o al escanear tests.
 * 2. Confirmación explícita requerida: Exige el argumento '--execute' en la línea de comandos para correr.
 * 3. No duplica lógica: Reutiliza locks, clasificación, subida de imágenes, persistencia y deduplicación.
 */

import { readFileSync, existsSync } from 'fs';
import { runInstagramIngestion } from './instagram-ingestion-service';

export async function runControlledSalvajeCli(args: string[] = process.argv): Promise<void> {
  const isExplicitExecution = args.includes('--execute') || args.includes('--execute-salvaje');

  if (!isExplicitExecution) {
    console.log('--------------------------------------------------------------------------------');
    console.log('[ADVERTENCIA] Herramienta puntual de auditoría para Bar Salvaje (Fuente ID 1).');
    console.log('Para evitar ejecuciones accidentales, se requiere el flag explícito: --execute');
    console.log('Uso:');
    console.log('  bun apps/api/src/services/bar-instagram-import/run-salvaje-ingestion.ts --execute');
    console.log('--------------------------------------------------------------------------------');
    return;
  }

  // 1. Cargar variables de entorno de infra/.env si existen
  if (existsSync('infra/.env')) {
    const envContent = readFileSync('infra/.env', 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }

  // 2. Normalizar conexión a DB si se ejecuta desde host
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@db:')) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@db:', '@172.20.0.3:');
  }

  console.log('=== INICIANDO AUDITORÍA CONTROLADA: BAR SALVAJE (FUENTE ID 1) ===');
  console.log('Inicio:', new Date().toISOString());
  console.log('Parámetros efectivos: limit=3, includeReels=false (override temporal)');

  const report = await runInstagramIngestion({
    sourceIds: [1],
    executionType: 'manual_single',
    overridePostsLimit: 3,
    overrideIncludeReels: false,
  });

  console.log('\n=== REPORTE DE EJECUCIÓN ===');
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  runControlledSalvajeCli().catch((err) => {
    console.error('Error durante la ejecución controlada de Bar Salvaje:', err);
    process.exit(1);
  });
}
