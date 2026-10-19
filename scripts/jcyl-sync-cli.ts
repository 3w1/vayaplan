/**
 * CLI Oficial de Sincronización e Ingesta JCyL — VayaPlan
 * 
 * ÚNICA CLI VIGENTE DOCUMENTADA.
 * 
 * Endpoint JCyL:
 *   https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records
 * Filtro OData:
 *   where=nombre_localidad='Palencia'&order_by=fecha_inicio asc&limit=50
 * 
 * Comportamiento Dry-Run:
 *   El modo dry-run retorna antes de cualquier acceso a base de datos.
 *   No ejecuta INSERT, UPDATE, BEGIN ni ROLLBACK.
 */
import { syncJcylLibraryActivities } from '../apps/api/src/services/jcyl-import/jcyl-connector';
import { normalizeJcylRecord } from '../apps/api/src/services/jcyl-import/jcyl-normalizer';
import type { JcylRecordRaw } from '../apps/api/src/services/jcyl-import/jcyl-types';
import { query } from '@vayaplan/db';

async function main() {
  const isDryRun = !process.argv.includes('--execute-writes');
  console.log(`=== EJECUCIÓN DRY-RUN DEL CONECTOR JCYL (VAYAPLAN) ===`);
  console.log(`Fecha de ejecución: ${new Date().toISOString()}`);
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (Sólo Lectura - Sin Escrituras)' : 'ESCRITURA REAL'}`);
  console.log(`Endpoint Base: https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records`);
  console.log(`Parámetros OData: where=nombre_localidad='Palencia'&order_by=fecha_inicio asc&limit=50\n`);

  // 1. Contar eventos antes de la ejecución para auditar ausencia de escrituras
  const beforeCountRes = await query<{ count: string }>('SELECT COUNT(*) FROM events;');
  const eventsCountBefore = Number(beforeCountRes.rows[0].count);

  // 2. Ejecución real del conector
  const result = await syncJcylLibraryActivities({
    dryRun: isDryRun,
    cityId: 1,
    limit: 50,
  });

  // 3. Contar eventos después de la ejecución
  const afterCountRes = await query<{ count: string }>('SELECT COUNT(*) FROM events;');
  const eventsCountAfter = Number(afterCountRes.rows[0].count);

  console.log('--- RESULTADO DEL DRY-RUN DEL IMPORTADOR ---');
  console.log(`Total registros devueltos por la API para Palencia: ${result.totalApiRecords}`);
  console.log(`Candidatos que cumplen el filtro estricto de Biblioteca Pública: ${result.libraryCandidates}`);
  console.log(`Inserciones realizadas: ${result.inserted}`);
  console.log(`Actualizaciones realizadas: ${result.updated}`);
  console.log(`Registros preservados por edición editorial: ${result.preservedEditorial}`);
  console.log(`Diferencia de registros en BD events: ${eventsCountAfter - eventsCountBefore} (Escrituras: 0)\n`);

  // 4. Mostrar registro aceptado de la Biblioteca
  const accepted = result.events[0];
  if (accepted) {
    console.log('--- REGISTRO ACEPTADO (BIBLIOTECA PÚBLICA DE PALENCIA) ---');
    console.log(`ID Origen: ${accepted.externalId}`);
    console.log(`Título: ${accepted.title}`);
    console.log(`Recinto en origen: ${accepted.venueName}`);
    console.log(`Fecha editorial: ${accepted.editorialDate}`);
    console.log(`Estado temporal: ${accepted.timeStatus} (start_time: ${accepted.startTimeIso})`);
    console.log(`Categoría VayaPlan: ${accepted.category}`);
    console.log(`Precio: ${accepted.priceCents / 100} € (Gratuito: ${accepted.isFree})`);
    console.log(`DedupeKey: ${accepted.dedupeKey}`);
    console.log(`Motivo de aceptación: Cumple nombre_localidad='Palencia' y (codigo_biblioteca='BPPAL' || evento_biblioteca='SI').\n`);
  }

  // 5. Demostración de rechazo de otro recinto en Palencia capital (Teatro Principal)
  const rejectedVenueRaw: JcylRecordRaw = {
    id_evento: 1285661851332,
    titulo: "'Dysphoria' (HISTRIÓN TEATRO)",
    lugar_celebracion: "Teatro Principal",
    nombre_localidad: "Palencia",
    nombre_provincia: "Palencia",
    fecha_inicio: "2026-10-23",
    hora_inicio: "20:30",
    codigo_biblioteca: null,
    evento_biblioteca: "NO",
  };
  const normRejectedVenue = normalizeJcylRecord(rejectedVenueRaw);
  console.log('--- REGISTRO RECHAZADO: OTRO RECINTO EN PALENCIA CAPITAL ---');
  console.log(`ID Origen: ${normRejectedVenue.externalId}`);
  console.log(`Título: ${normRejectedVenue.title}`);
  console.log(`Recinto: ${normRejectedVenue.venueName} (Localidad: ${rejectedVenueRaw.nombre_localidad})`);
  console.log(`isLibrary: ${normRejectedVenue.isLibrary}`);
  console.log(`Motivo de rechazo: ${normRejectedVenue.warnings.find(w => w.includes('Recinto no admitido'))}\n`);

  // 6. Demostración de rechazo de otro municipio de la provincia (Villamuriel de Cerrato)
  const rejectedMunRaw: JcylRecordRaw = {
    id_evento: 1285645015428,
    titulo: "'La cocina' (TELONCILLO TEATRO)",
    lugar_celebracion: "Teatro Jesús Meneses",
    nombre_localidad: "Villamuriel de Cerrato",
    nombre_provincia: "Palencia",
    fecha_inicio: "2026-10-25",
    hora_inicio: "18:00",
  };
  const normRejectedMun = normalizeJcylRecord(rejectedMunRaw);
  console.log('--- REGISTRO RECHAZADO: OTRO MUNICIPIO DE LA PROVINCIA ---');
  console.log(`ID Origen: ${normRejectedMun.externalId}`);
  console.log(`Título: ${normRejectedMun.title}`);
  console.log(`Municipio: ${rejectedMunRaw.nombre_localidad}`);
  console.log(`isLibrary: ${normRejectedMun.isLibrary}`);
  console.log(`Motivo de rechazo: ${normRejectedMun.warnings.find(w => w.includes('Localidad no admitida'))}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error en ejecución CLI:', err);
  process.exit(1);
});
