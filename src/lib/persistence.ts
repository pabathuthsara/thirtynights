import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppSnapshot } from '@/types';

const SNAPSHOT_KEY = 'thirtynights.snapshot.v1';

export async function loadSnapshot() {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as AppSnapshot;
}

export async function saveSnapshot(snapshot: AppSnapshot) {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function clearSnapshot() {
  await AsyncStorage.removeItem(SNAPSHOT_KEY);
}
