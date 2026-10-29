import { describe, expect, test } from 'bun:test';
import { validateInstagramPostUrl } from '../url-validator';

describe('validateInstagramPostUrl — Validación defensiva de URLs de Instagram', () => {
  test('1. Acepta URLs canónicas válidas de post (/p/) y reel (/reel/) preservando mayúsculas y minúsculas', () => {
    const postRes = validateInstagramPostUrl('https://www.instagram.com/p/DUrIO-MiJmD/');
    expect(postRes.valid).toBe(true);
    if (postRes.valid) {
      expect(postRes.shortcode).toBe('DUrIO-MiJmD');
      expect(postRes.postType).toBe('p');
      expect(postRes.canonicalUrl).toBe('https://www.instagram.com/p/DUrIO-MiJmD/');
    }

    const reelRes = validateInstagramPostUrl('https://instagram.com/reel/C8kLmNp_9Xy');
    expect(reelRes.valid).toBe(true);
    if (reelRes.valid) {
      expect(reelRes.shortcode).toBe('C8kLmNp_9Xy');
      expect(reelRes.postType).toBe('reel');
      expect(reelRes.canonicalUrl).toBe('https://www.instagram.com/reel/C8kLmNp_9Xy/');
    }
  });

  test('2. Limpia query parameters (?igsh, ?utm_*) y fragmentos (#) sin alterar el shortcode', () => {
    const res = validateInstagramPostUrl(
      'https://www.instagram.com/p/DB123456xyz/?igsh=abcde123&utm_source=ig_web_copy_link#comentarios'
    );
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.shortcode).toBe('DB123456xyz');
      expect(res.canonicalUrl).toBe('https://www.instagram.com/p/DB123456xyz/');
    }
  });

  test('3. Rechaza hostnames no permitidos (subdominios, dominios maliciosos, localhost y SSRF)', () => {
    const invalidHosts = [
      'https://evil-instagram.com/p/DB123456xyz/',
      'https://instagram.com.attacker.com/p/DB123456xyz/',
      'http://localhost/p/DB123456xyz/',
      'http://127.0.0.1/p/DB123456xyz/',
      'http://169.254.169.254/p/DB123456xyz/',
      'https://facebook.com/p/DB123456xyz/',
    ];

    for (const url of invalidHosts) {
      const res = validateInstagramPostUrl(url);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe('invalid_hostname');
      }
    }
  });

  test('4. Rechaza credenciales embebidas y puertos no estándar', () => {
    const withCreds = validateInstagramPostUrl('https://admin:secret@www.instagram.com/p/DB123456xyz/');
    expect(withCreds.valid).toBe(false);
    if (!withCreds.valid) {
      expect(withCreds.code).toBe('credentials_not_allowed');
    }

    const withPort = validateInstagramPostUrl('https://www.instagram.com:8443/p/DB123456xyz/');
    expect(withPort.valid).toBe(false);
    if (!withPort.valid) {
      expect(withPort.code).toBe('port_not_allowed');
    }
  });

  test('5. Acepta historias individuales con ID numérico preservado como cadena y canonicaliza', () => {
    const storyUrl = 'https://www.instagram.com/stories/elautenticobar/4018658867898287794/?igsh=abc123#frag';
    const res = validateInstagramPostUrl(storyUrl);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.contentType).toBe('story');
      expect(res.postType).toBe('story');
      expect(res.username).toBe('elautenticobar');
      // Identificador de 19 dígitos no debe sufrir truncamiento por conversión a Number
      expect(res.storyId).toBe('4018658867898287794');
      expect(typeof res.storyId).toBe('string');
      expect(res.shortcode).toBe('4018658867898287794');
      expect(res.canonicalUrl).toBe('https://www.instagram.com/stories/elautenticobar/4018658867898287794/');
    }
  });

  test('5b. Rechaza enlaces genéricos a historias de una cuenta sin ID individual', () => {
    const res = validateInstagramPostUrl('https://www.instagram.com/stories/elautenticobar/');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('story_id_missing');
      expect(res.error).toContain('@elautenticobar');
    }
  });

  test('5c. Rechaza historias con identificador no numérico', () => {
    const res = validateInstagramPostUrl('https://www.instagram.com/stories/elautenticobar/abc-invalido/');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('invalid_story_id');
      expect(res.error).toContain('numérico');
    }
  });

  test('6. Rechaza enlaces a perfiles de usuario explicando cómo obtener el post', () => {
    const res = validateInstagramPostUrl('https://www.instagram.com/salvajepalencia/');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('profile_url_not_supported');
      expect(res.error).toContain('@salvajepalencia');
    }
  });

  test('7. Rechaza sufijos o rutas hijas después del shortcode (/p/CODE/comments)', () => {
    const res = validateInstagramPostUrl('https://www.instagram.com/p/DUrIO-MiJmD/comments/');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('invalid_shortcode');
    }
  });

  test('8. Rechaza rutas no soportadas (/reels/ en plural, /tv/, /explore/)', () => {
    const pluralReels = validateInstagramPostUrl('https://www.instagram.com/reels/C8kLmNp_9Xy/');
    expect(pluralReels.valid).toBe(false);
    if (!pluralReels.valid) {
      expect(pluralReels.code).toBe('unsupported_route');
    }

    const tvRes = validateInstagramPostUrl('https://www.instagram.com/tv/C8kLmNp_9Xy/');
    expect(tvRes.valid).toBe(false);
    if (!tvRes.valid) {
      expect(tvRes.code).toBe('unsupported_route');
    }
  });

  test('9. Rechaza entradas vacías o malformadas', () => {
    expect(validateInstagramPostUrl('').valid).toBe(false);
    expect(validateInstagramPostUrl('not-a-url').valid).toBe(false);
    expect(validateInstagramPostUrl('ftp://www.instagram.com/p/DUrIO-MiJmD/').valid).toBe(false);
  });
});
