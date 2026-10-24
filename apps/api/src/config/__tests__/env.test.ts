import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';
import { validateAndLoadEnv } from '../env';
import { query } from '@vayaplan/db';
import { app } from '../../index';

describe('Endurecimiento Final de Secretos — Validación Estricta de Entorno', () => {
  const rootDir = resolve(__dirname, '../../../../..');

  const validProdEnv = {
    NODE_ENV: 'production',
    PORT: '4000',
    DATABASE_URL: 'postgresql://vayaplan_user:fake_prod_pass@db:5432/vayaplan',
    ADMIN_EMAIL: 'admin@vayaplan.com',
    ADMIN_PASSWORD_HASH: '$2b$10$validProdHashExampleXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    JWT_SECRET: 'super_secret_jwt_prod_key_2026_xyz',
    WHATSAPP_WEBHOOK_SECRET: 'whatsapp_verify_token_prod_2026',
    INTERNAL_CRON_SECRET: 'cron_internal_token_prod_2026',
  };

  describe('Validación de Configuración al Arranque (validateAndLoadEnv)', () => {
    test('1. Producción sin JWT_SECRET no arranca', () => {
      const envWithoutJwt = { ...validProdEnv, JWT_SECRET: '' };
      expect(() => validateAndLoadEnv(envWithoutJwt)).toThrow('JWT_SECRET is required in production');
    });

    test('2. Producción sin ADMIN_PASSWORD_HASH no arranca', () => {
      const envWithoutAdminHash = { ...validProdEnv, ADMIN_PASSWORD_HASH: '' };
      expect(() => validateAndLoadEnv(envWithoutAdminHash)).toThrow('ADMIN_PASSWORD_HASH is required in production');
    });

    test('3. Producción sin WHATSAPP_WEBHOOK_SECRET no arranca', () => {
      const envWithoutWebhookSecret = { ...validProdEnv, WHATSAPP_WEBHOOK_SECRET: '' };
      expect(() => validateAndLoadEnv(envWithoutWebhookSecret)).toThrow('WHATSAPP_WEBHOOK_SECRET is required in production');
    });

    test('4. Producción sin INTERNAL_CRON_SECRET no arranca', () => {
      const envWithoutCronSecret = { ...validProdEnv, INTERNAL_CRON_SECRET: '' };
      expect(() => validateAndLoadEnv(envWithoutCronSecret)).toThrow('INTERNAL_CRON_SECRET is required');
    });

    test('5. Producción sin DATABASE_URL no arranca', () => {
      const envWithoutDbUrl = { ...validProdEnv, DATABASE_URL: '' };
      expect(() => validateAndLoadEnv(envWithoutDbUrl)).toThrow('DATABASE_URL is required in production');
    });

    test('6. Desarrollo permite configuración local explícita', () => {
      const devEnv = {
        NODE_ENV: 'development',
        INTERNAL_CRON_SECRET: 'local_dev_cron_secret',
        JWT_SECRET: 'local_dev_jwt_secret',
        ADMIN_PASSWORD_HASH: 'local_dev_hash',
        WHATSAPP_WEBHOOK_SECRET: 'local_dev_wh_secret',
        DATABASE_URL: 'postgresql://vayaplan_user:local_pass@localhost:5432/vayaplan',
      };

      const loaded = validateAndLoadEnv(devEnv);
      expect(loaded.isProduction).toBe(false);
      expect(loaded.isDevelopment).toBe(true);
      expect(loaded.isTest).toBe(false);
      expect(loaded.JWT_SECRET).toBe('local_dev_jwt_secret');
      expect(loaded.ADMIN_PASSWORD_HASH).toBe('local_dev_hash');
      expect(loaded.WHATSAPP_WEBHOOK_SECRET).toBe('local_dev_wh_secret');
      expect(loaded.INTERNAL_CRON_SECRET).toBe('local_dev_cron_secret');
      expect(loaded.DATABASE_URL).toBe('postgresql://vayaplan_user:local_pass@localhost:5432/vayaplan');
    });

    test('7. Test permite configuración local explícita', () => {
      const testEnv = {
        NODE_ENV: 'test',
        INTERNAL_CRON_SECRET: 'test_cron_secret',
        JWT_SECRET: 'test_jwt_secret',
        ADMIN_PASSWORD_HASH: 'test_hash',
        WHATSAPP_WEBHOOK_SECRET: 'test_wh_secret',
        DATABASE_URL: 'postgresql://vayaplan_user:test_pass@localhost:5432/vayaplan_test',
      };

      const loaded = validateAndLoadEnv(testEnv);
      expect(loaded.isProduction).toBe(false);
      expect(loaded.isDevelopment).toBe(false);
      expect(loaded.isTest).toBe(true);
      expect(loaded.JWT_SECRET).toBe('test_jwt_secret');
      expect(loaded.ADMIN_PASSWORD_HASH).toBe('test_hash');
      expect(loaded.WHATSAPP_WEBHOOK_SECRET).toBe('test_wh_secret');
      expect(loaded.INTERNAL_CRON_SECRET).toBe('test_cron_secret');
      expect(loaded.DATABASE_URL).toBe('postgresql://vayaplan_user:test_pass@localhost:5432/vayaplan_test');
    });
  });

  describe('Ejecución Real en Subproceso Aislado (NODE_ENV=production fail-fast)', () => {
    const runIsolatedApiProcess = async (envOverrides: Record<string, string>) => {
      const child = Bun.spawn({
        cmd: ['bun', '-e', 'await import("./apps/api/src/index.ts");'],
        cwd: rootDir,
        env: {
          ...process.env,
          ...validProdEnv,
          ...envOverrides,
        },
        stderr: 'pipe',
      });

      const stderrText = await new Response(child.stderr).text();
      const exitCode = await child.exited;
      return { exitCode, stderrText };
    };

    test('Subproceso en producción sin JWT_SECRET aborta con código no cero', async () => {
      const { exitCode, stderrText } = await runIsolatedApiProcess({ JWT_SECRET: '' });
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('JWT_SECRET is required in production');
    });

    test('Subproceso en producción sin ADMIN_PASSWORD_HASH aborta con código no cero', async () => {
      const { exitCode, stderrText } = await runIsolatedApiProcess({ ADMIN_PASSWORD_HASH: '' });
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('ADMIN_PASSWORD_HASH is required in production');
    });

    test('Subproceso en producción sin WHATSAPP_WEBHOOK_SECRET aborta con código no cero', async () => {
      const { exitCode, stderrText } = await runIsolatedApiProcess({ WHATSAPP_WEBHOOK_SECRET: '' });
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('WHATSAPP_WEBHOOK_SECRET is required in production');
    });

    test('Subproceso en producción sin INTERNAL_CRON_SECRET aborta con código no cero', async () => {
      const { exitCode, stderrText } = await runIsolatedApiProcess({ INTERNAL_CRON_SECRET: '' });
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('INTERNAL_CRON_SECRET is required');
    });

    test('Subproceso en producción sin DATABASE_URL aborta con código no cero', async () => {
      const { exitCode, stderrText } = await runIsolatedApiProcess({ DATABASE_URL: '' });
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain('DATABASE_URL is required in production');
    });
  });

  describe('Seguridad de Endpoint Interno, Lock y Persistencia de Propuestas', () => {
    test('8. El endpoint interno sigue requiriendo INTERNAL_CRON_SECRET', async () => {
      const res = await app.fetch(
        new Request('http://localhost:4000/api/v1/internal/instagram-ingestion/run-scheduled', {
          method: 'POST',
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('unauthorized');
    });

    test('9. El endpoint interno sigue rechazando secretos incorrectos con 401', async () => {
      const res = await app.fetch(
        new Request('http://localhost:4000/api/v1/internal/instagram-ingestion/run-scheduled', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer clave_incorrecta_totalmente_invalida_123',
          },
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('unauthorized');
    });

    test('10. El lock persistente sigue funcionando', async () => {
      const {
        acquirePersistentLock,
        releasePersistentLock,
        getPersistentLockStatus,
      } = await import('../../services/bar-instagram-import/persistent-lock');

      const testLockKey = `test_env_lock_${Date.now()}`;
      const worker1 = `test_worker_${Date.now()}`;

      const acquired1 = await acquirePersistentLock({
        lockKey: testLockKey,
        lockedBy: worker1,
        ttlMinutes: 5,
      });
      expect(acquired1.success).toBe(true);

      const statusWhileActive = await getPersistentLockStatus(testLockKey);
      expect(statusWhileActive.locked).toBe(true);
      expect(statusWhileActive.lockInfo?.lockedBy).toBe(worker1);

      const worker2 = `test_worker_competing_${Date.now()}`;
      const acquired2 = await acquirePersistentLock({
        lockKey: testLockKey,
        lockedBy: worker2,
        ttlMinutes: 5,
      });
      expect(acquired2.success).toBe(false);
      expect(acquired2.lockInfo?.lockedBy).toBe(worker1);

      await releasePersistentLock(testLockKey);
      const statusAfterRelease = await getPersistentLockStatus(testLockKey);
      expect(statusAfterRelease.locked).toBe(false);

      const acquired3 = await acquirePersistentLock({
        lockKey: testLockKey,
        lockedBy: worker2,
        ttlMinutes: 5,
      });
      expect(acquired3.success).toBe(true);
      await releasePersistentLock(testLockKey);
    });

    test('11. Las 5 propuestas del piloto siguen pending', async () => {
      const pilotIds = [6, 7, 8, 9, 11];
      const result = await query(
        `SELECT id, title, review_status, classification, requires_manual_review, r2_key, image_url
         FROM curation_proposals 
         WHERE id = ANY($1)
         ORDER BY id ASC;`,
        [pilotIds]
      );

      expect(result.rows.length).toBe(5);
      const ids = result.rows.map((r: any) => r.id);
      expect(ids).toEqual(pilotIds);

      for (const row of result.rows) {
        expect(row.review_status).toBe('pending');
        expect(row.classification).toBe('EVENTO_POSIBLE');
        expect(row.requires_manual_review).toBe(true);
        expect(row.r2_key).toMatch(/^bars\//);
        expect(row.image_url).not.toContain('cdninstagram.com');
        expect(row.image_url).not.toContain('fbcdn.net');
      }
    });
  });
});
