import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  runBackupPipeline,
  decryptFileGpg,
  execCommand,
} from '../backup_batch';
import { runRestorePipeline } from '../restore_batch';

// ==============================================================================
// VayaPlan — Suite de Pruebas Aisladas: Pipeline de Respaldo y Restauración
// ==============================================================================

const TEST_ID = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const TEST_DIR = path.join('/tmp', `vayaplan_backup_test_${TEST_ID}`);
const MOCK_R2_DIR = path.join(TEST_DIR, 'mock_r2');
const SYNTH_UPLOADS_DIR = path.join(TEST_DIR, 'synth_uploads');
const RESTORE_UPLOADS_DIR = path.join(TEST_DIR, 'restored_uploads');
const STAGING_DIR = path.join(TEST_DIR, 'staging');

const SRC_CONTAINER = `vayaplan_synth_pg_src_${TEST_ID}`;
const DST_CONTAINER = `vayaplan_synth_pg_dst_${TEST_ID}`;

const ENCRYPTION_KEY = 'clave_secreta_de_prueba_sintetica_2026_valida!';
const WRONG_KEY = 'clave_totalmente_incorrecta_para_prueba!';

async function waitForPostgresReady(containerName: string, maxAttempts = 15): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await execCommand('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres']);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Timeout esperando a que ${containerName} esté listo.`);
}

async function cleanupTestResources(): Promise<void> {
  try {
    await execCommand('docker', ['rm', '-f', SRC_CONTAINER]).catch(() => {});
    await execCommand('docker', ['rm', '-f', DST_CONTAINER]).catch(() => {});
  } catch {}
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch {}
}

async function main() {
  console.log('=== INICIANDO SUITE DE PRUEBAS AISLADAS DE RESPALDO Y RESTAURACIÓN ===');
  console.log(`Directorio de prueba: ${TEST_DIR}`);

  fs.mkdirSync(TEST_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(MOCK_R2_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SYNTH_UPLOADS_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(RESTORE_UPLOADS_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(STAGING_DIR, { recursive: true, mode: 0o700 });

  const privateOriginalsDir = path.join(SYNTH_UPLOADS_DIR, 'private-originals');
  fs.mkdirSync(privateOriginalsDir, { recursive: true, mode: 0o700 });

  try {
    // -------------------------------------------------------------------------
    // 1. Despliegue de Contenedor Fuente Sintético e Inserción de Datos
    // -------------------------------------------------------------------------
    console.log('[1/8] Desplegando contenedor PostgreSQL fuente efímero...');
    await execCommand('docker', [
      'run',
      '-d',
      '--name', SRC_CONTAINER,
      '-e', 'POSTGRES_PASSWORD=synth_pass',
      'postgres:16-alpine',
    ]);
    await waitForPostgresReady(SRC_CONTAINER);

    // Crear esquema sintético con tabla events
    await execCommand('docker', [
      'exec',
      SRC_CONTAINER,
      'psql',
      '-U', 'postgres',
      '-d', 'postgres',
      '-c',
      `
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        image_url TEXT,
        image_thumb_url TEXT,
        image_original_url TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      `,
    ]);

    // Crear archivos originales sintéticos con contenido determinista
    const file1Name = 'synth-uuid-1-original.jpg';
    const file2Name = 'synth-uuid-2-original.png';
    const file3Name = 'synth-uuid-3-unreferenced.jpg';

    const file1Content = Buffer.from('FAKE_JPEG_BINARY_DATA_WITH_EXIF_MOCK_001_AABBCCDDEEFF');
    const file2Content = Buffer.from('FAKE_PNG_BINARY_DATA_WITH_METADATA_002_11223344556677');
    const file3Content = Buffer.from('UNREFERENCED_ORPHAN_FILE_WITHIN_GRACE_PERIOD');

    fs.writeFileSync(path.join(privateOriginalsDir, file1Name), file1Content);
    fs.writeFileSync(path.join(privateOriginalsDir, file2Name), file2Content);
    fs.writeFileSync(path.join(privateOriginalsDir, file3Name), file3Content);

    // Insertar eventos sintéticos que referencian los archivos
    await execCommand('docker', [
      'exec',
      SRC_CONTAINER,
      'psql',
      '-U', 'postgres',
      '-d', 'postgres',
      '-c',
      `
      INSERT INTO events (title, image_url, image_thumb_url, image_original_url)
      VALUES
        ('Festival Sintético Palencia', 'https://media.test/events/synth-1-detail.webp', 'https://media.test/events/synth-1-thumb.webp', '/api/v1/admin/uploads/originals/${file1Name}'),
        ('Concierto Jazz Sintético', 'https://media.test/events/synth-2-detail.webp', 'https://media.test/events/synth-2-thumb.webp', '/api/v1/admin/uploads/originals/${file2Name}'),
        ('Evento Sin Cartel', NULL, NULL, NULL);
      `,
    ]);

    console.log('✓ Datos sintéticos insertados: 3 eventos, 2 con originales privados.');

    // -------------------------------------------------------------------------
    // 2. Generación del Respaldo Conjunto
    // -------------------------------------------------------------------------
    console.log('[2/8] Ejecutando pipeline de respaldo conjunto (BD + Originales)...');
    const backupResult = await runBackupPipeline({
      encryptionKey: ENCRYPTION_KEY,
      uploadsDir: SYNTH_UPLOADS_DIR,
      stagingDir: STAGING_DIR,
      mockStorageDir: MOCK_R2_DIR,
      dbContainer: SRC_CONTAINER,
      dbUser: 'postgres',
      dbName: 'postgres',
    });

    console.log(`✓ Respaldo generado con éxito. Lote: ${backupResult.batchId}`);
    console.log(`  - Dump BD (cifrado): ${backupResult.dbDumpEncryptedSizeBytes} bytes`);
    console.log(`  - Originales (cifrado): ${backupResult.originalsEncryptedSizeBytes} bytes (${backupResult.originalsCount} archivos)`);
    console.log(`  - Componentes subidos: ${backupResult.uploadedKeys.length}`);

    // Verificar que existen los archivos cifrados en el destino mock bajo backups/batches/<batchId>
    const batchPrefix = path.join(MOCK_R2_DIR, 'backups', 'batches', backupResult.batchId);
    if (!fs.existsSync(path.join(batchPrefix, 'db_dump.dump.gpg'))) throw new Error('Falta db_dump.dump.gpg');
    if (!fs.existsSync(path.join(batchPrefix, 'private_originals.tar.gz.gpg'))) throw new Error('Falta private_originals.tar.gz.gpg');
    if (!fs.existsSync(path.join(batchPrefix, 'manifest.json.gpg'))) throw new Error('Falta manifest.json.gpg');
    if (!fs.existsSync(path.join(batchPrefix, 'batch_verification.sha256'))) throw new Error('Falta batch_verification.sha256');
    if (!fs.existsSync(path.join(MOCK_R2_DIR, 'backups', 'LATEST_COMPLETE.json.gpg'))) throw new Error('Falta LATEST_COMPLETE.json.gpg');

    // -------------------------------------------------------------------------
    // 3. Restauración en Contenedor PostgreSQL Destino Aislado
    // -------------------------------------------------------------------------
    console.log('[3/8] Desplegando contenedor destino y ejecutando restauración completa...');
    await execCommand('docker', [
      'run',
      '-d',
      '--name', DST_CONTAINER,
      '-e', 'POSTGRES_PASSWORD=restore_pass',
      'postgres:16-alpine',
    ]);
    await waitForPostgresReady(DST_CONTAINER);

    const restoreResult = await runRestorePipeline({
      encryptionKey: ENCRYPTION_KEY,
      targetUploadsDir: RESTORE_UPLOADS_DIR,
      stagingDir: STAGING_DIR,
      mockStorageDir: MOCK_R2_DIR,
      dbContainer: DST_CONTAINER,
      dbUser: 'postgres',
      dbName: 'postgres',
    });

    console.log('✓ Restauración completada:');
    console.log(`  - Base de datos restaurada: ${restoreResult.databaseRestored}`);
    console.log(`  - Originales verificados: ${restoreResult.originalsRestoredCount}`);
    console.log(`  - Chequeo referencial: ${restoreResult.referentialCheckPassed}`);

    // -------------------------------------------------------------------------
    // 4. Verificación de Integridad Referencial Cruzada (Post-Restauración)
    // -------------------------------------------------------------------------
    console.log('[4/8] Verificando correspondencia exacta entre BD restaurada y archivos en disco...');
    const dbEventsOutput = await execCommand('docker', [
      'exec',
      DST_CONTAINER,
      'psql',
      '-U', 'postgres',
      '-d', 'postgres',
      '-t', '-A',
      '-c',
      `SELECT title, image_original_url FROM events ORDER BY id;`,
    ]);

    const restoredLines = dbEventsOutput.split('\n').filter(Boolean);
    if (restoredLines.length !== 3) {
      throw new Error(`Se esperaban 3 eventos restaurados, se obtuvieron ${restoredLines.length}`);
    }

    const restoredPrivDir = path.join(RESTORE_UPLOADS_DIR, 'private-originals');
    const restoredFile1 = fs.readFileSync(path.join(restoredPrivDir, file1Name));
    const restoredFile2 = fs.readFileSync(path.join(restoredPrivDir, file2Name));

    if (!restoredFile1.equals(file1Content)) {
      throw new Error('El contenido del archivo 1 restaurado no coincide con el original.');
    }
    if (!restoredFile2.equals(file2Content)) {
      throw new Error('El contenido del archivo 2 restaurado no coincide con el original.');
    }

    console.log('✓ Correspondencia referencial 100% íntegra (coincidencia binaria exacta).');

    // -------------------------------------------------------------------------
    // 5. Prueba de Seguridad: Rechazo de Copia Alterada (Detección de Tampering)
    // -------------------------------------------------------------------------
    console.log('[5/8] Probando rechazo de copia alterada (bit-flip en ciphertext)...');
    const tamperedBatchDir = path.join(TEST_DIR, 'tamper_test');
    fs.mkdirSync(tamperedBatchDir, { recursive: true, mode: 0o700 });

    const originalEncDump = path.join(batchPrefix, 'db_dump.dump.gpg');
    const tamperedEncDump = path.join(tamperedBatchDir, 'db_dump.dump.gpg');
    const tamperedBuf = Buffer.from(fs.readFileSync(originalEncDump));
    // Invertir bytes a mitad del archivo cifrado
    tamperedBuf[Math.floor(tamperedBuf.length / 2)] ^= 0xff;
    fs.writeFileSync(tamperedEncDump, tamperedBuf);

    let tamperingRejected = false;
    try {
      await decryptFileGpg(tamperedEncDump, path.join(tamperedBatchDir, 'decrypted.dump'), ENCRYPTION_KEY);
    } catch (err: any) {
      tamperingRejected = true;
      console.log('✓ Copia alterada rechazada exitosamente por autenticación GPG/MDC.');
    }

    if (!tamperingRejected) {
      throw new Error('FALLO DE SEGURIDAD: El descifrado aceptó un archivo cifrado alterado.');
    }

    // -------------------------------------------------------------------------
    // 6. Prueba de Seguridad: Rechazo de Clave Incorrecta
    // -------------------------------------------------------------------------
    console.log('[6/8] Probando rechazo de clave de cifrado incorrecta...');
    let wrongKeyRejected = false;
    try {
      await decryptFileGpg(originalEncDump, path.join(tamperedBatchDir, 'wrong_key.dump'), WRONG_KEY);
    } catch (err: any) {
      wrongKeyRejected = true;
      console.log('✓ Clave incorrecta rechazada exitosamente.');
    }

    if (!wrongKeyRejected) {
      throw new Error('FALLO DE SEGURIDAD: El descifrado aceptó una clave incorrecta.');
    }

    // -------------------------------------------------------------------------
    // 7. Prueba de Robustez: Comportamiento ante Subida Incompleta e Inconsistencia
    // -------------------------------------------------------------------------
    console.log('[7/8] Probando detección de subida incompleta e inconsistencia referencial...');

    // A. Subida incompleta: comprobar que si falta un componente, la restauración falla
    const brokenBatchPrefix = path.join(MOCK_R2_DIR, 'backups', 'batches', 'batch_incomplete_test');
    fs.mkdirSync(brokenBatchPrefix, { recursive: true, mode: 0o700 });
    fs.copyFileSync(originalEncDump, path.join(brokenBatchPrefix, 'db_dump.dump.gpg'));

    let incompleteRejected = false;
    try {
      await runRestorePipeline({
        encryptionKey: ENCRYPTION_KEY,
        batchId: 'batch_incomplete_test',
        targetUploadsDir: RESTORE_UPLOADS_DIR,
        stagingDir: STAGING_DIR,
        mockStorageDir: MOCK_R2_DIR,
        verifyOnly: true,
      });
    } catch (err: any) {
      incompleteRejected = true;
      console.log('✓ Lote incompleto rechazado exitosamente.');
    }

    if (!incompleteRejected) {
      throw new Error('FALLO: Se aceptó un lote incompleto sin fallar.');
    }

    // B. Inconsistencia referencial previa al respaldo:
    await execCommand('docker', [
      'exec',
      SRC_CONTAINER,
      'psql',
      '-U', 'postgres',
      '-d', 'postgres',
      '-c',
      `
      INSERT INTO events (title, image_original_url)
      VALUES ('Evento Fantasma', '/api/v1/admin/uploads/originals/ghost-uuid-nonexistent.jpg');
      `,
    ]);

    let inconsistencyRejected = false;
    try {
      await runBackupPipeline({
        encryptionKey: ENCRYPTION_KEY,
        uploadsDir: SYNTH_UPLOADS_DIR,
        stagingDir: STAGING_DIR,
        mockStorageDir: MOCK_R2_DIR,
        dbContainer: SRC_CONTAINER,
        dbUser: 'postgres',
        dbName: 'postgres',
      });
    } catch (err: any) {
      if (err.message.includes('Fallo de consistencia referencial')) {
        inconsistencyRejected = true;
        console.log('✓ Inconsistencia referencial detectada antes de publicar: el respaldo abortó limpiamente.');
      }
    }

    if (!inconsistencyRejected) {
      throw new Error('FALLO: El respaldo procedió a pesar de faltar un archivo físico referenciado por la BD.');
    }

    // -------------------------------------------------------------------------
    // 8. Prueba de Respaldo Pre-Migración 009 (0 Originales en BD y Disco)
    // -------------------------------------------------------------------------
    console.log('[8/8] Probando respaldo válido en estado pre-migración 009 (sin originales)...');
    const emptyUploadsDir = path.join(TEST_DIR, 'empty_uploads');
    fs.mkdirSync(emptyUploadsDir, { recursive: true, mode: 0o700 });

    // Limpiar eventos fantasmas
    await execCommand('docker', [
      'exec',
      SRC_CONTAINER,
      'psql',
      '-U', 'postgres',
      '-d', 'postgres',
      '-c',
      `DELETE FROM events WHERE title = 'Evento Fantasma'; UPDATE events SET image_original_url = NULL;`,
    ]);

    const preMigrationBackup = await runBackupPipeline({
      encryptionKey: ENCRYPTION_KEY,
      uploadsDir: emptyUploadsDir,
      stagingDir: STAGING_DIR,
      mockStorageDir: MOCK_R2_DIR,
      dbContainer: SRC_CONTAINER,
      dbUser: 'postgres',
      dbName: 'postgres',
    });

    console.log(`✓ Respaldo pre-migración completado con éxito (0 originales): Lote ${preMigrationBackup.batchId}`);

    console.log('\n================================================================');
    console.log('✓ TODAS LAS PRUEBAS AISLADAS (8/8) COMPLETADAS CON ÉXITO AL 100%');
    console.log('================================================================\n');
  } finally {
    console.log('Limpiando contenedores efímeros y directorios temporales...');
    await cleanupTestResources();
    console.log('✓ Limpieza completada.');
  }
}

main().catch(async (err) => {
  console.error('\n❌ ERROR EN LA EJECUCIÓN DE PRUEBAS AISLADAS:', err);
  await cleanupTestResources();
  process.exit(1);
});
