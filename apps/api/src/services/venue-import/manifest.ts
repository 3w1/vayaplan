import { createHash, randomUUID } from 'node:crypto';
import type {
  NormalizedCandidate,
  ImportManifest,
  CandidateClassification,
} from './types';

export function generateFileSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function buildManifest(
  sourceFilePath: string,
  sourceFileContent: string | Buffer,
  citySlug: string,
  candidates: NormalizedCandidate[],
  totalRawRecords: number,
  repeatedRowsAbsorbed: number
): ImportManifest {
  const sourceFileHash = generateFileSha256(sourceFileContent);
  const batchUuid = randomUUID();

  const summaryByClassification: Record<CandidateClassification, number> = {
    POSIBLE_ALTA: 0,
    YA_EXISTENTE: 0,
    REVISAR_COINCIDENCIA: 0,
    FUERA_DE_AMBITO: 0,
    DATOS_INSUFICIENTES: 0,
    PENDIENTE_COMPARACION: 0,
  };

  for (const cand of candidates) {
    summaryByClassification[cand.classification] =
      (summaryByClassification[cand.classification] || 0) + 1;
  }

  return {
    manifestVersion: '1.0.0',
    batchUuid,
    citySlug,
    sourceFile: sourceFilePath,
    sourceFileHash,
    generatedAt: new Date().toISOString(),
    totalRawRecords,
    totalConsolidatedCandidates: candidates.length,
    repeatedRowsAbsorbed,
    summaryByClassification,
    candidates,
  };
}

export function manifestToCsv(manifest: ImportManifest): string {
  const headers = [
    'ID',
    'Nombre Propuesto',
    'Slug Propuesto',
    'Categoría',
    'Zona',
    'Clasificación',
    'Razón Clasificación',
    'Coincidencia Interna',
    'Place ID',
    'Filas Origen',
    'Dirección Original',
    'Teléfono',
    'Web Propia',
    'Instagram',
    'Facebook',
    'Aprobado (SI/NO)',
  ];

  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = manifest.candidates.map((c) => [
    c.candidateId,
    c.proposedName,
    c.proposedSlug,
    c.proposedCategory,
    c.proposedZone || 'null',
    c.classification,
    c.classificationReason,
    c.matchingEvidence || '',
    c.placeId,
    c.originRows.join('; '),
    c.addressOriginal,
    c.phoneOriginal || '',
    c.websiteOwn || '',
    c.instagramUrl || '',
    c.facebookUrl || '',
    c.approved ? 'SI' : 'NO',
  ]);

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');
}

export function manifestToMarkdownTable(manifest: ImportManifest): string {
  const header = '| ID | Nombre Propuesto | Slug | Categoría | Zona | Clasificación | Filas | Aprobado |\n|---|---|---|---|---|---|---|---|';
  const rows = manifest.candidates.map(
    (c) =>
      `| ${c.candidateId} | ${c.proposedName} | \`${c.proposedSlug}\` | ${c.proposedCategory} | ${c.proposedZone || 'null'} | **${c.classification}** | ${c.originRows.join(', ')} | ${c.approved ? '✅ SÍ' : '❌ NO'} |`
  );
  return [header, ...rows].join('\n');
}
