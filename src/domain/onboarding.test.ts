import { describe, expect, it } from 'vitest';

import { localDateKey } from '@/domain/calendar';
import { intentions, intentionsById, plannedChapter } from '@/domain/onboarding';

describe('plannedChapter', () => {
  it('counts the first night as night one, not night zero', () => {
    // Seven nights starting today ends on the sixth day *after* today. An
    // off-by-one here would promise the plan screen a date the chapter does not
    // actually reach.
    const plan = plannedChapter(7, 30, '2026-08-06');
    expect(localDateKey(plan.freeEndsOn)).toBe('2026-08-12');
    expect(localDateKey(plan.fullEndsOn)).toBe('2026-09-04');
  });

  it('crosses a month boundary without slipping a day', () => {
    const plan = plannedChapter(7, 30, '2026-08-29');
    expect(localDateKey(plan.freeEndsOn)).toBe('2026-09-04');
  });

  it('keeps the dates in local time', () => {
    // Parsed at midday precisely so no timezone west or east of UTC can push
    // the date onto a neighbouring day.
    const plan = plannedChapter(7, 30, '2026-01-01');
    expect(plan.freeEndsOn.getHours()).toBe(12);
    expect(localDateKey(plan.freeEndsOn)).toBe('2026-01-07');
  });
});

describe('intentionsById', () => {
  it('returns the picked intentions in catalogue order', () => {
    const picked = intentionsById(['habit', 'remember']);
    expect(picked.map((intention) => intention.id)).toEqual(['remember', 'habit']);
  });

  it('ignores ids that are not in the catalogue and returns nothing for none', () => {
    expect(intentionsById([])).toEqual([]);
  });

  it('gives every intention a promise for the plan screen to read back', () => {
    for (const intention of intentions) {
      expect(intention.promise.length).toBeGreaterThan(0);
    }
  });
});
