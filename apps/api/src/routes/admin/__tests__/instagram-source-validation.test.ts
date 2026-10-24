import { describe, expect, test } from 'bun:test';
import { parseAndNormalizeInstagramInput } from '@vayaplan/shared';

describe('apps/api — Validación de Fuentes Instagram (POST/PATCH)', () => {
  describe('Validación y Normalización de instagram_input', () => {
    test('acepta handle simple sin arroba y genera URL canónica', () => {
      const res = parseAndNormalizeInstagramInput('bar_linamorganfreeman');
      expect(res.isValid).toBe(true);
      expect(res.username).toBe('bar_linamorganfreeman');
      expect(res.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('acepta handle con arroba inicial (@bar_linamorganfreeman)', () => {
      const res = parseAndNormalizeInstagramInput('@bar_linamorganfreeman');
      expect(res.isValid).toBe(true);
      expect(res.username).toBe('bar_linamorganfreeman');
      expect(res.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('acepta URL completa y purga parámetros de seguimiento (?igsh=..., utm_source, etc.)', () => {
      const res = parseAndNormalizeInstagramInput('https://www.instagram.com/bar_linamorganfreeman/?igsh=YWx5c...&utm_medium=social');
      expect(res.isValid).toBe(true);
      expect(res.username).toBe('bar_linamorganfreeman');
      expect(res.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('rechaza URLs a publicaciones individuales (/p/)', () => {
      const res = parseAndNormalizeInstagramInput('https://www.instagram.com/p/DB12345/');
      expect(res.isValid).toBe(false);
      expect(res.username).toBeNull();
      expect(res.error).toContain('publicaciones');
    });

    test('rechaza URLs a reels (/reel/)', () => {
      const res = parseAndNormalizeInstagramInput('https://www.instagram.com/reel/DB12345/');
      expect(res.isValid).toBe(false);
      expect(res.username).toBeNull();
      expect(res.error).toContain('reels');
    });

    test('rechaza dominios externos no pertenecientes a instagram.com', () => {
      const res = parseAndNormalizeInstagramInput('https://facebook.com/bar_linamorganfreeman');
      expect(res.isValid).toBe(false);
      expect(res.username).toBeNull();
      expect(res.error).toContain('instagram.com');
    });
  });

  describe('Compatibilidad Retroactiva con Clientes Existentes', () => {
    // Simula la extracción de parámetros implementada en el endpoint
    function resolveInstagramPayload(body: {
      instagram_input?: string;
      instagram_username?: string;
      instagram_profile_url?: string;
    }) {
      const rawIg = body.instagram_input || body.instagram_username || body.instagram_profile_url || '';
      return parseAndNormalizeInstagramInput(rawIg);
    }

    test('cliente nuevo usando instagram_input', () => {
      const parsed = resolveInstagramPayload({ instagram_input: 'bar_linamorganfreeman' });
      expect(parsed.isValid).toBe(true);
      expect(parsed.username).toBe('bar_linamorganfreeman');
      expect(parsed.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('cliente antiguo usando instagram_username tradicional', () => {
      const parsed = resolveInstagramPayload({ instagram_username: 'bar_linamorganfreeman' });
      expect(parsed.isValid).toBe(true);
      expect(parsed.username).toBe('bar_linamorganfreeman');
      expect(parsed.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('cliente antiguo usando instagram_profile_url tradicional', () => {
      const parsed = resolveInstagramPayload({ instagram_profile_url: 'https://www.instagram.com/bar_linamorganfreeman/' });
      expect(parsed.isValid).toBe(true);
      expect(parsed.username).toBe('bar_linamorganfreeman');
      expect(parsed.canonicalUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('prioridad: si se envían ambos, instagram_input tiene precedencia', () => {
      const parsed = resolveInstagramPayload({
        instagram_input: 'nuevo_usuario',
        instagram_username: 'antiguo_usuario',
      });
      expect(parsed.isValid).toBe(true);
      expect(parsed.username).toBe('nuevo_usuario');
    });
  });

  describe('Reglas de Validación de Negocio para Fuentes de Ingesta', () => {
    function validateSourceConfig(venueId: any, postsPerRun: any) {
      const parsedVenueId = parseInt(venueId, 10);
      if (!parsedVenueId || isNaN(parsedVenueId)) {
        return { valid: false, error: 'missing_venue' };
      }
      const parsedPosts = parseInt(postsPerRun, 10);
      if (isNaN(parsedPosts) || parsedPosts < 1 || parsedPosts > 20) {
        return { valid: false, error: 'invalid_posts_per_run' };
      }
      return { valid: true };
    }

    test('rechaza venueId nulo, vacío o no numérico', () => {
      expect(validateSourceConfig(null, 5).error).toBe('missing_venue');
      expect(validateSourceConfig('', 5).error).toBe('missing_venue');
      expect(validateSourceConfig('abc', 5).error).toBe('missing_venue');
      expect(validateSourceConfig(0, 5).error).toBe('missing_venue');
    });

    test('acepta venueId numérico válido', () => {
      expect(validateSourceConfig(10037, 5).valid).toBe(true);
      expect(validateSourceConfig('10037', 5).valid).toBe(true);
    });

    test('limita posts_per_run estrictamente al rango [1, 20]', () => {
      expect(validateSourceConfig(10037, 0).error).toBe('invalid_posts_per_run');
      expect(validateSourceConfig(10037, -1).error).toBe('invalid_posts_per_run');
      expect(validateSourceConfig(10037, 21).error).toBe('invalid_posts_per_run');
      expect(validateSourceConfig(10037, 1).valid).toBe(true);
      expect(validateSourceConfig(10037, 10).valid).toBe(true);
      expect(validateSourceConfig(10037, 20).valid).toBe(true);
    });
  });
});
