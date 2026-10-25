import { describe, expect, test } from 'bun:test';
import {
  extractDatabaseName,
  isAuthorizedTestDatabase,
  assertTestDatabaseAllowed,
  isMutationQuery,
  isTestExecution,
} from './safety-guard';

describe('Database Safety Guard — Production Isolation', () => {
  test('1. Detecta correctamente que el entorno de ejecución actual es un test runner', () => {
    expect(isTestExecution()).toBe(true);
  });

  test('2. Extrae correctamente el nombre de base de datos desde diferentes formatos de conexión', () => {
    expect(extractDatabaseName('postgresql://user:pass@localhost:5432/vayaplan')).toBe('vayaplan');
    expect(extractDatabaseName('postgresql://user:pass@172.20.0.3:5432/vayaplan_test')).toBe('vayaplan_test');
    expect(extractDatabaseName('postgresql://user:pass@172.20.0.3:5432/vayaplan_import_synthetic?sslmode=disable')).toBe('vayaplan_import_synthetic');
    expect(extractDatabaseName('postgres://db:5432/custom_test')).toBe('custom_test');
    expect(extractDatabaseName('dbname=vayaplan_test host=localhost')).toBe('vayaplan_test');
    expect(extractDatabaseName('')).toBe('');
  });

  test('3. Distingue con precisión bases de datos autorizadas para tests de bases de producción', () => {
    // Producción prohibida
    expect(isAuthorizedTestDatabase('vayaplan')).toBe(false);
    expect(isAuthorizedTestDatabase('production')).toBe(false);
    expect(isAuthorizedTestDatabase('prod')).toBe(false);
    expect(isAuthorizedTestDatabase('other_db')).toBe(false);

    // Bases autorizadas para testing
    expect(isAuthorizedTestDatabase('vayaplan_test')).toBe(true);
    expect(isAuthorizedTestDatabase('vayaplan_import_synthetic')).toBe(true);
    expect(isAuthorizedTestDatabase('vayaplan_showcase_test')).toBe(true);
    expect(isAuthorizedTestDatabase('ephemeral_mock_db')).toBe(true);
  });

  test('4. assertTestDatabaseAllowed bloquea terminantemente la base de datos de producción "vayaplan"', () => {
    expect(() => {
      assertTestDatabaseAllowed('postgresql://user:pass@localhost:5432/vayaplan');
    }).toThrow(/CRITICAL: Tests are strictly forbidden from connecting to production database "vayaplan"/);

    expect(() => {
      assertTestDatabaseAllowed('vayaplan');
    }).toThrow(/CRITICAL: Tests are strictly forbidden/);
  });

  test('5. assertTestDatabaseAllowed bloquea bases sin sufijo de test ni synthetic', () => {
    expect(() => {
      assertTestDatabaseAllowed('postgresql://user:pass@localhost:5432/random_company_db');
    }).toThrow(/not an authorized test database/);
  });

  test('6. assertTestDatabaseAllowed permite bases de datos de test autorizadas sin arrojar error', () => {
    expect(() => {
      assertTestDatabaseAllowed('postgresql://user:pass@localhost:5432/vayaplan_test');
    }).not.toThrow();

    expect(() => {
      assertTestDatabaseAllowed('postgresql://user:pass@localhost:5432/vayaplan_import_synthetic');
    }).not.toThrow();

    expect(() => {
      assertTestDatabaseAllowed('vayaplan_test');
    }).not.toThrow();
  });

  test('7. isMutationQuery identifica consultas de modificación/escritura', () => {
    expect(isMutationQuery('INSERT INTO venues (name) VALUES (\'test\')')).toBe(true);
    expect(isMutationQuery('  UPDATE instagram_ingestion_sources SET last_status = \'error\'')).toBe(true);
    expect(isMutationQuery('DELETE FROM events WHERE id = 1')).toBe(true);
    expect(isMutationQuery('DROP TABLE temp;')).toBe(true);
    expect(isMutationQuery('ALTER TABLE venues ADD COLUMN foo text;')).toBe(true);
    expect(isMutationQuery('TRUNCATE curation_proposals;')).toBe(true);

    // Consultas de solo lectura
    expect(isMutationQuery('SELECT * FROM venues;')).toBe(false);
    expect(isMutationQuery('SELECT id, name FROM venues WHERE id = 1;')).toBe(false);
    expect(isMutationQuery('/* comment */ SELECT count(*) FROM events;')).toBe(false);
  });

  test('8. getDbPool() rechaza terminantemente conexión si DATABASE_URL apunta a "vayaplan" sin abrir sockets', async () => {
    const { getDbPool, closePool } = await import('./index');
    await closePool();

    const origDbUrl = process.env.DATABASE_URL;
    const origTestDbUrl = process.env.TEST_DATABASE_URL;

    try {
      delete process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://vayaplan_user:secret@127.0.0.1:5432/vayaplan';

      expect(() => {
        getDbPool();
      }).toThrow(/CRITICAL: Tests are strictly forbidden from connecting to production database "vayaplan"/);
    } finally {
      await closePool();
      if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
      else delete process.env.DATABASE_URL;
      if (origTestDbUrl) process.env.TEST_DATABASE_URL = origTestDbUrl;
      else delete process.env.TEST_DATABASE_URL;
    }
  });

  test('9. getDbPool() rechaza inicialización si falta configuración explícita de base de pruebas', async () => {
    const { getDbPool, closePool } = await import('./index');
    await closePool();

    const origDbUrl = process.env.DATABASE_URL;
    const origTestDbUrl = process.env.TEST_DATABASE_URL;

    try {
      delete process.env.TEST_DATABASE_URL;
      delete process.env.DATABASE_URL;

      expect(() => {
        getDbPool();
      }).toThrow(/Explicit test database configuration is missing/);
    } finally {
      await closePool();
      if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
      else delete process.env.DATABASE_URL;
      if (origTestDbUrl) process.env.TEST_DATABASE_URL = origTestDbUrl;
      else delete process.env.TEST_DATABASE_URL;
    }
  });
});
