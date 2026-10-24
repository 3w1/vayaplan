/**
 * VayaPlan — Script de Ejecución del Piloto Ateneo de Palencia
 *
 * Ejecuta la ingesta controlada de máximo 5 eventos del Ateneo de Palencia.
 * Descarga las imágenes oficiales, las sube a Cloudflare R2 y crea propuestas
 * en curation_proposals bajo lock persistente.
 */

import { readFileSync, existsSync } from 'fs';
import { runAteneoPilotIngestion } from './ateneo-importer';

// Cargar variables de infra/.env si no están presentes
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

// Normalizar host de base de datos si se ejecuta en host fuera de red docker
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@db:')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@db:', '@172.20.0.3:');
}

console.log('=== INICIANDO PILOTO DE INGESTA: ATENEO DE PALENCIA (MÁXIMO 5 EVENTOS) ===');
console.log('Inicio:', new Date().toISOString());

const report = await runAteneoPilotIngestion({ maxItems: 5 });

console.log('=== PILOTO COMPLETADO ===');
console.log(JSON.stringify(report, null, 2));
process.exit(0);
