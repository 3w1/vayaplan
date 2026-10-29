import { describe, expect, test } from 'bun:test';
import { classifyBarPost } from '../bar-classifier';
import type { ApifyInstagramRawPost } from '../bar-types';

describe('Clasificación Editorial — Categoría Gastronomía (bar-classifier)', () => {
  // ----------------------------------------------------------------------------
  // 1. Detección de Catas Puntuales
  // ----------------------------------------------------------------------------
  test('clasifica como EVENTO_POSIBLE con categoría gastronomia una cata de vinos con fecha y hora', () => {
    const post: ApifyInstagramRawPost = {
      shortCode: 'CATA_VINOS_01',
      caption: '🍇 Próximo jueves 29 de octubre a las 20:00 h tendremos una exclusiva cata de vinos de la Ribera del Duero maridada con nuestros mejores platos. Plazas limitadas. 45 € por persona. ¡Reserva ya!',
      timestamp: '2026-10-20T12:00:00Z',
    };

    const res = classifyBarPost(post, 'Restaurante La Traserilla');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
    expect(res.detectedDate).toBe('2026-10-29');
    expect(res.detectedTime).toBe('20:00');
    expect(res.estimatedPriceCents).toBe(4500);
    expect(res.priceStatus).toBe('CONFIRMED');
    expect(res.signals.some((s) => s.includes('gastronómica / cata'))).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 2. Detección de Degustaciones y Maridajes
  // ----------------------------------------------------------------------------
  test('clasifica como EVENTO_POSIBLE con categoría gastronomia una degustación y maridaje', () => {
    const post: ApifyInstagramRawPost = {
      shortCode: 'MARIDAJE_02',
      caption: 'Degustación y maridaje de quesos artesanos y cervezas craft el viernes 6 de noviembre a las 21:00 en nuestro espacio.',
      timestamp: '2026-10-22T10:00:00Z',
    };

    const res = classifyBarPost(post, 'Cervecería La Brújula');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
    expect(res.detectedDate).toBe('2026-11-06');
    expect(res.detectedTime).toBe('21:00');
  });

  // ----------------------------------------------------------------------------
  // 3. Detección de Jornadas y Ferias Gastronómicas
  // ----------------------------------------------------------------------------
  test('clasifica eventos de jornadas o ferias gastronómicas bajo la categoría gastronomia', () => {
    const post: ApifyInstagramRawPost = {
      shortCode: 'JORNADAS_03',
      caption: 'Llegan las Jornadas Gastronómicas de la Matanza tradicional. Inicio el sábado 14 de noviembre a las 14:00 h con menú degustación especial.',
      timestamp: '2026-10-25T09:00:00Z',
    };

    const res = classifyBarPost(post, 'Restaurante El Botánico');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
    expect(res.detectedTime).toBe('14:00');
  });

  // ----------------------------------------------------------------------------
  // 4. Detección de Rutas de Pinchos / Tapas
  // ----------------------------------------------------------------------------
  test('clasifica rutas de pinchos o tapas bajo la categoría gastronomia', () => {
    const post: ApifyInstagramRawPost = {
      shortCode: 'RUTA_TAPAS_04',
      caption: 'Participamos en la Ruta de Pinchos y Tapas de Palencia. Presentamos nuestra propuesta estrella desde este viernes 30 de octubre a las 19:30 h.',
      timestamp: '2026-10-24T18:00:00Z',
    };

    const res = classifyBarPost(post, 'Bar El Rincón');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
  });

  // ----------------------------------------------------------------------------
  // 5. Detección de Talleres Culinarios / Showcooking
  // ----------------------------------------------------------------------------
  test('clasifica talleres culinarios y showcookings bajo gastronomia', () => {
    const post: ApifyInstagramRawPost = {
      shortCode: 'TALLER_05',
      caption: 'Taller culinario de repostería artesana y showcooking con el chef invitado el sábado 21 de noviembre a las 17:00. Inscripciones abiertas.',
      timestamp: '2026-10-25T11:00:00Z',
    };

    const res = classifyBarPost(post, 'Espacio Gastronómico');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
    expect(res.detectedTime).toBe('17:00');
  });

  // ----------------------------------------------------------------------------
  // 6. Rechazo de Servicios Cotidianos / Menú del Día de Restaurante (No son eventos)
  // ----------------------------------------------------------------------------
  test('descarta publicaciones de menú del día, carta habitual o reservas ordinarias como PROMOCION (no evento)', () => {
    const postMenu: ApifyInstagramRawPost = {
      shortCode: 'MENU_RUTINA_06',
      caption: 'Hoy en nuestro menú del día: primero de lentejas pardinas, segundo de merluza fresca y tarta de la casa. Reserva tu mesa de martes a sábados. ¡Te esperamos!',
      timestamp: '2026-10-27T10:00:00Z',
    };

    const res = classifyBarPost(postMenu, 'Restaurante Tradicional');

    expect(res.classification).toBe('PROMOCION');
    expect(res.reason).toContain('horario habitual de apertura o servicios');
    expect(res.signals.some((s) => s.includes('servicio habitual'))).toBe(true);
  });

  test('descarta publicaciones de carta ordinaria y apertura semanal sin actividad puntual', () => {
    const postCarta: ApifyInstagramRawPost = {
      shortCode: 'CARTA_RUTINA_07',
      caption: 'Descubre nuestra carta de temporada con sugerencias del chef. Cocina abierta de martes a sábados. Reserva tu mesa en el link de la bio.',
      timestamp: '2026-10-27T10:00:00Z',
    };

    const res = classifyBarPost(postCarta, 'Restaurante La Plaza');

    expect(res.classification).toBe('PROMOCION');
  });

  // ----------------------------------------------------------------------------
  // 7. Precedencia: Conciertos en Restaurantes son musica_directo, no gastronomia
  // ----------------------------------------------------------------------------
  test('un concierto en un restaurante se clasifica como musica_directo por precedencia de actividad sobre local', () => {
    const postConcierto: ApifyInstagramRawPost = {
      shortCode: 'CONCIERTO_REST_08',
      caption: 'Este viernes 30 de octubre a las 21:00 h tendremos concierto acústico en directo de la banda Los Acústicos en Restaurante La Traserilla. Entrada libre hasta completar aforo.',
      timestamp: '2026-10-26T15:00:00Z',
    };

    const res = classifyBarPost(postConcierto, 'Restaurante La Traserilla');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('musica_directo');
    expect(res.category).toBe('musica_directo');
    expect(res.signals.some((s) => s.includes('música en directo'))).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 8. Fixture Real de la Propuesta #76 (Cata en Restaurante La Traserilla)
  // ----------------------------------------------------------------------------
  test('clasifica fielmente la publicación real de la cata en La Traserilla con fecha, hora, precio y gastronomia', () => {
    const postLaTraserilla: ApifyInstagramRawPost = {
      shortCode: 'De_jb4yFX_T',
      url: 'https://www.instagram.com/p/De_jb4yFX_T/',
      caption: 'Jueves 29 de octubre a las 20:00 h. Gran cata de vinos maridada en Restaurante La Traserilla con 5 vinos seleccionados y 5 tapas gourmet. 45 € por persona. Reservas en el 979 74 44 44.',
      timestamp: '2026-10-20T14:30:00Z',
    };

    const res = classifyBarPost(postLaTraserilla, 'Restaurante La Traserilla');

    expect(res.classification).toBe('EVENTO_POSIBLE');
    expect(res.provisionalCategory).toBe('gastronomia');
    expect(res.category).toBe('gastronomia');
    expect(res.detectedDate).toBe('2026-10-29');
    expect(res.detectedTime).toBe('20:00');
    expect(res.estimatedPriceCents).toBe(4500);
    expect(res.priceStatus).toBe('CONFIRMED');
    expect(res.confidence).toBe('ALTA');
  });
});
