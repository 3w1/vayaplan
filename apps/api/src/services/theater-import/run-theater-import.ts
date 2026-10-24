import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { TheaterImporter } from './theater-importer';
import type { TheaterImportReport } from './theater-types';

/**
 * Runner ejecutable para la importación editorial en modo propuesta / dry-run
 * de obras de teatro del Teatro Principal de Palencia.
 */
export async function runTheaterImportManual(
  dryRun = true
): Promise<TheaterImportReport> {
  // 1. Obtener recintos actuales desde PostgreSQL
  let existingVenues: Array<{ id: number; name: string; slug: string }> = [];
  try {
    const venuesRaw = execSync(
      `docker exec -i vayaplan_postgres psql -U vayaplan_user -d vayaplan -t -A -F "|||" -c "SELECT id, name, slug FROM venues;"`,
      { encoding: 'utf-8' }
    );
    existingVenues = venuesRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, name, slug] = line.split('|||');
        return { id: Number(id), name, slug };
      });
  } catch (err: any) {
    console.warn('Advertencia al consultar venues de PostgreSQL:', err.message);
  }

  // 2. Obtener eventos actuales desde PostgreSQL
  let existingEvents: Array<{
    id: number;
    dedupeKey: string | null;
    title: string;
    editorialDate: string;
    venueId: number | null;
    status: string;
  }> = [];
  try {
    const eventsRaw = execSync(
      `docker exec -i vayaplan_postgres psql -U vayaplan_user -d vayaplan -t -A -F "|||" -c "SELECT id, dedupe_key, title, editorial_date, venue_id, status FROM events;"`,
      { encoding: 'utf-8' }
    );
    existingEvents = eventsRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, dedupeKey, title, editorialDate, venueId, status] =
          line.split('|||');
        return {
          id: Number(id),
          dedupeKey: dedupeKey || null,
          title,
          editorialDate,
          venueId: venueId ? Number(venueId) : null,
          status,
        };
      });
  } catch (err: any) {
    console.warn('Advertencia al consultar eventos de PostgreSQL:', err.message);
  }

  // 3. Función fetch resiliente con soporte de fallback local a scratch/
  const resilientFetch: typeof fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    // Si coincide con páginas de búsqueda y existen en scratch, o intentar red primero
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (networkErr) {
      // Fallback a archivos locales en scratch si la red no responde o timeout
      const pageMatch = urlStr.match(/pagina=([0-9]+)/);
      if (pageMatch) {
        const pNum = pageMatch[1];
        const localPath = `/root/vayaplan/scratch/teatro_busqueda_p${pNum}.html`;
        if (existsSync(localPath)) {
          const content = readFileSync(localPath, 'utf-8');
          return new Response(content, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }

      // Fallback a páginas de detalle
      if (urlStr.includes('/productos/descripcion/')) {
        const slug = urlStr.split('/productos/descripcion/')[1];
        const detailFiles = [
          `/root/vayaplan/scratch/teatro_details/03_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/04_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/05_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/08_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/09_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/11_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/13_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/17_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/19_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/20_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/21_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/22_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/23_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/24_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/25_${slug}.html`,
          `/root/vayaplan/scratch/teatro_details/26_${slug}.html`,
        ];
        for (const df of detailFiles) {
          if (existsSync(df)) {
            const content = readFileSync(df, 'utf-8');
            return new Response(content, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
        }
      }

      throw networkErr;
    }
  };

  // 4. Instanciar e invocar el importador
  const importer = new TheaterImporter(existingEvents, existingVenues);
  const report = await importer.runImport({
    dryRun,
    fetchFn: resilientFetch,
  });

  return report;
}

if (import.meta.main) {
  runTheaterImportManual(true)
    .then((report) => {
      console.log(
        '=== INFORME DE EJECUCIÓN — FUENTE EDITORIAL TEATRO PRINCIPAL (MODO DRY-RUN) ==='
      );
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Error al ejecutar importador teatral:', err);
      process.exit(1);
    });
}
