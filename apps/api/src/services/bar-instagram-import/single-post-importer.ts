import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import crypto from 'node:crypto';
import { query, getClient } from '@vayaplan/db';
import sharp from 'sharp';
import { putR2Object, getPublicUrlForKey } from '../r2-client';
import { validateInstagramPostUrl } from './url-validator';
import { resolveApifyMaxTotalChargeUsd, sanitizeProposedTime } from './instagram-ingestion-service';
import { DEFAULT_LOCK_KEY, acquirePersistentLock, releasePersistentLock } from './persistent-lock';
import { classifyBarPost } from './bar-classifier';
import { matchPostWithPublishedEvents } from './event-matcher';
import type { ApifyInstagramRawPost } from './bar-types';

export const MAX_SINGLE_POST_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_IMAGE_INPUT_PIXELS = 40_000_000; // 40 MPx
export const SINGLE_POST_APIFY_BUDGET_USD = 0.005; // Mínimo absoluto exigido por Apify
export const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp']);

let testPostFetcherOverride: ((canonicalUrl: string, chargeLimit: number) => Promise<any[]>) | null = null;
let testImageFetcherOverride: ((url: string) => Promise<Buffer>) | null = null;

/**
 * Determina si el entorno actual autoriza explícitamente overrides de prueba.
 * 
 * Reglas estrictas:
 * 1. Rechaza categóricamente si NODE_ENV === 'production' o BUN_ENV === 'production'.
 *    La presencia de globalThis.describe NUNCA habilita overrides en producción.
 * 2. Exige expresamente que NODE_ENV === 'test' o BUN_ENV === 'test'.
 */
export function isTestOverrideAllowed(): boolean {
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  const bunEnv = (process.env.BUN_ENV || '').trim().toLowerCase();

  // En producción se rechaza siempre y bajo cualquier circunstancia
  if (nodeEnv === 'production' || bunEnv === 'production') {
    return false;
  }

  return nodeEnv === 'test' || bunEnv === 'test';
}

/**
 * Registra un fetcher de posts alternativo para uso exclusivo en pruebas aisladas.
 * Fuera de entornos de test lanza un error para evitar inyección de dependencias en producción.
 */
export function setTestPostFetcherOverride(fn: typeof testPostFetcherOverride) {
  if (fn !== null && !isTestOverrideAllowed()) {
    throw new Error(
      '[SAFETY] setTestPostFetcherOverride solo puede invocarse en entornos de prueba expresamente configurados (NODE_ENV=test). En producción queda terminantemente bloqueado, independientemente de test runners.'
    );
  }
  testPostFetcherOverride = fn;
}

/**
 * Registra un fetcher de imagen alternativo para uso exclusivo en pruebas aisladas.
 * Fuera de entornos de test lanza un error para evitar inyección de dependencias en producción.
 */
export function setTestImageFetcherOverride(fn: typeof testImageFetcherOverride) {
  if (fn !== null && !isTestOverrideAllowed()) {
    throw new Error(
      '[SAFETY] setTestImageFetcherOverride solo puede invocarse en entornos de prueba expresamente configurados (NODE_ENV=test). En producción queda terminantemente bloqueado, independientemente de test runners.'
    );
  }
  testImageFetcherOverride = fn;
}

export interface ImportSingleInstagramPostParams {
  url: string;
  venueId?: number | null;
  userEmail?: string;
  mockPostFetcher?: (canonicalUrl: string, chargeLimit: number) => Promise<any[]>;
  mockImageFetcher?: (url: string) => Promise<Buffer>;
}

export interface ImportSingleInstagramPostResult {
  success: boolean;
  status: number;
  code?: string;
  error?: string;
  alreadyExisted?: boolean;
  recordType?: 'proposal' | 'event';
  proposal?: any;
  event?: any;
  canCompleteManually?: boolean;
  canonicalUrl?: string;
  shortcode?: string;
}

