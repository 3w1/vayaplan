import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  decryptFileGpg,
  calculateFileSha256,
  execCommand,
  BackupManifest,
} from './backup_batch';

// ==============================================================================
// VayaPlan — Pipeline de Restauración y Verificación de Respaldo Conjunto
// ==============================================================================

try {
  process.umask(0o077);
} catch {}

export interface RestoreConfig {
  encryptionKey: string;
  batchId?: string;
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  targetUploadsDir: string;
  stagingDir: string;
  mockStorageDir?: string;
  dbContainer?: string;
  dbHost?: string;
  dbPort?: number;
  dbUser?: string;
  dbName?: string;
  dbPassword?: string;
  verifyOnly?: boolean;
}

export interface RestoreResult {
  batchId: string;
  restoredAt: string;
  databaseRestored: boolean;
  originalsRestoredCount: number;
  referentialCheckPassed: boolean;
  verifiedFiles: string[];
}

function getRestoreS3Client(config: RestoreConfig): S3Client | null {
  if (config.mockStorageDir) return null;
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new Error('Faltan credenciales de Cloudflare R2 para restauración.');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

async function downloadFile(
  s3Client: S3Client | null,
  bucket: string,
  key: string,
  destinationPath: string,
  mockStorageDir?: string
): Promise<void> {
  if (mockStorageDir) {
    const src = path.join(mockStorageDir, key);
    if (!fs.existsSync(src)) {
      throw new Error(`Objeto mock no encontrado: ${key}`);
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
    fs.copyFileSync(src, destinationPath);
    return;
  }

  if (!s3Client) throw new Error('Cliente S3 no inicializado.');
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`Cuerpo vacío recibido de R2 para ${key}`);
  }

  const byteArray = await response.Body.transformToByteArray();
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(destinationPath, Buffer.from(byteArray));
}

