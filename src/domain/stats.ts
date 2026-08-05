import { dayOfYear, daysInYear, localDateKey } from '@/domain/calendar';
import { formatMonthYear } from '@/domain/format';
import type { Chapter, Night } from '@/types';

export function isRecorded(night: Night) {
  return night.status === 'sealed' || night.status === 'revealed' || Boolean(night.recordedAt);
}

export function totalVoiceSeconds(nights: Night[]) {
  return nights.reduce((total, night) => total + (isRecorded(night) ? night.durationSec ?? 0 : 0), 0);
}

export function formatVoiceTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function chapterTitle(chapter: Chapter) {
  return formatMonthYear(new Date(chapter.startedAt));
}

export function completionRate(nights: Night[], today = localDateKey()) {
  const eligible = nights.filter((night) => night.expectedLocalDate <= today && night.status !== 'future');
  if (!eligible.length) return 0;
  return Math.round((eligible.filter(isRecorded).length / eligible.length) * 100);
}

function scheduledDateSet(nights: Night[]) {
  return new Set(nights.filter(isRecorded).map((night) => night.expectedLocalDate));
}

export function streaks(nights: Night[], now = new Date()) {
  const dates = scheduledDateSet(nights);
  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let previous: Date | undefined;
  for (const key of sorted) {
    const current = new Date(`${key}T12:00:00`);
    run = previous && Math.round((current.getTime() - previous.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = current;
  }

  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (dates.has(localDateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/**
 * Recorded nights keyed by their local calendar date, so a calendar view can
 * look up a day directly instead of indexing into a flat day-of-year array.
 */
export function recordedDateMap(nights: Night[]) {
  const map = new Map<string, Night>();
  for (const night of nights) {
    if (!night.recordedAt) continue;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: night.timezone || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(night.recordedAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)?.value);
    const date = new Date(part('year'), part('month') - 1, part('day'), 12);
    if (!Number.isNaN(date.getTime())) map.set(localDateKey(date), night);
  }
  return map;
}

export function yearMap(nights: Night[], year: number) {
  const count = daysInYear(year);
  const cells = Array.from({ length: count }, () => null as Night | null);
  for (const night of nights) {
    if (!night.recordedAt) continue;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: night.timezone || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(night.recordedAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)?.value);
    const date = new Date(part('year'), part('month') - 1, part('day'), 12);
    if (date.getFullYear() === year) cells[dayOfYear(date)] = night;
  }
  return cells;
}
