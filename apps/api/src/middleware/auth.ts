import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import type { AdminUser } from '@vayaplan/types';

export const JWT_SECRET = process.env.JWT_SECRET || 'vayaplan_jwt_secret_dev_2026';

/**
 * Middleware que verifica autenticación administrativa mediante JWT (Bearer token o cookie httpOnly)
 */
export async function requireAdminAuth(c: Context, next: Next) {
  // Excluir endpoint de login de la verificación
  if (c.req.path === '/api/v1/admin/login' || c.req.path === '/admin/login') {
    return next();
  }

  let token: string | null = null;

  // 1. Extraer desde cabecera Authorization: Bearer <token>
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Fallback: extraer desde cookie auth_token
  if (!token) {
    token = getCookie(c, 'auth_token') || null;
  }

  if (!token) {
    return c.json(
      {
        error: 'unauthorized',
        message: 'Acceso restringido. No se ha proporcionado un token o sesión válida.',
      },
      401
    );
  }

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    if (!payload || payload.role !== 'admin') {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Token inválido o privilegios insuficientes.',
        },
        401
      );
    }

    const user: AdminUser = {
      email: String(payload.email || 'admin@vayaplan.com'),
      role: 'admin',
    };

    c.set('user', user);
    await next();
  } catch (err: any) {
    return c.json(
      {
        error: 'unauthorized',
        message: 'Sesión expirada o token no válido.',
      },
      401
    );
  }
}
