import { appendFileSync, mkdirSync } from 'node:fs';
import { runSportsImportManual } from './run-sports-import';
import type { SportsImportReport } from './sports-types';

const AUDIT_DIR = '/root/vayaplan/output';
const AUDIT_FILE = `${AUDIT_DIR}/sports-import-audit.jsonl`;
mkdirSync(AUDIT_DIR, { recursive: true });

export interface ScheduledRunnerConfig {
  dryRun: boolean; // Siempre true por defecto (modo propuesta)
  timeoutMsPerSource: number; // 15000 ms
  delayMsBetweenRequests: number; // 1000 ms
  maxRetries: number; // 2
}

export const DEFAULT_SCHEDULED_CONFIG: ScheduledRunnerConfig = {
  dryRun: true,
  timeoutMsPerSource: 15000,
  delayMsBetweenRequests: 1000,
  maxRetries: 2,
};

let runnerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Ejecuta un ciclo del importador deportivo programado
 */
export async function executeScheduledSportsImportCycle(
  config: ScheduledRunnerConfig = DEFAULT_SCHEDULED_CONFIG
): Promise<SportsImportReport> {
  const startedIso = new Date().toISOString();
  console.log(
    JSON.stringify({
      timestamp: startedIso,
      level: 'info',
      service: 'sports_scheduled_runner',
      message: 'Iniciando ciclo programado del importador deportivo (modo propuesta / dry-run)',
      config,
    })
  );

  let attempt = 0;
  let report: SportsImportReport | null = null;
  let lastError: any = null;

  while (attempt <= config.maxRetries) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            service: 'sports_scheduled_runner',
            message: `Reintento ${attempt}/${config.maxRetries} tras fallo. Esperando ${backoffMs}ms...`,
          })
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }

      report = await runSportsImportManual(config.dryRun);
      break;
    } catch (err: any) {
      lastError = err;
      attempt++;
    }
  }

  if (!report) {
    const errorReport = {
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'sports_scheduled_runner',
      message: 'Ciclo programado falló tras agotar los reintentos',
      error: lastError?.message || String(lastError),
    };
    console.error(JSON.stringify(errorReport));
    throw lastError;
  }

  // Registrar en el archivo de auditoría local (JSONL)
  try {
    const auditRecord = {
      executionId: report.executionId,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      dryRun: report.dryRun,
      sourcesReviewed: report.sourcesReviewed,
      rawExtracted: report.totalRawEventsExtracted,
      proposedCount: report.newProposedEventsCount,
      duplicatesIgnored: report.duplicatesIgnoredCount,
      changesDetected: report.changesDetectedCount,
      proposedVenuesCount: report.proposedNewVenues.length,
      errorsCount: report.errors.length,
    };
    appendFileSync(AUDIT_FILE, JSON.stringify(auditRecord) + '\n', 'utf-8');
  } catch (err) {
    console.warn('No se pudo guardar la línea de auditoría en', AUDIT_FILE, err);
  }

  console.log(
    JSON.stringify({
      timestamp: report.completedAt,
      level: 'info',
      service: 'sports_scheduled_runner',
      message: 'Ciclo programado finalizado exitosamente (modo propuesta)',
      summary: {
        executionId: report.executionId,
        sourcesReviewed: report.sourcesReviewed.length,
        newProposedEvents: report.newProposedEventsCount,
        duplicatesIgnored: report.duplicatesIgnoredCount,
        changesDetected: report.changesDetectedCount,
        proposedNewVenues: report.proposedNewVenues.length,
        errors: report.errors.length,
      },
    })
  );

  return report;
}

/**
 * Inicia el temporizador programado (cada 6 horas = 21,600,000 ms)
 */
export function startSportsScheduledRunner(intervalMs = 6 * 3600 * 1000): void {
  if (runnerTimer) return;

  // Ejecución inicial diferida
  setTimeout(() => {
    executeScheduledSportsImportCycle().catch(() => {});
  }, 2000);

  runnerTimer = setInterval(() => {
    executeScheduledSportsImportCycle().catch(() => {});
  }, intervalMs);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'sports_scheduled_runner',
      message: `Runner de importación deportiva programado con intervalo de ${intervalMs / 1000}s (cada 6h).`,
    })
  );
}

export function stopSportsScheduledRunner(): void {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
}

if (import.meta.main) {
  executeScheduledSportsImportCycle()
    .then((report) => {
      console.log('✓ Ciclo de prueba ejecutado correctamente.');
    })
    .catch((err) => {
      console.error('❌ Error en ejecución de prueba:', err);
      process.exit(1);
    });
}
