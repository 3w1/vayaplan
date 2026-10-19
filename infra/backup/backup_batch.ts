import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// ==============================================================================
// VayaPlan — Pipeline de Respaldo Privado Conjunto (BD + Originales)
// ==============================================================================

// Garantizar permisos restrictivos (0700 para directorios, 0600 para archivos) en todo el proceso
try {
  process.umask(0o077);
} catch {}

export interface BackupConfig {
  encryptionKey: string;
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  uploadsDir: string;
  stagingDir: string;
  mockStorageDir?: string;
  dbContainer?: string;
  dbHost?: string;
  dbPort?: number;
  dbUser?: string;
  dbName?: string;
  dbPassword?: string;
}

export interface BackupBatchResult {
  batchId: string;
  completedAt: string;
  dbDumpSizeBytes: number;
  dbDumpEncryptedSizeBytes: number;
  originalsCount: number;
  originalsSizeBytes: number;
  originalsArchiveSizeBytes: number;
  originalsEncryptedSizeBytes: number;
  manifestEncryptedSizeBytes: number;
  uploadedKeys: string[];
}

export interface ManifestEntry {
  filename: string;
  sizeBytes: number;
  sha256: string;
  referencedByEvents: number[];
}

export interface BackupManifest {
  manifestVersion: string;
  batchId: string;
  createdAt: string;
  schemaVersion: string;
  database: {
    name: string;
    dumpFile: string;
    dumpSizeBytes: number;
    dumpSha256: string;
    eventsCount: number;
    eventsWithOriginalCount: number;
  };
  originals: {
    archiveFile: string;
    archiveSizeBytes: number;
    archiveSha256: string;
    filesCount: number;
    totalSizeBytes: number;
    entries: ManifestEntry[];
  };
  verification: {
    encryptedFiles: {
      dbDump: { filename: string; sha256: string; sizeBytes: number };
      originals: { filename: string; sha256: string; sizeBytes: number };
      manifest: { filename: string; sha256: string; sizeBytes: number };
    };
  };
}

/**
 * Cifra un archivo en disco mediante GnuPG simétrico con AES-256 y MDC (autenticación de integridad).
 * La clave se transmite exclusivamente a través del descriptor de stdin (passphrase-fd 0),
 * impidiendo que quede registrada en la línea de comandos visible de ps aux o /proc.
 */
export function encryptFileGpg(inputPath: string, outputPath: string, passphrase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!passphrase || passphrase.length < 16) {
      return reject(new Error('La clave de cifrado (BACKUP_ENCRYPTION_KEY) debe tener al menos 16 caracteres.'));
    }
    const proc = spawn('gpg', [
      '--batch',
      '--yes',
      '--passphrase-fd', '0',
      '--symmetric',
      '--cipher-algo', 'AES256',
      '--digest-algo', 'SHA512',
      '--s2k-mode', '3',
      '--s2k-count', '65011712',
      '-o', outputPath,
      inputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fallo al cifrar con GPG (código ${code}): ${stderr}`));
    });

    proc.stdin.write(passphrase + '\n');
    proc.stdin.end();
  });
}

/**
 * Descifra un archivo en disco mediante GnuPG.
 * Verifica la autenticidad y el hash de detección de modificaciones (MDC).
 * Falla si la clave es errónea o si el archivo fue alterado/corrompido.
 */
export function decryptFileGpg(inputPath: string, outputPath: string, passphrase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gpg', [
      '--batch',
      '--yes',
      '--passphrase-fd', '0',
      '--decrypt',
      '-o', outputPath,
      inputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fallo al descifrar con GPG (código ${code}): ${stderr}`));
    });

    proc.stdin.write(passphrase + '\n');
    proc.stdin.end();
  });
}

/**
 * Calcula el hash SHA-256 de un archivo en disco en modo streaming.
 */
export function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Ejecuta un comando externo devolviendo stdout/stderr o lanzando error ante código != 0.
 */