/**
 * Determina si una dirección IP (IPv4 o IPv6) pertenece a rangos privados,
 * reservados, de loopback, enlace local, broadcast o CGNAT (RFC 1918, RFC 3927, RFC 4193, RFC 6598).
 * Analiza también direcciones IPv4 mapeadas en IPv6 (::ffff:0:0/96).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true; // Bloquear si no es una IP sintáctica válida

  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Red actual)
    if (a === 0) return true;
    // 10.0.0.0/8 (Privada RFC 1918)
    if (a === 10) return true;
    // 100.64.0.0/10 (CGNAT RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Enlace local RFC 3927 / Cloud metadata como 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Privada RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (Asignaciones IETF)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.88.99.0/24 (Relay 6to4)
    if (a === 192 && b === 88 && c === 99) return true;
    // 192.168.0.0/16 (Privada RFC 1918)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Pruebas de red)
    if (a === 198 && b >= 18 && b <= 19) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast) y 240.0.0.0/4 (Reservado / Broadcast 255.255.255.255)
    if (a >= 224) return true;

    return false;
  }

  if (family === 6) {
    const lower = ip.toLowerCase();

    // IPv4-mapped IPv6 (::ffff:x.x.x.x o notación hexadecimal)
    if (lower.startsWith('::ffff:')) {
      const rest = lower.slice(7);
      if (net.isIPv4(rest)) {
        return isPrivateOrReservedIp(rest);
      }
      const hexParts = rest.split(':');
      if (hexParts.length === 2) {
        const p1 = parseInt(hexParts[0], 16);
        const p2 = parseInt(hexParts[1], 16);
        if (!isNaN(p1) && !isNaN(p2)) {
          const a = (p1 >> 8) & 0xff;
          const b = p1 & 0xff;
          const c = (p2 >> 8) & 0xff;
          const d = p2 & 0xff;
          return isPrivateOrReservedIp(`${a}.${b}.${c}.${d}`);
        }
      }
    }

    // ::/128 y ::1/128 (Loopback y sin especificar)
    if (lower === '::' || lower === '::1') return true;
    // fc00::/7 (ULA - Unique Local Addresses: fc00:... a fdff:...)
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
    // fe80::/10 (Link-local unicast: fe80:... a febf:...)
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
    // ff00::/8 (Multicast)
    if (/^ff[0-9a-f]{2}:/i.test(lower)) return true;
    // 2001:db8::/32 (Documentación)
    if (lower.startsWith('2001:db8:')) return true;
    // 64:ff9b::/96 (Traducción IPv4/IPv6)
    if (lower.startsWith('64:ff9b:')) return true;

    return false;
  }

  return true;
}

/**
 * Valida estáticamente que una URL de imagen no apunte a esquemas inseguros,
 * puertos inusuales, credenciales o destinos locales/privados conocidos.
 */
