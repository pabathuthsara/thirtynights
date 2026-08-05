import type { AppSnapshot, Chapter, Night } from '@/types';

const DAY_MS = 86_400_000;

export function localDateKey(value: Date = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(dateKey: string, days: number) {
  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  const value = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return localDateKey(value);
}

export function timezoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function accessThroughForTier(tier: AppSnapshot['accessTier']) {
  return tier === 'paid90' ? 90 : tier === 'paid30' ? 30 : 7;
}

export function reconcileChapter(chapter: Chapter, now = new Date()): Chapter {
  const today = localDateKey(now);
  let opened = false;
  const nights = chapter.nights.map((night): Night => {
    if (night.recordedAt || night.status === 'sealed' || night.status === 'revealed') return night;
    if (night.index > chapter.accessThrough) return { ...night, status: 'future' };
    if (night.expectedLocalDate < today) return { ...night, status: 'missed' };
    if (night.expectedLocalDate > today) return { ...night, status: 'future' };
    if (night.expectedLocalDate === today && !opened) {
      opened = true;
      return { ...night, status: 'today' };
    }
    return { ...night, status: 'future' };
  });
  const terminal = nights.slice(0, chapter.targetLength).every((night) => night.status === 'sealed' || night.status === 'revealed' || night.status === 'missed');
  return { ...chapter, nights, completedAt: terminal ? chapter.completedAt ?? now.toISOString() : chapter.completedAt };
}

export function reconcileSnapshot(snapshot: AppSnapshot, now = new Date()): AppSnapshot {
  const currentTimezone = timezoneName();
  return {
    ...snapshot,
    timezone: currentTimezone,
    currentChapter: reconcileChapter(snapshot.currentChapter, now),
  };
}

export function daysInYear(year: number) {
  return Math.round((new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / DAY_MS);
}

export function dayOfYear(value: Date) {
  const start = new Date(value.getFullYear(), 0, 1, 12);
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  return Math.round((date.getTime() - start.getTime()) / DAY_MS);
}
