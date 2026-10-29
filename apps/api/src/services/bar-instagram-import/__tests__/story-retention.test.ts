import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { query } from '@vayaplan/db';
import {
  evaluateStoryRetentionDryRun,
  executeStoryRetentionPolicy,
  STORY_PENDING_RETENTION_DAYS,
  STORY_REJECTED_RETENTION_DAYS,
  STORY_EVENT_MEDIA_GRACE_DAYS,
} from '../story-retention-service';
import {
  preparePaidImportAuthorization,
  executeAuthorizedPaidImport,
} from '../fallback-coordinator';

function generateTestStoryId(): string {
  return `40186588${Math.floor(1000000000 + Math.random() * 9000000000)}`;
}

describe('Política de Retención y Ciclo de Vida de Historias de Instagram', () => {
  let testVenueId: number;

  beforeEach(async () => {
    // Asegurar local de prueba con city_id válido
    const vRes = await query(`
      INSERT INTO venues (name, slug, city_id, is_active)
      VALUES ('Bar Retención Test', 'bar-retencion-test-' || floor(random()*1000000)::text, 1, true)
      RETURNING id;
    `);
    testVenueId = vRes.rows[0].id;
  });

  describe('1. Evaluación en modo SOLO LECTURA (Dry-Run)', () => {
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
      expect(evalReport.items[0].reason).toContain(`más de ${STORY_REJECTED_RETENTION_DAYS} días`);
    });

    it('1.5. Propuesta convertida en evento futuro: cartel efímero permanece activo', async () => {
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

    it('1.6. Propuesta convertida en evento celebrado (> 48h tras la fecha): recomienda desacoplar imagen efímera conservando evento', async () => {
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
      expect(item.reason).toContain('desacoplar la imagen efímera y purgar el archivo R2, conservando el evento intacto');
    });

    it('1.7. Sustitución de cartel efímero por material oficial del local: detecta desacoplamiento previo y permite purgar story', async () => {
      const storyId = generateTestStoryId();
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
      expect(item.recommendedAction).toBe('already_substituted');
      expect(item.reason).toContain('ya cuenta con imagen oficial independiente aportada por el local');
    });

    it('1.8. Protección de referencias cruzadas: si dos propuestas comparten r2_key, crossReferenceCount previene borrado prematuro', async () => {
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
          'Propuesta 2 Activa', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, $2, 'https://r2.vayaplan.com/' || $2,
          'pending', $3, NOW() - INTERVAL '1 day'
        ) RETURNING id;`,
        [storyId2, sharedKey, testVenueId]
      );

      const evalReport = await evaluateStoryRetentionDryRun({ targetProposalId: p1.rows[0].id });
      expect(evalReport.items.length).toBe(1);
      const item = evalReport.items[0];
      expect(item.crossReferenceCount).toBe(1);
    });
  });

  describe('2. Modo de Ejecución Dry-Run seguro (executeStoryRetentionPolicy)', () => {
    it('2.1. executeStoryRetentionPolicy({ dryRun: true }) simula sin modificar base de datos', async () => {
      const storyId = generateTestStoryId();
      const ins = await query(
        `INSERT INTO curation_proposals (
          title, source_url, instagram_post_shortcode, dedupe_key,
          r2_key, image_url, review_status, venue_id, created_at
        ) VALUES (
          'Propuesta a simular', 'https://www.instagram.com/stories/elautenticobar/' || $1::text || '/',
          $1::varchar, 'instagram_story_' || $1::text, 'stories/test_dry.jpg', 'https://r2.vayaplan.com/stories/test_dry.jpg',
          'rejected', $2, NOW() - INTERVAL '20 days'
        ) RETURNING id;`,
        [storyId, testVenueId]
      );
      const propId = ins.rows[0].id;

      const result = await executeStoryRetentionPolicy({ dryRun: true, targetProposalId: propId });
      expect(result.dryRun).toBe(true);
      expect(result.purgedR2ObjectsCount).toBe(1);
      expect(result.auditLog.length).toBe(1);
      expect(result.auditLog[0].action).toContain('[DRY_RUN]');

      // Verificar que en la base de datos la propuesta sigue INTACTA
      const check = await query(`SELECT r2_key, review_status FROM curation_proposals WHERE id = $1;`, [propId]);
      expect(check.rows[0].r2_key).toBe('stories/test_dry.jpg');
      expect(check.rows[0].review_status).toBe('rejected');
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

  afterAll(async () => {
    // Limpieza de datos creados en la suite de retención
    await query(`DELETE FROM curation_proposals WHERE dedupe_key LIKE 'instagram_story_40186588%';`);
    await query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'ig_paid_story:40186588%';`);
  });
});
