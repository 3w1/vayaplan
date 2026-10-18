import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

let customS3Client: S3Client | null = null;
let cachedS3Client: S3Client | null = null;
let lastClientConfigKey = '';

// Almacén en memoria para entornos de prueba mock aislados (MOCK_R2=true)
const mockR2Store = new Map<
  string,
  { body: Buffer; contentType: string; lastModified: Date; metadata?: Record<string, string> }
>();

/**
 * Obtiene la configuración de Cloudflare R2 desde variables de entorno.
 * Retorna null si faltan credenciales esenciales (accountId, accessKeyId, secretAccessKey).
 */
export function getR2Config(): R2StorageConfig | null {
  if (process.env.MOCK_R2 === 'true') {
    return {
      accountId: process.env.R2_ACCOUNT_ID?.trim() || 'mock-account',
      accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || 'mock-key',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || 'mock-secret',
      bucket: (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME)?.trim() || 'vayaplan-media-test',
      publicUrl: (process.env.R2_PUBLIC_URL?.trim() || 'https://media.vayaplan.com').replace(/\/+$/, ''),
    };
  }

  let accountId = process.env.R2_ACCOUNT_ID?.trim() || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || '';
  const bucket = (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME)?.trim() || 'vayaplan-media';
  let publicUrl = process.env.R2_PUBLIC_URL?.trim() || 'https://media.vayaplan.com';

  // Sanitizar accountId si se configuró con la URL completa del endpoint S3
  const endpointMatch = accountId.match(/([a-zA-Z0-9_-]+)\.r2\.cloudflarestorage\.com/);
  if (endpointMatch) {
    accountId = endpointMatch[1];
  } else {
    accountId = accountId.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  // Normalizar publicUrl para no tener barra final
  if (publicUrl.endsWith('/')) {
    publicUrl = publicUrl.slice(0, -1);
  }
  if (!publicUrl.startsWith('http://') && !publicUrl.startsWith('https://')) {
    publicUrl = `https://${publicUrl}`;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
  };
}

/**
 * Comprueba si Cloudflare R2 está configurado con credenciales válidas.
 */
export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/**
 * Permite inyectar un cliente S3 personalizado para pruebas unitarias y mocks aislados.
 */
export function setCustomR2S3Client(client: any): void {
  customS3Client = client;
}

/**
 * Restablece el cliente S3 al comportamiento por defecto.
 */
export function resetCustomR2S3Client(): void {
  customS3Client = null;
  cachedS3Client = null;
  lastClientConfigKey = '';
  mockR2Store.clear();
}

/**
 * Instancia o retorna el cliente S3 compatible con Cloudflare R2.
 */
export function getR2S3Client(): S3Client {
  if (customS3Client) {
    return customS3Client;
  }

  const config = getR2Config();
  if (!config) {
    throw new Error(
      'Almacenamiento Cloudflare R2 no configurado. Se requieren R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.'
    );
  }

  const configKey = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (!cachedS3Client || lastClientConfigKey !== configKey) {
    cachedS3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    lastClientConfigKey = configKey;
  }

  return cachedS3Client;
}

/**
 * Calcula la URL pública canónica de entrega para una clave de objeto de Cloudflare R2.
 * No genera URLs firmadas temporales; utiliza el dominio público configurado.
 */
export function getPublicUrlForKey(key: string, publicUrlBase?: string): string {
  const base = (publicUrlBase || process.env.R2_PUBLIC_URL || 'https://media.vayaplan.com')
    .replace(/\/+$/, '');
  const cleanKey = key.replace(/^\/+/, '');
  return `${base}/${cleanKey}`;
}

/**
 * Extrae la clave del objeto en R2 a partir de una URL pública si pertenece al dominio configurado.
 * Retorna null si la URL es externa o no pertenece al almacenamiento de R2.
 */
export function getKeyFromPublicUrl(url: string, publicUrlBase?: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const base = (publicUrlBase || process.env.R2_PUBLIC_URL || 'https://media.vayaplan.com')
    .replace(/\/+$/, '');

  if (url.startsWith(`${base}/`)) {
    return url.slice(base.length + 1);
  }

  // Soporte para URLs con dev domain de Cloudflare R2 (ej: https://pub-xxx.r2.dev/...)
  const r2DevMatch = url.match(/^https:\/\/[a-z0-9_-]+\.r2\.dev\/(.+)$/i);
  if (r2DevMatch) {
    return r2DevMatch[1];
  }

  return null;
}

/**
 * Sube un buffer a Cloudflare R2 utilizando PutObjectCommand.
 */
export async function putR2Object(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  if (process.env.MOCK_R2 === 'true') {
    if (process.env.MOCK_R2_FAIL === 'true') {
      throw new Error('Simulated Cloudflare R2 connection error (500)');
    }
    mockR2Store.set(params.key, {
      body: Buffer.from(params.body),
      contentType: params.contentType,
      lastModified: new Date(),
      metadata: params.metadata,
    });
    return;
  }

  const config = getR2Config();
  if (!config && !customS3Client) {
    throw new Error(
      'Almacenamiento Cloudflare R2 no configurado. Se requieren R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.'
    );
  }

  const bucket = config ? config.bucket : (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'vayaplan-media');
  const client = getR2S3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    CacheControl: params.cacheControl || 'public, max-age=31536000, immutable',
    Metadata: params.metadata,
  });

  await client.send(command);
}

