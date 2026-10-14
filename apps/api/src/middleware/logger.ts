import type { MiddlewareHandler } from 'hono';

/**
 * Middleware para registro de logs estructurados en formato JSON
 */
export const structuredLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.header('x-request-id', requestId);

  const clientIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    '127.0.0.1';

  const userAgent = c.req.header('user-agent') || 'unknown';
  const method = c.req.method;
  const path = c.req.path;

  try {
    await next();
  } finally {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const status = c.res.status;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      method,
      path,
      status,
      durationMs,
      clientIp,
      userAgent,
    };

    if (status >= 500) {
      console.error(JSON.stringify(logEntry));
    } else if (status >= 400) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
};
