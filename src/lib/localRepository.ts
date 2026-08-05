import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { reconcileSnapshot } from '@/domain/calendar';
import { defaultSnapshot, normalizeSnapshot } from '@/lib/snapshot';
import { completeSealJournal, durableRecordingFile, persistRecording, recordingFile, sealMarkerFile, type SealRecoveryMetadata } from '@/services/audioFiles';
import type { AppSnapshot, Chapter, Night, Report } from '@/types';

const LEGACY_KEY = 'thirtynights.snapshot.v1';
const WEB_KEY = 'thirtynights.snapshot.v2';
const DATABASE = 'thirtynights.db';
let database: Promise<SQLiteDatabase> | null = null;

type ChapterRow = {
  id: string;
  target_length: number;
  access_through: number;
  question_set: Chapter['questionSet'];
  started_at: string;
  timezone: string;
  status: string;
  server_revision: number;
  purchase_status: Chapter['purchaseStatus'] | null;
  completed_at: string | null;
  is_current: number;
};

type NightRow = {
  payload: string;
};

type ReportRow = { payload: string };

async function db() {
  if (!database) database = openDatabaseAsync(DATABASE);
  const instance = await database;
  await instance.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY, migration_applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY, target_length INTEGER NOT NULL, access_through INTEGER NOT NULL,
      question_set TEXT NOT NULL, started_at TEXT NOT NULL, timezone TEXT NOT NULL,
      status TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0,
      purchase_status TEXT, completed_at TEXT, is_current INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nights (
      id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      night_index INTEGER NOT NULL, expected_local_date TEXT NOT NULL, question_id TEXT NOT NULL,
      question_version TEXT NOT NULL, state TEXT NOT NULL, recorded_at TEXT, duration_sec INTEGER,
      recorded_hour INTEGER, local_uri TEXT, storage_path TEXT, reveal_at TEXT, payload TEXT NOT NULL,
      UNIQUE(chapter_id, night_index), UNIQUE(chapter_id, expected_local_date)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      checkpoint INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL,
      UNIQUE(chapter_id, checkpoint)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      operation_id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL,
      last_error TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS file_manifest (
      night_id TEXT PRIMARY KEY REFERENCES nights(id) ON DELETE CASCADE, uri TEXT NOT NULL,
      byte_size INTEGER NOT NULL, checksum TEXT NOT NULL, upload_state TEXT NOT NULL,
      upload_session TEXT, verified_at TEXT
    );
    INSERT OR IGNORE INTO schema_meta(version, migration_applied_at) VALUES (2, datetime('now'));
  `);
  return instance;
}

function appPreferences(snapshot: AppSnapshot) {
  const { currentChapter: _current, completedChapters: _completed, reports: _reports, ...preferences } = snapshot;
  return preferences;
}

type PendingOutboxInsert = {
  operationId: string;
  entityId: string;
  payload: string;
  payloadHash: string;
};

async function saveNative(
  snapshot: AppSnapshot,
  existingInstance?: SQLiteDatabase,
  outbox: PendingOutboxInsert | PendingOutboxInsert[] = [],
) {
  const instance = existingInstance ?? await db();
  await instance.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('INSERT OR REPLACE INTO preferences(key, value) VALUES (?, ?)', 'app', JSON.stringify(appPreferences(snapshot)));
    await transaction.runAsync('DELETE FROM reports');
    await transaction.runAsync('DELETE FROM nights');
    await transaction.runAsync('DELETE FROM chapters');

    const chapters = [snapshot.currentChapter, ...snapshot.completedChapters];
    for (const chapter of chapters) {
      await transaction.runAsync(
        `INSERT INTO chapters(id, target_length, access_through, question_set, started_at, timezone, status, server_revision, purchase_status, completed_at, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        chapter.id, chapter.targetLength, chapter.accessThrough, chapter.questionSet, chapter.startedAt,
        chapter.timezone, chapter.completedAt ? 'completed' : 'active', chapter.serverRevision,
        chapter.purchaseStatus ?? null, chapter.completedAt ?? null, chapter.id === snapshot.currentChapter.id ? 1 : 0,
      );
      for (const night of chapter.nights) {
        await transaction.runAsync(
          `INSERT INTO nights(id, chapter_id, night_index, expected_local_date, question_id, question_version, state, recorded_at, duration_sec, recorded_hour, local_uri, storage_path, reveal_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          night.id, chapter.id, night.index, night.expectedLocalDate, night.questionId, night.questionVersion,
          night.status, night.recordedAt ?? null, night.durationSec ?? null, night.recordedHour ?? null,
          night.localUri ?? null, night.storagePath ?? null, night.revealAt ?? null, JSON.stringify(night),
        );
        if (night.localUri && night.checksum && night.byteSize !== undefined) {
          await transaction.runAsync(
            `INSERT OR REPLACE INTO file_manifest(night_id, uri, byte_size, checksum, upload_state, verified_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            night.id, night.localUri, night.byteSize, night.checksum, night.backupState ?? 'on-device', new Date().toISOString(),
          );
        }
      }
    }
    for (const report of snapshot.reports) {
      await transaction.runAsync(
        'INSERT INTO reports(id, chapter_id, checkpoint, status, payload) VALUES (?, ?, ?, ?, ?)',
        report.id, report.chapterId, report.checkpointNight, report.status, JSON.stringify(report),
      );
    }
    const operations = Array.isArray(outbox) ? outbox : [outbox];
    for (const operation of operations) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO outbox(operation_id, entity, entity_id, operation, payload, payload_hash, next_attempt_at)
         VALUES (?, 'night', ?, 'seal', ?, ?, ?)`,
        operation.operationId, operation.entityId, operation.payload, operation.payloadHash, new Date().toISOString(),
      );
    }
  });
}

async function loadNative() {
  const instance = await db();
  const preferenceRow = await instance.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', 'app');
  const chapterRows = await instance.getAllAsync<ChapterRow>('SELECT * FROM chapters ORDER BY is_current DESC, started_at DESC');
  if (!preferenceRow || !chapterRows.length) return null;

  const chapters: Chapter[] = [];
  for (const row of chapterRows) {
    const nightRows = await instance.getAllAsync<NightRow>('SELECT payload FROM nights WHERE chapter_id = ? ORDER BY night_index', row.id);
    chapters.push({
      id: row.id,
      length: row.target_length as Chapter['length'],
      targetLength: row.target_length as Chapter['targetLength'],
      accessThrough: row.access_through,
      questionSet: row.question_set,
      startedAt: row.started_at,
      timezone: row.timezone,
      serverRevision: row.server_revision,
      purchaseStatus: row.purchase_status ?? undefined,
      completedAt: row.completed_at ?? undefined,
      nights: nightRows.map((night) => JSON.parse(night.payload) as Night),
    });
  }
  const reportRows = await instance.getAllAsync<ReportRow>('SELECT payload FROM reports');
  const preferences = JSON.parse(preferenceRow.value) as Omit<AppSnapshot, 'currentChapter' | 'completedChapters' | 'reports'>;
  return normalizeSnapshot({
    ...preferences,
    currentChapter: chapters[0],
    completedChapters: chapters.slice(1),
    reports: reportRows.map((report) => JSON.parse(report.payload) as Report),
  });
}

function sealPayload(chapter: Chapter, sealed: Night) {
  return JSON.stringify({
    chapterId: chapter.id,
    nightId: sealed.id,
    index: sealed.index,
    expectedLocalDate: sealed.expectedLocalDate,
    timezone: sealed.timezone,
    questionId: sealed.questionId,
    questionVersion: sealed.questionVersion,
    recordedAt: sealed.recordedAt,
    recordedHour: sealed.recordedHour,
    durationSec: sealed.durationSec,
    checksum: sealed.checksum,
    byteSize: sealed.byteSize,
  });
}

async function recoverPendingSeal(snapshot: AppSnapshot) {
  let recovered = snapshot;
  for (const candidate of snapshot.currentChapter.nights) {
    const marker = sealMarkerFile(snapshot.currentChapter.id, candidate.id);
    if (!marker.exists) continue;
    if (candidate.recordedAt) {
      marker.delete();
      continue;
    }
    try {
      const metadata = JSON.parse(await marker.text()) as SealRecoveryMetadata;
      if (!metadata.operationId || !metadata.sourceUri || metadata.durationSec < 1 || metadata.durationSec > 300) continue;
      const file = await persistRecording({ chapterId: snapshot.currentChapter.id, nightId: candidate.id, temporaryUri: metadata.sourceUri, recovery: metadata });
      const sealed: Night = {
        ...candidate,
        status: 'sealed',
        durationSec: metadata.durationSec,
        recordedAt: metadata.recordedAt,
        recordedHour: metadata.recordedHour,
        localUri: file.uri,
        checksum: file.checksum,
        byteSize: file.byteSize,
        backedUp: false,
        backupState: snapshot.authState === 'authenticated' ? 'waiting-wifi' : 'waiting-account',
      };
      recovered = reconcileSnapshot({
        ...recovered,
        currentChapter: {
          ...recovered.currentChapter,
          nights: recovered.currentChapter.nights.map((night) => night.id === sealed.id ? sealed : night),
        },
      });
      const payload = sealPayload(recovered.currentChapter, sealed);
      const payloadHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
      await saveNative(recovered, await db(), { operationId: metadata.operationId, entityId: sealed.id, payload, payloadHash });
      completeSealJournal(recovered.currentChapter.id, sealed.id);
    } catch {
      // Preserve both journal and bytes for a future recovery/support pass.
    }
  }
  return recovered;
}

function auditLocalFiles(snapshot: AppSnapshot) {
  let changed = false;
  const auditChapter = (chapter: Chapter): Chapter => ({
    ...chapter,
    nights: chapter.nights.map((night) => {
      if (!night.recordedAt) return night;
      const declared = recordingFile(night.localUri);
      if (declared) return night;
      const deterministic = durableRecordingFile(chapter.id, night.id);
      if (deterministic.exists && deterministic.size > 0) {
        changed = true;
        return { ...night, localUri: deterministic.uri };
      }
      if (night.localUri) {
        changed = true;
        return { ...night, localUri: undefined, backupState: night.storagePath ? 'backed-up' : 'attention' };
      }
      return night;
    }),
  });
  const audited = { ...snapshot, currentChapter: auditChapter(snapshot.currentChapter), completedChapters: snapshot.completedChapters.map(auditChapter) };
  return changed ? audited : snapshot;
}

async function migrateLegacyRecordings(snapshot: AppSnapshot) {
  const outbox: PendingOutboxInsert[] = [];
  const migrateChapter = async (chapter: Chapter, enqueue: boolean): Promise<Chapter> => {
    const nights: Night[] = [];
    for (const night of chapter.nights) {
      if (!night.recordedAt || !night.localUri) {
        nights.push(night);
        continue;
      }
      try {
        const file = await persistRecording({
          chapterId: chapter.id,
          nightId: night.id,
          temporaryUri: night.localUri,
        });
        const migrated: Night = {
          ...night,
          localUri: file.uri,
          checksum: file.checksum,
          byteSize: file.byteSize,
          backedUp: Boolean(night.storagePath),
          backupState: night.storagePath
            ? 'backed-up'
            : snapshot.authState === 'authenticated' ? 'waiting-wifi' : 'waiting-account',
        };
        nights.push(migrated);
        if (enqueue && !night.storagePath) {
          const payload = sealPayload(chapter, migrated);
          outbox.push({
            operationId: Crypto.randomUUID(),
            entityId: migrated.id,
            payload,
            payloadHash: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload),
          });
        }
      } catch {
        nights.push({
          ...night,
          localUri: undefined,
          backedUp: Boolean(night.storagePath),
          backupState: night.storagePath ? 'backed-up' : 'attention',
        });
      }
    }
    return { ...chapter, nights };
  };

  const currentChapter = await migrateChapter(snapshot.currentChapter, true);
  const completedChapters: Chapter[] = [];
  for (const chapter of snapshot.completedChapters) completedChapters.push(await migrateChapter(chapter, false));
  return { snapshot: { ...snapshot, currentChapter, completedChapters }, outbox };
}

export async function initializeLocalState() {
  const stored = Platform.OS === 'web'
    ? normalizeSnapshot(JSON.parse((await AsyncStorage.getItem(WEB_KEY)) ?? 'null'))
    : await loadNative();
  if (stored) return reconcileSnapshot(auditLocalFiles(await recoverPendingSeal(stored)));

  const legacyRaw = await AsyncStorage.getItem(LEGACY_KEY);
  const legacy = legacyRaw ? normalizeSnapshot(JSON.parse(legacyRaw)) : null;
  const initial = reconcileSnapshot(legacy ?? defaultSnapshot());
  if (legacy && Platform.OS !== 'web') {
    const migrated = await migrateLegacyRecordings(initial);
    await saveNative(migrated.snapshot, undefined, migrated.outbox);
    await AsyncStorage.setItem(`${LEGACY_KEY}.imported`, new Date().toISOString());
    return reconcileSnapshot(auditLocalFiles(migrated.snapshot));
  }
  await saveLocalState(initial);
  return initial;
}

export async function saveLocalState(snapshot: AppSnapshot) {
  if (Platform.OS === 'web') await AsyncStorage.setItem(WEB_KEY, JSON.stringify(snapshot));
  else await saveNative(snapshot);
}

export async function sealNightLocally(snapshot: AppSnapshot, params: { durationSec: number; temporaryUri?: string }) {
  const chapter = snapshot.currentChapter;
  const activeNight = chapter.nights.find((night) => night.status === 'today');
  if (!activeNight) throw new Error('Tonight is no longer open.');
  if (params.durationSec < 1 || params.durationSec > 300) throw new Error('Recording duration is outside the supported range.');
  const recordedAt = new Date();
  const operationId = Crypto.randomUUID();
  const recovery: SealRecoveryMetadata = {
    operationId,
    durationSec: params.durationSec,
    recordedAt: recordedAt.toISOString(),
    recordedHour: recordedAt.getHours(),
    sourceUri: params.temporaryUri ?? '',
  };
  const file = await persistRecording({ chapterId: chapter.id, nightId: activeNight.id, temporaryUri: params.temporaryUri, recovery });
  const sealed: Night = {
    ...activeNight,
    status: 'sealed',
    durationSec: params.durationSec,
    localUri: file.uri,
    recordedAt: recordedAt.toISOString(),
    recordedHour: recordedAt.getHours(),
    checksum: file.checksum,
    byteSize: file.byteSize,
    backedUp: false,
    backupState: snapshot.authState === 'authenticated' ? 'waiting-wifi' : 'waiting-account',
  };
  const completed = chapter.nights.filter((night) => night.recordedAt).length + 1;
  const next: AppSnapshot = reconcileSnapshot({
    ...snapshot,
    currentChapter: {
      ...chapter,
      completedAt: completed === chapter.targetLength ? recordedAt.toISOString() : undefined,
      nights: chapter.nights.map((night) => night.id === sealed.id ? sealed : night),
    },
    seenBackupPrompt: snapshot.seenBackupPrompt || completed >= 3,
  });

  if (Platform.OS === 'web') {
    await saveLocalState(next);
  } else {
    const instance = await db();
    const payload = sealPayload(chapter, sealed);
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
    await saveNative(next, instance, { operationId, entityId: sealed.id, payload, payloadHash: hash });
    completeSealJournal(chapter.id, sealed.id);
  }
  return next;
}

export async function pendingOutboxOperations() {
  if (Platform.OS === 'web') return [];
  const instance = await db();
  return instance.getAllAsync<{ operation_id: string; entity_id: string; operation: string; payload: string; attempts: number }>(
    `SELECT operation_id, entity_id, operation, payload, attempts FROM outbox
     WHERE completed_at IS NULL AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 10`,
    new Date().toISOString(),
  );
}

export async function completeOutboxOperation(operationId: string) {
  if (Platform.OS === 'web') return;
  const instance = await db();
  await instance.runAsync('UPDATE outbox SET completed_at = ?, last_error = NULL WHERE operation_id = ?', new Date().toISOString(), operationId);
}

export async function failOutboxOperation(operationId: string, attempts: number, error: string) {
  if (Platform.OS === 'web') return;
  const instance = await db();
  const delay = Math.min(3600, 2 ** Math.min(attempts + 1, 10) * 5) * 1000;
  await instance.runAsync(
    'UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE operation_id = ?',
    attempts + 1, new Date(Date.now() + delay + Math.random() * 3000).toISOString(), error.slice(0, 300), operationId,
  );
}

export async function clearLocalState() {
  await AsyncStorage.removeItem(WEB_KEY);
  await AsyncStorage.removeItem(LEGACY_KEY);
  if (Platform.OS !== 'web') {
    const instance = await db();
    await instance.execAsync('DELETE FROM reports; DELETE FROM outbox; DELETE FROM file_manifest; DELETE FROM nights; DELETE FROM chapters; DELETE FROM preferences;');
  }
}