/**
 * Elimina un objeto de Cloudflare R2 utilizando DeleteObjectCommand.
 */
export async function deleteR2Object(key: string): Promise<void> {
  if (process.env.MOCK_R2 === 'true') {
    mockR2Store.delete(key);
    return;
  }

  const config = getR2Config();
  if (!config && !customS3Client) {
    throw new Error('Almacenamiento Cloudflare R2 no configurado.');
  }

  const bucket = config ? config.bucket : (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'vayaplan-media');
  const client = getR2S3Client();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
}

/**
 * Lista objetos en Cloudflare R2 bajo un prefijo opcional.
 */
export async function listR2Objects(prefix?: string): Promise<
  Array<{ key: string; size: number; lastModified?: Date }>
> {
  if (process.env.MOCK_R2 === 'true') {
    const results: Array<{ key: string; size: number; lastModified?: Date }> = [];
    for (const [k, v] of mockR2Store.entries()) {
      if (!prefix || k.startsWith(prefix)) {
        results.push({ key: k, size: v.body.length, lastModified: v.lastModified });
      }
    }
    return results;
  }

  const config = getR2Config();
  if (!config && !customS3Client) {
    throw new Error('Almacenamiento Cloudflare R2 no configurado.');
  }

  const bucket = config ? config.bucket : (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'vayaplan-media');
  const client = getR2S3Client();

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await client.send(command);
  const contents = response.Contents || [];

  return contents
    .filter((item) => item.Key)
    .map((item) => ({
      key: item.Key!,
      size: item.Size || 0,
      lastModified: item.LastModified,
    }));
}

/**
 * Obtiene metadatos de cabecera de un objeto en Cloudflare R2.
 */
export async function headR2Object(
  key: string
): Promise<{ size: number; contentType?: string; lastModified?: Date } | null> {
  if (process.env.MOCK_R2 === 'true') {
    const item = mockR2Store.get(key);
    if (!item) return null;
    return {
      size: item.body.length,
      contentType: item.contentType,
      lastModified: item.lastModified,
    };
  }

  const config = getR2Config();
  if (!config && !customS3Client) {
    throw new Error('Almacenamiento Cloudflare R2 no configurado.');
  }

  const bucket = config ? config.bucket : (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'vayaplan-media');
  const client = getR2S3Client();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await client.send(command);
    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Descarga el contenido binario de un objeto en Cloudflare R2.
 */
export async function getR2Object(
  key: string
): Promise<{ body: Buffer; contentType?: string; contentLength?: number } | null> {
  if (process.env.MOCK_R2 === 'true') {
    const item = mockR2Store.get(key);
    if (!item) return null;
    return {
      body: item.body,
      contentType: item.contentType,
      contentLength: item.body.length,
    };
  }

  const config = getR2Config();
  if (!config && !customS3Client) {
    throw new Error('Almacenamiento Cloudflare R2 no configurado.');
  }

  const bucket = config ? config.bucket : (process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'vayaplan-media');
  const client = getR2S3Client();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await client.send(command);
    if (!response.Body) return null;

    const byteArray = await response.Body.transformToByteArray();
    return {
      body: Buffer.from(byteArray),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
