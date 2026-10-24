import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { requireAdminAuth, JWT_SECRET } from '../../middleware/auth';
import { env } from '../../config/env';
import type { AdminLoginResponse, AdminMeResponse, AdminUser } from '@vayaplan/types';

export const adminAuthRoutes = new Hono();

// Rate limiting básico en memoria para intentos fallidos de login
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number;
}
const loginAttempts = new Map<string, RateLimitRecord>();

function checkRateLimit(ip: string): { allowed: boolean; remainingWaitSeconds: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true, remainingWaitSeconds: 0 };

  if (record.blockedUntil > now) {
    const remainingWaitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remainingWaitSeconds };
  }

  // Si ya pasó el bloqueo, limpiar
  if (record.blockedUntil > 0 && record.blockedUntil <= now) {
    loginAttempts.delete(ip);
  }

  return { allowed: true, remainingWaitSeconds: 0 };
}

function registerFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    // Bloquear por 15 minutos tras 5 fallos
    record.blockedUntil = now + 15 * 60 * 1000;
  }
  loginAttempts.set(ip, record);
}

function resetAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Comprueba si la contraseña ingresada coincide con el hash o contraseña configurada.
 * En producción se valida estrictamente contra ADMIN_PASSWORD_HASH (Bcrypt o SHA-256).
 * No contiene valores por defecto ni fallbacks hardcodeados en el código.
 */
async function verifyAdminPassword(plainPassword: string): Promise<boolean> {
  const envHash = env.ADMIN_PASSWORD_HASH;
  const envPlain = !env.isProduction ? process.env.ADMIN_PASSWORD?.trim() : undefined;

  // 1. Si hay contraseña plana configurada explícitamente en desarrollo o test
  if (envPlain && plainPassword === envPlain) {
    return true;
  }

  // 2. Comprobar contra hash configurado desde el entorno
  if (envHash && envHash.length > 0) {
    // Si es Bcrypt ($2a$, $2b$, $2y$)
    if (envHash.startsWith('$2')) {
      try {
        const match = await Bun.password.verify(plainPassword, envHash);
        if (match) return true;
      } catch {}
    }

    // Si es SHA-256 en formato hex (64 caracteres)
    if (envHash.length === 64) {
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(plainPassword);
      const calculatedHex = hasher.digest('hex');
      if (calculatedHex.toLowerCase() === envHash.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * POST /api/v1/admin/login
 * Autenticación administrativa con emisión de token JWT y cookie httpOnly
 */
adminAuthRoutes.post('/login', async (c) => {
  const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

  // Verificar rate limiting
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: 'rate_limit_exceeded',
        message: `Demasiados intentos fallidos. Inténtelo de nuevo en ${rateLimit.remainingWaitSeconds} segundos.`,
      },
      429
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'invalid_json',
        message: 'El cuerpo de la petición debe ser un objeto JSON válido.',
      },
      400
    );
  }

  const email = body?.email?.toLowerCase()?.trim();
  const password = body?.password;

  const expectedEmail = env.ADMIN_EMAIL;

  if (!email || !password) {
    return c.json(
      {
        error: 'missing_credentials',
        message: 'Debe ingresar email y contraseña.',
      },
      400
    );
  }

  if (email !== expectedEmail) {
    registerFailedAttempt(clientIp);
    return c.json(
      {
        error: 'invalid_credentials',
        message: 'Credenciales de acceso incorrectas.',
      },
      401
    );
  }

  const isValidPassword = await verifyAdminPassword(password);
  if (!isValidPassword) {
    registerFailedAttempt(clientIp);
    return c.json(
      {
        error: 'invalid_credentials',
        message: 'Credenciales de acceso incorrectas.',
      },
      401
    );
  }

  // Login correcto: resetear contador
  resetAttempts(clientIp);

  const adminUser: AdminUser = {
    email: expectedEmail,
    role: 'admin',
  };

  const payload = {
    email: adminUser.email,
    role: adminUser.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 días de validez
  };

  const token = await sign(payload, JWT_SECRET);

  // Guardar en cookie httpOnly
  setCookie(c, 'auth_token', token, {
    path: '/',
    httpOnly: true,
    secure: false, // Permitir localhost / proxy SSL de Nginx
    sameSite: 'Lax',
    maxAge: 7 * 86400,
  });

  const response: AdminLoginResponse = {
    status: 'ok',
    token,
    user: adminUser,
  };

  return c.json(response);
});

/**
 * POST /api/v1/admin/logout
 * Cierre de sesión y eliminación de cookie
 */
adminAuthRoutes.post('/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({
    status: 'ok',
    message: 'Sesión cerrada exitosamente.',
  });
});

/**
 * GET /api/v1/admin/me
 * Obtener usuario autenticado actual
 */
adminAuthRoutes.get('/me', requireAdminAuth, (c) => {
  const user = c.get('user') as AdminUser;
  const response: AdminMeResponse = {
    user,
  };
  return c.json(response);
});
