export function recordTimestamp(updatedAt?: number, fallback = 0): number {
  return updatedAt && updatedAt > 0 ? updatedAt : fallback;
}

export interface MergeableRecord {
  cloudId: string;
  id?: number;
  updatedAt?: number;
  deleted?: boolean;
  pendingSync?: boolean;
}

export function mergeById<T extends MergeableRecord>(
  localItems: T[],
  remoteItems: T[],
  options?: { isIncremental?: boolean; ignoreRemoteDeletes?: boolean; pendingDeleteCloudIds?: Set<string> },
): { toApplyLocal: T[]; toPushRemote: T[]; toDeleteLocal: number[] } {
  const isIncremental = options?.isIncremental ?? false;
  const ignoreRemoteDeletes = options?.ignoreRemoteDeletes ?? false;
  const pendingDeleteCloudIds = options?.pendingDeleteCloudIds ?? new Set<string>();
  const localMap = new Map(localItems.map((item) => [item.cloudId, item]));
  const remoteMap = new Map(remoteItems.map((item) => [item.cloudId, item]));
  const allCloudIds = new Set(
    isIncremental
      ? [
          ...remoteMap.keys(),
          ...localItems.filter((item) => item.pendingSync).map((item) => item.cloudId),
        ]
      : [...localMap.keys(), ...remoteMap.keys()],
  );

  const toApplyLocal: T[] = [];
  const toPushRemote: T[] = [];
  const toDeleteLocal: number[] = [];

  for (const cloudId of allCloudIds) {
    const local = localMap.get(cloudId);
    const remote = remoteMap.get(cloudId);

    if (!local && remote) {
      if (!remote.deleted && !pendingDeleteCloudIds.has(cloudId)) toApplyLocal.push(remote);
      continue;
    }

    if (local && !remote) {
      if (!isIncremental || local.pendingSync) toPushRemote.push(local);
      continue;
    }

    if (local && remote) {
      const localAt = recordTimestamp(local.updatedAt);
      const remoteAt = recordTimestamp(remote.updatedAt);

      if (remote.deleted) {
        if (!ignoreRemoteDeletes) {
          if (remoteAt >= localAt && local.id != null) toDeleteLocal.push(local.id);
          else toPushRemote.push(local);
        }
        continue;
      }

      if (remoteAt > localAt) toApplyLocal.push(remote);
      else if (localAt > remoteAt) toPushRemote.push(local);
      else toApplyLocal.push(remote);
    }
  }

  return { toApplyLocal, toPushRemote, toDeleteLocal };
}

export function mergePreferences<T extends { updatedAt: number }>(local: T, remote: T | null): T {
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}
