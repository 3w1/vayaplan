/**
 * apps/api/src/config/env.ts
 *
 * Módulo centralizado de configuración y validación de variables de entorno.
 * Garantiza que en producción no exista ningún secreto por defecto ni fallback inseguro,
 * aplicando validación estricta (fail-fast) al arrancar.
 */

export interface AppEnv {
  NODE_ENV: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  JWT_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  WHATSAPP_WEBHOOK_SECRET: string;
  INTERNAL_CRON_SECRET: string;
  APIFY_TOKEN?: string;
  DATABASE_URL?: string;
  ADMIN_EMAIL: string;
}

/**
 * Valida y carga la configuración de entorno a partir de las variables provistas (o process.env).
 * En producción (NODE_ENV=production):
 * - JWT_SECRET es estrictamente obligatorio.
 * - ADMIN_PASSWORD_HASH es estrictamente obligatorio.
 * - WHATSAPP_WEBHOOK_SECRET es estrictamente obligatorio.
 * - INTERNAL_CRON_SECRET es estrictamente obligatorio (requerido siempre en cualquier entorno).
 * - DATABASE_URL es estrictamente obligatorio.
 *
 * Si falta alguno de los secretos obligatorios en producción, lanza una excepción descriptiva
 * impidiendo el arranque de la aplicación.
 */
export function validateAndLoadEnv(customEnv?: Record<string, string | undefined>): AppEnv {
  const source = customEnv || process.env;
  const nodeEnv = (source.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  const internalCronSecret = source.INTERNAL_CRON_SECRET?.trim() || '';
  if (!internalCronSecret) {
    throw new Error('INTERNAL_CRON_SECRET is required');
  }

  const jwtSecret = source.JWT_SECRET?.trim() || '';
  const adminPasswordHash = source.ADMIN_PASSWORD_HASH?.trim() || '';
  const whatsappWebhookSecret = source.WHATSAPP_WEBHOOK_SECRET?.trim() || '';
  const databaseUrl = source.DATABASE_URL?.trim() || '';
  const apifyToken = source.APIFY_TOKEN?.trim() || undefined;
  const adminEmail = (source.ADMIN_EMAIL || 'admin@vayaplan.com').trim().toLowerCase();

  if (isProduction) {
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required in production');
    }
    if (!adminPasswordHash) {
      throw new Error('ADMIN_PASSWORD_HASH is required in production');
    }
    if (!whatsappWebhookSecret) {
      throw new Error('WHATSAPP_WEBHOOK_SECRET is required in production');
    }
    if (!internalCronSecret) {
      throw new Error('INTERNAL_CRON_SECRET is required in production');
    }
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
  }

  return {
    NODE_ENV: nodeEnv,
    isProduction,
    isDevelopment,
    isTest,
    JWT_SECRET: jwtSecret,
    ADMIN_PASSWORD_HASH: adminPasswordHash,
    WHATSAPP_WEBHOOK_SECRET: whatsappWebhookSecret,
    INTERNAL_CRON_SECRET: internalCronSecret,
    APIFY_TOKEN: apifyToken,
    DATABASE_URL: databaseUrl || undefined,
    ADMIN_EMAIL: adminEmail,
  };
}

export const env = validateAndLoadEnv();
