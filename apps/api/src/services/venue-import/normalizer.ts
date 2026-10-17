export function normalizeSlug(name: string): string {
  if (!name || name.trim().length === 0) return `local-${Date.now()}`;
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function parseUrls(website: string | null | undefined): {
  websiteOwn: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
} {
  if (!website || typeof website !== 'string') {
    return { websiteOwn: null, instagramUrl: null, instagramHandle: null, facebookUrl: null };
  }

  const clean = website.trim();
  if (clean.length === 0) {
    return { websiteOwn: null, instagramUrl: null, instagramHandle: null, facebookUrl: null };
  }

  if (clean.includes('instagram.com/')) {
    const match = clean.match(/instagram\.com\/([^/?#&]+)/);
    const handle = match && match[1] ? match[1].replace('@', '').trim() : null;
    return {
      websiteOwn: null,
      instagramUrl: clean,
      instagramHandle: handle,
      facebookUrl: null,
    };
  }

  if (clean.includes('facebook.com/')) {
    return {
      websiteOwn: null,
      instagramUrl: null,
      instagramHandle: null,
      facebookUrl: clean,
    };
  }

  return {
    websiteOwn: clean,
    instagramUrl: null,
    instagramHandle: null,
    facebookUrl: null,
  };
}

export function validateCoordinates(latRaw: any, lonRaw: any): {
  lat: number | null;
  lon: number | null;
  isValid: boolean;
} {
  if (latRaw === undefined || latRaw === null || lonRaw === undefined || lonRaw === null) {
    return { lat: null, lon: null, isValid: false };
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return { lat: null, lon: null, isValid: false };
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { lat, lon, isValid: false };
  }

  return { lat, lon, isValid: true };
}

export function mapGoogleCategory(
  categoryName: string | undefined,
  types: string[] = []
): { proposedCategory: string; proposedCategoryReason: string } {
  const cat = (categoryName || '').toLowerCase().trim();
  const allTypes = types.map((t) => t.toLowerCase());

  if (cat.includes('bar de tapas') || cat.includes('taberna') || cat === 'bar') {
    return {
      proposedCategory: 'bar',
      proposedCategoryReason: `Categoría Google "${categoryName || 'Bar'}" mapea directamente a categoría VayaPlan "bar".`,
    };
  }

  if (cat.includes('bar restaurante') || allTypes.includes('bar restaurante')) {
    return {
      proposedCategory: 'bar',
      proposedCategoryReason: `Categoría Google "${categoryName}" (bar con comidas) mapea a "bar" como categoría admisible en venues.`,
    };
  }

  if (cat.includes('discoteca') || allTypes.includes('discoteca')) {
    return {
      proposedCategory: 'discoteca',
      proposedCategoryReason: `Categoría Google "${categoryName}" mapea a "discoteca".`,
    };
  }

  if (cat.includes('pub') || allTypes.includes('pub')) {
    return {
      proposedCategory: 'pub',
      proposedCategoryReason: `Categoría Google "${categoryName}" mapea a "pub".`,
    };
  }

  if (cat.includes('teatro') || allTypes.includes('teatro')) {
    return {
      proposedCategory: 'teatro',
      proposedCategoryReason: `Categoría Google "${categoryName}" mapea a "teatro".`,
    };
  }

  if (cat.includes('cine') || allTypes.includes('cine')) {
    return {
      proposedCategory: 'cine',
      proposedCategoryReason: `Categoría Google "${categoryName}" mapea a "cine".`,
    };
  }

  if (cat.includes('restaurante')) {
    return {
      proposedCategory: 'general',
      proposedCategoryReason: `Categoría Google "${categoryName}". VayaPlan no dispone de categoría "restaurante" en venues.category; se propone "general" para evitar forzarlo como bar.`,
    };
  }

  return {
    proposedCategory: 'general',
    proposedCategoryReason: `Categoría Google "${categoryName || 'sin categoría'}" sin mapeo directo; se asigna a "general".`,
  };
}

export function heuristicZone(
  address: string | undefined
): { proposedZone: string | null; proposedZoneReason: string } {
  if (!address) {
    return { proposedZone: null, proposedZoneReason: 'Sin dirección disponible para determinar zona.' };
  }

  const addr = address.toLowerCase();

  if (addr.includes('pl. mayor') || addr.includes('plaza mayor')) {
    return {
      proposedZone: 'centro_puebla',
      proposedZoneReason: 'Plaza Mayor de Palencia, adyacente a la zona Centro/La Puebla.',
    };
  }

  if (
    addr.includes('mayor principal') ||
    addr.includes('don sancho') ||
    addr.includes('soldados') ||
    addr.includes('la puebla') ||
    addr.includes('alfonso viii')
  ) {
    return {
      proposedZone: 'centro_puebla',
      proposedZoneReason: 'Eje Centro / La Puebla.',
    };
  }

  if (
    addr.includes('mayor antigua') ||
    addr.includes('san marcos') ||
    addr.includes('dominicos') ||
    addr.includes('seminario')
  ) {
    return {
      proposedZone: 'seminario',
      proposedZoneReason: 'Sector Mayor Antigua / Dominicos próximo a zona Seminario.',
    };
  }

  if (addr.includes('salón') || addr.includes('salon')) {
    return {
      proposedZone: 'salon',
      proposedZoneReason: 'Paseo del Salón de Isabel II.',
    };
  }

  return {
    proposedZone: 'otros',
    proposedZoneReason: 'Dirección fuera de los tres sectores históricos principales de VayaPlan.',
  };
}
