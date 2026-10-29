import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { query } from '@vayaplan/db';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateStoryRetentionDryRun,
  executeStoryRetentionPolicy,
  STORY_PENDING_RETENTION_DAYS,
  STORY_REJECTED_RETENTION_DAYS,
  STORY_EVENT_MEDIA_GRACE_DAYS,
  STORY_MAX_ACQUISITION_RETENTION_DAYS,
} from '../story-retention-service';
import {
  preparePaidImportAuthorization,
  executeAuthorizedPaidImport,
} from '../fallback-coordinator';
import { sign } from 'hono/jwt';
import { app } from '../../../index';

function generateTestStoryId(): string {
  return `40186588${Math.floor(1000000000 + Math.random() * 9000000000)}`;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_vayaplan_2026';

describe('Política de Retención y Ciclo de Vida de Historias de Instagram', () => {
  let testVenueId: number;
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await sign(
      { email: 'curator@vayaplan.com', role: 'admin' },
      JWT_SECRET,
      'HS256'
    );
    // Asegurar local de prueba con city_id válido
    const vRes = await query(`
      INSERT INTO venues (name, slug, city_id, is_active)
      VALUES ('Bar Retención Test', 'bar-retencion-test-' || floor(random()*1000000)::text, 1, true)
      RETURNING id;
    `);
    testVenueId = vRes.rows[0].id;
  });

  describe('1. Evaluación en modo SOLO LECTURA (Dry-Run) y Reglas de Vencimiento', () => {
    it('1.1. Propuesta pendiente reciente (< 7 días): permanece activa (keep_active)', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at, updated_at
        ) VALUES (
          'Concierto Pendiente Reciente', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/recent.jpg', 'https://r2.vayaplan.com/stories/recent.jpg',
          'pending', $2, NOW() - INTERVAL '2 days', NOW()
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.dryRun).toBe(true);
      expect(evalReport.items.length).toBe(1);

      const item = evalReport.items[0];
      expect(item.proposalId).toBe(propId);
      expect(item.reviewStatus).toBe('pending');
      expect(item.isExpired).toBe(false);
      expect(item.recommendedAction).toBe('keep_active');
      expect(item.reason).toContain('Propuesta pendiente en plazo de curación editorial');
    });

    it('1.2. Propuesta pendiente caducada (> 7 días sin atender): recomienda archivar y purgar imagen', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at, updated_at
        ) VALUES (
          'Tapa Olvidada', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/old_pending.jpg', 'https://r2.vayaplan.com/stories/old_pending.jpg',
          'pending', $2, NOW() - INTERVAL '10 days', NOW()
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);

      const item = evalReport.items[0];
      expect(item.isExpired).toBe(true);
      expect(item.recommendedAction).toBe('archive_proposal_metadata');
      expect(item.reason).toContain(`más de ${STORY_PENDING_RETENTION_DAYS} días`);
    });

    it('1.3. Propuesta rechazada reciente (< 7 días desde revisión): permanece en periodo de gracia', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at, reviewed_at
        ) VALUES (
          'Historia No Evento', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/rejected_rec.jpg', 'https://r2.vayaplan.com/stories/rejected_rec.jpg',
          'rejected', $2, NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);
      expect(evalReport.items[0].isExpired).toBe(false);
      expect(evalReport.items[0].recommendedAction).toBe('keep_active');
    });

    it('1.4. Propuesta rechazada caducada (> 7 días): recomienda purga de imagen en R2', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at, reviewed_at
        ) VALUES (
          'Historia Antigua Descartada', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/rejected_old.jpg', 'https://r2.vayaplan.com/stories/rejected_old.jpg',
          'rejected', $2, NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);
      expect(evalReport.items[0].isExpired).toBe(true);
      expect(evalReport.items[0].recommendedAction).toBe('purge_proposal_r2_image');
      expect(evalReport.items[0].reason).toContain(`Propuesta rechazada vencida`);
    });

    it('1.5. Propuesta rechazada con tope de adquisición: si fue adquirida hace 28 días y rechazada hace 4, vence a los 30 días de adquisición', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at, reviewed_at
        ) VALUES (
          'Rechazada Cerca Del Tope', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/capped_rej.jpg', 'https://r2.vayaplan.com/stories/capped_rej.jpg',
          'rejected', $2, NOW() - INTERVAL '28 days', NOW() - INTERVAL '4 days'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const item = evalReport.items[0];
      const acquiredMs = new Date(item.acquiredAt).getTime();
      const expiresMs = new Date(item.expiresAt).getTime();
      const diffDays = Math.round((expiresMs - acquiredMs) / (24 * 60 * 60 * 1000));

      // Debe estar topado a 30 días desde adquisición (no 4 + 7 = 11 días tras revisión que daría 32)
      expect(diffDays).toBe(STORY_MAX_ACQUISITION_RETENTION_DAYS);
    });

    it('1.6. Propuesta convertida en evento futuro: cartel efímero permanece activo', async () => {
      const storyId = generateTestStoryId();
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Concierto Futuro', CURRENT_DATE + INTERVAL '1 day', NOW() + INTERVAL '1 day', $1, 'musica', 'published', 'instagram',
          'https://r2.vayaplan.com/stories/future.jpg'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Concierto Futuro Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/future.jpg', 'https://r2.vayaplan.com/stories/future.jpg',
          'approved_draft', $2, $3, NOW() - INTERVAL '1 day'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);
      expect(evalReport.items[0].isExpired).toBe(false);
      expect(evalReport.items[0].recommendedAction).toBe('keep_active');
      expect(evalReport.items[0].reason).toContain('Evento futuro o en curso');
    });

    it('1.7. Propuesta convertida en evento celebrado (> 48h tras la fecha): recomienda desacoplar imagen efímera conservando evento', async () => {
      const storyId = generateTestStoryId();
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Cata Celebrada Pasada', CURRENT_DATE - INTERVAL '5 days', NOW() - INTERVAL '5 days', $1, 'gastronomia', 'published', 'instagram',
          'https://r2.vayaplan.com/stories/past.jpg'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Cata Celebrada Pasada Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/past.jpg', 'https://r2.vayaplan.com/stories/past.jpg',
          'approved_draft', $2, $3, NOW() - INTERVAL '6 days'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);
      const item = evalReport.items[0];
      expect(item.isExpired).toBe(true);
      expect(item.recommendedAction).toBe('detach_event_story_image');
      expect(item.eventId).toBe(eventId);
      expect(item.reason).toContain('desacoplar la imagen efímera del evento, conservando los datos factuales');
    });

    it('1.8. Propuesta convertida en evento futuro lejano: cartel efímero topado a 30 días desde adquisición', async () => {
      const storyId = generateTestStoryId();
      // Evento a 60 días en el futuro
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Festival Lejano', CURRENT_DATE + INTERVAL '60 days', NOW() + INTERVAL '60 days', $1, 'concierto', 'published', 'instagram',
          'https://r2.vayaplan.com/stories/far.jpg'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      // Propuesta adquirida hace 5 días
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Festival Lejano Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/far.jpg', 'https://r2.vayaplan.com/stories/far.jpg',
          'approved_draft', $2, $3, NOW() - INTERVAL '5 days'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const item = evalReport.items[0];
      const acquiredMs = new Date(item.acquiredAt).getTime();
      const expiresMs = new Date(item.expiresAt).getTime();
      const diffDays = Math.round((expiresMs - acquiredMs) / (24 * 60 * 60 * 1000));

      // La fecha de vencimiento debe toparse a 30 días desde adquisición (no 62 días)
      expect(diffDays).toBe(STORY_MAX_ACQUISITION_RETENTION_DAYS);
    });

    it('1.9. Sustitución de cartel: identifica la nueva procedencia y planifica purga de la story anterior sin tocar la nueva', async () => {
      const storyId = generateTestStoryId();
      // El evento tiene un cartel oficial aportado por el local
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Fiesta con Cartel Oficial Bar', CURRENT_DATE + INTERVAL '2 days', NOW() + INTERVAL '2 days', $1, 'dj_tardeo', 'published', 'instagram',
          'https://r2.vayaplan.com/official_posters/bar_official_flier.jpg'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Fiesta Propuesta Story', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/substituted_temp.jpg', 'https://r2.vayaplan.com/stories/substituted_temp.jpg',
          'approved_draft', $2, $3, NOW()
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      expect(evalReport.items.length).toBe(1);
      const item = evalReport.items[0];
      expect(item.isImageSubstituted).toBe(true);
      expect(item.substitutedImageUrl).toBe('https://r2.vayaplan.com/official_posters/bar_official_flier.jpg');
      expect(item.substitutedImageProvenance).toBe('venue_official');
      expect(item.recommendedAction).toBe('already_substituted');
      expect(item.reason).toContain('sin afectar a la nueva imagen del evento');
    });

    it('1.10. Referencias compartidas: informa detalle de propuestas dependientes y no purga R2 a ciegas', async () => {
      const sharedKey = `shared_asset_${Date.now()}.jpg`;
      const storyId1 = generateTestStoryId();
      const storyId2 = generateTestStoryId();

      const p1 = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta 1', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, $2, 'https://r2.vayaplan.com/' || $2,
          'rejected', $3, NOW() - INTERVAL '15 days'
        ) RETURNING id;`,
        [storyId1, sharedKey, testVenueId]
      );

      await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta 2 Activa Hermana', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, $2, 'https://r2.vayaplan.com/' || $2,
          'pending', $3, NOW() - INTERVAL '1 day'
        ) RETURNING id;`,
        [storyId2, sharedKey, testVenueId]
      );

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: p1.rows[0].id });
      expect(evalReport.items.length).toBe(1);
      const item = evalReport.items[0];
      expect(item.crossReferenceCount).toBe(1);
      expect(item.mediaPhysicalPurgeBlockedBySharedReferences).toBe(true);
      expect(item.sharedReferenceDetails?.length).toBe(1);
      expect(item.sharedReferenceDetails?.[0].title).toBe('Propuesta 2 Activa Hermana');
      expect(item.reason).toContain('El archivo en R2 se preserva temporalmente por 1 referencias compartidas');
    });
  });

  describe('2. Modo de Ejecución Real y Dry-Run (executeStoryRetentionPolicy)', () => {
    it('2.1. executeStoryRetentionPolicy({ dryRun: true }) simula sin modificar base de datos', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, caption, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta a simular', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/test_dry.jpg', 'https://r2.vayaplan.com/stories/test_dry.jpg',
          'Texto de caption original a preservar en dryrun', 'rejected', $2, NOW() - INTERVAL '20 days'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const result = await executeStoryRetentionPolicy({ dryRun: true, targetProposalId: propId });
      expect(result.dryRun).toBe(true);
      expect(result.purgedR2ObjectsCount).toBe(1);
      expect(result.auditLog.length).toBe(1);
      expect(result.auditLog[0].action).toContain('[DRY_RUN]');

      // Verificar que en la base de datos la propuesta sigue INTACTA con su caption
      const check = await query(`SELECT r2_key, review_status, caption FROM curation_proposals WHERE id = $1;`, [propId]);
      expect(check.rows[0].r2_key).toBe('stories/test_dry.jpg');
      expect(check.rows[0].review_status).toBe('rejected');
      expect(check.rows[0].caption).toContain('Texto de caption original');
    });

    it('2.2. executeStoryRetentionPolicy({ dryRun: false }) elimina caption completo, desacopla evento y preserva hechos factuales', async () => {
      const storyId = generateTestStoryId();
      // Crear evento celebrado hace 4 días
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Concierto Vencido a Desacoplar', CURRENT_DATE - INTERVAL '4 days', NOW() - INTERVAL '4 days', $1, 'musica', 'published', 'instagram',
          'https://r2.vayaplan.com/stories/exec_test.jpg'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, caption, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Concierto Vencido Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/exec_test.jpg', 'https://r2.vayaplan.com/stories/exec_test.jpg',
          'Este es el texto completo del cartel de la historia', 'approved_draft', $2, $3, NOW() - INTERVAL '5 days'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      // Ejecutar acción manual de retención
      const result = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId,
        operatorEmail: 'admin_test@vayaplan.com',
      });

      expect(result.dryRun).toBe(false);
      expect(result.detachedEventImagesCount).toBe(1);
      expect(result.purgedR2ObjectsCount).toBe(1);

      // Comprobar que en PostgreSQL:
      // 1. El evento SIGUE EXISTIENDO con todos sus datos factuales, pero image_url es NULL
      const evCheck = await query(`SELECT title, editorial_date, image_url FROM events WHERE id = $1;`, [eventId]);
      expect(evCheck.rows[0].title).toBe('Concierto Vencido a Desacoplar');
      expect(evCheck.rows[0].image_url).toBeNull();

      // 2. La propuesta ha purgado su caption por completo (NULL) y su r2_key
      const propCheck = await query(`SELECT r2_key, caption, dedupe_key FROM curation_proposals WHERE id = $1;`, [propId]);
      expect(propCheck.rows[0].r2_key).toBeNull();
      expect(propCheck.rows[0].caption).toBeNull(); // No conservar caption como hecho cultural
      expect(propCheck.rows[0].dedupe_key).toBe(`instagram_story_${storyId}`); // dedupe_key preservada
    });

    it('2.3. executeStoryRetentionPolicy({ dryRun: false }) con referencias cruzadas: desacopla evento pero no purga R2 físicamente', async () => {
      const sharedKey = `shared_exec_${Date.now()}.jpg`;
      const storyId1 = generateTestStoryId();
      const storyId2 = generateTestStoryId();

      // Evento vencido
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Evento 1 Vencido', CURRENT_DATE - INTERVAL '5 days', NOW() - INTERVAL '5 days', $1, 'gastronomia', 'published', 'instagram',
          'https://r2.vayaplan.com/' || $2
        ) RETURNING id;`,
        [testVenueId, sharedKey]
      );
      const eventId = evIns.rows[0].id;

      // Propuesta 1 (vencida)
      const p1 = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Propuesta 1 Vencida', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, $2, 'https://r2.vayaplan.com/' || $2,
          'approved_draft', $3, $4, NOW() - INTERVAL '6 days'
        ) RETURNING id;`,
        [storyId1, sharedKey, testVenueId, eventId]
      );
      const propId1 = p1.rows[0].id;

      // Propuesta 2 (activa, comparte el mismo archivo R2)
      await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta 2 Activa Compartida', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, $2, 'https://r2.vayaplan.com/' || $2,
          'pending', $3, NOW() - INTERVAL '1 day'
        ) RETURNING id;`,
        [storyId2, sharedKey, testVenueId]
      );

      const result = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId1,
        operatorEmail: 'admin_test@vayaplan.com',
      });

      // El evento desacopla la imagen, pero la purga física en R2 se aplaza por referencias compartidas
      expect(result.detachedEventImagesCount).toBe(1);
      expect(result.deferredR2PurgesCount).toBe(1);
      expect(result.purgedR2ObjectsCount).toBe(0);

      const auditDeferred = result.auditLog.find((a) => a.action === 'r2_physical_purge_deferred_due_to_shared_references');
      expect(auditDeferred).toBeDefined();
    });
  });

  describe('3. Verificación de Feature Flag (ENABLE_INSTAGRAM_STORY_IMPORT = false)', () => {
    it('3.1. Con flag desactivado: prepare-paid-fallback rechaza historias con 403 y no inicia runs', async () => {
      const testStoryShortcode = generateTestStoryId();
      const testStoryUrl = `https://www.instagram.com/stories/elautenticobar/${testStoryShortcode}/`;

      const prep = await preparePaidImportAuthorization({
        url: testStoryUrl,
        userEmail: 'curator@vayaplan.com',
      });

      expect(prep.success).toBe(false);
      expect(prep.status).toBe(403);
      expect(prep.code).toBe('story_import_disabled_retention_policy_required');
      expect(prep.canCompleteManually).toBe(true);
      expect(prep.error).toContain('política de retención');
    });

    it('3.2. Con flag desactivado: no se elude llamando directamente a executeAuthorizedPaidImport', async () => {
      const testStoryShortcode = generateTestStoryId();
      const testStoryUrl = `https://www.instagram.com/stories/elautenticobar/${testStoryShortcode}/`;

      const exec = await executeAuthorizedPaidImport({
        operationId: 'op_fake_bypass_attempt',
        canonicalUrl: testStoryUrl,
        shortcode: testStoryShortcode,
        userEmail: 'curator@vayaplan.com',
      });

      expect(exec.success).toBe(false);
      expect(exec.status).toBe(403);
      expect(exec.code).toBe('story_import_disabled_retention_policy_required');
    });

    it('3.3. Con flag desactivado: recuperación de operación previa "succeeded" devuelve la propuesta sin relanzar runs', async () => {
      const existingShortcode = generateTestStoryId();
      const existingUrl = `https://www.instagram.com/stories/elautenticobar/${existingShortcode}/`;
      const opId = `op_recovered_${Date.now()}`;

      // Crear propuesta ya existente previamente con image_url válida
      const propIns = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          image_url, review_status, venue_id
        ) VALUES (
          'Historia Previamente Extraída', $1::text, $2::varchar, 'instagram_story_' || $2::text,
          'https://r2.vayaplan.com/stories/preextracted.jpg', 'pending', $3
        ) RETURNING id;`,
        [existingUrl, existingShortcode, testVenueId]
      );
      const propId = propIns.rows[0].id;

      // Crear lock en estado 'succeeded' con proposalId asociado
      await query(
        `INSERT INTO instagram_ingestion_locks (
          lock_key, locked_by, locked_at, expires_at, released_at, execution_details
        ) VALUES (
          $1, 'curator@vayaplan.com', NOW(), NOW() + INTERVAL '10 minutes', NOW(),
          $2
        );`,
        [
          `ig_paid_story:${existingShortcode}`,
          JSON.stringify({
            operationId: opId,
            canonicalUrl: existingUrl,
            shortcode: existingShortcode,
            userEmail: 'curator@vayaplan.com',
            status: 'succeeded',
            proposalId: propId,
          }),
        ]
      );

      // Llamar a executeAuthorizedPaidImport: debe recuperar 200 already_completed con la propuesta
      const exec = await executeAuthorizedPaidImport({
        operationId: opId,
        canonicalUrl: existingUrl,
        shortcode: existingShortcode,
        userEmail: 'curator@vayaplan.com',
      });

      expect(exec.success).toBe(true);
      expect(exec.status).toBe(200);
      expect(exec.code).toBe('already_completed');
      expect(exec.proposal).toBeDefined();
      expect(exec.proposal.id).toBe(propId);
    });

    it('3.4. Con flag desactivado: operación previa "uncertain" preserva trazabilidad (409) sin relanzar', async () => {
      const uncertainShortcode = generateTestStoryId();
      const uncertainUrl = `https://www.instagram.com/stories/elautenticobar/${uncertainShortcode}/`;
      const opId = `op_unc_${Date.now()}`;

      await query(
        `INSERT INTO instagram_ingestion_locks (
          lock_key, locked_by, locked_at, expires_at, released_at, execution_details
        ) VALUES (
          $1, 'curator@vayaplan.com', NOW(), NOW() + INTERVAL '10 minutes', NOW(),
          $2
        );`,
        [
          `ig_paid_story:${uncertainShortcode}`,
          JSON.stringify({
            operationId: opId,
            canonicalUrl: uncertainUrl,
            shortcode: uncertainShortcode,
            userEmail: 'curator@vayaplan.com',
            status: 'uncertain',
            error: 'Timeout al iniciar el run en Apify',
          }),
        ]
      );

      const exec = await executeAuthorizedPaidImport({
        operationId: opId,
        canonicalUrl: uncertainUrl,
        shortcode: uncertainShortcode,
        userEmail: 'curator@vayaplan.com',
      });

      expect(exec.success).toBe(false);
      expect(exec.status).toBe(409);
      expect(exec.code).toBe('operation_uncertain');
      expect(exec.operation).toBeDefined();
      expect(exec.operation.status).toBe('uncertain');
    });

    it('3.5. Publicaciones y reels habituales (/p/ y /reel/) no se ven afectados por el flag de historias', async () => {
      const postShortcode = `post_regular_${Date.now()}`;
      const postUrl = `https://www.instagram.com/p/${postShortcode}/`;

      const prep = await preparePaidImportAuthorization({
        url: postUrl,
        userEmail: 'curator@vayaplan.com',
        venueId: testVenueId,
      });

      expect(prep.success).toBe(true);
      expect(prep.status).toBe(200);
      expect(prep.data?.contentType).toBe('post');
      expect(prep.data?.shortcode).toBe(postShortcode);
    });
  });

  describe('4. Endpoints de Administración: Vista Previa y Acción Manual con Confirmación', () => {
    it('4.1. GET /api/v1/admin/proposals/story-retention/preview exige autenticación y devuelve vista previa dry-run', async () => {
      // Sin autenticación -> 401
      const resUnauth = await app.request('/api/v1/admin/proposals/story-retention/preview', {
        method: 'GET',
      });
      expect(resUnauth.status).toBe(401);

      // Con autenticación admin -> 200 con reporte
      const resAuth = await app.request('/api/v1/admin/proposals/story-retention/preview', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      expect(resAuth.status).toBe(200);
      const data = await resAuth.json();
      expect(data.success).toBe(true);
      expect(data.report.dryRun).toBe(true);
      expect(Array.isArray(data.report.items)).toBe(true);
    });

    it('4.2. POST /api/v1/admin/proposals/story-retention/execute exige confirm: true explícito', async () => {
      // Envío sin confirm: true -> 400
      const resNoConfirm = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: false }),
      });
      expect(resNoConfirm.status).toBe(400);
      const data = await resNoConfirm.json();
      expect(data.code).toBe('confirmation_required');
      expect(data.canPreview).toBe(true);

      // Envío con confirm: true -> 200
      const resConfirm = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      expect(resConfirm.status).toBe(200);
      const okData = await resConfirm.json();
      expect(okData.success).toBe(true);
      expect(okData.result.dryRun).toBe(false);
    });
  });

  describe('5. Verificación de Migración DDL 021 y Rollback Seguro', () => {
    it('5.1. Migración 021 se aplica limpiamente y su rollback revierte los cambios sin errores', async () => {
      const upSqlPath = resolve(process.cwd(), 'infra/migrations/021_story_retention_and_media_lifecycle.sql');
      const downSqlPath = resolve(process.cwd(), 'infra/migrations/rollback_021_story_retention_and_media_lifecycle.sql');

      const upSql = readFileSync(upSqlPath, 'utf-8');
      const downSql = readFileSync(downSqlPath, 'utf-8');

      // 1. Ejecutar UP
      await query(upSql);

      // Verificar que las columnas existen en curation_proposals
      const cpCols = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'curation_proposals' 
          AND column_name IN ('retention_expires_at', 'media_purged_at', 'media_source_provenance');
      `);
      expect(cpCols.rows.length).toBe(3);

      // Verificar que las columnas existen en events
      const evCols = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
          AND column_name IN ('image_provenance', 'story_retention_expires_at', 'story_media_detached_at');
      `);
      expect(evCols.rows.length).toBe(3);

      // 2. Ejecutar ROLLBACK
      await query(downSql);

      // Verificar que las columnas fueron eliminadas en curation_proposals
      const cpColsAfter = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'curation_proposals' 
          AND column_name IN ('retention_expires_at', 'media_purged_at', 'media_source_provenance');
      `);
      expect(cpColsAfter.rows.length).toBe(0);

      // Verificar que las columnas fueron eliminadas en events
      const evColsAfter = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
          AND column_name IN ('image_provenance', 'story_retention_expires_at', 'story_media_detached_at');
      `);
      expect(evColsAfter.rows.length).toBe(0);
    });
  });

  afterAll(async () => {
    // Limpieza de datos creados en la suite de retención
    await query(`DELETE FROM curation_proposals WHERE dedupe_key LIKE 'instagram_story_40186588%';`);
    await query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'ig_paid_story:40186588%';`);
  });
});
