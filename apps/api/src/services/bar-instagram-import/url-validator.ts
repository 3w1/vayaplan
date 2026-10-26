/**
 * Validador y normalizador de URLs de publicaciones individuales de Instagram.
 *
 * Reglas de seguridad y contrato:
 * 1. Exige URL sintácticamente válida (new URL).
 * 2. Valida hostname exacto: 'instagram.com' o 'www.instagram.com' (previene SSRF y subdominios maliciosos).
 * 3. Rechaza credenciales embebidas (user:pass@...) y puertos no estándar.
 * 4. Valida rutas soportadas (/p/ y /reel/) con regex anclada al inicio y fin.
 * 5. Rechaza sufijos o rutas hijas (/p/CODE/comments, /p/CODE/extra...).
 * 6. Limpia query parameters (?igsh, ?utm_*) y fragmentos (#).
 * 7. Preserva estrictamente mayúsculas y minúsculas del shortcode (Base64url sensible a mayúsculas).
 * 8. Rechaza explícitamente Stories, perfiles y rutas no soportadas con mensajes claros.
 */

export interface ValidInstagramPostUrlResult {
  valid: true;
  canonicalUrl: string;
  shortcode: string;
  postType: 'p' | 'reel';
}

export interface InvalidInstagramPostUrlResult {
  valid: false;
  error: string;
  code:
    | 'empty_url'
    | 'malformed_url'
    | 'invalid_protocol'
    | 'invalid_hostname'
    | 'credentials_not_allowed'
    | 'port_not_allowed'
    | 'stories_not_supported'
    | 'profile_url_not_supported'
    | 'unsupported_route'
    | 'invalid_shortcode';
}

export type InstagramPostUrlValidationResult =
  | ValidInstagramPostUrlResult
  | InvalidInstagramPostUrlResult;

const STRICT_PATH_REGEX = /^\/(p|reel)\/([A-Za-z0-9_-]{5,30})\/?$/;

export function validateInstagramPostUrl(rawUrl: string): InstagramPostUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      code: 'empty_url',
      error: 'La URL de Instagram es obligatoria.',
    };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      code: 'malformed_url',
      error: 'Formato de URL inválido. Asegúrese de incluir https:// y una dirección válida.',
    };
  }

  // 1. Protocolo
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      code: 'invalid_protocol',
      error: 'Protocolo de URL no admitido. Se requiere https://',
    };
  }

  // 2. Credenciales embebidas (ej: https://user:pass@instagram.com)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      code: 'credentials_not_allowed',
      error: 'La URL no debe contener credenciales ni datos de autenticación.',
    };
  }

  // 3. Puertos no estándar (ej: https://instagram.com:8080)
  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    return {
      valid: false,
      code: 'port_not_allowed',
      error: 'No se permiten puertos no estándar en la URL.',
    };
  }

  // 4. Hostname exacto
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    return {
      valid: false,
      code: 'invalid_hostname',
      error: 'El dominio debe ser exclusivamente instagram.com o www.instagram.com.',
    };
  }

  const pathname = parsed.pathname;

  // 5. Rechazos específicos tempranos para feedback claro
  if (pathname.startsWith('/stories/')) {
    return {
      valid: false,
      code: 'stories_not_supported',
      error: 'Los enlaces a Instagram Stories caducan en 24h y no son compatibles. Proporcione un enlace a un post o reel permanente.',
    };
  }

  if (pathname.startsWith('/reels/') || pathname.startsWith('/tv/')) {
    return {
      valid: false,
      code: 'unsupported_route',
      error: 'Ruta no soportada actualmente. Por favor utilice enlaces directos a publicaciones (/p/) o reels individuales (/reel/).',
    };
  }

  if (
    pathname === '/' ||
    pathname.startsWith('/explore/') ||
    pathname.startsWith('/direct/') ||
    pathname.startsWith('/accounts/')
  ) {
    return {
      valid: false,
      code: 'unsupported_route',
      error: 'Ruta de Instagram no admitida. Solo se admiten publicaciones (/p/) o reels (/reel/).',
    };
  }

  // 6. Validación de rutas soportadas con regex anclada
  const match = pathname.match(STRICT_PATH_REGEX);
  if (!match) {
    // Si parece un perfil (ej: /nombreusuario/)
    const profileMatch = pathname.match(/^\/([A-Za-z0-9_.]+)\/?$/);
    if (profileMatch && profileMatch[1] !== 'p' && profileMatch[1] !== 'reel') {
      return {
        valid: false,
        code: 'profile_url_not_supported',
        error: `El enlace corresponde al perfil (@${profileMatch[1]}), no a una publicación individual. Abra el post concreto y pegue su enlace (/p/ o /reel/).`,
      };
    }

    return {
      valid: false,
      code: 'invalid_shortcode',
      error: 'Ruta o identificador de publicación no válido. Formatos admitidos: /p/IDENTIFICADOR/ o /reel/IDENTIFICADOR/.',
    };
  }

  const postType = match[1] as 'p' | 'reel';
  const shortcode = match[2]; // Preserva mayúsculas y minúsculas exactas

  const canonicalUrl = `https://www.instagram.com/${postType}/${shortcode}/`;

  return {
    valid: true,
    canonicalUrl,
    shortcode,
    postType,
  };
}