export async function runRestorePipeline(config: RestoreConfig): Promise<RestoreResult> {
  const s3Client = getRestoreS3Client(config);
  const bucketName = config.r2Bucket || 'vayaplan-backups';
  const restoreStagingDir = path.join(config.stagingDir, `restore_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(restoreStagingDir, { recursive: true, mode: 0o700 });

  try {
    // -------------------------------------------------------------------------
    // 1. Determinar el Lote Objetivo
    // -------------------------------------------------------------------------
    let targetBatchId = config.batchId;
    let batchPrefix = '';
    if (!targetBatchId) {
      // Descargar y descifrar el puntero LATEST_COMPLETE
      const encPointerPath = path.join(restoreStagingDir, 'LATEST_COMPLETE.json.gpg');
      const decPointerPath = path.join(restoreStagingDir, 'LATEST_COMPLETE.json');
      await downloadFile(s3Client, bucketName, 'backups/LATEST_COMPLETE.json.gpg', encPointerPath, config.mockStorageDir);
      await decryptFileGpg(encPointerPath, decPointerPath, config.encryptionKey);
      const pointerData = JSON.parse(fs.readFileSync(decPointerPath, 'utf8'));
      targetBatchId = pointerData.batchId;
      batchPrefix = pointerData.batchPrefix || `backups/batches/${targetBatchId}`;
    } else {
      batchPrefix = `backups/batches/${targetBatchId}`;
    }

    if (!targetBatchId) {
      throw new Error('No se pudo determinar el lote de respaldo a restaurar.');
    }

    // -------------------------------------------------------------------------
    // 2. Descarga y Verificación Pre-descifrado
    // -------------------------------------------------------------------------
    const encDumpPath = path.join(restoreStagingDir, 'db_dump.dump.gpg');
    const encOriginalsPath = path.join(restoreStagingDir, 'private_originals.tar.gz.gpg');
    const encManifestPath = path.join(restoreStagingDir, 'manifest.json.gpg');
    const verificationPath = path.join(restoreStagingDir, 'batch_verification.sha256');

    // Intentar descargar usando batchPrefix (backups/batches/ o fallback a backups/)
    try {
      await downloadFile(s3Client, bucketName, `${batchPrefix}/batch_verification.sha256`, verificationPath, config.mockStorageDir);
    } catch {
      batchPrefix = `backups/${targetBatchId}`;
      await downloadFile(s3Client, bucketName, `${batchPrefix}/batch_verification.sha256`, verificationPath, config.mockStorageDir);
    }

    await downloadFile(s3Client, bucketName, `${batchPrefix}/manifest.json.gpg`, encManifestPath, config.mockStorageDir);
    await downloadFile(s3Client, bucketName, `${batchPrefix}/db_dump.dump.gpg`, encDumpPath, config.mockStorageDir);
    await downloadFile(s3Client, bucketName, `${batchPrefix}/private_originals.tar.gz.gpg`, encOriginalsPath, config.mockStorageDir);

    // Validar sumas SHA-256 de los archivos cifrados descargados
    const verificationContent = fs.readFileSync(verificationPath, 'utf8');
    const expectedHashes = new Map<string, string>();
    for (const line of verificationContent.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 2) {
        expectedHashes.set(parts[1], parts[0]);
      }
    }

    const actualDumpSha = await calculateFileSha256(encDumpPath);
    const actualOrigSha = await calculateFileSha256(encOriginalsPath);
    const actualManSha = await calculateFileSha256(encManifestPath);

    if (expectedHashes.get('db_dump.dump.gpg') !== actualDumpSha) {
      throw new Error('Integridad fallida: el hash SHA-256 del dump cifrado descargado no coincide.');
    }
    if (expectedHashes.get('private_originals.tar.gz.gpg') !== actualOrigSha) {
      throw new Error('Integridad fallida: el hash SHA-256 del tarball de originales cifrado no coincide.');
    }
    if (expectedHashes.get('manifest.json.gpg') !== actualManSha) {
      throw new Error('Integridad fallida: el hash SHA-256 del manifiesto cifrado no coincide.');
    }

    // -------------------------------------------------------------------------
    // 3. Descifrado Autenticado con GPG
    // -------------------------------------------------------------------------
    const decManifestPath = path.join(restoreStagingDir, 'manifest.json');
    const decDumpPath = path.join(restoreStagingDir, 'db_dump.dump');
    const decOriginalsPath = path.join(restoreStagingDir, 'private_originals.tar.gz');

    await decryptFileGpg(encManifestPath, decManifestPath, config.encryptionKey);
    const manifest: BackupManifest = JSON.parse(fs.readFileSync(decManifestPath, 'utf8'));

    await decryptFileGpg(encDumpPath, decDumpPath, config.encryptionKey);
    const unencDumpSha = await calculateFileSha256(decDumpPath);
    if (unencDumpSha !== manifest.database.dumpSha256) {
      throw new Error('Fallo de integridad en contenido descifrado de PostgreSQL.');
    }

    await decryptFileGpg(encOriginalsPath, decOriginalsPath, config.encryptionKey);
    const unencOrigSha = await calculateFileSha256(decOriginalsPath);
    if (unencOrigSha !== manifest.originals.archiveSha256) {
      throw new Error('Fallo de integridad en contenido descifrado de originales.');
    }

    // -------------------------------------------------------------------------
    // 4. Restauración en PostgreSQL y Volumen de Originales
    // -------------------------------------------------------------------------
    let databaseRestored = false;
    if (!config.verifyOnly) {
      if (config.dbContainer) {
        await execCommand('docker', ['cp', decDumpPath, `${config.dbContainer}:/tmp/restore.dump`]);
        await execCommand('docker', [
          'exec',
          config.dbContainer,
          'pg_restore',
          '-U', config.dbUser || 'vayaplan_user',
          '-d', config.dbName || 'vayaplan',
          '--clean',
          '--if-exists',
          '--exit-on-error',
          '/tmp/restore.dump',
        ]);
        await execCommand('docker', ['exec', config.dbContainer, 'rm', '-f', '/tmp/restore.dump']);
        databaseRestored = true;
      } else if (config.dbHost) {
        const envVars: Record<string, string> = {};
        if (config.dbPassword) envVars.PGPASSWORD = config.dbPassword;
        await execCommand(
          'pg_restore',
          [
            '-h', config.dbHost,
            '-p', String(config.dbPort || 5432),
            '-U', config.dbUser || 'vayaplan_user',
            '-d', config.dbName || 'vayaplan',
            '--clean',
            '--if-exists',
            '--exit-on-error',
            decDumpPath,
          ],
          envVars
        );
        databaseRestored = true;
      }
    }

    // Restaurar los archivos originales en el destino configurado
    const targetPrivDir = path.join(config.targetUploadsDir, 'private-originals');
    fs.mkdirSync(targetPrivDir, { recursive: true, mode: 0o700 });

    if (manifest.originals.filesCount > 0) {
      await execCommand('tar', [
        '-xzf',
        decOriginalsPath,
        '-C', targetPrivDir,
      ]);
    }

    // -------------------------------------------------------------------------
    // 5. Validación de Correspondencia Referencial Post-Restauración
    // -------------------------------------------------------------------------
    const verifiedFiles: string[] = [];
    for (const entry of manifest.originals.entries) {
      const restoredFilePath = path.join(targetPrivDir, entry.filename);
      if (!fs.existsSync(restoredFilePath)) {
        throw new Error(`Archivo original restaurado ausente en disco: ${entry.filename}`);
      }
      const restoredFileSha = await calculateFileSha256(restoredFilePath);
      if (restoredFileSha !== entry.sha256) {
        throw new Error(`Corrupción de archivo restaurado: ${entry.filename}`);
      }
      verifiedFiles.push(entry.filename);
    }

    return {
      batchId: targetBatchId,
      restoredAt: new Date().toISOString(),
      databaseRestored,
      originalsRestoredCount: verifiedFiles.length,
      referentialCheckPassed: true,
      verifiedFiles,
    };
  } finally {
    try {
      if (fs.existsSync(restoreStagingDir)) {
        fs.rmSync(restoreStagingDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

if (import.meta.main) {
  const config: RestoreConfig = {
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
    batchId: process.env.RESTORE_BATCH_ID,
    r2AccountId: process.env.BACKUP_R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.BACKUP_R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.BACKUP_R2_SECRET_ACCESS_KEY,
    r2Bucket: process.env.BACKUP_R2_BUCKET || 'vayaplan-backups',
    targetUploadsDir: process.env.RESTORE_TARGET_UPLOADS_DIR || '/app/uploads',
    stagingDir: process.env.RESTORE_STAGING_DIR || '/tmp/vayaplan_restore_staging',
    mockStorageDir: process.env.MOCK_STORAGE_DIR,
    dbContainer: process.env.POSTGRES_CONTAINER || 'vayaplan_postgres',
    dbUser: process.env.POSTGRES_USER || 'vayaplan_user',
    dbName: process.env.POSTGRES_DB || 'vayaplan',
    verifyOnly: process.env.VERIFY_ONLY === 'true',
  };

  runRestorePipeline(config)
    .then((result) => {
      console.log(JSON.stringify({ status: 'SUCCESS', ...result }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(JSON.stringify({ status: 'ERROR', message: err.message }, null, 2));
      process.exit(1);
    });
}
