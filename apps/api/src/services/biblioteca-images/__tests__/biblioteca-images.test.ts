import { describe, expect, test, beforeAll } from 'bun:test';
import sharp from 'sharp';
import {
  classifyImageStatus,
  determineRecommendedAction,
  KNOWN_BIBLIOTECA_SOURCES,
} from '../biblioteca-service';
import { processAndUploadBibliotecaImage } from '../biblioteca-r2-pipeline';

describe('Servicio de Imágenes Oficiales — Biblioteca Pública de Palencia', () => {
  beforeAll(() => {
    process.env.MOCK_R2 = 'true';
    process.env.R2_PUBLIC_URL = 'https://media.vayaplan.com';
  });

  describe('1. Clasificación de Estado de Imagen y Reglas de Sustitución', () => {
    test('Identifica SIN_IMAGEN ante valores nulos, vacíos o indefinidos', () => {
      expect(classifyImageStatus(null)).toBe('SIN_IMAGEN');
      expect(classifyImageStatus('')).toBe('SIN_IMAGEN');
      expect(classifyImageStatus('   ')).toBe('SIN_IMAGEN');
      expect(classifyImageStatus(undefined)).toBe('SIN_IMAGEN');
    });

    test('Identifica IMAGEN_GENERICA ante carteles generales o logos', () => {
      expect(
        classifyImageStatus(
          'https://jazzpalencia.es/wp-content/uploads/2026/09/Cartel-Jazz-2026.webp'
        )
      ).toBe('IMAGEN_GENERICA');
      expect(
        classifyImageStatus('https://example.com/logo-ayuntamiento.png')
      ).toBe('IMAGEN_GENERICA');
    });

    test('Identifica IMAGEN_OFICIAL_EXISTENTE ante imágenes trazables en R2 de la biblioteca', () => {
      expect(
        classifyImageStatus(
          'https://media.vayaplan.com/biblioteca-publica/exposicion/7f4561578072.webp'
        )
      ).toBe('IMAGEN_OFICIAL_EXISTENTE');
    });

    test('Reglas de sustitución asignan la acción recomendada correcta', () => {
      expect(determineRecommendedAction('SIN_IMAGEN')).toBe('ADOPTAR_IMAGEN_OFICIAL');
      expect(determineRecommendedAction('IMAGEN_GENERICA')).toBe('PROPONER_ALTERNATIVA');
      expect(determineRecommendedAction('IMAGEN_OFICIAL_EXISTENTE')).toBe('MANTENER_IMAGEN_ACTUAL');
      expect(determineRecommendedAction('REQUIERE_REVISION')).toBe('REQUIERE_REVISION');
    });
  });

  describe('2. Pipeline de Optimización WebP y Subida a Cloudflare R2', () => {
    test('Procesa y convierte a WebP una imagen JPEG con hash trazable', async () => {
      // Crear un buffer JPEG sintético válido con sharp (100x100)
      const mockJpeg = await sharp({
        create: {
          width: 200,
          height: 300,
          channels: 3,
          background: { r: 50, g: 100, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processAndUploadBibliotecaImage({
        eventId: 9,
        eventSlug: 'exposicion-agustin-hernandez',
        sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/35/937/BPA_AG_Exposicion_Mirada_Sincera_Cartel.jpg',
        sourcePageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/BibliotecaPalencia/es/Plantilla100Detalle/1284355840201/Evento/1285184301373/Comunicacion',
        sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
        credit: 'Biblioteca Pública de Palencia / Agustín Hernández',
        mockBuffer: mockJpeg,
      });

      expect(result.contentType).toBe('image/webp');
      expect(result.width).toBe(200);
      expect(result.height).toBe(300);
      expect(result.r2Key).toStartWith('biblioteca-publica/exposicion-agustin-hernandez/');
      expect(result.r2Key).toEndWith('.webp');
      expect(result.finalUrl).toBe(`https://media.vayaplan.com/${result.r2Key}`);
      expect(result.credit).toBe('Biblioteca Pública de Palencia / Agustín Hernández');
      expect(result.imageHash).toBeDefined();
      expect(result.imageHash.length).toBe(12);
    });

    test('Lanza excepción descriptiva si el buffer no es una imagen válida', async () => {
      const invalidBuffer = Buffer.from('not an image content at all');

      expect(
        processAndUploadBibliotecaImage({
          eventId: 14,
          eventSlug: 'mujeres-romanico',
          sourceImageUrl: 'https://example.com/bad.jpg',
          sourcePageUrl: 'https://example.com',
          sourceName: 'Test',
          credit: 'Test',
          mockBuffer: invalidBuffer,
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Verificación de Fuentes Oficiales Preconfiguradas', () => {
    test('El catálogo de fuentes oficiales incluye los 7 eventos del lote sin duplicados ni URLs no oficiales', () => {
      const keys = Object.keys(KNOWN_BIBLIOTECA_SOURCES).map(Number);
      expect(keys.length).toBe(7);
      expect(keys).toContain(9);
      expect(keys).toContain(14);
      expect(keys).toContain(16);
      expect(keys).toContain(19);
      expect(keys).toContain(35);
      expect(keys).toContain(44);
      expect(keys).toContain(46);

      keys.forEach((id) => {
        const item = KNOWN_BIBLIOTECA_SOURCES[id];
        expect(item.eventId).toBe(id);
        expect(item.sourceImageUrl).toMatch(/^https:\/\/(bibliotecas\.jcyl\.es|jazzpalencia\.es)\//);
        expect(item.sourcePageUrl).toMatch(/^https:\/\/(bibliotecas\.jcyl\.es|jazzpalencia\.es)\//);
        expect(item.credit).toBeDefined();
        expect(item.slug).toBeDefined();
      });
    });
  });

  describe('4. Persistencia y Semántica de Decisiones Editoriales (applyBibliotecaDecision)', () => {
    test('adopt: actualiza image_url, preserva image_original_url, registra en event_image_decisions y NO toca verified_at/verified_by', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 9,
                title: 'Exposición Agustín Hernández',
                image_url: null,
                image_thumb_url: null,
                image_original_url: null,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T10:00:00Z',
              }]
            };
          }
          if (sql.includes('UPDATE events')) {
            return {
              rows: [{
                id: 9,
                title: 'Exposición Agustín Hernández',
                image_url: params[0],
                image_thumb_url: params[0],
                image_original_url: params[1],
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T12:00:00Z',
              }]
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 101,
                event_id: params[0],
                candidate_key: params[1],
                candidate_url: params[2],
                action: params[3],
                operator_email: params[4],
                notes: params[5],
                idempotency_key: params[6],
                payload_hash: params[7],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 9,
        candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        action: 'adopt',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:00:00Z',
        previousImageUrl: null,
        adoptedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        adoptedR2Key: 'biblioteca-publica/exposicion/8a71.webp',
        adoptedCredit: 'Biblioteca Pública / Agustín Hernández',
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.event.image_url).toBe('https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp');
      expect(result.event.verified_by).toBeNull();
      expect(result.event.verified_at).toBeNull();

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeDefined();
      expect(updateCall!.params[0]).toBe('https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp');
      expect(updateCall!.sql).not.toContain('verified_by');
      expect(updateCall!.sql).not.toContain('verified_at');

      const insertCall = executedQueries.find(q => q.sql.includes('INSERT INTO event_image_decisions'));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params[3]).toBe('adopt');
      expect(insertCall!.params[4]).toBe('editor@vayaplan.com');
    });

    test('keep_current: NO modifica la tabla events, registra la decisión en event_image_decisions', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 19,
                title: 'Jazz en los libros',
                image_url: 'https://jazzpalencia.es/cartel.webp',
                image_thumb_url: 'https://jazzpalencia.es/cartel.webp',
                image_original_url: null,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T10:00:00Z',
              }]
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 102,
                event_id: params[0],
                candidate_key: params[1],
                candidate_url: params[2],
                action: params[3],
                operator_email: params[4],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 19,
        candidateKey: 'biblioteca-publica/el-jazz/514f.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz/514f.webp',
        action: 'keep_current',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:05:00Z',
        previousImageUrl: 'https://jazzpalencia.es/cartel.webp',
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.event.image_url).toBe('https://jazzpalencia.es/cartel.webp');
      expect(result.decision.action).toBe('keep_current');

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeUndefined();

      const insertCall = executedQueries.find(q => q.sql.includes('INSERT INTO event_image_decisions'));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params[3]).toBe('keep_current');
    });

    test('discard: descarta la propuesta, NO modifica la tabla events, registra en event_image_decisions', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 35,
                title: 'Sesión 1',
                image_url: null,
                image_thumb_url: null,
                image_original_url: null,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T10:00:00Z',
              }]
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 103,
                event_id: params[0],
                action: params[3],
                operator_email: params[4],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 35,
        candidateKey: 'biblioteca-publica/escucha-jazz-1/9279.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/escucha-jazz-1/9279.webp',
        action: 'discard',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:10:00Z',
        previousImageUrl: null,
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.decision.action).toBe('discard');

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeUndefined();
    });

    test('request_search: NO modifica events, registra la decisión en event_image_decisions', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 35,
                title: 'Sesión 1',
                image_url: null,
                image_thumb_url: null,
                image_original_url: null,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T10:00:00Z',
              }]
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 104,
                event_id: params[0],
                action: params[3],
                operator_email: params[4],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 35,
        candidateKey: 'biblioteca-publica/escucha-jazz-1/9279.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/escucha-jazz-1/9279.webp',
        action: 'request_search',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:15:00Z',
        previousImageUrl: null,
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.event.verified_at).toBeNull();
      expect(result.event.verified_by).toBeNull();

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeUndefined();

      const insertCall = executedQueries.find(q => q.sql.includes('INSERT INTO event_image_decisions'));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params[3]).toBe('request_search');
    });

    test('adopt repetido: NO sustituye image_original_url por la propia imagen candidata adoptada', async () => {
      const candidateUrl = 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp';
      const genuineOriginal = 'https://bibliotecas.jcyl.es/cartel-antiguo.jpg';
      const executedQueries: { sql: string; params: any[] }[] = [];

      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 9,
                title: 'Exposición Agustín Hernández',
                image_url: candidateUrl, // Ya adoptada
                image_thumb_url: candidateUrl,
                image_original_url: genuineOriginal, // Original histórico
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T11:55:30Z',
              }],
            };
          }
          if (sql.includes('UPDATE events')) {
            return {
              rows: [{
                id: 9,
                image_url: params[0],
                image_thumb_url: params[0],
                image_original_url: genuineOriginal,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T12:00:00Z',
              }],
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 105,
                event_id: params[0],
                action: params[3],
                operator_email: params[4],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {},
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      await applyBibliotecaDecision({
        eventId: 9,
        candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
        candidateUrl: candidateUrl,
        action: 'adopt',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:00:00Z',
        previousImageUrl: candidateUrl,
        adoptedImageUrl: candidateUrl,
      }, mockClient);

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeDefined();
      // El parámetro $2 para image_original_url DEBE ser NULL porque la imagen actual ya era igual a la candidata
      expect(updateCall!.params[1]).toBeNull();
      expect(updateCall!.sql).toContain('image_original_url = COALESCE(image_original_url, $2)');
    });

    test('request_search sobre evento con verificación editorial general previa: NO borra ni altera verified_at', async () => {
      const preExistingVerifiedAt = '2026-10-19T23:44:57.000Z';
      const executedQueries: { sql: string; params: any[] }[] = [];

      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 9,
                title: 'Exposición Agustín Hernández',
                image_url: null,
                image_thumb_url: null,
                image_original_url: null,
                verified_by: 'curador@vayaplan.com',
                verified_at: preExistingVerifiedAt,
                updated_at: '2026-10-19T23:44:57.000Z',
              }],
            };
          }
          if (sql.includes('INSERT INTO event_image_decisions')) {
            return {
              rows: [{
                id: 106,
                event_id: params[0],
                action: params[3],
                operator_email: params[4],
                created_at: new Date().toISOString(),
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {},
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 9,
        candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        action: 'request_search',
        operatorEmail: 'editor@vayaplan.com',
        decisionTimestamp: '2026-10-27T12:20:00Z',
        previousImageUrl: null,
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.event.verified_at).toBe(preExistingVerifiedAt);
      expect(result.event.verified_by).toBe('curador@vayaplan.com');

      const updateCall = executedQueries.find(q => q.sql.includes('UPDATE events'));
      expect(updateCall).toBeUndefined();
    });

    test('Idempotencia: repetir decisión con misma idempotencyKey y payload retorna idempotent: true sin insertar duplicado', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const canonicalPayload = JSON.stringify({
        eventId: 9,
        candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        action: 'adopt',
        notes: '',
      });
      const crypto = await import('node:crypto');
      const payloadHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

      const mockClient = {
        query: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 9,
                title: 'Exposición Agustín Hernández',
                image_url: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
                image_thumb_url: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
                image_original_url: null,
                verified_by: null,
                verified_at: null,
                updated_at: '2026-10-27T12:00:00Z',
              }]
            };
          }
          if (sql.includes('SELECT * FROM event_image_decisions WHERE idempotency_key = $1')) {
            return {
              rows: [{
                id: 200,
                event_id: 9,
                candidate_key: 'biblioteca-publica/exposicion/8a71.webp',
                candidate_url: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
                action: 'adopt',
                operator_email: 'editor@vayaplan.com',
                idempotency_key: 'idem-test-key-1',
                payload_hash: payloadHash,
                created_at: '2026-10-27T12:00:00Z',
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      const result = await applyBibliotecaDecision({
        eventId: 9,
        candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        action: 'adopt',
        operatorEmail: 'editor@vayaplan.com',
        idempotencyKey: 'idem-test-key-1',
      }, mockClient);

      expect(result.success).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.decision.id).toBe(200);

      const insertCall = executedQueries.find(q => q.sql.includes('INSERT INTO event_image_decisions'));
      expect(insertCall).toBeUndefined();
    });

    test('Conflicto de Idempotencia: reutilizar idempotencyKey con payload divergente lanza idempotency_conflict', async () => {
      const mockClient = {
        query: async (sql: string) => {
          if (sql.includes('FROM events') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: 9,
                image_url: null,
                image_thumb_url: null,
                image_original_url: null,
                verified_by: null,
                verified_at: null,
              }]
            };
          }
          if (sql.includes('SELECT * FROM event_image_decisions WHERE idempotency_key = $1')) {
            return {
              rows: [{
                id: 201,
                idempotency_key: 'idem-conflict-key',
                payload_hash: 'different_hash_from_another_payload',
              }]
            };
          }
          return { rows: [] };
        },
        release: () => {}
      };

      const { applyBibliotecaDecision } = await import('../biblioteca-service');
      expect(
        applyBibliotecaDecision({
          eventId: 9,
          candidateKey: 'biblioteca-publica/exposicion/8a71.webp',
          candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
          action: 'adopt',
          operatorEmail: 'editor@vayaplan.com',
          idempotencyKey: 'idem-conflict-key',
        }, mockClient)
      ).rejects.toThrow('idempotency_conflict');
    });
  });

  describe('5. Auditoría de Estado y Decisiones Dedicadas (getLatestEventImageDecisions)', () => {
    test('Un evento sin registro en event_image_decisions permanece PENDIENTE aunque las URLs coincidan', async () => {
      const mockQuery = async () => ({
        rows: [{
          id: 44,
          title: 'zo brinviyer con Lachy Torriente',
          editorial_date: '2026-11-18',
          end_date: null,
          start_time: '20:00:00',
          time_status: 'confirmed',
          schedule_text: null,
          venue_id: 10127,
          venue_name: 'Biblioteca Pública de Palencia',
          image_url: 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer/a0b7.webp',
          source_type: 'api',
          source_url: '',
          verified_at: '2026-10-27T11:56:00Z',
          verified_by: 'admin@vayaplan.com',
        }]
      });

      const { getBibliotecaEventsInventory, getLatestEventImageDecisions } = await import('../biblioteca-service');
      const inventory = await getBibliotecaEventsInventory('2026-10-24', mockQuery);

      expect(inventory.length).toBe(1);

      // Simular consulta a event_image_decisions sin registros
      const mockDecisionsQuery = async () => ({ rows: [] });
      const decisionsMap = await getLatestEventImageDecisions([44], mockDecisionsQuery);

      const candidateKey = 'biblioteca-publica/zo-brinviyer/a0b7.webp';
      const activeDecision = decisionsMap.get(`44:${candidateKey}`) || null;

      // Sin decisión registrada en event_image_decisions, isPending ES TRUE
      const isPending = !activeDecision || activeDecision.action === 'request_search';
      expect(activeDecision).toBeNull();
      expect(isPending).toBe(true);
    });

    test('Un evento con decisión adopt, keep_current o discard en event_image_decisions se considera RESUELTO', async () => {
      const mockDecisionsQuery = async () => ({
        rows: [{
          id: 50,
          event_id: 9,
          candidate_key: 'biblioteca-publica/exposicion/8a71.webp',
          candidate_url: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
          action: 'adopt',
          operator_email: 'admin@vayaplan.com',
          notes: null,
          idempotency_key: null,
          payload_hash: null,
          created_at: new Date().toISOString(),
        }]
      });

      const { getLatestEventImageDecisions } = await import('../biblioteca-service');
      const decisionsMap = await getLatestEventImageDecisions([9], mockDecisionsQuery);

      const activeDecision = decisionsMap.get('9:biblioteca-publica/exposicion/8a71.webp');
      expect(activeDecision).toBeDefined();
      expect(activeDecision!.action).toBe('adopt');

      const isPending = !activeDecision || activeDecision.action === 'request_search';
      expect(isPending).toBe(false); // Resuelto
    });

    test('Un evento con decisión request_search posterior a adopt se considera PENDIENTE', async () => {
      const mockDecisionsQuery = async () => ({
        rows: [{
          id: 52,
          event_id: 9,
          candidate_key: 'biblioteca-publica/exposicion/8a71.webp',
          candidate_url: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
          action: 'request_search',
          operator_email: 'admin@vayaplan.com',
          notes: 'Reabierto para buscar imagen de mayor resolución',
          idempotency_key: null,
          payload_hash: null,
          created_at: new Date().toISOString(),
        }]
      });

      const { getLatestEventImageDecisions } = await import('../biblioteca-service');
      const decisionsMap = await getLatestEventImageDecisions([9], mockDecisionsQuery);

      const activeDecision = decisionsMap.get('9:biblioteca-publica/exposicion/8a71.webp');
      expect(activeDecision).toBeDefined();
      expect(activeDecision!.action).toBe('request_search');

      const isPending = !activeDecision || activeDecision.action === 'request_search';
      expect(isPending).toBe(true); // PENDIENTE de búsqueda
    });
  });
});
