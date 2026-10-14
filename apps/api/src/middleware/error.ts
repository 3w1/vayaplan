import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * Manejador centralizado de errores HTTP y excepciones no controladas
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.res.headers.get('x-request-id') || c.req.header('x-request-id') || 'unknown';

  if (err instanceof HTTPException) {
    const status = err.status;
    const message = err.message || 'Error en la petición';

    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      requestId,
      type: 'HTTPException',
      status,
      message,
    }));

    return c.json(
      {
        error: 'http_error',
        message,
        details: null,
      },
      status
    );
  }

  // Error inesperado o del servidor
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    requestId,
    type: 'InternalServerError',
    message: err.message,
    stack: err.stack,
  }));

  return c.json(
    {
      error: 'internal_server_error',
      message: 'Ha ocurrido un error interno en el servidor',
      details: process.env.NODE_ENV !== 'production' ? { rawMessage: err.message } : null,
    },
    500
  );
};

/**
 * Manejador para rutas no encontradas (404)
 */
export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(
    {
      error: 'not_found',
      message: `Ruta no encontrada: ${c.req.method} ${c.req.path}`,
      details: null,
    },
    404
  );
};
