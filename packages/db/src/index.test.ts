import { describe, expect, test, afterAll } from 'bun:test';
import { query, closePool } from './index';

describe('PostgreSQL DATE parser regression test', () => {
  afterAll(async () => {
    await closePool();
  });

  test('OID 1082 (DATE) se retorna como string YYYY-MM-DD sin conversion a Date', async () => {
    const res = await query("SELECT '2026-10-22'::DATE AS editorial_date;");
    const val = res.rows[0].editorial_date;

    expect(typeof val).toBe('string');
    expect(val).toBe('2026-10-22');
    expect(val instanceof Date).toBe(false);
  });
});