export function isSafeImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== '80' && u.port !== '443') return false;

    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h.endsWith('.internal')
    ) {
      return false;
    }

    if (net.isIP(h) && isPrivateOrReservedIp(h)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Descarga de forma segura un buffer de imagen con protección anti-SSRF rigurosa:
 * 1. Prohíbe explícitamente redirecciones HTTP (redirect: 'error').
 * 2. Valida la resolución DNS en tiempo de conexión denegando IPs privadas o reservadas.
 * 3. Aplica límite de tamaño (15 MB) mediante lectura por chunks (streaming) abortable.
 * 4. Aplica un timeout ABSOLUTO desde antes de iniciar la petición, cubriendo resolución
 *    DNS, establecimiento de conexión TCP/TLS y lectura completa de la respuesta.
 *    Adicionalmente, mantiene un timeout de inactividad de socket como segunda capa.
 */
export async function fetchSafeImageBuffer(
  rawUrl: string,
  maxBytes: number = MAX_SINGLE_POST_IMAGE_SIZE_BYTES,
  timeoutMs: number = 15000,
  /** @internal Omitir la validación SSRF estática. Solo para pruebas unitarias — nunca exponer en rutas HTTP. */
  _bypassSsrfForTest: boolean = false
): Promise<Buffer> {
  const isTestEnv = isTestOverrideAllowed();
  if (!_bypassSsrfForTest || !isTestEnv) {
    // En producción (o si no se activa el bypass) siempre se valida.
    // En tests el bypass solo se acepta si se invoca explícitamente desde código de prueba.
    if (!isSafeImageUrl(rawUrl)) {
      throw new Error('SSRF guard: URL de imagen no segura o destino no permitido.');
    }
  }

  const parsedUrl = new URL(rawUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const clientModule = isHttps ? https : http;

  return new Promise<Buffer>((resolve, reject) => {
    let finished = false;
    let absoluteTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupAndReject = (err: Error) => {
      if (finished) return;
      finished = true;
      // Cancelar temporizador absoluto en TODAS las salidas (éxito, error, tamaño, redirección, aborto)
      if (absoluteTimer !== null) {
        clearTimeout(absoluteTimer);
        absoluteTimer = null;
      }
      try {
        req.destroy();
      } catch (_) {}
      reject(err);
    };

    const cleanupAndResolve = (buf: Buffer) => {
      if (finished) return;
      finished = true;
      // Cancelar temporizador absoluto al concluir con éxito
      if (absoluteTimer !== null) {
        clearTimeout(absoluteTimer);
        absoluteTimer = null;
      }
      resolve(buf);
    };

    // Temporizador absoluto: inicia ANTES de crear la petición y cubre resolución DNS,
    // establecimiento de conexión y lectura completa. Protege contra servidores lentos
    // tipo Slowloris que envían bytes esporádicos para evadir el timeout de inactividad.
    absoluteTimer = setTimeout(() => {
      cleanupAndReject(
        new Error(
          `image_total_timeout: Tiempo total de descarga agotado (${timeoutMs} ms). La operación fue cancelada antes de completar la recepción de la imagen.`
        )
      );
    }, timeoutMs);

    const req = clientModule.request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/jpeg,image/png,image/webp,*/*',
        },
        lookup: (hostname, options, callback) => {
          if (_bypassSsrfForTest && isTestEnv) {
            if (net.isIP(hostname)) {
              return callback(null, hostname as any, (net.isIPv6(hostname) ? 6 : 4) as any);
            }
            return dns.lookup(hostname, options, callback as any);
          }

          if (net.isIP(hostname)) {
            if (isPrivateOrReservedIp(hostname)) {
              return callback(
                new Error(`SSRF blocked: IP literal privada o reservada: ${hostname}`) as any,
                '' as any,
                4 as any
              );
            }
            return callback(null, hostname as any, (net.isIPv6(hostname) ? 6 : 4) as any);
          }

          dns.lookup(hostname, options, (err, ...res) => {
            if (err) return callback(err as any, '' as any, 4 as any);
            const addrs = Array.isArray(res[0])
              ? res[0]
              : [{ address: res[0], family: res[1] }];

            for (const addr of addrs) {
              if (addr && addr.address && isPrivateOrReservedIp(addr.address)) {
                return callback(
                  new Error(
                    `SSRF blocked: Hostname "${hostname}" resuelve a IP privada o reservada: ${addr.address}`
                  ) as any,
                  '' as any,
                  4 as any
                );
              }
            }
            callback(null, ...(res as [any, any]));
          });
        },
      },
      (res) => {
        // 1. Redirecciones: prohibidas expresamente
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          return cleanupAndReject(
            new Error(
              `image_redirect_blocked: Redirección HTTP ${res.statusCode} denegada. Solo se admite descarga directa desde el origen verificado.`
            )
          );
        }

        if (res.statusCode !== 200) {
          return cleanupAndReject(
            new Error(`image_http_error: El servidor de imágenes respondió con HTTP ${res.statusCode}`)
          );
        }

        // 2. Comprobación preliminar de Content-Length (puede estar ausente o ser falsa)
        const clHeader = res.headers['content-length'];
        if (clHeader) {
          const declaredLen = parseInt(clHeader, 10);
          if (!isNaN(declaredLen) && declaredLen > maxBytes) {
            return cleanupAndReject(
              new Error(
                `image_too_large: El tamaño declarado de la imagen (${declaredLen} bytes) excede el máximo permitido de 15 MB.`
              )
            );
          }
        }

        // 3. Lectura por chunks (streaming) abortable — válida aunque Content-Length falte o mienta
        const chunks: Buffer[] = [];
        let downloadedBytes = 0;

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            return cleanupAndReject(
              new Error(
                `image_too_large: La imagen descargada excedió el límite máximo de 15 MB (${downloadedBytes} bytes leídos).`
              )
            );
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          cleanupAndResolve(Buffer.concat(chunks, downloadedBytes));
        });

        res.on('error', (streamErr) => {
          cleanupAndReject(streamErr);
        });
      }
    );

    // Timeout de inactividad de socket: segunda capa de protección para pérdida de conectividad
    req.setTimeout(timeoutMs, () => {
      cleanupAndReject(
        new Error(`image_timeout: Inactividad de socket agotada al descargar la imagen (${timeoutMs} ms)`)
      );
    });

    req.on('error', (reqErr) => {
      cleanupAndReject(reqErr);
    });

    req.end();
  });
}

/**
 * Descarga y almacena de forma segura una imagen en Cloudflare R2:
 * 1. Descarga con control de tamaño, SSRF y sin redirecciones.
 * 2. Valida formatos permitidos (JPEG, PNG, WebP) y límite de píxeles (40 MPx).
 * 3. Decodifica y re-codifica con Sharp (auto-orientación, aplanado de alfa, resize 1440x1440 y JPEG progresivo).
 * 4. Almacena en Cloudflare R2 bajo una clave independiente y versionada por contenido:
 *    `instagram-imports/<shortcode>/<hash-16-del-jpeg>.jpg`.
 */
export async function downloadAndUploadPostImageToR2(
  post: ApifyInstagramRawPost,
  _venueSlug?: string,
  mockImageFetcher?: (url: string) => Promise<Buffer>
): Promise<{
  r2Key: string;
  finalUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  contentType: string;
  contentHash: string;
}> {
  const shortCode = post.shortCode || post.id || 'unknown';

  if (!post.displayUrl || typeof post.displayUrl !== 'string') {
    throw new Error('La publicación no contiene una URL de imagen (displayUrl).');
  }

  let rawBuffer: Buffer;
  if (mockImageFetcher) {
    rawBuffer = await mockImageFetcher(post.displayUrl);
  } else {
    rawBuffer = await fetchSafeImageBuffer(post.displayUrl);
  }

  // 1. Validar formato y dimensiones preliminares con Sharp
  let meta: any;
  try {
    meta = await sharp(rawBuffer, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      failOn: 'truncated',
    }).metadata();
  } catch (sharpErr: any) {
    throw new Error(`Archivo de imagen corrupto o inválido: ${sharpErr.message}`);
  }

  if (!meta.format || !ALLOWED_IMAGE_FORMATS.has(meta.format.toLowerCase())) {
    throw new Error(
      `Formato de imagen no permitido: "${meta.format || 'desconocido'}". Solo se admiten JPEG, PNG y WebP.`
    );
  }

  if (!meta.width || !meta.height || meta.width * meta.height > MAX_IMAGE_INPUT_PIXELS) {
    throw new Error(
      `Dimensiones de imagen no válidas o exceden el límite de seguridad (máximo 40 MPx).`
    );
  }

  // 2. Decodificación, saneamiento y normalización completa a JPEG:
  // - Auto-rotación según orientación EXIF.
  // - Redimensionamiento acotado a 1440x1440 sin ampliar imágenes pequeñas.
  // - Aplanado de canal alfa (transparencias PNG/WebP) sobre fondo blanco.
  // - Re-codificación en formato JPEG progresivo (calidad 85), descartando metadatos residuales.
  let normalizedBuffer: Buffer;
  let finalWidth = meta.width;
  let finalHeight = meta.height;

  try {
    const pipeline = sharp(rawBuffer, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      failOn: 'truncated',
    })
      .rotate()
      .resize({
        width: 1440,
        height: 1440,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, progressive: true });

    normalizedBuffer = await pipeline.toBuffer();
    const finalMeta = await sharp(normalizedBuffer).metadata();
    if (finalMeta.width) finalWidth = finalMeta.width;
    if (finalMeta.height) finalHeight = finalMeta.height;
  } catch (procErr: any) {
    throw new Error(`Error durante la decodificación y normalización de la imagen: ${procErr.message}`);
  }

  const contentType = 'image/jpeg';

  // 3. Clave independiente y versionada por contenido para Cloudflare R2:
  // - Prefijo aislado: instagram-imports/ (evita cualquier colisión con bars/ de la ingesta periódica).
  // - No incluye el venue en la identidad del contenido: el hash sobre el JPEG normalizado
  //   identifica de forma unívoca la imagen con independencia del local asignado.
  // - Clave: instagram-imports/<shortcode>/<hash-16-del-jpeg>.jpg
  const contentHash = crypto.createHash('sha256').update(normalizedBuffer).digest('hex').slice(0, 16);
  const r2Key = `instagram-imports/${shortCode}/${contentHash}.jpg`;

  // 4. Subir buffer normalizado a Cloudflare R2:
  // Al ser una URL unívoca e inmutable por contenido, se habilita caché larga con 'immutable'.
  // Si la subida a R2 tiene éxito y el INSERT posterior en PostgreSQL falla, el objeto quedará
  // huérfano en R2; NO debe borrarse automáticamente para no introducir carreras ni borrar
  // objetos compartidos.
  await putR2Object({
    key: r2Key,
    body: normalizedBuffer,
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const finalUrl = getPublicUrlForKey(r2Key);

  return {
    r2Key,
    finalUrl,
    sizeBytes: normalizedBuffer.length,
    width: finalWidth,
    height: finalHeight,
    contentType,
    contentHash,
  };
}

/**
 * Importa puntualmente una publicación de Instagram como propuesta de curación pendiente.
 * Reutiliza el lock global compartido con la ingesta periódica para asegurar exclusión mutua atómica.
 */
export async function importSingleInstagramPost(
  params: ImportSingleInstagramPostParams
): Promise<ImportSingleInstagramPostResult> {
  const { url, venueId, userEmail, mockPostFetcher, mockImageFetcher } = params;
  const effectivePostFetcher = mockPostFetcher || testPostFetcherOverride;
  const effectiveImageFetcher = mockImageFetcher || testImageFetcherOverride;

  // 1. Validar URL sintáctica y canónica
  const urlCheck = validateInstagramPostUrl(url);
  if (!urlCheck.valid) {
    return {
      success: false,
      status: 400,
      code: urlCheck.code,
      error: urlCheck.error,
    };
  }

  const { canonicalUrl, shortcode } = urlCheck;

  // 2. Si se proporciona venueId, comprobar que existe y está activo
  let venueName: string | null = null;
  let venueSlug = 'standalone';

  if (venueId !== undefined && venueId !== null) {
    const vCheck = await query(`SELECT id, name, slug FROM venues WHERE id = $1 AND is_active = true;`, [venueId]);
    if (vCheck.rows.length === 0) {
      return {
        success: false,
        status: 400,
        code: 'venue_not_found',
        error: `El venue con ID ${venueId} no existe o no está activo en el catálogo.`,
      };
    }
    venueName = vCheck.rows[0].name;
    venueSlug = vCheck.rows[0].slug || `venue-${venueId}`;
  }

  // Helper para comprobar duplicados unívocos en curation_proposals y events
  async function findDuplicateRecord(): Promise<{ recordType: 'proposal' | 'event'; record: any } | null> {
    const propRes = await query(
      `SELECT id, title, review_status, classification, venue_id, created_event_id, updated_at
       FROM curation_proposals
       WHERE instagram_post_shortcode = $1 OR source_url = $2
       LIMIT 1;`,
      [shortcode, canonicalUrl]
    );

    if (propRes.rows.length > 0) {
      return { recordType: 'proposal', record: propRes.rows[0] };
    }

    const eventRes = await query(
      `SELECT id, title, editorial_date, status, venue_id
       FROM events
       WHERE source_url = $1
          OR source_url = $2
          OR source_url = $3
       LIMIT 1;`,
      [
        canonicalUrl,
        canonicalUrl.replace(/\/$/, ''),
        canonicalUrl.replace('www.instagram.com', 'instagram.com'),
      ]
    );

    if (eventRes.rows.length > 0) {
      return { recordType: 'event', record: eventRes.rows[0] };
    }

    return null;
  }

  // 3. Comprobar duplicados ANTES de adquirir lock o llamar a Apify
  const dupPre = await findDuplicateRecord();
  if (dupPre) {
    return {
      success: true,
      status: 200,
      alreadyExisted: true,
      recordType: dupPre.recordType,
      proposal: dupPre.recordType === 'proposal' ? dupPre.record : undefined,
      event: dupPre.recordType === 'event' ? dupPre.record : undefined,
    };
  }

  // 4. Concurrencia atómica: Adquirir el lock persistente GLOBAL compartido con la ingesta periódica
  const executionId = `single_import_${shortcode}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const lockRes = await acquirePersistentLock({
    lockKey: DEFAULT_LOCK_KEY,
    lockedBy: executionId,
    // TTL de 3 minutos (180 s): cubre el peor caso demostrable de cada etapa secuencial:
    // Apify sync call (60 s) + descarga imagen (15 s) + Sharp/R2/BD (~15 s holgura máxima).
    // Aún con este TTL, la verificación de titularidad antes del INSERT protege la escritura
    // si el lock expirase en una situación de latencia excepcional no anticipada.
    ttlMinutes: 3,
    executionDetails: {
      action: 'import_single_post',
      url: canonicalUrl,
      shortcode,
      venueId: venueId || null,
      user: userEmail || 'unknown',
      startedAt: new Date().toISOString(),
    },
  });

  if (!lockRes.success) {
    const lockStarted = lockRes.lockInfo?.startedAt || 'recientemente';
    return {
      success: false,
      status: 409,
      code: 'ingestion_in_progress',
      error: `Ya existe una ejecución de ingesta o importación de Instagram en curso iniciada a las ${lockStarted}. Espere unos momentos a que finalice.`,
    };
  }

  try {
    // 5. Repetir comprobación de duplicados DESPUÉS de adquirir el lock persistente
    const dupPostLock = await findDuplicateRecord();
    if (dupPostLock) {
      return {
        success: true,
        status: 200,
        alreadyExisted: true,
        recordType: dupPostLock.recordType,
        proposal: dupPostLock.recordType === 'proposal' ? dupPostLock.record : undefined,
        event: dupPostLock.recordType === 'event' ? dupPostLock.record : undefined,
      };
    }

    // 6. Consultar Apify con presupuesto acotado y sin mantener transacción de BD abierta
    const chargeLimit = resolveApifyMaxTotalChargeUsd(1, SINGLE_POST_APIFY_BUDGET_USD);
    let rawItems: any[];

    if (effectivePostFetcher) {
      try {
        rawItems = await effectivePostFetcher(canonicalUrl, chargeLimit);
      } catch (mockErr: any) {
        if (
          mockErr.name === 'TimeoutError' ||
          mockErr.name === 'AbortError' ||
          mockErr.message?.toLowerCase().includes('timeout')
        ) {
          return {
            success: false,
            status: 504,
            code: 'apify_timeout',
            error:
              'Tiempo de espera agotado al consultar Apify (60s). El estado de la tarea en el proveedor puede ser indeterminado y no se realizaron reintentos automáticos.',
          };
        }
        throw mockErr;
      }
    } else {
      if (isTestOverrideAllowed() && process.env.ALLOW_REAL_APIFY_IN_TESTS !== 'true') {
        throw new Error('[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments.');
      }

      const apifyToken = process.env.APIFY_TOKEN;
      if (!apifyToken) {
        return {
          success: false,
          status: 500,
          code: 'apify_not_configured',
          error: 'APIFY_TOKEN no está configurado en el servidor.',
        };
      }

      const endpoint = `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(
        apifyToken
      )}&maxTotalChargeUsd=${chargeLimit}`;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: [canonicalUrl],
            resultsLimit: 1,
            skipPinnedPosts: false,
          }),
          signal: AbortSignal.timeout(60000), // 60s timeout de socket
        });

        if (!res.ok) {
          const rawErr = await res.text().catch(() => '');
          const sanitizedErr = rawErr
            .replace(/<[^>]*>/g, '')
            .replace(/[\r\n\t]+/g, ' ')
            .slice(0, 150)
            .trim();
          return {
            success: false,
            status: 502,
            code: 'apify_http_error',
            error: `Error al consultar Apify (HTTP ${res.status}): ${sanitizedErr || 'Respuesta de error no especificada'}`,
          };
        }

        rawItems = (await res.json()) as any[];
      } catch (fetchErr: any) {
        if (
          fetchErr.name === 'TimeoutError' ||
          fetchErr.name === 'AbortError' ||
          fetchErr.message?.toLowerCase().includes('timeout')
        ) {
          return {
            success: false,
            status: 504,
            code: 'apify_timeout',
            error:
              'Tiempo de espera agotado al consultar Apify (60s). El estado de la tarea en el proveedor puede ser indeterminado y no se realizaron reintentos automáticos.',
          };
        }
        return {
          success: false,
          status: 502,
          code: 'apify_network_error',
          error: `Error de red al conectar con Apify: ${fetchErr.message?.slice(0, 150) || 'Error desconocido'}`,
        };
      }
    }

    // 7. Validaciones defensivas del dataset devuelto
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        success: false,
        status: 422,
        code: 'post_not_found',
        error:
          'El proveedor no ha devuelto una publicación válida. No se ha creado ninguna propuesta.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    if (rawItems.length > 1) {
      return {
        success: false,
        status: 422,
        code: 'unexpected_multiple_results',
        error: `El proveedor devolvió ${rawItems.length} publicaciones para una URL individual. Operación cancelada por seguridad.`,
        canCompleteManually: false,
      };
    }

    const item = rawItems[0];
    if (!item || typeof item !== 'object') {
      return {
        success: false,
        status: 422,
        code: 'incomplete_response',
        error:
          'El proveedor no ha devuelto una publicación válida. No se ha creado ninguna propuesta.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    // 7.1 Evidencia de restricción de acceso (ej: contenido con restricciones de edad, login_required, restricted_page)
    const isRestricted =
      item.error === 'restricted_page' ||
      item.isRestricted === true ||
      item.isAgeRestricted === true ||
      (typeof item.errorDescription === 'string' &&
        /restricted|age-restricted|restricci/i.test(item.errorDescription)) ||
      (typeof item.error === 'string' &&
        /restricted|login_required|checkpoint_required/i.test(item.error)) ||
      (typeof item.message === 'string' &&
        /restricted|age-restricted|login required/i.test(item.message));

    if (isRestricted) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'bar_instagram_import',
          action: 'single_post_import',
          diagnosis: 'access_restricted',
          shortcode,
          canonicalUrl,
          providerError: item.error,
          providerErrorDescription: item.errorDescription || item.message,
        })
      );
      return {
        success: false,
        status: 422,
        code: 'access_restricted',
        error:
          'Instagram restringe el acceso a esta publicación. No se ha podido importar automáticamente. Puedes completar la propuesta manualmente.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    // 7.2 Error explícito del proveedor sin restricción
    if (item.error || item.errorMessage) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'bar_instagram_import',
          action: 'single_post_import',
          diagnosis: 'provider_error',
          shortcode,
          canonicalUrl,
          providerError: item.error || item.errorMessage,
          providerErrorDescription: item.errorDescription,
        })
      );
      return {
        success: false,
        status: 422,
        code: 'incomplete_response',
        error:
          'El proveedor no ha devuelto una publicación válida. No se ha creado ninguna propuesta.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    // 7.3 Identificar la publicación según el contrato real del Actor (item.shortCode, item.code, item.id)
    const returnedShortcode = item.shortCode || item.code || item.id;

    if (!returnedShortcode || typeof returnedShortcode !== 'string') {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'bar_instagram_import',
          action: 'single_post_import',
          diagnosis: 'missing_identity',
          shortcode,
          canonicalUrl,
          rawKeys: Object.keys(item),
        })
      );
      return {
        success: false,
        status: 422,
        code: 'incomplete_response',
        error:
          'El proveedor no ha devuelto una publicación válida. No se ha creado ninguna propuesta.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    // 7.4 Comparación exacta del shortcode (sensible a mayúsculas, sin inventar identificadores)
    if (returnedShortcode !== shortcode) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'bar_instagram_import',
          action: 'single_post_import',
          diagnosis: 'shortcode_mismatch',
          requestedShortcode: shortcode,
          returnedShortcode,
          canonicalUrl,
        })
      );
      return {
        success: false,
        status: 422,
        code: 'shortcode_mismatch',
        error:
          'La publicación recibida no coincide con el enlace solicitado. Importación cancelada por seguridad.',
        canCompleteManually: false,
      };
    }

    // Normalizar objeto de post
    const rawPost: ApifyInstagramRawPost = {
      id: item.id || shortcode,
      shortCode: shortcode,
      type: item.type || (item.videoUrl ? 'Video' : 'Image'),
      url: canonicalUrl,
      displayUrl: item.displayUrl || item.imageUrl || item.thumbnailUrl,
      caption: item.caption || item.text || '',
      timestamp: item.timestamp || item.takenAt || null,
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      dimensionsWidth: item.dimensionsWidth || 1080,
      dimensionsHeight: item.dimensionsHeight || 1080,
      ownerUsername: item.ownerUsername || 'unknown',
      taggedUsers: item.taggedUsers || [],
    };

    if (!rawPost.displayUrl) {
      return {
        success: false,
        status: 422,
        code: 'missing_image',
        error: 'La publicación no contiene una imagen o miniatura utilizable como cartel.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }

    // 8. Descarga de imagen segura, normalización con Sharp y subida a Cloudflare R2
    let r2Image;
    try {
      r2Image = await downloadAndUploadPostImageToR2(rawPost, venueSlug, effectiveImageFetcher || undefined);
    } catch (imgErr: any) {
      return {
        success: false,
        status: 502,
        code: 'image_upload_failed',
        error: `Error al procesar la imagen del post: ${imgErr.message}`,
      };
    }

    // 9. Clasificación con motor de reglas existente
    const venueLabel = venueName || 'Local sin asignar';
    const classificationResult = classifyBarPost(rawPost, venueLabel);

    // Matching defensivo con eventos publicados en catálogo
    const eventsRes = await query(
      `SELECT id, title, editorial_date, start_time, venue_id, image_url
       FROM events
       WHERE status = 'published'
       ORDER BY editorial_date DESC
       LIMIT 50;`
    );
    const existingEvents = eventsRes.rows;

    const isNoDateTime =
      classificationResult.classification === 'CONTENIDO_VENUE' ||
      (!classificationResult.detectedDate && !classificationResult.detectedTime);

    const matchEval = matchPostWithPublishedEvents(
      {
        venueId: venueId || null,
        proposedDate: classificationResult.detectedDate || null,
        proposedTime: classificationResult.detectedTime || null,
        title: classificationResult.candidateTitle || `Actividad en ${venueLabel}`,
        caption: rawPost.caption || '',
        imageUrl: r2Image.finalUrl,
        postPublishedAt: rawPost.timestamp,
        hasNoDateAndTime: isNoDateTime,
      },
      existingEvents
    );

    let effectiveDate: string | null = null;
    let effectiveTime: string | null = null;
    let effectiveClassification = classificationResult.classification;
    const effectiveReviewStatus = 'pending';
    const effectiveRequiresManualReview = true;
    const matchedEventId: number | null = matchEval.matchedEvent?.id || null;
    const matchLevel: string | null = matchEval.matchLevel !== 'SIN_MATCH' ? matchEval.matchLevel : null;
    const matchReasons: string | null = matchEval.signals.length > 0 ? matchEval.signals.join('; ') : null;

    if (isNoDateTime) {
      effectiveDate = null;
      effectiveTime = null;
      effectiveClassification = 'CONTENIDO_VENUE';
    } else if (
      matchEval.matchLevel === 'MATCH_EXACTO' ||
      matchEval.matchLevel === 'MATCH_ALTO' ||
      matchEval.matchLevel === 'MATCH_POSIBLE'
    ) {
      effectiveDate = classificationResult.detectedDate || null;
      effectiveTime = classificationResult.detectedTime || null;
      effectiveClassification = 'DUPLICADO_POSIBLE';
    } else {
      effectiveDate = classificationResult.detectedDate || null;
      effectiveTime = classificationResult.detectedTime || null;
      if (effectiveTime) {
        const timeCheck = sanitizeProposedTime(rawPost.caption || '', effectiveTime);
        effectiveTime = timeCheck.time;
      }

      if (!effectiveTime) {
        effectiveClassification = 'EVENTO_POSIBLE_SIN_HORA';
      } else {
        effectiveClassification = 'EVENTO_POSIBLE';
      }
    }

    // 10. Dedupe key robusto (no depende únicamente del venue)
    const normTitle = (classificationResult.candidateTitle || `Post ${shortcode}`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);
    const dedupeKey = `instagram#${venueId || 'sin-venue'}#${effectiveDate || 'sin-fecha'}#${
      effectiveTime || 'sin-hora'
    }#${normTitle}#${shortcode}`;

    // 11. Inserción atómica en curation_proposals precedida de verificación de titularidad del lock.
    // Propósito: garantizar que el lock no expiró y fue reemplazado por otra sesión entre
    // la subida a R2 y la escritura en BD. Si el lock ya no nos pertenece, abortamos la
    // inserción para evitar una escritura no autorizada (aún dentro del bloque finally,
    // releasePersistentLock verificará titularidad antes de liberar, sin riesgo).
    //
    // La verificación y el INSERT se ejecutan dentro de una misma transacción de cliente:
    // - Si el lock expiró y fue tomado por otra sesión → rollback, error 409.
    // - Si el lock sigue siendo nuestro → el INSERT se confirma en la misma transacción.
    // No se mantiene ninguna transacción abierta durante llamadas externas (Apify, imagen, R2).
    const insertSql = `
      INSERT INTO curation_proposals (
        title,
        proposed_date,
        proposed_time,
        venue_id,
        category,
        price,
        caption,
        source_url,
        source_type,
        instagram_username,
        instagram_post_shortcode,
        r2_key,
        image_url,
        image_width,
        image_height,
        image_content_type,
        image_size_bytes,
        confidence,
        dedupe_key,
        classification,
        review_status,
        requires_manual_review,
        matched_event_id,
        match_level,
        match_reasons,
        price_status,
        price_note,
        price_source,
        price_checked_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'instagram',
        $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, NOW(),
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const candidateTitle =
      classificationResult.candidateTitle || (venueName ? `Actividad en ${venueName}` : `Publicación de @${rawPost.ownerUsername}`);

    const insertParams = [
      candidateTitle.slice(0, 255),
      effectiveDate,
      effectiveTime,
      venueId || null,
      classificationResult.candidateCategory || 'dj_tardeo',
      classificationResult.estimatedPriceCents !== null && classificationResult.estimatedPriceCents !== undefined
        ? Number((classificationResult.estimatedPriceCents / 100).toFixed(2))
        : null,
      rawPost.caption || '',
      canonicalUrl,
      rawPost.ownerUsername,
      shortcode,
      r2Image.r2Key,
      r2Image.finalUrl,
      r2Image.width,
      r2Image.height,
      r2Image.contentType,
      r2Image.sizeBytes,
      classificationResult.confidence || 'BAJA',
      dedupeKey,
      effectiveClassification,
      effectiveReviewStatus,
      effectiveRequiresManualReview,
      matchedEventId,
      matchLevel,
      matchReasons,
      classificationResult.priceStatus || 'UNKNOWN',
      classificationResult.priceNote || null,
      'instagram_single_import',
    ];

    // Verificar titularidad del lock + persistir en una única transacción de cliente.
    // Si el lock expiró y fue tomado por otra sesión entre la llamada externa y este punto,
    // la operación se aborta antes de insertar, evitando escrituras no autorizadas.
    const client = await getClient();
    let createdProposal: any;
    try {
      await client.query('BEGIN');

      // Comprobar que el lock sigue perteneciendo a esta ejecución.
      // Se utiliza clock_timestamp() para obtener la hora real efectiva tras cualquier espera por bloqueo,
      // evitando referencias temporales obsoletas fijadas al inicio de la transacción (como NOW()).
      const lockCheck = await client.query(
        `SELECT locked_by, released_at, expires_at, clock_timestamp() AS current_wall_time
         FROM instagram_ingestion_locks
         WHERE lock_key = $1
         FOR SHARE;`,
        [DEFAULT_LOCK_KEY]
      );

      const lockRow = lockCheck.rows[0];
      const wallTimeMs = lockRow?.current_wall_time ? new Date(lockRow.current_wall_time).getTime() : Date.now();
      const expiresAtMs = lockRow?.expires_at ? new Date(lockRow.expires_at).getTime() : 0;
      const lockStillOurs =
        lockRow &&
        lockRow.locked_by === executionId &&
        lockRow.released_at === null &&
        expiresAtMs > wallTimeMs &&
        expiresAtMs > Date.now();

      if (!lockStillOurs) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          code: 'lock_expired_before_insert',
          error:
            'El lock global expiró o fue reemplazado por otra sesión antes de poder persistir la propuesta. No se realizó ninguna escritura. Inténtelo de nuevo.',
        };
      }

      const insertRes = await client.query(insertSql, insertParams);
      createdProposal = insertRes.rows[0];

      await client.query('COMMIT');
    } catch (dbErr: any) {
      await client.query('ROLLBACK').catch(() => {});
      throw dbErr;
    } finally {
      client.release();
    }

    return {
      success: true,
      status: 201,
      alreadyExisted: false,
      proposal: createdProposal,
    };
  } finally {
    // 12. Liberación garantizada del lock persistente verificando la propiedad
    await releasePersistentLock(DEFAULT_LOCK_KEY, executionId);
  }
}
