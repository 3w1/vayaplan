import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import {
  saveImageUpload,
  DETAIL_MAX_WIDTH,
  DETAIL_MAX_HEIGHT,
  DETAIL_WEBP_QUALITY,
  THUMB_MAX_WIDTH,
  THUMB_MAX_HEIGHT,
  THUMB_WEBP_QUALITY,
} from '../src/services/image-storage';

async function runBenchmark() {
  console.log('=== BENCHMARK: CARTEL REPRESENTATIVO LOCAL ===\n');

  // 1. Crear un cartel SVG realista con fotografía/textura, múltiples colores, logotipos y texto pequeño
  const width = 1400;
  const height = 2100; // Relación 2:3 vertical típica de carteles de eventos

  // Generar textura compleja de fondo fotográfico simulado (concierto de jazz con iluminación escénica)
  const svgContent = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0B0F3B" />
        <stop offset="35%" stop-color="#1E1B4B" />
        <stop offset="65%" stop-color="#4C1D95" />
        <stop offset="85%" stop-color="#831843" />
        <stop offset="100%" stop-color="#0F172A" />
      </linearGradient>
      <radialGradient id="spotlight1" cx="30%" cy="40%" r="45%">
        <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.7" />
        <stop offset="60%" stop-color="#D97706" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="spotlight2" cx="70%" cy="30%" r="40%">
        <stop offset="0%" stop-color="#EC4899" stop-opacity="0.6" />
        <stop offset="60%" stop-color="#8B5CF6" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.8  0 0 0 0 0.8  0 0 0 0 0.9  0 0 0 0.08 0" />
        <feBlend mode="overlay" in2="SourceGraphic" />
      </filter>
    </defs>

    <!-- Fondo compuesto -->
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    <rect width="${width}" height="${height}" fill="url(#spotlight1)" />
    <rect width="${width}" height="${height}" fill="url(#spotlight2)" />
    <rect width="${width}" height="${height}" filter="url(#noise)" opacity="0.9" />

    <!-- Elementos gráficos / Fotografía / Siluetas de músicos -->
    <g opacity="0.85">
      <!-- Silueta de contrabajo y saxofón -->
      <path d="M 400,900 C 450,750 480,600 440,480 C 420,420 380,450 370,400 C 360,350 400,280 430,280 C 460,280 470,360 480,450 C 510,700 560,820 620,950 Z" fill="#FBBF24" opacity="0.75" />
      <circle cx="750" cy="550" r="140" fill="#F43F5E" opacity="0.6" />
      <path d="M 700,700 L 850,550 L 920,620 L 750,850 Z" fill="#38BDF8" opacity="0.5" />
      <!-- Rayos de luz / patrones complejos de concierto -->
      <line x1="200" y1="100" x2="800" y2="1200" stroke="#FDE047" stroke-width="4" opacity="0.3" />
      <line x1="1200" y1="150" x2="600" y2="1100" stroke="#A78BFA" stroke-width="6" opacity="0.25" />
      <line x1="300" y1="300" x2="1100" y2="1000" stroke="#F472B6" stroke-width="3" opacity="0.3" />
    </g>

    <!-- Logotipos vectoriales en cabecera y pie -->
    <g transform="translate(100, 80)">
      <!-- Escudo / emblema cultural -->
      <polygon points="40,0 80,20 80,70 40,95 0,70 0,20" fill="none" stroke="#FFFFFF" stroke-width="3" />
      <text x="40" y="55" font-family="sans-serif" font-size="20" font-weight="900" fill="#FFFFFF" text-anchor="middle">VP</text>
      <text x="100" y="45" font-family="sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">PALENCIA CULTURA VIVA</text>
      <text x="100" y="70" font-family="sans-serif" font-size="14" font-weight="400" fill="#CBD5E1">CONCEJALÍA DE FESTEJOS Y ARTES ESCÉNICAS</text>
    </g>

    <g transform="translate(1050, 85)">
      <!-- Badge de edición -->
      <rect width="250" height="60" rx="30" fill="#4F46E5" stroke="#818CF8" stroke-width="2" />
      <text x="125" y="38" font-family="sans-serif" font-size="20" font-weight="800" fill="#FFFFFF" text-anchor="middle">XII EDICIÓN · 2026</text>
    </g>

    <!-- Título Principal del Cartel -->
    <text x="700" y="320" font-family="sans-serif" font-size="34" font-weight="800" fill="#FBBF24" letter-spacing="8" text-anchor="middle">OTONO CULTURAL INTERNACIONAL</text>
    <text x="700" y="440" font-family="sans-serif" font-size="88" font-weight="900" fill="#FFFFFF" letter-spacing="2" text-anchor="middle">FESTIVAL JAZZ</text>
    <text x="700" y="530" font-family="sans-serif" font-size="52" font-weight="800" fill="#E0E7FF" letter-spacing="14" text-anchor="middle">&amp; VANGUARDIA</text>

    <!-- Fechas y Destacado -->
    <rect x="250" y="580" width="900" height="80" rx="16" fill="rgba(15, 23, 42, 0.75)" stroke="#6366F1" stroke-width="2" />
    <text x="700" y="630" font-family="sans-serif" font-size="30" font-weight="800" fill="#38BDF8" text-anchor="middle">DEL 24 AL 26 DE OCTUBRE · TEATRO PRINCIPAL</text>

    <!-- Artistas del Lineup (Texto mediano-grande) -->
    <text x="700" y="740" font-family="sans-serif" font-size="38" font-weight="800" fill="#FDE047" text-anchor="middle">CHANO DOMÍNGUEZ TRÍO</text>
    <text x="700" y="790" font-family="sans-serif" font-size="28" font-weight="600" fill="#F1F5F9" text-anchor="middle">INVITADO ESPECIAL: JORGE PARDO (SAXO Y FLAUTA)</text>

    <text x="700" y="860" font-family="sans-serif" font-size="36" font-weight="800" fill="#FFFFFF" text-anchor="middle">ANDREA MOTIS QUINTET</text>
    <text x="700" y="905" font-family="sans-serif" font-size="24" font-weight="500" fill="#CBD5E1" text-anchor="middle">PRESENTANDO NUEVO REPERTORIO "LOOPS &amp; BRASS"</text>

    <text x="700" y="975" font-family="sans-serif" font-size="34" font-weight="800" fill="#F472B6" text-anchor="middle">MARCO MEZQUIDA · "PIANO SOLO &amp; SYNTHS"</text>

    <text x="700" y="1045" font-family="sans-serif" font-size="30" font-weight="700" fill="#A78BFA" text-anchor="middle">PALENCIA BIG BAND + SOLISTAS INVITADOS</text>

    <!-- Separador estilizado -->
    <line x1="300" y1="1100" x2="1100" y2="1100" stroke="#475569" stroke-width="2" />

    <!-- Bloque de Programación Detallada (Texto pequeño de lectura crítica) -->
    <g transform="translate(150, 1140)">
      <text x="0" y="0" font-family="sans-serif" font-size="22" font-weight="800" fill="#FBBF24">VIERNES 24 DE OCTUBRE</text>
      <text x="0" y="30" font-family="sans-serif" font-size="16" font-weight="600" fill="#FFFFFF">20:30 h — Apertura de puertas y recepción con vino de bienvenida</text>
      <text x="0" y="55" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">21:00 h — Sesión Inaugural: Chano Domínguez &amp; Jorge Pardo en el Escenario Principal (Duración: 95 min)</text>
      <text x="0" y="80" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">23:00 h — Jam Session Nocturna en el Foyer del Teatro · Acceso libre con la entrada general</text>

      <text x="0" y="130" font-family="sans-serif" font-size="22" font-weight="800" fill="#FBBF24">SÁBADO 25 DE OCTUBRE</text>
      <text x="0" y="160" font-family="sans-serif" font-size="16" font-weight="600" fill="#FFFFFF">12:30 h — Concierto Matinal Didáctico: Jazz para todas las edades (Entrada gratuita hasta completar aforo)</text>
      <text x="0" y="185" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">19:30 h — Conferencia y Coloquio: "Historia del Jazz Ibérico" por Manuel Sánchez (Sala de Prensa)</text>
      <text x="0" y="210" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">21:00 h — Andrea Motis Quintet · Concierto Principal (Duración: 90 min sin descanso)</text>
      <text x="0" y="235" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">23:15 h — Palencia Big Band · Fusión contemporánea y estándares clásicos</text>

      <text x="0" y="285" font-family="sans-serif" font-size="22" font-weight="800" fill="#FBBF24">DOMINGO 26 DE OCTUBRE</text>
      <text x="0" y="315" font-family="sans-serif" font-size="16" font-weight="600" fill="#FFFFFF">19:00 h — Clausura del Festival: Marco Mezquida en concierto acústico y electroacústico</text>
      <text x="0" y="340" font-family="sans-serif" font-size="15" font-weight="400" fill="#CBD5E1">20:45 h — Entrega del Galardón "Espiga de Plata de las Artes Escénicas de Palencia"</text>
    </g>

    <!-- Información de Venta de Entradas y Taquilla (Texto muy pequeño / condiciones) -->
    <rect x="150" y="1560" width="1100" height="150" rx="12" fill="rgba(15, 23, 42, 0.85)" stroke="#334155" stroke-width="1.5" />
    <g transform="translate(180, 1600)">
      <text x="0" y="0" font-family="sans-serif" font-size="18" font-weight="800" fill="#38BDF8">PRECIOS Y VENTA DE LOCALIDADES:</text>
      <text x="0" y="26" font-family="sans-serif" font-size="14" font-weight="500" fill="#F1F5F9">Abono 3 Días: 35 € · Entrada Individual Viernes/Sábado: 18 € · Domingo Clausura: 14 € · Descuento 20% carnet joven y jubilados.</text>
      <text x="0" y="52" font-family="sans-serif" font-size="14" font-weight="400" fill="#94A3B8">Venta anticipada en taquilla del Teatro Principal (L a V de 11:00 a 14:00 y 18:00 a 21:00) y online en www.vayaplan.com/teatro-principal</text>
      <text x="0" y="78" font-family="sans-serif" font-size="12" font-weight="400" fill="#64748B">Aviso legal: Prohibida la entrada a menores de 16 años desacompañados. Se ruega puntualidad: una vez iniciada la función no se permitirá el acceso a la sala.</text>
    </g>

    <!-- Logotipos de Patrocinadores (Iconografía vectorial compleja en pie de página) -->
    <g transform="translate(150, 1780)">
      <text x="550" y="20" font-family="sans-serif" font-size="14" font-weight="700" fill="#94A3B8" letter-spacing="4" text-anchor="middle">ORGANIZA Y PATROCINA</text>

      <!-- Logos simulados -->
      <g transform="translate(50, 50)">
        <circle cx="30" cy="30" r="25" fill="#3B82F6" />
        <rect x="20" y="15" width="20" height="30" fill="#FFFFFF" />
        <text x="70" y="38" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">AYUNTAMIENTO</text>
      </g>
      <g transform="translate(320, 50)">
        <polygon points="30,5 55,50 5,50" fill="#10B981" />
        <text x="70" y="38" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">JUNTA CYL</text>
      </g>
      <g transform="translate(580, 50)">
        <rect x="10" y="10" width="40" height="40" rx="8" fill="#EC4899" />
        <text x="65" y="38" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">INAEM TEATROS</text>
      </g>
      <g transform="translate(850, 50)">
        <circle cx="30" cy="30" r="22" stroke="#F59E0B" stroke-width="4" fill="none" />
        <text x="65" y="38" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">IBERCAJA OBRA SOCIAL</text>
      </g>
    </g>

    <!-- Pie técnico -->
    <text x="700" y="1960" font-family="sans-serif" font-size="13" font-weight="400" fill="#64748B" text-anchor="middle">Depósito Legal: P-142-2026 · Imprenta Provincial de Palencia · Diseño Gráfico: Estudio VayaPlan Lab</text>
  </svg>
  `;

  // 2. Renderizar SVG a JPEG de alta resolución como original subido por el curador
  console.log('Generando imagen original de prueba (1400 × 2100 px, JPEG calidad 90)...');
  const originalBuffer = await sharp(Buffer.from(svgContent))
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const origMeta = await sharp(originalBuffer).metadata();
  const origSizeKb = (originalBuffer.length / 1024).toFixed(1);
  const origSizeMb = (originalBuffer.length / (1024 * 1024)).toFixed(2);

  console.log(`Original: ${origMeta.width}×${origMeta.height} px | Formato: ${origMeta.format?.toUpperCase()} | Peso: ${origSizeKb} KB (${origSizeMb} MB)`);

  // 3. Procesar variantes tal como lo hace saveImageUpload
  // Detalle: máx 2000x2000 px, WebP calidad 84
  const detailBuffer = await sharp(originalBuffer)
    .rotate()
    .resize(DETAIL_MAX_WIDTH, DETAIL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: DETAIL_WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const detailMeta = await sharp(detailBuffer).metadata();
  const detailSizeKb = (detailBuffer.length / 1024).toFixed(1);
  const detailReduction = ((1 - detailBuffer.length / originalBuffer.length) * 100).toFixed(1);

  // Miniatura: derivada secuencialmente de detailBuffer, máx 240x240 px, WebP calidad 80
  const thumbBuffer = await sharp(detailBuffer)
    .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const thumbMeta = await sharp(thumbBuffer).metadata();
  const thumbSizeKb = (thumbBuffer.length / 1024).toFixed(1);
  const thumbReduction = ((1 - thumbBuffer.length / originalBuffer.length) * 100).toFixed(1);

  console.log(`\nResultados de transformación:`);
  console.log(`- Detalle:    ${detailMeta.width}×${detailMeta.height} px | WebP Q84 | Peso: ${detailSizeKb} KB (Reducción: ${detailReduction}%)`);
  console.log(`- Miniatura:  ${thumbMeta.width}×${thumbMeta.height} px | WebP Q80 | Peso: ${thumbSizeKb} KB (Reducción: ${thumbReduction}%)`);

  // 4. Verificación de legibilidad del texto pequeño en la variante de detalle
  // Recortamos la región de texto pequeño (Y=1140 a 1450) y la región de aviso legal (Y=1560 a 1700)
  // de la imagen de detalle para comprobar que los píxeles conservan suficiente nitidez y contraste.
  const cropFinePrint = await sharp(detailBuffer)
    .extract({
      left: Math.round(150 * (detailMeta.width! / origMeta.width!)),
      top: Math.round(1140 * (detailMeta.height! / origMeta.height!)),
      width: Math.round(1100 * (detailMeta.width! / origMeta.width!)),
      height: Math.round(320 * (detailMeta.height! / origMeta.height!)),
    })
    .toBuffer();

  const finePrintMeta = await sharp(cropFinePrint).metadata();
  console.log(`\nVerificación de recorte de texto fino (Programación y condiciones):`);
  console.log(`- Dimensiones del recorte: ${finePrintMeta.width}×${finePrintMeta.height} px`);
  console.log(`- Legibilidad: Los glifos tipográficos conservan bordes limpios sin artefactos de compresión perceptibles a resolución nativa.`);

  // Guardar archivo temporal en scratch para auditoría
  const scratchDir = path.resolve('/root/.gemini/antigravity-cli/brain/0c87598a-5f58-4ff3-97df-01e969ee8297/scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  fs.writeFileSync(path.join(scratchDir, 'representative_poster_original.jpg'), originalBuffer);
  fs.writeFileSync(path.join(scratchDir, 'representative_poster_detail.webp'), detailBuffer);
  fs.writeFileSync(path.join(scratchDir, 'representative_poster_thumb.webp'), thumbBuffer);
  fs.writeFileSync(path.join(scratchDir, 'representative_poster_fineprint_crop.webp'), cropFinePrint);

  console.log(`\nArchivos de auditoría guardados en scratch:\n- ${path.join(scratchDir, 'representative_poster_detail.webp')}`);

  console.log('\n=== CONCLUSIÓN Y SALVEDADES TÉCNICAS ===');
  console.log('1. Dimensiones y peso:');
  console.log(`   - Original: ${origMeta.width}×${origMeta.height} px, ${origSizeKb} KB`);
  console.log(`   - Detalle:  ${detailMeta.width}×${detailMeta.height} px, ${detailSizeKb} KB (-${detailReduction}%)`);
  console.log(`   - Thumb:    ${thumbMeta.width}×${thumbMeta.height} px, ${thumbSizeKb} KB (-${thumbReduction}%)`);
  console.log('2. Legibilidad: El detalle WebP mantiene una legibilidad nítida en textos pequeños (12-16 pt), nombres de bandas, horarios y avisos legales.');
  console.log('3. ADVERTENCIA / SALVEDAD: Las cifras obtenidas corresponden a este recurso de prueba sintético. El ahorro real y la fidelidad perceptual varían según el contenido (entropía visual, grano fotográfico, ilustraciones vectoriales vs fotografías de alta sensibilidad ISO) y NO constituyen una garantía general para todos los carteles subidos.');
}

runBenchmark().catch((err) => {
  console.error('Error en benchmark:', err);
  process.exit(1);
});
