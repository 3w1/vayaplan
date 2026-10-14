import QRCode from 'qrcode';

/**
 * Genera el SVG limpio de un código QR para una URL o código dado
 */
export async function generateQrSvg(targetUrl: string): Promise<string> {
  const svg = await QRCode.toString(targetUrl, {
    type: 'svg',
    margin: 2,
    color: {
      dark: '#090d16',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
  return svg;
}

/**
 * Genera una tarjeta vectorial SVG lista para imprimir o visualizar en el hotel/apartamento
 */
export async function generateAccommodationQrCardSvg(
  accommodationName: string,
  qrCode: string,
  targetUrl: string
): Promise<string> {
  const rawQrSvg = await QRCode.toString(targetUrl, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#090d16',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });

  // Extraer el contenido interno del SVG generado por QRCode (elimina cabecera <svg...>)
  const qrInnerContent = rawQrSvg.replace(/<svg[^>]*>|<\/svg>/gi, '').trim();

  const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="400" height="560">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Fondo de la tarjeta -->
  <rect x="10" y="10" width="380" height="540" rx="24" fill="#ffffff" filter="url(#cardShadow)" stroke="#e2e8f0" stroke-width="2"/>

  <!-- Encabezado superior -->
  <rect x="10" y="10" width="380" height="110" rx="24" fill="url(#headerGrad)"/>
  <rect x="10" y="100" width="380" height="20" fill="url(#headerGrad)"/>

  <!-- Logo y Marca VayaPlan -->
  <text x="200" y="58" font-family="-apple-system, system-ui, sans-serif" font-size="26" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="-0.5">VayaPlan</text>
  <text x="200" y="86" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="600" fill="#38bdf8" text-anchor="middle">AGENDA HIPERLOCAL DE PALENCIA</text>

  <!-- Barra acento -->
  <rect x="150" y="105" width="100" height="4" rx="2" fill="url(#accentGrad)"/>

  <!-- Nombre del alojamiento / punto de recepción -->
  <text x="200" y="152" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="700" fill="#0f172a" text-anchor="middle">${accommodationName}</text>
  <text x="200" y="174" font-family="-apple-system, system-ui, sans-serif" font-size="12" font-weight="500" fill="#64748b" text-anchor="middle">¿Qué hacer hoy en la ciudad? Escanea aquí:</text>

  <!-- Marco del código QR -->
  <rect x="85" y="195" width="230" height="230" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <svg x="100" y="210" width="200" height="200" viewBox="0 0 37 37" shape-rendering="crispEdges">
    ${qrInnerContent}
  </svg>

  <!-- Instrucciones inferiores -->
  <rect x="60" y="445" width="280" height="34" rx="17" fill="#f1f5f9"/>
  <text x="200" y="467" font-family="-apple-system, system-ui, sans-serif" font-size="12" font-weight="700" fill="#2563eb" text-anchor="middle">📱 Abre la cámara y enfoca el código</text>

  <!-- Pie con detalles de valor -->
  <text x="200" y="508" font-family="-apple-system, system-ui, sans-serif" font-size="11" font-weight="500" fill="#475569" text-anchor="middle">Sin descargar apps · Sin registro · En tiempo real</text>
  <text x="200" y="526" font-family="-apple-system, system-ui, sans-serif" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">vayaplan.com · Ref: ${qrCode}</text>
</svg>`;

  return cardSvg;
}
