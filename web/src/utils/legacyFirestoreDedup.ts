export interface FirestorePulledDoc<T> {
  docId: string;
  record: T;
}

export interface DedupedPull<T> {
  records: T[];
  /** Physical Firestore doc ids to hard-delete (legacy numeric docs that are redundant). */
  legacyDocIdsToDelete: string[];
  /**
   * cloudIds of content-identical duplicate copies (distinct from the canonical copy).
   * These should be tombstoned in the cloud and removed from the local DB so every
   * device converges on a single copy.
   */
  duplicateCloudIds: string[];
  /**
   * Map of duplicate cloudId to canonical survivor cloudId. Used to reassign local linked rows
   * (like expenses) before the duplicate category is purged.
   */
  remapCloudIds: Record<string, string>;
}

interface InternalDoc<T> {
  docId: string;
  record: T;
  legacy: boolean;
}

export function isLegacyFirestoreDocId(docId: string): boolean {
  return docId.length > 0 && /^\d+$/.test(docId);
}

function isUuidShape(value: string): boolean {
  return value.length >= 32 && value.includes('-');
}

/** Prefer a modern (uuid) doc as the survivor, then the smallest cloudId for determinism. */
function chooseCanonical<T>(group: InternalDoc<T>[], cloudIdOf: (record: T) => string): InternalDoc<T> {
  return [...group].sort((a, b) => {
    if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
    return cloudIdOf(a.record).localeCompare(cloudIdOf(b.record));
  })[0];
}

function dedupeLegacyDocs<T>(
  docs: FirestorePulledDoc<T>[],
  fingerprint: (record: T) => string,
  cloudIdOf: (record: T) => string,
  collapseContentDuplicates: boolean,
  isRecovered: (record: T) => boolean = () => false,
): DedupedPull<T> {
  const internal: InternalDoc<T>[] = docs.map((doc) => ({
    docId: doc.docId,
    record: doc.record,
    legacy: isLegacyFirestoreDocId(doc.docId),
  }));

  const modern = internal.filter((doc) => !doc.legacy);
  const legacy = internal.filter((doc) => doc.legacy);
  const legacyDocIdsToDelete: string[] = [];
  const remapCloudIds: Record<string, string> = {};

  const modernByCloudId = new Map(modern.map((doc) => [cloudIdOf(doc.record), doc]));
  const modernByFingerprint = new Map<string, InternalDoc<T>[]>();
  for (const doc of modern) {
    const key = fingerprint(doc.record);
    const bucket = modernByFingerprint.get(key) ?? [];
    bucket.push(doc);
    modernByFingerprint.set(key, bucket);
  }

  // Phase 1: collapse legacy docs that are the same entity (cloudId pointer) or a
  // content duplicate of a modern doc.
  const keptLegacy: InternalDoc<T>[] = [];
  for (const leg of legacy) {
    const dataCloudId = cloudIdOf(leg.record);

    if (isUuidShape(dataCloudId) && dataCloudId !== leg.docId && modernByCloudId.has(dataCloudId)) {
      legacyDocIdsToDelete.push(leg.docId);
      remapCloudIds[leg.docId] = dataCloudId;
      continue;
    }

    const modernMatch = modernByFingerprint.get(fingerprint(leg.record))?.[0];
    if (modernMatch) {
      legacyDocIdsToDelete.push(leg.docId);
      remapCloudIds[leg.docId] = cloudIdOf(modernMatch.record);
      continue;
    }

    keptLegacy.push(leg);
  }

  const candidates = [...modern, ...keptLegacy];

  if (!collapseContentDuplicates) {
    return {
      records: candidates.map((doc) => doc.record),
      legacyDocIdsToDelete: [...new Set(legacyDocIdsToDelete)],
      duplicateCloudIds: [],
      remapCloudIds,
    };
  }

  // Phase 2: collapse content-identical duplicates among the survivors, keeping a single
  // canonical copy per fingerprint.
  const byFingerprint = new Map<string, InternalDoc<T>[]>();
  for (const doc of candidates) {
    const key = fingerprint(doc.record);
    const bucket = byFingerprint.get(key) ?? [];
    bucket.push(doc);
    byFingerprint.set(key, bucket);
  }

  const records: T[] = [];
  const duplicateCloudIds: string[] = [];
  const canonicalCloudIds = new Set<string>();

  for (const group of byFingerprint.values()) {
    const canonical = group.length === 1 ? group[0] : chooseCanonical(group, cloudIdOf);
    const canonicalCloudId = cloudIdOf(canonical.record);
    records.push(canonical.record);
    canonicalCloudIds.add(canonicalCloudId);

    if (group.length === 1) continue;

    for (const dup of group) {
      if (dup === canonical) continue;
      const dupCloudId = cloudIdOf(dup.record);
      remapCloudIds[dupCloudId] = canonicalCloudId;
      if (dupCloudId === canonicalCloudId) {
        // Same logical record, redundant physical doc.
        legacyDocIdsToDelete.push(dup.docId);
      } else {
        duplicateCloudIds.push(dupCloudId);
        if (dup.docId !== dupCloudId) legacyDocIdsToDelete.push(dup.docId);
      }
    }
  }

  // Phase 3: Special case for "Recovered" categories.
  // If a survivor is "Recovered", try to find a genuine category with same transaction type to merge into.
  const finalSurvivors = [...records];
  const recovered = finalSurvivors.filter(isRecovered);

  for (const rec of recovered) {
    const recCloudId = cloudIdOf(rec);
    const type = fingerprint(rec).split('|')[3] || '';
    // Find a standard category (not named "Recovered") with same transaction type
    const standardTarget = finalSurvivors.find((it) =>
      !isRecovered(it) && fingerprint(it).split('|')[3] === type
    );

    if (standardTarget) {
      const targetCloudId = cloudIdOf(standardTarget);
      duplicateCloudIds.push(recCloudId);
      remapCloudIds[recCloudId] = targetCloudId;
      const idx = finalSurvivors.indexOf(rec);
      if (idx > -1) finalSurvivors.splice(idx, 1);
    }
  }

  return {
    records: finalSurvivors,
    legacyDocIdsToDelete: [...new Set(legacyDocIdsToDelete)],
    duplicateCloudIds: [...new Set(duplicateCloudIds)].filter((cloudId) => !canonicalCloudIds.has(cloudId)),
    remapCloudIds,
  };
}

export function dedupeLegacyCategoryDocs<T extends {
  cloudId: string;
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: string;
  sortOrder: number;
}>(docs: FirestorePulledDoc<T>[]): DedupedPull<T> {
  return dedupeLegacyDocs(
    docs,
    (record) => `${record.name}|${record.iconName}|${record.colorInt}|${record.transactionType}|${record.sortOrder}`,
    (record) => record.cloudId,
    true,
    (record) => record.name === 'Recovered',
  );
}

export function dedupeLegacyExpenseDocs<T extends {
  cloudId: string;
  amount: number;
  dateMillis: number;
  note: string;
  transactionType: string;
  receiptImagePath?: string | null;
}>(docs: FirestorePulledDoc<T>[]): DedupedPull<T> {
  return dedupeLegacyDocs(
    docs,
    (record) =>
      `${record.amount}|${record.dateMillis}|${record.note}|${record.transactionType}|${record.receiptImagePath ?? ''}`,
    (record) => record.cloudId,
    true,
  );
}
