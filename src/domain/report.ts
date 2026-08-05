import type { Report, ReportEvidence, ReportSection } from '@/types';

export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<Report>;
  return Boolean(
    typeof report.id === 'string' &&
    typeof report.chapterId === 'string' &&
    [7, 30, 60, 90].includes(report.checkpointNight ?? 0) &&
    ['queued', 'running', 'ready', 'failed'].includes(report.status ?? '') &&
    Array.isArray(report.sections) &&
    report.sections.every(isReportSection),
  );
}

function isReportSection(value: unknown): value is ReportSection {
  if (!value || typeof value !== 'object') return false;
  const section = value as Partial<ReportSection>;
  return typeof section.title === 'string' && typeof section.body === 'string' && Array.isArray(section.evidence) && section.evidence.every(isEvidence);
}

function isEvidence(value: unknown): value is ReportEvidence {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as Partial<ReportEvidence>;
  return typeof evidence.nightId === 'string' && typeof evidence.segmentId === 'string' && Number.isFinite(evidence.startMs) && Number.isFinite(evidence.endMs) && (evidence.endMs ?? 0) > (evidence.startMs ?? 0);
}

export function checkpointsForLength(length: 7 | 30 | 90) {
  return length === 90 ? [7, 30, 60, 90] as const : length === 30 ? [7, 30] as const : [7] as const;
}
