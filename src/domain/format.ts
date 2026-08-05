let cachedLocale: string | undefined;

/**
 * The device locale, resolved once. Everything user-facing formats through
 * here — the app previously hard-coded `'en'` for month names.
 *
 * Resolved from `Intl` rather than `expo-localization` so the domain layer
 * stays free of native imports and remains testable under Node.
 */
export function deviceLocale() {
  if (cachedLocale) return cachedLocale;
  try {
    cachedLocale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    cachedLocale = 'en';
  }
  return cachedLocale;
}

export function formatMonth(date: Date) {
  return new Intl.DateTimeFormat(deviceLocale(), { month: 'long' }).format(date);
}

export function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat(deviceLocale(), { month: 'long', year: 'numeric' }).format(date);
}

export function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(deviceLocale(), { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

export function formatClock(hour: number, minute: number) {
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(deviceLocale(), { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (!minutes) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

/** Human copy for report job states — the UI used to print the raw enum. */
export function reportStatusLabel(status: 'queued' | 'running' | 'ready' | 'failed') {
  switch (status) {
    case 'ready': return 'Ready to open';
    case 'running': return 'Being written';
    case 'failed': return 'Needs attention';
    default: return 'In the queue';
  }
}
