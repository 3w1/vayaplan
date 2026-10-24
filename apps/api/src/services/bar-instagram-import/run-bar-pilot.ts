import { BarImporter } from './bar-importer';

/**
 * Runner ejecutable para el piloto de actividad de bares desde Instagram.
 */
export async function runBarPilotScript() {
  console.log('=== INICIANDO PILOTO CONTROLADO DE BARES (INSTAGRAM + R2) ===\n');

  const importer = new BarImporter();
  const report = await importer.runPilot({
    uploadImagesToR2: true,
  });

  console.log('\n=== RESULTADO DEL DRY-RUN ===');
  console.log(`Execution ID: ${report.executionId}`);
  console.log(`Perfiles analizados: ${report.pilotVenues.length}`);
  console.log(`Total posts analizados: ${report.totalPostsAnalyzed}`);
  console.log('Desglose de clasificación:', JSON.stringify(report.classificationSummary, null, 2));
  console.log(`Imágenes subidas a R2: ${report.uploadedImages.length}`);
  console.log(`Propuestas de eventos generadas: ${report.proposals.length}`);
  console.log(`Falsos positivos detectados: ${report.falsePositivesDetected.length}`);
  console.log(`Coste estimado ejecución: $${report.estimatedCostUsd}`);
  console.log(`Mutaciones en BD:`, report.databaseVerification);

  await Bun.write(
    '/root/vayaplan/apps/api/src/services/bar-instagram-import/pilot-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\nReporte guardado en apps/api/src/services/bar-instagram-import/pilot-report.json');

  return report;
}

if (import.meta.main) {
  runBarPilotScript().catch((err) => {
    console.error('Error durante la ejecución del piloto:', err);
    process.exit(1);
  });
}
