import { addLocalDays, localDateKey } from '@/domain/calendar';

/**
 * What someone came here for, and what the app owes them because of it.
 *
 * Headspace found that people arrive with more than one reason and made the
 * question multi-select; letting people pick more than one goal lifted their
 * free-trial conversion by 10%. The same is true here — "I want to remember
 * this year" and "I want to hear myself think" are not competing answers.
 *
 * Each intention carries a `promise`: the one thing the product actually does
 * about it. That line is what gets read back on the plan screen, so the quiz is
 * never just data collection — the answers visibly unlock something.
 */
import type { IntentionId } from '@/types';

export type { IntentionId };

export type Intention = {
  id: IntentionId;
  label: string;
  aside: string;
  promise: string;
};

export const intentions: readonly Intention[] = [
  {
    id: 'remember',
    label: 'Remember this season',
    aside: 'Before the details go',
    promise: 'Every night you keep becomes a sticker on a sheet you can open again years from now.',
  },
  {
    id: 'hear',
    label: 'Hear myself think',
    aside: 'Out loud, not on paper',
    promise: 'One take, no editing, no playback until it has had time to settle. You get your real voice back, not your edited one.',
  },
  {
    id: 'someone',
    label: 'Leave something behind',
    aside: 'For someone who will want it',
    promise: 'Your recordings stay yours. Export the whole archive — audio and all — whenever you want it.',
  },
  {
    id: 'habit',
    label: 'Keep one honest habit',
    aside: 'Small enough to actually do',
    promise: 'One question, once a night, at the hour you chose. Never a second notification.',
  },
  {
    id: 'unwind',
    label: 'Put the day down',
    aside: 'Somewhere other than my head',
    promise: 'Two minutes at the end of the night, then it is sealed and out of your hands until it means something.',
  },
];

export function intentionsById(ids: readonly IntentionId[]) {
  return intentions.filter((intention) => ids.includes(intention.id));
}

/**
 * The shape of the thing the answers just built.
 *
 * Endel, BitePal and Speak all end their quiz on a screen that states the
 * outcome in dates and numbers rather than thanking you for answering. The
 * numbers here are real: the nights are free, the dates come from the device
 * calendar, and nothing is promised that the product does not do.
 */
export function plannedChapter(freeNights: number, fullLength: number, from = localDateKey()) {
  return {
    freeNights,
    fullLength,
    /** The night the included chapter closes and the first reflection is due. */
    freeEndsOn: new Date(`${addLocalDays(from, freeNights - 1)}T12:00:00`),
    /** Where the full chapter would land, if it is carried on. */
    fullEndsOn: new Date(`${addLocalDays(from, fullLength - 1)}T12:00:00`),
  };
}
