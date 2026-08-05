import { describe, expect, it } from 'vitest';

import { addLocalDays, dayOfYear, daysInYear, reconcileChapter } from '@/domain/calendar';
import { checkpointsForLength, isReport } from '@/domain/report';
import { completionRate, formatVoiceTime, streaks, yearMap } from '@/domain/stats';
import { questionAssignment } from '@/data/questions';
import type { Chapter, Night } from '@/types';

function night(index: number, date: string, status: Night['status'] = 'future'): Night {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, index, expectedLocalDate: date, timezone: 'UTC', questionId: `q${index}`, questionVersion: 'v1', status, visualSeed: index };
}

function chapter(nights: Night[], accessThrough = nights.length): Chapter {
  return { id: '10000000-0000-4000-8000-000000000000', length: 7, targetLength: 7, accessThrough, questionSet: 'set_a', startedAt: '2026-01-01T00:00:00Z', timezone: 'UTC', serverRevision: 0, nights };
}

describe('calendar reconciliation', () => {
  it('marks stale granted dates missed and opens exactly today', () => {
    const result = reconcileChapter(chapter([night(1, '2026-01-01'), night(2, '2026-01-02'), night(3, '2026-01-03')]), new Date('2026-01-02T12:00:00'));
    expect(result.nights.map((item) => item.status)).toEqual(['missed', 'today', 'future']);
  });

  it('does not turn revoked or ungranted past dates into missed nights', () => {
    const result = reconcileChapter(chapter([night(1, '2026-01-01', 'sealed'), night(2, '2026-01-02')], 1), new Date('2026-01-04T12:00:00'));
    expect(result.nights[1]?.status).toBe('future');
  });

  it('adds civil days across a DST boundary', () => expect(addLocalDays('2026-03-07', 2)).toBe('2026-03-09'));
  it('handles leap years and zero-based day indexes', () => { expect(daysInYear(2028)).toBe(366); expect(dayOfYear(new Date(2028, 11, 31, 12))).toBe(365); });
});

describe('selectors and contracts', () => {
  it('assigns stable question sets across 90 nights', () => {
    expect(questionAssignment(1).questionId).toBe('set_a_01');
    expect(questionAssignment(31).questionId).toBe('set_b_01');
    expect(questionAssignment(61).questionId).toBe('set_c_01');
  });

  it('computes eligible completion and streaks without preview constants', () => {
    const items = [
      { ...night(1, '2026-01-01', 'sealed'), recordedAt: '2026-01-01T20:00:00Z', durationSec: 65 },
      { ...night(2, '2026-01-02', 'sealed'), recordedAt: '2026-01-02T20:00:00Z', durationSec: 60 },
      night(3, '2026-01-03', 'missed'),
      night(4, '2026-01-04', 'future'),
    ];
    expect(completionRate(items, '2026-01-04')).toBe(67);
    expect(streaks(items, new Date(2026, 0, 3, 12))).toEqual({ current: 2, longest: 2 });
    expect(formatVoiceTime(3725)).toBe('1h 2m');
  });

  it('places recordings in the year using their stored timezone', () => {
    const item = { ...night(1, '2026-01-01', 'sealed'), timezone: 'Asia/Colombo', recordedAt: '2025-12-31T20:00:00Z' };
    expect(yearMap([item], 2026)[0]?.id).toBe(item.id);
  });

  it('validates report evidence and checkpoint plans', () => {
    expect(checkpointsForLength(90)).toEqual([7, 30, 60, 90]);
    expect(isReport({ id: 'r', chapterId: 'c', checkpointNight: 7, status: 'ready', reportVersion: 'v1', sections: [{ title: 'T', body: 'B', evidence: [{ nightId: 'n', segmentId: 's', startMs: 0, endMs: 100 }] }] })).toBe(true);
    expect(isReport({ id: 'r', chapterId: 'c', checkpointNight: 7, status: 'ready', sections: [{ title: 'T', body: 'B', evidence: [{ nightId: 'n', segmentId: 's', startMs: 100, endMs: 0 }] }] })).toBe(false);
  });
});
