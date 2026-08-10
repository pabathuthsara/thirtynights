export type WorkerJobContract = {
  checkpoint_night: number;
};

export type TranscriptSegment = {
  id: string;
  nightId: string;
  nightIndex: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type ReportEvidence = {
  night_id: string;
  segment_id: string;
  start_ms: number;
  end_ms: number;
  quote?: string;
};

export type ReportResult = {
  report_version: string;
  checkpoint_night: number;
  summary: string;
  sections: Array<{
    title: string;
    body: string;
    guidance: string;
    eyebrow?: string;
    evidence: ReportEvidence[];
  }>;
  clip_plan: ReportEvidence[];
};

/** Segment identifiers are the model's selection; bounds and ownership are
 * database facts. Rehydrate those facts deterministically so harmless number
 * copying mistakes cannot invalidate an otherwise grounded report. */
export function canonicalizeReportReferences(report: ReportResult, segments: TranscriptSegment[]): ReportResult {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const canonicalize = (reference: ReportEvidence, completeQuote: boolean): ReportEvidence => {
    const source = byId.get(reference.segment_id);
    if (!source) return reference;
    return {
      ...reference,
      night_id: source.nightId,
      start_ms: source.startMs,
      end_ms: source.endMs,
      quote: completeQuote ? source.text.trim() : reference.quote,
    };
  };
  return {
    ...report,
    sections: report.sections.map((section) => ({
      ...section,
      evidence: section.evidence.map((reference) => canonicalize(reference, false)),
    })),
    clip_plan: report.clip_plan.map((reference) => canonicalize(reference, true)),
  };
}

function normalizedText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

const fillerWords = new Set(['ah', 'eh', 'erm', 'hmm', 'like', 'uh', 'um', 'yeah']);

/** A report montage should preserve a whole, intelligible thought. Coarse VAD
 * segment timestamps are not accurate enough to cut filler words out of the
 * middle of a phrase without clipping phonemes, so filler-heavy or unfinished
 * segments are excluded from audio selection altogether. */
export function isClipCandidate(segment: TranscriptSegment) {
  const text = segment.text.trim();
  const words = normalizedText(text).match(/[\p{L}\p{N}']+/gu) ?? [];
  const fillers = words.filter((word) => fillerWords.has(word)).length;
  const duration = segment.endMs - segment.startMs;
  if (duration < 1_800 || duration > 15_000 || words.length < 4 || fillers > 0) return false;
  if (/^[a-z]/.test(text) || /\b(?:i mean|you know)\b/i.test(text)) return false;
  if (/\b([\p{L}\p{N}']{3,})(?:\s+(?:and|or))?\s+\1\b/iu.test(text)) return false;
  if (/^(?:ah|eh|erm|hmm|uh|um)\b/i.test(text)) return false;
  if (/(?:\b(?:and|but|because|or|so|to|trying)|[,;:\-])\s*$/i.test(text)) return false;
  return /[.!?]$/.test(text);
}

function assertEvidence(value: ReportEvidence, segments: Map<string, TranscriptSegment>) {
  const source = segments.get(value.segment_id);
  if (
    !source ||
    source.nightId !== value.night_id ||
    !Number.isInteger(value.start_ms) ||
    !Number.isInteger(value.end_ms) ||
    value.start_ms < source.startMs ||
    value.end_ms > source.endMs ||
    value.end_ms <= value.start_ms
  ) {
    throw new Error('report_invalid_citation');
  }

  if (typeof value.quote !== 'string' || !normalizedText(value.quote)) {
    throw new Error('report_missing_quote');
  }
  if (!normalizedText(source.text).includes(normalizedText(value.quote))) {
    throw new Error('report_false_quote');
  }
}

function assertClip(value: ReportEvidence, segments: Map<string, TranscriptSegment>) {
  assertEvidence(value, segments);
  const source = segments.get(value.segment_id)!;
  if (
    value.start_ms !== source.startMs ||
    value.end_ms !== source.endMs ||
    normalizedText(value.quote ?? '') !== normalizedText(source.text) ||
    !isClipCandidate(source)
  ) {
    throw new Error('report_invalid_clip');
  }
}

function containsInternalCitation(value: string) {
  return /\[[^\]]+\]|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(value);
}

export function validateReportContract(
  report: ReportResult,
  job: WorkerJobContract,
  segments: TranscriptSegment[],
  schemaVersion: string,
) {
  if (
    !report ||
    report.report_version !== schemaVersion ||
    report.checkpoint_night !== job.checkpoint_night ||
    typeof report.summary !== 'string' ||
    !Array.isArray(report.sections) ||
    !Array.isArray(report.clip_plan)
  ) {
    throw new Error('report_contract_mismatch');
  }

  const sectionLimit = job.checkpoint_night === 7 ? 2 : 5;
  const clipLimit = job.checkpoint_night === 7 ? 3 : 5;
  if (!report.sections.length || report.sections.length > sectionLimit || report.clip_plan.length > clipLimit) {
    throw new Error('report_contract_mismatch');
  }

  if (containsInternalCitation(report.summary)) throw new Error('report_internal_citation_leak');

  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  if (byId.size !== segments.length) throw new Error('transcript_segment_id_collision');

  for (const section of report.sections) {
    if (
      !section ||
      typeof section.title !== 'string' ||
      typeof section.body !== 'string' ||
      typeof section.guidance !== 'string' ||
      !section.guidance.trim() ||
      !Array.isArray(section.evidence)
    ) {
      throw new Error('report_contract_mismatch');
    }
    if ([section.title, section.body, section.eyebrow ?? '', section.guidance].some(containsInternalCitation)) {
      throw new Error('report_internal_citation_leak');
    }
    for (const evidence of section.evidence) assertEvidence(evidence, byId);
  }
  const citedNights = new Set(report.sections.flatMap((section) => section.evidence.map((evidence) => evidence.night_id)));
  const availableNights = new Set(segments.map((segment) => segment.nightId));
  if (availableNights.size > 1 && citedNights.size < 2) throw new Error('report_missing_cross_night_synthesis');

  const clipIds = new Set<string>();
  let clipDurationMs = 0;
  for (const evidence of report.clip_plan) {
    assertClip(evidence, byId);
    if (clipIds.has(evidence.segment_id)) throw new Error('report_duplicate_clip');
    clipIds.add(evidence.segment_id);
    clipDurationMs += evidence.end_ms - evidence.start_ms;
  }
  if (clipDurationMs > (job.checkpoint_night === 7 ? 30_000 : 50_000)) throw new Error('report_clip_plan_too_long');
}
