export type CandidateClassification =
  | 'POSIBLE_ALTA'
  | 'YA_EXISTENTE'
  | 'REVISAR_COINCIDENCIA'
  | 'FUERA_DE_AMBITO'
  | 'DATOS_INSUFICIENTES'
  | 'PENDIENTE_COMPARACION';

export interface RawScraperItem {
  query?: string;
  searchString?: string;
  rank?: number;
  position?: number;
  title?: string;
  categoryName?: string;
  type?: string;
  categories?: string[];
  types?: string[];
  address?: string;
  neighborhood?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  city?: string | null;
  postalCode?: string | null;
  state?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  phoneUnformatted?: string | null;
  website?: string | null;
  domain?: string | null;
  placeId?: string | null;
  dataId?: string | null;
  cid?: string | null;
  googleMapsUrl?: string | null;
  url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  openingHours?: Record<string, string> | null;
  openingHoursDetailed?: any[] | null;
  openingHoursState?: string | null;
  permanentlyClosed?: boolean | null;
  temporarilyClosed?: boolean | null;
  [key: string]: any;
}

export interface ConflictRecord {
  field: string;
  rowA: number;
  valA: any;
  rowB: number;
  valB: any;
}

export interface NormalizedCandidate {
  candidateId: string;
  placeId: string;
  originRows: number[];
  queries: string[];
  titleOriginal: string;
  cityOriginal: string;
  addressOriginal: string;
  postalCode: string | null;
  categoryOriginal: string;
  typesOriginal: string[];
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  phoneOriginal: string | null;
  phoneUnformatted: string | null;
  websiteOriginal: string | null;
  websiteOwn: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  openingHoursCount: number;
  openingHoursSummary: string;
  proposedName: string;
  proposedSlug: string;
  proposedCategory: string;
  proposedCategoryReason: string;
  proposedZone: string | null;
  proposedZoneReason: string;
  classification: CandidateClassification;
  classificationReason: string;
  matchingInternalId: number | null;
  matchingInternalTable: string | null;
  matchingEvidence: string | null;
  conflicts: ConflictRecord[];
  pendingDecisions: string[];
  approved: boolean;
  isActive: boolean;
}

export interface ImportManifest {
  manifestVersion: string;
  batchUuid: string;
  citySlug: string;
  sourceFile: string;
  sourceFileHash: string;
  generatedAt: string;
  totalRawRecords: number;
  totalConsolidatedCandidates: number;
  repeatedRowsAbsorbed: number;
  summaryByClassification: Record<CandidateClassification, number>;
  candidates: NormalizedCandidate[];
}

export interface ApplyResult {
  batchUuid: string;
  citySlug: string;
  cityId: number;
  dryRun: boolean;
  totalInManifest: number;
  approvedCount: number;
  appliedCount: number;
  createdVenueIds: number[];
  warnings: string[];
  errors: string[];
}

export interface RollbackResult {
  batchUuid: string;
  dryRun: boolean;
  status: 'ROLLED_BACK' | 'BLOCKED' | 'NOT_FOUND';
  deletedVenueIds: number[];
  deletedExternalIds: number[];
  blockingReasons: string[];
  message: string;
}
