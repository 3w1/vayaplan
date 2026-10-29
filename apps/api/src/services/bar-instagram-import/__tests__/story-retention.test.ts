import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { query } from '@vayaplan/db';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateStoryRetentionDryRun,
  executeStoryRetentionPolicy,
  countPendingExpiredStoryItems,
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
      expect(evalReport.previewToken.startsWith('prv_')).toBe(true);
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
      expect(item.reason).toContain('desacoplar la imagen efímera del evento');
    });

    it('1.8. Propuesta convertida en evento futuro lejano: cartel efímero topado a 30 días desde adquisición', async () => {
      const storyId = generateTestStoryId();
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

      expect(diffDays).toBe(STORY_MAX_ACQUISITION_RETENTION_DAYS);
    });

    it('1.9. Fin real de evento explícito (end_time con cruce de medianoche): calcula vencimiento desde end_time real', async () => {
      const storyId = generateTestStoryId();
      // Fiesta que inició ayer a las 23:00 y finalizó hoy a las 05:00 de la madrugada (+1 día)
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, end_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Sesión DJ Noche', CURRENT_DATE - INTERVAL '1 day', NOW() - INTERVAL '25 hours', NOW() - INTERVAL '19 hours',
          $1, 'dj_tardeo', 'published', 'instagram', 'https://r2.vayaplan.com/stories/dj_night.jpg'
        ) RETURNING id, end_time;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;
      const expectedEndMs = new Date(evIns.rows[0].end_time).getTime();

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Sesión DJ Noche Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/dj_night.jpg', 'https://r2.vayaplan.com/stories/dj_night.jpg',
          'approved_draft', $2, $3, NOW() - INTERVAL '2 days'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const item = evalReport.items[0];
      const calcEndMs = new Date(item.eventCalculatedEndUtc!).getTime();

      // Debe coincidir exactamente con end_time del evento (no con editorial_date 23:59:59)
      expect(Math.abs(calcEndMs - expectedEndMs)).toBeLessThan(1000);
      expect(item.isExpired).toBe(false); // Han pasado solo 19h tras el fin, gracia de 48h sigue activa
    });

    it('1.10. Evento multijornada (end_date > editorial_date): calcula fin al término del último día en zona horaria de la ciudad', async () => {
      const storyId = generateTestStoryId();
      // Feria gastronómica de fin de semana (de viernes a domingo hace 4 días)
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, end_date, venue_id, category, status, source_type, image_url, time_status
        ) VALUES (
          1, 'Feria Gastro 3 Días', CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE - INTERVAL '4 days',
          $1, 'gastronomia', 'published', 'instagram', 'https://r2.vayaplan.com/stories/feria.jpg', 'pending_time'
        ) RETURNING id;`,
        [testVenueId]
      );
      const eventId = evIns.rows[0].id;

      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_event_id, created_at
        ) VALUES (
          'Feria Gastro 3 Días Prop', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/feria.jpg', 'https://r2.vayaplan.com/stories/feria.jpg',
          'approved_draft', $2, $3, NOW() - INTERVAL '7 days'
        ) RETURNING id;`,
        [storyId, testVenueId, eventId]
      );
      const propId = ins.rows[0].id;

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const item = evalReport.items[0];

      expect(item.eventEndDate).toBeDefined();
      expect(item.cityTimezone).toBe('Europe/Madrid');
      expect(item.isExpired).toBe(true); // Finalizó hace 4 días (> 48h)
      expect(item.recommendedAction).toBe('detach_event_story_image');
    });

    it('1.11. Sustitución de cartel: sin evidencia registrada explícita, marca procedencia unknown', async () => {
      const storyId = generateTestStoryId();
      const evIns = await query(
        `INSERT INTO events (
          city_id, title, editorial_date, start_time, venue_id, category, status, source_type, image_url
        ) VALUES (
          1, 'Fiesta con Cartel Aportado', CURRENT_DATE + INTERVAL '2 days', NOW() + INTERVAL '2 days', $1, 'dj_tardeo', 'published', 'instagram',
          'https://images.bar-external.com/flyer_new.jpg'
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
      const item = evalReport.items[0];
      expect(item.isImageSubstituted).toBe(true);
      expect(item.substitutedImageUrl).toBe('https://images.bar-external.com/flyer_new.jpg');
      // Procedencia explícita desconocida sin evidencia registrada
      expect(item.substitutedImageProvenance).toBe('unknown');
      expect(item.recommendedAction).toBe('already_substituted');
      expect(item.reason).toContain('sin afectar a la nueva imagen del evento');
    });

    it('1.12. Referencias compartidas: informa detalle exhaustivo y bloquea purga física en R2', async () => {
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
      const item = evalReport.items[0];
      expect(item.crossReferenceCount).toBe(1);
      expect(item.mediaPhysicalPurgeBlockedBySharedReferences).toBe(true);
      expect(item.sharedReferenceDetails?.length).toBe(1);
      expect(item.sharedReferenceDetails?.[0].targetTitle).toBe('Propuesta 2 Activa Hermana');
      expect(item.reason).toContain('El archivo en R2 se preserva temporalmente por 1 referencias compartidas');
    });
  });

  describe('2. Modo de Ejecución Real y Control Optimista con previewToken', () => {
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

      const check = await query(`SELECT r2_key, review_status, caption FROM curation_proposals WHERE id = $1;`, [propId]);
      expect(check.rows[0].r2_key).toBe('stories/test_dry.jpg');
      expect(check.rows[0].review_status).toBe('rejected');
      expect(check.rows[0].caption).toContain('Texto de caption original');
    });

    it('2.2. executeStoryRetentionPolicy({ dryRun: false }) exige previewToken válido (control optimista)', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta Token Test', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/token_test.jpg', 'https://r2.vayaplan.com/stories/token_test.jpg',
          'rejected', $2, NOW() - INTERVAL '20 days'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      // 1. Sin previewToken -> Falla con preview_token_required
      const resNoToken = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId,
      });
      expect(resNoToken.success).toBe(false);
      expect(resNoToken.code).toBe('preview_token_required');

      // 2. Con previewToken obsoleto/erróneo -> Falla con preview_state_conflict
      const resBadToken = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId,
        previewToken: 'prv_invalid_hash_1234567890',
      });
      expect(resBadToken.success).toBe(false);
      expect(resBadToken.code).toBe('preview_state_conflict');

      // 3. Con previewToken exacto de la vista previa -> Éxito
      const preview = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const resOk = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId,
        previewToken: preview.previewToken,
        operatorEmail: 'curator@vayaplan.com',
      });
      expect(resOk.success).toBe(true);
      expect(resOk.purgedR2ObjectsCount).toBe(1);
    });

    it('2.3. executeStoryRetentionPolicy({ dryRun: false }) elimina caption completo, desacopla evento y preserva hechos factuales', async () => {
      const storyId = generateTestStoryId();
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

      const preview = await evaluateStoryRetentionDryRun({ targetProposalId: propId });
      const result = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId,
        previewToken: preview.previewToken,
        operatorEmail: 'admin_test@vayaplan.com',
      });

      expect(result.success).toBe(true);
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
      expect(propCheck.rows[0].caption).toBeNull();
      expect(propCheck.rows[0].dedupe_key).toBe(`instagram_story_${storyId}`);
    });

    it('2.4. executeStoryRetentionPolicy({ dryRun: false }) con referencias cruzadas: desacopla evento pero aplaza purga en R2', async () => {
      const sharedKey = `shared_exec_${Date.now()}.jpg`;
      const storyId1 = generateTestStoryId();
      const storyId2 = generateTestStoryId();

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

      const preview = await evaluateStoryRetentionDryRun({ targetProposalId: propId1 });
      const result = await executeStoryRetentionPolicy({
        dryRun: false,
        targetProposalId: propId1,
        previewToken: preview.previewToken,
        operatorEmail: 'admin_test@vayaplan.com',
      });

      expect(result.success).toBe(true);
      expect(result.detachedEventImagesCount).toBe(1);
      expect(result.deferredR2PurgesCount).toBe(1);
      expect(result.purgedR2ObjectsCount).toBe(0);

      const auditDeferred = result.auditLog.find((a) => a.action === 'r2_physical_purge_deferred_due_to_shared_references');
      expect(auditDeferred).toBeDefined();
    });
  });

  describe('3. Verificación de Feature Flag y Salvaguarda de Piloto', () => {
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

    it('3.6. countPendingExpiredStoryItems detecta backlog de vencimientos acumulados', async () => {
      const storyId = generateTestStoryId();
      await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Historia Backlog Test', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/backlog.jpg', 'https://r2.vayaplan.com/stories/backlog.jpg',
          'pending', $2, NOW() - INTERVAL '15 days'
        );`,
        [storyId, testVenueId]
      );

      const backlog = await countPendingExpiredStoryItems();
      expect(backlog.totalExpired).toBeGreaterThan(0);
      expect(backlog.expiredPending).toBeGreaterThan(0);
    });
  });

  describe('4. Endpoints de Administración: Vista Previa y Acción Manual con Confirmación', () => {
    it('4.1. GET /api/v1/admin/proposals/story-retention/preview exige autenticación y devuelve previewToken', async () => {
      const resUnauth = await app.request('/api/v1/admin/proposals/story-retention/preview', {
        method: 'GET',
      });
      expect(resUnauth.status).toBe(401);

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
      expect(typeof data.report.previewToken).toBe('string');
      expect(data.report.previewToken.startsWith('prv_')).toBe(true);
      expect(Array.isArray(data.report.items)).toBe(true);
    });

    it('4.2. POST /api/v1/admin/proposals/story-retention/execute exige confirm: true y previewToken válido', async () => {
      // 1. Envío sin confirm: true -> 400
      const resNoConfirm = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: false }),
      });
      expect(resNoConfirm.status).toBe(400);
      const dataNoConfirm = await resNoConfirm.json();
      expect(dataNoConfirm.code).toBe('confirmation_required');

      // 2. Envío sin previewToken -> 400 preview_token_required
      const resNoToken = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      expect(resNoToken.status).toBe(400);
      const dataNoToken = await resNoToken.json();
      expect(dataNoToken.code).toBe('preview_token_required');

      // 3. Envío con previewToken conflictivo/erróneo -> 409 preview_state_conflict
      const resBadToken = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: true, previewToken: 'prv_invalid_stale_token_123' }),
      });
      expect(resBadToken.status).toBe(409);
      const dataBadToken = await resBadToken.json();
      expect(dataBadToken.code).toBe('preview_state_conflict');

      // 4. Envío con previewToken real obtenido de /preview -> 200 OK
      const previewRes = await app.request('/api/v1/admin/proposals/story-retention/preview', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const previewData = await previewRes.json();
      const realToken = previewData.report.previewToken;

      const resOk = await app.request('/api/v1/admin/proposals/story-retention/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirm: true, previewToken: realToken }),
      });
      expect(resOk.status).toBe(200);
      const okData = await resOk.json();
      expect(okData.success).toBe(true);
      expect(okData.result.dryRun).toBe(false);
    });
  });

  describe('5. Verificación de Migración DDL 021 y Rollback Seguro', () => {
    it('5.1. Migración 021 valida esquema preexistente, se aplica limpiamente y su rollback revierte los cambios', async () => {
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
