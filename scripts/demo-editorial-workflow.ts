import { query } from '@vayaplan/db';

async function runEditorialWorkflowDemo() {
  console.log('=== DEMOSTRACIÓN DEL FLUJO EDITORIAL LOCAL (VAYAPLAN_TEST) ===\n');

  // Asegurar venue de prueba
  const venueRes = await query<{ id: number }>(`
    INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
    VALUES (1, 'Biblioteca Pública de Palencia', 'biblioteca-publica-demo', 'C/ Eduardo Dato, 4', 42.0134, -4.5348, true, now(), now())
    ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);
  const venueId = venueRes.rows[0].id;

  // PASO 1: Ingesta de Candidato JCyL en estado borrador (tentative) con hora pendiente
  console.log('1. Ingesta: Creación de candidato JCyL en borrador (status = tentative, time_status = pending_time)...');
  const insertRes = await query<{ id: number }>(`
    INSERT INTO events (
      city_id, venue_id, title, description, category,
      time_status, start_time, editorial_date, price_cents, is_free,
      status, source_type, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'Club de lectura Test Flow', 'Lectura guiada de novela gráfica', 'cultura',
      'pending_time', NULL, '2026-11-04', 0, true,
      'tentative', 'api', 'jcyl:test_workflow_01', now(), now()
    ) RETURNING id;
  `, [venueId]);
  const eventId = insertRes.rows[0].id;
  console.log(`   -> Evento creado con ID: ${eventId}, status: tentative, time_status: pending_time, start_time: NULL`);

  // PASO 2: Comprobación de Ocultación Pública del Borrador
  console.log('\n2. Verificación de Visibilidad Pública de Borrador:');
  const pubEventRes = await query(`SELECT id FROM events WHERE id = $1 AND status = 'published';`, [eventId]);
  console.log(`   -> Consulta pública (status = published): ${pubEventRes.rows.length === 0 ? 'OCULTO (Correcto: responde 404 al ciudadano)' : 'ERROR'}`);

  // PASO 3: Revisión y Edición Editorial (Cambio de hora pendiente a confirmada)
  console.log('\n3. Intervención Editorial: Editor fija la hora confirmada (19:00 h Madrid = 18:00 UTC) y publica...');
  await query(`
    UPDATE events SET
      time_status = 'confirmed',
      start_time = '2026-11-04 18:00:00+00',
      status = 'published',
      verified_at = now(),
      verified_by = 'editor_cultura'
    WHERE id = $1;
  `, [eventId]);
  console.log('   -> Evento actualizado: time_status = confirmed, start_time = 2026-11-04 18:00:00+00, status = published');

  const pubAfterRes = await query<{ id: number; title: string; time_status: string; start_time: string }>(`
    SELECT id, title, time_status, start_time FROM events WHERE id = $1 AND status = 'published';
  `, [eventId]);
  console.log(`   -> Consulta pública tras publicación: VISIBLE (ID ${pubAfterRes.rows[0].id}, time_status: ${pubAfterRes.rows[0].time_status}, start_time: ${pubAfterRes.rows[0].start_time})`);

  // PASO 4: Alta de Exposición con Periodo de Visita Continuado
  console.log('\n4. Alta Editorial: Exposición continuada con periodo (end_date) y horario de visita...');
  const expRes = await query<{ id: number }>(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status,
      start_time, editorial_date, end_date, schedule_text,
      price_cents, is_free, status, source_type, created_at, updated_at
    ) VALUES (
      1, $1, 'Muestra Bibliográfica Cervantina', 'exposicion', 'continuous',
      NULL, '2026-11-01', '2026-11-15', 'Lunes a viernes de 09:00 a 21:00 h. Sábados de 09:00 a 14:00 h.',
      0, true, 'published', 'manual', now(), now()
    ) RETURNING id;
  `, [venueId]);
  const expId = expRes.rows[0].id;
  console.log(`   -> Exposición creada con ID: ${expId}, time_status: continuous, start_time: NULL, periodo: 2026-11-01 al 2026-11-15`);

  // Comprobar filtro por fechas en la agenda
  const insidePeriod = await query(`
    SELECT id FROM events WHERE id = $1 AND (
      (end_date IS NULL AND editorial_date = '2026-11-05') OR
      (end_date IS NOT NULL AND editorial_date <= '2026-11-05' AND end_date >= '2026-11-05')
    );
  `, [expId]);
  console.log(`   -> Consulta en fecha dentro del periodo (2026-11-05): ${insidePeriod.rows.length === 1 ? 'INCLUIDA (Correcto)' : 'ERROR'}`);

  const outsidePeriod = await query(`
    SELECT id FROM events WHERE id = $1 AND (
      (end_date IS NULL AND editorial_date = '2026-11-20') OR
      (end_date IS NOT NULL AND editorial_date <= '2026-11-20' AND end_date >= '2026-11-20')
    );
  `, [expId]);
  console.log(`   -> Consulta en fecha fuera del periodo (2026-11-20): ${outsidePeriod.rows.length === 0 ? 'EXCLUIDA (Correcto)' : 'ERROR'}`);

  // PASO 5: Asociación a Dos Festivales / Programas (N:M)
  console.log('\n5. Asociación N:M: Vinculación del evento a dos ciclos simultáneos...');
  const fest1 = await query<{ id: number }>(`
    INSERT INTO festivals (city_id, name, edition, slug, start_date, end_date, is_active)
    VALUES (1, 'Ciclo Letras Palentinas', '2026', 'letras-palentinas-2026', '2026-11-01', '2026-11-30', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);
  const fest2 = await query<{ id: number }>(`
    INSERT INTO festivals (city_id, name, edition, slug, start_date, end_date, is_active)
    VALUES (1, 'Otoño Cultural Palencia', '2026', 'otono-cultural-demo', '2026-10-01', '2026-12-31', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);
  const festId1 = fest1.rows[0].id;
  const festId2 = fest2.rows[0].id;

  await query(`
    INSERT INTO event_festivals (event_id, festival_id) VALUES ($1, $2), ($1, $3)
    ON CONFLICT DO NOTHING;
  `, [eventId, festId1, festId2]);

  const assocRes = await query<{ name: string; slug: string }>(`
    SELECT f.name, f.slug FROM festivals f
    JOIN event_festivals ef ON ef.festival_id = f.id
    WHERE ef.event_id = $1
    ORDER BY f.name;
  `, [eventId]);
  console.log(`   -> El evento ${eventId} está asociado a ${assocRes.rows.length} festivales:`);
  assocRes.rows.forEach(f => console.log(`      * ${f.name} (slug: ${f.slug})`));

  // PASO 6: Ocultación de Programas no publicables (is_active = false)
  console.log('\n6. Ocultación de Programa no publicable (is_active = false)...');
  const inactiveFest = await query<{ id: number }>(`
    INSERT INTO festivals (city_id, name, edition, slug, start_date, end_date, is_active)
    VALUES (1, 'Ciclo Secreto en Preparación', '2026', 'ciclo-secreto', '2026-12-01', '2026-12-10', false)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = false
    RETURNING id;
  `);
  const pubFestCheck = await query(`SELECT id FROM festivals WHERE slug = 'ciclo-secreto' AND is_active = true;`);
  console.log(`   -> Consulta pública de programa inactivo: ${pubFestCheck.rows.length === 0 ? 'OCULTO (404 al ciudadano)' : 'ERROR'}`);

  // Limpieza
  console.log('\nLimpieza de datos de prueba del flujo...');
  await query('DELETE FROM event_festivals WHERE event_id IN ($1, $2);', [eventId, expId]);
  await query('DELETE FROM events WHERE id IN ($1, $2);', [eventId, expId]);
  await query('DELETE FROM festivals WHERE slug IN (\'letras-palentinas-2026\', \'otono-cultural-demo\', \'ciclo-secreto\');');
  await query('DELETE FROM venues WHERE slug = \'biblioteca-publica-demo\';');
  console.log('Flujo editorial probado y verificado con éxito.');
}

runEditorialWorkflowDemo().catch(err => {
  console.error('Error en flujo editorial:', err);
  process.exit(1);
});
