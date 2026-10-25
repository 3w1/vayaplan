/**
 * VayaPlan — Adaptador de Ingesta Unitaria Controlada: Bar Salvaje (Fuente ID 1)
 *
 * Ejecuta una única ingesta real de Salvaje reutilizando el importer existente,
 * con override temporal a máximo 3 posts y sin Reels, sin modificar la
 * configuración persistente en base de datos.
 */

import { readFileSync, existsSync } from 'fs';
import { runInstagramIngestion } from './instagram-ingestion-service';

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

console.log('=== INICIANDO VERIFICACIÓN REAL CONTROLADA: BAR SALVAJE (FUENTE ID 1) ===');
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

process.exit(report.errors.length > 0 ? 1 : 0);
