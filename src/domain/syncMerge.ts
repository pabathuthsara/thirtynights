import type { Night } from '@/types';

/**
 * Merge a hydrated server night without sacrificing a recording that has
 * already been durably sealed on this device but has not reached the server.
 *
 * Once the server has `recordedAt`, its immutable seal metadata is canonical.
 * Until then, the local seal must win or a transient RPC/network failure makes
 * the earned stamp disappear on the very next hydration.
 */
export function mergeHydratedNight(remote: Night, local?: Night): Night {
  if (!local?.recordedAt) return remote;

  if (!remote.recordedAt) {
    return {
      ...remote,
      ...local,
      storagePath: remote.storagePath ?? local.storagePath,
      backedUp: Boolean(remote.storagePath) || local.backedUp,
      backupState: remote.storagePath ? 'backed-up' : local.backupState,
      revealAt: remote.revealAt ?? local.revealAt,
    };
  }

  return {
    ...remote,
    localUri: local.localUri,
    checksum: remote.checksum ?? local.checksum,
    byteSize: remote.byteSize ?? local.byteSize,
    backedUp: Boolean(remote.storagePath) || local.backedUp,
    backupState: remote.storagePath ? 'backed-up' : local.backupState,
  };
}
