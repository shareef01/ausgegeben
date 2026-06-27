export function recordTimestamp(updatedAt?: number, fallback = 0): number {
  return updatedAt ?? fallback;
}

export function mergeById<T extends { id?: number; updatedAt?: number; deleted?: boolean }>(
  localItems: T[],
  remoteItems: T[],
): { toApplyLocal: T[]; toPushRemote: T[]; toDeleteLocal: number[] } {
  const localMap = new Map(localItems.filter((i) => i.id != null).map((i) => [i.id!, i]));
  const remoteMap = new Map(remoteItems.filter((i) => i.id != null).map((i) => [i.id!, i]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const toApplyLocal: T[] = [];
  const toPushRemote: T[] = [];
  const toDeleteLocal: number[] = [];

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (!local && remote) {
      if (!remote.deleted) toApplyLocal.push(remote);
      continue;
    }

    if (local && !remote) {
      toPushRemote.push(local);
      continue;
    }

    if (local && remote) {
      const localAt = recordTimestamp(local.updatedAt);
      const remoteAt = recordTimestamp(remote.updatedAt);

      if (remote.deleted) {
        if (remoteAt >= localAt) toDeleteLocal.push(id);
        else toPushRemote.push(local);
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
