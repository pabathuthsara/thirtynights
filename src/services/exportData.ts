import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import { recordingFile } from '@/services/audioFiles';
import { questionFor } from '@/data/questions';
import { signedRecordingUrl } from '@/lib/supabase';
import type { AppSnapshot } from '@/types';

function exportMetadata(snapshot: AppSnapshot) {
  return {
    exportVersion: '1',
    generatedAt: new Date().toISOString(),
    account: { email: snapshot.email, ownerId: snapshot.ownerId, authState: snapshot.authState },
    preferences: {
      reminderHour: snapshot.reminderHour,
      reminderMinute: snapshot.reminderMinute,
      timezone: snapshot.timezone,
      backupNetwork: snapshot.backupNetwork,
    },
    chapters: [snapshot.currentChapter, ...snapshot.completedChapters].map((chapter) => ({
      ...chapter,
      nights: chapter.nights.map(({ localUri: _localUri, ...night }) => ({
        ...night,
        question: questionFor(night.questionId.startsWith('set_b') ? 'set_b' : night.questionId.startsWith('set_c') ? 'set_c' : 'set_a', night.index),
      })),
    })),
    reports: snapshot.reports.map(({ audioUrl: _audioUrl, ...report }) => report),
  };
}

export async function exportEverything(snapshot: AppSnapshot) {
  const metadata = JSON.stringify(exportMetadata(snapshot), null, 2);
  if (Platform.OS === 'web') {
    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(metadata)}`;
    return { uri, partial: true };
  }

  const files: Record<string, Uint8Array> = { 'metadata.json': strToU8(metadata) };
  let partial = false;
  for (const chapter of [snapshot.currentChapter, ...snapshot.completedChapters]) {
    for (const night of chapter.nights) {
      if (!night.recordedAt) continue;
      const source = recordingFile(night.localUri);
      if (source) files[`recordings/${chapter.id}/${night.id}.m4a`] = await source.bytes();
      else if (night.storagePath) {
        try {
          const response = await fetch(await signedRecordingUrl(night.storagePath));
          if (!response.ok) throw new Error('download failed');
          files[`recordings/${chapter.id}/${night.id}.m4a`] = new Uint8Array(await response.arrayBuffer());
        } catch { partial = true; }
      } else partial = true;
    }
  }
  const archive = new File(Paths.cache, `thirty-nights-export-${Date.now()}.zip`);
  archive.write(zipSync(files, { level: 0 }));
  if (!await Sharing.isAvailableAsync()) return { uri: archive.uri, partial };
  await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', dialogTitle: 'Export Thirty Nights data', UTI: 'public.zip-archive' });
  return { uri: archive.uri, partial };
}
