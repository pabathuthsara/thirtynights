/**
 * The moon outside the window.
 *
 * A conventional synodic approximation from a known new moon — accurate to
 * well under a day, which is all a decorative crescent needs. Kept free of any
 * React Native import so it stays testable as plain domain logic.
 */

const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.530588853;

/** Position through the synodic month, 0…1 (0 and 1 new, 0.5 full). */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  const phase = (days % SYNODIC_DAYS) / SYNODIC_DAYS;
  return phase < 0 ? phase + 1 : phase;
}

/** How lit the disc appears, 0 (new) … 1 (full). */
export function moonIllumination(date = new Date()) {
  return (1 - Math.cos(2 * Math.PI * moonPhase(date))) / 2;
}