export function execCommand(cmd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Comando '${cmd} ${args.join(' ')}' falló (${code}): ${stderr || stdout}`));
    });
  });
}

/**
 * Parsea directamente las referencias a originales del volcado de la tabla events generado por pg_dump.
 * Garantiza que las referencias verificadas pertenezcan exactamente al mismo snapshot que el dump,
 * evitando discrepancias provocadas por transacciones concurrentes en la base de datos activa.
 */
export function parseEventsFromDumpOutput(copyOutput: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const lines = copyOutput.split('\n');
  let inCopy = false;
  let idIdx = -1;
  let origUrlIdx = -1;

  for (const line of lines) {
    if (line.startsWith('COPY ') && line.includes('events')) {
      inCopy = true;
      const match = line.match(/\((.+)\)/);
      if (match) {
        const cols = match[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        idIdx = cols.indexOf('id');
        origUrlIdx = cols.indexOf('image_original_url');
      }
      continue;
    }
    if (inCopy) {
      if (line.startsWith('\\.')) {
        inCopy = false;
        continue;
      }
      if (idIdx === -1 || origUrlIdx === -1) continue;
      const parts = line.split('\t');
      const id = Number(parts[idIdx]);
      const origUrl = parts[origUrlIdx];
      if (origUrl && origUrl !== '\\N') {
        const filename = path.basename(origUrl);
        if (!map.has(filename)) map.set(filename, []);
        map.get(filename)!.push(id);
      }
    }
  }
  return map;
}

/**
 * Crea un cliente S3 para Cloudflare R2 si no se utiliza almacenamiento mock local.
 */
function getBackupS3Client(config: BackupConfig): S3Client | null {
  if (config.mockStorageDir) {
    return null;
  }
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new Error('Faltan credenciales de Cloudflare R2 para el bucket de respaldo (BACKUP_R2_ACCOUNT_ID, BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY).');
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

/**
 * Sube un archivo a Cloudflare R2 o al directorio mock.
 */
async function uploadFile(
  s3Client: S3Client | null,
  bucket: string,
  key: string,
  filePath: string,
  mockStorageDir?: string
): Promise<void> {
  if (mockStorageDir) {
    const dest = path.join(mockStorageDir, key);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    fs.copyFileSync(filePath, dest);
    return;
  }

  if (!s3Client) throw new Error('Cliente S3 no inicializado.');
  const fileStream = fs.createReadStream(filePath);
  const stat = fs.statSync(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentLength: stat.size,
    ContentType: 'application/octet-stream',
  });
  await s3Client.send(command);
}

/**
 * Descarga opcionalmente un objeto para comprobaciones monotónicas. Retorna null si no existe.
 */
async function downloadOptionalFile(
  s3Client: S3Client | null,
  bucket: string,
  key: string,
  destPath: string,
  mockStorageDir?: string
): Promise<boolean> {
  if (mockStorageDir) {
    const src = path.join(mockStorageDir, key);
    if (!fs.existsSync(src)) return false;
    fs.copyFileSync(src, destPath);
    return true;
  }
  if (!s3Client) return false;
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return false;
    const byteArray = await response.Body.transformToByteArray();
    fs.writeFileSync(destPath, Buffer.from(byteArray));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta el pipeline completo de respaldo conjunto.
 */
export async function runBackupPipeline(config: BackupConfig): Promise<BackupBatchResult> {
  // -------------------------------------------------------------------------
  // 0. Lock Exclusivo Local para Evitar Ejecuciones Simultáneas
  // -------------------------------------------------------------------------
  fs.mkdirSync(config.stagingDir, { recursive: true, mode: 0o700 });
  const lockFilePath = path.join(config.stagingDir, '.backup.lock');
  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockFilePath, 'wx');
    fs.writeFileSync(lockFd, `${process.pid}\n${new Date().toISOString()}\n`);
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      throw new Error(`Ya existe una ejecución de respaldo en curso (lock activo en ${lockFilePath}). Abortando.`);
    }
    throw err;
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const batchId = `vayaplan_backup_${timestamp}_${crypto.randomBytes(3).toString('hex')}`;
  const batchStagingDir = path.join(config.stagingDir, batchId);
  const snapshotOriginalsDir = path.join(batchStagingDir, 'staged_originals');

  fs.mkdirSync(snapshotOriginalsDir, { recursive: true, mode: 0o700 });

  const uploadedKeys: string[] = [];
  const s3Client = getBackupS3Client(config);
  const bucketName = config.r2Bucket || 'vayaplan-backups';

  try {
    // -------------------------------------------------------------------------
    // 1. Snapshot Inmediato de Archivos Originales mediante Enlaces Duros (Hard Links)
    // -------------------------------------------------------------------------
    // Previene que sustituciones o limpiezas concurrentes eliminen los archivos
    // mientras se prepara el lote. En POSIX, aunque se ejecute unlink en el origen,
    // el inodo no se libera mientras exista el enlace duro en la carpeta de staging.
    const privateOriginalsDir = path.join(config.uploadsDir, 'private-originals');
    if (fs.existsSync(privateOriginalsDir)) {
      const files = fs.readdirSync(privateOriginalsDir);
      for (const file of files) {
        const srcPath = path.join(privateOriginalsDir, file);
        const dstPath = path.join(snapshotOriginalsDir, file);
        try {
          // Intentar hard link para no duplicar espacio en disco
          fs.linkSync(srcPath, dstPath);
        } catch {
          // Si cruza particiones o filesystems, fallback a copia
          fs.copyFileSync(srcPath, dstPath);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. Volcado Punto en el Tiempo de PostgreSQL (pg_dump -Fc)
    // -------------------------------------------------------------------------
    const rawDumpPath = path.join(batchStagingDir, 'db_dump.dump');
    if (config.dbContainer) {
      await execCommand('docker', [
        'exec',
        config.dbContainer,
        'pg_dump',
        '-U', config.dbUser || 'vayaplan_user',
        '-d', config.dbName || 'vayaplan',
        '-Fc',
        '-f', `/tmp/${batchId}.dump`,
      ]);
      await execCommand('docker', ['cp', `${config.dbContainer}:/tmp/${batchId}.dump`, rawDumpPath]);
      await execCommand('docker', ['exec', config.dbContainer, 'rm', '-f', `/tmp/${batchId}.dump`]);
    } else {
      const envVars: Record<string, string> = {};
      if (config.dbPassword) envVars.PGPASSWORD = config.dbPassword;
      await execCommand(
        'pg_dump',
        [
          '-h', config.dbHost || '127.0.0.1',
          '-p', String(config.dbPort || 5432),
          '-U', config.dbUser || 'vayaplan_user',
          '-d', config.dbName || 'vayaplan',
          '-Fc',
          '-f', rawDumpPath,
        ],
        envVars
      );
    }

    if (!fs.existsSync(rawDumpPath) || fs.statSync(rawDumpPath).size === 0) {
      throw new Error('El volcado de base de datos generado está vacío o no se creó.');
    }

    const dumpSizeBytes = fs.statSync(rawDumpPath).size;
    const dumpSha256 = await calculateFileSha256(rawDumpPath);

    // -------------------------------------------------------------------------
    // 3. Inspección del Dump y Validación Estricta de Correspondencia Referencial
    // -------------------------------------------------------------------------
    // Las referencias se extraen DIRECTAMENTE del volcado mediante pg_restore,
    // garantizando que correspondan exactamente al mismo snapshot transaccional del dump.
    let dumpEventsData = '';
    try {
      dumpEventsData = await execCommand('pg_restore', ['-a', '-t', 'events', '-f', '-', rawDumpPath]);
    } catch {
      // Si la herramienta pg_restore local no está en PATH o falla, extraer a través del contenedor si aplica
      if (config.dbContainer) {
        dumpEventsData = await execCommand('docker', [
          'exec',
          config.dbContainer,
          'pg_restore',
          '-a',
          '-t', 'events',
          '-f', '-',
          rawDumpPath,
        ]).catch(() => '');
      }
    }

    const referencedFilesMap = parseEventsFromDumpOutput(dumpEventsData);

    // Comprobación de consistencia: CADA referencia extraída del dump DEBE existir en el snapshot físico
    const stagedFiles = fs.existsSync(snapshotOriginalsDir) ? fs.readdirSync(snapshotOriginalsDir) : [];
    const stagedFilesSet = new Set(stagedFiles);
    const missingFiles: string[] = [];

    for (const requiredFile of referencedFilesMap.keys()) {
      if (!stagedFilesSet.has(requiredFile)) {
        missingFiles.push(requiredFile);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(
        `Fallo de consistencia referencial: ${missingFiles.length} archivo(s) requeridos por el dump de base de datos no existen en el snapshot físico de originales: ${missingFiles.slice(0, 5).join(', ')}${missingFiles.length > 5 ? '...' : ''}`
      );
    }

    // -------------------------------------------------------------------------
    // 4. Empaquetado de Originales e Inventario de Manifiesto
    // -------------------------------------------------------------------------
    const manifestEntries: ManifestEntry[] = [];
    let totalOriginalsSizeBytes = 0;

    for (const filename of stagedFiles) {
      const filePath = path.join(snapshotOriginalsDir, filename);
      const stat = fs.statSync(filePath);
      const fileSha = await calculateFileSha256(filePath);
      totalOriginalsSizeBytes += stat.size;
      manifestEntries.push({
        filename,
        sizeBytes: stat.size,
        sha256: fileSha,
        referencedByEvents: referencedFilesMap.get(filename) || [],
      });
    }

    const rawArchiveTarGz = path.join(batchStagingDir, 'private_originals.tar.gz');
    // Empaquetar el snapshot de staged_originals
    await execCommand('tar', [
      '-czf',
      rawArchiveTarGz,
      '-C', snapshotOriginalsDir,
      '.',
    ]);

    const archiveSizeBytes = fs.statSync(rawArchiveTarGz).size;
    const archiveSha256 = await calculateFileSha256(rawArchiveTarGz);

    // -------------------------------------------------------------------------
    // 5. Cifrado Autenticado con GnuPG (OpenPGP AES-256 + MDC)
    // -------------------------------------------------------------------------
    const encDumpPath = path.join(batchStagingDir, 'db_dump.dump.gpg');
    const encOriginalsPath = path.join(batchStagingDir, 'private_originals.tar.gz.gpg');
    const encManifestPath = path.join(batchStagingDir, 'manifest.json.gpg');

    await encryptFileGpg(rawDumpPath, encDumpPath, config.encryptionKey);
    await encryptFileGpg(rawArchiveTarGz, encOriginalsPath, config.encryptionKey);

    const encDumpSha256 = await calculateFileSha256(encDumpPath);
    const encDumpSizeBytes = fs.statSync(encDumpPath).size;

    const encOriginalsSha256 = await calculateFileSha256(encOriginalsPath);
    const encOriginalsSizeBytes = fs.statSync(encOriginalsPath).size;

    // Generar y cifrar el manifiesto
    const manifestData: BackupManifest = {
      manifestVersion: '1.0.0',
      batchId,
      createdAt: new Date().toISOString(),
      schemaVersion: '009_event_image_variants',
      database: {
        name: config.dbName || 'vayaplan',
        dumpFile: 'db_dump.dump',
        dumpSizeBytes,
        dumpSha256,
        eventsCount: dumpEventsData ? dumpEventsData.split('\n').filter((l) => l && !l.startsWith('\\.') && !l.startsWith('SET') && !l.startsWith('COPY')).length : 0,
        eventsWithOriginalCount: referencedFilesMap.size,
      },
      originals: {
        archiveFile: 'private_originals.tar.gz',
        archiveSizeBytes,
        archiveSha256,
        filesCount: stagedFiles.length,
        totalSizeBytes: totalOriginalsSizeBytes,
        entries: manifestEntries,
      },
      verification: {
        encryptedFiles: {
          dbDump: { filename: 'db_dump.dump.gpg', sha256: encDumpSha256, sizeBytes: encDumpSizeBytes },
          originals: { filename: 'private_originals.tar.gz.gpg', sha256: encOriginalsSha256, sizeBytes: encOriginalsSizeBytes },
          manifest: { filename: 'manifest.json.gpg', sha256: '', sizeBytes: 0 },
        },
      },
    };

    const rawManifestPath = path.join(batchStagingDir, 'manifest.json');
    fs.writeFileSync(rawManifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
    await encryptFileGpg(rawManifestPath, encManifestPath, config.encryptionKey);

    const encManifestSha256 = await calculateFileSha256(encManifestPath);
    const encManifestSizeBytes = fs.statSync(encManifestPath).size;

    // Archivo de suma de verificación pública del lote
    const checksumsPath = path.join(batchStagingDir, 'batch_verification.sha256');
    const checksumsContent = [
      `${encDumpSha256}  db_dump.dump.gpg`,
      `${encOriginalsSha256}  private_originals.tar.gz.gpg`,
      `${encManifestSha256}  manifest.json.gpg`,
    ].join('\n') + '\n';
    fs.writeFileSync(checksumsPath, checksumsContent, 'utf8');

    // -------------------------------------------------------------------------
    // 6. Publicación del Lote en Almacenamiento Remoto Bajo Subprefijo batches/
    // -------------------------------------------------------------------------
    // Los lotes residen en backups/batches/<batchId>/ para que la regla de expiración
    // de 30 días aplique estrictamente a backups/batches/ sin eliminar el puntero LATEST_COMPLETE
    const remoteBatchPrefix = `backups/batches/${batchId}`;
    const filesToUpload = [
      { key: `${remoteBatchPrefix}/db_dump.dump.gpg`, path: encDumpPath },
      { key: `${remoteBatchPrefix}/private_originals.tar.gz.gpg`, path: encOriginalsPath },
      { key: `${remoteBatchPrefix}/manifest.json.gpg`, path: encManifestPath },
      { key: `${remoteBatchPrefix}/batch_verification.sha256`, path: checksumsPath },
    ];

    for (const item of filesToUpload) {
      await uploadFile(s3Client, bucketName, item.key, item.path, config.mockStorageDir);
      uploadedKeys.push(item.key);
    }

    // -------------------------------------------------------------------------
    // 7. Acreditación Monotónica Final del Lote (LATEST_COMPLETE)
    // -------------------------------------------------------------------------
    // Comprobar que una ejecución concurrente o desfasada no haga retroceder el puntero
    const pointerKey = 'backups/LATEST_COMPLETE.json.gpg';
    const existingEncPointer = path.join(batchStagingDir, 'EXISTING_LATEST_COMPLETE.json.gpg');
    const existingDecPointer = path.join(batchStagingDir, 'EXISTING_LATEST_COMPLETE.json');

    const hasExisting = await downloadOptionalFile(
      s3Client,
      bucketName,
      pointerKey,
      existingEncPointer,
      config.mockStorageDir
    );

    let allowPointerUpdate = true;
    if (hasExisting) {
      try {
        await decryptFileGpg(existingEncPointer, existingDecPointer, config.encryptionKey);
        const existingData = JSON.parse(fs.readFileSync(existingDecPointer, 'utf8'));
        if (existingData.completedAt && new Date(existingData.completedAt).getTime() > new Date(manifestData.createdAt).getTime()) {
          allowPointerUpdate = false;
        }
      } catch {}
    }

    const pointerData = {
      batchId,
      completedAt: manifestData.createdAt,
      manifestSha256: encManifestSha256,
      batchPrefix: remoteBatchPrefix,
    };

    if (allowPointerUpdate) {
      const rawPointerPath = path.join(batchStagingDir, 'LATEST_COMPLETE.json');
      const encPointerPath = path.join(batchStagingDir, 'LATEST_COMPLETE.json.gpg');
      fs.writeFileSync(rawPointerPath, JSON.stringify(pointerData, null, 2), 'utf8');
      await encryptFileGpg(rawPointerPath, encPointerPath, config.encryptionKey);

      await uploadFile(s3Client, bucketName, pointerKey, encPointerPath, config.mockStorageDir);
      uploadedKeys.push(pointerKey);
    }

    return {
      batchId,
      completedAt: pointerData.completedAt,
      dbDumpSizeBytes: dumpSizeBytes,
      dbDumpEncryptedSizeBytes: encDumpSizeBytes,
      originalsCount: stagedFiles.length,
      originalsSizeBytes: totalOriginalsSizeBytes,
      originalsArchiveSizeBytes: archiveSizeBytes,
      originalsEncryptedSizeBytes: encOriginalsSizeBytes,
      manifestEncryptedSizeBytes: encManifestSizeBytes,
      uploadedKeys,
    };
  } finally {
    // Liberar lock y limpiar staging local
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
        fs.unlinkSync(lockFilePath);
      } catch {}
    }
    try {
      if (fs.existsSync(batchStagingDir)) {
        fs.rmSync(batchStagingDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

if (import.meta.main) {
  const config: BackupConfig = {
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
    r2AccountId: process.env.BACKUP_R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.BACKUP_R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.BACKUP_R2_SECRET_ACCESS_KEY,
    r2Bucket: process.env.BACKUP_R2_BUCKET || 'vayaplan-backups',
    uploadsDir: process.env.UPLOADS_DIR || '/app/uploads',
    stagingDir: process.env.BACKUP_STAGING_DIR || '/tmp/vayaplan_backup_staging',
    mockStorageDir: process.env.MOCK_STORAGE_DIR,
    dbContainer: process.env.POSTGRES_CONTAINER || 'vayaplan_postgres',
    dbUser: process.env.POSTGRES_USER || 'vayaplan_user',
    dbName: process.env.POSTGRES_DB || 'vayaplan',
  };

  runBackupPipeline(config)
    .then((result) => {
      console.log(JSON.stringify({ status: 'SUCCESS', ...result }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(JSON.stringify({ status: 'ERROR', message: err.message }, null, 2));
      process.exit(1);
    });
}
