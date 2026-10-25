/**
 * VayaPlan Database Safety Guard
 *
 * Prevents automated tests, scripts, or test runners from accidentally connecting to,
 * reading from, or mutating the production PostgreSQL database.
 */

export const PROTECTED_PRODUCTION_DB_NAMES = new Set(['vayaplan', 'production', 'prod']);

/**
 * Detects if the current process is running in a test context.
 * Checks multiple independent signals so NODE_ENV=test is not the single point of failure.
 */
export function isTestExecution(): boolean {
  if (process.env.VAYAPLAN_IS_TEST === 'true') return true;
  if ((process.env.NODE_ENV || '').trim().toLowerCase() === 'test') return true;
  if ((process.env.BUN_ENV || '').trim().toLowerCase() === 'test') return true;
  if (typeof (globalThis as any).describe === 'function' && typeof (globalThis as any).test === 'function') return true;
  if (process.argv.some(arg => arg.includes('test') || arg.endsWith('bun:test'))) return true;
  return false;
}

/**
 * Extracts the database name from a PostgreSQL connection string or URL.
 */
export function extractDatabaseName(connectionString: string): string {
  if (!connectionString) return '';
  try {
    if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
      const url = new URL(connectionString);
      return (url.pathname || '').replace(/^\/+/, '').split('?')[0].trim();
    }
  } catch {
    // Fallback if URL parsing fails on raw parameters
  }
  const match = connectionString.match(/(?:dbname|database)=([a-zA-Z0-9_-]+)/i) || connectionString.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/);
  return match ? match[1].trim() : '';
}

/**
 * Checks whether a database name is authorized for testing.
 * Rules:
 * 1. Must NOT be a known production DB name ('vayaplan', 'production', 'prod').
 * 2. Must end with '_test' or '_synthetic' or contain 'test' / 'mock'.
 */
export function isAuthorizedTestDatabase(dbName: string): boolean {
  if (!dbName) return false;
  const lower = dbName.toLowerCase().trim();
  if (PROTECTED_PRODUCTION_DB_NAMES.has(lower)) return false;
  if (lower.endsWith('_test') || lower.endsWith('_synthetic') || lower.includes('_test_') || lower.includes('mock')) {
    return true;
  }
  return false;
}

/**
 * Enforces test database authorization.
 * Throws if running in a test context and the target database is production or unauthorized.
 */
export function assertTestDatabaseAllowed(connectionStringOrDbName: string): void {
  if (!isTestExecution()) {
    return; // Normal runtime (production / staging / dev)
  }

  // Extreme emergency override (disabled by default)
  if (process.env.ALLOW_TESTS_ON_PRODUCTION === 'true') {
    return;
  }

  const dbName = connectionStringOrDbName.includes('/') || connectionStringOrDbName.includes(':')
    ? extractDatabaseName(connectionStringOrDbName)
    : connectionStringOrDbName.trim();

  if (!dbName) {
    throw new Error(
      '[DATABASE_SAFETY_GUARD] Aborted: Could not determine database name in test context. An explicit test database is required.'
    );
  }

  if (PROTECTED_PRODUCTION_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `[DATABASE_SAFETY_GUARD] CRITICAL: Tests are strictly forbidden from connecting to production database "${dbName}"! Configure an isolated test database (e.g. "vayaplan_test").`
    );
  }

  if (!isAuthorizedTestDatabase(dbName)) {
    throw new Error(
      `[DATABASE_SAFETY_GUARD] Aborted: Database "${dbName}" is not an authorized test database. Authorized test databases must end with "_test" or "_synthetic" (e.g., "vayaplan_test").`
    );
  }
}

/**
 * Detects if a SQL query performs write/mutation operations.
 */
export function isMutationQuery(sql: string): boolean {
  if (!sql) return false;
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
  return /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REINDEX|VACUUM)\b/i.test(cleaned);
}
