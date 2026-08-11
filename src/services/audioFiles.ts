import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;

export type SealRecoveryMetadata = {
  operationId: string;
  durationSec: number;
  recordedAt: string;
  recordedHour: number;
  sourceUri: string;
};

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function recordingDirectory(chapterId: string) {
  const root = new Directory(Paths.document, 'recordings');
  if (!root.exists) root.create({ idempotent: true, intermediates: true });
  const chapterDirectory = new Directory(root, chapterId);
  if (!chapterDirectory.exists) chapterDirectory.create({ idempotent: true, intermediates: true });
  return chapterDirectory;
}

export function durableRecordingFile(chapterId: string, nightId: string) {
  return new File(recordingDirectory(chapterId), `${nightId}.m4a`);
}

export function sealMarkerFile(chapterId: string, nightId: string) {
  return new File(recordingDirectory(chapterId), `${nightId}.seal.json`);
}

export async function persistRecording(params: { chapterId: string; nightId: string; temporaryUri?: string; recovery?: SealRecoveryMetadata }) {
  if (!params.temporaryUri) throw new Error('The recorder did not return a file. Tonight remains open.');
  if (Platform.OS === 'web') {
    const response = await fetch(params.temporaryUri);
    if (!response.ok) throw new Error('The browser recording could not be read. Tonight remains open.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength <= 0) throw new Error('The browser recording is empty. Tonight remains open.');
    if (bytes.byteLength > MAX_RECORDING_BYTES) throw new Error('That recording is larger than the safe upload limit. Tonight remains open.');
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return { uri: params.temporaryUri, byteSize: bytes.byteLength, checksum: hex(digest) };
  }

  const destination = durableRecordingFile(params.chapterId, params.nightId);
  const marker = sealMarkerFile(params.chapterId, params.nightId);
  if (destination.exists && destination.size > 0) {
    const recoveredDigest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await destination.bytes());
    const recovered = { uri: destination.uri, byteSize: destination.size, checksum: hex(recoveredDigest) };
    if (params.recovery) marker.write(JSON.stringify({ ...params.recovery, ...recovered }));
    return recovered;
  }

  const source = new File(params.temporaryUri);
  if (!source.exists || source.size <= 0) throw new Error('The recording file could not be verified. Tonight remains open.');
  if (source.size > MAX_RECORDING_BYTES) throw new Error('That recording is larger than the safe upload limit. Tonight remains open.');
  if (params.recovery) marker.write(JSON.stringify(params.recovery));

  await source.move(destination);
  if (!destination.exists || destination.size <= 0) throw new Error('The recording could not be moved into durable storage.');
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await destination.bytes());
  const persisted = { uri: destination.uri, byteSize: destination.size, checksum: hex(digest) };
  if (params.recovery) marker.write(JSON.stringify({ ...params.recovery, ...persisted }));
  return persisted;
}

export function completeSealJournal(chapterId: string, nightId: string) {
  if (Platform.OS === 'web') return;
  const marker = sealMarkerFile(chapterId, nightId);
  if (marker.exists) marker.delete();
}

export function deleteAllRecordings() {
  if (Platform.OS === 'web') return;
  const directory = new Directory(Paths.document, 'recordings');
  if (directory.exists) directory.delete();
}

/** Delete only one explicitly selected chapter's local audio. */
export function deleteChapterRecordings(chapterId: string) {
  if (Platform.OS === 'web') return;
  // Chapter identifiers originate from our snapshot/server, but keep the
  // filesystem target single-segment even if a corrupt preview reaches here.
  if (!/^[a-zA-Z0-9-]+$/.test(chapterId)) throw new Error('The preview recording folder could not be verified.');
  const directory = new Directory(Paths.document, 'recordings', chapterId);
  if (directory.exists) directory.delete();
}

export function recordingFile(uri?: string) {
  if (!uri || Platform.OS === 'web') return null;
  const file = new File(uri);
  return file.exists ? file : null;
}
