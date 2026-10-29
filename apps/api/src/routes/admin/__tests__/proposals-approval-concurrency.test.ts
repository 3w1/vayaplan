import { describe, expect, test, beforeAll, afterAll } from 'bun:test';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.2:5432/vayaplan_test';
process.env.DATABASE_URL = rawTestDbUrl.trim();

const { query } = await import('@vayaplan/db');
const { app } = await import('../../../index');
const { sign } = await import('hono/jwt');

describe('Admin Proposals - Concurrency, Duplicate and Linked Protection', () => {
  let token: string;
  let venueId: number;

  beforeAll(async () => {
    token = await sign(
      { email: 'admin@vayaplan.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_SECRET || 'vayaplan_jwt_secret_dev_2026'
    );
    const venueRes = await query('SELECT id FROM venues WHERE is_active = true LIMIT 1;');
    venueId = venueRes.rows[0].id;
  });

  test('1. Dos aprobaciones simultáneas no crean dos eventos y una repetida devuelve conflicto 409 con evento existente', async () => {
    const dedupeKey = 'test_conc_key_' + Date.now();
    const propRes = await query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, price,
        source_url, source_type, r2_key, image_url, dedupe_key, classification, review_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING id;`,
      [
        'Test Concurrency Event',
        '2026-11-20',
        '21:00',
        venueId,
        'ocio',
        15.0,
        'https://www.instagram.com/p/test_conc/',
        'instagram',
        'instagram-imports/test_conc/cover.jpg',
        'https://media.vayaplan.com/instagram-imports/test_conc/cover.jpg',
        dedupeKey,
        'EVENTO_POSIBLE',
        'pending',
      ]
    );
    const propId = propRes.rows[0].id;

    try {
      // 1. Dos llamadas simultáneas
      const req1 = app.request(`/api/v1/admin/proposals/${propId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Concurrency Event',
          proposed_date: '2026-11-20',
          proposed_time: '21:00',
          venue_id: venueId,
          category: 'ocio',
        }),
      });

      const req2 = app.request(`/api/v1/admin/proposals/${propId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Concurrency Event',
          proposed_date: '2026-11-20',
          proposed_time: '21:00',
          venue_id: venueId,
          category: 'ocio',
        }),
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      const data1 = await res1.json();
      const data2 = await res2.json();

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Verificar en la BD que SOLO se creó 1 evento
      const evs = await query('SELECT id, title, dedupe_key FROM events WHERE dedupe_key = $1;', [dedupeKey]);
      expect(evs.rows.length).toBe(1);

      // 2. Aprobación repetida posterior
      const req3 = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Concurrency Event',
          proposed_date: '2026-11-20',
          proposed_time: '21:00',
          venue_id: venueId,
          category: 'ocio',
        }),
      });
      const data3 = await req3.json();
      expect(req3.status).toBe(409);
      expect(data3.error).toBe('proposal_already_approved');
      expect(data3.existingEvent.id).toBe(evs.rows[0].id);

      // Total de eventos sigue siendo exactamente 1
      const evsAfter = await query('SELECT id FROM events WHERE dedupe_key = $1;', [dedupeKey]);
      expect(evsAfter.rows.length).toBe(1);

    } finally {
      await query('DELETE FROM curation_proposals WHERE id = $1;', [propId]);
      await query('DELETE FROM events WHERE dedupe_key = $1;', [dedupeKey]);
    }
  });

  test('2. No se crea un nuevo evento si la propuesta ya está vinculada a uno existente (matched_event_id)', async () => {
    // Buscar un evento existente
    const evRes = await query('SELECT id, venue_id, editorial_date, start_time, title FROM events LIMIT 1;');
    const existingEv = evRes.rows[0];

    const dedupeKey = 'test_linked_prop_' + Date.now();
    const propRes = await query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, price,
        source_url, source_type, r2_key, image_url, dedupe_key, classification, review_status, matched_event_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id;`,
      [
        'Propuesta Ya Vinculada',
        '2026-11-28',
        '22:00',
        existingEv.venue_id,
        'ocio',
        12.0,
        'https://www.instagram.com/p/linked_test/',
        'instagram',
        'instagram-imports/linked_test/cover.jpg',
        'https://media.vayaplan.com/instagram-imports/linked_test/cover.jpg',
        dedupeKey,
        'EVENTO_POSIBLE',
        'pending',
        existingEv.id,
      ]
    );
    const propId = propRes.rows[0].id;

    try {
      const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Propuesta Ya Vinculada',
          proposed_date: '2026-11-28',
          proposed_time: '22:00',
          venue_id: existingEv.venue_id,
          category: 'ocio',
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('proposal_already_linked');
      expect(data.existingEvent.id).toBe(existingEv.id);

      // Comprobar que no se creó ningún evento nuevo
      const evs = await query('SELECT id FROM events WHERE dedupe_key = $1;', [dedupeKey]);
      expect(evs.rows.length).toBe(0);
    } finally {
      await query('DELETE FROM curation_proposals WHERE id = $1;', [propId]);
      await query('DELETE FROM events WHERE dedupe_key = $1;', [dedupeKey]);
    }
  });
});
